const openWeatherService = require('../services/openWeatherService');
const weatherApiService = require('../services/weatherApiService');
const accuWeatherService = require('../services/accuWeatherService');
const loggerService = require('../services/loggerService');
const Weather = require('../models/Weather');
const { asyncHandler } = require('../middleware/errorHandler');

class ComparisonController {
    // Compare current weather from all available APIs
    static compareCurrentWeather = asyncHandler(async (req, res) => {
        const { location } = req.params;
        const cleanLocation = location.trim();

        if (!cleanLocation) {
            return res.status(400).json({
                error: 'Location required',
                message: 'Please provide a location for weather comparison'
            });
        }

        const services = [
            { name: 'OpenWeatherMap', service: openWeatherService },
            { name: 'WeatherAPI', service: weatherApiService },
            { name: 'AccuWeather', service: accuWeatherService }
        ];

        const results = {};
        const errors = {};
        const startTime = Date.now();

        // Fetch weather data from all available services
        await Promise.allSettled(
            services.map(async ({ name, service }) => {
                if (!service.isAvailable()) {
                    errors[name] = 'Service not available (API key not configured)';
                    return;
                }

                try {
                    const data = await service.getCurrentWeather(cleanLocation);
                    const weather = new Weather(data);
                    
                    if (weather.isValid()) {
                        results[name] = {
                            data: weather.getStandardized(),
                            success: true,
                            source: name
                        };
                    } else {
                        errors[name] = 'Invalid weather data received';
                    }
                } catch (error) {
                    errors[name] = error.message;
                }
            })
        );

        const responseTime = Date.now() - startTime;
        const successCount = Object.keys(results).length;
        const errorCount = Object.keys(errors).length;

        if (successCount === 0) {
            return res.status(503).json({
                error: 'No weather data available',
                message: 'All weather services failed or are unavailable',
                location: cleanLocation,
                errors: errors,
                responseTime: responseTime
            });
        }

        // Perform detailed comparison
        const comparison = ComparisonController.performDetailedComparison(results);
        
        // Calculate accuracy metrics
        const accuracyMetrics = ComparisonController.calculateAccuracyMetrics(results);

        res.json({
            success: true,
            location: cleanLocation,
            timestamp: new Date().toISOString(),
            responseTime: responseTime,
            sources: {
                successful: successCount,
                failed: errorCount,
                total: services.length
            },
            results: results,
            comparison: comparison,
            accuracy: accuracyMetrics,
            errors: errorCount > 0 ? errors : undefined
        });
    });

    // Compare forecasts from multiple APIs
    static compareForecast = asyncHandler(async (req, res) => {
        const { location } = req.params;
        const { days = 5 } = req.query;
        const cleanLocation = location.trim();
        const forecastDays = Math.min(Math.max(parseInt(days) || 5, 1), 5);

        if (!cleanLocation) {
            return res.status(400).json({
                error: 'Location required',
                message: 'Please provide a location for forecast comparison'
            });
        }

        const services = [
            { name: 'OpenWeatherMap', service: openWeatherService },
            { name: 'WeatherAPI', service: weatherApiService },
            { name: 'AccuWeather', service: accuWeatherService }
        ];

        const results = {};
        const errors = {};
        const startTime = Date.now();

        // Fetch forecast data from all available services
        await Promise.allSettled(
            services.map(async ({ name, service }) => {
                if (!service.isAvailable()) {
                    errors[name] = 'Service not available (API key not configured)';
                    return;
                }

                try {
                    const data = await service.getForecast(cleanLocation, forecastDays);
                    const weather = new Weather(data);
                    
                    if (weather.hasValidForecast()) {
                        results[name] = {
                            data: weather.getStandardized(),
                            success: true,
                            source: name
                        };
                    } else {
                        errors[name] = 'Invalid forecast data received';
                    }
                } catch (error) {
                    errors[name] = error.message;
                }
            })
        );

        const responseTime = Date.now() - startTime;
        const successCount = Object.keys(results).length;

        if (successCount === 0) {
            return res.status(503).json({
                error: 'No forecast data available',
                message: 'All weather services failed or are unavailable',
                location: cleanLocation,
                errors: errors,
                responseTime: responseTime
            });
        }

        // Compare forecasts day by day
        const forecastComparison = ComparisonController.compareForecastData(results, forecastDays);

        res.json({
            success: true,
            location: cleanLocation,
            days: forecastDays,
            timestamp: new Date().toISOString(),
            responseTime: responseTime,
            sources: {
                successful: successCount,
                failed: Object.keys(errors).length,
                total: services.length
            },
            results: results,
            comparison: forecastComparison,
            errors: Object.keys(errors).length > 0 ? errors : undefined
        });
    });

