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
        description: 'Production Sniper Backend - Institutional Grade Market Analysis',
        modules: [
            'Market Scanner Engine',
            'Ranking Engine',
            'Focus WebSocket Manager',
            'Institutional Layer (OI, PCR, Breadth, Sector)',
            'Market Regime Engine',
            'Multi Timeframe Indicator Engine',
            'Explosion Engine (Stocks + Options)',
            'Risk-Reward Engine',
            'Safety Layer',
            'Signal Orchestrator'
        ],
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
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                                                           ║');
    console.log('║   ███╗   ███╗ █████╗ ██╗  ██╗ █████╗ ███████╗██╗  ██╗   ║');
    console.log('║   ████╗ ████║██╔══██╗██║  ██║██╔══██╗██╔════╝██║ ██╔╝   ║');
    console.log('║   ██╔████╔██║███████║███████║███████║███████╗█████╔╝    ║');
    console.log('║   ██║╚██╔╝██║██╔══██║██╔══██║██╔══██║╚════██║██╔═██╗    ║');
    console.log('║   ██║ ╚═╝ ██║██║  ██║██║  ██║██║  ██║███████║██║  ██╗   ║');
    console.log('║   ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝   ║');
    console.log('║                                                           ║');
    console.log('║              V3 - PRODUCTION SNIPER BACKEND              ║');
    console.log('║                                                           ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');

    try {
        console.log('[STARTUP] Authenticating with Angel One...');
        await authService.login();
        console.log('[STARTUP] ✓ Authentication successful');

        console.log('[STARTUP] Initializing market scanner...');
        await scannerService.initialize();
        console.log('[STARTUP] ✓ Scanner initialized');

        console.log('[STARTUP] Starting market scan...');
        await scannerService.start();
        console.log('[STARTUP] ✓ Scanner running');

        app.listen(PORT, '0.0.0.0', () => {
            console.log('');
            console.log('╔═══════════════════════════════════════════════════════════╗');
            console.log(`║   SERVER RUNNING ON PORT ${PORT}                            ║`);
            console.log('║                                                           ║');
            console.log(`║   API:    http://localhost:${PORT}/api                      ║`);
            console.log(`║   Status: http://localhost:${PORT}/api/status               ║`);
            console.log('║                                                           ║');
            console.log('║   MODULES ACTIVE:                                         ║');
            console.log('║   • Market Scanner Engine                                 ║');
            console.log('║   • Ranking Engine                                        ║');
            console.log('║   • Focus WebSocket Manager (50 max)                      ║');
            console.log('║   • Institutional Layer                                   ║');
            console.log('║   • Market Regime Engine                                  ║');
            console.log('║   • Multi Timeframe Indicators                            ║');
            console.log('║   • Explosion Engine                                      ║');
            console.log('║   • Risk-Reward Engine                                    ║');
            console.log('║   • Safety Layer                                          ║');
            console.log('║   • Signal Orchestrator                                   ║');
            console.log('║                                                           ║');
            console.log('╚═══════════════════════════════════════════════════════════╝');
            console.log('');
        });

    } catch (error) {
        console.error('[STARTUP] Error:', error.message);
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`[SERVER] Running on port ${PORT} (LIMITED MODE)`);
            console.log('[SERVER] Authentication failed - manual reconnection required');
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

process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION]', reason);
});

startServer();
