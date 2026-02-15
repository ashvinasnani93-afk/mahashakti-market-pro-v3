/**
 * ADAPTIVE REGIME SERVICE - V6 INTELLIGENCE LAYER
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE: Intraday volatility segmentation for dynamic threshold adjustment
 * 
 * DAY CLASSIFICATIONS:
 * - COMPRESSION: Low volatility, tight range, breakout strict
 * - EXPANSION: High volatility, wide range, ignition fast allow
 * - TREND_DAY: Directional move, momentum trades
 * - RANGE_DAY: Mean reversion, fade extremes
 * - PANIC_DAY: Crash/spike, defensive mode only
 * 
 * LOGIC INPUTS:
 * - ATR slope (5m + 15m)
 * - Opening range %
 * - VWAP distance
 * - Range expansion %
 * 
 * OUTPUT:
 * - REGIME_TYPE
 * - VOLATILITY_SCORE (0-100)
 * - Dynamic thresholds for ignition & RR
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

class AdaptiveRegimeService {
    constructor() {
        this.config = {
            // ATR slope thresholds
            atrSlopeExpansion: 0.15,      // >15% = expanding
            atrSlopeCompression: -0.10,   // <-10% = compressing
            
            // Opening range
            openingRangeWindow: 15,       // First 15 minutes
            narrowORThreshold: 0.5,       // <0.5% = narrow
            wideORThreshold: 1.5,         // >1.5% = wide
            
            // VWAP distance
            vwapTrendThreshold: 0.8,      // >0.8% from VWAP = trending
            vwapRangeThreshold: 0.3,      // <0.3% from VWAP = ranging
            
            // Range expansion
            rangeExpansionThreshold: 1.5, // 1.5x normal range
            rangeCompressionThreshold: 0.6, // 0.6x normal range
            
            // Panic thresholds
            panicMoveThreshold: 3,        // >3% in 15 min
            panicVIXThreshold: 22,        // VIX > 22
            
            // Update interval
            updateIntervalMs: 60000       // 1 minute
        };

        this.state = {
            currentRegime: 'UNKNOWN',
            previousRegime: 'UNKNOWN',
            volatilityScore: 50,
            regimeConfidence: 0,
            regimeStartTime: null,
            
            // Day metrics
            openingRange: { high: 0, low: 0, percent: 0 },
            currentRange: { high: 0, low: 0, percent: 0 },
            atrSlope5m: 0,
            atrSlope15m: 0,
            vwapDistance: 0,
            rangeExpansion: 1,
            
            // Historical
            regimeHistory: [],
            transitionCount: 0
        };

        // Dynamic thresholds based on regime
        this.dynamicThresholds = {
            COMPRESSION: {
                ignitionMinStrength: 70,    // Strict - need strong signal
                minRR: 2.0,                 // Higher RR required
                confidenceMin: 65,
                volumeMultiple: 2.5         // Higher volume confirmation
            },
            EXPANSION: {
                ignitionMinStrength: 45,    // Fast allow
                minRR: 1.5,                 // Lower RR acceptable
                confidenceMin: 55,
                volumeMultiple: 1.5
            },
            TREND_DAY: {
                ignitionMinStrength: 50,
                minRR: 1.8,
                confidenceMin: 55,
                volumeMultiple: 1.8
            },
            RANGE_DAY: {
                ignitionMinStrength: 65,    // Moderate strictness
                minRR: 2.0,
                confidenceMin: 60,
                volumeMultiple: 2.0
            },
            PANIC_DAY: {
                ignitionMinStrength: 85,    // Very strict
                minRR: 2.5,                 // High RR only
                confidenceMin: 75,
                volumeMultiple: 3.0
            },
            UNKNOWN: {
                ignitionMinStrength: 60,
                minRR: 1.8,
                confidenceMin: 60,
                volumeMultiple: 2.0
            }
        };

        // NIFTY price tracking for regime calculation
        this.niftyData = {
            open: 0,
            high: 0,
            low: 0,
            current: 0,
            vwap: 0,
            candles5m: [],
            candles15m: []
        };

        this.updateInterval = null;

        console.log('[ADAPTIVE_REGIME] Initializing adaptive regime classifier...');
        console.log('[ADAPTIVE_REGIME] Regimes: COMPRESSION | EXPANSION | TREND_DAY | RANGE_DAY | PANIC_DAY');
        console.log('[ADAPTIVE_REGIME] Initialized');
    }

    /**
     * Start regime monitoring
     */
    start() {
        if (this.updateInterval) {
            console.log('[ADAPTIVE_REGIME] Already running');
            return;
        }

        this.classifyRegime();
        this.updateInterval = setInterval(() => {
            this.classifyRegime();
        }, this.config.updateIntervalMs);

        console.log('[ADAPTIVE_REGIME] Started monitoring');
    }

    /**
     * Stop monitoring
     */
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('[ADAPTIVE_REGIME] Stopped');
        }
    }

    /**
     * Update NIFTY data for regime calculation
     */
    updateNiftyData(data) {
        const { open, high, low, ltp, vwap, candles5m, candles15m } = data;

        if (open > 0) this.niftyData.open = open;
        if (high > 0) this.niftyData.high = Math.max(this.niftyData.high, high);
        if (low > 0) this.niftyData.low = this.niftyData.low === 0 ? low : Math.min(this.niftyData.low, low);
        if (ltp > 0) this.niftyData.current = ltp;
        if (vwap > 0) this.niftyData.vwap = vwap;
        if (candles5m) this.niftyData.candles5m = candles5m;
        if (candles15m) this.niftyData.candles15m = candles15m;

        // Recalculate regime on significant data update
        if (candles5m || candles15m) {
            this.classifyRegime();
        }
    }

    /**
     * MAIN: Classify current regime
     */
    classifyRegime() {
        const scores = {
            COMPRESSION: 0,
            EXPANSION: 0,
            TREND_DAY: 0,
            RANGE_DAY: 0,
            PANIC_DAY: 0
        };

        // ─────────────────────────────────────────────────────────────────────────
        // 1️⃣ ATR SLOPE ANALYSIS
        // ─────────────────────────────────────────────────────────────────────────
        this.state.atrSlope5m = this.calculateATRSlope(this.niftyData.candles5m);
        this.state.atrSlope15m = this.calculateATRSlope(this.niftyData.candles15m);
        const avgATRSlope = (this.state.atrSlope5m + this.state.atrSlope15m) / 2;

        if (avgATRSlope >= this.config.atrSlopeExpansion) {
            scores.EXPANSION += 30;
            scores.TREND_DAY += 15;
        } else if (avgATRSlope <= this.config.atrSlopeCompression) {
            scores.COMPRESSION += 35;
            scores.RANGE_DAY += 15;
        } else {
            scores.RANGE_DAY += 10;
        }

        // ─────────────────────────────────────────────────────────────────────────
        // 2️⃣ OPENING RANGE ANALYSIS
        // ─────────────────────────────────────────────────────────────────────────
        this.calculateOpeningRange();
        const orPercent = this.state.openingRange.percent;

        if (orPercent > 0) {
            if (orPercent <= this.config.narrowORThreshold) {
                scores.COMPRESSION += 25;
                scores.RANGE_DAY += 10;
            } else if (orPercent >= this.config.wideORThreshold) {
                scores.EXPANSION += 20;
                scores.TREND_DAY += 15;
            }
        }

        // ─────────────────────────────────────────────────────────────────────────
        // 3️⃣ VWAP DISTANCE ANALYSIS
        // ─────────────────────────────────────────────────────────────────────────
        if (this.niftyData.vwap > 0 && this.niftyData.current > 0) {
            this.state.vwapDistance = Math.abs(
                (this.niftyData.current - this.niftyData.vwap) / this.niftyData.vwap
            ) * 100;

            if (this.state.vwapDistance >= this.config.vwapTrendThreshold) {
                scores.TREND_DAY += 25;
                scores.EXPANSION += 10;
            } else if (this.state.vwapDistance <= this.config.vwapRangeThreshold) {
                scores.RANGE_DAY += 25;
                scores.COMPRESSION += 10;
            }
        }

        // ─────────────────────────────────────────────────────────────────────────
        // 4️⃣ RANGE EXPANSION ANALYSIS
        // ─────────────────────────────────────────────────────────────────────────
        this.calculateRangeExpansion();

        if (this.state.rangeExpansion >= this.config.rangeExpansionThreshold) {
            scores.EXPANSION += 20;
            scores.TREND_DAY += 15;
        } else if (this.state.rangeExpansion <= this.config.rangeCompressionThreshold) {
            scores.COMPRESSION += 20;
            scores.RANGE_DAY += 10;
        }

        // ─────────────────────────────────────────────────────────────────────────
        // 5️⃣ PANIC DETECTION
        // ─────────────────────────────────────────────────────────────────────────
        const panicScore = this.checkPanicConditions();
        if (panicScore > 0) {
            scores.PANIC_DAY = panicScore;
        }

        // ─────────────────────────────────────────────────────────────────────────
        // DETERMINE REGIME
        // ─────────────────────────────────────────────────────────────────────────
        let maxScore = 0;
        let newRegime = 'UNKNOWN';

        for (const [regime, score] of Object.entries(scores)) {
            if (score > maxScore) {
                maxScore = score;
                newRegime = regime;
            }
        }

        // Update state
        if (newRegime !== this.state.currentRegime) {
            this.state.previousRegime = this.state.currentRegime;
            this.state.currentRegime = newRegime;
            this.state.regimeStartTime = Date.now();
            this.state.transitionCount++;

            this.state.regimeHistory.push({
                regime: newRegime,
                timestamp: Date.now(),
                confidence: maxScore,
                metrics: {
                    atrSlope: avgATRSlope,
                    orPercent,
                    vwapDistance: this.state.vwapDistance,
                    rangeExpansion: this.state.rangeExpansion
                }
            });

            // Keep last 50 transitions
            if (this.state.regimeHistory.length > 50) {
                this.state.regimeHistory.shift();
            }

            console.log(`[ADAPTIVE_REGIME] 🔄 REGIME_SHIFT: ${this.state.previousRegime} → ${newRegime} | Confidence: ${maxScore}`);
        }

        // Calculate volatility score (0-100)
        this.state.volatilityScore = this.calculateVolatilityScore();
        this.state.regimeConfidence = maxScore;

        return {
            regime: this.state.currentRegime,
            volatilityScore: this.state.volatilityScore,
            confidence: maxScore,
            scores
        };
    }

    /**
     * Calculate ATR slope from candles
     */
    calculateATRSlope(candles) {
        if (!candles || candles.length < 10) return 0;

        const recentATR = this.calculateATR(candles.slice(-5));
        const olderATR = this.calculateATR(candles.slice(-10, -5));

        if (olderATR === 0) return 0;

        return (recentATR - olderATR) / olderATR;
    }

    /**
     * Calculate ATR
     */
    calculateATR(candles) {
        if (!candles || candles.length < 2) return 0;

        let totalTR = 0;
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;

            const tr = Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
            );
            totalTR += tr;
        }

        return totalTR / (candles.length - 1);
    }

    /**
     * Calculate opening range
     */
    calculateOpeningRange() {
        const candles = this.niftyData.candles5m;
        if (!candles || candles.length < 3) {
            return;
        }

        // First 15 minutes = 3 five-minute candles
        const orCandles = candles.slice(0, Math.min(3, candles.length));
        
        if (orCandles.length === 0) return;

        const orHigh = Math.max(...orCandles.map(c => c.high));
        const orLow = Math.min(...orCandles.map(c => c.low));
        const orPercent = orLow > 0 ? ((orHigh - orLow) / orLow) * 100 : 0;

        this.state.openingRange = {
            high: orHigh,
            low: orLow,
            percent: orPercent
        };
    }

    /**
     * Calculate range expansion
     */
    calculateRangeExpansion() {
        if (this.niftyData.high === 0 || this.niftyData.low === 0) {
            this.state.rangeExpansion = 1;
            return;
        }

        const currentRange = this.niftyData.high - this.niftyData.low;
        const orRange = this.state.openingRange.high - this.state.openingRange.low;

        if (orRange === 0) {
            this.state.rangeExpansion = 1;
            return;
        }

        this.state.rangeExpansion = currentRange / orRange;

        // Update current range state
        this.state.currentRange = {
            high: this.niftyData.high,
            low: this.niftyData.low,
            percent: this.niftyData.low > 0 
                ? ((this.niftyData.high - this.niftyData.low) / this.niftyData.low) * 100 
                : 0
        };
    }

    /**
     * Check panic conditions
     */
    checkPanicConditions() {
        let panicScore = 0;

        // Check for large move
        if (this.niftyData.open > 0 && this.niftyData.current > 0) {
            const movePercent = Math.abs(
                (this.niftyData.current - this.niftyData.open) / this.niftyData.open
            ) * 100;

            if (movePercent >= this.config.panicMoveThreshold) {
                panicScore += 50;
            }
        }

        // Check intraday range
        if (this.state.currentRange.percent >= 3) {
            panicScore += 30;
        }

        // Check ATR slope (rapid expansion)
        if (this.state.atrSlope5m > 0.3) {
            panicScore += 20;
        }

        return panicScore;
    }

    /**
     * Calculate overall volatility score (0-100)
     */
    calculateVolatilityScore() {
        let score = 50; // Base

        // ATR contribution
        const avgATRSlope = (this.state.atrSlope5m + this.state.atrSlope15m) / 2;
        score += avgATRSlope * 100; // -20 to +30

        // Range expansion contribution
        score += (this.state.rangeExpansion - 1) * 20; // -20 to +30

        // VWAP distance contribution
        score += this.state.vwapDistance * 5; // 0 to +20

        return Math.max(0, Math.min(100, Math.round(score)));
    }

    /**
     * Get dynamic thresholds for current regime
     */
    getDynamicThresholds() {
        const thresholds = this.dynamicThresholds[this.state.currentRegime] || 
                          this.dynamicThresholds.UNKNOWN;

        return {
            ...thresholds,
            regime: this.state.currentRegime,
            volatilityScore: this.state.volatilityScore
        };
    }

    /**
     * Check if signal compatible with current regime
     */
    checkSignalCompatibility(signalType, signalStrength) {
        const thresholds = this.getDynamicThresholds();

        const result = {
            compatible: true,
            regime: this.state.currentRegime,
            adjustments: [],
            warnings: []
        };

        // Check strength threshold
        if (signalStrength < thresholds.ignitionMinStrength) {
            result.compatible = false;
            result.adjustments.push({
                type: 'STRENGTH_BELOW_THRESHOLD',
                required: thresholds.ignitionMinStrength,
                actual: signalStrength
            });
        }

        // Regime-specific warnings
        if (this.state.currentRegime === 'PANIC_DAY') {
            result.warnings.push('PANIC_DAY: Only high-conviction signals allowed');
        }

        if (this.state.currentRegime === 'COMPRESSION' && signalType === 'BREAKOUT') {
            result.warnings.push('COMPRESSION: Breakout signals need extra confirmation');
        }

        if (this.state.currentRegime === 'RANGE_DAY' && signalType === 'TREND') {
            result.warnings.push('RANGE_DAY: Trend signals may face mean reversion');
        }

        return result;
    }

    /**
     * Get current regime state
     */
    getState() {
        return {
            regime: this.state.currentRegime,
            previousRegime: this.state.previousRegime,
            volatilityScore: this.state.volatilityScore,
            regimeConfidence: this.state.regimeConfidence,
            regimeDuration: this.state.regimeStartTime 
                ? Math.round((Date.now() - this.state.regimeStartTime) / 60000) 
                : 0,
            metrics: {
                atrSlope5m: this.state.atrSlope5m,
                atrSlope15m: this.state.atrSlope15m,
                openingRange: this.state.openingRange,
                currentRange: this.state.currentRange,
                vwapDistance: this.state.vwapDistance,
                rangeExpansion: this.state.rangeExpansion
            },
            thresholds: this.getDynamicThresholds(),
            transitionCount: this.state.transitionCount
        };
    }

    /**
     * Get regime history
     */
    getHistory(count = 10) {
        return this.state.regimeHistory.slice(-count);
    }

    /**
     * Get stats
     */
    getStats() {
        const history = this.state.regimeHistory;
        const regimeCounts = {};
        
        for (const entry of history) {
            regimeCounts[entry.regime] = (regimeCounts[entry.regime] || 0) + 1;
        }

        return {
            currentRegime: this.state.currentRegime,
            volatilityScore: this.state.volatilityScore,
            regimeConfidence: this.state.regimeConfidence,
            transitionCount: this.state.transitionCount,
            regimeDistribution: regimeCounts,
            config: this.config
        };
    }

    /**
     * Reset for new day
     */
    resetDaily() {
        this.state.currentRegime = 'UNKNOWN';
        this.state.previousRegime = 'UNKNOWN';
        this.state.volatilityScore = 50;
        this.state.regimeConfidence = 0;
        this.state.regimeStartTime = null;
        this.state.openingRange = { high: 0, low: 0, percent: 0 };
        this.state.currentRange = { high: 0, low: 0, percent: 0 };
        this.state.transitionCount = 0;
        this.state.regimeHistory = [];

        this.niftyData = {
            open: 0,
            high: 0,
            low: 0,
            current: 0,
            vwap: 0,
            candles5m: [],
            candles15m: []
        };

        console.log('[ADAPTIVE_REGIME] Daily reset complete');
    }
}

module.exports = new AdaptiveRegimeService();
