# Weather Dashboard UK

A comprehensive weather application with dashboard functionality using Node.js, designed for UK users. The application integrates multiple free weather APIs, provides comparison capabilities, and includes robust testing functionality.

## Features

- **Multi-API Integration**: OpenWeatherMap, WeatherAPI, AccuWeather
- **UK-Specific**: Postcode support, UK units, Met Office integration
- **Real-time Dashboard**: Modern dark mode interface
- **API Comparison**: Side-by-side weather data comparison
- **Testing Suite**: Comprehensive API testing and monitoring
- **Query Logging**: All API queries logged with analytics
- **Historical Data**: Trend analysis and data storage

## Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn package manager

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/weather-dashboard-uk.git
cd weather-dashboard-uk
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```
Edit `.env` file with your API keys:
- OpenWeatherMap API key
- WeatherAPI key  
- AccuWeather API key

4. Start the application:
```bash
# Development mode
npm run dev

# Production mode
npm start
```

5. Access the dashboard:
Open your browser and navigate to `http://localhost:3000`

## API Keys Setup

### OpenWeatherMap
1. Visit https://openweathermap.org/api
2. Sign up for free account
3. Get your API key
4. Add to `.env` as `OPENWEATHER_API_KEY=your_key_here`

### WeatherAPI
1. Visit https://www.weatherapi.com/
2. Sign up for free account (1 million calls/month)
3. Get your API key
4. Add to `.env` as `WEATHERAPI_KEY=your_key_here`

### AccuWeather
1. Visit https://developer.accuweather.com/
2. Sign up for free account
3. Get your API key
4. Add to `.env` as `ACCUWEATHER_API_KEY=your_key_here`

## Project Structure

```
Weather/
├── package.json          # Project dependencies and scripts
├── server.js            # Main application entry point
├── config/              # Configuration files
├── routes/              # API route handlers
├── controllers/         # Business logic controllers
├── services/            # External API service integrations
├── models/              # Data models
├── middleware/          # Custom middleware
├── tests/               # Test suites
├── public/              # Static frontend assets
├── views/               # HTML templates
├── logs/                # Query logs and analytics
└── data/                # Historical data storage
```

## Usage

### Dashboard Features
- **Current Weather**: Real-time weather for UK locations
- **API Comparison**: Compare data from multiple weather services
- **Historical Trends**: Weather pattern analysis
- **Location Manager**: Save favorite UK locations
- **API Monitor**: Real-time API status and performance

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### API Endpoints

#### Weather Data
- `GET /api/weather/current/:location` - Current weather
- `GET /api/weather/forecast/:location` - Weather forecast
- `GET /api/weather/compare/:location` - Multi-API comparison

#### Testing
- `GET /api/test/apis` - Test all API endpoints
- `GET /api/test/performance` - API performance metrics
- `POST /api/test/manual` - Manual API testing

#### Logs
- `GET /api/logs/queries` - Query log history
- `GET /api/logs/export` - Export logs (CSV/JSON)

## Troubleshooting

### Common Issues and Solutions

#### Issue 1: App Crashes with "SQLITE_CANTOPEN" Error
**Error Message**: `Error opening database: SQLITE_CANTOPEN: unable to open database file`

**Cause**: Missing `data` directory for SQLite database file

**Solution**:
```bash
# Create required directories
mkdir data
mkdir logs

# On Windows PowerShell:
New-Item -Path "data" -ItemType Directory -Force
New-Item -Path "logs" -ItemType Directory -Force

# Restart the application
npm run dev
```

#### Issue 2: express-rate-limit Deprecation Warning
**Warning**: `The onLimitReached configuration option is deprecated`

**Cause**: Using deprecated option in express-rate-limit v7+

**Solution**: This is just a warning and won't prevent the app from running. The rate limiting still works correctly.

#### Issue 3: Missing Frontend Files (404 errors)
**Error**: Static files (CSS, JS) not loading

**Cause**: Missing `public` directory structure

**Solution**:
```bash
# Create public directory structure
mkdir public\css
mkdir public\js
mkdir public\images

# Files should be present:
# public/css/dashboard.css
# public/js/dashboard.js
# public/js/testing.js
# public/js/comparison.js
```

#### Issue 4: API Keys Not Working
**Error**: "Service unavailable" messages

**Solution**:
1. Verify `.env` file exists (copy from `.env.example`)
2. Add at least one valid API key
3. Restart the application after adding keys

#### Issue 5: Port Already in Use
**Error**: `EADDRINUSE: address already in use`

**Solution**:
```bash
# Change port in .env file
PORT=3001

# Or kill existing process on port 3000
# Windows:
netstat -ano | findstr :3000
taskkill /PID [process_id] /F
```

### Required Directory Structure
Ensure these directories exist in your project root:
```
├── data/           # SQLite database files
├── logs/           # Query and error logs  
├── public/         # Static frontend files
│   ├── css/        # Stylesheets
│   ├── js/         # JavaScript files
│   └── images/     # Image assets
├── views/          # HTML templates
└── node_modules/   # Dependencies (created by npm install)
```

### Quick Setup Verification
```bash
# 1. Check Node.js version
node --version  # Should be v16+

# 2. Verify project structure
dir  # Should show package.json, server.js, etc.

# 3. Install dependencies
npm install

# 4. Create missing directories
mkdir data logs

# 5. Configure environment
copy .env.example .env
# Edit .env with your API keys

# 6. Start application
npm run dev

# 7. Verify startup
# Should see: "Weather Dashboard UK Server running on port 3000"
```

## Configuration

### Environment Variables
```
# Server Configuration
PORT=3000
NODE_ENV=development

# API Keys
OPENWEATHER_API_KEY=your_openweather_key
WEATHERAPI_KEY=your_weatherapi_key
ACCUWEATHER_API_KEY=your_accuweather_key

# Database
DB_PATH=./data/weather.db

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review the API testing interface

## Roadmap

- [ ] Met Office API integration
- [ ] Mobile app development
- [ ] Weather alerts and notifications
- [ ] Advanced analytics dashboard
- [ ] Machine learning weather predictions