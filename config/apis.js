const apiConfig = {
    openWeather: {
        name: 'OpenWeatherMap',
        baseUrl: 'https://api.openweathermap.org/data/2.5',
        apiKey: process.env.OPENWEATHER_API_KEY,
        rateLimit: {
            requests: 1000,
            period: 'day'
        },
        endpoints: {
            current: '/weather',
            forecast: '/forecast',
            historical: '/onecall/timemachine'
        },
        params: {
            units: 'metric',
            lang: 'en'
        }
    },
    
    weatherApi: {
        name: 'WeatherAPI',
        baseUrl: 'https://api.weatherapi.com/v1',
        apiKey: process.env.WEATHERAPI_KEY,
        rateLimit: {
            requests: 1000000,
            period: 'month'
        },
        endpoints: {
            current: '/current.json',
            forecast: '/forecast.json',
            historical: '/history.json'
        },
        params: {
            aqi: 'yes'
        }
    },
    
    accuWeather: {
        name: 'AccuWeather',
        baseUrl: 'http://dataservice.accuweather.com',
        apiKey: process.env.ACCUWEATHER_API_KEY,
        rateLimit: {
            requests: 50,
            period: 'day'
        },
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
};

// UK-specific configuration
const ukConfig = {
    defaultLocations: [
        'London',
        'Manchester',
        'Birmingham',
        'Liverpool',
        'Leeds',
        'Sheffield',
        'Bristol',
        'Newcastle',
        'Nottingham',
        'Leicester'
    ],
    
    postcodeRegex: /^[A-Z]{1,2}[0-9R][0-9A-Z]? [0-9][ABD-HJLNP-UW-Z]{2}$/i,
    
    units: {
        temperature: {
            primary: 'celsius',
            secondary: 'fahrenheit'
        },
        windSpeed: {
            primary: 'mph',
            secondary: 'kmh'
        },
        pressure: {
            primary: 'hPa',
            secondary: 'inHg'
        },
        visibility: {
            primary: 'miles',
            secondary: 'km'
        }
    },
    
    timezone: 'Europe/London'
};

// Cache configuration
const cacheConfig = {
    ttl: {
        current: 5, // minutes
        forecast: 30, // minutes
        historical: 1440 // minutes (24 hours)
    },
    maxSize: 1000, // maximum number of cached entries
    cleanupInterval: 3600000 // 1 hour in milliseconds
};

// Rate limiting configuration
const rateLimitConfig = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
};

// Logging configuration
const loggingConfig = {
    level: process.env.LOG_LEVEL || 'info',
    format: 'combined',
    queryLog: {
        enabled: process.env.LOG_QUERIES === 'true',
        format: '[{timestamp}] {apiName} | {location} | {queryParams} | {responseTime}ms | {status}',
        rotation: {
            enabled: true,
            maxSize: '10m',
            maxFiles: '7d'
        }
    }
};

// API timeout configuration
const timeoutConfig = {
    request: 10000, // 10 seconds
    connection: 5000 // 5 seconds
};

// Error handling configuration
const errorConfig = {
    retryAttempts: 3,
    retryDelay: 1000, // milliseconds
    circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 60000 // 1 minute
    }
};

// Export all configurations
module.exports = {
    apiConfig,
    ukConfig,
    cacheConfig,
    rateLimitConfig,
    loggingConfig,
    timeoutConfig,
    errorConfig,
    
    // Helper functions
    getApiConfig: (apiName) => {
        const configs = {
            'openweather': apiConfig.openWeather,
            'weatherapi': apiConfig.weatherApi,
            'accuweather': apiConfig.accuWeather
        };
        return configs[apiName.toLowerCase()] || null;
    },
    
    isValidPostcode: (postcode) => {
        return ukConfig.postcodeRegex.test(postcode);
    },
    
    isValidApiKey: (apiName) => {
        const config = module.exports.getApiConfig(apiName);
        return config && config.apiKey && config.apiKey !== 'your_api_key_here';
    },
    
    getAllApiNames: () => {
        return Object.keys(apiConfig).map(key => apiConfig[key].name);
    },
    
    getValidApis: () => {
        return Object.keys(apiConfig)
            .map(key => apiConfig[key])
            .filter(config => config.apiKey && config.apiKey !== 'your_api_key_here');
    }
};