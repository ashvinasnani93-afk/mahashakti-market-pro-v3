/**
 * RUNNER PROBABILITY STOCK SERVICE - V7 ELITE MODE
 * ═══════════════════════════════════════════════════════════════════════════
 * ELITE RUNNER DETECTION FOR STOCKS
 * 
 * HARD FILTERS (ALL MUST PASS):
 * 1. Move ≤ 3% from open (no late entry)
 * 2. Opening compression ≤ 0.6%
 * 3. Volume ≥ 2.5x (20-period avg)
 * 4. Volume structure proxy (replaces delivery)
 * 5. RS ≥ +2% vs NIFTY
 * 6. ATR expansion slope rising
 * 7. Spread ≤ 0.6%
 * 8. No exhaustion wick > 40%
 * 9. Not near circuit (<3% from limit)
 * 10. Gap < 4% OR base formed
 * 11. Structural SL ≤ 4.5%
 * 12. Confidence ≥ 60
 * 13. RunnerScore ≥ 75
 * 
 * ELITE_RUNNER: Score ≥ 85 → +8 confidence, CORE priority
 * 
 * AUTO-ADJUST (if 0 signals):
 * - RunnerScore: 85 → 80 → 75
 * - Volume: 2.5x → 2.0x
 * - NEVER loosen: Spread, Structural SL
 * ═══════════════════════════════════════════════════════════════════════════
 */

class RunnerProbabilityStockService {
    constructor() {
        // Hard filter thresholds (NEVER LOOSEN marked)
        this.config = {
            // Move filter
            maxMoveFromOpen: 3,          // Max 3% move from open
            
            // Compression filter
            maxOpeningCompression: 0.6,   // Max 0.6% opening range
            
            // Volume filters (CAN ADJUST)
            minVolumeMultiple: 2.5,       // Min 2.5x avg volume
            volumeLookback: 20,           // 20-period average
            minVolumeCluster: 1.5,        // 15-min volume clustering
            
            // RS filter
            minRSvsNifty: 2,              // Min +2% RS vs NIFTY
            
            // ATR filter
            atrLookback: 14,
            minATRSlopeRise: 0.1,         // ATR must be rising
            
            // Spread filter (NEVER LOOSEN)
            maxSpread: 0.6,               // Max 0.6% spread
            
            // Wick filter
            maxExhaustionWick: 40,        // Max 40% wick
            
            // Circuit filter
            circuitProximity: 3,          // Block if within 3% of circuit
            
            // Gap filter
            maxGapWithoutBase: 4,         // Max 4% gap unless base formed
            
            // Base formation
            baseMinCandles: 3,
            baseMaxCandles: 8,
            baseMaxRangeATR: 1.2,         // Range < 1.2 ATR
            gapHoldMinMinutes: 10,
            maxGapFillPercent: 40,
            
            // SL filter (NEVER LOOSEN)
            maxStructuralSL: 4.5,         // Max 4.5% SL
            
            // Confidence filter
            minConfidence: 60,
            
            // Runner score thresholds (CAN ADJUST)
            minRunnerScore: 75,
            eliteRunnerScore: 85,
            eliteConfidenceBoost: 8,
            
            // Auto-adjust levels
            autoAdjustLevels: {
                runnerScore: [85, 80, 75],
                volumeMultiple: [2.5, 2.0, 1.8]
            }
        };

        // Score weights (total = 100)
        this.scoreWeights = {
            moveFromOpen: 15,        // Early entry = high weight
            volumeStrength: 15,      // Volume conviction
            rsStrength: 12,          // Relative strength
            atrExpansion: 12,        // Volatility expansion
            compression: 10,         // Coiled spring
            spreadQuality: 10,       // Execution quality
            wickHealth: 8,           // No exhaustion
            baseFormation: 8,        // Structure
            vwapHold: 5,             // VWAP support
            blockActivity: 5         // Institutional interest
        };

        // State
        this.autoAdjustLevel = 0;    // 0 = strictest, 1,2 = progressively looser
        this.signalHistory = [];
        this.rejectionLog = [];

        console.log('[RUNNER_STOCK] Initializing V7 Elite Runner Stock Detection...');
        console.log('[RUNNER_STOCK] Hard filters: 13 | Score weights: 10 factors');
        console.log('[RUNNER_STOCK] Elite threshold: ' + this.config.eliteRunnerScore);
        console.log('[RUNNER_STOCK] Initialized');
    }

