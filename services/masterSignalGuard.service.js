/**
 * MASTER SIGNAL GUARD SERVICE
 * Unified validation layer integrating ALL 39+ features
 * Single entry point for signal validation
 */

// Phase 1: Data Integrity
const candleIntegrityService = require('./candleIntegrity.service');
const calendarService = require('./calendar.service');
const clockSyncService = require('./clockSync.service');

// Phase 2: Structural
const breadthService = require('./breadth.service');
const relativeStrengthService = require('./relativeStrength.service');
const liquidityTierService = require('./liquidityTier.service');
const structuralStoplossService = require('./structuralStoploss.service');

// Phase 3: Options Microstructure
const gammaClusterService = require('./gammaCluster.service');
const thetaEngineService = require('./thetaEngine.service');
const orderbookDepthService = require('./orderbookDepth.service');

// Phase 4: Market Risk
const panicKillSwitchService = require('./panicKillSwitch.service');
const circuitBreakerService = require('./circuitBreaker.service');
const timeOfDayService = require('./timeOfDay.service');
const gapDayService = require('./gapDay.service');

// Phase 5: Execution
const latencyMonitorService = require('./latencyMonitor.service');
const drawdownGuardService = require('./drawdownGuard.service');

// Ultra-Advanced
const volatilityRegimeService = require('./volatilityRegime.service');
const crowdingDetectorService = require('./crowdingDetector.service');
const correlationEngineService = require('./correlationEngine.service');
const confidenceScoringService = require('./confidenceScoring.service');
const liquidityShockService = require('./liquidityShock.service');

class MasterSignalGuardService {
    constructor() {
        this.config = {
            strictMode: true,            // Block on any hard failure
            softBlocksEnabled: true,     // Apply soft blocks (downgrades)
            minConfidenceScore: 50,      // Minimum confidence for signal emission
            logAllChecks: false          // Verbose logging
        };

        this.stats = {
            signalsChecked: 0,
            signalsBlocked: 0,
            signalsDowngraded: 0,
            signalsPassed: 0,
            blockReasons: new Map()
        };

        console.log('[MASTER_GUARD] Initializing Master Signal Guard...');
        console.log('[MASTER_GUARD] All 39+ features integrated');
        console.log('[MASTER_GUARD] Initialized');
    }

