/**
 * CANDLE INTEGRITY SERVICE
 * Hard validation engine for candle data quality
 * Blocks signals if data integrity fails
 */

class CandleIntegrityService {
    constructor() {
        this.config = {
            minCleanCandles: 120,
            maxSingleCandleMove: 8,          // % - configurable
            maxTimestampGapMs: 5 * 60 * 1000, // 5 minutes for 5m candles
            zScoreThreshold: 4,               // Outlier detection
            minVolumeForMove: 100             // Min volume if price moved
        };
        this.validationCache = new Map();
        this.blockReasons = new Map();
        console.log('[CANDLE_INTEGRITY] Initializing candle integrity engine...');
        console.log('[CANDLE_INTEGRITY] Initialized');
    }

    /**
     * MAIN VALIDATION ENTRY POINT
     * Returns: { valid: boolean, reason: string, details: object }
     */
    validate(candles, token) {
        const result = {
            valid: true,
            reason: 'CANDLE_VALIDATION: PASSED',
            checks: [],
            blockReason: null
        };

        // Check 1: Minimum candle count
        const countCheck = this.checkMinCandleCount(candles);
        result.checks.push(countCheck);
        if (!countCheck.pass) {
            result.valid = false;
            result.reason = `CANDLE_BLOCK_REASON: ${countCheck.reason}`;
            result.blockReason = countCheck.reason;
            this.blockReasons.set(token, countCheck.reason);
            return result;
        }

        // Check 2: Timestamp gaps
        const gapCheck = this.checkTimestampGaps(candles);
        result.checks.push(gapCheck);
        if (!gapCheck.pass) {
            result.valid = false;
            result.reason = `CANDLE_BLOCK_REASON: ${gapCheck.reason}`;
            result.blockReason = gapCheck.reason;
            this.blockReasons.set(token, gapCheck.reason);
            return result;
        }

        // Check 3: High < Low invalidity
        const hlCheck = this.checkHighLowValidity(candles);
        result.checks.push(hlCheck);
        if (!hlCheck.pass) {
            result.valid = false;
            result.reason = `CANDLE_BLOCK_REASON: ${hlCheck.reason}`;
            result.blockReason = hlCheck.reason;
            this.blockReasons.set(token, hlCheck.reason);
            return result;
        }

        // Check 4: Negative range detection
        const rangeCheck = this.checkNegativeRange(candles);
        result.checks.push(rangeCheck);
        if (!rangeCheck.pass) {
            result.valid = false;
            result.reason = `CANDLE_BLOCK_REASON: ${rangeCheck.reason}`;
            result.blockReason = rangeCheck.reason;
            this.blockReasons.set(token, rangeCheck.reason);
            return result;
        }

        // Check 5: Zero volume with price move
        const volumeCheck = this.checkZeroVolumeMove(candles);
        result.checks.push(volumeCheck);
        if (!volumeCheck.pass) {
            result.valid = false;
            result.reason = `CANDLE_BLOCK_REASON: ${volumeCheck.reason}`;
            result.blockReason = volumeCheck.reason;
            this.blockReasons.set(token, volumeCheck.reason);
            return result;
        }

        // Check 6: Z-score outlier spike
        const zScoreCheck = this.checkZScoreOutlier(candles);
        result.checks.push(zScoreCheck);
        if (!zScoreCheck.pass) {
            result.valid = false;
            result.reason = `CANDLE_BLOCK_REASON: ${zScoreCheck.reason}`;
            result.blockReason = zScoreCheck.reason;
            this.blockReasons.set(token, zScoreCheck.reason);
            return result;
        }

        // Check 7: Single candle > 8% move
        const singleMoveCheck = this.checkSingleCandleMove(candles);
        result.checks.push(singleMoveCheck);
        if (!singleMoveCheck.pass) {
            result.valid = false;
            result.reason = `CANDLE_BLOCK_REASON: ${singleMoveCheck.reason}`;
            result.blockReason = singleMoveCheck.reason;
            this.blockReasons.set(token, singleMoveCheck.reason);
            return result;
        }

        // All checks passed
        this.blockReasons.delete(token);
        this.validationCache.set(token, {
            timestamp: Date.now(),
            result: result
        });

        return result;
    }

    // CHECK 1: Minimum clean candles
    checkMinCandleCount(candles) {
        const count = candles?.length || 0;
        const required = this.config.minCleanCandles;
        
        return {
            name: 'MIN_CANDLE_COUNT',
            pass: count >= required,
            reason: count < required ? `Insufficient candles: ${count}/${required}` : null,
            value: count,
            threshold: required
        };
    }

    // CHECK 2: Timestamp gaps
    checkTimestampGaps(candles) {
        if (!candles || candles.length < 2) {
            return { name: 'TIMESTAMP_GAP', pass: true, reason: null };
        }

        const maxGap = this.config.maxTimestampGapMs;
        let maxFoundGap = 0;
        let gapIndex = -1;

        for (let i = 1; i < candles.length; i++) {
            const gap = candles[i].timestamp - candles[i-1].timestamp;
            // Allow for market hours gaps (overnight, weekends)
            // Only flag unexpected gaps during trading hours
            if (gap > maxGap && gap < 24 * 60 * 60 * 1000) { // Less than 24 hours
                if (gap > maxFoundGap) {
                    maxFoundGap = gap;
                    gapIndex = i;
                }
            }
        }

        const hasGap = maxFoundGap > maxGap * 2; // Double threshold for hard block
        
        return {
            name: 'TIMESTAMP_GAP',
            pass: !hasGap,
            reason: hasGap ? `Timestamp gap at index ${gapIndex}: ${Math.round(maxFoundGap / 60000)}min` : null,
            maxGapMs: maxFoundGap
        };
    }

