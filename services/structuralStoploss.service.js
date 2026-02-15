/**
 * STRUCTURAL STOPLOSS SERVICE
 * Calculates stoploss based on swing high/low + ATR buffer
 * NO STRUCTURE = NO SIGNAL (Hard rule)
 */

class StructuralStoplossService {
    constructor() {
        this.config = {
            swingLookback: 20,           // Candles to look back for swing
            atrPeriod: 14,
            atrMultiplier: 1.5,          // Buffer = ATR * multiplier
            minRR: 1.5,                  // Minimum Risk-Reward ratio
            maxStoplossPercentEquity: 4.5,   // Max 4.5% stoploss for equity
            maxStoplossPercentOption: 6,     // Max 6% stoploss for options
            minStoplossPercent: 0.3      // Min 0.3% stoploss
        };

        this.stoplossCache = new Map();  // token -> stoploss data

        console.log('[STRUCTURAL_SL] Initializing structural stoploss engine...');
        console.log('[STRUCTURAL_SL] Initialized');
    }

    /**
     * MAIN: Calculate structural stoploss for a signal
     * @param {Array} candles - OHLCV candle data
     * @param {string} signalType - 'BUY' or 'SELL'
     * @param {number} entryPrice - Proposed entry price
     * @returns {object} { valid: boolean, stoploss: number, target: number, rr: number }
     */
    calculate(candles, signalType, entryPrice) {
        if (!candles || candles.length < this.config.swingLookback) {
            return {
                valid: false,
                reason: 'STRUCTURAL_SL_BLOCK: Insufficient candles for swing detection',
                stoploss: null,
                target: null,
                rr: null
            };
        }

        // Calculate ATR for buffer
        const atr = this.calculateATR(candles);
        if (atr === 0) {
            return {
                valid: false,
                reason: 'STRUCTURAL_SL_BLOCK: Zero ATR - cannot calculate stoploss',
                stoploss: null,
                target: null,
                rr: null
            };
        }

        const atrBuffer = atr * this.config.atrMultiplier;

        let stoploss, swing, structureType;

        if (signalType === 'BUY' || signalType === 'STRONG_BUY') {
            // Find recent swing low for BUY
            swing = this.findSwingLow(candles);
            if (!swing) {
                return {
                    valid: false,
                    reason: 'STRUCTURAL_SL_BLOCK: No valid swing low found',
                    stoploss: null,
                    target: null,
                    rr: null
                };
            }
            stoploss = swing.price - atrBuffer;
            structureType = 'SWING_LOW';
        } else {
            // Find recent swing high for SELL
            swing = this.findSwingHigh(candles);
            if (!swing) {
                return {
                    valid: false,
                    reason: 'STRUCTURAL_SL_BLOCK: No valid swing high found',
                    stoploss: null,
                    target: null,
                    rr: null
                };
            }
            stoploss = swing.price + atrBuffer;
            structureType = 'SWING_HIGH';
        }

        // Calculate risk (distance to stoploss)
        const risk = Math.abs(entryPrice - stoploss);
        const riskPercent = (risk / entryPrice) * 100;

        // Validate stoploss distance
        if (riskPercent > this.config.maxStoplossPercent) {
            return {
                valid: false,
                reason: `STRUCTURAL_SL_BLOCK: Risk ${riskPercent.toFixed(2)}% > ${this.config.maxStoplossPercent}% max`,
                stoploss: Math.round(stoploss * 100) / 100,
                riskPercent: Math.round(riskPercent * 100) / 100,
                target: null,
                rr: null
            };
        }

        if (riskPercent < this.config.minStoplossPercent) {
            return {
                valid: false,
                reason: `STRUCTURAL_SL_BLOCK: Risk ${riskPercent.toFixed(2)}% < ${this.config.minStoplossPercent}% min - Too tight`,
                stoploss: Math.round(stoploss * 100) / 100,
                riskPercent: Math.round(riskPercent * 100) / 100,
                target: null,
                rr: null
            };
        }

        // Calculate target based on minimum RR
        const targetDistance = risk * this.config.minRR;
        let target;
        if (signalType === 'BUY' || signalType === 'STRONG_BUY') {
            target = entryPrice + targetDistance;
        } else {
            target = entryPrice - targetDistance;
        }

        const rr = this.config.minRR;

        return {
            valid: true,
            reason: 'STRUCTURAL_SL_OK',
            stoploss: Math.round(stoploss * 100) / 100,
            target: Math.round(target * 100) / 100,
            entry: entryPrice,
            risk: Math.round(risk * 100) / 100,
            riskPercent: Math.round(riskPercent * 100) / 100,
            rr,
            atr: Math.round(atr * 100) / 100,
            atrBuffer: Math.round(atrBuffer * 100) / 100,
            structureType,
            swingPrice: swing.price,
            swingIndex: swing.index
        };
    }

