const express = require('express');
const router = express.Router();

const statusRoutes = require('./status.routes');
const scannerRoutes = require('./scanner.routes');
const signalRoutes = require('./signal.routes');
const regimeRoutes = require('./regime.routes');
const aggregatorRoutes = require('./aggregator.routes');
const systemRoutes = require('./system.routes');
const marketRoutes = require('./market.routes');

router.use('/status', statusRoutes);
router.use('/scanner', scannerRoutes);
router.use('/signal', signalRoutes);
router.use('/regime', regimeRoutes);
router.use('/aggregator', aggregatorRoutes);
router.use('/system', systemRoutes);
router.use('/market', marketRoutes);

router.get('/', (req, res) => {
    res.json({
        name: 'MAHASHAKTI V3 API',
        version: '3.0.0',
        description: 'Full Market Radar + Explosion Engine',
        signalTypes: ['BUY', 'SELL', 'STRONG_BUY', 'STRONG_SELL'],
        endpoints: {
            status: {
                info: 'GET /api/status',
                health: 'GET /api/status/health'
            },
            scanner: {
                results: 'GET /api/scanner/results',
                explosions: 'GET /api/scanner/explosions',
                rankings: 'GET /api/scanner/rankings',
                institutional: 'GET /api/scanner/institutional',
                start: 'POST /api/scanner/start',
                stop: 'POST /api/scanner/stop'
            },
            signal: {
                active: 'GET /api/signal/active',
                history: 'GET /api/signal/history',
                analyze: 'GET /api/signal/analyze/:symbol'
            },
            regime: {
                current: 'GET /api/regime/current',
                history: 'GET /api/regime/history'
            },
            aggregator: {
                screen1: 'GET /api/aggregator/screen1',
                screen2: 'GET /api/aggregator/screen2',
                combined: 'GET /api/aggregator/combined',
                topSignals: 'GET /api/aggregator/top-signals',
                topExplosions: 'GET /api/aggregator/top-explosions',
                summary: 'GET /api/aggregator/summary',
                premiumRunners: 'GET /api/aggregator/premium-runners',
                premiumExplosions: 'GET /api/aggregator/premium-explosions',
                gammaAccelerators: 'GET /api/aggregator/gamma-accelerators',
                stockRunners: 'GET /api/aggregator/stock-runners',
                movers15to20: 'GET /api/aggregator/15-20-movers',
                topRunners: 'GET /api/aggregator/top-runners',
                momentum: 'GET /api/aggregator/momentum',
                volumeSpikes: 'GET /api/aggregator/volume-spikes',
                priorityBuckets: 'GET /api/aggregator/priority-buckets'
            },
            system: {
                health: 'GET /api/system/health',
                universe: 'GET /api/system/universe',
                refreshUniverse: 'POST /api/system/refresh-universe',
                instruments: 'GET /api/system/instruments'
            }
        }
    });
});

module.exports = router;
