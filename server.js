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
const oiIntelligenceService = require('./services/oiIntelligence.service');
const crossMarketContextService = require('./services/crossMarketContext.service');
const safetyService = require('./services/safety.service');
const marketStateService = require('./services/marketState.service');
const globalRankingService = require('./services/globalRanking.service');
const capitalGuardService = require('./services/capitalGuard.service');

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

        console.log('[1/10] Authenticating with Angel One...');
        await authService.login();
        console.log('[1/10] ✓ Authentication successful');
        console.log(`      JWT Token: ${authService.jwtToken ? 'Obtained' : 'Missing'}`);
        console.log(`      Feed Token: ${authService.feedToken ? 'Obtained' : 'Missing'}`);
        console.log('');

        console.log('[2/10] Loading Universe (NSE EQ + F&O)...');
        await universeLoaderService.initialize();
        const universeStats = universeLoaderService.getStats();
        console.log('[2/10] ✓ Universe loaded');
        console.log(`      NSE Equity: ${universeStats.nseEquityCount}`);
        console.log(`      F&O Stocks: ${universeStats.fnoStocksCount}`);
        console.log(`      Total Instruments: ${universeStats.totalInstruments}`);
        console.log('');

        console.log('[3/10] Starting System Monitor (CPU/Memory)...');
        systemMonitorService.initialize();
        setupCPUProtection();
        console.log('[3/10] ✓ System Monitor initialized');
        console.log(`      CPU Warning: ${systemMonitorService.config.cpuWarningThreshold}%`);
        console.log(`      CPU Critical: ${systemMonitorService.config.cpuCriticalThreshold}%`);
        console.log(`      Memory Limit: ${systemMonitorService.config.memoryCriticalMB}MB`);
        console.log('');

        console.log('[4/10] Starting WebSocket connection...');
        await wsService.connect();
        console.log('[4/10] ✓ WebSocket initialized');
        const wsStatus = wsService.getStatus();
        console.log(`      Max Subscriptions: ${wsStatus.maxSubscriptions}`);
        console.log(`      Buckets: CORE | ACTIVE | EXPLOSION | ROTATION`);
        console.log('');

        console.log('[5/10] Initializing Scanner Loop Engine...');
        await marketScannerLoopService.initialize();
        console.log('[5/10] ✓ Scanner Loop initialized');
        const scannerStatus = marketScannerLoopService.getStatus();
        console.log(`      Core Tokens: ${scannerStatus.buckets.core}`);
        console.log(`      Batch Size: 20 tokens`);
        console.log('');

        console.log('[6/10] Initializing Strike Sweep Engine...');
        await strikeSweepService.initialize();
        const premiumRange = strikeSweepService.getDynamicPremiumRange();
        console.log('[6/10] ✓ Strike Sweep Engine initialized');
        console.log(`      ATM Window: ±20 strikes`);
        console.log(`      Premium Filter: ₹${premiumRange.minPremium}-₹${premiumRange.maxPremium} (${premiumRange.volatility})`);
        console.log('');

        console.log('[7/10] Initializing Runner Engine...');
        runnerEngineService.initialize();
        console.log('[7/10] ✓ Runner Engine initialized');
        console.log(`      Early Move Detection: 1.5%`);
        console.log(`      Volume Spike: 3x`);
        console.log(`      Strict Validation: 4/6 rules`);
        console.log(`      Tier Tracking: 8% | 12% | 15% | 20%`);
        console.log('');

        console.log('[8/16] Initializing Market State Foundation...');
        marketStateService.initialize();
        console.log('[8/16] ✓ Market State initialized');
        console.log(`      Centralized State Store: Active`);
        console.log(`      VWAP/RelativeStrength: Active`);
        console.log('');

        console.log('[9/16] Initializing Global Ranking Engine...');
        globalRankingService.initialize();
        console.log('[9/16] ✓ Global Ranking initialized');
        console.log(`      Update Interval: 5 seconds`);
        console.log(`      Rankings: Gainers | Losers | Momentum | Volume | RS`);
        console.log('');

        console.log('[10/16] Initializing OI Intelligence Layer...');
        oiIntelligenceService.initialize();
        console.log('[10/16] ✓ OI Intelligence initialized');
        console.log(`      OI Delta Tracking: Active`);
        console.log(`      PCR Monitoring: NIFTY | BANKNIFTY | FINNIFTY`);
        console.log(`      Buildup Detection: LONG | SHORT | COVERING | UNWINDING`);
        console.log('');

        console.log('[11/16] Initializing Cross-Market Context Engine...');
        crossMarketContextService.initialize();
        console.log('[11/16] ✓ Cross-Market Context initialized');
        console.log(`      Index Bias Tracking: Active`);
        console.log(`      Sector Leadership: Active`);
        console.log(`      Context Weight: 20% max influence`);
        console.log('');

        console.log('[12/16] Initializing Capital Guard...');
        capitalGuardService.initialize();
        console.log('[12/16] ✓ Capital Guard initialized');
        console.log(`      VIX Guard: Active`);
        console.log(`      Crash Guard: Active`);
        console.log(`      Spike Guard: Active`);
        console.log(`      Liquidity Guard: Active`);
        console.log('');

        console.log('[13/16] Initializing VIX Safety Layer...');
        safetyService.initializeVIXMonitoring();
        const vixData = safetyService.getVIXData();
        console.log('[13/16] ✓ VIX Safety initialized');
        console.log(`      Current VIX: ${vixData.vix} (${vixData.level})`);
        console.log(`      Premium Band: ₹${vixData.premiumAdjustment.minPremium}-₹${vixData.premiumAdjustment.maxPremium}`);
        console.log('');

        console.log('[14/16] Initializing Signal Cooldown System...');
        signalCooldownService.initialize();
        console.log('[14/16] ✓ Signal Cooldown initialized');
        console.log(`      Cooldown: 15 minutes`);
        console.log(`      Deduplication: Active`);
        console.log('');

        console.log('[15/16] Starting Scanner Loop...');
        await marketScannerLoopService.start();
        console.log('[15/16] ✓ Scanner Loop running');
        console.log('');

        console.log('[16/16] Warming Candle Cache...');
        await warmCandleCache();
        console.log('[16/16] ✓ Cache warmed');
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
            console.log(`║   System:       http://localhost:${PORT}/api/system/health     ║`);
            console.log('║                                                               ║');
            console.log('╠═══════════════════════════════════════════════════════════════╣');
            console.log('║   ACTIVE MODULES:                                             ║');
            console.log('║   ✓ Universe Loader (Full Market from Angel Master)           ║');
            console.log('║   ✓ Market State Foundation (Centralized State Store)         ║');
            console.log('║   ✓ Global Ranking Engine (5sec updates)                      ║');
            console.log('║   ✓ Capital Guard (VIX/Crash/Spike/Liquidity)                 ║');
            console.log('║   ✓ System Monitor (CPU/Memory Protection)                    ║');
            console.log('║   ✓ OI Intelligence (Delta/PCR/Buildup)                       ║');
            console.log('║   ✓ Cross-Market Context (Index Bias/Sector Leadership)       ║');
            console.log('║   ✓ VIX Safety Layer (Premium Band Adjustment)                ║');
            console.log('║   ✓ Advanced Regime Engine (Day Type Detection)               ║');
            console.log('║   ✓ Market Scanner Loop Engine                                ║');
            console.log('║   ✓ Strike Selection Engine (Adaptive Premium)                ║');
            console.log('║   ✓ Premium Momentum Engine                                   ║');
            console.log('║   ✓ Explosion Engine (Enhanced)                               ║');
            console.log('║   ✓ Market Aggregator Layer                                   ║');
            console.log('║   ✓ Focus WebSocket Manager (50 max, 4 buckets)               ║');
            console.log('║   ✓ Runner Engine (4/6 Strict + Tier Tracking)                ║');
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

