const axios = require('axios');
const { apiConfig } = require('../config/apis');
const loggerService = require('./loggerService');
const database = require('../config/database');

class AccuWeatherService {
    constructor() {
        this.config = apiConfig.accuWeather;
        this.name = 'AccuWeather';
        this.circuitBreaker = {
            failures: 0,
            lastFailureTime: null,
            state: 'CLOSED'
        };
        this.locationCache = new Map(); // Cache location keys
    }

    isAvailable() {
        return this.config.apiKey && this.config.apiKey !== 'your_accuweather_api_key_here';
    }

    async getLocationKey(location) {
        // Check cache first
        if (this.locationCache.has(location)) {
            return this.locationCache.get(location);
        }

        const startTime = Date.now();
        
        try {
            const params = {
                apikey: this.config.apiKey,
                q: location,
                language: this.config.params.language
            };

            const response = await axios.get(`${this.config.baseUrl}${this.config.endpoints.locationSearch}`, {
                params,
                timeout: 10000
            });

            const responseTime = Date.now() - startTime;

            if (response.data && response.data.length > 0) {
                const locationData = response.data[0];
                const locationKey = locationData.Key;
                
                // Cache the location key
                this.locationCache.set(location, {
                    key: locationKey,
                    name: locationData.LocalizedName,
                    country: locationData.Country.LocalizedName,
                    coordinates: {
                        lat: locationData.GeoPosition.Latitude,
                        lon: locationData.GeoPosition.Longitude
                    }
                });

                await loggerService.logQuery(this.name, location, { type: 'location_search' }, responseTime, 'success');
                
                return this.locationCache.get(location);
            } else {
                throw new Error('Location not found');
            }

        } catch (error) {
            const responseTime = Date.now() - startTime;
            await loggerService.logQuery(this.name, location, { type: 'location_search', error: true }, responseTime, 'error', null, error.message);
            throw new Error(`AccuWeather location search error: ${error.message}`);
        }
    }

