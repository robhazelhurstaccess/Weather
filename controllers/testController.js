const openWeatherService = require('../services/openWeatherService');
const weatherApiService = require('../services/weatherApiService');
const accuWeatherService = require('../services/accuWeatherService');
const loggerService = require('../services/loggerService');
const { asyncHandler } = require('../middleware/errorHandler');

class TestController {
    // Test all weather APIs
    static testAllApis = asyncHandler(async (req, res) => {
        const { location = 'London' } = req.query;
        const testLocation = location.trim() || 'London';

        const services = [
            { name: 'OpenWeatherMap', service: openWeatherService },
            { name: 'WeatherAPI', service: weatherApiService },
            { name: 'AccuWeather', service: accuWeatherService }
        ];

        const results = {};
        const startTime = Date.now();

        // Test each service
        for (const { name, service } of services) {
            const serviceStartTime = Date.now();
            
            try {
                const testResult = await service.testConnection();
                const responseTime = Date.now() - serviceStartTime;
                
                results[name] = {
                    name: name,
                    available: service.isAvailable(),
                    configured: !!service.config?.apiKey,
                    success: testResult.success,
                    responseTime: responseTime,
                    error: testResult.error || null,
                    timestamp: new Date().toISOString()
                };

                // If test was successful, try to get actual weather data
                if (testResult.success && service.isAvailable()) {
                    try {
                        const weatherData = await service.getCurrentWeather(testLocation);
                        results[name].weatherTest = {
                            success: true,
                            location: weatherData.location?.name || testLocation,
                            temperature: weatherData.current?.temperature?.celsius || null,
                            condition: weatherData.current?.weather?.main || null
                        };
                    } catch (error) {
                        results[name].weatherTest = {
                            success: false,
                            error: error.message
                        };
                    }
                }

            } catch (error) {
                const responseTime = Date.now() - serviceStartTime;
                results[name] = {
                    name: name,
                    available: service.isAvailable(),
                    configured: !!service.config?.apiKey,
                    success: false,
                    responseTime: responseTime,
                    error: error.message,
                    timestamp: new Date().toISOString()
                };
            }
        }

        const totalResponseTime = Date.now() - startTime;
        const successfulTests = Object.values(results).filter(result => result.success).length;

        res.json({
            success: true,
            testLocation: testLocation,
            timestamp: new Date().toISOString(),
            totalResponseTime: totalResponseTime,
            summary: {
                total: services.length,
                successful: successfulTests,
                failed: services.length - successfulTests,
                allPassing: successfulTests === services.length
            },
            results: results
        });
    });

    // Test specific API
    static testSpecificApi = asyncHandler(async (req, res) => {
        const { apiName } = req.params;
        const { location = 'London' } = req.query;
        const testLocation = location.trim() || 'London';

        let service;
        let serviceName;

        // Select service based on API name
        switch (apiName.toLowerCase()) {
            case 'openweather':
            case 'openweathermap':
                service = openWeatherService;
                serviceName = 'OpenWeatherMap';
                break;
            case 'weatherapi':
                service = weatherApiService;
                serviceName = 'WeatherAPI';
                break;
            case 'accuweather':
                service = accuWeatherService;
                serviceName = 'AccuWeather';
                break;
            default:
                return res.status(400).json({
                    error: 'Invalid API name',
                    message: `API '${apiName}' is not supported`,
                    supportedApis: ['openweather', 'weatherapi', 'accuweather']
                });
        }

        const startTime = Date.now();
        
        try {
            // Basic connection test
            const connectionTest = await service.testConnection();
            const responseTime = Date.now() - startTime;

            const result = {
                api: serviceName,
                testLocation: testLocation,
                timestamp: new Date().toISOString(),
                responseTime: responseTime,
                available: service.isAvailable(),
                configured: !!service.config?.apiKey,
                connectionTest: connectionTest,
                success: connectionTest.success
            };

            res.json({
                success: true,
                result: result
            });

        } catch (error) {
            const responseTime = Date.now() - startTime;
            
            res.json({
                success: false,
                result: {
                    api: serviceName,
                    testLocation: testLocation,
                    timestamp: new Date().toISOString(),
                    responseTime: responseTime,
                    available: service.isAvailable(),
                    configured: !!service.config?.apiKey,
                    success: false,
                    error: error.message
                }
            });
        }
    });

