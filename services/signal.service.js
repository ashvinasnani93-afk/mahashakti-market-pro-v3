const indicatorService = require('./indicator.service');
const candleService = require('./candle.service');

class SignalService {
    constructor() {
        this.signalHistory = new Map();
        this.minRR = 1.5;
    }

    async analyzeInstrument(instrument, candles5m, candles15m, candlesDaily) {
        const indicators = indicatorService.getIndicators(candles5m);
        
        if (indicators.error) {
            return { signal: null, reason: indicators.error };
        }

        const breakout = this.checkBreakout(candles5m, indicators);
        const volumeConfirm = this.checkVolumeConfirmation(indicators);
        const higherTFAlign = this.checkHigherTimeframeAlignment(candles15m, candlesDaily);
        const institutionalHook = this.checkInstitutionalLayer(candles5m, indicators);
        const riskReward = this.calculateRiskReward(candles5m, indicators);
        const safetyCheck = this.runSafetyLayer(indicators, breakout, volumeConfirm);

        if (!safetyCheck.pass) {
            return { 
                signal: null, 
                reason: safetyCheck.reason,
                indicators 
            };
        }

        const signal = this.generateSignal(
            instrument,
            indicators,
            breakout,
            volumeConfirm,
            higherTFAlign,
            institutionalHook,
            riskReward
        );

        if (signal) {
            this.recordSignal(instrument.token, signal);
        }

        return signal;
    }

    checkBreakout(candles, indicators) {
        if (candles.length < 20) return { valid: false, type: null };

        const closes = candles.slice(-20).map(c => c.close);
        const highs = candles.slice(-20).map(c => c.high);
        const lows = candles.slice(-20).map(c => c.low);
        
        const resistance = Math.max(...highs.slice(0, -1));
        const support = Math.min(...lows.slice(0, -1));
        
        const lastClose = closes[closes.length - 1];
        const prevClose = closes[closes.length - 2];
        
        const breakoutUp = lastClose > resistance && prevClose <= resistance;
        const breakoutDown = lastClose < support && prevClose >= support;
        
        const emaBreakoutUp = lastClose > indicators.ema20 && prevClose <= indicators.ema20 && indicators.ema20 > indicators.ema50;
        const emaBreakoutDown = lastClose < indicators.ema20 && prevClose >= indicators.ema20 && indicators.ema20 < indicators.ema50;

        return {
            valid: breakoutUp || breakoutDown || emaBreakoutUp || emaBreakoutDown,
            type: (breakoutUp || emaBreakoutUp) ? 'BULLISH' : (breakoutDown || emaBreakoutDown) ? 'BEARISH' : null,
            resistance,
            support,
            priceAboveResistance: breakoutUp,
            priceBelowSupport: breakoutDown,
            emaBreakout: emaBreakoutUp || emaBreakoutDown
        };
    }

    checkVolumeConfirmation(indicators) {
        const volumeRatio = indicators.volumeRatio;
        
        return {
            confirmed: volumeRatio >= 1.5,
            ratio: volumeRatio,
            strength: volumeRatio >= 3 ? 'VERY_HIGH' : volumeRatio >= 2 ? 'HIGH' : volumeRatio >= 1.5 ? 'MODERATE' : 'LOW'
        };
    }

    checkHigherTimeframeAlignment(candles15m, candlesDaily) {
        const tf15mIndicators = indicatorService.getIndicators(candles15m);
        const dailyIndicators = indicatorService.getIndicators(candlesDaily);

        const tf15mBullish = tf15mIndicators.emaTrend === 'BULLISH';
        const dailyBullish = dailyIndicators.emaTrend === 'BULLISH';
        
        const tf15mRsiOk = tf15mIndicators.rsi > 40 && tf15mIndicators.rsi < 70;
        const dailyRsiOk = dailyIndicators.rsi > 40 && dailyIndicators.rsi < 70;

        return {
            tf15m: {
                trend: tf15mIndicators.emaTrend,
                rsi: tf15mIndicators.rsi,
                aligned: tf15mBullish && tf15mRsiOk
            },
            daily: {
                trend: dailyIndicators.emaTrend,
                rsi: dailyIndicators.rsi,
                aligned: dailyBullish && dailyRsiOk
            },
            fullAlignment: (tf15mBullish === dailyBullish),
            score: (tf15mBullish ? 1 : 0) + (dailyBullish ? 1 : 0) + (tf15mRsiOk ? 0.5 : 0) + (dailyRsiOk ? 0.5 : 0)
        };
    }

