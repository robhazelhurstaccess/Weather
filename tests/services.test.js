const openWeatherService = require('../services/openWeatherService');
const weatherApiService = require('../services/weatherApiService');
const accuWeatherService = require('../services/accuWeatherService');
const loggerService = require('../services/loggerService');

// Mock the config to avoid requiring actual API keys
jest.mock('../config/apis', () => ({
    apiConfig: {
        openWeather: {
            name: 'OpenWeatherMap',
            baseUrl: 'https://api.openweathermap.org/data/2.5',
            apiKey: 'test_api_key',
            endpoints: {
                current: '/weather',
                forecast: '/forecast'
            },
            params: {
                units: 'metric',
                lang: 'en'
            }
        },
        weatherApi: {
            name: 'WeatherAPI',
            baseUrl: 'https://api.weatherapi.com/v1',
            apiKey: 'test_api_key',
            endpoints: {
                current: '/current.json',
                forecast: '/forecast.json'
            },
            params: {
                aqi: 'yes'
            }
        },
        accuWeather: {
            name: 'AccuWeather',
            baseUrl: 'http://dataservice.accuweather.com',
            apiKey: 'test_api_key',
            endpoints: {
                locationSearch: '/locations/v1/cities/search',
                current: '/currentconditions/v1',
                forecast: '/forecasts/v1/daily/5day'
            },
            params: {
                language: 'en-gb',
                details: true,
                metric: true
            }
        }
    }
}));

// Mock axios to avoid making real API calls
jest.mock('axios');
const axios = require('axios');

describe('OpenWeatherService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset circuit breaker
        openWeatherService.circuitBreaker = {
            failures: 0,
            lastFailureTime: null,
            state: 'CLOSED'
        };
    });

    describe('isAvailable', () => {
        test('should return true when API key is configured', () => {
            expect(openWeatherService.isAvailable()).toBe(true);
        });
    });

    describe('getCurrentWeather', () => {
        test('should return transformed weather data for valid location', async () => {
            const mockResponse = {
                data: {
                    name: 'London',
                    sys: { country: 'GB', sunrise: 1640000000, sunset: 1640040000 },
                    coord: { lat: 51.5074, lon: -0.1278 },
                    main: {
                        temp: 15,
                        feels_like: 13,
                        humidity: 80,
                        pressure: 1013
                    },
                    wind: {
                        speed: 5.5,
                        deg: 220
                    },
                    weather: [{
                        main: 'Clouds',
                        description: 'overcast clouds',
                        icon: '04d'
                    }],
                    clouds: { all: 90 },
                    visibility: 10000,
                    dt: 1640020000
                }
            };

            axios.get.mockResolvedValue(mockResponse);

            const result = await openWeatherService.getCurrentWeather('London');

            expect(result).toHaveProperty('location');
            expect(result).toHaveProperty('current');
            expect(result).toHaveProperty('source', 'OpenWeatherMap');
            expect(result.location.name).toBe('London');
            expect(result.current.temperature.celsius).toBe(15);
            expect(result.current.weather.main).toBe('Clouds');
        });

        test('should handle API errors', async () => {
            axios.get.mockRejectedValue(new Error('API Error'));

            await expect(openWeatherService.getCurrentWeather('InvalidLocation'))
                .rejects.toThrow('OpenWeatherMap API error');
        });

        test('should implement circuit breaker pattern', async () => {
            axios.get.mockRejectedValue(new Error('Service Unavailable'));

            // Trigger multiple failures
            for (let i = 0; i < 5; i++) {
                try {
                    await openWeatherService.getCurrentWeather('London');
                } catch (error) {
                    // Expected to fail
                }
            }

            // Circuit breaker should be open
            expect(openWeatherService.circuitBreaker.state).toBe('OPEN');

            // Next call should fail immediately
            await expect(openWeatherService.getCurrentWeather('London'))
                .rejects.toThrow('Circuit breaker is OPEN');
        });
    });

    describe('testConnection', () => {
        test('should return success for working API', async () => {
            const mockResponse = {
                data: {
                    name: 'London',
                    main: { temp: 15 },
                    weather: [{ main: 'Clear' }]
                }
            };

            axios.get.mockResolvedValue(mockResponse);

            const result = await openWeatherService.testConnection();

            expect(result.success).toBe(true);
        });

        test('should return failure for non-working API', async () => {
            axios.get.mockRejectedValue(new Error('Connection failed'));

            const result = await openWeatherService.testConnection();

            expect(result.success).toBe(false);
            expect(result.error).toContain('Connection failed');
        });
    });
});

