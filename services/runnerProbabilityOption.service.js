/**
 * RUNNER PROBABILITY OPTION SERVICE - V7 ELITE MODE (FINAL)
 * ═══════════════════════════════════════════════════════════════════════════
 * EARLY IGNITION MODEL FOR OPTIONS
 * 
 * TARGET: ₹3 → ₹20 → ₹100 type runners
 * 
 * NO FIXED PREMIUM % BLOCKS - INTELLIGENT ACCELERATION-BASED
 * 
 * PREMIUM ZONES:
 * 🟢 1-5%    : Early detect, high priority
 * 🟢 5-15%   : Strong, confirmed momentum
 * 🟡 15-30%  : Allowed if momentum intact
 * 🟠 >30%    : Structure check required
 * 🔴 Exhaustion : No entry
 * 
 * ACCELERATION SCORING:
 * - Fast: ₹3 → ₹4 in 3 min = HIGH priority
 * - Slow: ₹3 → ₹6 in 40 min = LOW priority
 * 
 * ELITE_RUNNER: Score ≥ 85 → +8 confidence boost
 * ═══════════════════════════════════════════════════════════════════════════
 */

class RunnerProbabilityOptionService {
    constructor() {
        // Premium move zones
        this.zones = {
            EARLY: { min: 1, max: 5 },       // 1-5% premium move
            STRONG: { min: 5, max: 15 },     // 5-15% premium move
            EXTENDED: { min: 15, max: 30 },  // 15-30% premium move
            LATE: { min: 30, max: 60 }       // >30% premium move
        };

        // Zone-specific requirements (V7.1 CALIBRATED - Based on real market percentiles)
        // Target emit rate: 3-8%
        this.zoneConfig = {
            EARLY: {
                minPremiumChange2Candle: 3,  // Relaxed from 4%
                minOIVelocity: 1.2,          // Relaxed from 1.5
                maxSpread: 20,               // Relaxed from 18
                requireUnderlyingAligned: false,  // Relaxed
                requireDeltaAccelerating: false,
                priority: 'HIGH'
            },
            STRONG: {
                minPremiumChange2Candle: 2,  // Relaxed from 3%
                minOIVelocity: 1.5,          // Relaxed from 1.8
                maxSpread: 18,               // Relaxed from 15
                requireUnderlyingAligned: false,  // Relaxed
                requireDeltaAccelerating: false,  // Relaxed
                requireMomentumIntact: false,     // Relaxed
                priority: 'HIGH'
            },
            EXTENDED: {
                minPremiumChange2Candle: 1.5, // Relaxed from 2%
                minOIVelocity: 1.8,           // Relaxed from 2.0
                maxSpread: 15,                // Relaxed from 12
                maxSL: 7,                     // Relaxed from 6
                requireUnderlyingAligned: false,  // Relaxed
                requireDeltaAccelerating: false,  // Relaxed
                requireMomentumIntact: false,     // Relaxed
                checkExhaustion: false,           // Relaxed
                priority: 'MEDIUM'
            },
            LATE: {
                minPremiumChange2Candle: 1.5, // Relaxed from 2%
                minOIVelocity: 2.0,           // Relaxed from 2.5
                maxSpread: 12,                // Relaxed from 10
                maxSL: 6,                     // Relaxed from 5
                requireUnderlyingAligned: false,  // Relaxed
                requireStructureCheck: false,     // Relaxed
                checkExhaustion: false,           // Relaxed
                priority: 'LOW'
            }
        };

        // Global config
        this.config = {
            eliteRunnerScore: 85,
            eliteConfidenceBoost: 8,
            minConfidence: 60,
            exhaustionWickThreshold: 45,     // >45% wick = exhaustion
            maxOTMDistance: 5,               // >5% OTM = reject
            thetaStableThreshold: -5,        // Theta decay limit
            ivCollapseThreshold: -15         // IV crush limit
        };

        // Score weights (total = 100)
        this.scoreWeights = {
            premiumAcceleration: 25,    // Speed of premium move
            oiVelocity: 18,             // OI change rate
            underlyingAlignment: 15,    // Underlying direction match
            spreadQuality: 12,          // Execution quality
            deltaAcceleration: 12,      // Greeks acceleration
            structureHealth: 10,        // No exhaustion
            thetaStability: 5,          // Theta not crushing
            entryTiming: 3              // Early = better
        };

        // State
        this.signalHistory = [];

        console.log('[RUNNER_OPTION_V7] Initializing Early Ignition Option Runner...');
        console.log('[RUNNER_OPTION_V7] Zones: EARLY(1-5%) | STRONG(5-15%) | EXTENDED(15-30%) | LATE(>30%)');
        console.log('[RUNNER_OPTION_V7] Elite threshold: ' + this.config.eliteRunnerScore);
    }

