const instruments = require('../config/instruments.config');
const settings = require('../config/settings.config');
const indicatorService = require('./indicator.service');
const regimeService = require('./regime.service');
const riskRewardService = require('./riskReward.service');
const safetyService = require('./safety.service');
const signalCooldownService = require('./signalCooldown.service');
const adaptiveFilterService = require('./adaptiveFilter.service');

// ============================================================
// 🔴 INSTITUTIONAL GUARDS - HARD ENFORCEMENT (NOT OPTIONAL)
// ============================================================
const masterSignalGuardService = require('./masterSignalGuard.service');

class OrchestratorService {
    constructor() {
        this.signalHistory = new Map();
        this.activeSignals = [];
        this.lastAnalysis = new Map();
        this.signalRankScores = new Map();
        this.cooldownEnabled = true;
        this.guardStats = {
            signalsGenerated: 0,
            signalsBlocked: 0,
            blockReasons: new Map()
        };
    }

    async analyzeInstrument(instrument, candles5m, candles15m, candlesDaily) {
        const indicators5m = indicatorService.getFullIndicators(candles5m);
        
        if (indicators5m.error) {
            return { 
                instrument,
                signal: null, 
                reason: indicators5m.error,
                timestamp: Date.now()
            };
        }

        const indicators15m = indicatorService.getFullIndicators(candles15m);
        const indicatorsDaily = indicatorService.getFullIndicators(candlesDaily);

        const breakout = this.checkBreakout(candles5m, indicators5m);
        const volumeConfirm = this.checkVolumeConfirmation(indicators5m);
        const higherTFAlign = this.checkHigherTimeframeAlignment(indicators15m, indicatorsDaily);
        const institutionalHook = this.checkInstitutionalLayer(candles5m, indicators5m);

        const regime = regimeService.analyzeRegime(candles5m, indicators5m);

        const direction = breakout.type === 'BULLISH' ? 'LONG' : breakout.type === 'BEARISH' ? 'SHORT' : null;
        const riskReward = direction ? riskRewardService.calculate(indicators5m.price, candles5m, indicators5m, direction) : null;

        const safetyCheck = safetyService.runSafetyChecks(
            instrument,
            indicators5m,
            breakout,
            volumeConfirm,
            riskReward,
            regime
        );

        const analysisData = {
            instrument,
            indicators: indicators5m,
            breakout,
            volumeConfirm,
            higherTF: higherTFAlign,
            institutional: institutionalHook,
            riskReward,
            regime,
            safety: safetyCheck
        };

        this.lastAnalysis.set(instrument.token, analysisData);

        if (!safetyCheck.pass) {
            return {
                instrument,
                signal: null,
                reason: `Safety check failed: ${safetyCheck.criticalFails.join(', ')}`,
                analysis: analysisData,
                timestamp: Date.now()
            };
        }

        const signal = this.generateSignal(analysisData);

        if (signal) {
            if (this.cooldownEnabled) {
                const cooldownCheck = signalCooldownService.canEmitSignal(
                    instrument.token,
                    signal.signal,
                    signal.direction
                );

                if (!cooldownCheck.allowed) {
                    return {
                        instrument,
                        signal: null,
                        reason: `Signal blocked: ${cooldownCheck.reason}`,
                        cooldownRemainingMs: cooldownCheck.remainingMs,
                        analysis: analysisData,
                        timestamp: Date.now()
                    };
                }

                signalCooldownService.recordSignal(
                    instrument.token,
                    signal.signal,
                    signal.direction,
                    { price: signal.price, strength: signal.strength }
                );
            }

            this.recordSignal(instrument.token, signal);
        }

        return {
            instrument,
            signal,
            analysis: analysisData,
            timestamp: Date.now()
        };
    }