describe('WeatherApiService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        weatherApiService.circuitBreaker = {
            failures: 0,
            lastFailureTime: null,
            state: 'CLOSED'
        };
    });

    describe('getCurrentWeather', () => {
        test('should return transformed weather data', async () => {
            const mockResponse = {
                data: {
                    location: {
                        name: 'London',
                        country: 'United Kingdom',
                        region: 'City of London, Greater London',
                        lat: 51.52,
                        lon: -0.11,
                        tz_id: 'Europe/London',
                        localtime: '2023-12-01 12:00'
                    },
                    current: {
                        temp_c: 15,
                        temp_f: 59,
                        feelslike_c: 13,
                        feelslike_f: 55,
                        humidity: 80,
                        pressure_mb: 1013,
                        pressure_in: 29.91,
                        vis_km: 10,
                        vis_miles: 6,
                        wind_mph: 12,
                        wind_kph: 19.3,
                        wind_degree: 220,
                        wind_dir: 'SW',
                        gust_mph: 15,
                        gust_kph: 24.1,
                        condition: {
                            text: 'Overcast',
                            icon: '//cdn.weatherapi.com/weather/64x64/day/122.png',
                            code: 1009
                        },
                        cloud: 90,
                        uv: 3
                    }
                }
            };

            axios.get.mockResolvedValue(mockResponse);

            const result = await weatherApiService.getCurrentWeather('London');

            expect(result).toHaveProperty('location');
            expect(result).toHaveProperty('current');
            expect(result).toHaveProperty('source', 'WeatherAPI');
            expect(result.location.name).toBe('London');
            expect(result.current.temperature.celsius).toBe(15);
            expect(result.current.uv).toBe(3);
        });
    });

    describe('getForecast', () => {
        test('should return transformed forecast data', async () => {
            const mockResponse = {
                data: {
                    location: {
                        name: 'London',
                        country: 'United Kingdom'
                    },
                    forecast: {
                        forecastday: [{
                            date: '2023-12-01',
                            day: {
                                mintemp_c: 10,
                                maxtemp_c: 18,
                                avgtemp_c: 14,
                                mintemp_f: 50,
                                maxtemp_f: 64,
                                avgtemp_f: 57,
                                condition: {
                                    text: 'Partly cloudy',
                                    icon: '//cdn.weatherapi.com/weather/64x64/day/116.png',
                                    code: 1003
                                },
                                avghumidity: 75,
                                maxwind_mph: 15,
                                maxwind_kph: 24.1,
                                avgvis_km: 10,
                                avgvis_miles: 6,
                                uv: 4,
                                totalprecip_mm: 0,
                                totalprecip_in: 0,
                                daily_chance_of_rain: 10,
                                daily_chance_of_snow: 0
                            },
                            astro: {
                                sunrise: '07:45 AM',
                                sunset: '03:53 PM',
                                moonrise: '02:15 PM',
                                moonset: '06:30 AM',
                                moon_phase: 'Waning Gibbous',
                                moon_illumination: '85'
                            }
                        }]
                    }
                }
            };

            axios.get.mockResolvedValue(mockResponse);

            const result = await weatherApiService.getForecast('London', 1);

            expect(result).toHaveProperty('location');
            expect(result).toHaveProperty('forecast');
            expect(result).toHaveProperty('source', 'WeatherAPI');
            expect(result.forecast).toHaveLength(1);
            expect(result.forecast[0].date).toBe('2023-12-01');
            expect(result.forecast[0].temperature.celsius.min).toBe(10);
            expect(result.forecast[0].temperature.celsius.max).toBe(18);
        });
    });
});

