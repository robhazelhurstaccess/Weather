const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        this.dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'weather.db');
        this.db = null;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Error opening database:', err);
                    reject(err);
                } else {
                    console.log('Connected to SQLite database');
                    this.createTables();
                    resolve();
                }
            });
        });
    }

    createTables() {
        // Query logs table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS query_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                api_name TEXT NOT NULL,
                location TEXT NOT NULL,
                query_params TEXT,
                response_time INTEGER,
                status TEXT,
                response_data TEXT,
                error_message TEXT
            )
        `);

        // Weather data cache table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS weather_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                location TEXT NOT NULL,
                api_name TEXT NOT NULL,
                data TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME NOT NULL,
                UNIQUE(location, api_name)
            )
        `);

        // API performance metrics table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS api_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                api_name TEXT NOT NULL,
                date DATE NOT NULL,
                total_requests INTEGER DEFAULT 0,
                successful_requests INTEGER DEFAULT 0,
                failed_requests INTEGER DEFAULT 0,
                avg_response_time REAL DEFAULT 0,
                min_response_time INTEGER DEFAULT 0,
                max_response_time INTEGER DEFAULT 0,
                UNIQUE(api_name, date)
            )
        `);

        // Favorite locations table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS favorite_locations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                location TEXT UNIQUE NOT NULL,
                display_name TEXT NOT NULL,
                postcode TEXT,
                latitude REAL,
                longitude REAL,
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('Database tables created/verified');
    }

    async logQuery(apiName, location, queryParams, responseTime, status, responseData = null, errorMessage = null) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO query_logs (api_name, location, query_params, response_time, status, response_data, error_message)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run([
                apiName,
                location,
                JSON.stringify(queryParams),
                responseTime,
                status,
                responseData ? JSON.stringify(responseData) : null,
                errorMessage
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
            
            stmt.finalize();
        });
    }

    async getQueryLogs(limit = 100, offset = 0, apiName = null, location = null) {
        return new Promise((resolve, reject) => {
            let query = 'SELECT * FROM query_logs WHERE 1=1';
            let params = [];

            if (apiName) {
                query += ' AND api_name = ?';
                params.push(apiName);
            }

            if (location) {
                query += ' AND location LIKE ?';
                params.push(`%${location}%`);
            }

            query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);

            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async getCachedWeather(location, apiName) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM weather_cache WHERE location = ? AND api_name = ? AND expires_at > datetime("now")',
                [location, apiName],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row ? JSON.parse(row.data) : null);
                    }
                }
            );
        });
    }

    async setCachedWeather(location, apiName, data, ttlMinutes = 5) {
        return new Promise((resolve, reject) => {
            const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
            
            this.db.run(
                `INSERT OR REPLACE INTO weather_cache (location, api_name, data, expires_at) 
                 VALUES (?, ?, ?, ?)`,
                [location, apiName, JSON.stringify(data), expiresAt],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                }
            );
        });
    }

    async updateApiMetrics(apiName, responseTime, success) {
        return new Promise((resolve, reject) => {
            const today = new Date().toISOString().split('T')[0];
            
            // First, try to get existing metrics for today
            this.db.get(
                'SELECT * FROM api_metrics WHERE api_name = ? AND date = ?',
                [apiName, today],
                (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    if (row) {
                        // Update existing metrics
                        const totalRequests = row.total_requests + 1;
                        const successfulRequests = row.successful_requests + (success ? 1 : 0);
                        const failedRequests = row.failed_requests + (success ? 0 : 1);
                        const avgResponseTime = ((row.avg_response_time * row.total_requests) + responseTime) / totalRequests;
                        const minResponseTime = Math.min(row.min_response_time, responseTime);
                        const maxResponseTime = Math.max(row.max_response_time, responseTime);

                        this.db.run(
                            `UPDATE api_metrics SET 
                             total_requests = ?, successful_requests = ?, failed_requests = ?,
                             avg_response_time = ?, min_response_time = ?, max_response_time = ?
                             WHERE api_name = ? AND date = ?`,
                            [totalRequests, successfulRequests, failedRequests, avgResponseTime, minResponseTime, maxResponseTime, apiName, today],
                            function(err) {
                                if (err) reject(err);
                                else resolve(this.changes);
                            }
                        );
                    } else {
                        // Create new metrics record
                        this.db.run(
                            `INSERT INTO api_metrics 
                             (api_name, date, total_requests, successful_requests, failed_requests, avg_response_time, min_response_time, max_response_time)
                             VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
                            [apiName, today, success ? 1 : 0, success ? 0 : 1, responseTime, responseTime, responseTime],
                            function(err) {
                                if (err) reject(err);
                                else resolve(this.lastID);
                            }
                        );
                    }
                }
            );
        });
    }

    async getApiMetrics(days = 7) {
        return new Promise((resolve, reject) => {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            const startDateStr = startDate.toISOString().split('T')[0];

            this.db.all(
                'SELECT * FROM api_metrics WHERE date >= ? ORDER BY date DESC, api_name',
                [startDateStr],
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                }
            );
        });
    }

    async addFavoriteLocation(location, displayName, postcode = null, latitude = null, longitude = null) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT OR REPLACE INTO favorite_locations (location, display_name, postcode, latitude, longitude) VALUES (?, ?, ?, ?, ?)',
                [location, displayName, postcode, latitude, longitude],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    async getFavoriteLocations() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM favorite_locations ORDER BY display_name', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async removeFavoriteLocation(location) {
        return new Promise((resolve, reject) => {
            this.db.run('DELETE FROM favorite_locations WHERE location = ?', [location], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    async cleanupExpiredCache() {
        return new Promise((resolve, reject) => {
            this.db.run('DELETE FROM weather_cache WHERE expires_at <= datetime("now")', function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    async close() {
        return new Promise((resolve, reject) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log('Database connection closed');
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = new Database();