    async getCurrentWeather(location) {
        if (!this.isAvailable()) {
            throw new Error('AccuWeather API key not configured');
        }

        if (this.circuitBreaker.state === 'OPEN') {
            const timeSinceFailure = Date.now() - this.circuitBreaker.lastFailureTime;
            if (timeSinceFailure < 60000) {
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

            // Get location key first
            const locationData = await this.getLocationKey(location);
            
            const params = {
                apikey: this.config.apiKey,
                language: this.config.params.language,
                details: this.config.params.details,
                metric: this.config.params.metric
            };

            const response = await axios.get(`${this.config.baseUrl}${this.config.endpoints.current}/${locationData.key}`, {
                params,
                timeout: 10000
            });

            const responseTime = Date.now() - startTime;
            status = 'success';
            
            responseData = this.transformCurrentWeatherData(response.data[0], locationData);
            
            // Cache the result
            await database.setCachedWeather(location, this.name, responseData, 5);
            
            // Reset circuit breaker on success
            this.circuitBreaker.failures = 0;
            this.circuitBreaker.state = 'CLOSED';

            await loggerService.logQuery(this.name, location, params, responseTime, status, responseData);
            
            return responseData;

        } catch (error) {
            const responseTime = Date.now() - startTime;
            errorMessage = error.response?.data?.Message || error.message;
            
            // Update circuit breaker
            this.circuitBreaker.failures++;
            this.circuitBreaker.lastFailureTime = Date.now();
            
            if (this.circuitBreaker.failures >= 5) {
                this.circuitBreaker.state = 'OPEN';
            }

            await loggerService.logQuery(this.name, location, { error: true }, responseTime, status, null, errorMessage);
            
            throw new Error(`AccuWeather API error: ${errorMessage}`);
        }
    }

    async getForecast(location, days = 5) {
        if (!this.isAvailable()) {
            throw new Error('AccuWeather API key not configured');
        }

        const startTime = Date.now();
        let status = 'error';
        let responseData = null;
        let errorMessage = null;

        try {
            // Get location key first
            const locationData = await this.getLocationKey(location);
            
            const params = {
                apikey: this.config.apiKey,
                language: this.config.params.language,
                details: this.config.params.details,
                metric: this.config.params.metric
            };

            const response = await axios.get(`${this.config.baseUrl}${this.config.endpoints.forecast}/${locationData.key}`, {
                params,
                timeout: 10000
            });

            const responseTime = Date.now() - startTime;
            status = 'success';
            
            responseData = this.transformForecastData(response.data, locationData);
            
            await loggerService.logQuery(this.name, location, params, responseTime, status, responseData);
            
            return responseData;

        } catch (error) {
            const responseTime = Date.now() - startTime;
            errorMessage = error.response?.data?.Message || error.message;
            
            await loggerService.logQuery(this.name, location, { forecast: true, days }, responseTime, status, null, errorMessage);
            
            throw new Error(`AccuWeather forecast API error: ${errorMessage}`);
        }
    }

    transformCurrentWeatherData(data, locationData) {
        const temp = data.Temperature;
        const realFeel = data.RealFeelTemperature;
        const wind = data.Wind;

        return {
            location: {
                name: locationData.name,
                country: locationData.country,
                coordinates: locationData.coordinates
            },
            current: {
                temperature: {
                    celsius: Math.round(temp.Metric.Value),
                    fahrenheit: Math.round(temp.Imperial.Value),
                    feelsLike: {
                        celsius: Math.round(realFeel.Metric.Value),
                        fahrenheit: Math.round(realFeel.Imperial.Value)
                    }
                },
                humidity: data.RelativeHumidity,
                pressure: data.Pressure ? {
                    hPa: Math.round(data.Pressure.Metric.Value),
                    inHg: Math.round(data.Pressure.Imperial.Value * 100) / 100
                } : null,
                visibility: data.Visibility ? {
                    km: data.Visibility.Metric.Value,
                    miles: data.Visibility.Imperial.Value
                } : null,
                wind: {
                    speed: {
                        kmh: wind.Speed.Metric.Value,
                        mph: wind.Speed.Imperial.Value,
                        mps: Math.round((wind.Speed.Metric.Value / 3.6) * 100) / 100
                    },
                    direction: wind.Direction.Degrees,
                    directionText: wind.Direction.Localized
                },
                weather: {
                    main: data.WeatherText,
                    description: data.WeatherText,
                    icon: data.WeatherIcon
                },
                uv: data.UVIndex,
                cloudCover: data.CloudCover
            },
            timestamp: data.LocalObservationDateTime,
            source: 'AccuWeather'
        };
    }

    transformForecastData(data, locationData) {
        const dailyForecasts = data.DailyForecasts;

        const forecast = dailyForecasts.map(day => ({
            date: day.Date.split('T')[0],
            temperature: {
                celsius: {
                    min: Math.round(day.Temperature.Minimum.Value),
                    max: Math.round(day.Temperature.Maximum.Value)
                },
                fahrenheit: {
                    min: Math.round(day.Temperature.Minimum.Value * 9/5 + 32),
                    max: Math.round(day.Temperature.Maximum.Value * 9/5 + 32)
                }
            },
            weather: {
                day: {
                    main: day.Day.IconPhrase,
                    description: day.Day.IconPhrase,
                    icon: day.Day.Icon,
                    precipitationProbability: day.Day.PrecipitationProbability
                },
                night: {
                    main: day.Night.IconPhrase,
                    description: day.Night.IconPhrase,
                    icon: day.Night.Icon,
                    precipitationProbability: day.Night.PrecipitationProbability
                }
            },
            sun: {
                sunrise: day.Sun.Rise,
                sunset: day.Sun.Set
            },
            moon: {
                moonrise: day.Moon.Rise,
                moonset: day.Moon.Set,
                phase: day.Moon.Phase
            },
            airAndPollen: day.AirAndPollen ? day.AirAndPollen.map(item => ({
                name: item.Name,
                value: item.Value,
                category: item.Category,
                categoryValue: item.CategoryValue,
                type: item.Type
            })) : []
        }));

        return {
            location: {
                name: locationData.name,
                country: locationData.country,
                coordinates: locationData.coordinates
            },
            forecast,
            source: 'AccuWeather'
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

module.exports = new AccuWeatherService();