const settings = require('../config/settings.config');
const safetyService = require('./safety.service');

class RegimeService {
    constructor() {
        this.currentRegime = null;
        this.regimeHistory = [];
        this.volatilityHistory = [];
        this.trendHistory = [];
        
        // 🔴 ADVANCED DAY TYPE DETECTION
        this.dayType = null;
        this.dayTypeHistory = [];
        this.gapInfo = null;
        
        // Day type configurations
        this.dayTypeConfig = {
            trendDayThreshold: 1.5,       // 1.5% sustained move
            rangeDayThreshold: 0.8,       // <0.8% range
            gapThreshold: 0.5,            // 0.5% gap
            crashThreshold: -2,           // 2% index drop
            vixHighThreshold: 25,
            expiryDays: [4]               // Thursday = 4
        };
    }

    analyzeRegime(candles, indicators) {
        if (!candles || candles.length < 50 || !indicators) {
            return this.currentRegime || { regime: 'UNKNOWN', confidence: 0 };
        }

        const volatility = this.analyzeVolatility(candles, indicators);
        const trend = this.analyzeTrend(candles, indicators);
        const momentum = this.analyzeMomentum(indicators);
        const structure = this.analyzeMarketStructure(candles);

        const regime = this.determineRegime(volatility, trend, momentum, structure);
        
        this.currentRegime = regime;
        this.regimeHistory.push({ ...regime, timestamp: Date.now() });
        
        if (this.regimeHistory.length > 500) {
            this.regimeHistory.shift();
        }

        return regime;
    }

    analyzeVolatility(candles, indicators) {
        const atrPercent = indicators.atrPercent || 0;
        const config = settings.regime;

        let level = 'NORMAL';
        let score = 0.5;

        if (atrPercent > config.volatilityHighThreshold) {
            level = 'HIGH';
            score = Math.min(1, atrPercent / (config.volatilityHighThreshold * 2));
        } else if (atrPercent < config.volatilityLowThreshold) {
            level = 'LOW';
            score = Math.max(0, atrPercent / config.volatilityLowThreshold);
        } else {
            score = (atrPercent - config.volatilityLowThreshold) / 
                    (config.volatilityHighThreshold - config.volatilityLowThreshold);
        }

        const bbBandwidth = indicators.bbBandwidth || 0;
        let bbVolatility = 'NORMAL';
        if (bbBandwidth > 10) {
            bbVolatility = 'EXPANDING';
        } else if (bbBandwidth < 3) {
            bbVolatility = 'CONTRACTING';
        }

        this.volatilityHistory.push({
            level,
            score,
            atrPercent,
            bbBandwidth,
            bbVolatility,
            timestamp: Date.now()
        });

        if (this.volatilityHistory.length > 100) {
            this.volatilityHistory.shift();
        }

        return {
            level,
            score,
            atrPercent,
            bbBandwidth,
            bbVolatility,
            expanding: this.isVolatilityExpanding(),
            contracting: this.isVolatilityContracting()
        };
    }

    isVolatilityExpanding() {
        if (this.volatilityHistory.length < 5) return false;
        
        const recent = this.volatilityHistory.slice(-5);
        let expanding = 0;
        
        for (let i = 1; i < recent.length; i++) {
            if (recent[i].atrPercent > recent[i - 1].atrPercent) {
                expanding++;
            }
        }
        
        return expanding >= 3;
    }

    isVolatilityContracting() {
        if (this.volatilityHistory.length < 5) return false;
        
        const recent = this.volatilityHistory.slice(-5);
        let contracting = 0;
        
        for (let i = 1; i < recent.length; i++) {
            if (recent[i].atrPercent < recent[i - 1].atrPercent) {
                contracting++;
            }
        }
        
        return contracting >= 3;
    }

