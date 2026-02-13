const express = require('express');
const router = express.Router();

const statusRoutes = require('./status.routes');
const scannerRoutes = require('./scanner.routes');
const signalRoutes = require('./signal.routes');

router.use('/status', statusRoutes);
router.use('/scanner', scannerRoutes);
router.use('/signal', signalRoutes);

router.get('/', (req, res) => {
    res.json({
        name: 'MAHASHAKTI V3 API',
        version: '3.0.0',
        endpoints: {
            status: '/api/status',
            health: '/api/status/health',
            scannerResults: '/api/scanner/results',
            scannerExplosions: '/api/scanner/explosions',
            scannerWatchlist: '/api/scanner/watchlist',
            scannerStart: '/api/scanner/start (POST)',
            scannerStop: '/api/scanner/stop (POST)',
            signalHistory: '/api/signal/history',
            signalAnalyze: '/api/signal/analyze/:symbol'
        }
    });
});

module.exports = router;
