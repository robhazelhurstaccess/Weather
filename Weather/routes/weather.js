const express = require('express');
const { param, query } = require('express-validator');
const WeatherController = require('../controllers/weatherController');
const rateLimiter = require('../middleware/rateLimiter');

const router = express.Router();

// Validation middleware
const locationValidation = WeatherController.locationValidation;
const queryValidation = WeatherController.queryValidation;

// Routes for current weather
router.get('/current/:location', 
    locationValidation,
    queryValidation,
    WeatherController.getCurrentWeather
);

// Routes for weather forecast
router.get('/forecast/:location',
    locationValidation,
    queryValidation,
    query('days')
        .optional()
        .isInt({ min: 1, max: 10 })
        .withMessage('Days must be between 1 and 10'),
    WeatherController.getForecast
);

// Route to get weather from all available APIs
router.get('/all/:location',
    rateLimiter.comparison, // More restrictive rate limiting
    locationValidation,
    queryValidation,
    WeatherController.getAllCurrentWeather
);

// Route for historical weather (placeholder)
router.get('/historical/:location',
    locationValidation,
    query('date')
        .notEmpty()
        .withMessage('Date is required')
        .isISO8601()
        .withMessage('Date must be in ISO 8601 format (YYYY-MM-DD)'),
    WeatherController.getHistoricalWeather
);

// Favorite locations routes
router.post('/favorites/:location',
    locationValidation,
    WeatherController.addFavoriteLocation
);

router.get('/favorites',
    WeatherController.getFavoriteLocations
);

router.delete('/favorites/:location',
    locationValidation,
    WeatherController.removeFavoriteLocation
);

// Service status route
router.get('/status',
    WeatherController.getServiceStatus
);

module.exports = router;