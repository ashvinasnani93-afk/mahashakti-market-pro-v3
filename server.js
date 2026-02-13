require('dotenv').config();

const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const authService = require('./services/auth.service');
const scannerService = require('./services/scanner.service');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

app.use('/api', routes);

app.get('/', (req, res) => {
    res.json({
        name: 'MAHASHAKTI V3',
        status: 'running',
        version: '3.0.0',
        description: 'Production Sniper Backend for Stock Market Analysis',
        api: '/api'
    });
});

app.use((err, req, res, next) => {
    console.error('[ERROR]', err.message);
    res.status(500).json({
        success: false,
        error: err.message
    });
});

async function startServer() {
    console.log('=======================================');
    console.log('   MAHASHAKTI V3 - Sniper Backend');
    console.log('=======================================');
    console.log('');

    try {
        console.log('[STARTUP] Authenticating with Angel One...');
        await authService.login();
        console.log('[STARTUP] Authentication successful');

        console.log('[STARTUP] Initializing scanner...');
        await scannerService.initialize();
        console.log('[STARTUP] Scanner initialized');

        console.log('[STARTUP] Starting market scanner...');
        await scannerService.start();
        console.log('[STARTUP] Scanner started');

        app.listen(PORT, '0.0.0.0', () => {
            console.log('');
            console.log(`[SERVER] Running on port ${PORT}`);
            console.log(`[SERVER] API: http://localhost:${PORT}/api`);
            console.log(`[SERVER] Status: http://localhost:${PORT}/api/status`);
            console.log('');
            console.log('=======================================');
            console.log('   READY FOR MARKET OPERATIONS');
            console.log('=======================================');
        });

    } catch (error) {
        console.error('[STARTUP] Error:', error.message);
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`[SERVER] Running on port ${PORT} (limited mode)`);
            console.log('[SERVER] Auth failed - manual reconnection required');
        });
    }
}

process.on('SIGINT', () => {
    console.log('\n[SHUTDOWN] Received SIGINT');
    scannerService.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[SHUTDOWN] Received SIGTERM');
    scannerService.stop();
    process.exit(0);
});

startServer();
