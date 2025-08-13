class QueryLog {
    constructor(data = {}) {
        this.id = data.id || null;
        this.timestamp = data.timestamp || new Date().toISOString();
        this.apiName = data.apiName || data.api_name || '';
        this.location = data.location || '';
        this.queryParams = data.queryParams || data.query_params || {};
        this.responseTime = data.responseTime || data.response_time || 0;
        this.status = data.status || 'unknown';
        this.responseData = data.responseData || data.response_data || null;
        this.errorMessage = data.errorMessage || data.error_message || null;
    }

    // Convert to database format
    toDatabaseFormat() {
        return {
            timestamp: this.timestamp,
            api_name: this.apiName,
            location: this.location,
            query_params: typeof this.queryParams === 'string' ? this.queryParams : JSON.stringify(this.queryParams),
            response_time: this.responseTime,
            status: this.status,
            response_data: this.responseData ? JSON.stringify(this.responseData) : null,
            error_message: this.errorMessage
        };
    }

    // Convert to API response format
    toApiFormat() {
        return {
            id: this.id,
            timestamp: this.timestamp,
            apiName: this.apiName,
            location: this.location,
            queryParams: typeof this.queryParams === 'string' ? 
                this.tryParseJson(this.queryParams) : this.queryParams,
            responseTime: this.responseTime,
            status: this.status,
            hasResponseData: !!this.responseData,
            errorMessage: this.errorMessage,
            success: this.status === 'success'
        };
    }

    // Convert to log file format
    toLogFormat() {
        const params = typeof this.queryParams === 'object' ? 
            JSON.stringify(this.queryParams) : this.queryParams || 'none';
        const error = this.errorMessage ? ` | ERROR: ${this.errorMessage}` : '';
        
        return `[${this.timestamp}] ${this.apiName} | ${this.location} | ${params} | ${this.responseTime}ms | ${this.status.toUpperCase()}${error}`;
    }

    // Convert to CSV format
    toCsvRow() {
        const escape = (value) => {
            if (value === null || value === undefined) return '';
            const str = String(value);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        return [
            escape(this.timestamp),
            escape(this.apiName),
            escape(this.location),
            escape(typeof this.queryParams === 'object' ? JSON.stringify(this.queryParams) : this.queryParams),
            escape(this.responseTime),
            escape(this.status),
            escape(this.errorMessage)
        ].join(',');
    }

    // Validation methods
    isValid() {
        return this.apiName && 
               this.location && 
               this.timestamp && 
               typeof this.responseTime === 'number' &&
               this.status;
    }

    isSuccess() {
        return this.status === 'success';
    }

    isError() {
        return this.status === 'error';
    }

    hasError() {
        return !!this.errorMessage;
    }

    // Get performance metrics
    getPerformanceCategory() {
        if (this.responseTime < 500) return 'fast';
        if (this.responseTime < 2000) return 'normal';
        if (this.responseTime < 5000) return 'slow';
        return 'very_slow';
    }

    // Get time-based information
    getTimeInfo() {
        const date = new Date(this.timestamp);
        return {
            date: date.toISOString().split('T')[0],
            time: date.toTimeString().split(' ')[0],
            hour: date.getHours(),
            dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'long' }),
            month: date.toLocaleDateString('en-US', { month: 'long' }),
            year: date.getFullYear()
        };
    }

    // Helper methods
    tryParseJson(jsonString) {
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            return jsonString;
        }
    }

    // Static methods for creating instances
    static fromDatabaseRow(row) {
        return new QueryLog({
            id: row.id,
            timestamp: row.timestamp,
            api_name: row.api_name,
            location: row.location,
            query_params: row.query_params,
            response_time: row.response_time,
            status: row.status,
            response_data: row.response_data,
            error_message: row.error_message
        });
    }

    static fromApiRequest(apiName, location, queryParams, responseTime, status, responseData = null, errorMessage = null) {
        return new QueryLog({
            apiName,
            location,
            queryParams,
            responseTime,
            status,
            responseData,
            errorMessage
        });
    }

    // Static method to get CSV header
    static getCsvHeader() {
        return 'timestamp,api_name,location,query_params,response_time,status,error_message';
    }

    // Static methods for filtering and analysis
    static filterByApi(logs, apiName) {
        return logs.filter(log => log.apiName === apiName);
    }

    static filterByLocation(logs, location) {
        return logs.filter(log => log.location.toLowerCase().includes(location.toLowerCase()));
    }

    static filterByStatus(logs, status) {
        return logs.filter(log => log.status === status);
    }

    static filterByDateRange(logs, startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        return logs.filter(log => {
            const logDate = new Date(log.timestamp);
            return logDate >= start && logDate <= end;
        });
    }

    static filterByPerformance(logs, category) {
        return logs.filter(log => {
            const logInstance = log instanceof QueryLog ? log : new QueryLog(log);
            return logInstance.getPerformanceCategory() === category;
        });
    }

    // Static analysis methods
    static calculateStats(logs) {
        if (!Array.isArray(logs) || logs.length === 0) {
            return {
                total: 0,
                successful: 0,
                failed: 0,
                successRate: 0,
                averageResponseTime: 0,
                medianResponseTime: 0,
                minResponseTime: 0,
                maxResponseTime: 0
            };
        }

        const responseTimes = logs
            .map(log => log.responseTime || 0)
            .filter(time => time > 0)
            .sort((a, b) => a - b);

        const successful = logs.filter(log => log.status === 'success').length;
        const failed = logs.filter(log => log.status === 'error').length;

        return {
            total: logs.length,
            successful,
            failed,
            successRate: logs.length > 0 ? Math.round((successful / logs.length) * 100) : 0,
            averageResponseTime: responseTimes.length > 0 ? 
                Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length) : 0,
            medianResponseTime: responseTimes.length > 0 ? 
                QueryLog.calculateMedian(responseTimes) : 0,
            minResponseTime: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
            maxResponseTime: responseTimes.length > 0 ? Math.max(...responseTimes) : 0
        };
    }

    static calculateApiBreakdown(logs) {
        const breakdown = {};
        
        logs.forEach(log => {
            const apiName = log.apiName || 'unknown';
            if (!breakdown[apiName]) {
                breakdown[apiName] = {
                    total: 0,
                    successful: 0,
                    failed: 0,
                    totalResponseTime: 0,
                    responseTimes: []
                };
            }
            
            breakdown[apiName].total++;
            breakdown[apiName].totalResponseTime += log.responseTime || 0;
            breakdown[apiName].responseTimes.push(log.responseTime || 0);
            
            if (log.status === 'success') {
                breakdown[apiName].successful++;
            } else {
                breakdown[apiName].failed++;
            }
        });

        // Calculate averages and statistics
        Object.keys(breakdown).forEach(apiName => {
            const api = breakdown[apiName];
            api.successRate = api.total > 0 ? Math.round((api.successful / api.total) * 100) : 0;
            api.averageResponseTime = api.total > 0 ? Math.round(api.totalResponseTime / api.total) : 0;
            api.medianResponseTime = QueryLog.calculateMedian(api.responseTimes.filter(t => t > 0));
            delete api.totalResponseTime;
            delete api.responseTimes;
        });

        return breakdown;
    }

    static calculateMedian(values) {
        if (values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        
        if (sorted.length % 2 === 0) {
            return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
        } else {
            return sorted[middle];
        }
    }

    // Convert to JSON
    toJSON() {
        return this.toApiFormat();
    }
}

module.exports = QueryLog;