describe('AccuWeatherService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        accuWeatherService.circuitBreaker = {
            failures: 0,
            lastFailureTime: null,
            state: 'CLOSED'
        };
        accuWeatherService.locationCache.clear();
    });

    describe('getLocationKey', () => {
        test('should return location key for valid location', async () => {
            const mockResponse = {
                data: [{
                    Key: '328328',
                    LocalizedName: 'London',
                    Country: {
                        LocalizedName: 'United Kingdom'
                    },
                    GeoPosition: {
                        Latitude: 51.517,
                        Longitude: -0.106
                    }
                }]
            };

            axios.get.mockResolvedValue(mockResponse);

            const result = await accuWeatherService.getLocationKey('London');

            expect(result).toHaveProperty('key', '328328');
            expect(result).toHaveProperty('name', 'London');
            expect(result).toHaveProperty('coordinates');
        });

        test('should cache location keys', async () => {
            const mockResponse = {
                data: [{
                    Key: '328328',
                    LocalizedName: 'London',
                    Country: { LocalizedName: 'United Kingdom' },
                    GeoPosition: { Latitude: 51.517, Longitude: -0.106 }
                }]
            };

            axios.get.mockResolvedValue(mockResponse);

            // First call
            await accuWeatherService.getLocationKey('London');
            
            // Second call should use cache
            const result = await accuWeatherService.getLocationKey('London');

            expect(axios.get).toHaveBeenCalledTimes(1);
            expect(result.key).toBe('328328');
        });
    });
});

describe('LoggerService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('logQuery', () => {
        test('should log query with all parameters', async () => {
            const mockLogQuery = jest.spyOn(loggerService, 'logQuery').mockResolvedValue();

            await loggerService.logQuery(
                'TestAPI',
                'London',
                { param: 'test' },
                500,
                'success',
                { data: 'test' },
                null
            );

            expect(mockLogQuery).toHaveBeenCalledWith(
                'TestAPI',
                'London',
                { param: 'test' },
                500,
                'success',
                { data: 'test' },
                null
            );
        });
    });

    describe('getQueryStats', () => {
        test('should calculate query statistics correctly', async () => {
            const mockLogs = [
                {
                    api_name: 'TestAPI',
                    location: 'London',
                    response_time: 500,
                    status: 'success',
                    timestamp: new Date().toISOString()
                },
                {
                    api_name: 'TestAPI',
                    location: 'London',
                    response_time: 600,
                    status: 'success',
                    timestamp: new Date().toISOString()
                },
                {
                    api_name: 'TestAPI',
                    location: 'London',
                    response_time: 1000,
                    status: 'error',
                    timestamp: new Date().toISOString()
                }
            ];

            jest.spyOn(loggerService, 'getQueryLogs').mockResolvedValue(mockLogs);

            const stats = await loggerService.getQueryStats(7);

            expect(stats.totalQueries).toBe(3);
            expect(stats.successfulQueries).toBe(2);
            expect(stats.failedQueries).toBe(1);
            expect(stats.successRate).toBe(67); // 2/3 * 100, rounded
            expect(stats.averageResponseTime).toBe(700); // (500 + 600 + 1000) / 3
        });
    });
});

describe('Service Integration', () => {
    test('should handle service unavailability gracefully', async () => {
        // Test when service is not available (no API key)
        const originalApiKey = openWeatherService.config.apiKey;
        openWeatherService.config.apiKey = null;

        await expect(openWeatherService.getCurrentWeather('London'))
            .rejects.toThrow('OpenWeatherMap API key not configured');

        // Restore original API key
        openWeatherService.config.apiKey = originalApiKey;
    });

    test('should handle network timeouts', async () => {
        const timeoutError = new Error('Request timeout');
        timeoutError.code = 'ECONNABORTED';
        
        axios.get.mockRejectedValue(timeoutError);

        await expect(openWeatherService.getCurrentWeather('London'))
            .rejects.toThrow('OpenWeatherMap API error');
    });

    test('should handle rate limiting from external APIs', async () => {
        const rateLimitError = new Error('Rate limit exceeded');
        rateLimitError.response = { status: 429 };
        
        axios.get.mockRejectedValue(rateLimitError);

        await expect(weatherApiService.getCurrentWeather('London'))
            .rejects.toThrow('WeatherAPI error');
    });
});