// 🔴 CPU PROTECTION SYSTEM
function setupCPUProtection() {
    // CPU > 75% -> Reduce scan frequency
    systemMonitorService.onWarning((health) => {
        console.log(`[CPU_PROTECTION] WARNING: CPU ${health.cpu.current}% - Reducing scan frequency`);
        marketScannerLoopService.setReducedMode(true);
    });

    // CPU > 90% -> CORE INDEX ONLY MODE
    systemMonitorService.onCritical((health) => {
        console.log(`[CPU_PROTECTION] CRITICAL: CPU ${health.cpu.current}% - Switching to CORE INDEX ONLY`);
        marketScannerLoopService.setCoreOnlyMode(true);
        wsService.enableCoreOnlyMode();
    });

    // CPU normal -> Resume normal operations
    systemMonitorService.onNormal((health) => {
        console.log(`[CPU_PROTECTION] NORMAL: CPU ${health.cpu.current}% - Resuming normal operations`);
        marketScannerLoopService.setReducedMode(false);
        marketScannerLoopService.setCoreOnlyMode(false);
        wsService.disableCoreOnlyMode();
    });
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
    systemMonitorService.stop();
    crossMarketContextService.stop();
    globalRankingService.stop();
    safetyService.stop();
    wsService.disconnect();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[SHUTDOWN] Received SIGTERM');
    marketScannerLoopService.stop();
    scannerService.stop();
    systemMonitorService.stop();
    crossMarketContextService.stop();
    globalRankingService.stop();
    safetyService.stop();
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