    checkBreakout(candles, indicators) {
        if (!candles || candles.length < 20) {
            return { valid: false, type: null, rejectionReason: 'INSUFFICIENT_DATA' };
        }

        const recent = candles.slice(-20);
        const last5 = candles.slice(-5);
        const closes = recent.map(c => c.close);

        const lastClose = closes[closes.length - 1];
        const prevClose = closes[closes.length - 2];

        const last5Highs = last5.map(c => c.high);
        const last5Lows = last5.map(c => c.low);
        const highest5 = Math.max(...last5Highs.slice(0, -1));
        const lowest5 = Math.min(...last5Lows.slice(0, -1));

        const ema20 = indicators.ema20 || 0;
        const ema50 = indicators.ema50 || 0;
        const volumeRatio = indicators.volumeRatio || 0;
        const rsi = indicators.rsi || 50;
        const atrPercent = indicators.atrPercent || 0;

        // 🔴 GET ADAPTIVE FILTER THRESHOLDS
        const adaptiveFilters = adaptiveFilterService.getFilters();
        const volumeThreshold = adaptiveFilters.volumeThreshold;
        const atrThreshold = adaptiveFilters.atrThreshold;
        const bullishRSIRange = adaptiveFilters.rsiRangeBullish;
        const bearishRSIRange = adaptiveFilters.rsiRangeBearish;

        // ============================================
        // BULLISH BREAKOUT VALIDATION
        // ============================================
        // MANDATORY CONDITIONS (must ALL pass)
        const bullishMandatory = {
            priceBreakout: lastClose > highest5,
            volumeConfirm: volumeRatio >= volumeThreshold
        };
        const bullishMandatoryPassed = bullishMandatory.priceBreakout && bullishMandatory.volumeConfirm;

        // OPTIONAL CONDITIONS (need 2 of 3) - Using adaptive RSI/ATR
        const bullishOptional = {
            emaAlignment: ema20 > ema50,
            rsiInZone: rsi >= bullishRSIRange.min && rsi <= bullishRSIRange.max,
            atrSafe: atrPercent < atrThreshold
        };
        const bullishOptionalCount = Object.values(bullishOptional).filter(v => v === true).length;
        const bullishOptionalPassed = bullishOptionalCount >= 2;

        const bullishValid = bullishMandatoryPassed && bullishOptionalPassed;

        // Build bullish rejection reason
        let bullishRejection = [];
        if (!bullishMandatory.priceBreakout) bullishRejection.push('CLOSE_NOT_ABOVE_HIGHEST5');
        if (!bullishMandatory.volumeConfirm) bullishRejection.push(`VOLUME_BELOW_${volumeThreshold}x`);
        if (bullishMandatoryPassed && !bullishOptionalPassed) {
            bullishRejection.push(`OPTIONAL_${bullishOptionalCount}/3_NEED_2`);
            if (!bullishOptional.emaAlignment) bullishRejection.push('EMA_NOT_ALIGNED');
            if (!bullishOptional.rsiInZone) bullishRejection.push(`RSI_OUT_OF_${bullishRSIRange.min}-${bullishRSIRange.max}`);
            if (!bullishOptional.atrSafe) bullishRejection.push(`ATR_ABOVE_${atrThreshold}%`);
        }

        // ============================================
        // BEARISH BREAKOUT VALIDATION
        // ============================================
        // MANDATORY CONDITIONS (must ALL pass)
        const bearishMandatory = {
            priceBreakout: lastClose < lowest5,
            volumeConfirm: volumeRatio >= volumeThreshold
        };
        const bearishMandatoryPassed = bearishMandatory.priceBreakout && bearishMandatory.volumeConfirm;

        // OPTIONAL CONDITIONS (need 2 of 3) - Using adaptive RSI/ATR
        const bearishOptional = {
            emaAlignment: ema20 < ema50,
            rsiInZone: rsi >= bearishRSIRange.min && rsi <= bearishRSIRange.max,
            atrSafe: atrPercent < atrThreshold
        };
        const bearishOptionalCount = Object.values(bearishOptional).filter(v => v === true).length;
        const bearishOptionalPassed = bearishOptionalCount >= 2;

        const bearishValid = bearishMandatoryPassed && bearishOptionalPassed;

        // Build bearish rejection reason
        let bearishRejection = [];
        if (!bearishMandatory.priceBreakout) bearishRejection.push('CLOSE_NOT_BELOW_LOWEST5');
        if (!bearishMandatory.volumeConfirm) bearishRejection.push(`VOLUME_BELOW_${volumeThreshold}x`);
        if (bearishMandatoryPassed && !bearishOptionalPassed) {
            bearishRejection.push(`OPTIONAL_${bearishOptionalCount}/3_NEED_2`);
            if (!bearishOptional.emaAlignment) bearishRejection.push('EMA_NOT_ALIGNED');
            if (!bearishOptional.rsiInZone) bearishRejection.push(`RSI_OUT_OF_${bearishRSIRange.min}-${bearishRSIRange.max}`);
            if (!bearishOptional.atrSafe) bearishRejection.push(`ATR_ABOVE_${atrThreshold}%`);
        }

        // ============================================
        // FINAL RESULT
        // ============================================
        const valid = bullishValid || bearishValid;
        const type = bullishValid ? 'BULLISH' : bearishValid ? 'BEARISH' : null;
        
        // Pick rejection reason from closer direction
        let rejectionReason = null;
        if (!valid) {
            const bullScore = (bullishMandatory.priceBreakout ? 1 : 0) + (bullishMandatory.volumeConfirm ? 1 : 0);
            const bearScore = (bearishMandatory.priceBreakout ? 1 : 0) + (bearishMandatory.volumeConfirm ? 1 : 0);
            rejectionReason = bullScore >= bearScore ? bullishRejection.join(' | ') : bearishRejection.join(' | ');
        }

        return {
            valid,
            type,
            rejectionReason,
            adaptiveFilters: {
                volumeThreshold,
                atrThreshold,
                isTightened: adaptiveFilters.isTightened
            },
            mandatoryConditions: type === 'BULLISH' ? bullishMandatory : type === 'BEARISH' ? bearishMandatory : null,
            optionalConditions: type === 'BULLISH' ? bullishOptional : type === 'BEARISH' ? bearishOptional : null,
            optionalPassCount: type === 'BULLISH' ? bullishOptionalCount : type === 'BEARISH' ? bearishOptionalCount : 0,
            highest5,
            lowest5,
            details: {
                lastClose,
                prevClose,
                ema20,
                ema50,
                volumeRatio,
                rsi,
                atrPercent,
                vwap: indicators.vwap
            }
        };
    }