    /**
     * MAIN: Evaluate stock for runner probability
     * @param {object} data - Stock data with candles, market context
     * @returns {object} { passed, score, isElite, breakdown, rejections }
     */
    evaluate(data) {
        const {
            symbol,
            token,
            candles,
            currentPrice,
            openPrice,
            spread,
            niftyChange,
            circuitLimits,
            confidence,
            structuralSL,
            vwap,
            blockOrderScore
        } = data;

        const result = {
            symbol,
            token,
            timestamp: new Date().toISOString(),
            passed: false,
            score: 0,
            isElite: false,
            tag: null,
            confidenceBoost: 0,
            breakdown: {},
            rejections: [],
            hardFiltersPassed: 0,
            totalHardFilters: 13
        };

        // ═══════════════════════════════════════════════════════════════
        // HARD FILTER CHECKS (ALL MUST PASS)
        // ═══════════════════════════════════════════════════════════════

        // 1️⃣ MOVE FROM OPEN CHECK
        const moveFromOpen = this.calculateMoveFromOpen(currentPrice, openPrice);
        const moveCheck = this.checkMoveFromOpen(moveFromOpen);
        result.breakdown.moveFromOpen = moveCheck;
        if (!moveCheck.passed) {
            result.rejections.push({
                filter: 'MOVE_FROM_OPEN',
                reason: `Move ${moveFromOpen.toFixed(2)}% > ${this.config.maxMoveFromOpen}% max`,
                value: moveFromOpen,
                threshold: this.config.maxMoveFromOpen,
                severity: 'HARD_BLOCK'
            });
        } else {
            result.hardFiltersPassed++;
        }

        // 2️⃣ OPENING COMPRESSION CHECK
        const compressionCheck = this.checkOpeningCompression(candles);
        result.breakdown.compression = compressionCheck;
        if (!compressionCheck.passed) {
            result.rejections.push({
                filter: 'OPENING_COMPRESSION',
                reason: `Compression ${compressionCheck.value?.toFixed(2)}% > ${this.config.maxOpeningCompression}% max`,
                value: compressionCheck.value,
                threshold: this.config.maxOpeningCompression,
                severity: 'HARD_BLOCK'
            });
        } else {
            result.hardFiltersPassed++;
        }

        // 3️⃣ VOLUME STRENGTH CHECK
        const volumeCheck = this.checkVolumeStrength(candles);
        result.breakdown.volumeStrength = volumeCheck;
        if (!volumeCheck.passed) {
            result.rejections.push({
                filter: 'VOLUME_STRENGTH',
                reason: `Volume ${volumeCheck.multiple?.toFixed(2)}x < ${this.getActiveVolumeThreshold()}x min`,
                value: volumeCheck.multiple,
                threshold: this.getActiveVolumeThreshold(),
                severity: 'HARD_BLOCK'
            });
        } else {
            result.hardFiltersPassed++;
        }

        // 4️⃣ VOLUME STRUCTURE PROXY (replaces delivery)
        const volumeStructureCheck = this.checkVolumeStructure(candles, vwap, blockOrderScore);
        result.breakdown.volumeStructure = volumeStructureCheck;
        if (!volumeStructureCheck.passed) {
            result.rejections.push({
                filter: 'VOLUME_STRUCTURE',
                reason: volumeStructureCheck.reason,
                value: volumeStructureCheck.score,
                threshold: 50,
                severity: 'HARD_BLOCK'
            });
        } else {
            result.hardFiltersPassed++;
        }

        // 5️⃣ RELATIVE STRENGTH CHECK
        const rsCheck = this.checkRelativeStrength(currentPrice, openPrice, niftyChange);
        result.breakdown.rsStrength = rsCheck;
        if (!rsCheck.passed) {
            result.rejections.push({
                filter: 'RELATIVE_STRENGTH',
                reason: `RS ${rsCheck.rsValue?.toFixed(2)}% < ${this.config.minRSvsNifty}% min`,
                value: rsCheck.rsValue,
                threshold: this.config.minRSvsNifty,
                severity: 'HARD_BLOCK'
            });
        } else {
            result.hardFiltersPassed++;
        }

        // 6️⃣ ATR EXPANSION CHECK
        const atrCheck = this.checkATRExpansion(candles);
        result.breakdown.atrExpansion = atrCheck;
        if (!atrCheck.passed) {
            result.rejections.push({
                filter: 'ATR_EXPANSION',
                reason: `ATR slope ${atrCheck.slope?.toFixed(3)} not rising`,
                value: atrCheck.slope,
                threshold: this.config.minATRSlopeRise,
                severity: 'HARD_BLOCK'
            });
        } else {
            result.hardFiltersPassed++;
        }

        // 7️⃣ SPREAD CHECK (NEVER LOOSEN)
        const spreadCheck = this.checkSpread(spread);
        result.breakdown.spreadQuality = spreadCheck;
        if (!spreadCheck.passed) {
            result.rejections.push({
                filter: 'SPREAD',
                reason: `Spread ${spread?.toFixed(2)}% > ${this.config.maxSpread}% max (NEVER LOOSEN)`,
                value: spread,
                threshold: this.config.maxSpread,
                severity: 'HARD_BLOCK_PERMANENT'
            });
        } else {
            result.hardFiltersPassed++;
        }

        // 8️⃣ EXHAUSTION WICK CHECK
        const wickCheck = this.checkExhaustionWick(candles);
        result.breakdown.wickHealth = wickCheck;
        if (!wickCheck.passed) {
            result.rejections.push({
                filter: 'EXHAUSTION_WICK',
                reason: `Wick ${wickCheck.wickPercent?.toFixed(1)}% > ${this.config.maxExhaustionWick}% max`,
                value: wickCheck.wickPercent,
                threshold: this.config.maxExhaustionWick,
                severity: 'HARD_BLOCK'
            });
        } else {
            result.hardFiltersPassed++;
        }

        // 9️⃣ CIRCUIT PROXIMITY CHECK
        const circuitCheck = this.checkCircuitProximity(currentPrice, circuitLimits);
        result.breakdown.circuitSafety = circuitCheck;
        if (!circuitCheck.passed) {
            result.rejections.push({
                filter: 'CIRCUIT_PROXIMITY',
                reason: `Within ${circuitCheck.proximityPercent?.toFixed(2)}% of circuit limit`,
                value: circuitCheck.proximityPercent,
                threshold: this.config.circuitProximity,
                severity: 'HARD_BLOCK'
            });
        } else {
            result.hardFiltersPassed++;
        }

        // 🔟 GAP + BASE FORMATION CHECK
        const gapBaseCheck = this.checkGapAndBase(candles, openPrice);
        result.breakdown.baseFormation = gapBaseCheck;
        if (!gapBaseCheck.passed) {
            result.rejections.push({
                filter: 'GAP_BASE',
                reason: gapBaseCheck.reason,
                value: gapBaseCheck.gapPercent,
                threshold: this.config.maxGapWithoutBase,
                severity: 'HARD_BLOCK'
            });
        } else {
            result.hardFiltersPassed++;
        }

        // 1️⃣1️⃣ STRUCTURAL SL CHECK (NEVER LOOSEN)
        const slCheck = this.checkStructuralSL(structuralSL);
        result.breakdown.structuralSL = slCheck;
        if (!slCheck.passed) {
            result.rejections.push({
                filter: 'STRUCTURAL_SL',
                reason: `SL ${structuralSL?.toFixed(2)}% > ${this.config.maxStructuralSL}% max (NEVER LOOSEN)`,
                value: structuralSL,
                threshold: this.config.maxStructuralSL,
                severity: 'HARD_BLOCK_PERMANENT'
            });
        } else {
            result.hardFiltersPassed++;
        }

        // 1️⃣2️⃣ CONFIDENCE CHECK
        const confCheck = this.checkConfidence(confidence);
        result.breakdown.confidence = confCheck;
        if (!confCheck.passed) {
            result.rejections.push({
                filter: 'CONFIDENCE',
                reason: `Confidence ${confidence} < ${this.config.minConfidence} min`,
                value: confidence,
                threshold: this.config.minConfidence,
                severity: 'HARD_BLOCK'
            });
        } else {
            result.hardFiltersPassed++;
        }

        // ═══════════════════════════════════════════════════════════════
        // RUNNER SCORE CALCULATION
        // ═══════════════════════════════════════════════════════════════

        result.score = this.calculateRunnerScore(result.breakdown, data);

        // 1️⃣3️⃣ RUNNER SCORE CHECK
        const activeScoreThreshold = this.getActiveRunnerScoreThreshold();
        const scoreCheck = {
            passed: result.score >= activeScoreThreshold,
            score: result.score,
            threshold: activeScoreThreshold,
            adjustLevel: this.autoAdjustLevel
        };
        result.breakdown.runnerScore = scoreCheck;
        
        if (!scoreCheck.passed) {
            result.rejections.push({
                filter: 'RUNNER_SCORE',
                reason: `RunnerScore ${result.score} < ${activeScoreThreshold} min`,
                value: result.score,
                threshold: activeScoreThreshold,
                severity: 'HARD_BLOCK'
            });
        } else {
            result.hardFiltersPassed++;
        }

        // ═══════════════════════════════════════════════════════════════
        // FINAL DECISION
        // ═══════════════════════════════════════════════════════════════

        result.passed = result.hardFiltersPassed === result.totalHardFilters;

        // Check for ELITE status
        if (result.passed && result.score >= this.config.eliteRunnerScore) {
            result.isElite = true;
            result.tag = 'ELITE_RUNNER';
            result.confidenceBoost = this.config.eliteConfidenceBoost;
        } else if (result.passed) {
            result.tag = 'RUNNER';
        }

        // Log result
        this.logResult(result);

        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INDIVIDUAL FILTER IMPLEMENTATIONS
    // ═══════════════════════════════════════════════════════════════════════

    calculateMoveFromOpen(currentPrice, openPrice) {
        if (!openPrice || openPrice === 0) return 0;
        return Math.abs((currentPrice - openPrice) / openPrice) * 100;
    }

    checkMoveFromOpen(movePercent) {
        return {
            passed: movePercent <= this.config.maxMoveFromOpen,
            value: movePercent,
            threshold: this.config.maxMoveFromOpen,
            score: Math.max(0, 100 - (movePercent / this.config.maxMoveFromOpen) * 50)
        };
    }

    checkOpeningCompression(candles) {
        if (!candles || candles.length < 3) {
            return { passed: false, value: null, reason: 'Insufficient candles' };
        }

        // First 15 minutes (3 x 5-min candles)
        const openingCandles = candles.slice(0, 3);
        const highestHigh = Math.max(...openingCandles.map(c => c.high));
        const lowestLow = Math.min(...openingCandles.map(c => c.low));
        const openPrice = openingCandles[0].open;
        
        const compressionPercent = ((highestHigh - lowestLow) / openPrice) * 100;

        return {
            passed: compressionPercent <= this.config.maxOpeningCompression,
            value: compressionPercent,
            threshold: this.config.maxOpeningCompression,
            score: compressionPercent <= this.config.maxOpeningCompression 
                ? 100 - (compressionPercent / this.config.maxOpeningCompression) * 30
                : 0
        };
    }

    checkVolumeStrength(candles) {
        if (!candles || candles.length < this.config.volumeLookback) {
            return { passed: false, multiple: null, reason: 'Insufficient candles' };
        }

        // Get recent 3 candles average (current session volume)
        const recentVolumes = candles.slice(-3).map(c => c.volume);
        const currentSessionVolume = recentVolumes.reduce((a, b) => a + b, 0) / 3;
        
        // Get historical average (excluding last 3)
        const historicalCandles = candles.slice(0, -3);
        const avgVolume = historicalCandles.reduce((sum, c) => sum + c.volume, 0) / historicalCandles.length;
        
        const multiple = currentSessionVolume / (avgVolume || 1);
        const threshold = this.getActiveVolumeThreshold();

        return {
            passed: multiple >= threshold,
            multiple,
            avgVolume,
            currentSessionVolume,
            threshold,
            score: Math.min(100, (multiple / threshold) * 60)
        };
    }

    checkVolumeStructure(candles, vwap, blockOrderScore) {
        // Volume structure proxy (replaces delivery data)
        let score = 0;
        const reasons = [];

        // 1. Volume clustering in last 15 min (3 candles)
        if (candles && candles.length >= 6) {
            const recent3Vol = candles.slice(-3).reduce((sum, c) => sum + c.volume, 0);
            const prev3Vol = candles.slice(-6, -3).reduce((sum, c) => sum + c.volume, 0);
            const clustering = recent3Vol / (prev3Vol || 1);
            
            if (clustering >= this.config.minVolumeCluster) {
                score += 30;
                reasons.push(`Volume clustering ${clustering.toFixed(2)}x`);
            }
        }

        // 2. VWAP hold strength
        if (vwap && candles && candles.length > 0) {
            const currentPrice = candles[candles.length - 1].close;
            const vwapDistance = ((currentPrice - vwap) / vwap) * 100;
            
            if (vwapDistance >= -0.3 && vwapDistance <= 2) {
                score += 35;
                reasons.push(`VWAP hold: ${vwapDistance.toFixed(2)}%`);
            }
        }

        // 3. Block order activity
        if (blockOrderScore && blockOrderScore > 0) {
            score += Math.min(35, blockOrderScore * 0.35);
            reasons.push(`Block activity: ${blockOrderScore}`);
        }

        return {
            passed: score >= 50,
            score,
            reasons,
            reason: score < 50 ? 'Weak volume structure' : 'Strong volume structure'
        };
    }

    checkRelativeStrength(currentPrice, openPrice, niftyChange) {
        const stockChange = ((currentPrice - openPrice) / openPrice) * 100;
        const rsValue = stockChange - (niftyChange || 0);

        return {
            passed: rsValue >= this.config.minRSvsNifty,
            rsValue,
            stockChange,
            niftyChange,
            threshold: this.config.minRSvsNifty,
            score: Math.min(100, Math.max(0, (rsValue / this.config.minRSvsNifty) * 50))
        };
    }

    checkATRExpansion(candles) {
        if (!candles || candles.length < this.config.atrLookback + 5) {
            return { passed: false, slope: null, reason: 'Insufficient candles' };
        }

        // Calculate ATR for recent and previous periods
        const recentATR = this.calculateATR(candles.slice(-this.config.atrLookback));
        const prevATR = this.calculateATR(candles.slice(-(this.config.atrLookback + 5), -5));

        // Handle zero/near-zero ATR (compression scenario)
        if (prevATR < 0.0001) {
            // In compression, any ATR is expansion
            return {
                passed: recentATR > 0,
                slope: recentATR > 0 ? 1 : 0,
                recentATR,
                prevATR,
                threshold: this.config.minATRSlopeRise,
                score: recentATR > 0 ? 80 : 0,
                note: 'Compression base - any expansion is valid'
            };
        }

        const slope = (recentATR - prevATR) / prevATR;

        return {
            passed: slope >= this.config.minATRSlopeRise,
            slope,
            recentATR,
            prevATR,
            threshold: this.config.minATRSlopeRise,
            score: slope >= this.config.minATRSlopeRise ? Math.min(100, slope * 200) : 0
        };
    }

    calculateATR(candles) {
        if (!candles || candles.length < 2) return 0;
        
        let trSum = 0;
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;
            const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
            trSum += tr;
        }
        return trSum / (candles.length - 1);
    }

