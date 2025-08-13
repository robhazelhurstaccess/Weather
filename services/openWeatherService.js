const axios = require('axios');
const { apiConfig } = require('../config/apis');
const loggerService = require('./loggerService');
const database = require('../config/database');

class OpenWeatherService {
    constructor() {
        this.config = apiConfig.openWeather;
        this.name = 'OpenWeatherMap';
        this.circuitBreaker = {
            failures: 0,
            lastFailureTime: null,
            state: 'CLOSED' // CLOSED, OPEN, HALF_OPEN
        };
    }

    isAvailable() {
        return this.config.apiKey && this.config.apiKey !== 'your_openweather_api_key_here';
    }

    async getCurrentWeather(location) {
        if (!this.isAvailable()) {
            throw new Error('OpenWeatherMap API key not configured');
        }

        if (this.circuitBreaker.state === 'OPEN') {
            const timeSinceFailure = Date.now() - this.circuitBreaker.lastFailureTime;
            if (timeSinceFailure < 60000) { // 1 minute
                throw new Error('Circuit breaker is OPEN - service temporarily unavailable');
            } else {
                this.circuitBreaker.state = 'HALF_OPEN';
            }
        }

        const startTime = Date.now();
        let status = 'error';
        let responseData = null;
        let errorMessage = null;

        try {
            // Check cache first
            const cachedData = await database.getCachedWeather(location, this.name);
            if (cachedData) {
                await loggerService.logQuery(this.name, location, { source: 'cache' }, 0, 'success', cachedData);
                return cachedData;
            }

            const params = {
                q: location,
                appid: this.config.apiKey,
                units: this.config.params.units,
                lang: this.config.params.lang
            };

            const response = await axios.get(`${this.config.baseUrl}${this.config.endpoints.current}`, {
                params,
                timeout: 10000
            });

            const responseTime = Date.now() - startTime;
            status = 'success';
            
            // Transform the response to standardized format
            responseData = this.transformCurrentWeatherData(response.data);
            
            // Cache the result
            await database.setCachedWeather(location, this.name, responseData, 5);
            
            // Reset circuit breaker on success
            this.circuitBreaker.failures = 0;
            this.circuitBreaker.state = 'CLOSED';

            await loggerService.logQuery(this.name, location, params, responseTime, status, responseData);
            
            return responseData;

        } catch (error) {
            const responseTime = Date.now() - startTime;
            errorMessage = error.message;
            
            // Update circuit breaker
            this.circuitBreaker.failures++;
            this.circuitBreaker.lastFailureTime = Date.now();
            
            if (this.circuitBreaker.failures >= 5) {
                this.circuitBreaker.state = 'OPEN';
            }

            await loggerService.logQuery(this.name, location, { error: true }, responseTime, status, null, errorMessage);
            
            throw new Error(`OpenWeatherMap API error: ${error.message}`);
        }
    }

    async getForecast(location, days = 5) {
        if (!this.isAvailable()) {
            throw new Error('OpenWeatherMap API key not configured');
        }

        const startTime = Date.now();
        let status = 'error';
        let responseData = null;
        let errorMessage = null;

        try {
            const params = {
                q: location,
                appid: this.config.apiKey,
                units: this.config.params.units,
                lang: this.config.params.lang,
                cnt: days * 8 // 8 forecasts per day (3-hour intervals)
            };

            const response = await axios.get(`${this.config.baseUrl}${this.config.endpoints.forecast}`, {
                params,
                timeout: 10000
            });

            const responseTime = Date.now() - startTime;
            status = 'success';
            
            responseData = this.transformForecastData(response.data);
            
            await loggerService.logQuery(this.name, location, params, responseTime, status, responseData);
            
            return responseData;

        } catch (error) {
            const responseTime = Date.now() - startTime;
            errorMessage = error.message;
            
            await loggerService.logQuery(this.name, location, { forecast: true, days }, responseTime, status, null, errorMessage);
            
            throw new Error(`OpenWeatherMap forecast API error: ${error.message}`);
        }
    }