    checkVolumeConfirmation(indicators) {
        const volumeRatio = indicators.volumeRatio || 0;
        const volumeConfig = settings.indicators?.volume || { minRatio: 1.5, highRatio: 2.0, explosionRatio: 3.0 };

        let strength = 'LOW';
        if (volumeRatio >= volumeConfig.explosionRatio) {
            strength = 'EXPLOSION';
        } else if (volumeRatio >= volumeConfig.highRatio) {
            strength = 'HIGH';
        } else if (volumeRatio >= volumeConfig.minRatio) {
            strength = 'MODERATE';
        }

        return {
            confirmed: volumeRatio >= volumeConfig.minRatio,
            ratio: volumeRatio,
            strength,
            avgVolume: indicators.avgVolume,
            currentVolume: indicators.volume
        };
    }

    checkHigherTimeframeAlignment(indicators15m, indicatorsDaily) {
        const tf15mBullish = indicators15m?.emaTrend === 'BULLISH' || indicators15m?.emaTrend === 'STRONG_BULLISH';
        const tf15mBearish = indicators15m?.emaTrend === 'BEARISH' || indicators15m?.emaTrend === 'STRONG_BEARISH';
        
        const dailyBullish = indicatorsDaily?.emaTrend === 'BULLISH' || indicatorsDaily?.emaTrend === 'STRONG_BULLISH';
        const dailyBearish = indicatorsDaily?.emaTrend === 'BEARISH' || indicatorsDaily?.emaTrend === 'STRONG_BEARISH';

        const tf15mRsiOk = indicators15m?.rsi > 35 && indicators15m?.rsi < 75;
        const dailyRsiOk = indicatorsDaily?.rsi > 35 && indicatorsDaily?.rsi < 75;

        const fullBullishAlignment = tf15mBullish && dailyBullish;
        const fullBearishAlignment = tf15mBearish && dailyBearish;

        let score = 0;
        if (tf15mBullish || dailyBullish) score += 1;
        if (fullBullishAlignment || fullBearishAlignment) score += 1;
        if (tf15mRsiOk) score += 0.5;
        if (dailyRsiOk) score += 0.5;

        return {
            tf15m: {
                trend: indicators15m?.emaTrend,
                rsi: indicators15m?.rsi,
                aligned: (tf15mBullish || tf15mBearish) && tf15mRsiOk
            },
            daily: {
                trend: indicatorsDaily?.emaTrend,
                rsi: indicatorsDaily?.rsi,
                aligned: (dailyBullish || dailyBearish) && dailyRsiOk
            },
            fullAlignment: fullBullishAlignment || fullBearishAlignment,
            alignmentType: fullBullishAlignment ? 'BULLISH' : fullBearishAlignment ? 'BEARISH' : 'NONE',
            score
        };
    }

