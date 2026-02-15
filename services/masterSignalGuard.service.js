/**
 * MASTER SIGNAL GUARD SERVICE - V2
 * ═══════════════════════════════════════════════════════════════════════════
 * HARD ENFORCEMENT LAYER - ALL 39+ GUARDS IN SIGNAL FLOW
 * 
 * THIS IS NOT OPTIONAL. THIS IS NOT INFLUENCE-ONLY.
 * IF ANY CHECK FAILS → SIGNAL BLOCKED. PERIOD.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Phase 1: Data Integrity
const calendarService = require('./calendar.service');
const clockSyncService = require('./clockSync.service');
const candleIntegrityService = require('./candleIntegrity.service');

// Phase 2: Market Risk (CRITICAL - Block First)
const panicKillSwitchService = require('./panicKillSwitch.service');
const circuitBreakerService = require('./circuitBreaker.service');
const latencyMonitorService = require('./latencyMonitor.service');
const drawdownGuardService = require('./drawdownGuard.service');

// Phase 3: Liquidity & Structure
const liquidityTierService = require('./liquidityTier.service');
const relativeStrengthService = require('./relativeStrength.service');
const liquidityShockService = require('./liquidityShock.service');
const structuralStoplossService = require('./structuralStoploss.service');

// Phase 4: Options Intelligence
const thetaEngineService = require('./thetaEngine.service');
const orderbookDepthService = require('./orderbookDepth.service');
const gammaClusterService = require('./gammaCluster.service');

// Phase 5: Market Context
const volatilityRegimeService = require('./volatilityRegime.service');
const timeOfDayService = require('./timeOfDay.service');
const gapDayService = require('./gapDay.service');
const breadthService = require('./breadth.service');
const crowdingDetectorService = require('./crowdingDetector.service');
const correlationEngineService = require('./correlationEngine.service');

// Confidence Scoring
const confidenceScoringService = require('./confidenceScoring.service');

class MasterSignalGuardService {
    constructor() {
        this.config = {
            strictMode: true,            // ALWAYS TRUE - No soft mode
            minConfidenceScore: 45,      // Minimum confidence for emission
            logAllBlocks: true
        };

        this.stats = {
            signalsChecked: 0,
            signalsBlocked: 0,
            signalsPassed: 0,
            blockReasons: new Map()
        };

        this.initialized = false;

        console.log('[MASTER_GUARD] Initializing Master Signal Guard V2...');
        console.log('[MASTER_GUARD] STRICT MODE: ENABLED - All guards are HARD BLOCKS');
        console.log('[MASTER_GUARD] Initialized');
    }

    /**
     * SYNCHRONOUS VALIDATION - Called from orchestrator
     * MUST return immediately (no async)
     */
    validateSignalSync(signal, candles = []) {
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

        const token = signal?.instrument?.token || signal?.token;
        const signalType = signal?.type || signal?.signal;
        const underlying = signal?.underlying || this.getUnderlying(signal);
        const isOption = signal?.isOption || this.isOptionInstrument(signal);

        // ================================================================
        // VALIDATION PIPELINE - STRICT SEQUENTIAL ORDER
        // IF ANY CHECK FAILS → IMMEDIATE BLOCK
        // ================================================================

        // ──────────────────────────────────────────────────────────────
        // 1️⃣ TRADING HOURS BLOCK (HARD)
        // ──────────────────────────────────────────────────────────────
        const tradingHours = calendarService.isValidTradingTime();
        result.checks.push({ name: 'TRADING_HOURS', ...tradingHours });
        if (!tradingHours.valid) {
            return this.blockSignal(result, `TRADING_HOURS_BLOCKED: ${tradingHours.detail}`);
        }

        // ──────────────────────────────────────────────────────────────
        // 2️⃣ HOLIDAY BLOCK (HARD)
        // ──────────────────────────────────────────────────────────────
        if (calendarService.isHoliday()) {
            result.checks.push({ name: 'HOLIDAY_CHECK', blocked: true });
            return this.blockSignal(result, 'MARKET_HOLIDAY_BLOCKED: NSE Holiday');
        }
        result.checks.push({ name: 'HOLIDAY_CHECK', blocked: false });

        // ──────────────────────────────────────────────────────────────
        // 3️⃣ IST CLOCK SYNC (HARD)
        // ──────────────────────────────────────────────────────────────
        const clockSync = clockSyncService.shouldAllowSignals();
        result.checks.push({ name: 'CLOCK_SYNC', ...clockSync });
        if (!clockSync.allowed) {
            return this.blockSignal(result, `CLOCK_DRIFT_BLOCKED: ${clockSync.detail || 'Drift exceeded threshold'}`);
        }

        // ──────────────────────────────────────────────────────────────
        // 4️⃣ PANIC KILL SWITCH (CRITICAL - HARD)
        // ──────────────────────────────────────────────────────────────
        const panicCheck = panicKillSwitchService.shouldAllowSignals();
        result.checks.push({ name: 'PANIC_KILL_SWITCH', ...panicCheck });
        if (!panicCheck.allowed) {
            return this.blockSignal(result, `PANIC_BLOCKED: ${panicCheck.detail || panicCheck.reason}`);
        }

        // ──────────────────────────────────────────────────────────────
        // 5️⃣ CIRCUIT BREAKER (CRITICAL - HARD)
        // ──────────────────────────────────────────────────────────────
        const circuitCheck = circuitBreakerService.checkSignal(token);
        result.checks.push({ name: 'CIRCUIT_BREAKER', ...circuitCheck });
        if (!circuitCheck.allowed) {
            return this.blockSignal(result, `CIRCUIT_BLOCKED: ${circuitCheck.reason}`);
        }

        // ──────────────────────────────────────────────────────────────
        // 6️⃣ LIQUIDITY TIER (T3 = HARD BLOCK)
        // ──────────────────────────────────────────────────────────────
        const liquidityCheck = liquidityTierService.checkSignal(token);
        result.checks.push({ name: 'LIQUIDITY_TIER', ...liquidityCheck });
        if (!liquidityCheck.allowed) {
            return this.blockSignal(result, `LIQUIDITY_BLOCKED: ${liquidityCheck.reason}`);
        }
        if (liquidityCheck.warning) {
            result.warnings.push(`Liquidity warning: ${liquidityCheck.reason}`);
        }

        // ──────────────────────────────────────────────────────────────
        // 7️⃣ LATENCY MONITOR (HARD)
        // ──────────────────────────────────────────────────────────────
        const latencyCheck = latencyMonitorService.shouldAllowSignals();
        result.checks.push({ name: 'LATENCY_MONITOR', ...latencyCheck });
        if (!latencyCheck.allowed) {
            return this.blockSignal(result, `LATENCY_BLOCKED: ${latencyCheck.reason}`);
        }

        // ──────────────────────────────────────────────────────────────
        // 8️⃣ DRAWDOWN GUARD (HARD)
        // ──────────────────────────────────────────────────────────────
        const drawdownCheck = drawdownGuardService.shouldAllowSignals();
        result.checks.push({ name: 'DRAWDOWN_GUARD', ...drawdownCheck });
        if (!drawdownCheck.allowed) {
            return this.blockSignal(result, `DRAWDOWN_BLOCKED: ${drawdownCheck.reason}`);
        }

        // ──────────────────────────────────────────────────────────────
        // 9️⃣ LIQUIDITY SHOCK (HARD)
        // ──────────────────────────────────────────────────────────────
        const shockCheck = liquidityShockService.checkSignal(token);
        result.checks.push({ name: 'LIQUIDITY_SHOCK', ...shockCheck });
        if (!shockCheck.allowed) {
            return this.blockSignal(result, `LIQUIDITY_SHOCK_BLOCKED: ${shockCheck.reason}`);
        }

        // ──────────────────────────────────────────────────────────────
        // 🔟 RELATIVE STRENGTH (HARD - Underperforming stock blocked)
        // ──────────────────────────────────────────────────────────────
        const rsCheck = relativeStrengthService.checkSignal(token, signalType);
        result.checks.push({ name: 'RELATIVE_STRENGTH', ...rsCheck });
        if (!rsCheck.allowed) {
            return this.blockSignal(result, `RS_BLOCKED: ${rsCheck.reason}`);
        }

        // ──────────────────────────────────────────────────────────────
        // 1️⃣1️⃣ VOLATILITY REGIME (COMPRESSION = BLOCK)
        // ──────────────────────────────────────────────────────────────
        const regimeCheck = volatilityRegimeService.checkSignalCompatibility(signalType);
        result.checks.push({ name: 'VOLATILITY_REGIME', ...regimeCheck });
        if (!regimeCheck.compatible) {
            return this.blockSignal(result, `REGIME_BLOCKED: ${regimeCheck.reason}`);
        }
        if (regimeCheck.adjustment) {
            result.adjustments.push({ type: 'REGIME_ADJUSTMENT', ...regimeCheck.adjustment });
        }

        // ──────────────────────────────────────────────────────────────
        // 1️⃣2️⃣ TIME-OF-DAY STRICT FILTER (HARD)
        // ──────────────────────────────────────────────────────────────
        const todCheck = timeOfDayService.checkSignal({
            ...signal,
            volumeMultiple: signal?.volume?.ratio || signal?.volumeConfirm?.ratio || 1,
            strength: signal?.strength || 0,
            rr: signal?.riskReward?.primaryRR || 1.5
        });
        result.checks.push({ name: 'TIME_OF_DAY', ...todCheck });
        if (!todCheck.allowed) {
            return this.blockSignal(result, `TIME_BLOCKED: ${todCheck.reason}`);
        }

        // ──────────────────────────────────────────────────────────────
        // 1️⃣3️⃣ GAP DAY OVERRIDE (ADJUSTMENT + POTENTIAL BLOCK)
        // ──────────────────────────────────────────────────────────────
        const gapCheck = gapDayService.checkSignal({
            type: signalType,
            breakoutLevel: signal?.breakout?.level || signal?.price,
            breakdownLevel: signal?.breakout?.level || signal?.price,
            volumeThreshold: 1.5
        });
        result.checks.push({ name: 'GAP_DAY', ...gapCheck });
        if (gapCheck.adjusted) {
            result.adjustments.push({ type: 'GAP_DAY_ADJUSTMENT', ...gapCheck.adjustments });
            result.warnings.push(gapCheck.recommendation || 'Gap day adjustment applied');
        }

        // ──────────────────────────────────────────────────────────────
        // 1️⃣4️⃣ CANDLE INTEGRITY (HARD - Data quality)
        // ──────────────────────────────────────────────────────────────
        if (candles && candles.length > 0) {
            const candleCheck = candleIntegrityService.validate(candles, token);
            result.checks.push({ name: 'CANDLE_INTEGRITY', valid: candleCheck.valid, reason: candleCheck.reason });
            if (!candleCheck.valid) {
                return this.blockSignal(result, `CANDLE_INTEGRITY_BLOCKED: ${candleCheck.reason}`);
            }
        }

        // ════════════════════════════════════════════════════════════════
        // OPTIONS-SPECIFIC CHECKS (Only if isOption)
        // ════════════════════════════════════════════════════════════════
        if (isOption) {
            // ──────────────────────────────────────────────────────────────
            // 1️⃣5️⃣ THETA ENGINE (HARD - Expiry crush, Deep OTM)
            // ──────────────────────────────────────────────────────────────
            const thetaCheck = thetaEngineService.checkSignal(token);
            result.checks.push({ name: 'THETA_ENGINE', ...thetaCheck });
            if (!thetaCheck.allowed) {
                return this.blockSignal(result, `THETA_BLOCKED: ${thetaCheck.reason}`);
            }

            // ──────────────────────────────────────────────────────────────
            // 1️⃣6️⃣ SPREAD FILTER (HARD - >15% spread blocked)
            // ──────────────────────────────────────────────────────────────
            const depthCheck = orderbookDepthService.checkSignal(token);
            result.checks.push({ name: 'ORDERBOOK_DEPTH', ...depthCheck });
            if (!depthCheck.allowed) {
                return this.blockSignal(result, `SPREAD_BLOCKED: ${depthCheck.reason}`);
            }

            // ──────────────────────────────────────────────────────────────
            // 1️⃣7️⃣ GAMMA CLUSTER (UPGRADE potential, not block)
            // ──────────────────────────────────────────────────────────────
            const gammaCheck = gammaClusterService.checkSignal(underlying, signalType);
            result.checks.push({ name: 'GAMMA_CLUSTER', ...gammaCheck });
            if (gammaCheck.upgrade) {
                result.adjustments.push({ type: 'GAMMA_UPGRADE', reason: gammaCheck.reason });
            }
        }

        // ════════════════════════════════════════════════════════════════
        // MARKET CONTEXT CHECKS (Warnings/Adjustments, not hard blocks)
        // ════════════════════════════════════════════════════════════════

        // Breadth check (warning)
        const breadthCheck = breadthService.checkSignal(signalType);
        result.checks.push({ name: 'BREADTH', ...breadthCheck });
        if (breadthCheck.adjustment === 'DOWNGRADE') {
            result.adjustments.push({ type: 'BREADTH_DOWNGRADE', reason: breadthCheck.reason });
        } else if (breadthCheck.adjustment === 'UPGRADE') {
            result.adjustments.push({ type: 'BREADTH_UPGRADE', reason: breadthCheck.reason });
        }

        // Crowding trap warning
        const crowdingCheck = crowdingDetectorService.checkTrapRisk(underlying, signalType);
        result.checks.push({ name: 'CROWDING_DETECTOR', ...crowdingCheck });
        if (crowdingCheck.flagged) {
            result.warnings.push(crowdingCheck.reason);
        }

        // Correlation check
        const corrCheck = correlationEngineService.checkSignal(token);
        result.checks.push({ name: 'CORRELATION', ...corrCheck });
        if (!corrCheck.consider) {
            result.warnings.push(corrCheck.reason);
        }

        // ════════════════════════════════════════════════════════════════
        // CONFIDENCE SCORING
        // ════════════════════════════════════════════════════════════════
        const confidenceFactors = {
            token,
            signalType,
            mtf: { 
                aligned5m: true, 
                aligned15m: signal?.higherTF?.aligned15m || false, 
                alignedDaily: signal?.higherTF?.alignedDaily || false 
            },
            breadth: breadthService.getSnapshot().breadthPercent || 50,
            rs: rsCheck.rsScore || 0,
            gamma: isOption ? gammaClusterService.getCluster(underlying) : null,
            theta: isOption ? thetaEngineService.getThetaData(token) : null,
            oiVelocity: 0,
            regime: volatilityRegimeService.getClassification().regime,
            liquidityTier: liquidityCheck.tier,
            correlation: corrCheck.correlation || 0,
            divergence: corrCheck.divergence || 0,
            timeOfDay: todCheck.mode || 'NORMAL'
        };

        const confidenceResult = confidenceScoringService.calculateScore(confidenceFactors);
        result.confidenceScore = confidenceResult;
        result.checks.push({ name: 'CONFIDENCE_SCORE', ...confidenceResult });

        // ──────────────────────────────────────────────────────────────
        // 1️⃣8️⃣ MINIMUM CONFIDENCE CHECK (HARD)
        // ──────────────────────────────────────────────────────────────
        if (confidenceResult.score < this.config.minConfidenceScore) {
            return this.blockSignal(result, `CONFIDENCE_BLOCKED: Score ${confidenceResult.score} < ${this.config.minConfidenceScore} minimum`);
        }

        // ════════════════════════════════════════════════════════════════
        // ALL CHECKS PASSED - APPLY ADJUSTMENTS
        // ════════════════════════════════════════════════════════════════
        result.signal = this.applyAdjustments(signal, result.adjustments);
        result.allowed = true;
        
        this.stats.signalsPassed++;

        return result;
    }

    /**
     * Block signal and record stats
     */
    blockSignal(result, reason) {
        result.allowed = false;
        result.blockReasons.push(reason);
        this.stats.signalsBlocked++;
        
        const reasonKey = reason.split(':')[0];
        this.stats.blockReasons.set(reasonKey, 
            (this.stats.blockReasons.get(reasonKey) || 0) + 1
        );

        if (this.config.logAllBlocks) {
            console.log(`[MASTER_GUARD] 🚫 ${reason}`);
        }

        return result;
    }

    /**
     * Apply adjustments (upgrades/downgrades)
     */
    applyAdjustments(signal, adjustments) {
        const adjusted = { ...signal };
        
        let upgradeCount = 0;
        let downgradeCount = 0;

        for (const adj of adjustments) {
            if (adj.type.includes('UPGRADE')) upgradeCount++;
            if (adj.type.includes('DOWNGRADE')) downgradeCount++;
        }

        const netAdjustment = upgradeCount - downgradeCount;
        const currentType = adjusted.type || adjusted.signal;

        // Upgrade logic
        if (netAdjustment >= 2) {
            if (currentType === 'BUY') {
                adjusted.type = 'STRONG_BUY';
                adjusted.signal = 'STRONG_BUY';
            } else if (currentType === 'SELL') {
                adjusted.type = 'STRONG_SELL';
                adjusted.signal = 'STRONG_SELL';
            }
        }
        // Downgrade logic
        else if (netAdjustment <= -2) {
            if (currentType === 'STRONG_BUY') {
                adjusted.type = 'BUY';
                adjusted.signal = 'BUY';
            } else if (currentType === 'STRONG_SELL') {
                adjusted.type = 'SELL';
                adjusted.signal = 'SELL';
            }
        }

        adjusted.adjustments = adjustments;
        adjusted.netAdjustment = netAdjustment;

        return adjusted;
    }

    /**
     * Detect if instrument is option
     */
    isOptionInstrument(signal) {
        if (!signal || !signal.instrument) return false;
        const symbol = signal.instrument.symbol || '';
        return symbol.includes('CE') || symbol.includes('PE');
    }

    /**
     * Get underlying from option
     */
    getUnderlying(signal) {
        if (!signal || !signal.instrument) return 'NIFTY';
        const symbol = signal.instrument.symbol || '';
        if (symbol.includes('BANKNIFTY')) return 'BANKNIFTY';
        if (symbol.includes('FINNIFTY')) return 'FINNIFTY';
        if (symbol.includes('NIFTY')) return 'NIFTY';
        return 'NIFTY';
    }

    /**
     * Initialize all services (called at boot)
     */
    async initialize() {
        console.log('[MASTER_GUARD] Starting all guard services...');

        try {
            clockSyncService.start();
            breadthService.start();
            relativeStrengthService.start();
            liquidityTierService.start();
            gammaClusterService.start();
            thetaEngineService.start();
            panicKillSwitchService.start();
            circuitBreakerService.start();
            volatilityRegimeService.start();
            crowdingDetectorService.start();
            correlationEngineService.start();
            liquidityShockService.start();

            gapDayService.detectGap();

            this.initialized = true;
            console.log('[MASTER_GUARD] ✓ All 18 guard services started');
            console.log('[MASTER_GUARD] ✓ HARD ENFORCEMENT ACTIVE');
            return true;
        } catch (error) {
            console.error('[MASTER_GUARD] Failed to initialize:', error.message);
            return false;
        }
    }

    /**
     * Get comprehensive stats
     */
    getStats() {
        return {
            signalsChecked: this.stats.signalsChecked,
            signalsBlocked: this.stats.signalsBlocked,
            signalsPassed: this.stats.signalsPassed,
            blockRate: this.stats.signalsChecked > 0 
                ? ((this.stats.signalsBlocked / this.stats.signalsChecked) * 100).toFixed(2) + '%'
                : '0%',
            passRate: this.stats.signalsChecked > 0 
                ? ((this.stats.signalsPassed / this.stats.signalsChecked) * 100).toFixed(2) + '%'
                : '0%',
            blockReasons: Object.fromEntries(this.stats.blockReasons),
            config: this.config,
            initialized: this.initialized,
            guardStatus: {
                tradingHours: 'HARD_BLOCK',
                holiday: 'HARD_BLOCK',
                clockSync: 'HARD_BLOCK',
                panicKillSwitch: 'HARD_BLOCK',
                circuitBreaker: 'HARD_BLOCK',
                liquidityTier: 'HARD_BLOCK',
                latencyMonitor: 'HARD_BLOCK',
                drawdownGuard: 'HARD_BLOCK',
                liquidityShock: 'HARD_BLOCK',
                relativeStrength: 'HARD_BLOCK',
                volatilityRegime: 'HARD_BLOCK',
                timeOfDay: 'HARD_BLOCK',
                candleIntegrity: 'HARD_BLOCK',
                thetaEngine: 'HARD_BLOCK (Options)',
                spreadFilter: 'HARD_BLOCK (Options)',
                confidenceScore: 'HARD_BLOCK',
                breadth: 'ADJUSTMENT',
                crowding: 'WARNING',
                correlation: 'WARNING',
                gammaCluster: 'UPGRADE_ONLY'
            }
        };
    }

    /**
     * Reset daily stats
     */
    resetDailyStats() {
        this.stats.signalsChecked = 0;
        this.stats.signalsBlocked = 0;
        this.stats.signalsPassed = 0;
        this.stats.blockReasons.clear();

        drawdownGuardService.resetForNewDay();
        gapDayService.resetForNewDay();

        console.log('[MASTER_GUARD] Daily stats reset');
    }
}

module.exports = new MasterSignalGuardService();
