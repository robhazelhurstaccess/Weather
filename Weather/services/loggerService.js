const fs = require('fs').promises;
const path = require('path');
const database = require('../config/database');

class LoggerService {
    constructor() {
        this.logFile = path.join(__dirname, '..', 'logs', 'queries.txt');
        this.isInitialized = false;
    }

    async initialize() {
        try {
            // Ensure logs directory exists
            const logsDir = path.dirname(this.logFile);
            await fs.mkdir(logsDir, { recursive: true });
            
            // Connect to database
            await database.connect();
            
            this.isInitialized = true;
            console.log('Logger service initialized');
        } catch (error) {
            console.error('Failed to initialize logger service:', error);
            throw error;
        }
    }

    async logQuery(apiName, location, queryParams, responseTime, status, responseData = null, errorMessage = null) {
        if (!this.isInitialized) {
            console.warn('Logger service not initialized, skipping log');
            return;
        }

        try {
            // Log to database
            await database.logQuery(apiName, location, queryParams, responseTime, status, responseData, errorMessage);
            
            // Log to text file
            const timestamp = new Date().toISOString();
            const logEntry = this.formatLogEntry({
                timestamp,
                apiName,
                location,
                queryParams,
                responseTime,
                status,
                errorMessage
            });
            
            await fs.appendFile(this.logFile, logEntry + '\n');
            
            // Update API metrics
            await database.updateApiMetrics(apiName, responseTime, status === 'success');
            
        } catch (error) {
            console.error('Error logging query:', error);
        }
    }

    formatLogEntry({ timestamp, apiName, location, queryParams, responseTime, status, errorMessage }) {
        const params = typeof queryParams === 'object' ? JSON.stringify(queryParams) : queryParams || 'none';
        const error = errorMessage ? ` | ERROR: ${errorMessage}` : '';
        
        return `[${timestamp}] ${apiName} | ${location} | ${params} | ${responseTime}ms | ${status.toUpperCase()}${error}`;
    }

    async getQueryLogs(filters = {}) {
        try {
            const { limit = 100, offset = 0, apiName, location, startDate, endDate } = filters;
            
            // Get from database
            const logs = await database.getQueryLogs(limit, offset, apiName, location);
            
            // Filter by date if specified
            let filteredLogs = logs;
            if (startDate || endDate) {
                filteredLogs = logs.filter(log => {
                    const logDate = new Date(log.timestamp);
                    if (startDate && logDate < new Date(startDate)) return false;
                    if (endDate && logDate > new Date(endDate)) return false;
                    return true;
                });
            }
            
            return filteredLogs;
        } catch (error) {
            console.error('Error retrieving query logs:', error);
            throw error;
        }
    }