    transformCurrentWeatherData(data) {
        return {
            location: {
                name: data.name,
                country: data.sys.country,
                coordinates: {
                    lat: data.coord.lat,
                    lon: data.coord.lon
                }
            },
            current: {
                temperature: {
                    celsius: Math.round(data.main.temp),
                    fahrenheit: Math.round((data.main.temp * 9/5) + 32),
                    feelsLike: {
                        celsius: Math.round(data.main.feels_like),
                        fahrenheit: Math.round((data.main.feels_like * 9/5) + 32)
                    }
                },
                humidity: data.main.humidity,
                pressure: {
                    hPa: data.main.pressure,
                    inHg: Math.round((data.main.pressure * 0.02953) * 100) / 100
                },
                visibility: data.visibility ? {
                    meters: data.visibility,
                    miles: Math.round((data.visibility * 0.000621371) * 100) / 100
                } : null,
                wind: {
                    speed: {
                        mps: data.wind.speed,
                        mph: Math.round((data.wind.speed * 2.237) * 100) / 100,
                        kmh: Math.round((data.wind.speed * 3.6) * 100) / 100
                    },
                    direction: data.wind.deg,
                    gust: data.wind.gust ? {
                        mps: data.wind.gust,
                        mph: Math.round((data.wind.gust * 2.237) * 100) / 100
                    } : null
                },
                weather: {
                    main: data.weather[0].main,
                    description: data.weather[0].description,
                    icon: data.weather[0].icon
                },
                clouds: data.clouds.all,
                uv: null // Not available in current weather endpoint
            },
            timestamp: new Date(data.dt * 1000).toISOString(),
            sunrise: new Date(data.sys.sunrise * 1000).toISOString(),
            sunset: new Date(data.sys.sunset * 1000).toISOString(),
            source: 'OpenWeatherMap'
        };
    }

    transformForecastData(data) {
        const dailyForecasts = {};
        
        data.list.forEach(item => {
            const date = new Date(item.dt * 1000).toISOString().split('T')[0];
            
            if (!dailyForecasts[date]) {
                dailyForecasts[date] = {
                    date,
                    temperature: {
                        min: item.main.temp,
                        max: item.main.temp,
                        celsius: {
                            min: Math.round(item.main.temp_min),
                            max: Math.round(item.main.temp_max)
                        },
                        fahrenheit: {
                            min: Math.round((item.main.temp_min * 9/5) + 32),
                            max: Math.round((item.main.temp_max * 9/5) + 32)
                        }
                    },
                    weather: {
                        main: item.weather[0].main,
                        description: item.weather[0].description,
                        icon: item.weather[0].icon
                    },
                    humidity: item.main.humidity,
                    pressure: {
                        hPa: item.main.pressure,
                        inHg: Math.round((item.main.pressure * 0.02953) * 100) / 100
                    },
                    wind: {
                        speed: {
                            mps: item.wind.speed,
                            mph: Math.round((item.wind.speed * 2.237) * 100) / 100
                        },
                        direction: item.wind.deg
                    },
                    clouds: item.clouds.all,
                    precipitation: item.rain ? item.rain['3h'] || 0 : 0
                };
            } else {
                // Update min/max temperatures
                dailyForecasts[date].temperature.min = Math.min(dailyForecasts[date].temperature.min, item.main.temp);
                dailyForecasts[date].temperature.max = Math.max(dailyForecasts[date].temperature.max, item.main.temp);
                dailyForecasts[date].temperature.celsius.min = Math.min(dailyForecasts[date].temperature.celsius.min, Math.round(item.main.temp_min));
                dailyForecasts[date].temperature.celsius.max = Math.max(dailyForecasts[date].temperature.celsius.max, Math.round(item.main.temp_max));
                dailyForecasts[date].temperature.fahrenheit.min = Math.min(dailyForecasts[date].temperature.fahrenheit.min, Math.round((item.main.temp_min * 9/5) + 32));
                dailyForecasts[date].temperature.fahrenheit.max = Math.max(dailyForecasts[date].temperature.fahrenheit.max, Math.round((item.main.temp_max * 9/5) + 32));
            }
        });

        return {
            location: {
                name: data.city.name,
                country: data.city.country,
                coordinates: {
                    lat: data.city.coord.lat,
                    lon: data.city.coord.lon
                }
            },
            forecast: Object.values(dailyForecasts),
            source: 'OpenWeatherMap'
        };
    }

    async testConnection() {
        if (!this.isAvailable()) {
            return {
                success: false,
                error: 'API key not configured'
            };
        }

        try {
            const result = await this.getCurrentWeather('London');
            return {
                success: true,
                responseTime: 'logged',
                data: result
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new OpenWeatherService();