    checkSpread(spread) {
        if (spread === undefined || spread === null) {
            return { passed: false, value: null, reason: 'No spread data' };
        }

        return {
            passed: spread <= this.config.maxSpread,
            value: spread,
            threshold: this.config.maxSpread,
            score: spread <= this.config.maxSpread ? 100 - (spread / this.config.maxSpread) * 50 : 0
        };
    }

    checkExhaustionWick(candles) {
        if (!candles || candles.length < 1) {
            return { passed: true, wickPercent: 0 };
        }

        const lastCandle = candles[candles.length - 1];
        const body = Math.abs(lastCandle.close - lastCandle.open);
        const totalRange = lastCandle.high - lastCandle.low;
        
        if (totalRange === 0) return { passed: true, wickPercent: 0 };

        const upperWick = lastCandle.high - Math.max(lastCandle.close, lastCandle.open);
        const lowerWick = Math.min(lastCandle.close, lastCandle.open) - lastCandle.low;
        const maxWick = Math.max(upperWick, lowerWick);
        const wickPercent = (maxWick / totalRange) * 100;

        return {
            passed: wickPercent <= this.config.maxExhaustionWick,
            wickPercent,
            upperWick,
            lowerWick,
            threshold: this.config.maxExhaustionWick,
            score: wickPercent <= this.config.maxExhaustionWick ? 100 - wickPercent : 0
        };
    }