    // Get API performance metrics
    static getPerformanceMetrics = asyncHandler(async (req, res) => {
        const { days = 7 } = req.query;
        const metricsDays = Math.min(Math.max(parseInt(days) || 7, 1), 30);

        try {
            // Get API metrics from database
            const metrics = await loggerService.getApiMetrics(metricsDays);
            
            // Get query statistics
            const queryStats = await loggerService.getQueryStats(metricsDays);

            res.json({
                success: true,
                period: {
                    days: metricsDays,
                    startDate: new Date(Date.now() - metricsDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    endDate: new Date().toISOString().split('T')[0]
                },
                metrics: metrics,
                queryStats: queryStats,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error getting performance metrics:', error);
            throw error;
        }
    });

    // Manual API test
    static manualTest = asyncHandler(async (req, res) => {
        const { api, location, endpoint = 'current' } = req.body;

        if (!api || !location) {
            return res.status(400).json({
                error: 'Missing required parameters',
                message: 'Both api and location are required',
                required: ['api', 'location']
            });
        }

        let service;
        switch (api.toLowerCase()) {
            case 'openweather':
                service = openWeatherService;
                break;
            case 'weatherapi':
                service = weatherApiService;
                break;
            case 'accuweather':
                service = accuWeatherService;
                break;
            default:
                return res.status(400).json({
                    error: 'Invalid API',
                    supportedApis: ['openweather', 'weatherapi', 'accuweather']
                });
        }

        if (!service.isAvailable()) {
            return res.status(503).json({
                error: 'Service unavailable',
                message: `${service.name} is not configured`
            });
        }

        const startTime = Date.now();
        
        try {
            let result;
            
            if (endpoint === 'current') {
                result = await service.getCurrentWeather(location);
            } else if (endpoint === 'forecast') {
                result = await service.getForecast(location, 5);
            } else {
                return res.status(400).json({
                    error: 'Invalid endpoint',
                    supportedEndpoints: ['current', 'forecast']
                });
            }

            const responseTime = Date.now() - startTime;

            res.json({
                success: true,
                api: service.name,
                location: location,
                endpoint: endpoint,
                responseTime: responseTime,
                data: result,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            const responseTime = Date.now() - startTime;
            
            res.status(500).json({
                success: false,
                api: service.name,
                location: location,
                endpoint: endpoint,
                responseTime: responseTime,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    // Get system health
    static getSystemHealth = asyncHandler(async (req, res) => {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            services: {},
            database: { connected: false },
            logs: { accessible: false }
        };

        // Check services
        const services = [
            { name: 'OpenWeatherMap', service: openWeatherService },
            { name: 'WeatherAPI', service: weatherApiService },
            { name: 'AccuWeather', service: accuWeatherService }
        ];

        for (const { name, service } of services) {
            health.services[name] = {
                available: service.isAvailable(),
                configured: !!service.config?.apiKey
            };
        }

        // Check database
        try {
            await loggerService.getQueryLogs({ limit: 1 });
            health.database.connected = true;
        } catch (error) {
            health.database.error = error.message;
            health.status = 'degraded';
        }

        // Check logs
        try {
            await loggerService.getQueryStats(1);
            health.logs.accessible = true;
        } catch (error) {
            health.logs.error = error.message;
            health.status = 'degraded';
        }

        const availableServices = Object.values(health.services).filter(s => s.available).length;
        if (availableServices === 0) {
            health.status = 'unhealthy';
        }

        res.json(health);
    });
}

module.exports = TestController;