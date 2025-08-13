const rateLimit = require('express-rate-limit');
const { rateLimitConfig } = require('../config/apis');

// Create rate limiter with configuration from config
const limiter = rateLimit({
    windowMs: rateLimitConfig.windowMs,
    max: rateLimitConfig.maxRequests,
    message: rateLimitConfig.message,
    standardHeaders: rateLimitConfig.standardHeaders,
    legacyHeaders: rateLimitConfig.legacyHeaders,
    
    // Custom key generator to allow different limits for different endpoints
    keyGenerator: (req) => {
        // Use IP address as default key
        const clientIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
        
        // Could add user-based limiting here if authentication is implemented
        // const userId = req.user?.id;
        // return userId ? `user:${userId}` : `ip:${clientIp}`;
        
        return `ip:${clientIp}`;
    },
    
    // Skip rate limiting for certain conditions
    skip: (req) => {
        // Skip rate limiting for health checks
        if (req.path === '/health') {
            return true;
        }
        
        // Skip for localhost in development
        if (process.env.NODE_ENV === 'development' && 
            (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === 'localhost')) {
            return false; // Set to true to completely skip rate limiting in development
        }
        
        return false;
    },
    
    // Custom handler for when rate limit is exceeded
    handler: (req, res) => {
        const retryAfter = Math.ceil(rateLimitConfig.windowMs / 1000);
        
        res.status(429).json({
            error: 'Rate limit exceeded',
            message: 'Too many requests from this IP, please try again later.',
            retryAfter: `${retryAfter} seconds`,
            limit: rateLimitConfig.maxRequests,
            windowMs: rateLimitConfig.windowMs,
            resetTime: new Date(Date.now() + rateLimitConfig.windowMs).toISOString()
        });
    },
    
    // On limit reached callback for logging
    onLimitReached: (req, res, options) => {
        console.warn(`Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}, Method: ${req.method}`);
        
        // Could log to database here for monitoring
        // loggerService.logRateLimitViolation(req.ip, req.path, req.method);
    }
});

// More restrictive rate limiter for testing endpoints
const testingLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20, // Limit to 20 requests per 5 minutes for testing endpoints
    message: {
        error: 'Testing rate limit exceeded',
        message: 'Too many test requests, please wait before testing again.',
        retryAfter: '5 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    
    handler: (req, res) => {
        res.status(429).json({
            error: 'Testing rate limit exceeded',
            message: 'Too many test requests from this IP. Testing endpoints are limited to prevent API abuse.',
            retryAfter: '5 minutes',
            limit: 20,
            windowMs: 5 * 60 * 1000,
            resetTime: new Date(Date.now() + 5 * 60 * 1000).toISOString()
        });
    }
});

// Even more restrictive limiter for comparison endpoints (which use multiple APIs)
const comparisonLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 10, // Limit to 10 requests per 10 minutes
    message: {
        error: 'Comparison rate limit exceeded',
        message: 'Too many comparison requests, please wait before comparing again.',
        retryAfter: '10 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    
    handler: (req, res) => {
        res.status(429).json({
            error: 'Comparison rate limit exceeded',
            message: 'Comparison endpoints use multiple APIs and are heavily rate limited to prevent quota exhaustion.',
            retryAfter: '10 minutes',
            limit: 10,
            windowMs: 10 * 60 * 1000,
            resetTime: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            suggestion: 'Use individual weather endpoints for frequent requests, and comparison endpoints sparingly.'
        });
    }
});

// Flexible rate limiter factory
const createRateLimiter = (options = {}) => {
    const defaultOptions = {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100,
        message: 'Rate limit exceeded',
        standardHeaders: true,
        legacyHeaders: false
    };
    
    const config = { ...defaultOptions, ...options };
    
    return rateLimit({
        windowMs: config.windowMs,
        max: config.max,
        message: {
            error: 'Rate limit exceeded',
            message: config.message,
            retryAfter: Math.ceil(config.windowMs / 1000) + ' seconds'
        },
        standardHeaders: config.standardHeaders,
        legacyHeaders: config.legacyHeaders,
        
        handler: (req, res) => {
            res.status(429).json({
                error: 'Rate limit exceeded',
                message: config.message,
                retryAfter: Math.ceil(config.windowMs / 1000) + ' seconds',
                limit: config.max,
                windowMs: config.windowMs,
                resetTime: new Date(Date.now() + config.windowMs).toISOString()
            });
        }
    });
};

// Export rate limiters
module.exports = {
    // Default rate limiter for general API endpoints
    general: limiter,
    
    // Specific rate limiters for different endpoint types
    testing: testingLimiter,
    comparison: comparisonLimiter,
    
    // Factory function for custom rate limiters
    create: createRateLimiter,
    
    // Predefined configurations
    strict: createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 50,
        message: 'Strict rate limit exceeded - too many requests'
    }),
    
    loose: createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 200,
        message: 'Rate limit exceeded'
    }),
    
    // Rate limiter for static content (very permissive)
    static: createRateLimiter({
        windowMs: 1 * 60 * 1000, // 1 minute
        max: 1000,
        message: 'Static content rate limit exceeded'
    })
};

// Default export is the general rate limiter
module.exports.default = limiter;