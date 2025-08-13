const express = require('express');
const { param, query } = require('express-validator');
const ComparisonController = require('../controllers/comparisonController');
const rateLimiter = require('../middleware/rateLimiter');

const router = express.Router();

// Apply comparison rate limiter to all routes
router.use(rateLimiter.comparison);

// Compare current weather from all APIs
router.get('/current/:location',
    param('location')
        .notEmpty()
        .withMessage('Location is required')
        .isLength({ min: 2, max: 100 })
        .withMessage('Location must be between 2 and 100 characters'),
    ComparisonController.compareCurrentWeather
);

// Compare forecasts from all APIs
router.get('/forecast/:location',
    param('location')
        .notEmpty()
        .withMessage('Location is required')
        .isLength({ min: 2, max: 100 })
        .withMessage('Location must be between 2 and 100 characters'),
    query('days')
        .optional()
        .isInt({ min: 1, max: 5 })
        .withMessage('Days must be between 1 and 5'),
    ComparisonController.compareForecast
);

// Get historical accuracy data
router.get('/accuracy',
    query('days')
        .optional()
        .isInt({ min: 1, max: 30 })
        .withMessage('Days must be between 1 and 30'),
    ComparisonController.getAccuracyHistory
);

module.exports = router;