    analyzeTrend(candles, indicators) {
        const ema9 = indicators.ema9;
        const ema20 = indicators.ema20;
        const ema50 = indicators.ema50;
        const ema200 = indicators.ema200;
        const price = indicators.price;
        const adx = indicators.adx;
        const plusDI = indicators.plusDI;
        const minusDI = indicators.minusDI;

        let direction = 'SIDEWAYS';
        let strength = 0;
        let quality = 'POOR';

        const emaAlignment = this.checkEMAAlignment(ema9, ema20, ema50, ema200);
        
        if (emaAlignment.bullish) {
            direction = 'UP';
            strength = emaAlignment.score;
        } else if (emaAlignment.bearish) {
            direction = 'DOWN';
            strength = emaAlignment.score;
        }

        if (adx) {
            if (adx > 40) {
                quality = 'STRONG';
                strength = Math.min(1, strength * 1.3);
            } else if (adx > 25) {
                quality = 'MODERATE';
            } else {
                quality = 'WEAK';
                strength = strength * 0.7;
            }

            if (plusDI > minusDI && direction !== 'UP') {
                direction = adx > 25 ? 'UP' : 'SIDEWAYS';
            } else if (minusDI > plusDI && direction !== 'DOWN') {
                direction = adx > 25 ? 'DOWN' : 'SIDEWAYS';
            }
        }

        const pricePosition = this.analyzePricePosition(price, ema20, ema50, ema200);

        this.trendHistory.push({
            direction,
            strength,
            quality,
            adx,
            timestamp: Date.now()
        });

        if (this.trendHistory.length > 100) {
            this.trendHistory.shift();
        }

        return {
            direction,
            strength,
            quality,
            emaAlignment,
            pricePosition,
            adx,
            plusDI,
            minusDI,
            persistent: this.isTrendPersistent(direction)
        };
    }

    checkEMAAlignment(ema9, ema20, ema50, ema200) {
        let bullishCount = 0;
        let bearishCount = 0;

        if (ema9 > ema20) bullishCount++; else bearishCount++;
        if (ema20 > ema50) bullishCount++; else bearishCount++;
        if (ema50 > ema200) bullishCount++; else bearishCount++;

        const bullish = bullishCount >= 2;
        const bearish = bearishCount >= 2;
        const perfect = bullishCount === 3 || bearishCount === 3;

        return {
            bullish,
            bearish,
            perfect,
            score: Math.max(bullishCount, bearishCount) / 3
        };
    }

    analyzePricePosition(price, ema20, ema50, ema200) {
        return {
            aboveEma20: price > ema20,
            aboveEma50: price > ema50,
            aboveEma200: price > ema200,
            distanceFromEma20: ema20 ? ((price - ema20) / ema20) * 100 : 0,
            distanceFromEma50: ema50 ? ((price - ema50) / ema50) * 100 : 0,
            distanceFromEma200: ema200 ? ((price - ema200) / ema200) * 100 : 0
        };
    }

    isTrendPersistent(currentDirection) {
        if (this.trendHistory.length < 5) return false;
        
        const recent = this.trendHistory.slice(-5);
        const sameDirection = recent.filter(t => t.direction === currentDirection).length;
        
        return sameDirection >= 4;
    }

    analyzeMomentum(indicators) {
        const rsi = indicators.rsi;
        const macdHistogram = indicators.macdHistogram;
        const stochK = indicators.stochK;
        const stochD = indicators.stochD;

        let direction = 'NEUTRAL';
        let strength = 0;
        let divergence = false;

        if (rsi > 50 && macdHistogram > 0) {
            direction = 'BULLISH';
            strength = (rsi - 50) / 50 + (macdHistogram > 0 ? 0.3 : 0);
        } else if (rsi < 50 && macdHistogram < 0) {
            direction = 'BEARISH';
            strength = (50 - rsi) / 50 + (macdHistogram < 0 ? 0.3 : 0);
        }

        if ((rsi > 70 && macdHistogram < 0) || (rsi < 30 && macdHistogram > 0)) {
            divergence = true;
        }

        let stochSignal = 'NEUTRAL';
        if (stochK && stochD) {
            if (stochK > 80 && stochK < stochD) {
                stochSignal = 'OVERBOUGHT_CROSS';
            } else if (stochK < 20 && stochK > stochD) {
                stochSignal = 'OVERSOLD_CROSS';
            }
        }

        return {
            direction,
            strength: Math.min(1, strength),
            rsi,
            macdHistogram,
            stochK,
            stochD,
            stochSignal,
            divergence,
            exhaustion: rsi > 80 || rsi < 20
        };
    }