    checkCircuitProximity(currentPrice, circuitLimits) {
        if (!circuitLimits) {
            return { passed: true, proximityPercent: 100, reason: 'No circuit data' };
        }

        const { upper, lower } = circuitLimits;
        const upperProximity = upper ? ((upper - currentPrice) / currentPrice) * 100 : 100;
        const lowerProximity = lower ? ((currentPrice - lower) / currentPrice) * 100 : 100;
        const proximityPercent = Math.min(upperProximity, lowerProximity);

        return {
            passed: proximityPercent >= this.config.circuitProximity,
            proximityPercent,
            upperProximity,
            lowerProximity,
            threshold: this.config.circuitProximity,
            score: proximityPercent >= this.config.circuitProximity ? 100 : 0
        };
    }

    checkGapAndBase(candles, todayOpen) {
        if (!candles || candles.length < 10) {
            return { passed: true, gapPercent: 0, baseFormed: false };
        }

        // Find previous day close (assume last candle before today)
        const prevClose = candles[0].open; // Approximation
        const gapPercent = ((todayOpen - prevClose) / prevClose) * 100;

        // If gap < threshold, pass
        if (Math.abs(gapPercent) < this.config.maxGapWithoutBase) {
            return {
                passed: true,
                gapPercent,
                baseFormed: false,
                reason: 'Gap within limit'
            };
        }

        // Check for base formation
        const baseFormed = this.detectBaseFormation(candles);
        
        return {
            passed: baseFormed,
            gapPercent,
            baseFormed,
            reason: baseFormed ? 'Base formed after gap' : `Gap ${gapPercent.toFixed(2)}% without base formation`
        };
    }

