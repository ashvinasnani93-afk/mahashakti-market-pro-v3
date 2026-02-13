class IndicatorService {
    calculateEMA(candles, period) {
        if (!candles || candles.length < period) return [];
        
        const multiplier = 2 / (period + 1);
        const ema = [];
        
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += candles[i].close;
        }
        ema.push({ value: sum / period, timestamp: candles[period - 1].timestamp });
        
        for (let i = period; i < candles.length; i++) {
            const value = (candles[i].close - ema[ema.length - 1].value) * multiplier + ema[ema.length - 1].value;
            ema.push({ value, timestamp: candles[i].timestamp });
        }
        
        return ema;
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
        
        let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
        let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
        
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
        
        const tr = [];
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;
            
            tr.push({
                value: Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)),
                timestamp: candles[i].timestamp
            });
        }
        
        const atr = [];
        let sum = tr.slice(0, period).reduce((a, b) => a + b.value, 0);
        atr.push({ value: sum / period, timestamp: tr[period - 1].timestamp });
        
        for (let i = period; i < tr.length; i++) {
            const value = (atr[atr.length - 1].value * (period - 1) + tr[i].value) / period;
            atr.push({ value, timestamp: tr[i].timestamp });
        }
        
        return atr;
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

    calculateBollingerBands(candles, period = 20, stdDev = 2) {
        if (!candles || candles.length < period) return [];
        
        const bands = [];
        
        for (let i = period - 1; i < candles.length; i++) {
            const slice = candles.slice(i - period + 1, i + 1);
            const closes = slice.map(c => c.close);
            
            const sma = closes.reduce((a, b) => a + b, 0) / period;
            const variance = closes.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period;
            const std = Math.sqrt(variance);
            
            bands.push({
                upper: sma + stdDev * std,
                middle: sma,
                lower: sma - stdDev * std,
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
            const fastValue = fastEMA[i + offset]?.value;
            const slowValue = slowEMA[i]?.value;
            
            if (fastValue !== undefined && slowValue !== undefined) {
                macdLine.push({
                    value: fastValue - slowValue,
                    timestamp: slowEMA[i].timestamp
                });
            }
        }
        
        const signalLine = [];
        if (macdLine.length >= signalPeriod) {
            const multiplier = 2 / (signalPeriod + 1);
            let sum = 0;
            
            for (let i = 0; i < signalPeriod; i++) {
                sum += macdLine[i].value;
            }
            signalLine.push({ value: sum / signalPeriod, timestamp: macdLine[signalPeriod - 1].timestamp });
            
            for (let i = signalPeriod; i < macdLine.length; i++) {
                const value = (macdLine[i].value - signalLine[signalLine.length - 1].value) * multiplier + signalLine[signalLine.length - 1].value;
                signalLine.push({ value, timestamp: macdLine[i].timestamp });
            }
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

    calculateAverageVolume(candles, period = 20) {
        if (!candles || candles.length < period) return 0;
        
        const volumes = candles.slice(-period).map(c => c.volume);
        return volumes.reduce((a, b) => a + b, 0) / period;
    }

    getIndicators(candles) {
        if (!candles || candles.length < 50) {
            return { error: 'Insufficient data', candles: candles?.length || 0 };
        }

        const ema20 = this.calculateEMA(candles, 20);
        const ema50 = this.calculateEMA(candles, 50);
        const rsi = this.calculateRSI(candles, 14);
        const atr = this.calculateATR(candles, 14);
        const vwap = this.calculateVWAP(candles);
        const macd = this.calculateMACD(candles);
        const bb = this.calculateBollingerBands(candles);
        const avgVolume = this.calculateAverageVolume(candles, 20);

        const lastCandle = candles[candles.length - 1];
        const lastEma20 = ema20[ema20.length - 1]?.value;
        const lastEma50 = ema50[ema50.length - 1]?.value;
        const lastRsi = rsi[rsi.length - 1]?.value;
        const lastAtr = atr[atr.length - 1]?.value;
        const lastVwap = vwap[vwap.length - 1]?.value;
        const lastMacd = macd[macd.length - 1];
        const lastBB = bb[bb.length - 1];

        return {
            price: lastCandle.close,
            volume: lastCandle.volume,
            avgVolume,
            volumeRatio: avgVolume > 0 ? lastCandle.volume / avgVolume : 0,
            ema20: lastEma20,
            ema50: lastEma50,
            emaTrend: lastEma20 > lastEma50 ? 'BULLISH' : 'BEARISH',
            rsi: lastRsi,
            atr: lastAtr,
            atrPercent: lastCandle.close > 0 ? (lastAtr / lastCandle.close) * 100 : 0,
            vwap: lastVwap,
            vwapDiff: lastCandle.close - lastVwap,
            macd: lastMacd?.macd,
            macdSignal: lastMacd?.signal,
            macdHistogram: lastMacd?.histogram,
            bbUpper: lastBB?.upper,
            bbMiddle: lastBB?.middle,
            bbLower: lastBB?.lower,
            timestamp: lastCandle.timestamp
        };
    }
}

module.exports = new IndicatorService();
