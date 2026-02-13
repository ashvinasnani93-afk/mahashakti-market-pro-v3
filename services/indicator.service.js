const settings = require('../config/settings.config');

class IndicatorService {
    calculateSMA(candles, period) {
        if (!candles || candles.length < period) return [];
        
        const sma = [];
        for (let i = period - 1; i < candles.length; i++) {
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += candles[i - j].close;
            }
            sma.push({
                value: sum / period,
                timestamp: candles[i].timestamp
            });
        }
        return sma;
    }

    calculateEMA(candles, period) {
        if (!candles || candles.length < period) return [];
        
        const multiplier = 2 / (period + 1);
        const ema = [];
        
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += candles[i].close;
        }
        const firstEMA = sum / period;
        ema.push({ value: firstEMA, timestamp: candles[period - 1].timestamp });
        
        for (let i = period; i < candles.length; i++) {
            const value = (candles[i].close - ema[ema.length - 1].value) * multiplier + ema[ema.length - 1].value;
            ema.push({ value, timestamp: candles[i].timestamp });
        }
        
        return ema;
    }

    calculateMultiEMA(candles) {
        const emaConfig = settings.indicators.ema;
        
        return {
            ema9: this.calculateEMA(candles, emaConfig.fast),
            ema20: this.calculateEMA(candles, emaConfig.medium),
            ema50: this.calculateEMA(candles, emaConfig.slow),
            ema200: this.calculateEMA(candles, emaConfig.verySlow)
        };
    }

    calculateRSI(candles, period = 14) {
        if (!candles || candles.length < period + 1) return [];
        
        const rsi = [];
        const gains = [];
        const losses = [];
        
        for (let i = 1; i < candles.length; i++) {
            const change = candles[i].close - candles[i - 1].close;
            gains.push(change > 0 ? change : 0);
            losses.push(change < 0 ? Math.abs(change) : 0);
        }
        
        let avgGain = 0;
        let avgLoss = 0;
        for (let i = 0; i < period; i++) {
            avgGain += gains[i];
            avgLoss += losses[i];
        }
        avgGain /= period;
        avgLoss /= period;
        
        if (avgLoss === 0) {
            rsi.push({ value: 100, timestamp: candles[period].timestamp });
        } else {
            const rs = avgGain / avgLoss;
            rsi.push({ value: 100 - (100 / (1 + rs)), timestamp: candles[period].timestamp });
        }
        
        for (let i = period; i < gains.length; i++) {
            avgGain = (avgGain * (period - 1) + gains[i]) / period;
            avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
            
            if (avgLoss === 0) {
                rsi.push({ value: 100, timestamp: candles[i + 1].timestamp });
            } else {
                const rs = avgGain / avgLoss;
                rsi.push({ value: 100 - (100 / (1 + rs)), timestamp: candles[i + 1].timestamp });
            }
        }
        
        return rsi;
    }

    calculateATR(candles, period = 14) {
        if (!candles || candles.length < period + 1) return [];
        
        const trueRanges = [];
        
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;
            
            const tr1 = high - low;
            const tr2 = Math.abs(high - prevClose);
            const tr3 = Math.abs(low - prevClose);
            
            trueRanges.push({
                value: Math.max(tr1, tr2, tr3),
                timestamp: candles[i].timestamp
            });
        }
        
        const atr = [];
        
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += trueRanges[i].value;
        }
        const firstATR = sum / period;
        atr.push({ value: firstATR, timestamp: trueRanges[period - 1].timestamp });
        
        for (let i = period; i < trueRanges.length; i++) {
            const value = (atr[atr.length - 1].value * (period - 1) + trueRanges[i].value) / period;
            atr.push({ value, timestamp: trueRanges[i].timestamp });
        }
        
        return atr;
    }

    calculateVolumeAverage(candles, period = 20) {
        if (!candles || candles.length < period) return { average: 0, history: [] };
        
        const history = [];
        
        for (let i = period - 1; i < candles.length; i++) {
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += candles[i - j].volume;
            }
            history.push({
                value: sum / period,
                timestamp: candles[i].timestamp
            });
        }
        
        return {
            average: history.length > 0 ? history[history.length - 1].value : 0,
            history
        };
    }

    calculateVWAP(candles) {
        if (!candles || candles.length === 0) return [];
        
        let cumVolume = 0;
        let cumVolumePrice = 0;
        
        return candles.map(c => {
            const typicalPrice = (c.high + c.low + c.close) / 3;
            cumVolume += c.volume;
            cumVolumePrice += typicalPrice * c.volume;
            
            return {
                value: cumVolume > 0 ? cumVolumePrice / cumVolume : typicalPrice,
                timestamp: c.timestamp
            };
        });
    }

    calculateBollingerBands(candles, period = 20, stdDevMultiplier = 2) {
        if (!candles || candles.length < period) return [];
        
        const bands = [];
        
        for (let i = period - 1; i < candles.length; i++) {
            const slice = candles.slice(i - period + 1, i + 1);
            const closes = slice.map(c => c.close);
            
            const sma = closes.reduce((a, b) => a + b, 0) / period;
            
            const squaredDiffs = closes.map(c => Math.pow(c - sma, 2));
            const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
            const stdDev = Math.sqrt(variance);
            
            bands.push({
                upper: sma + stdDevMultiplier * stdDev,
                middle: sma,
                lower: sma - stdDevMultiplier * stdDev,
                bandwidth: ((sma + stdDevMultiplier * stdDev) - (sma - stdDevMultiplier * stdDev)) / sma * 100,
                timestamp: candles[i].timestamp
            });
        }
        
        return bands;
    }

    calculateMACD(candles, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        if (!candles || candles.length < slowPeriod + signalPeriod) return [];
        
        const fastEMA = this.calculateEMA(candles, fastPeriod);
        const slowEMA = this.calculateEMA(candles, slowPeriod);
        
        const macdLine = [];
        const offset = slowPeriod - fastPeriod;
        
        for (let i = 0; i < slowEMA.length; i++) {
            const fastIdx = i + offset;
            if (fastIdx < fastEMA.length) {
                macdLine.push({
                    value: fastEMA[fastIdx].value - slowEMA[i].value,
                    timestamp: slowEMA[i].timestamp
                });
            }
        }
        
        if (macdLine.length < signalPeriod) return [];
        
        const signalMultiplier = 2 / (signalPeriod + 1);
        const signalLine = [];
        
        let sum = 0;
        for (let i = 0; i < signalPeriod; i++) {
            sum += macdLine[i].value;
        }
        signalLine.push({ value: sum / signalPeriod, timestamp: macdLine[signalPeriod - 1].timestamp });
        
        for (let i = signalPeriod; i < macdLine.length; i++) {
            const value = (macdLine[i].value - signalLine[signalLine.length - 1].value) * signalMultiplier + signalLine[signalLine.length - 1].value;
            signalLine.push({ value, timestamp: macdLine[i].timestamp });
        }
        
        const result = [];
        for (let i = 0; i < signalLine.length; i++) {
            const macdIdx = macdLine.length - signalLine.length + i;
            result.push({
                macd: macdLine[macdIdx].value,
                signal: signalLine[i].value,
                histogram: macdLine[macdIdx].value - signalLine[i].value,
                timestamp: signalLine[i].timestamp
            });
        }
        
        return result;
    }

    calculateStochastic(candles, kPeriod = 14, dPeriod = 3) {
        if (!candles || candles.length < kPeriod + dPeriod) return [];
        
        const kValues = [];
        
        for (let i = kPeriod - 1; i < candles.length; i++) {
            const slice = candles.slice(i - kPeriod + 1, i + 1);
            const highs = slice.map(c => c.high);
            const lows = slice.map(c => c.low);
            
            const highestHigh = Math.max(...highs);
            const lowestLow = Math.min(...lows);
            const currentClose = candles[i].close;
            
            const k = highestHigh !== lowestLow 
                ? ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100 
                : 50;
            
            kValues.push({ value: k, timestamp: candles[i].timestamp });
        }
        
        const result = [];
        for (let i = dPeriod - 1; i < kValues.length; i++) {
            let sum = 0;
            for (let j = 0; j < dPeriod; j++) {
                sum += kValues[i - j].value;
            }
            result.push({
                k: kValues[i].value,
                d: sum / dPeriod,
                timestamp: kValues[i].timestamp
            });
        }
        
        return result;
    }

    calculateADX(candles, period = 14) {
        if (!candles || candles.length < period * 2) return [];
        
        const plusDM = [];
        const minusDM = [];
        const tr = [];
        
        for (let i = 1; i < candles.length; i++) {
            const highDiff = candles[i].high - candles[i - 1].high;
            const lowDiff = candles[i - 1].low - candles[i].low;
            
            plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
            minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);
            
            const trValue = Math.max(
                candles[i].high - candles[i].low,
                Math.abs(candles[i].high - candles[i - 1].close),
                Math.abs(candles[i].low - candles[i - 1].close)
            );
            tr.push(trValue);
        }
        
        const smoothTR = [];
        const smoothPlusDM = [];
        const smoothMinusDM = [];
        
        let sumTR = 0, sumPlusDM = 0, sumMinusDM = 0;
        for (let i = 0; i < period; i++) {
            sumTR += tr[i];
            sumPlusDM += plusDM[i];
            sumMinusDM += minusDM[i];
        }
        
        smoothTR.push(sumTR);
        smoothPlusDM.push(sumPlusDM);
        smoothMinusDM.push(sumMinusDM);
        
        for (let i = period; i < tr.length; i++) {
            smoothTR.push(smoothTR[smoothTR.length - 1] - smoothTR[smoothTR.length - 1] / period + tr[i]);
            smoothPlusDM.push(smoothPlusDM[smoothPlusDM.length - 1] - smoothPlusDM[smoothPlusDM.length - 1] / period + plusDM[i]);
            smoothMinusDM.push(smoothMinusDM[smoothMinusDM.length - 1] - smoothMinusDM[smoothMinusDM.length - 1] / period + minusDM[i]);
        }
        
        const plusDI = [];
        const minusDI = [];
        const dx = [];
        
        for (let i = 0; i < smoothTR.length; i++) {
            const pdi = smoothTR[i] !== 0 ? (smoothPlusDM[i] / smoothTR[i]) * 100 : 0;
            const mdi = smoothTR[i] !== 0 ? (smoothMinusDM[i] / smoothTR[i]) * 100 : 0;
            plusDI.push(pdi);
            minusDI.push(mdi);
            
            const diSum = pdi + mdi;
            const diDiff = Math.abs(pdi - mdi);
            dx.push(diSum !== 0 ? (diDiff / diSum) * 100 : 0);
        }
        
        const adx = [];
        if (dx.length >= period) {
            let sum = 0;
            for (let i = 0; i < period; i++) {
                sum += dx[i];
            }
            adx.push(sum / period);
            
            for (let i = period; i < dx.length; i++) {
                adx.push((adx[adx.length - 1] * (period - 1) + dx[i]) / period);
            }
        }
        
        const result = [];
        for (let i = 0; i < adx.length; i++) {
            const offset = dx.length - adx.length + i;
            const candleOffset = offset + period;
            
            if (candleOffset < candles.length) {
                result.push({
                    adx: adx[i],
                    plusDI: plusDI[offset],
                    minusDI: minusDI[offset],
                    timestamp: candles[candleOffset].timestamp
                });
            }
        }
        
        return result;
    }

    getFullIndicators(candles) {
        if (!candles || candles.length < 50) {
            return { error: 'Insufficient data', candleCount: candles?.length || 0 };
        }

        const config = settings.indicators;
        
        const emas = this.calculateMultiEMA(candles);
        const rsi = this.calculateRSI(candles, config.rsi.period);
        const atr = this.calculateATR(candles, config.atr.period);
        const volumeData = this.calculateVolumeAverage(candles, config.volume.avgPeriod);
        const vwap = this.calculateVWAP(candles);
        const macd = this.calculateMACD(candles, config.macd.fastPeriod, config.macd.slowPeriod, config.macd.signalPeriod);
        const bb = this.calculateBollingerBands(candles, config.bollinger.period, config.bollinger.stdDev);
        const stoch = this.calculateStochastic(candles);
        const adx = this.calculateADX(candles);

        const lastCandle = candles[candles.length - 1];
        const lastEma9 = emas.ema9[emas.ema9.length - 1]?.value;
        const lastEma20 = emas.ema20[emas.ema20.length - 1]?.value;
        const lastEma50 = emas.ema50[emas.ema50.length - 1]?.value;
        const lastEma200 = emas.ema200[emas.ema200.length - 1]?.value;
        const lastRsi = rsi[rsi.length - 1]?.value;
        const lastAtr = atr[atr.length - 1]?.value;
        const lastVwap = vwap[vwap.length - 1]?.value;
        const lastMacd = macd[macd.length - 1];
        const lastBB = bb[bb.length - 1];
        const lastStoch = stoch[stoch.length - 1];
        const lastAdx = adx[adx.length - 1];

        let emaTrend = 'NEUTRAL';
        if (lastEma9 > lastEma20 && lastEma20 > lastEma50) {
            emaTrend = 'STRONG_BULLISH';
        } else if (lastEma9 > lastEma20) {
            emaTrend = 'BULLISH';
        } else if (lastEma9 < lastEma20 && lastEma20 < lastEma50) {
            emaTrend = 'STRONG_BEARISH';
        } else if (lastEma9 < lastEma20) {
            emaTrend = 'BEARISH';
        }

        return {
            price: lastCandle.close,
            open: lastCandle.open,
            high: lastCandle.high,
            low: lastCandle.low,
            volume: lastCandle.volume,
            
            ema9: lastEma9,
            ema20: lastEma20,
            ema50: lastEma50,
            ema200: lastEma200,
            emaTrend,
            
            rsi: lastRsi,
            rsiZone: lastRsi > config.rsi.overbought ? 'OVERBOUGHT' : lastRsi < config.rsi.oversold ? 'OVERSOLD' : 'NEUTRAL',
            
            atr: lastAtr,
            atrPercent: lastCandle.close > 0 ? (lastAtr / lastCandle.close) * 100 : 0,
            
            avgVolume: volumeData.average,
            volumeRatio: volumeData.average > 0 ? lastCandle.volume / volumeData.average : 0,
            
            vwap: lastVwap,
            vwapDiff: lastCandle.close - lastVwap,
            vwapDiffPercent: lastVwap > 0 ? ((lastCandle.close - lastVwap) / lastVwap) * 100 : 0,
            
            macd: lastMacd?.macd,
            macdSignal: lastMacd?.signal,
            macdHistogram: lastMacd?.histogram,
            macdTrend: lastMacd?.histogram > 0 ? 'BULLISH' : 'BEARISH',
            
            bbUpper: lastBB?.upper,
            bbMiddle: lastBB?.middle,
            bbLower: lastBB?.lower,
            bbBandwidth: lastBB?.bandwidth,
            bbPosition: lastBB ? (lastCandle.close - lastBB.lower) / (lastBB.upper - lastBB.lower) : 0.5,
            
            stochK: lastStoch?.k,
            stochD: lastStoch?.d,
            
            adx: lastAdx?.adx,
            plusDI: lastAdx?.plusDI,
            minusDI: lastAdx?.minusDI,
            adxTrend: lastAdx?.adx > 25 ? (lastAdx?.plusDI > lastAdx?.minusDI ? 'STRONG_UP' : 'STRONG_DOWN') : 'WEAK',
            
            timestamp: lastCandle.timestamp
        };
    }
}

module.exports = new IndicatorService();