    checkInstitutionalLayer(candles, indicators) {
        if (!candles || candles.length < 5) {
            return { detected: false, score: 0 };
        }

        const lastCandles = candles.slice(-5);
        
        const largeBars = lastCandles.filter(c => {
            const range = c.high - c.low;
            const avgRange = indicators.atr || 0;
            return range > avgRange * 1.5 && c.volume > (indicators.avgVolume || 0) * 2;
        });

        const priceAboveVwap = indicators.price > (indicators.vwap || 0);
        const strongMomentum = (indicators.macdHistogram || 0) > 0 && (indicators.rsi || 0) > 50;

        const wideRangeBar = lastCandles.some(c => {
            const range = c.high - c.low;
            const body = Math.abs(c.close - c.open);
            return body > range * 0.7 && c.volume > (indicators.avgVolume || 0) * 2.5;
        });

        let score = 0;
        if (largeBars.length > 0) score += 2;
        if (priceAboveVwap) score += 1;
        if (strongMomentum) score += 1;
        if (wideRangeBar) score += 2;

        return {
            detected: score >= 3,
            largeBars: largeBars.length,
            priceAboveVwap,
            strongMomentum,
            wideRangeBar,
            score
        };
    }

    generateSignal(analysisData) {
        const { 
            instrument, 
            indicators, 
            breakout, 
            volumeConfirm, 
            higherTF, 
            institutional, 
            riskReward,
            regime,
            safety 
        } = analysisData;

        if (!breakout.valid || !volumeConfirm.confirmed) {
            return null;
        }

        if (!riskReward || !riskReward.valid) {
            return null;
        }

        let strength = 0;

        strength += breakout.valid ? 2 : 0;
        strength += breakout.priceAboveResistance || breakout.priceBelowSupport ? 1 : 0;
        strength += breakout.emaBreakout ? 1 : 0;

        strength += volumeConfirm.confirmed ? 1 : 0;
        strength += volumeConfirm.strength === 'HIGH' ? 1 : 0;
        strength += volumeConfirm.strength === 'EXPLOSION' ? 2 : 0;

        strength += higherTF.fullAlignment ? 2 : 0;
        strength += higherTF.score;

        strength += institutional.detected ? 2 : 0;
        strength += Math.min(institutional.score, 4);

        strength += riskReward.primaryRR >= 2.5 ? 2 : riskReward.primaryRR >= 2 ? 1 : 0;

        if (regime && regime.regime === 'TRENDING_UP' && breakout.type === 'BULLISH') {
            strength += 1;
        }
        if (regime && regime.regime === 'TRENDING_DOWN' && breakout.type === 'BEARISH') {
            strength += 1;
        }

        // ============================================
        // STRONG SIGNAL HARDENING (MANDATORY + OPTIONAL)
        // ============================================
        const volumeRatio = indicators.volumeRatio || 0;
        const rsi = indicators.rsi || 50;
        const adx = indicators.adx || 15;
        const primaryRR = riskReward.primaryRR || 0;
        const emaTrend = indicators.emaTrend || '';

        let signalType = null;
        let strongDowngradeReason = null;
        
        if (breakout.type === 'BULLISH') {
            // MANDATORY for STRONG_BUY (must ALL pass)
            const strongMandatory = {
                volumeCheck: volumeRatio >= 2.0,
                rrGood: primaryRR >= 1.8
            };
            const strongMandatoryPassed = strongMandatory.volumeCheck && strongMandatory.rrGood;

            // OPTIONAL for STRONG_BUY (need 2 of 3)
            const strongOptional = {
                rsiInZone: rsi >= 58 && rsi <= 72,
                adxStrong: adx >= 20,
                trendAligned: emaTrend === 'STRONG_BULLISH' || emaTrend === 'BULLISH'
            };
            const strongOptionalCount = Object.values(strongOptional).filter(v => v === true).length;
            const strongOptionalPassed = strongOptionalCount >= 2;

            const isStrong = strongMandatoryPassed && strongOptionalPassed;
            signalType = isStrong ? 'STRONG_BUY' : 'BUY';

            // Log downgrade reason if not STRONG
            if (!isStrong) {
                const reasons = [];
                if (!strongMandatory.volumeCheck) reasons.push('VOL_BELOW_2.0x');
                if (!strongMandatory.rrGood) reasons.push('RR_BELOW_1.8');
                if (strongMandatoryPassed && !strongOptionalPassed) {
                    reasons.push(`OPTIONAL_${strongOptionalCount}/3_NEED_2`);
                }
                strongDowngradeReason = reasons.join(' | ');
            }
            
        } else if (breakout.type === 'BEARISH') {
            // MANDATORY for STRONG_SELL (must ALL pass)
            const strongMandatory = {
                volumeCheck: volumeRatio >= 2.0,
                rrGood: primaryRR >= 1.8
            };
            const strongMandatoryPassed = strongMandatory.volumeCheck && strongMandatory.rrGood;

            // OPTIONAL for STRONG_SELL (need 2 of 3)
            const strongOptional = {
                rsiInZone: rsi >= 28 && rsi <= 42,
                adxStrong: adx >= 20,
                trendAligned: emaTrend === 'STRONG_BEARISH' || emaTrend === 'BEARISH'
            };
            const strongOptionalCount = Object.values(strongOptional).filter(v => v === true).length;
            const strongOptionalPassed = strongOptionalCount >= 2;

            const isStrong = strongMandatoryPassed && strongOptionalPassed;
            signalType = isStrong ? 'STRONG_SELL' : 'SELL';

            // Log downgrade reason if not STRONG
            if (!isStrong) {
                const reasons = [];
                if (!strongMandatory.volumeCheck) reasons.push('VOL_BELOW_2.0x');
                if (!strongMandatory.rrGood) reasons.push('RR_BELOW_1.8');
                if (strongMandatoryPassed && !strongOptionalPassed) {
                    reasons.push(`OPTIONAL_${strongOptionalCount}/3_NEED_2`);
                }
                strongDowngradeReason = reasons.join(' | ');
            }
        }

        if (!signalType) return null;

        const rankScore = this.calculateRankScore(strength, volumeConfirm, higherTF, institutional, riskReward);

        const signal = {
            instrument: {
                symbol: instrument.symbol,
                token: instrument.token,
                name: instrument.name,
                exchange: instrument.exchange,
                sector: instrument.sector
            },
            signal: signalType,
            direction: breakout.type === 'BULLISH' ? 'LONG' : 'SHORT',
            strength,
            rankScore,
            confidence: Math.min(100, (strength / 15) * 100),
            price: indicators.price,
            entry: riskReward.entry,
            stopLoss: riskReward.stopLoss,
            target1: riskReward.target1,
            target2: riskReward.target2,
            target3: riskReward.target3,
            riskReward: riskReward.primaryRR,
            riskPercent: riskReward.riskPercent,
            strongDowngradeReason,
            analysis: {
                breakout: {
                    type: breakout.type,
                    rejectionReason: breakout.rejectionReason,
                    mandatoryConditions: breakout.mandatoryConditions,
                    optionalConditions: breakout.optionalConditions,
                    optionalPassCount: breakout.optionalPassCount
                },
                volume: {
                    ratio: volumeConfirm.ratio,
                    strength: volumeConfirm.strength
                },
                higherTimeframe: {
                    alignment: higherTF.alignmentType,
                    score: higherTF.score
                },
                institutional: {
                    detected: institutional.detected,
                    score: institutional.score
                },
                regime: regime?.regime,
                indicators: {
                    ema20: indicators.ema20,
                    ema50: indicators.ema50,
                    rsi: indicators.rsi,
                    atr: indicators.atr,
                    vwap: indicators.vwap,
                    macdHistogram: indicators.macdHistogram
                }
            },
            safety: {
                score: safety.score,
                warnings: safety.warnings
            },
            timestamp: Date.now()
        };

        this.signalRankScores.set(instrument.token, rankScore);

        // ============================================================
        // 🔴 MASTER SIGNAL GUARD - HARD ENFORCEMENT
        // ALL 39+ INSTITUTIONAL GUARDS MUST PASS BEFORE SIGNAL EMISSION
        // NO BYPASS. NO INFLUENCE-ONLY. HARD BLOCK ONLY.
        // ============================================================
        this.guardStats.signalsGenerated++;
        
        const guardResult = masterSignalGuardService.validateSignalSync(signal, analysisData.candles || []);
        
        if (!guardResult.allowed) {
            this.guardStats.signalsBlocked++;
            const blockReason = guardResult.blockReasons[0] || 'UNKNOWN_BLOCK';
            const reasonKey = blockReason.split(':')[0];
            this.guardStats.blockReasons.set(reasonKey, 
                (this.guardStats.blockReasons.get(reasonKey) || 0) + 1
            );
            
            console.log(`[ORCHESTRATOR] 🚫 SIGNAL_BLOCKED | ${instrument.symbol} | ${signalType} | Reason: ${blockReason}`);
            return null;
        }

        // Apply any adjustments from guard (upgrades/downgrades)
        if (guardResult.signal && guardResult.signal.type !== signal.signal) {
            console.log(`[ORCHESTRATOR] ⚡ SIGNAL_ADJUSTED | ${instrument.symbol} | ${signal.signal} → ${guardResult.signal.type}`);
            signal.signal = guardResult.signal.type;
            signal.guardAdjusted = true;
        }

        signal.guardValidation = {
            passed: true,
            checksRun: guardResult.checks?.length || 0,
            confidenceScore: guardResult.confidenceScore?.score || null,
            confidenceGrade: guardResult.confidenceScore?.grade || null,
            warnings: guardResult.warnings || []
        };

        return signal;
    }

