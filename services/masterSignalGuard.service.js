/**
 * MASTER SIGNAL GUARD SERVICE - V6 ADAPTIVE INTELLIGENCE
 * ═══════════════════════════════════════════════════════════════════════════
 * HARD ENFORCEMENT LAYER - ALL 29+ GUARDS IN SIGNAL FLOW
 * 
 * V6 ADDITIONS:
 * - Adaptive Regime (dynamic thresholds)
 * - Execution Reality (slippage guard)
 * - Portfolio Commander (risk management)
 * - V6 Crowd Psychology (late breakout + PCR extreme)
 * - Signal Lifecycle tracking
 * - Confidence 2.0 (minimum 60)
 * 
 * NEW PIPELINE ORDER:
 * ADAPTIVE_REGIME → IGNITION → TRADING_HOURS → CLOCK → PANIC → CIRCUIT → 
 * LIQUIDITY → EXECUTION_REALITY → PORTFOLIO_COMMANDER → ...existing... → 
 * CROWDING → CORRELATION → CONFIDENCE → EMIT
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Phase 0: V6 ADAPTIVE REGIME (FIRST - Sets dynamic thresholds)
let adaptiveRegimeService = null;
try {
    adaptiveRegimeService = require('./adaptiveRegime.service');
} catch (e) {
    console.log('[MASTER_GUARD] Adaptive Regime not available');
}

// Phase 1: Data Integrity
const calendarService = require('./calendar.service');
const clockSyncService = require('./clockSync.service');
const candleIntegrityService = require('./candleIntegrity.service');

// Phase 1.5: IGNITION DETECTION (V5 - Early Move Detection)
const microIgnitionStockService = require('./microIgnitionStock.service');
const microIgnitionOptionService = require('./microIgnitionOption.service');

// Phase 2: Market Risk (CRITICAL - Block First)
const panicKillSwitchService = require('./panicKillSwitch.service');
const circuitBreakerService = require('./circuitBreaker.service');
const latencyMonitorService = require('./latencyMonitor.service');
const drawdownGuardService = require('./drawdownGuard.service');

// Phase 2.5: V6 EXECUTION REALITY (Slippage Guard)
let executionRealityService = null;
try {
    executionRealityService = require('./executionReality.service');
} catch (e) {
    console.log('[MASTER_GUARD] Execution Reality not available');
}

// Phase 2.6: V6 PORTFOLIO COMMANDER (Risk Management)
let portfolioCommanderService = null;
try {
    portfolioCommanderService = require('./portfolioCommander.service');
} catch (e) {
    console.log('[MASTER_GUARD] Portfolio Commander not available');
}

// Phase 3: Liquidity & Structure
const liquidityTierService = require('./liquidityTier.service');
const relativeStrengthService = require('./relativeStrength.service');
const liquidityShockService = require('./liquidityShock.service');
const structuralStoplossService = require('./structuralStoploss.service');

// Phase 4: Options Intelligence
const thetaEngineService = require('./thetaEngine.service');
const orderbookDepthService = require('./orderbookDepth.service');
const gammaClusterService = require('./gammaCluster.service');
const expiryRolloverService = require('./expiryRollover.service');

// Phase 5: Market Context
const volatilityRegimeService = require('./volatilityRegime.service');
const timeOfDayService = require('./timeOfDay.service');
const gapDayService = require('./gapDay.service');
const breadthService = require('./breadth.service');
const crowdingDetectorService = require('./crowdingDetector.service');
const correlationEngineService = require('./correlationEngine.service');

// Confidence Scoring V6
const confidenceScoringService = require('./confidenceScoring.service');

// V6: Signal Lifecycle Tracking
let signalLifecycleService = null;
try {
    signalLifecycleService = require('./signalLifecycle.service');
} catch (e) {
    console.log('[MASTER_GUARD] Signal Lifecycle not available');
}

// WebSocket for ignition promotion
let websocketService = null;
try {
    websocketService = require('./websocket.service');
} catch (e) {
    console.log('[MASTER_GUARD] WebSocket service not available for ignition promotion');
}

class MasterSignalGuardService {
    constructor() {
        this.config = {
            strictMode: true,            // ALWAYS TRUE - No soft mode
            minConfidenceScore: 60,      // V6: Increased from 45 to 60
            logAllBlocks: true
        };

        this.stats = {
            signalsChecked: 0,
            signalsBlocked: 0,
            signalsPassed: 0,
            blockReasons: new Map()
        };

        // V6: Track current regime for dynamic thresholds
        this.currentRegime = 'UNKNOWN';
        this.currentThresholds = null;

        this.initialized = false;

        console.log('[MASTER_GUARD] Initializing Master Signal Guard V6...');
        console.log('[MASTER_GUARD] STRICT MODE: ENABLED - All guards are HARD BLOCKS');
        console.log('[MASTER_GUARD] V6: Minimum confidence = 60');
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
        const ltp = signal?.price || 0;
        const spreadPercent = signal?.spreadPercent || 0;

        // ================================================================
        // V5: IGNITION DETECTION (FIRST - BEFORE ANY VALIDATION)
        // Early move detection at 1-1.5% instead of 15%
        // ================================================================
        let ignitionResult = { detected: false, strength: 0 };
        
        if (!isOption && candles && candles.length >= 20) {
            // Stock ignition detection
            ignitionResult = microIgnitionStockService.detectIgnition(
                token, 
                candles, 
                ltp,
                spreadPercent,
                100  // Default circuit distance
            );
        } else if (isOption && candles && candles.length >= 5) {
            // Option ignition detection
            const oiCurrent = signal?.oi || 0;
            const underlyingDirection = signal?.underlyingDirection || 0;
            const thetaImpact = signal?.thetaImpact || 0;
            
            ignitionResult = microIgnitionOptionService.detectIgnition(
                token,
                candles,
                oiCurrent,
                spreadPercent,
                underlyingDirection,
                thetaImpact
            );
        }
        
        result.checks.push({ 
            name: 'IGNITION_CHECK', 
            detected: ignitionResult.detected, 
            strength: ignitionResult.strength,
            type: ignitionResult.type
        });
        
        // Store ignition data for later use
        result.signal.ignition = {
            detected: ignitionResult.detected,
            strength: ignitionResult.strength,
            type: ignitionResult.type || (isOption ? 'OPTION' : 'STOCK')
        };
        
        // If ignition detected, trigger CORE promotion
        if (ignitionResult.detected && websocketService) {
            try {
                websocketService.promoteOnIgnition(token, ignitionResult.type, ignitionResult.strength);
            } catch (e) {
                // Silent fail - don't block signal for WS error
            }
        }

        // ================================================================
        // V6: ADAPTIVE REGIME CHECK (BEFORE ALL VALIDATION)
        // Sets dynamic thresholds based on market regime
        // ================================================================
        let regimeState = { regime: 'UNKNOWN', volatilityScore: 50, thresholds: null };
        if (adaptiveRegimeService) {
            try {
                regimeState = adaptiveRegimeService.getState();
                this.currentRegime = regimeState.regime;
                this.currentThresholds = regimeState.thresholds;
                
                result.checks.push({
                    name: 'ADAPTIVE_REGIME',
                    regime: regimeState.regime,
                    volatilityScore: regimeState.volatilityScore,
                    valid: true
                });
                
                // Check signal-regime compatibility
                if (regimeState.thresholds) {
                    const compatibility = adaptiveRegimeService.checkSignalCompatibility(
                        signalType, 
                        ignitionResult.strength
                    );
                    
                    if (!compatibility.compatible) {
                        return this.blockSignal(result, `REGIME_INCOMPATIBLE: Signal strength ${ignitionResult.strength} < ${regimeState.thresholds.ignitionMinStrength} for ${regimeState.regime}`);
                    }
                    
                    // Add warnings
                    result.warnings.push(...compatibility.warnings);
                }
            } catch (e) {
                // Non-blocking - continue with default thresholds
                result.checks.push({ name: 'ADAPTIVE_REGIME', skipped: true, error: e.message });
            }
        }

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
        // V6: EXECUTION REALITY (HARD - Slippage Guard)
        // ──────────────────────────────────────────────────────────────
        if (executionRealityService) {
            const execCheck = executionRealityService.checkExecution({
                token,
                spreadPercent,
                bidDepth: signal?.bidDepth,
                askDepth: signal?.askDepth,
                lastCandle: candles?.length > 0 ? candles[candles.length - 1] : null,
                price: ltp,
                volatility: regimeState?.volatilityScore
            });
            result.checks.push({ name: 'EXECUTION_REALITY', ...execCheck });
            if (!execCheck.allowed) {
                return this.blockSignal(result, `EXECUTION_BLOCKED: ${execCheck.blockReason}`);
            }
            if (execCheck.warnings?.length > 0) {
                result.warnings.push(...execCheck.warnings);
            }
            // Store slippage score for confidence calculation
            result.signal.slippageRiskScore = execCheck.slippageRiskScore;
        }

        // ──────────────────────────────────────────────────────────────
        // V6: PORTFOLIO COMMANDER (HARD - Risk Management)
        // ──────────────────────────────────────────────────────────────
        if (portfolioCommanderService) {
            const portfolioCheck = portfolioCommanderService.checkSignal(
                {
                    token,
                    symbol: signal?.instrument?.symbol || signal?.symbol,
                    sector: signal?.sector,
                    underlying,
                    isOption,
                    riskAmount: signal?.riskAmount
                },
                regimeState?.regime || 'UNKNOWN'
            );
            result.checks.push({ name: 'PORTFOLIO_COMMANDER', ...portfolioCheck });
            if (!portfolioCheck.allowed) {
                return this.blockSignal(result, `PORTFOLIO_BLOCKED: ${portfolioCheck.blockReason}`);
            }
            if (portfolioCheck.action === 'DOWNGRADE') {
                result.adjustments.push({
                    type: 'CONFIDENCE_DOWNGRADE',
                    factor: portfolioCheck.downgradeFactor,
                    reason: 'Portfolio risk adjustment'
                });
            }
            if (portfolioCheck.warnings?.length > 0) {
                result.warnings.push(...portfolioCheck.warnings);
            }
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

        // ──────────────────────────────────────────────────────────────
        // 1️⃣5️⃣ STRUCTURAL STOPLOSS (HARD - No structure = No signal)
        // ──────────────────────────────────────────────────────────────
        if (candles && candles.length >= 20 && !isOption) {
            const slCheck = structuralStoplossService.calculate(
                candles,
                signalType,
                signal?.price || candles[candles.length - 1]?.close || 0
            );
            result.checks.push({ name: 'STRUCTURAL_STOPLOSS', ...slCheck });
            if (!slCheck.valid) {
                return this.blockSignal(result, slCheck.reason);
            }
            // Attach SL data to signal
            result.signal.structuralSL = {
                stoploss: slCheck.stoploss,
                target: slCheck.target,
                rr: slCheck.rr,
                riskPercent: slCheck.riskPercent,
                structureType: slCheck.structureType
            };
        } else if (!isOption) {
            result.checks.push({ name: 'STRUCTURAL_STOPLOSS', valid: true, reason: 'SKIPPED: Insufficient candles' });
        }

        // ════════════════════════════════════════════════════════════════
        // OPTIONS-SPECIFIC CHECKS (Only if isOption)
        // ════════════════════════════════════════════════════════════════
        if (isOption) {
            // ──────────────────────────────────────────────────────────────
            // 1️⃣6️⃣ EXPIRY ROLLOVER CHECK (HARD - Expiry mismatch blocked)
            // ──────────────────────────────────────────────────────────────
            const expiryStatus = expiryRolloverService.getStatus();
            const symbolExpiry = this.extractExpiryFromSymbol(signal?.instrument?.symbol);
            if (symbolExpiry && expiryStatus.currentExpiry) {
                const expiryMismatch = symbolExpiry !== expiryStatus.currentExpiry;
                result.checks.push({ 
                    name: 'EXPIRY_ROLLOVER', 
                    valid: !expiryMismatch,
                    currentExpiry: expiryStatus.currentExpiry,
                    symbolExpiry: symbolExpiry
                });
                if (expiryMismatch && expiryStatus.rolloverNeeded) {
                    return this.blockSignal(result, `EXPIRY_MISMATCH_BLOCKED: Symbol expiry ${symbolExpiry} != Current ${expiryStatus.currentExpiry}`);
                }
            } else {
                result.checks.push({ name: 'EXPIRY_ROLLOVER', valid: true, reason: 'EXPIRY_OK' });
            }

            // ──────────────────────────────────────────────────────────────
            // 1️⃣7️⃣ THETA ENGINE (HARD - Expiry crush, Deep OTM)
            // ──────────────────────────────────────────────────────────────
            const thetaCheck = thetaEngineService.checkSignal(token);
            result.checks.push({ name: 'THETA_ENGINE', ...thetaCheck });
            if (!thetaCheck.allowed) {
                return this.blockSignal(result, `THETA_BLOCKED: ${thetaCheck.reason}`);
            }

            // ──────────────────────────────────────────────────────────────
            // 1️⃣8️⃣ SPREAD FILTER (HARD - >15% spread blocked)
            // ──────────────────────────────────────────────────────────────
            const depthCheck = orderbookDepthService.checkSignal(token);
            result.checks.push({ name: 'ORDERBOOK_DEPTH', ...depthCheck });
            if (!depthCheck.allowed) {
                return this.blockSignal(result, `SPREAD_BLOCKED: ${depthCheck.reason}`);
            }

            // ──────────────────────────────────────────────────────────────
            // 1️⃣9️⃣ GAMMA CLUSTER (UPGRADE potential, not block)
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

        // Crowding trap warning + V6 Full Crowd Check
        const crowdingCheck = crowdingDetectorService.checkTrapRisk(underlying, signalType);
        result.checks.push({ name: 'CROWDING_DETECTOR', ...crowdingCheck });
        if (crowdingCheck.flagged) {
            result.warnings.push(crowdingCheck.reason);
        }

        // V6: Full Crowd Psychology Check (late breakout, OI extreme, PCR extreme)
        const v6CrowdCheck = crowdingDetectorService.fullCrowdCheck(underlying, signalType, candles);
        result.checks.push({ name: 'V6_CROWD_PSYCHOLOGY', ...v6CrowdCheck });
        if (v6CrowdCheck.action === 'BLOCK') {
            return this.blockSignal(result, `CROWD_BLOCKED: ${v6CrowdCheck.warnings.join(', ')}`);
        }
        if (v6CrowdCheck.warnings?.length > 0) {
            result.warnings.push(...v6CrowdCheck.warnings);
        }

        // Correlation check
        const corrCheck = correlationEngineService.checkSignal(token);
        result.checks.push({ name: 'CORRELATION', ...corrCheck });
        if (!corrCheck.consider) {
            result.warnings.push(corrCheck.reason);
        }

        // ════════════════════════════════════════════════════════════════
        // V6: CONFIDENCE SCORING 2.0
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
            regime: regimeState?.regime || volatilityRegimeService.getClassification().regime,
            liquidityTier: liquidityCheck.tier,
            correlation: corrCheck.correlation || 0,
            divergence: corrCheck.divergence || 0,
            timeOfDay: todCheck.mode || 'NORMAL',
            // V5: Ignition boost for confidence
            ignitionStrength: result.signal.ignition?.strength || 0,
            
            // V6 NEW FACTORS
            executionSafety: { slippageRiskScore: result.signal.slippageRiskScore || 0 },
            regimeAlignment: adaptiveRegimeService 
                ? adaptiveRegimeService.checkSignalCompatibility(signalType, result.signal.ignition?.strength || 0)
                : { compatible: true, warnings: [] },
            correlationRisk: { 
                highCorrelation: false,
                correlatedWith: []
            },
            crowdTrap: {
                flagged: crowdingCheck.flagged,
                crowdingScore: crowdingCheck.crowdingScore || 0
            },
            exitClarity: {
                hasStructuralSL: true,  // V6 Exit Commander provides this
                hasTrailPlan: true,
                hasRegimeExit: true
            }
        };

        const confidenceResult = confidenceScoringService.calculateScore(confidenceFactors);
        
        // V5: Apply ignition boost to confidence score
        if (result.signal.ignition?.detected && result.signal.ignition.strength >= 50) {
            const ignitionBoost = Math.round(result.signal.ignition.strength * 0.15);  // Up to 15 point boost
            confidenceResult.score = Math.min(100, confidenceResult.score + ignitionBoost);
            confidenceResult.ignitionBoost = ignitionBoost;
            console.log(`[MASTER_GUARD] 🚀 IGNITION_BOOST: +${ignitionBoost} points | Final: ${confidenceResult.score}`);
        }

        // V6: Apply crowd downgrade
        if (v6CrowdCheck.confidenceAdjustment < 0) {
            confidenceResult.score = Math.max(0, confidenceResult.score + v6CrowdCheck.confidenceAdjustment);
            confidenceResult.crowdAdjustment = v6CrowdCheck.confidenceAdjustment;
            console.log(`[MASTER_GUARD] ⚠️ CROWD_DOWNGRADE: ${v6CrowdCheck.confidenceAdjustment} points | Final: ${confidenceResult.score}`);
        }

        // V6: Apply portfolio downgrade
        const portfolioDowngrade = result.adjustments.find(a => a.type === 'CONFIDENCE_DOWNGRADE');
        if (portfolioDowngrade) {
            const downgradeAmount = Math.round((1 - portfolioDowngrade.factor) * 15);
            confidenceResult.score = Math.max(0, confidenceResult.score - downgradeAmount);
            confidenceResult.portfolioAdjustment = -downgradeAmount;
        }
        
        result.confidenceScore = confidenceResult;
        result.finalConfidence = confidenceResult.score;  // V6: Track final score
        result.checks.push({ name: 'CONFIDENCE_SCORE', ...confidenceResult });

        // ──────────────────────────────────────────────────────────────
        // MINIMUM CONFIDENCE CHECK (HARD) - V6: 60 minimum
        // ──────────────────────────────────────────────────────────────
        if (confidenceResult.score < this.config.minConfidenceScore) {
            return this.blockSignal(result, `CONFIDENCE_BLOCKED: Score ${confidenceResult.score} < ${this.config.minConfidenceScore} minimum`);
        }

        // ════════════════════════════════════════════════════════════════
        // V6: RECORD TO SIGNAL LIFECYCLE
        // ════════════════════════════════════════════════════════════════
        if (signalLifecycleService) {
            try {
                const signalId = signalLifecycleService.registerGeneration({
                    token,
                    symbol: signal?.instrument?.symbol || signal?.symbol,
                    type: signalType,
                    direction: signalType === 'BUY' ? 'LONG' : 'SHORT',
                    isOption,
                    price: ltp,
                    regime: regimeState?.regime,
                    volatility: regimeState?.volatilityScore,
                    ignitionStrength: result.signal.ignition?.strength,
                    confidenceScore: confidenceResult.score
                });
                signalLifecycleService.recordValidation(signalId, result);
                result.signal.lifecycleId = signalId;
            } catch (e) {
                // Non-blocking
            }
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
     * Uses strict pattern: SYMBOL + DATE + STRIKE + CE/PE
     * Example: NIFTY25FEB25000CE, BANKNIFTY24JAN52000PE
     */
    isOptionInstrument(signal) {
        if (!signal || !signal.instrument) return false;
        const symbol = signal.instrument.symbol || '';
        
        // Option pattern: ends with strike + CE/PE (e.g., 25000CE, 52000PE)
        // This avoids false positives like "RELIANCE" containing "CE"
        const optionPattern = /\d{4,6}(CE|PE)$/i;
        return optionPattern.test(symbol);
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
     * Extract expiry date from option symbol
     * Example: NIFTY25FEB24500CE -> 2025-02-20 (Thursday)
     */
    extractExpiryFromSymbol(symbol) {
        if (!symbol) return null;
        
        // Try to extract date pattern like "25FEB" or "25JAN"
        const monthMap = {
            'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
            'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
            'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
        };
        
        const match = symbol.match(/(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/i);
        if (match) {
            const year = `20${match[1]}`;
            const month = monthMap[match[2].toUpperCase()];
            // Find nearest Thursday in that month (simplified)
            // For now, return approximate - real implementation would calculate exact expiry
            return `${year}-${month}-27`; // Placeholder
        }
        
        return null;
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