    // CHECK 3: High < Low invalidity
    checkHighLowValidity(candles) {
        if (!candles || candles.length === 0) {
            return { name: 'HIGH_LOW_VALIDITY', pass: true, reason: null };
        }

        for (let i = 0; i < candles.length; i++) {
            const c = candles[i];
            if (c.high < c.low) {
                return {
                    name: 'HIGH_LOW_VALIDITY',
                    pass: false,
                    reason: `High < Low at index ${i}: H=${c.high}, L=${c.low}`,
                    invalidIndex: i
                };
            }
        }

        return { name: 'HIGH_LOW_VALIDITY', pass: true, reason: null };
    }

    // CHECK 4: Negative range
    checkNegativeRange(candles) {
        if (!candles || candles.length === 0) {
            return { name: 'NEGATIVE_RANGE', pass: true, reason: null };
        }

        for (let i = 0; i < candles.length; i++) {
            const c = candles[i];
            const range = c.high - c.low;
            if (range < 0) {
                return {
                    name: 'NEGATIVE_RANGE',
                    pass: false,
                    reason: `Negative range at index ${i}: ${range}`,
                    invalidIndex: i
                };
            }
        }

        return { name: 'NEGATIVE_RANGE', pass: true, reason: null };
    }

    // CHECK 5: Zero volume with price move
    checkZeroVolumeMove(candles) {
        if (!candles || candles.length === 0) {
            return { name: 'ZERO_VOLUME_MOVE', pass: true, reason: null };
        }

        const recentCandles = candles.slice(-20); // Check last 20 candles only
        
        for (let i = 0; i < recentCandles.length; i++) {
            const c = recentCandles[i];
            const move = Math.abs(c.close - c.open);
            const movePercent = (move / c.open) * 100;
            
            // If significant move (>0.5%) but zero volume
            if (movePercent > 0.5 && c.volume === 0) {
                return {
                    name: 'ZERO_VOLUME_MOVE',
                    pass: false,
                    reason: `Zero volume with ${movePercent.toFixed(2)}% move at recent index ${i}`,
                    invalidIndex: i,
                    movePercent
                };
            }
        }

        return { name: 'ZERO_VOLUME_MOVE', pass: true, reason: null };
    }

    // CHECK 6: Z-score outlier
    checkZScoreOutlier(candles) {
        if (!candles || candles.length < 30) {
            return { name: 'ZSCORE_OUTLIER', pass: true, reason: null };
        }

        // Calculate returns
        const returns = [];
        for (let i = 1; i < candles.length; i++) {
            const ret = ((candles[i].close - candles[i-1].close) / candles[i-1].close) * 100;
            returns.push(ret);
        }

        // Calculate mean and std
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
        const std = Math.sqrt(variance);

        if (std === 0) {
            return { name: 'ZSCORE_OUTLIER', pass: true, reason: null };
        }

        // Check last 5 candles for outliers
        const recentReturns = returns.slice(-5);
        for (let i = 0; i < recentReturns.length; i++) {
            const zScore = Math.abs((recentReturns[i] - mean) / std);
            if (zScore > this.config.zScoreThreshold) {
                return {
                    name: 'ZSCORE_OUTLIER',
                    pass: false,
                    reason: `Z-score outlier: ${zScore.toFixed(2)} > ${this.config.zScoreThreshold}`,
                    zScore,
                    returnPercent: recentReturns[i]
                };
            }
        }

        return { name: 'ZSCORE_OUTLIER', pass: true, reason: null };
    }

    // CHECK 7: Single candle > 8% move
    checkSingleCandleMove(candles) {
        if (!candles || candles.length === 0) {
            return { name: 'SINGLE_CANDLE_MOVE', pass: true, reason: null };
        }

        const threshold = this.config.maxSingleCandleMove;
        const recentCandles = candles.slice(-10); // Check last 10

        for (let i = 0; i < recentCandles.length; i++) {
            const c = recentCandles[i];
            const movePercent = Math.abs((c.close - c.open) / c.open) * 100;
            
            if (movePercent > threshold) {
                return {
                    name: 'SINGLE_CANDLE_MOVE',
                    pass: false,
                    reason: `Single candle ${movePercent.toFixed(2)}% > ${threshold}% threshold`,
                    movePercent,
                    threshold
                };
            }
        }

        return { name: 'SINGLE_CANDLE_MOVE', pass: true, reason: null };
    }

    // Get block reason for a token
    getBlockReason(token) {
        return this.blockReasons.get(token) || null;
    }

    // Check if token is currently blocked
    isBlocked(token) {
        return this.blockReasons.has(token);
    }

    // Get validation stats
    getStats() {
        return {
            cachedValidations: this.validationCache.size,
            blockedTokens: this.blockReasons.size,
            blockedList: Array.from(this.blockReasons.entries()).map(([token, reason]) => ({
                token,
                reason
            })),
            config: this.config
        };
    }

    // Update config
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('[CANDLE_INTEGRITY] Config updated:', this.config);
    }

    // Clear cache
    clearCache() {
        this.validationCache.clear();
        this.blockReasons.clear();
        console.log('[CANDLE_INTEGRITY] Cache cleared');
    }
}

module.exports = new CandleIntegrityService();