    // Get historical accuracy data for APIs
    static getAccuracyHistory = asyncHandler(async (req, res) => {
        const { days = 7 } = req.query;
        const historyDays = Math.min(Math.max(parseInt(days) || 7, 1), 30);

        try {
            // Get query logs for analysis
            const logs = await loggerService.getQueryLogs({
                limit: 10000,
                startDate: new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000).toISOString()
            });

            // Group logs by API and analyze
            const apiGroups = {};
            logs.forEach(log => {
                if (!apiGroups[log.api_name]) {
                    apiGroups[log.api_name] = [];
                }
                apiGroups[log.api_name].push(log);
            });

            const accuracyHistory = {};
            Object.keys(apiGroups).forEach(apiName => {
                const apiLogs = apiGroups[apiName];
                const dailyStats = ComparisonController.calculateDailyStats(apiLogs);
                
                accuracyHistory[apiName] = {
                    totalRequests: apiLogs.length,
                    successRate: Math.round((apiLogs.filter(log => log.status === 'success').length / apiLogs.length) * 100),
                    averageResponseTime: Math.round(apiLogs.reduce((sum, log) => sum + (log.response_time || 0), 0) / apiLogs.length),
                    dailyBreakdown: dailyStats
                };
            });

            res.json({
                success: true,
                period: {
                    days: historyDays,
                    startDate: new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000).toISOString(),
                    endDate: new Date().toISOString()
                },
                accuracy: accuracyHistory,
                totalLogs: logs.length,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error getting accuracy history:', error);
            throw error;
        }
    });

    // Perform detailed comparison analysis
    static performDetailedComparison(results) {
        const sources = Object.keys(results);
        if (sources.length < 2) {
            return null;
        }

        const weatherObjects = sources.map(source => new Weather(results[source].data));
        const comparison = {
            temperature: ComparisonController.compareMetric(weatherObjects, 'temperature'),
            humidity: ComparisonController.compareMetric(weatherObjects, 'humidity'),
            pressure: ComparisonController.compareMetric(weatherObjects, 'pressure'),
            windSpeed: ComparisonController.compareMetric(weatherObjects, 'windSpeed'),
            consensus: {}
        };

        // Calculate consensus values
        comparison.consensus = {
            temperature: comparison.temperature ? Math.round(comparison.temperature.mean) : null,
            humidity: comparison.humidity ? Math.round(comparison.humidity.mean) : null,
            pressure: comparison.pressure ? Math.round(comparison.pressure.mean) : null,
            windSpeed: comparison.windSpeed ? Math.round(comparison.windSpeed.mean * 10) / 10 : null
        };

        return comparison;
    }

    // Compare specific metrics across weather sources
    static compareMetric(weatherObjects, metric) {
        const values = weatherObjects.map(weather => {
            const current = weather.getStandardizedCurrent();
            switch (metric) {
                case 'temperature':
                    return current.temperature.celsius;
                case 'humidity':
                    return current.humidity;
                case 'pressure':
                    return current.pressure.hPa;
                case 'windSpeed':
                    return current.wind.speed.mph;
                default:
                    return null;
            }
        }).filter(value => value !== null && value !== undefined);

        if (values.length === 0) {
            return null;
        }

        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        const standardDeviation = Math.sqrt(variance);

        return {
            values: values,
            count: values.length,
            min: Math.min(...values),
            max: Math.max(...values),
            mean: Math.round(mean * 100) / 100,
            median: ComparisonController.calculateMedian(values),
            standardDeviation: Math.round(standardDeviation * 100) / 100,
            variance: Math.round(variance * 100) / 100,
            range: Math.max(...values) - Math.min(...values),
            agreement: standardDeviation < (mean * 0.1) // Good agreement if std dev < 10% of mean
        };
    }