    calculateRankScore(strength, volumeConfirm, higherTF, institutional, riskReward) {
        let rankScore = 0;

        rankScore += strength * 3;

        if (volumeConfirm.strength === 'EXPLOSION') rankScore += 20;
        else if (volumeConfirm.strength === 'HIGH') rankScore += 15;
        else if (volumeConfirm.strength === 'MODERATE') rankScore += 10;

        rankScore += higherTF.score * 5;
        if (higherTF.fullAlignment) rankScore += 10;

        rankScore += institutional.score * 3;
        if (institutional.detected) rankScore += 10;

        if (riskReward.primaryRR >= 3) rankScore += 15;
        else if (riskReward.primaryRR >= 2.5) rankScore += 10;
        else if (riskReward.primaryRR >= 2) rankScore += 5;

        return Math.min(100, rankScore);
    }

    recordSignal(token, signal) {
        const history = this.signalHistory.get(token) || [];
        history.push(signal);
        
        if (history.length > 100) {
            history.shift();
        }
        
        this.signalHistory.set(token, history);

        this.activeSignals = this.activeSignals.filter(s => s.instrument.token !== token);
        this.activeSignals.push(signal);

        if (this.activeSignals.length > 50) {
            this.activeSignals.sort((a, b) => b.rankScore - a.rankScore);
            this.activeSignals = this.activeSignals.slice(0, 50);
        }

        console.log(`[ORCHESTRATOR] ${signal.signal} | ${signal.instrument.symbol} @ ${signal.price} | Strength: ${signal.strength} | Rank: ${signal.rankScore}`);
    }