    /**
     * Find swing low (local minimum)
     */
    findSwingLow(candles) {
        const lookback = Math.min(this.config.swingLookback, candles.length);
        const recentCandles = candles.slice(-lookback);

        let swingLow = null;
        let swingIndex = -1;

        // Look for a candle where low is lower than both neighbors
        for (let i = 2; i < recentCandles.length - 2; i++) {
            const prev2 = recentCandles[i - 2].low;
            const prev1 = recentCandles[i - 1].low;
            const curr = recentCandles[i].low;
            const next1 = recentCandles[i + 1].low;
            const next2 = recentCandles[i + 2].low;

            if (curr < prev1 && curr < prev2 && curr < next1 && curr < next2) {
                if (swingLow === null || curr < swingLow) {
                    swingLow = curr;
                    swingIndex = i;
                }
            }
        }

        if (swingLow !== null) {
            return { price: swingLow, index: swingIndex };
        }

        // Fallback: use lowest low
        let lowestLow = recentCandles[0].low;
        let lowestIndex = 0;
        for (let i = 1; i < recentCandles.length; i++) {
            if (recentCandles[i].low < lowestLow) {
                lowestLow = recentCandles[i].low;
                lowestIndex = i;
            }
        }

        return { price: lowestLow, index: lowestIndex };
    }

    /**
     * Find swing high (local maximum)
     */
    findSwingHigh(candles) {
        const lookback = Math.min(this.config.swingLookback, candles.length);
        const recentCandles = candles.slice(-lookback);

        let swingHigh = null;
        let swingIndex = -1;

        // Look for a candle where high is higher than both neighbors
        for (let i = 2; i < recentCandles.length - 2; i++) {
            const prev2 = recentCandles[i - 2].high;
            const prev1 = recentCandles[i - 1].high;
            const curr = recentCandles[i].high;
            const next1 = recentCandles[i + 1].high;
            const next2 = recentCandles[i + 2].high;

            if (curr > prev1 && curr > prev2 && curr > next1 && curr > next2) {
                if (swingHigh === null || curr > swingHigh) {
                    swingHigh = curr;
                    swingIndex = i;
                }
            }
        }

        if (swingHigh !== null) {
            return { price: swingHigh, index: swingIndex };
        }

        // Fallback: use highest high
        let highestHigh = recentCandles[0].high;
        let highestIndex = 0;
        for (let i = 1; i < recentCandles.length; i++) {
            if (recentCandles[i].high > highestHigh) {
                highestHigh = recentCandles[i].high;
                highestIndex = i;
            }
        }

        return { price: highestHigh, index: highestIndex };
    }

    /**
     * Calculate ATR (Average True Range)
     */
    calculateATR(candles) {
        if (candles.length < this.config.atrPeriod + 1) {
            return 0;
        }

        const trueRanges = [];
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;

            const tr = Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
            );
            trueRanges.push(tr);
        }

        // Simple average of last N true ranges
        const recentTR = trueRanges.slice(-this.config.atrPeriod);
        return recentTR.reduce((sum, tr) => sum + tr, 0) / recentTR.length;
    }

    /**
     * Validate RR for a given setup
     */
    validateRR(entry, stoploss, target) {
        const risk = Math.abs(entry - stoploss);
        const reward = Math.abs(target - entry);
        const rr = reward / risk;

        return {
            valid: rr >= this.config.minRR,
            rr: Math.round(rr * 100) / 100,
            risk,
            reward,
            minRequired: this.config.minRR
        };
    }

    /**
     * Get cached stoploss for a token
     */
    getCached(token) {
        return this.stoplossCache.get(token) || null;
    }

    /**
     * Update config
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('[STRUCTURAL_SL] Config updated:', this.config);
    }

    /**
     * Get stats
     */
    getStats() {
        return {
            cachedCalculations: this.stoplossCache.size,
            config: this.config
        };
    }
}

module.exports = new StructuralStoplossService();