    detectBaseFormation(candles) {
        if (!candles || candles.length < this.config.baseMinCandles) {
            return false;
        }

        // Look at recent candles for compression
        const recentCandles = candles.slice(-this.config.baseMaxCandles);
        
        // Calculate range
        const highestHigh = Math.max(...recentCandles.map(c => c.high));
        const lowestLow = Math.min(...recentCandles.map(c => c.low));
        const range = highestHigh - lowestLow;
        
        // Calculate ATR for comparison
        const atr = this.calculateATR(recentCandles);
        
        // Check if range is compressed (< 1.2 ATR)
        const rangeToATR = range / atr;
        
        // Check volume dry-up then expansion
        const volumes = recentCandles.map(c => c.volume);
        const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
        const lastVol = volumes[volumes.length - 1];
        const volumeExpansion = lastVol > avgVol * 1.3;

        return rangeToATR <= this.config.baseMaxRangeATR && volumeExpansion;
    }

    checkStructuralSL(structuralSL) {
        if (structuralSL === undefined || structuralSL === null) {
            return { passed: false, value: null, reason: 'No SL data' };
        }

        return {
            passed: structuralSL <= this.config.maxStructuralSL,
            value: structuralSL,
            threshold: this.config.maxStructuralSL,
            score: structuralSL <= this.config.maxStructuralSL ? 100 - (structuralSL / this.config.maxStructuralSL) * 30 : 0
        };
    }