    async getQueryStats(days = 7) {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            
            const logs = await this.getQueryLogs({
                startDate: startDate.toISOString(),
                limit: 10000
            });
            
            const stats = {
                totalQueries: logs.length,
                successfulQueries: logs.filter(log => log.status === 'success').length,
                failedQueries: logs.filter(log => log.status === 'error').length,
                averageResponseTime: 0,
                apiBreakdown: {},
                locationBreakdown: {},
                dailyBreakdown: {},
                successRate: 0
            };
            
            if (logs.length > 0) {
                // Calculate average response time
                const totalResponseTime = logs.reduce((sum, log) => sum + (log.response_time || 0), 0);
                stats.averageResponseTime = Math.round(totalResponseTime / logs.length);
                
                // Calculate success rate
                stats.successRate = Math.round((stats.successfulQueries / stats.totalQueries) * 100);
                
                // API breakdown
                logs.forEach(log => {
                    if (!stats.apiBreakdown[log.api_name]) {
                        stats.apiBreakdown[log.api_name] = {
                            total: 0,
                            successful: 0,
                            failed: 0,
                            avgResponseTime: 0
                        };
                    }
                    stats.apiBreakdown[log.api_name].total++;
                    if (log.status === 'success') {
                        stats.apiBreakdown[log.api_name].successful++;
                    } else {
                        stats.apiBreakdown[log.api_name].failed++;
                    }
                });
                
                // Calculate average response times for each API
                Object.keys(stats.apiBreakdown).forEach(apiName => {
                    const apiLogs = logs.filter(log => log.api_name === apiName);
                    const totalTime = apiLogs.reduce((sum, log) => sum + (log.response_time || 0), 0);
                    stats.apiBreakdown[apiName].avgResponseTime = Math.round(totalTime / apiLogs.length);
                });
                
                // Location breakdown (top 10)
                const locationCounts = {};
                logs.forEach(log => {
                    locationCounts[log.location] = (locationCounts[log.location] || 0) + 1;
                });
                stats.locationBreakdown = Object.entries(locationCounts)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 10)
                    .reduce((obj, [location, count]) => {
                        obj[location] = count;
                        return obj;
                    }, {});
                
                // Daily breakdown
                logs.forEach(log => {
                    const date = new Date(log.timestamp).toISOString().split('T')[0];
                    if (!stats.dailyBreakdown[date]) {
                        stats.dailyBreakdown[date] = { total: 0, successful: 0, failed: 0 };
                    }
                    stats.dailyBreakdown[date].total++;
                    if (log.status === 'success') {
                        stats.dailyBreakdown[date].successful++;
                    } else {
                        stats.dailyBreakdown[date].failed++;
                    }
                });
            }
            
            return stats;
        } catch (error) {
            console.error('Error calculating query stats:', error);
            throw error;
        }
    }

    async exportLogs(format = 'json', filters = {}) {
        try {
            const logs = await this.getQueryLogs(filters);
            
            if (format === 'csv') {
                return this.exportToCsv(logs);
            } else if (format === 'txt') {
                return this.exportToTxt(logs);
            } else {
                return JSON.stringify(logs, null, 2);
            }
        } catch (error) {
            console.error('Error exporting logs:', error);
            throw error;
        }
    }

    exportToCsv(logs) {
        const headers = ['timestamp', 'api_name', 'location', 'query_params', 'response_time', 'status', 'error_message'];
        const csvRows = [headers.join(',')];
        
        logs.forEach(log => {
            const row = headers.map(header => {
                let value = log[header] || '';
                if (typeof value === 'string' && value.includes(',')) {
                    value = `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            });
            csvRows.push(row.join(','));
        });
        
        return csvRows.join('\n');
    }

    exportToTxt(logs) {
        return logs.map(log => {
            return this.formatLogEntry({
                timestamp: log.timestamp,
                apiName: log.api_name,
                location: log.location,
                queryParams: log.query_params,
                responseTime: log.response_time,
                status: log.status,
                errorMessage: log.error_message
            });
        }).join('\n');
    }

    async getApiMetrics(days = 7) {
        try {
            return await database.getApiMetrics(days);
        } catch (error) {
            console.error('Error retrieving API metrics:', error);
            throw error;
        }
    }

    async cleanupLogs(daysToKeep = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
            
            // Clean up database logs
            await database.db.run(
                'DELETE FROM query_logs WHERE timestamp < ?',
                [cutoffDate.toISOString()]
            );
            
            console.log(`Cleaned up logs older than ${daysToKeep} days`);
        } catch (error) {
            console.error('Error cleaning up logs:', error);
            throw error;
        }
    }

    async rotateLogFile() {
        try {
            const stats = await fs.stat(this.logFile).catch(() => null);
            if (!stats) return;
            
            // Rotate if file is larger than 10MB
            const maxSize = 10 * 1024 * 1024; // 10MB
            if (stats.size > maxSize) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const rotatedFile = this.logFile.replace('.txt', `_${timestamp}.txt`);
                await fs.rename(this.logFile, rotatedFile);
                console.log(`Log file rotated to: ${rotatedFile}`);
            }
        } catch (error) {
            console.error('Error rotating log file:', error);
        }
    }
}

module.exports = new LoggerService();