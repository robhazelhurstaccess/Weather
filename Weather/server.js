const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
require('dotenv').config();

// Import routes
const weatherRoutes = require('./routes/weather');
const testingRoutes = require('./routes/testing');
const comparisonRoutes = require('./routes/comparison');

// Import middleware
const rateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');

// Import services
const loggerService = require('./services/loggerService');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

// CORS configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://yourdomain.com'] 
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));

// General middleware
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use('/api', rateLimiter.general);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/weather', weatherRoutes);
app.use('/api/test', testingRoutes);
app.use('/api/comparison', comparisonRoutes);

// Serve dashboard views
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.get('/testing', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'testing.html'));
});

app.get('/comparison', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'comparison.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// API documentation endpoint
app.get('/api', (req, res) => {
    res.json({
        name: 'Weather Dashboard UK API',
        version: '1.0.0',
        description: 'Comprehensive weather API with multi-provider integration',
        endpoints: {
            weather: {
                current: 'GET /api/weather/current/:location',
                forecast: 'GET /api/weather/forecast/:location',
                historical: 'GET /api/weather/historical/:location'
            },
            testing: {
                apis: 'GET /api/test/apis',
                performance: 'GET /api/test/performance',
                manual: 'POST /api/test/manual'
            },
            comparison: {
                current: 'GET /api/comparison/current/:location',
                accuracy: 'GET /api/comparison/accuracy/:location'
            }
        },
        status: 'Active',
        lastUpdated: new Date().toISOString()
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist`,
        availableEndpoints: [
            'GET /',
            'GET /testing',
            'GET /comparison',
            'GET /api',
            'GET /health'
        ]
    });
});

// Error handling middleware
app.use(errorHandler.errorHandler);

// Initialize services
async function initializeApp() {
    try {
        // Initialize logger service
        await loggerService.initialize();
        
        // Start server
        const server = app.listen(PORT, () => {
            console.log(`🌤️  Weather Dashboard UK Server running on port ${PORT}`);
            console.log(`📊 Dashboard: http://localhost:${PORT}`);
            console.log(`🧪 Testing: http://localhost:${PORT}/testing`);
            console.log(`📈 Comparison: http://localhost:${PORT}/comparison`);
            console.log(`🔍 API Documentation: http://localhost:${PORT}/api`);
            console.log(`💓 Health Check: http://localhost:${PORT}/health`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('SIGTERM received, shutting down gracefully');
            server.close(() => {
                console.log('Process terminated');
                process.exit(0);
            });
        });

        process.on('SIGINT', () => {
            console.log('SIGINT received, shutting down gracefully');
            server.close(() => {
                console.log('Process terminated');
                process.exit(0);
            });
        });

    } catch (error) {
        console.error('Failed to initialize application:', error);
        process.exit(1);
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Start the application
initializeApp();

module.exports = app;