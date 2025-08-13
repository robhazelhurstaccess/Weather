const axios = require('axios');
const { apiConfig } = require('../config/apis');
const loggerService = require('./loggerService');
const database = require('../config/database');

class WeatherApiService {
    constructor() {
        this.config = apiConfig.weatherApi;
        this.name = 'WeatherAPI';
        this.circuitBreaker = {
            failures: 0,
            lastFailureTime: null,
            state: 'CLOSED'
        };
    }

    isAvailable() {
        return this.config.apiKey && this.config.apiKey !== 'your_weatherapi_key_here';
    }

    async getCurrentWeather(location) {
        if (!this.isAvailable()) {
            throw new Error('WeatherAPI key not configured');
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

            const params = {
                key: this.config.apiKey,
                q: location,
                aqi: this.config.params.aqi
            };

            const response = await axios.get(`${this.config.baseUrl}${this.config.endpoints.current}`, {
                params,
                timeout: 10000
            });

            const responseTime = Date.now() - startTime;
            status = 'success';
            
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
            errorMessage = error.response?.data?.error?.message || error.message;
            
            // Update circuit breaker
            this.circuitBreaker.failures++;
            this.circuitBreaker.lastFailureTime = Date.now();
            
            if (this.circuitBreaker.failures >= 5) {
                this.circuitBreaker.state = 'OPEN';
            }

            await loggerService.logQuery(this.name, location, { error: true }, responseTime, status, null, errorMessage);
            
            throw new Error(`WeatherAPI error: ${errorMessage}`);
        }
    }

    async getForecast(location, days = 5) {
        if (!this.isAvailable()) {
            throw new Error('WeatherAPI key not configured');
        }

        const startTime = Date.now();
        let status = 'error';
        let responseData = null;
        let errorMessage = null;

        try {
            const params = {
                key: this.config.apiKey,
                q: location,
                days: Math.min(days, 10), // WeatherAPI free tier supports up to 3 days, paid up to 10
                aqi: this.config.params.aqi
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
            errorMessage = error.response?.data?.error?.message || error.message;
            
            await loggerService.logQuery(this.name, location, { forecast: true, days }, responseTime, status, null, errorMessage);
            
            throw new Error(`WeatherAPI forecast error: ${errorMessage}`);
        }
    }

    transformCurrentWeatherData(data) {
        const current = data.current;
        const location = data.location;

        return {
            location: {
                name: location.name,
                country: location.country,
                region: location.region,
                coordinates: {
                    lat: location.lat,
                    lon: location.lon
                },
                timezone: location.tz_id,
                localtime: location.localtime
            },
            current: {
                temperature: {
                    celsius: Math.round(current.temp_c),
                    fahrenheit: Math.round(current.temp_f),
                    feelsLike: {
                        celsius: Math.round(current.feelslike_c),
                        fahrenheit: Math.round(current.feelslike_f)
                    }
                },
                humidity: current.humidity,
                pressure: {
                    hPa: current.pressure_mb,
                    inHg: current.pressure_in
                },
                visibility: {
                    km: current.vis_km,
                    miles: current.vis_miles
                },
                wind: {
                    speed: {
                        mph: current.wind_mph,
                        kmh: current.wind_kph,
                        mps: Math.round((current.wind_kph / 3.6) * 100) / 100
                    },
                    direction: current.wind_degree,
                    directionText: current.wind_dir,
                    gust: {
                        mph: current.gust_mph,
                        kmh: current.gust_kph
                    }
                },
                weather: {
                    main: current.condition.text,
                    description: current.condition.text,
                    icon: current.condition.icon,
                    code: current.condition.code
                },
                clouds: current.cloud,
                uv: current.uv,
                airQuality: current.air_quality ? {
                    co: current.air_quality.co,
                    no2: current.air_quality.no2,
                    o3: current.air_quality.o3,
                    so2: current.air_quality.so2,
                    pm2_5: current.air_quality.pm2_5,
                    pm10: current.air_quality.pm10,
                    usEpaIndex: current.air_quality['us-epa-index'],
                    gbDefraIndex: current.air_quality['gb-defra-index']
                } : null
            },
            timestamp: new Date().toISOString(),
            source: 'WeatherAPI'
        };
    }

    transformForecastData(data) {
        const location = data.location;
        const forecastDays = data.forecast.forecastday;

        const forecast = forecastDays.map(day => ({
            date: day.date,
            temperature: {
                celsius: {
                    min: Math.round(day.day.mintemp_c),
                    max: Math.round(day.day.maxtemp_c),
                    avg: Math.round(day.day.avgtemp_c)
                },
                fahrenheit: {
                    min: Math.round(day.day.mintemp_f),
                    max: Math.round(day.day.maxtemp_f),
                    avg: Math.round(day.day.avgtemp_f)
                }
            },
            weather: {
                main: day.day.condition.text,
                description: day.day.condition.text,
                icon: day.day.condition.icon,
                code: day.day.condition.code
            },
            humidity: day.day.avghumidity,
            wind: {
                speed: {
                    mph: day.day.maxwind_mph,
                    kmh: day.day.maxwind_kph,
                    mps: Math.round((day.day.maxwind_kph / 3.6) * 100) / 100
                }
            },
            visibility: {
                km: day.day.avgvis_km,
                miles: day.day.avgvis_miles
            },
            uv: day.day.uv,
            precipitation: {
                mm: day.day.totalprecip_mm,
                inches: day.day.totalprecip_in,
                chanceOfRain: day.day.daily_chance_of_rain,
                chanceOfSnow: day.day.daily_chance_of_snow
            },
            sunrise: day.astro.sunrise,
            sunset: day.astro.sunset,
            moonrise: day.astro.moonrise,
            moonset: day.astro.moonset,
            moonPhase: day.astro.moon_phase,
            moonIllumination: day.astro.moon_illumination
        }));

        return {
            location: {
                name: location.name,
                country: location.country,
                region: location.region,
                coordinates: {
                    lat: location.lat,
                    lon: location.lon
                },
                timezone: location.tz_id
            },
            forecast,
            source: 'WeatherAPI'
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

module.exports = new WeatherApiService();