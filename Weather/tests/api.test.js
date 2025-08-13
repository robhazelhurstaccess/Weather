const request = require('supertest');
const app = require('../server');

describe('Weather API Endpoints', () => {
    describe('GET /api/weather/current/:location', () => {
        test('should return current weather for valid location', async () => {
            const response = await request(app)
                .get('/api/weather/current/London')
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('data');
            expect(response.body.data).toHaveProperty('location');
            expect(response.body.data).toHaveProperty('current');
            expect(response.body.data.current).toHaveProperty('temperature');
        });

        test('should return 400 for invalid location', async () => {
            const response = await request(app)
                .get('/api/weather/current/a')
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        test('should handle different weather sources', async () => {
            const sources = ['openweather', 'weatherapi', 'accuweather'];
            
            for (const source of sources) {
                const response = await request(app)
                    .get(`/api/weather/current/London?source=${source}`);
                
                if (response.status === 200) {
                    expect(response.body).toHaveProperty('success', true);
                    expect(response.body).toHaveProperty('source');
                } else {
                    // Service might be unavailable (API key not configured)
                    expect(response.status).toBe(503);
                }
            }
        });
    });

    describe('GET /api/weather/forecast/:location', () => {
        test('should return forecast for valid location', async () => {
            const response = await request(app)
                .get('/api/weather/forecast/London')
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('data');
            expect(response.body.data).toHaveProperty('forecast');
            expect(Array.isArray(response.body.data.forecast)).toBe(true);
        });

        test('should respect days parameter', async () => {
            const response = await request(app)
                .get('/api/weather/forecast/London?days=3')
                .expect(200);

            expect(response.body).toHaveProperty('days', 3);
        });
    });

    describe('GET /api/weather/status', () => {
        test('should return service status', async () => {
            const response = await request(app)
                .get('/api/weather/status')
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('services');
            expect(Array.isArray(response.body.services)).toBe(true);
            expect(response.body).toHaveProperty('summary');
        });
    });

    describe('Favorites endpoints', () => {
        test('should get favorites list', async () => {
            const response = await request(app)
                .get('/api/weather/favorites')
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('favorites');
            expect(Array.isArray(response.body.favorites)).toBe(true);
        });

        test('should add location to favorites', async () => {
            const response = await request(app)
                .post('/api/weather/favorites/TestLocation')
                .send({
                    displayName: 'Test Location',
                    postcode: 'TE5T 1NG'
                })
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
        });

        test('should remove location from favorites', async () => {
            // First add a location
            await request(app)
                .post('/api/weather/favorites/TestLocation2')
                .send({ displayName: 'Test Location 2' });

            // Then remove it
            const response = await request(app)
                .delete('/api/weather/favorites/TestLocation2')
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
        });
    });
});

describe('Testing API Endpoints', () => {
    describe('GET /api/test/apis', () => {
        test('should test all APIs', async () => {
            const response = await request(app)
                .get('/api/test/apis?location=London')
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('results');
            expect(response.body).toHaveProperty('summary');
            expect(response.body.summary).toHaveProperty('total');
            expect(response.body.summary).toHaveProperty('successful');
            expect(response.body.summary).toHaveProperty('failed');
        });
    });

    describe('GET /api/test/api/:apiName', () => {
        test('should test specific API', async () => {
            const response = await request(app)
                .get('/api/test/api/openweather?location=London');

            expect(response.body).toHaveProperty('result');
            expect(response.body.result).toHaveProperty('api');
            expect(response.body.result).toHaveProperty('available');
        });

        test('should return 400 for invalid API name', async () => {
            const response = await request(app)
                .get('/api/test/api/invalidapi')
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('POST /api/test/manual', () => {
        test('should run manual test with valid data', async () => {
            const testData = {
                api: 'openweather',
                location: 'London',
                endpoint: 'current'
            };

            const response = await request(app)
                .post('/api/test/manual')
                .send(testData);

            expect(response.body).toHaveProperty('api');
            expect(response.body).toHaveProperty('location');
            expect(response.body).toHaveProperty('endpoint');
        });

        test('should return 400 for missing required fields', async () => {
            const response = await request(app)
                .post('/api/test/manual')
                .send({})
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('GET /api/test/health', () => {
        test('should return system health status', async () => {
            const response = await request(app)
                .get('/api/test/health')
                .expect(200);

            expect(response.body).toHaveProperty('status');
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body).toHaveProperty('uptime');
            expect(response.body).toHaveProperty('services');
            expect(response.body).toHaveProperty('database');
        });
    });
});

describe('Comparison API Endpoints', () => {
    describe('GET /api/comparison/current/:location', () => {
        test('should compare current weather from multiple APIs', async () => {
            const response = await request(app)
                .get('/api/comparison/current/London')
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('location');
            expect(response.body).toHaveProperty('results');
            expect(response.body).toHaveProperty('sources');
            expect(response.body.sources).toHaveProperty('successful');
            expect(response.body.sources).toHaveProperty('total');
        });

        test('should return 400 for missing location', async () => {
            const response = await request(app)
                .get('/api/comparison/current/')
                .expect(404);
        });
    });

    describe('GET /api/comparison/forecast/:location', () => {
        test('should compare forecast from multiple APIs', async () => {
            const response = await request(app)
                .get('/api/comparison/forecast/London?days=3')
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('location');
            expect(response.body).toHaveProperty('days', 3);
            expect(response.body).toHaveProperty('comparison');
        });
    });

    describe('GET /api/comparison/accuracy', () => {
        test('should return accuracy history', async () => {
            const response = await request(app)
                .get('/api/comparison/accuracy?days=7')
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('period');
            expect(response.body).toHaveProperty('accuracy');
        });
    });
});

describe('Rate Limiting', () => {
    test('should respect rate limits on comparison endpoints', async () => {
        // Make multiple requests quickly to test rate limiting
        const requests = Array(12).fill().map(() => 
            request(app).get('/api/comparison/current/London')
        );

        const responses = await Promise.all(requests);
        const rateLimitedResponses = responses.filter(r => r.status === 429);
        
        // Should have some rate limited responses
        expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
});

describe('Error Handling', () => {
    test('should handle invalid routes', async () => {
        const response = await request(app)
            .get('/api/nonexistent')
            .expect(404);

        expect(response.body).toHaveProperty('error');
    });

    test('should handle malformed requests', async () => {
        const response = await request(app)
            .post('/api/test/manual')
            .send('invalid json')
            .set('Content-Type', 'application/json')
            .expect(400);
    });
});

describe('Health Check', () => {
    test('should return system health', async () => {
        const response = await request(app)
            .get('/health')
            .expect(200);

        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body).toHaveProperty('uptime');
    });
});

describe('API Documentation', () => {
    test('should return API documentation', async () => {
        const response = await request(app)
            .get('/api')
            .expect(200);

        expect(response.body).toHaveProperty('name');
        expect(response.body).toHaveProperty('version');
        expect(response.body).toHaveProperty('endpoints');
    });
});