    getActiveSignals(filters = {}) {
        let signals = [...this.activeSignals];

        if (filters.type) {
            signals = signals.filter(s => s.signal === filters.type);
        }
        if (filters.direction) {
            signals = signals.filter(s => s.direction === filters.direction);
        }
        if (filters.minStrength) {
            signals = signals.filter(s => s.strength >= filters.minStrength);
        }
        if (filters.sector) {
            signals = signals.filter(s => s.instrument.sector === filters.sector);
        }
        if (filters.minRankScore) {
            signals = signals.filter(s => s.rankScore >= filters.minRankScore);
        }

        return signals.sort((a, b) => b.rankScore - a.rankScore);
    }

    getTopRankedSignals(count = 10) {
        return [...this.activeSignals]
            .sort((a, b) => b.rankScore - a.rankScore)
            .slice(0, count);
    }

    getSignalsByType(type) {
        return this.activeSignals.filter(s => s.signal === type);
    }

    getStrongSignals() {
        return this.activeSignals.filter(s => 
            s.signal === 'STRONG_BUY' || s.signal === 'STRONG_SELL'
        );
    }

    getSignalHistory(token, count = 50) {
        const history = this.signalHistory.get(token) || [];
        return history.slice(-count).reverse();
    }

    getAllSignalHistory(count = 100) {
        const all = [];
        this.signalHistory.forEach((signals) => {
            all.push(...signals);
        });
        return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, count);
    }

    getLastAnalysis(token) {
        return this.lastAnalysis.get(token) || null;
    }

    getRankScore(token) {
        return this.signalRankScores.get(token) || 0;
    }

    getStats() {
        const buyCount = this.activeSignals.filter(s => s.signal === 'BUY').length;
        const strongBuyCount = this.activeSignals.filter(s => s.signal === 'STRONG_BUY').length;
        const sellCount = this.activeSignals.filter(s => s.signal === 'SELL').length;
        const strongSellCount = this.activeSignals.filter(s => s.signal === 'STRONG_SELL').length;

        return {
            totalActive: this.activeSignals.length,
            byType: {
                BUY: buyCount,
                STRONG_BUY: strongBuyCount,
                SELL: sellCount,
                STRONG_SELL: strongSellCount
            },
            avgStrength: this.activeSignals.length > 0 
                ? this.activeSignals.reduce((a, b) => a + b.strength, 0) / this.activeSignals.length 
                : 0,
            avgRankScore: this.activeSignals.length > 0 
                ? this.activeSignals.reduce((a, b) => a + b.rankScore, 0) / this.activeSignals.length 
                : 0
        };
    }

    clearSignals() {
        this.signalHistory.clear();
        this.activeSignals = [];
        this.lastAnalysis.clear();
        this.signalRankScores.clear();
    }
}

module.exports = new OrchestratorService();
