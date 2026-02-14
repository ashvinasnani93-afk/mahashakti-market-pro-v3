/**
 * INSTITUTIONAL ROUTES
 * Exposes all 39+ institutional features via API
 */

const express = require('express');
const router = express.Router();

// Import all services
const masterSignalGuardService = require('../services/masterSignalGuard.service');
const candleIntegrityService = require('../services/candleIntegrity.service');
const calendarService = require('../services/calendar.service');
const clockSyncService = require('../services/clockSync.service');
const breadthService = require('../services/breadth.service');
const relativeStrengthService = require('../services/relativeStrength.service');
const liquidityTierService = require('../services/liquidityTier.service');
const structuralStoplossService = require('../services/structuralStoploss.service');
const gammaClusterService = require('../services/gammaCluster.service');
const thetaEngineService = require('../services/thetaEngine.service');
const expiryRolloverService = require('../services/expiryRollover.service');
const orderbookDepthService = require('../services/orderbookDepth.service');
const panicKillSwitchService = require('../services/panicKillSwitch.service');
const circuitBreakerService = require('../services/circuitBreaker.service');
const timeOfDayService = require('../services/timeOfDay.service');
const gapDayService = require('../services/gapDay.service');
const latencyMonitorService = require('../services/latencyMonitor.service');
const drawdownGuardService = require('../services/drawdownGuard.service');
const volatilityRegimeService = require('../services/volatilityRegime.service');
const crowdingDetectorService = require('../services/crowdingDetector.service');
const correlationEngineService = require('../services/correlationEngine.service');
const confidenceScoringService = require('../services/confidenceScoring.service');
const blockOrderDetectorService = require('../services/blockOrderDetector.service');
const liquidityShockService = require('../services/liquidityShock.service');
const ivSkewService = require('../services/ivSkew.service');
const divergenceEngineService = require('../services/divergenceEngine.service');

// ============ MASTER GUARD ============

// GET /api/institutional/guard/stats - Master guard statistics
router.get('/guard/stats', (req, res) => {
    res.json({
        success: true,
        data: masterSignalGuardService.getStats()
    });
});

