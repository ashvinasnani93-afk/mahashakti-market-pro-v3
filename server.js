require('dotenv').config();

const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const authService = require('./services/auth.service');
const wsService = require('./services/websocket.service');
const scannerService = require('./services/scanner.service');
const marketScannerLoopService = require('./services/marketScannerLoop.service');
const explosionService = require('./services/explosion.service');
const premiumMomentumService = require('./services/premiumMomentum.service');
const candleService = require('./services/candle.service');
const marketAggregatorService = require('./services/marketAggregator.service');
const strikeSweepService = require('./services/strikeSweep.service');
const runnerEngineService = require('./services/runnerEngine.service');
const signalCooldownService = require('./services/signalCooldown.service');
const universeLoaderService = require('./services/universeLoader.service');
const systemMonitorService = require('./services/systemMonitor.service');

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
        description: 'Production Sniper Backend - Full Market Radar + Explosion Engine',
        modules: [
            'Market Scanner Loop Engine',
            'Strike Selection Engine',
            'Premium Momentum Engine',
            'Explosion Engine (Enhanced)',
            'Market Aggregator Layer',
            'Focus WebSocket Manager (50 max)',
            'Signal Orchestrator',
            'Ranking Engine',
            'Institutional Layer',
            'Market Regime Engine',
            'Multi Timeframe Indicator Engine',
            'Risk-Reward Engine',
            'Safety Layer'
        ],
        features: [
            'Full market scanning (200+ stocks)',
            'Priority bucket WebSocket management',
            'Real-time explosion detection',
            '15-20% stock runner tracking',
            '₹3-₹650 premium runner tracking',
            'Gamma acceleration detection',
            'OI delta tracking',
            'No WAIT signals - only BUY/SELL/STRONG_BUY/STRONG_SELL'
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

async function warmCandleCache() {
    console.log('[STARTUP] Warming candle cache...');
    const instruments = require('./config/instruments.config');
    const indices = instruments.getIndices();
    
    for (const idx of indices) {
        try {
            await candleService.getRecentCandles(idx.token, idx.exchange, 'FIVE_MINUTE', 50);
            await new Promise(resolve => setTimeout(resolve, 200));
        } catch (e) {
            console.log(`[STARTUP] Cache warm failed for ${idx.symbol}: ${e.message}`);
        }
    }
    console.log('[STARTUP] ✓ Candle cache warmed');
}

async function startServer() {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                                                               ║');
    console.log('║   ███╗   ███╗ █████╗ ██╗  ██╗ █████╗ ███████╗██╗  ██╗ █████╗ ║');
    console.log('║   ████╗ ████║██╔══██╗██║  ██║██╔══██╗██╔════╝██║ ██╔╝██╔══██╗║');
    console.log('║   ██╔████╔██║███████║███████║███████║███████╗█████╔╝ ███████║║');
    console.log('║   ██║╚██╔╝██║██╔══██║██╔══██║██╔══██║╚════██║██╔═██╗ ██╔══██║║');
    console.log('║   ██║ ╚═╝ ██║██║  ██║██║  ██║██║  ██║███████║██║  ██╗██║  ██║║');
    console.log('║   ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝║');
    console.log('║                                                               ║');
    console.log('║          V3 - FULL MARKET RADAR + EXPLOSION ENGINE           ║');
    console.log('║                                                               ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');

    try {
        console.log('[BOOT SEQUENCE INITIATED]');
        console.log('');

        console.log('[1/6] Authenticating with Angel One...');
        await authService.login();
        console.log('[1/6] ✓ Authentication successful');
        console.log(`      JWT Token: ${authService.jwtToken ? 'Obtained' : 'Missing'}`);
        console.log(`      Feed Token: ${authService.feedToken ? 'Obtained' : 'Missing'}`);
        console.log('');

        console.log('[2/6] Starting WebSocket connection...');
        await wsService.connect();
        console.log('[2/6] ✓ WebSocket initialized');
        const wsStatus = wsService.getStatus();
        console.log(`      Max Subscriptions: ${wsStatus.maxSubscriptions}`);
        console.log(`      Buckets: CORE | ACTIVE | VOLUME_LEADERS | EXPLOSION | ROTATION`);
        console.log('');

        console.log('[3/8] Initializing Scanner Loop Engine...');
        await marketScannerLoopService.initialize();
        console.log('[3/8] ✓ Scanner Loop initialized');
        const scannerStatus = marketScannerLoopService.getStatus();
        console.log(`      Core Tokens: ${scannerStatus.buckets.core}`);
        console.log(`      Batch Size: 20 tokens`);
        console.log('');

        console.log('[4/8] Initializing Strike Sweep Engine...');
        await strikeSweepService.initialize();
        console.log('[4/8] ✓ Strike Sweep Engine initialized');
        console.log(`      ATM Window: ±20 strikes`);
        console.log(`      Premium Filter: ₹3-₹650`);
        console.log('');

        console.log('[5/8] Initializing Runner Engine...');
        runnerEngineService.initialize();
        console.log('[5/8] ✓ Runner Engine initialized');
        console.log(`      Early Move Detection: 1.5%`);
        console.log(`      Volume Spike: 3x`);
        console.log('');

        console.log('[6/8] Initializing Signal Cooldown System...');
        signalCooldownService.initialize();
        console.log('[6/8] ✓ Signal Cooldown initialized');
        console.log(`      Cooldown: 15 minutes`);
        console.log(`      Deduplication: Active`);
        console.log('');

        console.log('[7/8] Starting Scanner Loop...');
        await marketScannerLoopService.start();
        console.log('[7/8] ✓ Scanner Loop running');
        console.log('');

        console.log('[8/8] Warming Candle Cache...');
        await warmCandleCache();
        console.log('[8/8] ✓ Cache warmed');
        console.log('');

        app.listen(PORT, '0.0.0.0', () => {
            console.log('╔═══════════════════════════════════════════════════════════════╗');
            console.log('║                    BOOT SEQUENCE COMPLETE                     ║');
            console.log('╠═══════════════════════════════════════════════════════════════╣');
            console.log(`║   SERVER RUNNING ON PORT ${PORT}                               ║`);
            console.log('║                                                               ║');
            console.log(`║   API Base:     http://localhost:${PORT}/api                   ║`);
            console.log(`║   Status:       http://localhost:${PORT}/api/status            ║`);
            console.log(`║   Signals:      http://localhost:${PORT}/api/scanner/results   ║`);
            console.log(`║   Explosions:   http://localhost:${PORT}/api/scanner/explosions║`);
            console.log(`║   Aggregator:   http://localhost:${PORT}/api/aggregator        ║`);
            console.log('║                                                               ║');
            console.log('╠═══════════════════════════════════════════════════════════════╣');
            console.log('║   ACTIVE MODULES:                                             ║');
            console.log('║   ✓ Market Scanner Loop Engine                                ║');
            console.log('║   ✓ Strike Selection Engine                                   ║');
            console.log('║   ✓ Premium Momentum Engine                                   ║');
            console.log('║   ✓ Explosion Engine (Enhanced)                               ║');
            console.log('║   ✓ Market Aggregator Layer                                   ║');
            console.log('║   ✓ Focus WebSocket Manager (50 max, 3 buckets)               ║');
            console.log('║   ✓ Signal Orchestrator (No WAIT signals)                     ║');
            console.log('╠═══════════════════════════════════════════════════════════════╣');
            console.log('║   SIGNAL TYPES: BUY | SELL | STRONG_BUY | STRONG_SELL        ║');
            console.log('╚═══════════════════════════════════════════════════════════════╝');
            console.log('');

            logActiveBuckets();
        });

    } catch (error) {
        console.error('[STARTUP ERROR]', error.message);
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`[SERVER] Running on port ${PORT} (LIMITED MODE)`);
            console.log('[SERVER] Some services failed to initialize');
            console.log('[SERVER] Check credentials and try manual reconnection');
        });
    }
}

function logActiveBuckets() {
    const buckets = wsService.getPriorityBuckets();
    console.log('[WS BUCKETS]');
    console.log(`  CORE (${buckets.CORE.length}): ${buckets.CORE.slice(0, 5).join(', ')}${buckets.CORE.length > 5 ? '...' : ''}`);
    console.log(`  ACTIVE (${buckets.ACTIVE.length}): ${buckets.ACTIVE.slice(0, 5).join(', ')}${buckets.ACTIVE.length > 5 ? '...' : ''}`);
    console.log(`  ROTATION (${buckets.ROTATION.length}): ${buckets.ROTATION.slice(0, 5).join(', ')}${buckets.ROTATION.length > 5 ? '...' : ''}`);
    console.log('');
}

setInterval(() => {
    wsService.checkForLeaks();
}, 60000);

setInterval(() => {
    marketAggregatorService.invalidateCache();
}, 30000);

process.on('SIGINT', () => {
    console.log('\n[SHUTDOWN] Received SIGINT');
    marketScannerLoopService.stop();
    scannerService.stop();
    wsService.disconnect();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[SHUTDOWN] Received SIGTERM');
    marketScannerLoopService.stop();
    scannerService.stop();
    wsService.disconnect();
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION]', reason);
});

startServer();
