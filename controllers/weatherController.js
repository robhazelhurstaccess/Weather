const { body, param, query, validationResult } = require('express-validator');
const openWeatherService = require('../services/openWeatherService');
const weatherApiService = require('../services/weatherApiService');
const accuWeatherService = require('../services/accuWeatherService');
const Weather = require('../models/Weather');
const database = require('../config/database');
const { ukConfig } = require('../config/apis');
const { asyncHandler, validationErrorHandler, locationNotFoundError } = require('../middleware/errorHandler');

class WeatherController {
    // Validation rules
    static locationValidation = [
        param('location')
            .notEmpty()
            .withMessage('Location is required')
            .isLength({ min: 2, max: 100 })
            .withMessage('Location must be between 2 and 100 characters')
            .matches(/^[a-zA-Z0-9\s,.-]+$/)
            .withMessage('Location contains invalid characters')
    ];

    static queryValidation = [
        query('units')
            .optional()
            .isIn(['metric', 'imperial'])
            .withMessage('Units must be either metric or imperial'),
        query('lang')
            .optional()
            .isLength({ min: 2, max: 5 })
            .withMessage('Language code must be 2-5 characters')
    ];

    // Get current weather from single API
    static getCurrentWeather = asyncHandler(async (req, res) => {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            throw validationErrorHandler(errors);
        }

        const { location } = req.params;
        const { source = 'openweather' } = req.query;

        // Validate and clean location
        const cleanLocation = WeatherController.cleanLocation(location);
        
        let weatherData;
        let service;

        // Determine which service to use
        switch (source.toLowerCase()) {
            case 'openweather':
            case 'openweathermap':
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
                    error: 'Invalid weather source',
                    message: `Source '${source}' is not supported`,
                    supportedSources: ['openweather', 'weatherapi', 'accuweather']
                });
        }

        // Check if service is available
        if (!service.isAvailable()) {
            return res.status(503).json({
                error: 'Service unavailable',
                message: `${service.name} is not available (API key not configured)`,
                source: service.name
            });
        }

        try {
            // Get weather data
            const rawData = await service.getCurrentWeather(cleanLocation);
            weatherData = new Weather(rawData);

            // Validate the response
            if (!weatherData.isValid()) {
                throw locationNotFoundError(cleanLocation);
            }

            res.json({
                success: true,
                data: weatherData.getStandardized(),
                source: service.name,
                location: cleanLocation,
                timestamp: new Date().toISOString(),
                cached: false // Services handle caching internally
            });

        } catch (error) {
            console.error(`Error getting weather from ${service.name}:`, error.message);
            throw error;
        }
    });

    // Get weather forecast from single API
    static getForecast = asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            throw validationErrorHandler(errors);
        }

        const { location } = req.params;
        const { source = 'openweather', days = 5 } = req.query;
        
        const cleanLocation = WeatherController.cleanLocation(location);
        
        // Validate days parameter
        const forecastDays = Math.min(Math.max(parseInt(days) || 5, 1), 10);

        let service;
        switch (source.toLowerCase()) {
            case 'openweather':
            case 'openweathermap':
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
                    error: 'Invalid weather source',
                    supportedSources: ['openweather', 'weatherapi', 'accuweather']
                });
        }

        if (!service.isAvailable()) {
            return res.status(503).json({
                error: 'Service unavailable',
                message: `${service.name} is not available`,
                source: service.name
            });
        }

        try {
            const rawData = await service.getForecast(cleanLocation, forecastDays);
            const weatherData = new Weather(rawData);

            res.json({
                success: true,
                data: weatherData.getStandardized(),
                source: service.name,
                location: cleanLocation,
                days: forecastDays,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error(`Error getting forecast from ${service.name}:`, error.message);
            throw error;
        }
    });

    // Get current weather from all available APIs for comparison
    static getAllCurrentWeather = asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            throw validationErrorHandler(errors);
        }

        const { location } = req.params;
        const cleanLocation = WeatherController.cleanLocation(location);

        const services = [
            { name: 'OpenWeatherMap', service: openWeatherService },
            { name: 'WeatherAPI', service: weatherApiService },
            { name: 'AccuWeather', service: accuWeatherService }
        ];

        const results = [];
        const apiErrors = [];

        // Fetch from all available services
        await Promise.allSettled(
            services.map(async ({ name, service }) => {
                if (!service.isAvailable()) {
                    apiErrors.push({
                        source: name,
                        error: 'Service not available (API key not configured)'
                    });
                    return;
                }

                try {
                    const data = await service.getCurrentWeather(cleanLocation);
                    const weather = new Weather(data);
                    
                    if (weather.isValid()) {
                        results.push({
                            source: name,
                            data: weather.getStandardized(),
                            success: true
                        });
                    } else {
                        apiErrors.push({
                            source: name,
                            error: 'Invalid weather data received'
                        });
                    }
                } catch (error) {
                    apiErrors.push({
                        source: name,
                        error: error.message
                    });
                }
            })
        );

        if (results.length === 0) {
            return res.status(503).json({
                error: 'No weather data available',
                message: 'All weather services failed or are unavailable',
                location: cleanLocation,
                errors: apiErrors
            });
        }

        // Create comparison data
        const weatherObjects = results.map(r => new Weather(r.data));
        const comparison = Weather.mergeSources(weatherObjects);

        res.json({
            success: true,
            location: cleanLocation,
            results: results,
            comparison: comparison,
            errors: apiErrors.length > 0 ? apiErrors : undefined,
            timestamp: new Date().toISOString(),
            totalSources: services.length,
            successfulSources: results.length,
            failedSources: apiErrors.length
        });
    });

    // Get historical weather data (if supported)
    static getHistoricalWeather = asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            throw validationErrorHandler(errors);
        }

        const { location } = req.params;
        const { date, source = 'weatherapi' } = req.query;
        const cleanLocation = WeatherController.cleanLocation(location);

        // Validate date
        if (!date) {
            return res.status(400).json({
                error: 'Date parameter required',
                message: 'Please provide a date in YYYY-MM-DD format'
            });
        }

        const targetDate = new Date(date);
        if (isNaN(targetDate.getTime())) {
            return res.status(400).json({
                error: 'Invalid date format',
                message: 'Date must be in YYYY-MM-DD format'
            });
        }

        // Currently only WeatherAPI supports historical data easily
        if (source !== 'weatherapi') {
            return res.status(400).json({
                error: 'Historical data not supported',
                message: 'Historical weather data is currently only available from WeatherAPI',
                supportedSources: ['weatherapi']
            });
        }

        if (!weatherApiService.isAvailable()) {
            return res.status(503).json({
                error: 'WeatherAPI unavailable',
                message: 'WeatherAPI service is not available'
            });
        }

        // Note: Historical data endpoint would need to be implemented in weatherApiService
        res.status(501).json({
            error: 'Feature not implemented',
            message: 'Historical weather data endpoint is not yet implemented',
            plannedFeature: true
        });
    });

    // Add location to favorites
    static addFavoriteLocation = asyncHandler(async (req, res) => {
        const { location } = req.params;
        const { displayName, postcode } = req.body;
        
        const cleanLocation = WeatherController.cleanLocation(location);
        const cleanDisplayName = displayName || cleanLocation;

        try {
            // Try to get coordinates from one of the services
            let coordinates = null;
            if (openWeatherService.isAvailable()) {
                try {
                    const weatherData = await openWeatherService.getCurrentWeather(cleanLocation);
                    coordinates = weatherData.location?.coordinates;
                } catch (error) {
                    // Ignore error, coordinates are optional
                }
            }

            const result = await database.addFavoriteLocation(
                cleanLocation,
                cleanDisplayName,
                postcode,
                coordinates?.lat,
                coordinates?.lon
            );

            res.json({
                success: true,
                message: 'Location added to favorites',
                location: {
                    id: result,
                    location: cleanLocation,
                    displayName: cleanDisplayName,
                    postcode: postcode,
                    coordinates: coordinates
                }
            });

        } catch (error) {
            console.error('Error adding favorite location:', error);
            throw error;
        }
    });

    // Get favorite locations
    static getFavoriteLocations = asyncHandler(async (req, res) => {
        try {
            const favorites = await database.getFavoriteLocations();
            
            res.json({
                success: true,
                favorites: favorites,
                count: favorites.length
            });

        } catch (error) {
            console.error('Error getting favorite locations:', error);
            throw error;
        }
    });

    // Remove location from favorites
    static removeFavoriteLocation = asyncHandler(async (req, res) => {
        const { location } = req.params;
        const cleanLocation = WeatherController.cleanLocation(location);

        try {
            const result = await database.removeFavoriteLocation(cleanLocation);
            
            if (result === 0) {
                return res.status(404).json({
                    error: 'Location not found',
                    message: 'Location not found in favorites'
                });
            }

            res.json({
                success: true,
                message: 'Location removed from favorites',
                location: cleanLocation
            });

        } catch (error) {
            console.error('Error removing favorite location:', error);
            throw error;
        }
    });

    // Helper method to clean and validate location input
    static cleanLocation(location) {
        if (!location) {
            throw new Error('Location is required');
        }

        // Basic cleaning
        let cleaned = location.trim();
        
        // Check if it's a UK postcode
        if (ukConfig.postcodeRegex.test(cleaned)) {
            // Format postcode properly
            cleaned = cleaned.toUpperCase().replace(/\s+/g, ' ');
            // Ensure proper spacing for UK postcodes
            if (cleaned.length > 3 && !cleaned.includes(' ')) {
                cleaned = cleaned.slice(0, -3) + ' ' + cleaned.slice(-3);
            }
            
            // Convert postcode to nearest major city for API compatibility
            const nearbyCity = WeatherController.getNearbyCityForPostcode(cleaned);
            console.log(`Postcode ${cleaned} mapped to ${nearbyCity}`);
            return nearbyCity;
        }

        // Remove extra whitespace and limit length
        cleaned = cleaned.replace(/\s+/g, ' ').substring(0, 100);

        if (cleaned.length < 2) {
            throw new Error('Location must be at least 2 characters long');
        }

        return cleaned;
    }
    
    // Map UK postcodes to nearby major cities that APIs recognize
    static getNearbyCityForPostcode(postcode) {
        const postcodeAreas = {
            // London areas
            'E': 'London', 'EC': 'London', 'N': 'London', 'NW': 'London',
            'SE': 'London', 'SW': 'London', 'W': 'London', 'WC': 'London',
            
            // Major UK cities by postcode prefix
            'B': 'Birmingham',      // Birmingham
            'M': 'Manchester',      // Manchester  
            'L': 'Liverpool',       // Liverpool
            'LS': 'Leeds',          // Leeds
            'S': 'Sheffield',       // Sheffield
            'NG': 'Nottingham',     // Nottingham
            'LE': 'Leicester',      // Leicester - THIS IS YOUR POSTCODE!
            'CV': 'Coventry',       // Coventry
            'DE': 'Derby',          // Derby
            'DN': 'Doncaster',      // Doncaster
            'HD': 'Huddersfield',   // Huddersfield
            'HU': 'Hull',           // Hull
            'NE': 'Newcastle',      // Newcastle
            'SR': 'Sunderland',     // Sunderland
            'TS': 'Middlesbrough',  // Middlesbrough
            'YO': 'York',           // York
            'BD': 'Bradford',       // Bradford
            'HG': 'Harrogate',      // Harrogate
            'WF': 'Wakefield',      // Wakefield
            'OL': 'Oldham',         // Oldham
            'SK': 'Stockport',      // Stockport
            'WA': 'Warrington',     // Warrington
            'WN': 'Wigan',          // Wigan
            'BL': 'Bolton',         // Bolton
            'BB': 'Blackburn',      // Blackburn
            'PR': 'Preston',        // Preston
            'FY': 'Blackpool',      // Blackpool
            'LA': 'Lancaster',      // Lancaster
            'CA': 'Carlisle',       // Carlisle
            'DL': 'Darlington',     // Darlington
            'DH': 'Durham',         // Durham
            'NR': 'Norwich',        // Norwich
            'IP': 'Ipswich',        // Ipswich
            'CB': 'Cambridge',      // Cambridge
            'PE': 'Peterborough',   // Peterborough
            'NN': 'Northampton',    // Northampton
            'MK': 'Milton Keynes',  // Milton Keynes
            'LU': 'Luton',          // Luton
            'AL': 'St Albans',      // St Albans
            'HP': 'Hemel Hempstead', // Hemel Hempstead
            'SL': 'Slough',         // Slough
            'RG': 'Reading',        // Reading
            'OX': 'Oxford',         // Oxford
            'SN': 'Swindon',        // Swindon
            'BA': 'Bath',           // Bath
            'BS': 'Bristol',        // Bristol
            'GL': 'Gloucester',     // Gloucester
            'HR': 'Hereford',       // Hereford
            'WR': 'Worcester',      // Worcester
            'DY': 'Dudley',         // Dudley
            'WV': 'Wolverhampton',  // Wolverhampton
            'WS': 'Walsall',        // Walsall
            'ST': 'Stoke-on-Trent', // Stoke-on-Trent
            'TF': 'Telford',        // Telford
            'SY': 'Shrewsbury',     // Shrewsbury
            'CH': 'Chester',        // Chester
            'CW': 'Crewe',          // Crewe
            'CF': 'Cardiff',        // Cardiff
            'NP': 'Newport',        // Newport
            'SA': 'Swansea',        // Swansea
            'LD': 'Llandrindod Wells', // Llandrindod Wells
            'SY': 'Shrewsbury',     // Shrewsbury
            'LL': 'Llandudno',      // Llandudno
            'AB': 'Aberdeen',       // Aberdeen
            'DD': 'Dundee',         // Dundee
            'EH': 'Edinburgh',      // Edinburgh
            'FK': 'Falkirk',        // Falkirk
            'G': 'Glasgow',         // Glasgow
            'IV': 'Inverness',      // Inverness
            'KA': 'Kilmarnock',     // Kilmarnock
            'KY': 'Kirkcaldy',      // Kirkcaldy
            'ML': 'Motherwell',     // Motherwell
            'PA': 'Paisley',        // Paisley
            'PH': 'Perth',          // Perth
            'BT': 'Belfast',        // Belfast - Northern Ireland
        };
        
        // Extract postcode area (first 1-2 letters)
        const area = postcode.match(/^([A-Z]{1,2})/)?.[1];
        
        if (area && postcodeAreas[area]) {
            return postcodeAreas[area];
        }
        
        // If no match found, try to extract from longer prefixes
        const longerArea = postcode.match(/^([A-Z]{1,2}[0-9]{1,2})/)?.[1];
        if (longerArea && postcodeAreas[longerArea]) {
            return postcodeAreas[longerArea];
        }
        
        // Default fallback
        return 'United Kingdom';
    }

    // Get weather service status
    static getServiceStatus = asyncHandler(async (req, res) => {
        const services = [
            { name: 'OpenWeatherMap', service: openWeatherService },
            { name: 'WeatherAPI', service: weatherApiService },
            { name: 'AccuWeather', service: accuWeatherService }
        ];

        const status = await Promise.all(
            services.map(async ({ name, service }) => {
                const available = service.isAvailable();
                let testResult = null;

                if (available) {
                    try {
                        testResult = await service.testConnection();
                    } catch (error) {
                        testResult = {
                            success: false,
                            error: error.message
                        };
                    }
                }

                return {
                    name: name,
                    available: available,
                    configured: !!service.config.apiKey,
                    test: testResult
                };
            })
        );

        const availableCount = status.filter(s => s.available).length;
        
        res.json({
            success: true,
            services: status,
            summary: {
                total: services.length,
                available: availableCount,
                unavailable: services.length - availableCount
            },
            timestamp: new Date().toISOString()
        });
    });
}

module.exports = WeatherController;