    analyzeMarketStructure(candles) {
        if (candles.length < 20) {
            return { structure: 'UNKNOWN', swings: [] };
        }

        const swings = this.findSwingPoints(candles);
        const structure = this.determineStructure(swings);

        return {
            structure,
            swings: swings.slice(-10),
            higherHighs: structure === 'UPTREND',
            lowerLows: structure === 'DOWNTREND',
            range: structure === 'RANGE'
        };
    }

    findSwingPoints(candles, lookback = 5) {
        const swings = [];

        for (let i = lookback; i < candles.length - lookback; i++) {
            let isSwingHigh = true;
            let isSwingLow = true;

            for (let j = 1; j <= lookback; j++) {
                if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) {
                    isSwingHigh = false;
                }
                if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
                    isSwingLow = false;
                }
            }

            if (isSwingHigh) {
                swings.push({ type: 'HIGH', price: candles[i].high, index: i, timestamp: candles[i].timestamp });
            }
            if (isSwingLow) {
                swings.push({ type: 'LOW', price: candles[i].low, index: i, timestamp: candles[i].timestamp });
            }
        }

        return swings;
    }

    determineStructure(swings) {
        if (swings.length < 4) return 'UNKNOWN';

        const highs = swings.filter(s => s.type === 'HIGH').slice(-3);
        const lows = swings.filter(s => s.type === 'LOW').slice(-3);

        if (highs.length < 2 || lows.length < 2) return 'UNKNOWN';

        const higherHighs = highs[highs.length - 1].price > highs[highs.length - 2].price;
        const higherLows = lows[lows.length - 1].price > lows[lows.length - 2].price;
        const lowerHighs = highs[highs.length - 1].price < highs[highs.length - 2].price;
        const lowerLows = lows[lows.length - 1].price < lows[lows.length - 2].price;

        if (higherHighs && higherLows) return 'UPTREND';
        if (lowerHighs && lowerLows) return 'DOWNTREND';
        if (higherHighs && lowerLows) return 'EXPANDING';
        if (lowerHighs && higherLows) return 'CONTRACTING';
        
        return 'RANGE';
    }

    determineRegime(volatility, trend, momentum, structure) {
        let regime = 'NEUTRAL';
        let confidence = 0;
        let tradingApproach = 'CAUTIOUS';

        if (trend.direction === 'UP' && trend.quality !== 'WEAK' && momentum.direction === 'BULLISH') {
            regime = 'TRENDING_UP';
            confidence = (trend.strength + momentum.strength) / 2;
            tradingApproach = volatility.level === 'HIGH' ? 'MOMENTUM' : 'TREND_FOLLOWING';
        } else if (trend.direction === 'DOWN' && trend.quality !== 'WEAK' && momentum.direction === 'BEARISH') {
            regime = 'TRENDING_DOWN';
            confidence = (trend.strength + momentum.strength) / 2;
            tradingApproach = volatility.level === 'HIGH' ? 'MOMENTUM' : 'TREND_FOLLOWING';
        } else if (volatility.level === 'LOW' && structure.structure === 'RANGE') {
            regime = 'RANGE_BOUND';
            confidence = 0.6;
            tradingApproach = 'MEAN_REVERSION';
        } else if (volatility.level === 'HIGH') {
            regime = 'HIGH_VOLATILITY';
            confidence = volatility.score;
            tradingApproach = 'BREAKOUT';
        } else if (volatility.contracting) {
            regime = 'CONSOLIDATION';
            confidence = 0.7;
            tradingApproach = 'BREAKOUT_ANTICIPATION';
        } else if (volatility.expanding && trend.direction !== 'SIDEWAYS') {
            regime = 'BREAKOUT';
            confidence = 0.8;
            tradingApproach = 'MOMENTUM';
        }

        const shouldTrade = this.evaluateTradingConditions(regime, volatility, trend, momentum);

        return {
            regime,
            confidence,
            tradingApproach,
            shouldTrade,
            components: {
                volatility: volatility.level,
                trend: trend.direction,
                trendQuality: trend.quality,
                momentum: momentum.direction,
                structure: structure.structure
            },
            warnings: this.generateWarnings(volatility, trend, momentum)
        };
    }

    evaluateTradingConditions(regime, volatility, trend, momentum) {
        if (regime === 'HIGH_VOLATILITY' && volatility.score > 0.8) {
            return { trade: false, reason: 'Extreme volatility - wait for stabilization' };
        }

        if (momentum.exhaustion) {
            return { trade: false, reason: 'Momentum exhaustion detected' };
        }

        if (momentum.divergence) {
            return { trade: true, reason: 'Divergence detected - potential reversal', caution: true };
        }

        if (regime === 'TRENDING_UP' || regime === 'TRENDING_DOWN') {
            return { trade: true, reason: 'Clear trend in progress' };
        }

        if (regime === 'BREAKOUT') {
            return { trade: true, reason: 'Breakout conditions present' };
        }

        return { trade: true, reason: 'Normal conditions' };
    }

    generateWarnings(volatility, trend, momentum) {
        const warnings = [];

        if (volatility.level === 'HIGH') {
            warnings.push('High volatility - use wider stops');
        }

        if (momentum.exhaustion) {
            warnings.push('RSI at extreme levels - potential reversal');
        }

        if (momentum.divergence) {
            warnings.push('Price-momentum divergence detected');
        }

        if (trend.quality === 'WEAK') {
            warnings.push('Weak trend - consider range strategies');
        }

        if (volatility.expanding) {
            warnings.push('Volatility expanding - expect larger moves');
        }

        return warnings;
    }

    getCurrentRegime() {
        return this.currentRegime;
    }

    getRegimeHistory(count = 50) {
        return this.regimeHistory.slice(-count);
    }

    getVolatilityHistory(count = 50) {
        return this.volatilityHistory.slice(-count);
    }

    getTrendHistory(count = 50) {
        return this.trendHistory.slice(-count);
    }

    // 🔴 ADVANCED DAY TYPE DETECTION
    detectDayType(indexData) {
        const { prevClose, open, ltp, high, low } = indexData;
        
        if (!prevClose || !open || !ltp) {
            this.dayType = { type: 'UNKNOWN', confidence: 0 };
            return this.dayType;
        }
        
        const gapPercent = ((open - prevClose) / prevClose) * 100;
        const currentMove = ((ltp - open) / open) * 100;
        const intradayRange = ((high - low) / low) * 100;
        const vixData = safetyService.getVIXData();
        const vix = vixData.vix;
        const dayOfWeek = new Date().getDay();
        
        // Store gap info
        this.gapInfo = {
            gapPercent: parseFloat(gapPercent.toFixed(2)),
            gapDirection: gapPercent > 0 ? 'UP' : gapPercent < 0 ? 'DOWN' : 'FLAT'
        };
        
        let dayType = 'NORMAL';
        let confidence = 0.5;
        let tradingBias = 'NEUTRAL';
        let signalAdjustment = 'NONE';
        
        // 🔴 CRASH DAY (Index drop > 2%)
        if (currentMove <= this.dayTypeConfig.crashThreshold) {
            dayType = 'CRASH_DAY';
            confidence = 0.9;
            tradingBias = 'BEARISH';
            signalAdjustment = 'SUSPEND_BUY';
            console.log(`[REGIME] 🔴 CRASH DAY detected: ${currentMove.toFixed(2)}%`);
        }
        // 🔴 HIGH VIX DAY
        else if (vix >= this.dayTypeConfig.vixHighThreshold) {
            dayType = 'HIGH_VIX_DAY';
            confidence = 0.8;
            tradingBias = 'CAUTIOUS';
            signalAdjustment = 'DOWNGRADE_STRONG';
        }
        // 🔴 EXPIRY DAY (Thursday)
        else if (this.dayTypeConfig.expiryDays.includes(dayOfWeek)) {
            dayType = 'EXPIRY_DAY';
            confidence = 0.95;
            tradingBias = 'VOLATILE';
            signalAdjustment = 'GAMMA_WATCH';
        }
        // 🔴 GAP UP DAY
        else if (gapPercent >= this.dayTypeConfig.gapThreshold) {
            dayType = 'GAP_UP_DAY';
            confidence = 0.75;
            tradingBias = 'BULLISH';
            signalAdjustment = currentMove > 0 ? 'ALLOW_BULLISH' : 'CAUTIOUS_REVERSAL';
        }
        // 🔴 GAP DOWN DAY
        else if (gapPercent <= -this.dayTypeConfig.gapThreshold) {
            dayType = 'GAP_DOWN_DAY';
            confidence = 0.75;
            tradingBias = 'BEARISH';
            signalAdjustment = currentMove < 0 ? 'ALLOW_BEARISH' : 'CAUTIOUS_REVERSAL';
        }
        // 🔴 TREND DAY (Strong directional move)
        else if (Math.abs(currentMove) >= this.dayTypeConfig.trendDayThreshold) {
            dayType = currentMove > 0 ? 'TREND_UP_DAY' : 'TREND_DOWN_DAY';
            confidence = 0.85;
            tradingBias = currentMove > 0 ? 'BULLISH' : 'BEARISH';
            signalAdjustment = 'ALLOW_AGGRESSIVE_CONTINUATION';
        }
        // 🔴 RANGE DAY (Low movement)
        else if (intradayRange <= this.dayTypeConfig.rangeDayThreshold) {
            dayType = 'RANGE_DAY';
            confidence = 0.7;
            tradingBias = 'NEUTRAL';
            signalAdjustment = 'DOWNGRADE_BREAKOUTS';
        }
        
        this.dayType = {
            type: dayType,
            confidence,
            tradingBias,
            signalAdjustment,
            metrics: {
                gapPercent: parseFloat(gapPercent.toFixed(2)),
                currentMove: parseFloat(currentMove.toFixed(2)),
                intradayRange: parseFloat(intradayRange.toFixed(2)),
                vix
            },
            timestamp: Date.now()
        };
        
        // Record history
        this.dayTypeHistory.push({ ...this.dayType });
        if (this.dayTypeHistory.length > 100) this.dayTypeHistory.shift();
        
        return this.dayType;
    }

    // 🔴 APPLY REGIME TO SIGNAL
    applyRegimeToSignal(signal) {
        if (!this.dayType || !signal) return signal;
        
        const adjustedSignal = { ...signal };
        
        switch (this.dayType.signalAdjustment) {
            case 'SUSPEND_BUY':
                if (signal.signal === 'BUY' || signal.signal === 'STRONG_BUY') {
                    adjustedSignal.suspended = true;
                    adjustedSignal.suspendReason = `CRASH_DAY: BUY signals suspended`;
                }
                break;
                
            case 'DOWNGRADE_STRONG':
                if (signal.signal === 'STRONG_BUY') {
                    adjustedSignal.signal = 'BUY';
                    adjustedSignal.downgraded = true;
                    adjustedSignal.downgradeReason = `HIGH_VIX_DAY: STRONG → BUY`;
                } else if (signal.signal === 'STRONG_SELL') {
                    adjustedSignal.signal = 'SELL';
                    adjustedSignal.downgraded = true;
                    adjustedSignal.downgradeReason = `HIGH_VIX_DAY: STRONG → SELL`;
                }
                break;
                
            case 'DOWNGRADE_BREAKOUTS':
                // Range day - downgrade breakout-based signals
                if (signal.breakoutBased && (signal.signal === 'STRONG_BUY' || signal.signal === 'STRONG_SELL')) {
                    adjustedSignal.signal = signal.signal.replace('STRONG_', '');
                    adjustedSignal.downgraded = true;
                    adjustedSignal.downgradeReason = `RANGE_DAY: Breakout downgraded`;
                }
                break;
                
            case 'ALLOW_AGGRESSIVE_CONTINUATION':
                // Trend day - allow continuation signals to stay strong
                adjustedSignal.trendDayBoost = true;
                break;
        }
        
        adjustedSignal.dayType = this.dayType.type;
        adjustedSignal.regimeApplied = true;
        
        return adjustedSignal;
    }

    getDayType() {
        return this.dayType;
    }

    getGapInfo() {
        return this.gapInfo;
    }

    getDayTypeHistory(count = 50) {
        return this.dayTypeHistory.slice(-count);
    }
}

module.exports = new RegimeService();
