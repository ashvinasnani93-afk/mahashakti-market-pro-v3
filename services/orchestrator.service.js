const instruments = require('../config/instruments.config');
const settings = require('../config/settings.config');
const candleService = require('./candle.service');
const indicatorService = require('./indicator.service');
const institutionalService = require('./institutional.service');
const regimeService = require('./regime.service');
const riskRewardService = require('./riskReward.service');
const safetyService = require('./safety.service');
const signalCooldownService = require('./signalCooldown.service');

class OrchestratorService {
    constructor() {
        this.signalHistory = new Map();
        this.activeSignals = [];
        this.lastAnalysis = new Map();
        this.signalRankScores = new Map();
        this.cooldownEnabled = true;
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
            return { valid: false, type: null, failedConditions: ['INSUFFICIENT_DATA'] };
        }

        const recent = candles.slice(-20);
        const last5 = candles.slice(-5);
        const closes = recent.map(c => c.close);
        const highs = recent.map(c => c.high);
        const lows = recent.map(c => c.low);

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

        // STRICT BULLISH VALIDATION (Relaxed RSI range)
        const bullishConditions = {
            emaAlignment: ema20 > ema50,
            priceBreakout: lastClose > highest5,
            volumeConfirm: volumeRatio >= 1.5,
            rsiInRange: rsi >= 52 && rsi <= 75,
            atrSafe: atrPercent < 4.0
        };

        const bullishFailures = [];
        if (!bullishConditions.emaAlignment) bullishFailures.push('EMA20 <= EMA50');
        if (!bullishConditions.priceBreakout) bullishFailures.push('Close <= Highest5');
        if (!bullishConditions.volumeConfirm) bullishFailures.push('VolumeRatio < 1.5');
        if (!bullishConditions.rsiInRange) bullishFailures.push('RSI not in 52-75');
        if (!bullishConditions.atrSafe) bullishFailures.push('ATR% >= 4.0');

        const bullishPassCount = Object.values(bullishConditions).filter(v => v === true).length;
        const bullishValid = bullishPassCount >= 4; // Need 4 out of 5 conditions

        // STRICT BEARISH VALIDATION (Relaxed RSI range)
        const bearishConditions = {
            emaAlignment: ema20 < ema50,
            priceBreakout: lastClose < lowest5,
            volumeConfirm: volumeRatio >= 1.5,
            rsiInRange: rsi >= 25 && rsi <= 48,
            atrSafe: atrPercent < 4.0
        };

        const bearishFailures = [];
        if (!bearishConditions.emaAlignment) bearishFailures.push('EMA20 >= EMA50');
        if (!bearishConditions.priceBreakout) bearishFailures.push('Close >= Lowest5');
        if (!bearishConditions.volumeConfirm) bearishFailures.push('VolumeRatio < 1.5');
        if (!bearishConditions.rsiInRange) bearishFailures.push('RSI not in 25-48');
        if (!bearishConditions.atrSafe) bearishFailures.push('ATR% >= 4.0');

        const bearishPassCount = Object.values(bearishConditions).filter(v => v === true).length;
        const bearishValid = bearishPassCount >= 4; // Need 4 out of 5 conditions

        const valid = bullishValid || bearishValid;
        const type = bullishValid ? 'BULLISH' : bearishValid ? 'BEARISH' : null;
        const failedConditions = bullishValid ? [] : bearishValid ? [] : 
            bullishFailures.length <= bearishFailures.length ? bullishFailures : bearishFailures;

        return {
            valid,
            type,
            failedConditions,
            conditions: type === 'BULLISH' ? bullishConditions : type === 'BEARISH' ? bearishConditions : null,
            passCount: type === 'BULLISH' ? bullishPassCount : type === 'BEARISH' ? bearishPassCount : 0,
            highest5,
            lowest5,
            priceAboveHighest5: lastClose > highest5,
            priceBelowLowest5: lastClose < lowest5,
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

        // STRICT STRONG SIGNAL CALIBRATION
        const volumeRatio = indicators.volumeRatio || 0;
        const rsi = indicators.rsi || 50;
        const adx = indicators.adx || 0;
        const primaryRR = riskReward.primaryRR || 0;
        const emaTrend = indicators.emaTrend || '';

        let signalType = null;
        
        if (breakout.type === 'BULLISH') {
            // STRONG_BUY requires ALL conditions
            const strongBuyConditions = {
                volumeCheck: volumeRatio >= 2.5,
                rsiInRange: rsi >= 60 && rsi <= 68,
                adxStrong: adx >= 25,
                rrGood: primaryRR >= 2.0,
                trendStrong: emaTrend === 'STRONG_BULLISH'
            };
            
            const allStrongMet = Object.values(strongBuyConditions).every(v => v === true);
            signalType = allStrongMet ? 'STRONG_BUY' : 'BUY';
            
        } else if (breakout.type === 'BEARISH') {
            // STRONG_SELL requires ALL conditions (mirror)
            const strongSellConditions = {
                volumeCheck: volumeRatio >= 2.5,
                rsiInRange: rsi >= 32 && rsi <= 40,
                adxStrong: adx >= 25,
                rrGood: primaryRR >= 2.0,
                trendStrong: emaTrend === 'STRONG_BEARISH'
            };
            
            const allStrongMet = Object.values(strongSellConditions).every(v => v === true);
            signalType = allStrongMet ? 'STRONG_SELL' : 'SELL';
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
            analysis: {
                breakout: {
                    type: breakout.type,
                    resistance: breakout.resistance,
                    support: breakout.support
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
