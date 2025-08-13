const loggerService = require('../services/loggerService');

// Main error handler middleware
const errorHandler = (error, req, res, next) => {
    // Log the error
    console.error('Error occurred:', {
        message: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
    });

    // Determine error type and status code
    let statusCode = 500;
    let errorType = 'Internal Server Error';
    let message = 'An unexpected error occurred';
    let details = null;

    // Handle different types of errors
    if (error.name === 'ValidationError') {
        statusCode = 400;
        errorType = 'Validation Error';
        message = 'Invalid input data';
        details = error.details || error.message;
    } else if (error.name === 'CastError') {
        statusCode = 400;
        errorType = 'Cast Error';
        message = 'Invalid data format';
        details = error.message;
    } else if (error.name === 'UnauthorizedError') {
        statusCode = 401;
        errorType = 'Unauthorized';
        message = 'Authentication required';
    } else if (error.name === 'ForbiddenError') {
        statusCode = 403;
        errorType = 'Forbidden';
        message = 'Access denied';
    } else if (error.name === 'NotFoundError') {
        statusCode = 404;
        errorType = 'Not Found';
        message = 'Resource not found';
    } else if (error.name === 'TimeoutError' || error.code === 'ECONNABORTED') {
        statusCode = 408;
        errorType = 'Request Timeout';
        message = 'Request timed out';
        details = 'The request took too long to complete';
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        statusCode = 503;
        errorType = 'Service Unavailable';
        message = 'External service unavailable';
        details = 'Cannot connect to weather API service';
    } else if (error.name === 'RateLimitError') {
        statusCode = 429;
        errorType = 'Rate Limit Exceeded';
        message = 'Too many requests';
        details = error.message;
    } else if (error.status) {
        // Express validator errors and other errors with status
        statusCode = error.status;
        message = error.message || message;
        errorType = getErrorTypeFromStatus(statusCode);
    } else if (error.response && error.response.status) {
        // Axios errors
        statusCode = error.response.status;
        message = error.response.data?.message || error.message || message;
        errorType = getErrorTypeFromStatus(statusCode);
        details = error.response.data;
    } else if (error.message) {
        // Generic errors with custom messages
        message = error.message;
        
        // Check for specific API error patterns
        if (error.message.includes('API key')) {
            statusCode = 401;
            errorType = 'Authentication Error';
            message = 'Invalid or missing API key';
        } else if (error.message.includes('Circuit breaker')) {
            statusCode = 503;
            errorType = 'Service Unavailable';
            message = 'Service temporarily unavailable due to repeated failures';
        } else if (error.message.includes('rate limit') || error.message.includes('quota')) {
            statusCode = 429;
            errorType = 'Rate Limit Exceeded';
        }
    }

    // Create error response
    const errorResponse = {
        error: {
            type: errorType,
            message: message,
            status: statusCode,
            timestamp: new Date().toISOString(),
            path: req.path,
            method: req.method
        }
    };

    // Add details if available and not in production
    if (details && process.env.NODE_ENV !== 'production') {
        errorResponse.error.details = details;
    }

    // Add stack trace in development
    if (process.env.NODE_ENV === 'development') {
        errorResponse.error.stack = error.stack;
    }

    // Add request ID if available
    if (req.requestId) {
        errorResponse.error.requestId = req.requestId;
    }

    // Log error to our logging service (non-blocking)
    if (loggerService) {
        try {
            loggerService.logQuery(
                'ERROR_HANDLER',
                req.path,
                {
                    method: req.method,
                    error: error.name,
                    message: error.message,
                    statusCode
                },
                0,
                'error',
                null,
                error.message
            ).catch(logError => {
                console.error('Failed to log error:', logError);
            });
        } catch (logError) {
            console.error('Error in error logging:', logError);
        }
    }

    // Send error response
    res.status(statusCode).json(errorResponse);
};

// Helper function to determine error type from status code
function getErrorTypeFromStatus(statusCode) {
    switch (statusCode) {
        case 400: return 'Bad Request';
        case 401: return 'Unauthorized';
        case 403: return 'Forbidden';
        case 404: return 'Not Found';
        case 405: return 'Method Not Allowed';
        case 408: return 'Request Timeout';
        case 409: return 'Conflict';
        case 422: return 'Unprocessable Entity';
        case 429: return 'Too Many Requests';
        case 500: return 'Internal Server Error';
        case 501: return 'Not Implemented';
        case 502: return 'Bad Gateway';
        case 503: return 'Service Unavailable';
        case 504: return 'Gateway Timeout';
        default: return statusCode >= 500 ? 'Server Error' : 'Client Error';
    }
}

// Async error wrapper for route handlers
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

// 404 handler for undefined routes
const notFoundHandler = (req, res, next) => {
    const error = new Error(`Route ${req.method} ${req.originalUrl} not found`);
    error.name = 'NotFoundError';
    error.status = 404;
    next(error);
};

// Validation error handler
const validationErrorHandler = (errors) => {
    const error = new Error('Validation failed');
    error.name = 'ValidationError';
    error.status = 400;
    error.details = errors.array ? errors.array() : errors;
    return error;
};

// API error wrapper for external API calls
const apiErrorHandler = (apiName, error) => {
    const wrappedError = new Error(`${apiName} API Error: ${error.message}`);
    wrappedError.name = 'ExternalAPIError';
    wrappedError.originalError = error;
    
    if (error.response) {
        wrappedError.status = error.response.status;
        wrappedError.response = error.response;
    } else if (error.code === 'ECONNABORTED') {
        wrappedError.name = 'TimeoutError';
        wrappedError.status = 408;
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        wrappedError.status = 503;
    }
    
    return wrappedError;
};

// Circuit breaker error
const circuitBreakerError = (serviceName) => {
    const error = new Error(`Circuit breaker is OPEN for ${serviceName} - service temporarily unavailable`);
    error.name = 'CircuitBreakerError';
    error.status = 503;
    return error;
};

// Rate limit error
const rateLimitError = (message = 'Rate limit exceeded') => {
    const error = new Error(message);
    error.name = 'RateLimitError';
    error.status = 429;
    return error;
};

// API key error
const apiKeyError = (apiName) => {
    const error = new Error(`${apiName} API key not configured or invalid`);
    error.name = 'APIKeyError';
    error.status = 401;
    return error;
};

// Location not found error
const locationNotFoundError = (location) => {
    const error = new Error(`Location '${location}' not found`);
    error.name = 'LocationNotFoundError';
    error.status = 404;
    return error;
};

// Database error wrapper
const databaseErrorHandler = (error) => {
    const wrappedError = new Error('Database operation failed');
    wrappedError.name = 'DatabaseError';
    wrappedError.status = 500;
    wrappedError.originalError = error;
    
    // Handle specific database errors
    if (error.code === 'SQLITE_BUSY') {
        wrappedError.message = 'Database is busy, please try again';
        wrappedError.status = 503;
    } else if (error.code === 'SQLITE_CORRUPT') {
        wrappedError.message = 'Database corruption detected';
        wrappedError.status = 500;
    } else if (error.code === 'SQLITE_READONLY') {
        wrappedError.message = 'Database is read-only';
        wrappedError.status = 503;
    }
    
    return wrappedError;
};

// Export all error handling utilities
module.exports = {
    errorHandler,
    asyncHandler,
    notFoundHandler,
    validationErrorHandler,
    apiErrorHandler,
    circuitBreakerError,
    rateLimitError,
    apiKeyError,
    locationNotFoundError,
    databaseErrorHandler,
    getErrorTypeFromStatus
};

// Default export is the main error handler
module.exports.default = errorHandler;