const express = require('express');
const router = express.Router();

const statusRoutes = require('./status.routes');
const scannerRoutes = require('./scanner.routes');
const signalRoutes = require('./signal.routes');
const regimeRoutes = require('./regime.routes');

router.use('/status', statusRoutes);
router.use('/scanner', scannerRoutes);
router.use('/signal', signalRoutes);
router.use('/regime', regimeRoutes);

router.get('/', (req, res) => {
    res.json({
        name: 'MAHASHAKTI V3 API',
        version: '3.0.0',
        description: 'Production Sniper Backend - Institutional Grade Market Analysis',
        endpoints: {
            status: {
                info: 'GET /api/status',
                health: 'GET /api/status/health'
            },
            scanner: {
                results: 'GET /api/scanner/results',
                explosions: 'GET /api/scanner/explosions',
                rankings: 'GET /api/scanner/rankings',
                rankingsBullish: 'GET /api/scanner/rankings/bullish',
                rankingsBearish: 'GET /api/scanner/rankings/bearish',
                instrument: 'GET /api/scanner/instrument/:token',
                all: 'GET /api/scanner/all',
                watchlist: 'GET /api/scanner/watchlist',
                institutional: 'GET /api/scanner/institutional',
                start: 'POST /api/scanner/start',
                stop: 'POST /api/scanner/stop'
            },
            signal: {
                active: 'GET /api/signal/active',
                history: 'GET /api/signal/history',
                analyze: 'GET /api/signal/analyze/:symbol',
                indicators: 'GET /api/signal/indicators/:symbol',
                lastAnalysis: 'GET /api/signal/last-analysis/:token'
            },
            regime: {
                current: 'GET /api/regime/current',
                history: 'GET /api/regime/history',
                volatility: 'GET /api/regime/volatility',
                trend: 'GET /api/regime/trend',
                analyze: 'GET /api/regime/analyze/:symbol'
            }
        }
    });
});

module.exports = router;