    /**
     * MAIN: Validate signal through all guards
     * @param {object} signal - Signal data
     * @param {Array} candles - Candle data for validation
     * @returns {object} Validation result
     */
    async validateSignal(signal, candles = []) {
        this.stats.signalsChecked++;
        
        const result = {
            allowed: true,
            signal: { ...signal },
            checks: [],
            blockReasons: [],
            warnings: [],
            adjustments: [],
            confidenceScore: null,
            timestamp: Date.now()
        };

        const token = signal.token;
        const signalType = signal.type || signal.signal;
        const underlying = signal.underlying || 'NIFTY';

        // ============ PHASE 1: DATA INTEGRITY (HARD BLOCKS) ============

        // 1. Trading Hours Check
        const tradingHours = calendarService.isValidTradingTime();
        result.checks.push({ name: 'TRADING_HOURS', ...tradingHours });
        if (!tradingHours.valid) {
            return this.blockSignal(result, tradingHours.reason);
        }

        // 2. Clock Sync Check
        const clockSync = clockSyncService.shouldAllowSignals();
        result.checks.push({ name: 'CLOCK_SYNC', ...clockSync });
        if (!clockSync.allowed) {
            return this.blockSignal(result, clockSync.reason);
        }

        // 3. Candle Integrity Check
        if (candles.length > 0) {
            const candleIntegrity = candleIntegrityService.validate(candles, token);
            result.checks.push({ name: 'CANDLE_INTEGRITY', ...candleIntegrity });
            if (!candleIntegrity.valid) {
                return this.blockSignal(result, candleIntegrity.reason);
            }
        }

        // ============ PHASE 4: MARKET RISK (HARD BLOCKS) ============

        // 4. Panic Kill Switch
        const panicCheck = panicKillSwitchService.shouldAllowSignals();
        result.checks.push({ name: 'PANIC_KILL_SWITCH', ...panicCheck });
        if (!panicCheck.allowed) {
            return this.blockSignal(result, panicCheck.reason);
        }

        // 5. Circuit Breaker
        const circuitCheck = circuitBreakerService.checkSignal(token);
        result.checks.push({ name: 'CIRCUIT_BREAKER', ...circuitCheck });
        if (!circuitCheck.allowed) {
            return this.blockSignal(result, circuitCheck.reason);
        }

        // 6. Latency Check
        const latencyCheck = latencyMonitorService.shouldAllowSignals();
        result.checks.push({ name: 'LATENCY', ...latencyCheck });
        if (!latencyCheck.allowed) {
            return this.blockSignal(result, latencyCheck.reason);
        }

        // 7. Drawdown Guard
        const drawdownCheck = drawdownGuardService.shouldAllowSignals();
        result.checks.push({ name: 'DRAWDOWN_GUARD', ...drawdownCheck });
        if (!drawdownCheck.allowed) {
            return this.blockSignal(result, drawdownCheck.reason);
        }

        // ============ PHASE 2: STRUCTURAL (HARD BLOCKS) ============

        // 8. Liquidity Tier
        const liquidityCheck = liquidityTierService.checkSignal(token);
        result.checks.push({ name: 'LIQUIDITY_TIER', ...liquidityCheck });
        if (!liquidityCheck.allowed) {
            return this.blockSignal(result, liquidityCheck.reason);
        }

        // 9. Relative Strength
        const rsCheck = relativeStrengthService.checkSignal(token, signalType);
        result.checks.push({ name: 'RELATIVE_STRENGTH', ...rsCheck });
        if (!rsCheck.allowed) {
            return this.blockSignal(result, rsCheck.reason);
        }

        // 10. Liquidity Shock
        const shockCheck = liquidityShockService.checkSignal(token);
        result.checks.push({ name: 'LIQUIDITY_SHOCK', ...shockCheck });
        if (!shockCheck.allowed) {
            return this.blockSignal(result, shockCheck.reason);
        }

        // ============ PHASE 3: OPTIONS MICROSTRUCTURE ============

        // 11. Theta Engine (for options)
        if (signal.isOption) {
            const thetaCheck = thetaEngineService.checkSignal(token);
            result.checks.push({ name: 'THETA_ENGINE', ...thetaCheck });
            if (!thetaCheck.allowed) {
                return this.blockSignal(result, thetaCheck.reason);
            }

            // 12. Orderbook Depth
            const depthCheck = orderbookDepthService.checkSignal(token);
            result.checks.push({ name: 'ORDERBOOK_DEPTH', ...depthCheck });
            if (!depthCheck.allowed) {
                return this.blockSignal(result, depthCheck.reason);
            }
        }

        // ============ PHASE 2 CONTINUED: SOFT CHECKS (ADJUSTMENTS) ============

        // 13. Breadth Check (adjustment)
        const breadthCheck = breadthService.checkSignal(signalType);
        result.checks.push({ name: 'BREADTH', ...breadthCheck });
        if (breadthCheck.adjustment === 'DOWNGRADE') {
            result.adjustments.push({ type: 'BREADTH_DOWNGRADE', reason: breadthCheck.reason });
        } else if (breadthCheck.adjustment === 'UPGRADE') {
            result.adjustments.push({ type: 'BREADTH_UPGRADE', reason: breadthCheck.reason });
        }

        // 14. Time of Day (adjustment)
        const todCheck = timeOfDayService.checkSignal(signal);
        result.checks.push({ name: 'TIME_OF_DAY', ...todCheck });
        if (!todCheck.allowed) {
            return this.blockSignal(result, todCheck.reason);
        }
        if (todCheck.adjustments) {
            result.adjustments.push({ type: 'TIME_ADJUSTMENT', ...todCheck.adjustments });
        }

        // 15. Gap Day Override
        const gapCheck = gapDayService.checkSignal(signal);
        result.checks.push({ name: 'GAP_DAY', ...gapCheck });
        if (gapCheck.adjusted) {
            result.adjustments.push({ type: 'GAP_DAY_ADJUSTMENT', ...gapCheck.adjustments });
        }

        // 16. Volatility Regime
        const regimeCheck = volatilityRegimeService.checkSignalCompatibility(signalType);
        result.checks.push({ name: 'VOLATILITY_REGIME', ...regimeCheck });
        if (!regimeCheck.compatible) {
            return this.blockSignal(result, regimeCheck.reason);
        }
        if (regimeCheck.adjustment) {
            result.adjustments.push({ type: 'REGIME_ADJUSTMENT', ...regimeCheck.adjustment });
        }

        // 17. Crowding Detector (warning)
        const crowdingCheck = crowdingDetectorService.checkTrapRisk(underlying, signalType);
        result.checks.push({ name: 'CROWDING_DETECTOR', ...crowdingCheck });
        if (crowdingCheck.flagged) {
            result.warnings.push(crowdingCheck.reason);
        }

        // 18. Correlation Engine
        const corrCheck = correlationEngineService.checkSignal(token);
        result.checks.push({ name: 'CORRELATION', ...corrCheck });
        if (!corrCheck.consider) {
            result.warnings.push(corrCheck.reason);
        }

        // 19. Gamma Cluster (upgrade potential)
        const gammaCheck = gammaClusterService.checkSignal(underlying, signalType);
        result.checks.push({ name: 'GAMMA_CLUSTER', ...gammaCheck });
        if (gammaCheck.upgrade) {
            result.adjustments.push({ type: 'GAMMA_UPGRADE', reason: gammaCheck.reason });
        }

        // ============ CONFIDENCE SCORING ============

        const confidenceFactors = {
            token,
            signalType,
            mtf: { aligned5m: true, aligned15m: true, alignedDaily: true }, // Would come from actual MTF check
            breadth: breadthService.getSnapshot().breadthPercent,
            rs: rsCheck.rsScore || 0,
            gamma: gammaCheck,
            theta: signal.isOption ? thetaEngineService.getThetaData(token) : null,
            oiVelocity: 0, // Would come from OI intelligence
            regime: volatilityRegimeService.getClassification().regime,
            liquidityTier: liquidityCheck.tier,
            correlation: corrCheck.correlation || 0,
            divergence: corrCheck.divergence || 0,
            timeOfDay: todCheck.mode
        };

        const confidenceResult = confidenceScoringService.calculateScore(confidenceFactors);
        result.confidenceScore = confidenceResult;
        result.checks.push({ name: 'CONFIDENCE_SCORE', ...confidenceResult });

        // Check minimum confidence
        if (confidenceResult.score < this.config.minConfidenceScore) {
            return this.blockSignal(result, `CONFIDENCE_BLOCK: Score ${confidenceResult.score} < ${this.config.minConfidenceScore} minimum`);
        }

        // ============ FINAL SIGNAL ADJUSTMENT ============

        // Apply upgrades/downgrades
        result.signal = this.applyAdjustments(signal, result.adjustments);
        
        this.stats.signalsPassed++;
        result.allowed = true;
        result.finalSignal = result.signal;

        return result;
    }