    // Calculate accuracy metrics for API comparison
    static calculateAccuracyMetrics(results) {
        const sources = Object.keys(results);
        if (sources.length < 2) {
            return null;
        }

        const metrics = {};
        const weatherData = sources.map(source => results[source].data);

        // Temperature accuracy
        const temperatures = weatherData.map(data => data.current.temperature.celsius).filter(t => t !== null);
        if (temperatures.length > 1) {
            const tempMean = temperatures.reduce((sum, temp) => sum + temp, 0) / temperatures.length;
            metrics.temperature = {
                agreement: temperatures.every(temp => Math.abs(temp - tempMean) <= 2), // Within 2°C
                maxDifference: Math.max(...temperatures) - Math.min(...temperatures),
                standardDeviation: Math.sqrt(temperatures.reduce((sum, temp) => sum + Math.pow(temp - tempMean, 2), 0) / temperatures.length)
            };
        }

        // Humidity accuracy
        const humidities = weatherData.map(data => data.current.humidity).filter(h => h !== null);
        if (humidities.length > 1) {
            const humMean = humidities.reduce((sum, hum) => sum + hum, 0) / humidities.length;
            metrics.humidity = {
                agreement: humidities.every(hum => Math.abs(hum - humMean) <= 10), // Within 10%
                maxDifference: Math.max(...humidities) - Math.min(...humidities),
                standardDeviation: Math.sqrt(humidities.reduce((sum, hum) => sum + Math.pow(hum - humMean, 2), 0) / humidities.length)
            };
        }

        // Weather condition consensus
        const conditions = weatherData.map(data => data.current.weather.main).filter(c => c);
        const conditionCounts = {};
        conditions.forEach(condition => {
            conditionCounts[condition] = (conditionCounts[condition] || 0) + 1;
        });
        
        const mostCommonCondition = Object.keys(conditionCounts).reduce((a, b) => 
            conditionCounts[a] > conditionCounts[b] ? a : b, null);
        
        if (conditions.length > 1) {
            metrics.weatherCondition = {
                consensus: mostCommonCondition,
                agreement: conditionCounts[mostCommonCondition] / conditions.length,
                allConditions: conditionCounts
            };
        }

        return metrics;
    }

    // Compare forecast data day by day
    static compareForecastData(results, days) {
        const sources = Object.keys(results);
        const comparison = {};

        for (let day = 0; day < days; day++) {
            const dayComparison = {
                date: null,
                temperature: { min: [], max: [] },
                conditions: [],
                sources: {}
            };

            sources.forEach(source => {
                const forecast = results[source].data.forecast;
                if (forecast && forecast[day]) {
                    const dayData = forecast[day];
                    
                    if (!dayComparison.date) {
                        dayComparison.date = dayData.date;
                    }
                    
                    if (dayData.temperature?.celsius?.min !== null) {
                        dayComparison.temperature.min.push(dayData.temperature.celsius.min);
                    }
                    if (dayData.temperature?.celsius?.max !== null) {
                        dayComparison.temperature.max.push(dayData.temperature.celsius.max);
                    }
                    if (dayData.weather?.main) {
                        dayComparison.conditions.push(dayData.weather.main);
                    }

                    dayComparison.sources[source] = {
                        tempMin: dayData.temperature?.celsius?.min,
                        tempMax: dayData.temperature?.celsius?.max,
                        condition: dayData.weather?.main,
                        humidity: dayData.humidity,
                        precipitation: dayData.precipitation
                    };
                }
            });

            // Calculate statistics for the day
            if (dayComparison.temperature.min.length > 0) {
                dayComparison.statistics = {
                    tempMin: {
                        mean: Math.round(dayComparison.temperature.min.reduce((a, b) => a + b, 0) / dayComparison.temperature.min.length),
                        range: Math.max(...dayComparison.temperature.min) - Math.min(...dayComparison.temperature.min)
                    },
                    tempMax: {
                        mean: Math.round(dayComparison.temperature.max.reduce((a, b) => a + b, 0) / dayComparison.temperature.max.length),
                        range: Math.max(...dayComparison.temperature.max) - Math.min(...dayComparison.temperature.max)
                    }
                };
            }

            comparison[`day${day + 1}`] = dayComparison;
        }

        return comparison;
    }

    // Calculate daily statistics for accuracy history
    static calculateDailyStats(logs) {
        const dailyStats = {};
        
        logs.forEach(log => {
            const date = new Date(log.timestamp).toISOString().split('T')[0];
            
            if (!dailyStats[date]) {
                dailyStats[date] = {
                    total: 0,
                    successful: 0,
                    failed: 0,
                    totalResponseTime: 0,
                    responseTimes: []
                };
            }
            
            dailyStats[date].total++;
            dailyStats[date].totalResponseTime += log.response_time || 0;
            dailyStats[date].responseTimes.push(log.response_time || 0);
            
            if (log.status === 'success') {
                dailyStats[date].successful++;
            } else {
                dailyStats[date].failed++;
            }
        });

        // Calculate averages
        Object.keys(dailyStats).forEach(date => {
            const stats = dailyStats[date];
            stats.successRate = Math.round((stats.successful / stats.total) * 100);
            stats.averageResponseTime = Math.round(stats.totalResponseTime / stats.total);
            stats.medianResponseTime = ComparisonController.calculateMedian(stats.responseTimes.filter(t => t > 0));
            delete stats.totalResponseTime;
            delete stats.responseTimes;
        });

        return dailyStats;
    }

    // Helper method to calculate median
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
}

module.exports = ComparisonController;