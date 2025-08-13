const express = require('express');
const { param, body } = require('express-validator');
const TestController = require('../controllers/testController');
const rateLimiter = require('../middleware/rateLimiter');

const router = express.Router();

// Apply testing rate limiter to all routes
router.use(rateLimiter.testing);

// Test all APIs
router.get('/apis',
    TestController.testAllApis
);

// Test specific API
router.get('/api/:apiName',
    param('apiName')
        .notEmpty()
        .withMessage('API name is required')
        .isIn(['openweather', 'openweathermap', 'weatherapi', 'accuweather'])
        .withMessage('Invalid API name'),
    TestController.testSpecificApi
);

// Get performance metrics
router.get('/performance',
    TestController.getPerformanceMetrics
);

// Manual API test
router.post('/manual',
    body('api')
        .notEmpty()
        .withMessage('API name is required')
        .isIn(['openweather', 'weatherapi', 'accuweather'])
        .withMessage('Invalid API name'),
    body('location')
        .notEmpty()
        .withMessage('Location is required')
        .isLength({ min: 2, max: 100 })
        .withMessage('Location must be between 2 and 100 characters'),
    body('endpoint')
        .optional()
        .isIn(['current', 'forecast'])
        .withMessage('Endpoint must be either current or forecast'),
    TestController.manualTest
);

// System health check
router.get('/health',
    TestController.getSystemHealth
);

module.exports = router;