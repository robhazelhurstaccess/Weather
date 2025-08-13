class Weather {
    constructor(data) {
        this.location = data.location || {};
        this.current = data.current || {};
        this.forecast = data.forecast || [];
        this.source = data.source || 'unknown';
        this.timestamp = data.timestamp || new Date().toISOString();
    }

    // Standardize location data
    getStandardizedLocation() {
        return {
            name: this.location.name || 'Unknown',
            country: this.location.country || 'Unknown',
            region: this.location.region || null,
            coordinates: {
                lat: this.location.coordinates?.lat || null,
                lon: this.location.coordinates?.lon || null
            },
            timezone: this.location.timezone || null
        };
    }

    // Standardize current weather data
    getStandardizedCurrent() {
        const current = this.current;
        
        return {
            temperature: {
                celsius: current.temperature?.celsius || null,
                fahrenheit: current.temperature?.fahrenheit || null,
                feelsLike: {
                    celsius: current.temperature?.feelsLike?.celsius || null,
                    fahrenheit: current.temperature?.feelsLike?.fahrenheit || null
                }
            },
            humidity: current.humidity || null,
            pressure: {
                hPa: current.pressure?.hPa || null,
                inHg: current.pressure?.inHg || null
            },
            visibility: {
                km: current.visibility?.km || null,
                miles: current.visibility?.miles || null
            },
            wind: {
                speed: {
                    mps: current.wind?.speed?.mps || null,
                    mph: current.wind?.speed?.mph || null,
                    kmh: current.wind?.speed?.kmh || null
                },
                direction: current.wind?.direction || null,
                directionText: current.wind?.directionText || null,
                gust: current.wind?.gust || null
            },
            weather: {
                main: current.weather?.main || 'Unknown',
                description: current.weather?.description || 'No description',
                icon: current.weather?.icon || null,
                code: current.weather?.code || null
            },
            clouds: current.clouds || null,
            uv: current.uv || null,
            airQuality: current.airQuality || null
        };
    }

    // Standardize forecast data
    getStandardizedForecast() {
        if (!Array.isArray(this.forecast)) {
            return [];
        }

        return this.forecast.map(day => ({
            date: day.date || null,
            temperature: {
                celsius: {
                    min: day.temperature?.celsius?.min || null,
                    max: day.temperature?.celsius?.max || null,
                    avg: day.temperature?.celsius?.avg || null
                },
                fahrenheit: {
                    min: day.temperature?.fahrenheit?.min || null,
                    max: day.temperature?.fahrenheit?.max || null,
                    avg: day.temperature?.fahrenheit?.avg || null
                }
            },
            weather: {
                main: day.weather?.main || 'Unknown',
                description: day.weather?.description || 'No description',
                icon: day.weather?.icon || null
            },
            humidity: day.humidity || null,
            wind: {
                speed: {
                    mps: day.wind?.speed?.mps || null,
                    mph: day.wind?.speed?.mph || null,
                    kmh: day.wind?.speed?.kmh || null
                },
                direction: day.wind?.direction || null
            },
            visibility: {
                km: day.visibility?.km || null,
                miles: day.visibility?.miles || null
            },
            uv: day.uv || null,
            precipitation: day.precipitation || null,
            sunrise: day.sunrise || null,
            sunset: day.sunset || null
        }));
    }

    // Get complete standardized weather object
    getStandardized() {
        // For current weather requests, prioritize current data
        if (this.current && Object.keys(this.current).length > 0 && this.current.temperature) {
            return {
                location: this.getStandardizedLocation(),
                current: this.getStandardizedCurrent(),
                forecast: this.getStandardizedForecast(),
                source: this.source,
                timestamp: this.timestamp
            };
        }
        
        // For forecast-only requests
        if (this.forecast && this.forecast.length > 0) {
            return {
                location: this.getStandardizedLocation(),
                forecast: this.getStandardizedForecast(),
                source: this.source,
                timestamp: this.timestamp
            };
        }
        
        // Default fallback
        return {
            location: this.getStandardizedLocation(),
            current: this.getStandardizedCurrent(),
            forecast: this.getStandardizedForecast(),
            source: this.source,
            timestamp: this.timestamp
        };
    }

    // Validation methods
    isValid() {
        return this.hasValidLocation() && this.hasValidCurrent();
    }

    hasValidLocation() {
        return this.location && 
               this.location.name && 
               this.location.coordinates &&
               typeof this.location.coordinates.lat === 'number' &&
               typeof this.location.coordinates.lon === 'number';
    }

    hasValidCurrent() {
        return this.current && 
               this.current.temperature &&
               typeof this.current.temperature.celsius === 'number';
    }

    hasValidForecast() {
        return Array.isArray(this.forecast) && this.forecast.length > 0;
    }

    // Comparison methods for API data comparison
    compareTemperature(otherWeather) {
        if (!this.hasValidCurrent() || !otherWeather.hasValidCurrent()) {
            return null;
        }

        const thisCelsius = this.current.temperature.celsius;
        const otherCelsius = otherWeather.current.temperature.celsius;
        
        return {
            difference: Math.abs(thisCelsius - otherCelsius),
            thisValue: thisCelsius,
            otherValue: otherCelsius,
            relativeDifference: Math.abs((thisCelsius - otherCelsius) / ((thisCelsius + otherCelsius) / 2)) * 100
        };
    }

    compareHumidity(otherWeather) {
        if (!this.current.humidity || !otherWeather.current.humidity) {
            return null;
        }

        const thisHumidity = this.current.humidity;
        const otherHumidity = otherWeather.current.humidity;
        
        return {
            difference: Math.abs(thisHumidity - otherHumidity),
            thisValue: thisHumidity,
            otherValue: otherHumidity
        };
    }

    comparePressure(otherWeather) {
        if (!this.current.pressure?.hPa || !otherWeather.current.pressure?.hPa) {
            return null;
        }

        const thisPressure = this.current.pressure.hPa;
        const otherPressure = otherWeather.current.pressure.hPa;
        
        return {
            difference: Math.abs(thisPressure - otherPressure),
            thisValue: thisPressure,
            otherValue: otherPressure,
            relativeDifference: Math.abs((thisPressure - otherPressure) / ((thisPressure + otherPressure) / 2)) * 100
        };
    }

    compareWind(otherWeather) {
        if (!this.current.wind?.speed?.mph || !otherWeather.current.wind?.speed?.mph) {
            return null;
        }

        const thisWind = this.current.wind.speed.mph;
        const otherWind = otherWeather.current.wind.speed.mph;
        
        return {
            speedDifference: Math.abs(thisWind - otherWind),
            thisSpeed: thisWind,
            otherSpeed: otherWind,
            directionDifference: this.current.wind.direction && otherWeather.current.wind.direction ?
                Math.abs(this.current.wind.direction - otherWeather.current.wind.direction) : null
        };
    }

    // Get summary statistics for analysis
    getSummaryStats() {
        const current = this.getStandardizedCurrent();
        
        return {
            temperature: {
                celsius: current.temperature.celsius,
                fahrenheit: current.temperature.fahrenheit,
                feelsLike: current.temperature.feelsLike.celsius
            },
            humidity: current.humidity,
            pressure: current.pressure.hPa,
            windSpeed: current.wind.speed.mph,
            visibility: current.visibility.km,
            uv: current.uv,
            weatherCondition: current.weather.main,
            source: this.source,
            timestamp: this.timestamp
        };
    }

    // Convert to JSON for API responses
    toJSON() {
        return this.getStandardized();
    }

    // Static method to create Weather instance from raw API data
    static fromApiData(apiData, source) {
        return new Weather({
            ...apiData,
            source: source
        });
    }

    // Static method to merge multiple weather sources
    static mergeSources(weatherArray) {
        if (!Array.isArray(weatherArray) || weatherArray.length === 0) {
            return null;
        }

        const baseWeather = weatherArray[0];
        const merged = {
            location: baseWeather.getStandardizedLocation(),
            sources: weatherArray.map(w => ({
                name: w.source,
                data: w.getStandardizedCurrent(),
                timestamp: w.timestamp
            })),
            comparison: {
                temperature: Weather.compareMetricAcrossSources(weatherArray, 'temperature'),
                humidity: Weather.compareMetricAcrossSources(weatherArray, 'humidity'),
                pressure: Weather.compareMetricAcrossSources(weatherArray, 'pressure'),
                windSpeed: Weather.compareMetricAcrossSources(weatherArray, 'windSpeed')
            },
            timestamp: new Date().toISOString()
        };

        return merged;
    }

    // Static method to compare a specific metric across multiple sources
    static compareMetricAcrossSources(weatherArray, metric) {
        const values = weatherArray
            .map(weather => {
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
            })
            .filter(value => value !== null && value !== undefined);

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
            median: Weather.calculateMedian(values),
            standardDeviation: Math.round(standardDeviation * 100) / 100,
            variance: Math.round(variance * 100) / 100
        };
    }

    // Helper method to calculate median
    static calculateMedian(values) {
        const sorted = [...values].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        
        if (sorted.length % 2 === 0) {
            return (sorted[middle - 1] + sorted[middle]) / 2;
        } else {
            return sorted[middle];
        }
    }
}

module.exports = Weather;