    checkInstitutionalLayer(candles, indicators) {
        const lastCandles = candles.slice(-5);
        
        const largeBars = lastCandles.filter(c => {
            const range = c.high - c.low;
            const avgRange = indicators.atr;
            return range > avgRange * 1.5 && c.volume > indicators.avgVolume * 2;
        });

        const priceAboveVwap = indicators.price > indicators.vwap;
        const strongMomentum = indicators.macdHistogram > 0 && indicators.rsi > 50;

        return {
            detected: largeBars.length > 0,
            largeBars: largeBars.length,
            priceAboveVwap,
            strongMomentum,
            score: (largeBars.length > 0 ? 2 : 0) + (priceAboveVwap ? 1 : 0) + (strongMomentum ? 1 : 0)
        };
    }

    calculateRiskReward(candles, indicators) {
        const lastCandle = candles[candles.length - 1];
        const atr = indicators.atr;
        
        const stopLoss = lastCandle.close - (atr * 1.5);
        const target1 = lastCandle.close + (atr * 2);
        const target2 = lastCandle.close + (atr * 3);
        const target3 = lastCandle.close + (atr * 4);
        
        const risk = lastCandle.close - stopLoss;
        const reward = target2 - lastCandle.close;
        const rr = risk > 0 ? reward / risk : 0;

        return {
            entry: lastCandle.close,
            stopLoss,
            target1,
            target2,
            target3,
            risk,
            reward,
            riskRewardRatio: rr,
            valid: rr >= this.minRR
        };
    }

    runSafetyLayer(indicators, breakout, volumeConfirm) {
        const checks = [];
        
        if (indicators.rsi > 80) {
            checks.push('RSI_OVERBOUGHT');
        }
        if (indicators.rsi < 20) {
            checks.push('RSI_OVERSOLD');
        }
        if (!breakout.valid) {
            checks.push('NO_BREAKOUT');
        }
        if (!volumeConfirm.confirmed) {
            checks.push('LOW_VOLUME');
        }
        if (indicators.atrPercent > 5) {
            checks.push('HIGH_VOLATILITY');
        }
        if (indicators.emaTrend !== breakout.type && breakout.type) {
            checks.push('EMA_TREND_MISMATCH');
        }

        return {
            pass: checks.length === 0,
            reason: checks.length > 0 ? checks.join(', ') : null,
            checks
        };
    }

    generateSignal(instrument, indicators, breakout, volumeConfirm, higherTF, institutional, rr) {
        if (!breakout.valid || !volumeConfirm.confirmed || !rr.valid) {
            return null;
        }

        let signalType = null;
        let strength = 0;
        
        strength += breakout.valid ? 2 : 0;
        strength += volumeConfirm.confirmed ? 1 : 0;
        strength += volumeConfirm.strength === 'VERY_HIGH' ? 1 : 0;
        strength += higherTF.fullAlignment ? 2 : 0;
        strength += higherTF.score;
        strength += institutional.detected ? 2 : 0;
        strength += institutional.score;
        strength += rr.riskRewardRatio >= 2 ? 1 : 0;

        if (breakout.type === 'BULLISH') {
            signalType = strength >= 8 ? 'STRONG_BUY' : 'BUY';
        } else if (breakout.type === 'BEARISH') {
            signalType = strength >= 8 ? 'STRONG_SELL' : 'SELL';
        }

        if (!signalType) return null;

        return {
            instrument: {
                symbol: instrument.symbol,
                token: instrument.token,
                name: instrument.name,
                exchange: instrument.exchange
            },
            signal: signalType,
            strength,
            price: indicators.price,
            timestamp: Date.now(),
            analysis: {
                breakout,
                volume: volumeConfirm,
                higherTimeframe: higherTF,
                institutional,
                riskReward: rr,
                indicators: {
                    ema20: indicators.ema20,
                    ema50: indicators.ema50,
                    rsi: indicators.rsi,
                    atr: indicators.atr,
                    vwap: indicators.vwap,
                    macdHistogram: indicators.macdHistogram
                }
            }
        };
    }

    recordSignal(token, signal) {
        const history = this.signalHistory.get(token) || [];
        history.push({
            ...signal,
            recordedAt: Date.now()
        });
        
        if (history.length > 100) {
            history.shift();
        }
        
        this.signalHistory.set(token, history);
    }

    getSignalHistory(token) {
        return this.signalHistory.get(token) || [];
    }

    getAllSignals() {
        const all = [];
        this.signalHistory.forEach((signals, token) => {
            all.push(...signals);
        });
        return all.sort((a, b) => b.timestamp - a.timestamp);
    }
}

module.exports = new SignalService();
