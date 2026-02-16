/**
 * RUNNER PROBABILITY STOCK SERVICE - V7 ELITE MODE (FINAL)
 * ═══════════════════════════════════════════════════════════════════════════
 * DYNAMIC CIRCUIT-AWARE ELITE RUNNER DETECTION
 * 
 * NO FIXED % BLOCKS - INTELLIGENT ZONE-BASED ENTRY
 * 
 * ZONES:
 * 🟢 0-2%   : Early ignition, light filters
 * 🟢 2-5%   : Strong volume, RS confirmation
 * 🟡 5-8%   : Structure check, remaining room ≥3%
 * 🟠 8-9.5% : Only if circuit 10%, room ≥1.5%
 * 🔴 <1% room: No fresh entry
 * 
 * ELITE_RUNNER: Score ≥ 85 → +8 confidence boost
 * ═══════════════════════════════════════════════════════════════════════════
 */

class RunnerProbabilityStockService {
    constructor() {
        // Zone-based thresholds
        this.zones = {
            EARLY: { min: 0, max: 2 },      // 0-2% move
            STRONG: { min: 2, max: 5 },     // 2-5% move
            EXTENDED: { min: 5, max: 8 },   // 5-8% move
            LATE: { min: 8, max: 9.5 }      // 8-9.5% move (only 10% circuit stocks)
        };

        // V7.3 CONTROLLED PRO - EARLY Dominance + Disciplined Exit
        // Target emit rate: 2-3%, Focus on catching runners EARLY
        this.zoneConfig = {
            EARLY: {
                minVolume: 1.6,           // V7.3: Slightly relaxed for more EARLY signals
                minRS: 1.0,               // V7.3: Relaxed to catch more early movers
                maxSpread: 0.85,          // V7.3: Tighter spread for quality
                minRemainingRoom: 6,      // V7.3: More room = safer entries
                requireVWAP: false,
                requireHigherLow: false,
                minScore: 65,
                priority: 'HIGHEST'       // V7.3: EARLY is king
            },
            STRONG: {
                minVolume: 2.2,           // V7.3: Tightened - must show conviction
                minRS: 1.8,               // V7.3: Higher RS needed for STRONG
                maxSpread: 0.7,           // V7.3: Tighter spread
                minRemainingRoom: 4.5,    // V7.3: More room required
                requireVWAP: false,
                requireHigherLow: true,   // V7.3: MANDATORY - structure confirmation
                noExhaustionWick: true,   // V7.3: MANDATORY - no exhaustion
                minScore: 70,             // V7.3: Higher bar for STRONG
                priority: 'HIGH'
            },
            EXTENDED: {
                minVolume: 3.0,           // V7.3: Very high volume required
                minRS: 2.2,               // V7.3: Very strong RS required
                maxSpread: 0.6,           // V7.3: Tight spread
                minRemainingRoom: 3.5,    // V7.3: Must have decent room
                maxSL: 4.0,               // V7.3: Tight SL
                requireVWAP: true,        // V7.3: MANDATORY
                requireHigherLow: true,   // V7.3: MANDATORY
                requireATRExpanding: true, // V7.3: MANDATORY
                minScore: 75,             // V7.3: High bar - extended is risky
                priority: 'MEDIUM'
            },
            LATE: {
                minVolume: 4.0,           // V7.3: Extreme volume only
                minRS: 3.0,               // V7.3: Extreme RS only
                maxSpread: 0.5,           // V7.3: Very tight spread
                minRemainingRoom: 2.0,    // V7.3: Minimum room
                maxSL: 3.0,               // V7.3: Very tight SL
                requireVWAP: true,
                requireHigherLow: true,
                noRejectionWick: true,
                requireMomentumIntact: true,
                onlyFor10PercentCircuit: true,
                minScore: 80,             // V7.3: Very high bar - late is dangerous
                priority: 'LOW'
            }
        };

        // Global config (V7.3 CONTROLLED PRO)
        this.config = {
            absoluteMinRoom: 1.5,            // V7.3: Tightened from 1%
            eliteRunnerScore: 82,            // V7.3: Lowered for more elite detection
            eliteConfidenceBoost: 10,        // V7.3: Bigger boost for elite
            minConfidence: 58,
            volumeLookback: 20,
            maxExpectedMAE: 0.8,             // V7.3: Tighter MAE guard
            earlyZoneBonus: 5                // V7.3: Score bonus for EARLY zone
        };

        // Score weights (total = 100)
        this.scoreWeights = {
            moveQuality: 20,          // Early entry = high score
            volumeStrength: 18,       // Volume conviction
            rsStrength: 15,           // Relative strength
            spreadQuality: 12,        // Execution quality
            structureHealth: 12,      // Higher lows, no wicks
            vwapAlignment: 10,        // VWAP support
            remainingRoom: 8,         // Circuit headroom
            momentumIntact: 5         // Trend continuation
        };

        // State
        this.signalHistory = [];

        console.log('[RUNNER_STOCK_V7] Initializing Dynamic Circuit-Aware Elite Runner...');
        console.log('[RUNNER_STOCK_V7] Zones: EARLY(0-2%) | STRONG(2-5%) | EXTENDED(5-8%) | LATE(8-9.5%)');
        console.log('[RUNNER_STOCK_V7] Elite threshold: ' + this.config.eliteRunnerScore);
    }