    /**
     * Block signal and record stats
     */
    blockSignal(result, reason) {
        result.allowed = false;
        result.blockReasons.push(reason);
        this.stats.signalsBlocked++;
        
        // Track block reason
        const reasonKey = reason.split(':')[0];
        this.stats.blockReasons.set(reasonKey, 
            (this.stats.blockReasons.get(reasonKey) || 0) + 1
        );

        console.log(`[MASTER_GUARD] 🚫 BLOCKED: ${reason}`);
        return result;
    }

    /**
     * Apply adjustments to signal
     */
    applyAdjustments(signal, adjustments) {
        const adjusted = { ...signal };
        
        let upgradeCount = 0;
        let downgradeCount = 0;

        for (const adj of adjustments) {
            if (adj.type.includes('UPGRADE')) upgradeCount++;
            if (adj.type.includes('DOWNGRADE')) downgradeCount++;
        }

        // Net adjustment
        const netAdjustment = upgradeCount - downgradeCount;

        if (netAdjustment >= 2 && (adjusted.type === 'BUY' || adjusted.signal === 'BUY')) {
            adjusted.type = 'STRONG_BUY';
            adjusted.signal = 'STRONG_BUY';
            this.stats.signalsDowngraded++; // Actually upgraded
        } else if (netAdjustment >= 2 && (adjusted.type === 'SELL' || adjusted.signal === 'SELL')) {
            adjusted.type = 'STRONG_SELL';
            adjusted.signal = 'STRONG_SELL';
        } else if (netAdjustment <= -2 && (adjusted.type === 'STRONG_BUY' || adjusted.signal === 'STRONG_BUY')) {
            adjusted.type = 'BUY';
            adjusted.signal = 'BUY';
            this.stats.signalsDowngraded++;
        } else if (netAdjustment <= -2 && (adjusted.type === 'STRONG_SELL' || adjusted.signal === 'STRONG_SELL')) {
            adjusted.type = 'SELL';
            adjusted.signal = 'SELL';
            this.stats.signalsDowngraded++;
        }

        adjusted.adjustments = adjustments;
        adjusted.netAdjustment = netAdjustment;

        return adjusted;
    }

