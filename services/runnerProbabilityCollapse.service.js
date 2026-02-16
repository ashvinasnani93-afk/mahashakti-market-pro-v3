/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MAHASHAKTI V7.3 – ELITE COLLAPSE DETECTION SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE: Detect premium/price collapse EARLY before dead zone
 * 
 * DETECTS:
 * - 650 → 100 type collapses on options
 * - Stock breakdowns with volume confirmation
 * 
 * EMITS:
 * - SELL (Early Collapse)
 * - STRONG_SELL (Confirmed Collapse)
 * 
 * SYMMETRIC with runnerProbabilityStock/Option services
 * Same confidence, same guards, same discipline
 * ═══════════════════════════════════════════════════════════════════════════
 */

class RunnerProbabilityCollapseService {
    constructor() {
        console.log('[COLLAPSE_V7] Initializing Elite Collapse Detection...');
        
        // ═══════════════════════════════════════════════════════════════════
        // COLLAPSE ZONES - SYMMETRIC TO UP ZONES
        // ═══════════════════════════════════════════════════════════════════
        
        // Premium/Price drop zones
        this.zones = {
            EARLY_COLLAPSE: { min: -4, max: -1 },      // 1-4% drop (Best zone)
            STRONG_COLLAPSE: { min: -12, max: -4 },   // 4-12% drop
            EXTENDED_COLLAPSE: { min: -25, max: -12 }, // 12-25% drop
            DEAD_ZONE: { min: -100, max: -25 }        // >25% drop - NO ENTRY
        };

        // ═══════════════════════════════════════════════════════════════════
        // OPTION COLLAPSE CONFIG (V7.3 SYMMETRIC)
        // ═══════════════════════════════════════════════════════════════════
        
        this.optionZoneConfig = {
            EARLY_COLLAPSE: {
                minPremiumDrop2Candle: 3,     // ≥3% drop in 2 candles
                minOIUnwind: 1.5,             // OI unwind ≥1.5x
                maxSpread: 18,                // Spread ≤18%
                requireUnderlyingOpposite: true,
                requireDeltaWeakening: true,
                minScore: 67,
                signal: 'SELL',
                priority: 'HIGHEST'
            },
            STRONG_COLLAPSE: {
                minPremiumDrop2Candle: 5,     // ≥5% drop
                minOIUnwind: 2.0,             // OI unwind ≥2x
                minIVDrop: 5,                 // IV drop ≥5%
                maxSpread: 15,
                requireStructureBreak: true,
                minScore: 71,
                signal: 'STRONG_SELL',
                priority: 'HIGH'
            },
            EXTENDED_COLLAPSE: {
                minPremiumDrop2Candle: 8,
                minOIUnwind: 2.5,
                minIVDrop: 10,
                maxSpread: 12,
                maxSL: 4.0,
                requireStructureBreak: true,
                requireGammaCollapse: true,
                minScore: 76,
                signal: 'STRONG_SELL',
                priority: 'MEDIUM'
            },
            DEAD_ZONE: {
                // NO ENTRY - Premium already collapsed
                signal: null,
                priority: 'BLOCK'
            }
        };

        // ═══════════════════════════════════════════════════════════════════
        // STOCK COLLAPSE CONFIG (V7.3 SYMMETRIC - CALIBRATED)
        // ═══════════════════════════════════════════════════════════════════
        
        this.stockZoneConfig = {
            EARLY_COLLAPSE: {
                minVolume: 1.6,               // V7.3: Relaxed for early detection
                maxRS: -0.8,                  // V7.3: RS ≤ -0.8% (negative)
                maxSpread: 0.85,
                minRemainingRoom: 5,          // Room to circuit DOWN
                requireSupportBreak: false,
                minScore: 65,
                signal: 'SELL',
                priority: 'HIGHEST'
            },
            STRONG_COLLAPSE: {
                minVolume: 2.0,               // V7.3: Calibrated
                maxRS: -1.5,                  // V7.3: RS ≤ -1.5%
                maxSpread: 0.75,
                minRemainingRoom: 4,
                requireSupportBreak: true,
                requireLowerHigh: true,
                noExhaustionWick: true,
                minScore: 69,
                signal: 'STRONG_SELL',
                priority: 'HIGH'
            },
            EXTENDED_COLLAPSE: {
                minVolume: 2.8,               // V7.3: Calibrated
                maxRS: -2.0,
                maxSpread: 0.65,
                minRemainingRoom: 3.5,
                maxSL: 4.0,
                requireSupportBreak: true,
                requireLowerHigh: true,
                requireATRExpanding: true,
                minScore: 74,
                signal: 'STRONG_SELL',
                priority: 'MEDIUM'
            },
            DEAD_ZONE: {
                signal: null,
                priority: 'BLOCK'
            }
        };

        // Global config (SYMMETRIC to UP side)
        this.config = {
            absoluteMinRoom: 1.5,
            eliteCollapseScore: 82,
            eliteConfidenceBoost: 10,
            minConfidence: 59,               // SAME as BUY side
            volumeLookback: 20,
            maxExpectedMAE: 0.75,
            minPremium: 3,                   // No entry if premium < ₹3
            maxCollapsedPercent: 60          // No entry if already >60% collapsed
        };

        // Score weights (SYMMETRIC)
        this.scoreWeights = {
            collapseQuality: 20,
            volumeStrength: 15,
            rsWeakness: 15,
            spreadQuality: 10,
            structureBreak: 15,
            oiUnwind: 10,
            gammaCollapse: 10,
            remainingRoom: 5
        };

        console.log('[COLLAPSE_V7] Zones: EARLY(-1 to -4%) | STRONG(-4 to -12%) | EXTENDED(-12 to -25%) | DEAD(>-25%)');
        console.log('[COLLAPSE_V7] Signals: SELL | STRONG_SELL');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // OPTION COLLAPSE EVALUATION
    // ═══════════════════════════════════════════════════════════════════════
    
    evaluateOptionCollapse(data) {
        const {
            symbol, token, currentPremium, openPremium, spread,
            underlyingChange, underlyingDirection, optionType,
            oi, prevOI, iv, prevIV, confidence, structuralSL, candles
        } = data;

        const result = {
            symbol,
            token,
            type: 'OPTION_COLLAPSE',
            passed: false,
            signal: null,
            zone: null,
            score: 0,
            isElite: false,
            blockers: [],
            breakdown: {}
        };

        // Calculate premium drop
        const premiumDropPercent = ((openPremium - currentPremium) / openPremium) * 100;
        result.breakdown.premiumDrop = {
            value: premiumDropPercent,
            open: openPremium,
            current: currentPremium
        };

        // ═══════════════════════════════════════════════════════════════════
        // HARD BLOCKS - NO ENTRY CONDITIONS
        // ═══════════════════════════════════════════════════════════════════

        // Block if premium too low
        if (currentPremium < this.config.minPremium) {
            result.blockers.push({
                filter: 'LOW_PREMIUM',
                reason: `Premium ₹${currentPremium} < ₹${this.config.minPremium} minimum`,
                severity: 'HARD_BLOCK'
            });
            this.logResult(result, 'OPTION');
            return result;
        }

        // Block if already collapsed too much (dead zone)
        if (premiumDropPercent > this.config.maxCollapsedPercent) {
            result.blockers.push({
                filter: 'DEAD_ZONE',
                reason: `Premium already collapsed ${premiumDropPercent.toFixed(1)}% > ${this.config.maxCollapsedPercent}%`,
                severity: 'HARD_BLOCK'
            });
            this.logResult(result, 'OPTION');
            return result;
        }

        // Determine collapse zone
        const zone = this.determineCollapseZone(premiumDropPercent);
        result.zone = zone;
        result.breakdown.move = { movePercent: premiumDropPercent, zone };

        if (zone === 'NO_COLLAPSE' || zone === 'DEAD_ZONE') {
            result.blockers.push({
                filter: 'ZONE_INVALID',
                reason: `Premium drop ${premiumDropPercent.toFixed(2)}% not in collapse zone`,
                severity: 'ZONE_BLOCK'
            });
            this.logResult(result, 'OPTION');
            return result;
        }

        const zoneReqs = this.optionZoneConfig[zone];
        if (!zoneReqs || !zoneReqs.signal) {
            result.blockers.push({
                filter: 'ZONE_NO_SIGNAL',
                reason: `Zone ${zone} has no signal configured`,
                severity: 'ZONE_BLOCK'
            });
            this.logResult(result, 'OPTION');
            return result;
        }

        // ═══════════════════════════════════════════════════════════════════
        // COLLAPSE CHECKS
        // ═══════════════════════════════════════════════════════════════════

        // 2-candle velocity check
        const velocityCheck = this.check2CandleVelocityDrop(candles, zoneReqs.minPremiumDrop2Candle);
        result.breakdown.velocity = velocityCheck;
        if (!velocityCheck.passed) {
            result.blockers.push({
                filter: 'COLLAPSE_VELOCITY',
                reason: `2-candle drop ${velocityCheck.value.toFixed(2)}% < ${zoneReqs.minPremiumDrop2Candle}%`,
                severity: 'ZONE_BLOCK'
            });
        }

        // OI Unwind check
        const oiUnwind = prevOI > 0 ? prevOI / Math.max(oi, 1) : 1;
        const oiCheck = { passed: oiUnwind >= zoneReqs.minOIUnwind, value: oiUnwind, threshold: zoneReqs.minOIUnwind };
        result.breakdown.oiUnwind = oiCheck;
        if (!oiCheck.passed) {
            result.blockers.push({
                filter: 'OI_UNWIND',
                reason: `OI unwind ${oiUnwind.toFixed(2)}x < ${zoneReqs.minOIUnwind}x`,
                severity: 'ZONE_BLOCK'
            });
        }

        // Spread check
        const spreadCheck = { passed: spread <= zoneReqs.maxSpread, value: spread, threshold: zoneReqs.maxSpread };
        result.breakdown.spread = spreadCheck;
        if (!spreadCheck.passed) {
            result.blockers.push({
                filter: 'SPREAD',
                reason: `Spread ${spread.toFixed(1)}% > ${zoneReqs.maxSpread}%`,
                severity: 'ZONE_BLOCK'
            });
        }

        // Underlying opposite direction check
        if (zoneReqs.requireUnderlyingOpposite) {
            const isOpposite = (optionType === 'CE' && underlyingChange < 0) || 
                              (optionType === 'PE' && underlyingChange > 0);
            result.breakdown.underlyingOpposite = { passed: isOpposite, underlyingChange, optionType };
            if (!isOpposite) {
                result.blockers.push({
                    filter: 'UNDERLYING_DIRECTION',
                    reason: `Underlying not opposite: ${optionType} with ${underlyingChange.toFixed(2)}% change`,
                    severity: 'ZONE_BLOCK'
                });
            }
        }

        // IV drop check (for STRONG_COLLAPSE+)
        if (zoneReqs.minIVDrop) {
            const ivDrop = prevIV - iv;
            const ivCheck = { passed: ivDrop >= zoneReqs.minIVDrop, value: ivDrop, threshold: zoneReqs.minIVDrop };
            result.breakdown.ivDrop = ivCheck;
            if (!ivCheck.passed) {
                result.blockers.push({
                    filter: 'IV_DROP',
                    reason: `IV drop ${ivDrop.toFixed(1)}% < ${zoneReqs.minIVDrop}%`,
                    severity: 'ZONE_BLOCK'
                });
            }
        }

        // Confidence check (SAME as BUY side - NO ASYMMETRY)
        const confCheck = { passed: confidence >= this.config.minConfidence, value: confidence, threshold: this.config.minConfidence };
        result.breakdown.confidence = confCheck;
        if (!confCheck.passed) {
            result.blockers.push({
                filter: 'CONFIDENCE',
                reason: `Confidence ${confidence.toFixed(1)} < ${this.config.minConfidence}`,
                severity: 'HARD_BLOCK'
            });
        }

        // ═══════════════════════════════════════════════════════════════════
        // SCORE CALCULATION
        // ═══════════════════════════════════════════════════════════════════

        result.score = this.calculateCollapseScore(result.breakdown, zone, 'OPTION');

        // Min score check
        if (zoneReqs.minScore && result.score < zoneReqs.minScore) {
            result.blockers.push({
                filter: 'MIN_SCORE',
                reason: `Score ${result.score} < ${zoneReqs.minScore} (${zone} minimum)`,
                severity: 'ZONE_BLOCK'
            });
        }

        // ═══════════════════════════════════════════════════════════════════
        // FINAL DECISION
        // ═══════════════════════════════════════════════════════════════════

        result.passed = result.blockers.length === 0;
        if (result.passed) {
            result.signal = zoneReqs.signal;
            result.isElite = result.score >= this.config.eliteCollapseScore;
            
            if (result.isElite) {
                result.signal = 'STRONG_SELL';
            }
        }

        this.logResult(result, 'OPTION');
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STOCK COLLAPSE EVALUATION
    // ═══════════════════════════════════════════════════════════════════════
    
    evaluateStockCollapse(data) {
        const {
            symbol, token, currentPrice, openPrice, spread,
            niftyChange, circuitLimits, confidence, structuralSL,
            vwap, candles
        } = data;

        const result = {
            symbol,
            token,
            type: 'STOCK_COLLAPSE',
            passed: false,
            signal: null,
            zone: null,
            score: 0,
            isElite: false,
            blockers: [],
            breakdown: {}
        };

        // Calculate price drop (negative = down)
        const priceDropPercent = ((openPrice - currentPrice) / openPrice) * 100;
        result.breakdown.priceDrop = {
            value: priceDropPercent,
            open: openPrice,
            current: currentPrice
        };

        // Only process if stock is DOWN
        if (priceDropPercent <= 0) {
            result.blockers.push({
                filter: 'NOT_COLLAPSE',
                reason: `Stock is UP ${(-priceDropPercent).toFixed(2)}%, not collapse`,
                severity: 'DIRECTION_BLOCK'
            });
            this.logResult(result, 'STOCK');
            return result;
        }

        // Calculate room to circuit DOWN
        const circuitLower = circuitLimits?.lower || openPrice * 0.9;
        const remainingRoomDown = ((currentPrice - circuitLower) / openPrice) * 100;
        result.breakdown.room = { value: remainingRoomDown, circuit: circuitLower };

        // Absolute minimum room check
        if (remainingRoomDown < this.config.absoluteMinRoom) {
            result.blockers.push({
                filter: 'NO_ROOM_DOWN',
                reason: `Only ${remainingRoomDown.toFixed(1)}% room to circuit DOWN`,
                severity: 'HARD_BLOCK'
            });
            this.logResult(result, 'STOCK');
            return result;
        }

        // Determine collapse zone
        const zone = this.determineCollapseZone(priceDropPercent);
        result.zone = zone;
        result.breakdown.move = { movePercent: priceDropPercent, zone };

        if (zone === 'NO_COLLAPSE' || zone === 'DEAD_ZONE') {
            result.blockers.push({
                filter: 'ZONE_INVALID',
                reason: `Price drop ${priceDropPercent.toFixed(2)}% not in collapse zone`,
                severity: 'ZONE_BLOCK'
            });
            this.logResult(result, 'STOCK');
            return result;
        }

        const zoneReqs = this.stockZoneConfig[zone];
        if (!zoneReqs || !zoneReqs.signal) {
            this.logResult(result, 'STOCK');
            return result;
        }

        // ═══════════════════════════════════════════════════════════════════
        // COLLAPSE CHECKS (SYMMETRIC TO UP SIDE)
        // ═══════════════════════════════════════════════════════════════════

        // Volume check
        const volumeCheck = this.checkVolume(candles, zoneReqs.minVolume);
        result.breakdown.volume = volumeCheck;
        if (!volumeCheck.passed) {
            result.blockers.push({
                filter: 'VOLUME',
                reason: `Volume ${volumeCheck.value.toFixed(2)}x < ${zoneReqs.minVolume}x (${zone})`,
                severity: 'ZONE_BLOCK'
            });
        }

        // RS check (negative for collapse)
        const rsValue = priceDropPercent - niftyChange;  // Relative weakness
        const rsCheck = { passed: rsValue >= Math.abs(zoneReqs.maxRS), value: -rsValue, threshold: zoneReqs.maxRS };
        result.breakdown.rs = rsCheck;
        if (!rsCheck.passed) {
            result.blockers.push({
                filter: 'RS',
                reason: `RS ${(-rsValue).toFixed(2)}% > ${zoneReqs.maxRS}% (${zone})`,
                severity: 'ZONE_BLOCK'
            });
        }

        // Spread check
        const spreadCheck = { passed: spread <= zoneReqs.maxSpread, value: spread, threshold: zoneReqs.maxSpread };
        result.breakdown.spread = spreadCheck;
        if (!spreadCheck.passed) {
            result.blockers.push({
                filter: 'SPREAD',
                reason: `Spread ${spread.toFixed(2)}% > ${zoneReqs.maxSpread}% (${zone})`,
                severity: 'ZONE_BLOCK'
            });
        }

        // Room check
        const roomCheck = { passed: remainingRoomDown >= zoneReqs.minRemainingRoom, value: remainingRoomDown, threshold: zoneReqs.minRemainingRoom };
        result.breakdown.roomCheck = roomCheck;
        if (!roomCheck.passed) {
            result.blockers.push({
                filter: 'ROOM_DOWN',
                reason: `Room ${remainingRoomDown.toFixed(1)}% < ${zoneReqs.minRemainingRoom}% (${zone})`,
                severity: 'ZONE_BLOCK'
            });
        }

        // Lower High check (for STRONG_COLLAPSE+)
        if (zoneReqs.requireLowerHigh) {
            const lowerHighCheck = this.checkLowerHigh(candles);
            result.breakdown.lowerHigh = lowerHighCheck;
            if (!lowerHighCheck.passed) {
                result.blockers.push({
                    filter: 'LOWER_HIGH',
                    reason: 'No lower high pattern detected',
                    severity: 'ZONE_BLOCK'
                });
            }
        }

        // Exhaustion wick check
        if (zoneReqs.noExhaustionWick) {
            const wickCheck = this.checkExhaustionWick(candles);
            result.breakdown.wick = wickCheck;
            if (!wickCheck.passed) {
                result.blockers.push({
                    filter: 'EXHAUSTION_WICK',
                    reason: `Exhaustion wick detected ${wickCheck.value.toFixed(1)}%`,
                    severity: 'ZONE_BLOCK'
                });
            }
        }

        // Confidence check (SAME as BUY side - NO ASYMMETRY)
        const confCheck = { passed: confidence >= this.config.minConfidence, value: confidence, threshold: this.config.minConfidence };
        result.breakdown.confidence = confCheck;
        if (!confCheck.passed) {
            result.blockers.push({
                filter: 'CONFIDENCE',
                reason: `Confidence ${confidence.toFixed(1)} < ${this.config.minConfidence}`,
                severity: 'HARD_BLOCK'
            });
        }

        // ═══════════════════════════════════════════════════════════════════
        // SCORE CALCULATION
        // ═══════════════════════════════════════════════════════════════════

        result.score = this.calculateCollapseScore(result.breakdown, zone, 'STOCK');

        // Min score check
        if (zoneReqs.minScore && result.score < zoneReqs.minScore) {
            result.blockers.push({
                filter: 'MIN_SCORE',
                reason: `Score ${result.score} < ${zoneReqs.minScore} (${zone} minimum)`,
                severity: 'ZONE_BLOCK'
            });
        }

        // MAE guard
        const expectedMAE = this.estimateExpectedMAE(candles, spread, zone);
        result.breakdown.expectedMAE = expectedMAE;
        if (expectedMAE.mae > this.config.maxExpectedMAE) {
            result.blockers.push({
                filter: 'VOLATILITY_GUARD',
                reason: `Expected MAE ${expectedMAE.mae.toFixed(2)}% > ${this.config.maxExpectedMAE}%`,
                severity: 'HARD_BLOCK'
            });
        }

        // ═══════════════════════════════════════════════════════════════════
        // FINAL DECISION
        // ═══════════════════════════════════════════════════════════════════

        result.passed = result.blockers.length === 0;
        if (result.passed) {
            result.signal = zoneReqs.signal;
            result.isElite = result.score >= this.config.eliteCollapseScore;
            
            if (result.isElite) {
                result.signal = 'STRONG_SELL';
            }
        }

        this.logResult(result, 'STOCK');
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HELPER METHODS
    // ═══════════════════════════════════════════════════════════════════════

    determineCollapseZone(dropPercent) {
        const drop = Math.abs(dropPercent);
        
        if (drop < 1) return 'NO_COLLAPSE';
        if (drop >= 1 && drop < 4) return 'EARLY_COLLAPSE';
        if (drop >= 4 && drop < 12) return 'STRONG_COLLAPSE';
        if (drop >= 12 && drop < 25) return 'EXTENDED_COLLAPSE';
        return 'DEAD_ZONE';
    }

    check2CandleVelocityDrop(candles, minDrop) {
        if (!candles || candles.length < 3) {
            return { passed: false, value: 0, reason: 'INSUFFICIENT_DATA' };
        }

        const recent = candles.slice(-2);
        const prev = candles[candles.length - 3];
        
        if (!prev || !recent[1]) {
            return { passed: false, value: 0, reason: 'MISSING_CANDLES' };
        }

        const dropPercent = ((prev.close - recent[1].close) / prev.close) * 100;
        
        return {
            passed: dropPercent >= minDrop,
            value: dropPercent,
            threshold: minDrop
        };
    }

    checkVolume(candles, minMultiple) {
        if (!candles || candles.length < 10) {
            return { passed: false, value: 0, reason: 'INSUFFICIENT_DATA' };
        }

        const recentVolume = candles.slice(-3).reduce((sum, c) => sum + (c.volume || 0), 0) / 3;
        const avgVolume = candles.slice(-10, -3).reduce((sum, c) => sum + (c.volume || 0), 0) / 7;
        
        const multiple = avgVolume > 0 ? recentVolume / avgVolume : 0;

        return {
            passed: multiple >= minMultiple,
            value: multiple,
            threshold: minMultiple,
            score: Math.min(100, (multiple / minMultiple) * 80)
        };
    }

    checkLowerHigh(candles) {
        if (!candles || candles.length < 6) {
            return { passed: false, value: 0 };
        }

        const recent = candles.slice(-5);
        let lowerHighCount = 0;

        for (let i = 1; i < recent.length; i++) {
            if (recent[i].high < recent[i - 1].high) {
                lowerHighCount++;
            }
        }

        return {
            passed: lowerHighCount >= 3,
            value: lowerHighCount,
            score: (lowerHighCount / 4) * 100
        };
    }

    checkExhaustionWick(candles) {
        if (!candles || candles.length < 1) {
            return { passed: true, value: 0 };
        }

        const lastCandle = candles[candles.length - 1];
        const bodySize = Math.abs(lastCandle.close - lastCandle.open);
        const totalRange = lastCandle.high - lastCandle.low;
        
        if (totalRange === 0) return { passed: true, value: 0 };

        // For collapse, check for lower wick (buying pressure)
        const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
        const wickPercent = (lowerWick / totalRange) * 100;

        return {
            passed: wickPercent < 45,
            value: wickPercent,
            score: Math.max(0, 100 - wickPercent * 2)
        };
    }

    estimateExpectedMAE(candles, spread, zone) {
        if (!candles || candles.length < 5) {
            return { mae: 0, reason: 'INSUFFICIENT_DATA' };
        }

        const recentCandles = candles.slice(-5);
        let totalRangePercent = 0;
        
        for (const c of recentCandles) {
            if (c.close && c.close > 0) {
                const rangePercent = ((c.high - c.low) / c.close) * 100;
                totalRangePercent += rangePercent;
            }
        }
        
        const avgRangePercent = totalRangePercent / recentCandles.length;
        
        const zoneMultipliers = {
            EARLY_COLLAPSE: 0.8,
            STRONG_COLLAPSE: 1.0,
            EXTENDED_COLLAPSE: 1.3,
            DEAD_ZONE: 2.0
        };
        
        const multiplier = zoneMultipliers[zone] || 1.0;
        const spreadImpact = spread ? spread * 0.5 : 0;
        const expectedMAE = (avgRangePercent * multiplier) + spreadImpact;
        
        return {
            mae: expectedMAE,
            avgRange: avgRangePercent,
            zoneMultiplier: multiplier,
            passed: expectedMAE <= this.config.maxExpectedMAE
        };
    }

    calculateCollapseScore(breakdown, zone, type) {
        let score = 0;

        // Collapse quality (zone-based)
        if (zone === 'EARLY_COLLAPSE') {
            score += this.scoreWeights.collapseQuality;
        } else if (zone === 'STRONG_COLLAPSE') {
            score += this.scoreWeights.collapseQuality * 0.75;
        } else if (zone === 'EXTENDED_COLLAPSE') {
            score += this.scoreWeights.collapseQuality * 0.4;
        }

        // Volume
        if (breakdown.volume?.score) {
            score += (breakdown.volume.score / 100) * this.scoreWeights.volumeStrength;
        }

        // RS weakness (for stocks)
        if (breakdown.rs?.passed) {
            score += this.scoreWeights.rsWeakness;
        }

        // Spread quality
        if (breakdown.spread?.passed) {
            score += this.scoreWeights.spreadQuality;
        }

        // Structure break (lower high)
        if (breakdown.lowerHigh?.score) {
            score += (breakdown.lowerHigh.score / 100) * this.scoreWeights.structureBreak;
        }

        // OI unwind (for options)
        if (breakdown.oiUnwind?.passed) {
            score += this.scoreWeights.oiUnwind;
        }

        // Velocity
        if (breakdown.velocity?.passed) {
            score += this.scoreWeights.gammaCollapse;
        }

        // Remaining room
        if (breakdown.roomCheck?.passed || breakdown.room?.value > 5) {
            score += this.scoreWeights.remainingRoom;
        }

        return Math.round(score);
    }

    logResult(result, type) {
        const zoneEmoji = {
            EARLY_COLLAPSE: '🔴',
            STRONG_COLLAPSE: '🟠',
            EXTENDED_COLLAPSE: '🟡',
            DEAD_ZONE: '⚫',
            NO_COLLAPSE: '⚪'
        };

        const emoji = zoneEmoji[result.zone] || '⚪';
        const dropValue = result.breakdown.premiumDrop?.value || result.breakdown.priceDrop?.value || 0;

        if (result.passed) {
            console.log(`[COLLAPSE] ✅ ${result.signal} | ${result.symbol} | ${emoji} ${result.zone} | Drop: ${dropValue.toFixed(2)}% | Score: ${result.score}${result.isElite ? ' | 🏆 ELITE' : ''}`);
        } else if (result.blockers.length > 0) {
            console.log(`[COLLAPSE] 🚫 BLOCKED | ${result.symbol} | ${emoji} ${result.zone || 'N/A'} | Drop: ${dropValue.toFixed(2)}% | Score: ${result.score}`);
            result.blockers.forEach(b => {
                console.log(`[COLLAPSE]   └─ ${b.filter}: ${b.reason}`);
            });
        }
    }
}

module.exports = new RunnerProbabilityCollapseService();