    /**
     * MAIN: Evaluate stock for Elite Runner probability
     */
    evaluate(data) {
        const {
            symbol,
            token,
            currentPrice,
            openPrice,
            spread,
            niftyChange,
            circuitLimits,
            confidence,
            structuralSL,
            vwap,
            candles,
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
            zone: null,
            movePercent: 0,
            remainingRoom: 0,
            circuitPercent: 0,
            breakdown: {},
            blockers: []
        };

        // ═══════════════════════════════════════════════════════════════
        // STEP 1: Calculate move and remaining room
        // ═══════════════════════════════════════════════════════════════
        
        const movePercent = this.calculateMoveFromOpen(currentPrice, openPrice);
        const circuitPercent = this.getCircuitPercent(circuitLimits, openPrice);
        const remainingRoom = circuitPercent - movePercent;
        
        result.movePercent = movePercent;
        result.remainingRoom = remainingRoom;
        result.circuitPercent = circuitPercent;
        result.breakdown.move = { movePercent, circuitPercent, remainingRoom };

        // ═══════════════════════════════════════════════════════════════
        // STEP 2: ABSOLUTE BLOCK - Remaining room < 1%
        // ═══════════════════════════════════════════════════════════════
        
        if (remainingRoom < this.config.absoluteMinRoom) {
            result.blockers.push({
                filter: 'REMAINING_ROOM',
                reason: `Remaining room ${remainingRoom.toFixed(2)}% < 1% minimum`,
                severity: 'HARD_BLOCK'
            });
            this.logResult(result);
            return result;
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 3: Determine zone based on move %
        // ═══════════════════════════════════════════════════════════════
        
        const zone = this.determineZone(movePercent, circuitPercent);
        result.zone = zone;
        
        if (!zone) {
            result.blockers.push({
                filter: 'ZONE_INVALID',
                reason: `Move ${movePercent.toFixed(2)}% exceeds all zones`,
                severity: 'HARD_BLOCK'
            });
            this.logResult(result);
            return result;
        }

        const zoneReqs = this.zoneConfig[zone];
        result.breakdown.zone = { name: zone, requirements: zoneReqs };

        // ═══════════════════════════════════════════════════════════════
        // STEP 4: Zone-specific validation
        // ═══════════════════════════════════════════════════════════════

        // 4a: Volume check
        const volumeCheck = this.checkVolume(candles, zoneReqs.minVolume);
        result.breakdown.volume = volumeCheck;
        if (!volumeCheck.passed) {
            result.blockers.push({
                filter: 'VOLUME',
                reason: `Volume ${volumeCheck.multiple?.toFixed(2)}x < ${zoneReqs.minVolume}x (${zone} zone)`,
                severity: 'ZONE_BLOCK'
            });
        }

        // 4b: RS check
        const rsCheck = this.checkRS(currentPrice, openPrice, niftyChange, zoneReqs.minRS);
        result.breakdown.rs = rsCheck;
        if (!rsCheck.passed) {
            result.blockers.push({
                filter: 'RS',
                reason: `RS ${rsCheck.rsValue?.toFixed(2)}% < ${zoneReqs.minRS}% (${zone} zone)`,
                severity: 'ZONE_BLOCK'
            });
        }

        // 4c: Spread check
        const spreadCheck = this.checkSpread(spread, zoneReqs.maxSpread);
        result.breakdown.spread = spreadCheck;
        if (!spreadCheck.passed) {
            result.blockers.push({
                filter: 'SPREAD',
                reason: `Spread ${spread?.toFixed(2)}% > ${zoneReqs.maxSpread}% (${zone} zone)`,
                severity: 'ZONE_BLOCK'
            });
        }

        // 4d: Remaining room check (zone-specific)
        const roomCheck = this.checkRemainingRoom(remainingRoom, zoneReqs.minRemainingRoom);
        result.breakdown.room = roomCheck;
        if (!roomCheck.passed) {
            result.blockers.push({
                filter: 'ROOM',
                reason: `Room ${remainingRoom.toFixed(2)}% < ${zoneReqs.minRemainingRoom}% (${zone} zone)`,
                severity: 'ZONE_BLOCK'
            });
        }

        // 4e: VWAP check (if required)
        if (zoneReqs.requireVWAP) {
            const vwapCheck = this.checkVWAPHold(currentPrice, vwap);
            result.breakdown.vwap = vwapCheck;
            if (!vwapCheck.passed) {
                result.blockers.push({
                    filter: 'VWAP',
                    reason: `Price below VWAP (${zone} zone requires VWAP hold)`,
                    severity: 'ZONE_BLOCK'
                });
            }
        }

        // 4f: Exhaustion wick check (STRONG zone)
        if (zoneReqs.noExhaustionWick) {
            const wickCheck = this.checkNoExhaustionWick(candles);
            result.breakdown.wick = wickCheck;
            if (!wickCheck.passed) {
                result.blockers.push({
                    filter: 'EXHAUSTION_WICK',
                    reason: `Exhaustion wick detected ${wickCheck.wickPercent?.toFixed(1)}%`,
                    severity: 'ZONE_BLOCK'
                });
            }
        }

        // 4g: Higher low check (EXTENDED zone)
        if (zoneReqs.requireHigherLow) {
            const hlCheck = this.checkHigherLow(candles);
            result.breakdown.higherLow = hlCheck;
            if (!hlCheck.passed) {
                result.blockers.push({
                    filter: 'HIGHER_LOW',
                    reason: 'No higher low structure',
                    severity: 'ZONE_BLOCK'
                });
            }
        }

        // 4h: ATR expanding check (EXTENDED zone)
        if (zoneReqs.requireATRExpanding) {
            const atrCheck = this.checkATRExpanding(candles);
            result.breakdown.atr = atrCheck;
            if (!atrCheck.passed) {
                result.blockers.push({
                    filter: 'ATR',
                    reason: 'ATR not expanding',
                    severity: 'ZONE_BLOCK'
                });
            }
        }

        // 4i: Structural SL check (EXTENDED and LATE zones)
        if (zoneReqs.maxSL) {
            const slCheck = this.checkSL(structuralSL, zoneReqs.maxSL);
            result.breakdown.sl = slCheck;
            if (!slCheck.passed) {
                result.blockers.push({
                    filter: 'STRUCTURAL_SL',
                    reason: `SL ${structuralSL?.toFixed(2)}% > ${zoneReqs.maxSL}% (${zone} zone)`,
                    severity: 'ZONE_BLOCK'
                });
            }
        }

        // 4j: LATE zone special checks
        if (zone === 'LATE') {
            // Must be 10% circuit stock
            if (zoneReqs.onlyFor10PercentCircuit && circuitPercent > 12) {
                result.blockers.push({
                    filter: 'CIRCUIT_TYPE',
                    reason: `LATE zone only for 10% circuit stocks (current: ${circuitPercent.toFixed(1)}%)`,
                    severity: 'ZONE_BLOCK'
                });
            }

            // No rejection wick
            if (zoneReqs.noRejectionWick) {
                const rejWickCheck = this.checkNoRejectionWick(candles);
                result.breakdown.rejectionWick = rejWickCheck;
                if (!rejWickCheck.passed) {
                    result.blockers.push({
                        filter: 'REJECTION_WICK',
                        reason: 'Rejection wick detected in LATE zone',
                        severity: 'ZONE_BLOCK'
                    });
                }
            }

            // Momentum intact
            if (zoneReqs.requireMomentumIntact) {
                const momCheck = this.checkMomentumIntact(candles);
                result.breakdown.momentum = momCheck;
                if (!momCheck.passed) {
                    result.blockers.push({
                        filter: 'MOMENTUM',
                        reason: 'Momentum fading in LATE zone',
                        severity: 'ZONE_BLOCK'
                    });
                }
            }
        }

        // 4k: Confidence check
        const confCheck = this.checkConfidence(confidence);
        result.breakdown.confidence = confCheck;
        if (!confCheck.passed) {
            result.blockers.push({
                filter: 'CONFIDENCE',
                reason: `Confidence ${confidence} < ${this.config.minConfidence}`,
                severity: 'HARD_BLOCK'
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 5: Calculate runner score
        // ═══════════════════════════════════════════════════════════════

        result.score = this.calculateScore(result.breakdown, data, zone);

        // ═══════════════════════════════════════════════════════════════
        // STEP 5.1: V7.2 MINIMUM SCORE CHECK (per zone)
        // ═══════════════════════════════════════════════════════════════
        if (zoneReqs.minScore && result.score < zoneReqs.minScore) {
            result.blockers.push({
                filter: 'MIN_SCORE',
                reason: `Score ${result.score} < ${zoneReqs.minScore} (${zone} zone minimum)`,
                severity: 'ZONE_BLOCK'
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 5.2: V7.2 VOLATILITY GUARD - Expected MAE check
        // ═══════════════════════════════════════════════════════════════
        const expectedMAE = this.estimateExpectedMAE(candles, spread, zone);
        result.breakdown.expectedMAE = expectedMAE;
        
        if (this.config.maxExpectedMAE && expectedMAE.mae > this.config.maxExpectedMAE) {
            result.blockers.push({
                filter: 'VOLATILITY_GUARD',
                reason: `Expected MAE ${expectedMAE.mae.toFixed(2)}% > ${this.config.maxExpectedMAE}% limit`,
                severity: 'HARD_BLOCK'
            });
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 6: Final decision
        // ═══════════════════════════════════════════════════════════════

        result.passed = result.blockers.length === 0;

        if (result.passed && result.score >= this.config.eliteRunnerScore) {
            result.isElite = true;
            result.tag = 'ELITE_RUNNER';
            result.confidenceBoost = this.config.eliteConfidenceBoost;
        } else if (result.passed) {
            result.tag = 'RUNNER';
        }

        this.logResult(result);
        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HELPER METHODS
    // ═══════════════════════════════════════════════════════════════════════

    calculateMoveFromOpen(currentPrice, openPrice) {
        if (!openPrice || openPrice === 0) return 0;
        return ((currentPrice - openPrice) / openPrice) * 100;
    }

    getCircuitPercent(circuitLimits, openPrice) {
        if (!circuitLimits || !circuitLimits.upper || !openPrice) return 20; // Default
        return ((circuitLimits.upper - openPrice) / openPrice) * 100;
    }

    determineZone(movePercent, circuitPercent) {
        // Determine which zone the current move falls into
        if (movePercent >= this.zones.EARLY.min && movePercent < this.zones.EARLY.max) {
            return 'EARLY';
        }
        if (movePercent >= this.zones.STRONG.min && movePercent < this.zones.STRONG.max) {
            return 'STRONG';
        }
        if (movePercent >= this.zones.EXTENDED.min && movePercent < this.zones.EXTENDED.max) {
            return 'EXTENDED';
        }
        if (movePercent >= this.zones.LATE.min && movePercent < this.zones.LATE.max) {
            // LATE zone only for 10% circuit stocks
            if (circuitPercent <= 12) {
                return 'LATE';
            }
            return null; // Beyond EXTENDED for non-10% circuit stocks
        }
        return null; // Beyond all zones
    }

    checkVolume(candles, minMultiple) {
        if (!candles || candles.length < 10) {
            return { passed: false, multiple: 0, reason: 'Insufficient candles' };
        }

        const recentVol = candles.slice(-3).reduce((a, c) => a + c.volume, 0) / 3;
        const avgVol = candles.slice(0, -3).reduce((a, c) => a + c.volume, 0) / (candles.length - 3);
        const multiple = recentVol / (avgVol || 1);

        return {
            passed: multiple >= minMultiple,
            multiple,
            recentVol,
            avgVol,
            threshold: minMultiple,
            score: Math.min(100, (multiple / minMultiple) * 60)
        };
    }

    checkRS(currentPrice, openPrice, niftyChange, minRS) {
        const stockChange = ((currentPrice - openPrice) / openPrice) * 100;
        const rsValue = stockChange - (niftyChange || 0);

        return {
            passed: rsValue >= minRS,
            rsValue,
            stockChange,
            niftyChange,
            threshold: minRS,
            score: Math.min(100, (rsValue / minRS) * 50)
        };
    }

    checkSpread(spread, maxSpread) {
        if (spread === undefined) return { passed: false, value: 0 };
        return {
            passed: spread <= maxSpread,
            value: spread,
            threshold: maxSpread,
            score: spread <= maxSpread ? 100 - (spread / maxSpread) * 50 : 0
        };
    }

    checkRemainingRoom(room, minRoom) {
        return {
            passed: room >= minRoom,
            value: room,
            threshold: minRoom,
            score: Math.min(100, (room / minRoom) * 40)
        };
    }

    checkVWAPHold(currentPrice, vwap) {
        if (!vwap) return { passed: true, note: 'No VWAP data' };
        const distance = ((currentPrice - vwap) / vwap) * 100;
        return {
            passed: distance >= -0.5, // Within 0.5% below VWAP is OK
            distance,
            score: distance >= 0 ? 100 : Math.max(0, 100 + distance * 50)
        };
    }

    checkNoExhaustionWick(candles) {
        if (!candles || candles.length < 1) return { passed: true };
        
        const lastCandle = candles[candles.length - 1];
        const body = Math.abs(lastCandle.close - lastCandle.open);
        const range = lastCandle.high - lastCandle.low;
        if (range === 0) return { passed: true, wickPercent: 0 };
        
        const upperWick = lastCandle.high - Math.max(lastCandle.close, lastCandle.open);
        const wickPercent = (upperWick / range) * 100;
        
        return {
            passed: wickPercent < 40,
            wickPercent,
            score: wickPercent < 40 ? 100 - wickPercent : 0
        };
    }

    checkHigherLow(candles) {
        if (!candles || candles.length < 6) return { passed: false };
        
        // Look for higher lows in last 6 candles
        const lows = candles.slice(-6).map(c => c.low);
        let higherLowCount = 0;
        
        for (let i = 1; i < lows.length; i++) {
            if (lows[i] > lows[i-1]) higherLowCount++;
        }
        
        return {
            passed: higherLowCount >= 3,
            higherLowCount,
            score: (higherLowCount / 5) * 100
        };
    }

    checkATRExpanding(candles) {
        if (!candles || candles.length < 20) return { passed: false };
        
        const recentATR = this.calculateATR(candles.slice(-10));
        const prevATR = this.calculateATR(candles.slice(-20, -10));
        
        if (prevATR === 0) return { passed: recentATR > 0, ratio: 999 };
        
        const ratio = recentATR / prevATR;
        return {
            passed: ratio > 1.05,
            ratio,
            recentATR,
            prevATR,
            score: ratio > 1.05 ? Math.min(100, ratio * 50) : 0
        };
    }

    calculateATR(candles) {
        if (!candles || candles.length < 2) return 0;
        let trSum = 0;
        for (let i = 1; i < candles.length; i++) {
            const tr = Math.max(
                candles[i].high - candles[i].low,
                Math.abs(candles[i].high - candles[i-1].close),
                Math.abs(candles[i].low - candles[i-1].close)
            );
            trSum += tr;
        }
        return trSum / (candles.length - 1);
    }

    checkSL(sl, maxSL) {
        if (sl === undefined) return { passed: false };
        return {
            passed: sl <= maxSL,
            value: sl,
            threshold: maxSL,
            score: sl <= maxSL ? 100 - (sl / maxSL) * 30 : 0
        };
    }

    checkNoRejectionWick(candles) {
        if (!candles || candles.length < 3) return { passed: true };
        
        // Check last 3 candles for rejection wicks
        for (let i = candles.length - 3; i < candles.length; i++) {
            const c = candles[i];
            const body = Math.abs(c.close - c.open);
            const range = c.high - c.low;
            if (range === 0) continue;
            
            const upperWick = c.high - Math.max(c.close, c.open);
            if (upperWick / range > 0.5) {
                return { passed: false, candleIndex: i, wickRatio: upperWick / range };
            }
        }
        return { passed: true };
    }

    checkMomentumIntact(candles) {
        if (!candles || candles.length < 5) return { passed: false };
        
        // Check if closes are trending up
        const closes = candles.slice(-5).map(c => c.close);
        let upCount = 0;
        for (let i = 1; i < closes.length; i++) {
            if (closes[i] > closes[i-1]) upCount++;
        }
        
        return {
            passed: upCount >= 3,
            upCount,
            score: (upCount / 4) * 100
        };
    }

    checkConfidence(confidence) {
        return {
            passed: confidence >= this.config.minConfidence,
            value: confidence,
            threshold: this.config.minConfidence
        };
    }

    // V7.2: VOLATILITY GUARD - Estimate expected MAE based on recent volatility
    estimateExpectedMAE(candles, spread, zone) {
        if (!candles || candles.length < 5) {
            return { mae: 0, reason: 'INSUFFICIENT_DATA' };
        }

        // Calculate recent volatility from candle ranges
        const recentCandles = candles.slice(-5);
        let totalRangePercent = 0;
        
        for (const c of recentCandles) {
            if (c.close && c.close > 0) {
                const rangePercent = ((c.high - c.low) / c.close) * 100;
                totalRangePercent += rangePercent;
            }
        }
        
        const avgRangePercent = totalRangePercent / recentCandles.length;
        
        // Expected MAE = Average candle range * zone multiplier + spread impact
        const zoneMultipliers = {
            EARLY: 0.8,      // Lower risk in early moves
            STRONG: 1.0,     // Normal risk
            EXTENDED: 1.3,   // Higher risk as move extends
            LATE: 1.6        // Highest risk near circuit
        };
        
        const multiplier = zoneMultipliers[zone] || 1.0;
        const spreadImpact = spread ? spread * 0.5 : 0;
        
        const expectedMAE = (avgRangePercent * multiplier) + spreadImpact;
        
        return {
            mae: expectedMAE,
            avgRange: avgRangePercent,
            zoneMultiplier: multiplier,
            spreadImpact,
            passed: expectedMAE <= (this.config.maxExpectedMAE || 999)
        };
    }

    calculateScore(breakdown, data, zone) {
        let score = 0;

        // Move quality (early = better)
        const movePercent = breakdown.move?.movePercent || 0;
        if (zone === 'EARLY') score += this.scoreWeights.moveQuality;
        else if (zone === 'STRONG') score += this.scoreWeights.moveQuality * 0.8;
        else if (zone === 'EXTENDED') score += this.scoreWeights.moveQuality * 0.5;
        else if (zone === 'LATE') score += this.scoreWeights.moveQuality * 0.3;

        // Volume
        if (breakdown.volume?.score) {
            score += (breakdown.volume.score / 100) * this.scoreWeights.volumeStrength;
        }

        // RS
        if (breakdown.rs?.score) {
            score += (breakdown.rs.score / 100) * this.scoreWeights.rsStrength;
        }

        // Spread
        if (breakdown.spread?.score) {
            score += (breakdown.spread.score / 100) * this.scoreWeights.spreadQuality;
        }

        // Structure (higher low + no wicks)
        let structScore = 0;
        if (breakdown.higherLow?.score) structScore += breakdown.higherLow.score * 0.5;
        if (breakdown.wick?.score) structScore += breakdown.wick.score * 0.5;
        else structScore += 50; // Default if not checked
        score += (structScore / 100) * this.scoreWeights.structureHealth;

        // VWAP
        if (breakdown.vwap?.score) {
            score += (breakdown.vwap.score / 100) * this.scoreWeights.vwapAlignment;
        } else {
            score += this.scoreWeights.vwapAlignment * 0.5; // Default
        }

        // Remaining room
        if (breakdown.room?.score) {
            score += (breakdown.room.score / 100) * this.scoreWeights.remainingRoom;
        }

        // Momentum
        if (breakdown.momentum?.score) {
            score += (breakdown.momentum.score / 100) * this.scoreWeights.momentumIntact;
        } else {
            score += this.scoreWeights.momentumIntact * 0.5;
        }

        return Math.round(score);
    }

    logResult(result) {
        const zoneEmoji = {
            'EARLY': '🟢',
            'STRONG': '🟢',
            'EXTENDED': '🟡',
            'LATE': '🟠'
        };

        const status = result.passed 
            ? (result.isElite ? '🌟 ELITE_RUNNER' : '✅ RUNNER')
            : '🚫 BLOCKED';

        const zoneTag = result.zone ? `${zoneEmoji[result.zone] || ''} ${result.zone}` : 'NO_ZONE';

        console.log(`[RUNNER_STOCK] ${status} | ${result.symbol} | ${zoneTag} | Move: ${result.movePercent.toFixed(2)}% | Room: ${result.remainingRoom.toFixed(2)}% | Score: ${result.score}`);
        
        if (result.blockers.length > 0) {
            result.blockers.forEach(b => {
                console.log(`[RUNNER_STOCK]   └─ ${b.filter}: ${b.reason}`);
            });
        }

        if (result.isElite) {
            console.log(`[RUNNER_STOCK]   └─ 🌟 ELITE BOOST: +${result.confidenceBoost} confidence`);
        }

        this.signalHistory.push({
            symbol: result.symbol,
            timestamp: result.timestamp,
            passed: result.passed,
            zone: result.zone,
            score: result.score,
            isElite: result.isElite
        });

        if (this.signalHistory.length > 100) this.signalHistory.shift();
    }
}

module.exports = new RunnerProbabilityStockService();