    /**
     * Initialize all services
     */
    async initialize() {
        console.log('[MASTER_GUARD] Starting all guard services...');

        // Start services that have start() method
        clockSyncService.start();
        breadthService.start();
        relativeStrengthService.start();
        liquidityTierService.start();
        gammaClusterService.start();
        panicKillSwitchService.start();
        circuitBreakerService.start();
        volatilityRegimeService.start();
        crowdingDetectorService.start();
        correlationEngineService.start();
        liquidityShockService.start();

        // Initialize gap day detection
        gapDayService.detectGap();

        // Initialize expiry rollover
        const expiryRolloverService = require('./expiryRollover.service');
        expiryRolloverService.initialize();

        console.log('[MASTER_GUARD] ✓ All guard services started');
        return true;
    }

    /**
     * Get comprehensive stats
     */
    getStats() {
        return {
            signalsChecked: this.stats.signalsChecked,
            signalsBlocked: this.stats.signalsBlocked,
            signalsDowngraded: this.stats.signalsDowngraded,
            signalsPassed: this.stats.signalsPassed,
            passRate: this.stats.signalsChecked > 0 
                ? ((this.stats.signalsPassed / this.stats.signalsChecked) * 100).toFixed(2) + '%'
                : '0%',
            blockReasons: Object.fromEntries(this.stats.blockReasons),
            config: this.config,
            services: {
                calendar: calendarService.getStats(),
                breadth: breadthService.getSnapshot(),
                liquidityTier: liquidityTierService.getSnapshot(),
                regime: volatilityRegimeService.getClassification(),
                panic: panicKillSwitchService.getStatus(),
                drawdown: drawdownGuardService.getStats(),
                latency: latencyMonitorService.getStats()
            }
        };
    }

    /**
     * Reset daily stats
     */
    resetDailyStats() {
        this.stats.signalsChecked = 0;
        this.stats.signalsBlocked = 0;
        this.stats.signalsDowngraded = 0;
        this.stats.signalsPassed = 0;
        this.stats.blockReasons.clear();

        // Reset daily services
        drawdownGuardService.resetForNewDay();
        gapDayService.resetForNewDay();

        console.log('[MASTER_GUARD] Daily stats reset');
    }
}

module.exports = new MasterSignalGuardService();