// POST /api/institutional/guard/validate - Validate a signal
router.post('/guard/validate', async (req, res) => {
    try {
        const { signal, candles } = req.body;
        const result = await masterSignalGuardService.validateSignal(signal, candles || []);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ PHASE 1: DATA INTEGRITY ============

// GET /api/institutional/calendar - Market calendar status
router.get('/calendar', (req, res) => {
    res.json({
        success: true,
        data: calendarService.getStats()
    });
});

// GET /api/institutional/clock-sync - Clock sync status
router.get('/clock-sync', (req, res) => {
    res.json({
        success: true,
        data: clockSyncService.getStatus()
    });
});

// GET /api/institutional/candle-integrity/:token - Candle integrity for token
router.get('/candle-integrity/:token', (req, res) => {
    res.json({
        success: true,
        data: {
            blocked: candleIntegrityService.isBlocked(req.params.token),
            reason: candleIntegrityService.getBlockReason(req.params.token),
            stats: candleIntegrityService.getStats()
        }
    });
});

// ============ PHASE 2: STRUCTURAL ============

// GET /api/institutional/breadth - Market breadth snapshot
router.get('/breadth', (req, res) => {
    res.json({
        success: true,
        data: breadthService.getSnapshot()
    });
});

// GET /api/institutional/rs - Relative strength snapshot
router.get('/rs', (req, res) => {
    res.json({
        success: true,
        data: relativeStrengthService.getSnapshot()
    });
});

// GET /api/institutional/rs/:token - RS for specific token
router.get('/rs/:token', (req, res) => {
    const rs = relativeStrengthService.getRS(req.params.token);
    res.json({
        success: true,
        data: rs || { error: 'Token not found' }
    });
});

// GET /api/institutional/liquidity - Liquidity tier snapshot
router.get('/liquidity', (req, res) => {
    res.json({
        success: true,
        data: liquidityTierService.getSnapshot()
    });
});

// GET /api/institutional/liquidity/:token - Liquidity tier for token
router.get('/liquidity/:token', (req, res) => {
    const tier = liquidityTierService.getTier(req.params.token);
    res.json({
        success: true,
        data: tier || { error: 'Token not found' }
    });
});

// ============ PHASE 3: OPTIONS MICROSTRUCTURE ============

// GET /api/institutional/gamma - Gamma cluster status
router.get('/gamma', (req, res) => {
    res.json({
        success: true,
        data: gammaClusterService.getStats()
    });
});

// GET /api/institutional/gamma/:underlying - Gamma cluster for underlying
router.get('/gamma/:underlying', (req, res) => {
    const cluster = gammaClusterService.getCluster(req.params.underlying.toUpperCase());
    res.json({
        success: true,
        data: cluster || { error: 'Underlying not found' }
    });
});

// GET /api/institutional/theta - Theta engine status
router.get('/theta', (req, res) => {
    res.json({
        success: true,
        data: thetaEngineService.getStats()
    });
});

// GET /api/institutional/expiry - Expiry rollover status
router.get('/expiry', (req, res) => {
    res.json({
        success: true,
        data: expiryRolloverService.getStats()
    });
});

// POST /api/institutional/expiry/rollover - Trigger expiry rollover
router.post('/expiry/rollover', async (req, res) => {
    try {
        const result = await expiryRolloverService.triggerRollover(req.body.newExpiry);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/institutional/orderbook - Orderbook depth stats
router.get('/orderbook', (req, res) => {
    res.json({
        success: true,
        data: orderbookDepthService.getStats()
    });
});

// ============ PHASE 4: MARKET RISK ============

// GET /api/institutional/panic - Panic kill switch status
router.get('/panic', (req, res) => {
    res.json({
        success: true,
        data: panicKillSwitchService.getStatus()
    });
});

// POST /api/institutional/panic/trigger - Manual panic trigger
router.post('/panic/trigger', (req, res) => {
    const result = panicKillSwitchService.manualTrigger(req.body.reason);
    res.json({ success: true, data: result });
});

// POST /api/institutional/panic/release - Manual panic release
router.post('/panic/release', (req, res) => {
    const result = panicKillSwitchService.manualRelease();
    res.json({ success: true, data: result });
});

// GET /api/institutional/circuit - Circuit breaker status
router.get('/circuit', (req, res) => {
    res.json({
        success: true,
        data: circuitBreakerService.getStats()
    });
});

// GET /api/institutional/time-of-day - Time of day filter status
router.get('/time-of-day', (req, res) => {
    res.json({
        success: true,
        data: timeOfDayService.getStats()
    });
});

// GET /api/institutional/gap - Gap day status
router.get('/gap', (req, res) => {
    res.json({
        success: true,
        data: gapDayService.getStats()
    });
});

// POST /api/institutional/gap/detect - Detect gap for today
router.post('/gap/detect', (req, res) => {
    const result = gapDayService.detectGap();
    res.json({ success: true, data: result });
});

// ============ PHASE 5: EXECUTION ============

// GET /api/institutional/latency - Latency monitor stats
router.get('/latency', (req, res) => {
    res.json({
        success: true,
        data: latencyMonitorService.getStats()
    });
});

// GET /api/institutional/drawdown - Drawdown guard stats
router.get('/drawdown', (req, res) => {
    res.json({
        success: true,
        data: drawdownGuardService.getStats()
    });
});

// POST /api/institutional/drawdown/outcome - Register signal outcome
router.post('/drawdown/outcome', (req, res) => {
    const { signal, outcome, pnlPercent } = req.body;
    drawdownGuardService.registerOutcome(signal, outcome, pnlPercent);
    res.json({ success: true, data: drawdownGuardService.getStats() });
});

// ============ ULTRA-ADVANCED ============

// GET /api/institutional/regime - Volatility regime classification
router.get('/regime', (req, res) => {
    res.json({
        success: true,
        data: volatilityRegimeService.getStats()
    });
});

// GET /api/institutional/crowding - Crowding detector status
router.get('/crowding', (req, res) => {
    res.json({
        success: true,
        data: crowdingDetectorService.getStats()
    });
});

// GET /api/institutional/crowding/:underlying - Crowding for underlying
router.get('/crowding/:underlying', (req, res) => {
    const crowding = crowdingDetectorService.getCrowding(req.params.underlying.toUpperCase());
    res.json({
        success: true,
        data: crowding || { error: 'Underlying not found' }
    });
});

// GET /api/institutional/correlation - Correlation engine stats
router.get('/correlation', (req, res) => {
    res.json({
        success: true,
        data: correlationEngineService.getStats()
    });
});

// GET /api/institutional/correlation/:token - Correlation for token
router.get('/correlation/:token', (req, res) => {
    const corr = correlationEngineService.getCorrelation(req.params.token);
    res.json({
        success: true,
        data: corr || { error: 'Token not found' }
    });
});

// GET /api/institutional/confidence - Confidence scoring stats
router.get('/confidence', (req, res) => {
    res.json({
        success: true,
        data: confidenceScoringService.getStats()
    });
});

// POST /api/institutional/confidence/score - Calculate confidence score
router.post('/confidence/score', (req, res) => {
    const result = confidenceScoringService.calculateScore(req.body.factors);
    res.json({ success: true, data: result });
});

// GET /api/institutional/block-orders - Block order detector stats
router.get('/block-orders', (req, res) => {
    res.json({
        success: true,
        data: blockOrderDetectorService.getStats()
    });
});

// GET /api/institutional/liquidity-shock - Liquidity shock stats
router.get('/liquidity-shock', (req, res) => {
    res.json({
        success: true,
        data: liquidityShockService.getStats()
    });
});

// GET /api/institutional/iv-skew - IV skew stats
router.get('/iv-skew', (req, res) => {
    res.json({
        success: true,
        data: ivSkewService.getStats()
    });
});

// GET /api/institutional/iv-skew/:underlying - IV skew for underlying
router.get('/iv-skew/:underlying', (req, res) => {
    const skew = ivSkewService.getSkew(req.params.underlying.toUpperCase());
    res.json({
        success: true,
        data: skew || { error: 'Underlying not found' }
    });
});

// GET /api/institutional/divergence - Divergence engine stats
router.get('/divergence', (req, res) => {
    res.json({
        success: true,
        data: divergenceEngineService.getStats()
    });
});

// ============ UNIFIED DASHBOARD ============

// GET /api/institutional/dashboard - Full institutional dashboard
router.get('/dashboard', (req, res) => {
    res.json({
        success: true,
        data: {
            guard: masterSignalGuardService.getStats(),
            calendar: calendarService.getStats(),
            breadth: breadthService.getSnapshot(),
            regime: volatilityRegimeService.getClassification(),
            panic: panicKillSwitchService.getStatus(),
            circuit: circuitBreakerService.getStats(),
            drawdown: drawdownGuardService.getStats(),
            gamma: gammaClusterService.getAllClusters(),
            crowding: crowdingDetectorService.getAllCrowding(),
            ivSkew: ivSkewService.getAllSkew(),
            liquidity: {
                tier: liquidityTierService.getSnapshot(),
                shock: liquidityShockService.getStats()
            },
            latency: latencyMonitorService.getStats(),
            expiry: expiryRolloverService.getStatus(),
            timeOfDay: timeOfDayService.getStats(),
            gap: gapDayService.getStats()
        }
    });
});

module.exports = router;