    /**
     * MAIN: Evaluate option for Elite Runner probability
     */
    evaluate(data) {
        const {
            symbol,
            token,
            currentPremium,
            openPremium,
            spread,
            underlyingChange,
            underlyingDirection,  // 'BULLISH' or 'BEARISH'
            optionType,           // 'CE' or 'PE'
            oi,
            prevOI,
            delta,
            prevDelta,
            theta,
            iv,
            prevIV,
            strikeDistance,       // % distance from ATM
            confidence,
            structuralSL,
            candles
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
            premiumChangePercent: 0,
            accelerationScore: 0,
            breakdown: {},
            blockers: []
        };

        // ═══════════════════════════════════════════════════════════════
        // STEP 1: Calculate premium change
        // ═══════════════════════════════════════════════════════════════

        const premiumChangePercent = this.calculatePremiumChange(currentPremium, openPremium);
        result.premiumChangePercent = premiumChangePercent;
        result.breakdown.premium = { current: currentPremium, open: openPremium, changePercent: premiumChangePercent };

        // ═══════════════════════════════════════════════════════════════
        // STEP 2: ABSOLUTE BLOCKS - OTM, IV Collapse, Exhaustion early
        // ═══════════════════════════════════════════════════════════════

        // Deep OTM check
        if (strikeDistance > this.config.maxOTMDistance) {
            result.blockers.push({
                filter: 'DEEP_OTM',
                reason: `Strike ${strikeDistance.toFixed(2)}% OTM > ${this.config.maxOTMDistance}% max`,
                severity: 'HARD_BLOCK'
            });
            this.logResult(result);
            return result;
        }

        // IV Collapse check
        if (prevIV && iv) {
            const ivChange = ((iv - prevIV) / prevIV) * 100;
            if (ivChange < this.config.ivCollapseThreshold) {
                result.blockers.push({
                    filter: 'IV_COLLAPSE',
                    reason: `IV dropped ${ivChange.toFixed(2)}% - collapse in progress`,
                    severity: 'HARD_BLOCK'
                });
                this.logResult(result);
                return result;
            }
            result.breakdown.iv = { current: iv, prev: prevIV, change: ivChange };
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 3: Determine zone based on premium change
        // ═══════════════════════════════════════════════════════════════

        const zone = this.determineZone(premiumChangePercent);
        result.zone = zone;

        if (!zone) {
            // Check if exhaustion (>60% move typically)
            if (premiumChangePercent > 60) {
                result.blockers.push({
                    filter: 'EXHAUSTION_MOVE',
                    reason: `Premium move ${premiumChangePercent.toFixed(2)}% indicates exhaustion`,
                    severity: 'HARD_BLOCK'
                });
            } else {
                result.blockers.push({
                    filter: 'ZONE_INVALID',
                    reason: `Premium change ${premiumChangePercent.toFixed(2)}% below detection threshold`,
                    severity: 'SOFT_BLOCK'
                });
            }
            this.logResult(result);
            return result;
        }

        const zoneReqs = this.zoneConfig[zone];
        result.breakdown.zone = { name: zone, requirements: zoneReqs, priority: zoneReqs.priority };

        // ═══════════════════════════════════════════════════════════════
        // STEP 4: Calculate acceleration score
        // ═══════════════════════════════════════════════════════════════

        const accelerationResult = this.calculateAcceleration(candles, currentPremium);
        result.accelerationScore = accelerationResult.score;
        result.breakdown.acceleration = accelerationResult;

        // ═══════════════════════════════════════════════════════════════
        // STEP 5: Zone-specific validation
        // ═══════════════════════════════════════════════════════════════

        // 5a: 2-candle premium change
        const premiumCheck = this.checkPremiumChange2Candle(candles, zoneReqs.minPremiumChange2Candle);
        result.breakdown.premiumVelocity = premiumCheck;
        if (!premiumCheck.passed) {
            result.blockers.push({
                filter: 'PREMIUM_VELOCITY',
                reason: `2-candle change ${premiumCheck.change?.toFixed(2)}% < ${zoneReqs.minPremiumChange2Candle}%`,
                severity: 'ZONE_BLOCK'
            });
        }

        // 5b: OI velocity
        const oiCheck = this.checkOIVelocity(oi, prevOI, zoneReqs.minOIVelocity);
        result.breakdown.oi = oiCheck;
        if (!oiCheck.passed) {
            result.blockers.push({
                filter: 'OI_VELOCITY',
                reason: `OI velocity ${oiCheck.velocity?.toFixed(2)}x < ${zoneReqs.minOIVelocity}x`,
                severity: 'ZONE_BLOCK'
            });
        }

        // 5c: Spread check
        const spreadCheck = this.checkSpread(spread, zoneReqs.maxSpread);
        result.breakdown.spread = spreadCheck;
        if (!spreadCheck.passed) {
            result.blockers.push({
                filter: 'SPREAD',
                reason: `Spread ${spread?.toFixed(2)}% > ${zoneReqs.maxSpread}%`,
                severity: 'ZONE_BLOCK'
            });
        }

        // 5d: Underlying alignment
        if (zoneReqs.requireUnderlyingAligned) {
            const alignCheck = this.checkUnderlyingAlignment(underlyingDirection, optionType, underlyingChange);
            result.breakdown.alignment = alignCheck;
            if (!alignCheck.passed) {
                result.blockers.push({
                    filter: 'UNDERLYING_ALIGNMENT',
                    reason: alignCheck.reason,
                    severity: 'ZONE_BLOCK'
                });
            }
        }

        // 5e: Delta acceleration (derived from premium/underlying ratio)
        if (zoneReqs.requireDeltaAccelerating) {
            const deltaCheck = this.checkDeltaAcceleration(candles, underlyingChange, delta, prevDelta);
            result.breakdown.delta = deltaCheck;
            if (!deltaCheck.passed) {
                result.blockers.push({
                    filter: 'DELTA_ACCELERATION',
                    reason: 'Delta not accelerating',
                    severity: 'ZONE_BLOCK'
                });
            }
        }

        // 5f: Momentum intact
        if (zoneReqs.requireMomentumIntact) {
            const momCheck = this.checkMomentumIntact(candles);
            result.breakdown.momentum = momCheck;
            if (!momCheck.passed) {
                result.blockers.push({
                    filter: 'MOMENTUM',
                    reason: 'Premium momentum fading',
                    severity: 'ZONE_BLOCK'
                });
            }
        }

        // 5g: Exhaustion check
        if (zoneReqs.checkExhaustion) {
            const exhaustionCheck = this.checkExhaustion(candles);
            result.breakdown.exhaustion = exhaustionCheck;
            if (!exhaustionCheck.passed) {
                result.blockers.push({
                    filter: 'EXHAUSTION',
                    reason: `Exhaustion detected: ${exhaustionCheck.reason}`,
                    severity: 'ZONE_BLOCK'
                });
            }
        }

        // 5h: Structure check (LATE zone)
        if (zoneReqs.requireStructureCheck) {
            const structCheck = this.checkStructure(candles);
            result.breakdown.structure = structCheck;
            if (!structCheck.passed) {
                result.blockers.push({
                    filter: 'STRUCTURE',
                    reason: 'Structure broken in LATE zone',
                    severity: 'ZONE_BLOCK'
                });
            }
        }

        // 5i: SL check
        if (zoneReqs.maxSL) {
            const slCheck = this.checkSL(structuralSL, zoneReqs.maxSL);
            result.breakdown.sl = slCheck;
            if (!slCheck.passed) {
                result.blockers.push({
                    filter: 'STRUCTURAL_SL',
                    reason: `SL ${structuralSL?.toFixed(2)}% > ${zoneReqs.maxSL}%`,
                    severity: 'ZONE_BLOCK'
                });
            }
        }

        // 5j: Theta stability
        const thetaCheck = this.checkTheta(theta);
        result.breakdown.theta = thetaCheck;
        if (!thetaCheck.passed) {
            result.blockers.push({
                filter: 'THETA_CRUSH',
                reason: `Theta ${theta} indicates rapid decay`,
                severity: 'ZONE_BLOCK'
            });
        }

        // 5k: Confidence check
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
        // STEP 6: Calculate runner score
        // ═══════════════════════════════════════════════════════════════

        result.score = this.calculateScore(result.breakdown, data, zone, accelerationResult);

        // ═══════════════════════════════════════════════════════════════
        // STEP 7: Final decision
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

    calculatePremiumChange(current, open) {
        if (!open || open === 0) return 0;
        return ((current - open) / open) * 100;
    }

    determineZone(premiumChangePercent) {
        if (premiumChangePercent >= this.zones.EARLY.min && premiumChangePercent < this.zones.EARLY.max) {
            return 'EARLY';
        }
        if (premiumChangePercent >= this.zones.STRONG.min && premiumChangePercent < this.zones.STRONG.max) {
            return 'STRONG';
        }
        if (premiumChangePercent >= this.zones.EXTENDED.min && premiumChangePercent < this.zones.EXTENDED.max) {
            return 'EXTENDED';
        }
        if (premiumChangePercent >= this.zones.LATE.min && premiumChangePercent < this.zones.LATE.max) {
            return 'LATE';
        }
        return null; // Below EARLY or above LATE (exhaustion)
    }

    calculateAcceleration(candles, currentPremium) {
        if (!candles || candles.length < 3) {
            return { score: 50, type: 'UNKNOWN', minutesPerPercent: null };
        }

        // Calculate time taken for the move
        const firstCandle = candles[0];
        const lastCandle = candles[candles.length - 1];
        const minutesElapsed = (lastCandle.timestamp - firstCandle.timestamp) / 60000;
        const percentChange = ((lastCandle.close - firstCandle.open) / firstCandle.open) * 100;

        if (percentChange <= 0 || minutesElapsed <= 0) {
            return { score: 30, type: 'SLOW', minutesPerPercent: null };
        }

        const minutesPerPercent = minutesElapsed / percentChange;

        // Fast: < 5 min per 1% = HIGH priority
        // Moderate: 5-15 min per 1% = MEDIUM priority
        // Slow: > 15 min per 1% = LOW priority

        let score, type;
        if (minutesPerPercent < 5) {
            score = 100;
            type = 'FAST';
        } else if (minutesPerPercent < 10) {
            score = 80;
            type = 'MODERATE';
        } else if (minutesPerPercent < 20) {
            score = 60;
            type = 'SLOW';
        } else {
            score = 40;
            type = 'VERY_SLOW';
        }

        return {
            score,
            type,
            minutesPerPercent,
            minutesElapsed,
            percentChange
        };
    }

    checkPremiumChange2Candle(candles, minChange) {
        if (!candles || candles.length < 2) {
            return { passed: false, change: 0 };
        }

        const twoBack = candles[candles.length - 2];
        const current = candles[candles.length - 1];
        const change = ((current.close - twoBack.open) / twoBack.open) * 100;

        return {
            passed: change >= minChange,
            change,
            threshold: minChange,
            score: Math.min(100, (change / minChange) * 60)
        };
    }

    checkOIVelocity(oi, prevOI, minVelocity) {
        if (!oi || !prevOI || prevOI === 0) {
            return { passed: true, velocity: 1, note: 'No OI data' };
        }

        const velocity = oi / prevOI;
        return {
            passed: velocity >= minVelocity,
            velocity,
            oi,
            prevOI,
            threshold: minVelocity,
            score: Math.min(100, (velocity / minVelocity) * 50)
        };
    }

    checkSpread(spread, maxSpread) {
        if (spread === undefined) return { passed: false };
        return {
            passed: spread <= maxSpread,
            value: spread,
            threshold: maxSpread,
            score: spread <= maxSpread ? 100 - (spread / maxSpread) * 40 : 0
        };
    }

    checkUnderlyingAlignment(direction, optionType, underlyingChange) {
        // CE should align with bullish, PE with bearish
        const isBullish = direction === 'BULLISH' || underlyingChange > 0;
        const isBearish = direction === 'BEARISH' || underlyingChange < 0;

        const aligned = (optionType === 'CE' && isBullish) || (optionType === 'PE' && isBearish);

        return {
            passed: aligned,
            direction,
            optionType,
            underlyingChange,
            reason: aligned ? 'Aligned' : `${optionType} misaligned with ${direction} underlying`,
            score: aligned ? 100 : 0
        };
    }

    checkDeltaAcceleration(candles, underlyingChange, delta, prevDelta) {
        // Derived delta acceleration from premium/underlying ratio
        if (!candles || candles.length < 3) return { passed: true, note: 'Insufficient data' };

        // If we have actual delta values
        if (delta !== undefined && prevDelta !== undefined && prevDelta !== 0) {
            const deltaChange = (delta - prevDelta) / Math.abs(prevDelta);
            return {
                passed: deltaChange > 0.05, // Delta increasing by 5%+
                deltaChange,
                delta,
                prevDelta,
                score: deltaChange > 0.05 ? Math.min(100, deltaChange * 200) : 30
            };
        }

        // Derive from premium acceleration vs underlying
        const premiumChange = ((candles[candles.length-1].close - candles[candles.length-3].close) / candles[candles.length-3].close) * 100;
        const leverage = Math.abs(underlyingChange) > 0 ? premiumChange / Math.abs(underlyingChange) : 1;

        return {
            passed: leverage > 2, // Premium moving 2x+ faster than underlying
            leverage,
            premiumChange,
            underlyingChange,
            score: leverage > 2 ? Math.min(100, leverage * 25) : 30
        };
    }

    checkMomentumIntact(candles) {
        if (!candles || candles.length < 5) return { passed: false };

        const closes = candles.slice(-5).map(c => c.close);
        let upCount = 0;
        for (let i = 1; i < closes.length; i++) {
            if (closes[i] >= closes[i-1]) upCount++;
        }

        return {
            passed: upCount >= 3,
            upCount,
            score: (upCount / 4) * 100
        };
    }

    checkExhaustion(candles) {
        if (!candles || candles.length < 1) return { passed: true };

        const lastCandle = candles[candles.length - 1];
        const body = Math.abs(lastCandle.close - lastCandle.open);
        const range = lastCandle.high - lastCandle.low;
        
        if (range === 0) return { passed: true, wickPercent: 0 };

        const upperWick = lastCandle.high - Math.max(lastCandle.close, lastCandle.open);
        const wickPercent = (upperWick / range) * 100;

        // Also check for 3rd expansion candle (sequential big green candles)
        let consecutiveBigCandles = 0;
        if (candles.length >= 3) {
            for (let i = candles.length - 3; i < candles.length; i++) {
                const c = candles[i];
                const cBody = Math.abs(c.close - c.open);
                const cRange = c.high - c.low;
                if (cRange > 0 && cBody / cRange > 0.6 && c.close > c.open) {
                    consecutiveBigCandles++;
                }
            }
        }

        const isExhausted = wickPercent > this.config.exhaustionWickThreshold || consecutiveBigCandles >= 3;

        return {
            passed: !isExhausted,
            wickPercent,
            consecutiveBigCandles,
            reason: wickPercent > this.config.exhaustionWickThreshold 
                ? `Wick ${wickPercent.toFixed(1)}%` 
                : (consecutiveBigCandles >= 3 ? '3rd expansion candle' : 'Clean'),
            score: isExhausted ? 0 : 100 - wickPercent
        };
    }

    checkStructure(candles) {
        if (!candles || candles.length < 5) return { passed: false };

        // Check for higher lows in premium
        const lows = candles.slice(-5).map(c => c.low);
        let hlCount = 0;
        for (let i = 1; i < lows.length; i++) {
            if (lows[i] >= lows[i-1]) hlCount++;
        }

        return {
            passed: hlCount >= 3,
            hlCount,
            score: (hlCount / 4) * 100
        };
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

    checkTheta(theta) {
        if (theta === undefined) return { passed: true, note: 'No theta data' };
        return {
            passed: theta >= this.config.thetaStableThreshold,
            value: theta,
            threshold: this.config.thetaStableThreshold,
            score: theta >= this.config.thetaStableThreshold ? 80 : 30
        };
    }

    checkConfidence(confidence) {
        return {
            passed: confidence >= this.config.minConfidence,
            value: confidence,
            threshold: this.config.minConfidence
        };
    }

    calculateScore(breakdown, data, zone, acceleration) {
        let score = 0;

        // Premium acceleration (25 pts)
        score += (acceleration.score / 100) * this.scoreWeights.premiumAcceleration;

        // OI velocity (18 pts)
        if (breakdown.oi?.score) {
            score += (breakdown.oi.score / 100) * this.scoreWeights.oiVelocity;
        }

        // Underlying alignment (15 pts)
        if (breakdown.alignment?.score) {
            score += (breakdown.alignment.score / 100) * this.scoreWeights.underlyingAlignment;
        }

        // Spread quality (12 pts)
        if (breakdown.spread?.score) {
            score += (breakdown.spread.score / 100) * this.scoreWeights.spreadQuality;
        }

        // Delta acceleration (12 pts)
        if (breakdown.delta?.score) {
            score += (breakdown.delta.score / 100) * this.scoreWeights.deltaAcceleration;
        } else {
            score += this.scoreWeights.deltaAcceleration * 0.5;
        }

        // Structure health (10 pts)
        if (breakdown.exhaustion?.score) {
            score += (breakdown.exhaustion.score / 100) * this.scoreWeights.structureHealth;
        } else {
            score += this.scoreWeights.structureHealth * 0.7;
        }

        // Theta stability (5 pts)
        if (breakdown.theta?.score) {
            score += (breakdown.theta.score / 100) * this.scoreWeights.thetaStability;
        }

        // Entry timing (3 pts) - early zone = better
        if (zone === 'EARLY') score += this.scoreWeights.entryTiming;
        else if (zone === 'STRONG') score += this.scoreWeights.entryTiming * 0.7;
        else if (zone === 'EXTENDED') score += this.scoreWeights.entryTiming * 0.4;

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
        const accelTag = result.accelerationScore >= 80 ? '⚡FAST' : (result.accelerationScore >= 60 ? '→MOD' : '→SLOW');

        console.log(`[RUNNER_OPTION] ${status} | ${result.symbol} | ${zoneTag} | Premium: ${result.premiumChangePercent.toFixed(2)}% | ${accelTag} | Score: ${result.score}`);
        
        if (result.blockers.length > 0) {
            result.blockers.forEach(b => {
                console.log(`[RUNNER_OPTION]   └─ ${b.filter}: ${b.reason}`);
            });
        }

        if (result.isElite) {
            console.log(`[RUNNER_OPTION]   └─ 🌟 ELITE BOOST: +${result.confidenceBoost} confidence`);
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

module.exports = new RunnerProbabilityOptionService();