    checkConfidence(confidence) {
        if (confidence === undefined || confidence === null) {
            return { passed: false, value: null, reason: 'No confidence data' };
        }

        return {
            passed: confidence >= this.config.minConfidence,
            value: confidence,
            threshold: this.config.minConfidence,
            score: confidence >= this.config.minConfidence ? confidence : 0
        };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RUNNER SCORE CALCULATION
    // ═══════════════════════════════════════════════════════════════════════

    calculateRunnerScore(breakdown, data) {
        let totalScore = 0;

        // Move from open (15 pts) - lower is better
        if (breakdown.moveFromOpen?.score) {
            totalScore += (breakdown.moveFromOpen.score / 100) * this.scoreWeights.moveFromOpen;
        }

        // Volume strength (15 pts)
        if (breakdown.volumeStrength?.score) {
            totalScore += (breakdown.volumeStrength.score / 100) * this.scoreWeights.volumeStrength;
        }

        // RS strength (12 pts)
        if (breakdown.rsStrength?.score) {
            totalScore += (breakdown.rsStrength.score / 100) * this.scoreWeights.rsStrength;
        }

        // ATR expansion (12 pts)
        if (breakdown.atrExpansion?.score) {
            totalScore += (breakdown.atrExpansion.score / 100) * this.scoreWeights.atrExpansion;
        }

        // Compression (10 pts)
        if (breakdown.compression?.score) {
            totalScore += (breakdown.compression.score / 100) * this.scoreWeights.compression;
        }

        // Spread quality (10 pts)
        if (breakdown.spreadQuality?.score) {
            totalScore += (breakdown.spreadQuality.score / 100) * this.scoreWeights.spreadQuality;
        }

        // Wick health (8 pts)
        if (breakdown.wickHealth?.score) {
            totalScore += (breakdown.wickHealth.score / 100) * this.scoreWeights.wickHealth;
        }

        // Base formation (8 pts)
        if (breakdown.baseFormation?.baseFormed) {
            totalScore += this.scoreWeights.baseFormation;
        }

        // VWAP hold (5 pts) - from volume structure
        if (breakdown.volumeStructure?.score >= 50) {
            totalScore += this.scoreWeights.vwapHold;
        }

        // Block activity (5 pts)
        if (data.blockOrderScore && data.blockOrderScore > 50) {
            totalScore += this.scoreWeights.blockActivity;
        }

        return Math.round(totalScore);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // AUTO-ADJUST LOGIC
    // ═══════════════════════════════════════════════════════════════════════

    getActiveRunnerScoreThreshold() {
        const levels = this.config.autoAdjustLevels.runnerScore;
        return levels[Math.min(this.autoAdjustLevel, levels.length - 1)];
    }

    getActiveVolumeThreshold() {
        const levels = this.config.autoAdjustLevels.volumeMultiple;
        return levels[Math.min(this.autoAdjustLevel, levels.length - 1)];
    }

    adjustThresholds(direction = 'loosen') {
        if (direction === 'loosen' && this.autoAdjustLevel < 2) {
            this.autoAdjustLevel++;
            console.log(`[RUNNER_STOCK] ⚙️ Auto-adjusted to level ${this.autoAdjustLevel}`);
            console.log(`[RUNNER_STOCK] New thresholds: RunnerScore=${this.getActiveRunnerScoreThreshold()}, Volume=${this.getActiveVolumeThreshold()}x`);
        } else if (direction === 'tighten' && this.autoAdjustLevel > 0) {
            this.autoAdjustLevel--;
            console.log(`[RUNNER_STOCK] ⚙️ Tightened to level ${this.autoAdjustLevel}`);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // LOGGING
    // ═══════════════════════════════════════════════════════════════════════

    logResult(result) {
        const status = result.passed 
            ? (result.isElite ? '🌟 ELITE_RUNNER' : '✅ RUNNER')
            : '🚫 REJECTED';

        console.log(`[RUNNER_STOCK] ${status} | ${result.symbol} | Score: ${result.score} | Filters: ${result.hardFiltersPassed}/${result.totalHardFilters}`);
        
        if (result.rejections.length > 0) {
            result.rejections.forEach(r => {
                console.log(`[RUNNER_STOCK]   └─ ${r.filter}: ${r.reason}`);
            });
        }

        if (result.isElite) {
            console.log(`[RUNNER_STOCK]   └─ 🌟 ELITE BOOST: +${result.confidenceBoost} confidence`);
        }

        // Store for history
        this.signalHistory.push({
            symbol: result.symbol,
            timestamp: result.timestamp,
            passed: result.passed,
            score: result.score,
            isElite: result.isElite
        });

        // Keep only last 100
        if (this.signalHistory.length > 100) {
            this.signalHistory.shift();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SIMULATION / TESTING
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Run simulation with test data
     */
    runSimulation(testCases) {
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('       RUNNER PROBABILITY STOCK - V7 SIMULATION                 ');
        console.log('═══════════════════════════════════════════════════════════════\n');

        const results = {
            total: testCases.length,
            passed: 0,
            elite: 0,
            rejected: 0,
            rejectionReasons: {}
        };

        testCases.forEach((testCase, i) => {
            console.log(`\n--- Test ${i + 1}: ${testCase.symbol} ---`);
            const result = this.evaluate(testCase);
            
            if (result.passed) {
                results.passed++;
                if (result.isElite) results.elite++;
            } else {
                results.rejected++;
                result.rejections.forEach(r => {
                    results.rejectionReasons[r.filter] = (results.rejectionReasons[r.filter] || 0) + 1;
                });
            }
        });

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('                    SIMULATION SUMMARY                          ');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`Total: ${results.total}`);
        console.log(`Passed: ${results.passed} (${((results.passed/results.total)*100).toFixed(1)}%)`);
        console.log(`Elite: ${results.elite}`);
        console.log(`Rejected: ${results.rejected}`);
        console.log('\nRejection Breakdown:');
        Object.entries(results.rejectionReasons)
            .sort((a, b) => b[1] - a[1])
            .forEach(([reason, count]) => {
                console.log(`  ${reason}: ${count}`);
            });
        console.log('═══════════════════════════════════════════════════════════════\n');

        return results;
    }
}

module.exports = new RunnerProbabilityStockService();
