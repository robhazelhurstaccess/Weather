// Test setup file
process.env.NODE_ENV = 'test';

// Suppress console output during tests unless debugging
if (!process.env.DEBUG_TESTS) {
    global.console = {
        ...console,
        log: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    };
}

// Global test utilities
global.testUtils = {
    createMockWeatherData: () => ({
        location: {
            name: 'Test City',
            country: 'Test Country',
            coordinates: { lat: 51.5, lon: -0.1 }
        },
        current: {
            temperature: { celsius: 20, fahrenheit: 68 },
            humidity: 65,
            pressure: { hPa: 1013 },
            wind: { speed: { mph: 10 } },
            weather: { main: 'Clear', description: 'clear sky' }
        },
        timestamp: new Date().toISOString(),
        source: 'Test'
    }),
    
    delay: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};

// Increase timeout for integration tests
jest.setTimeout(30000);