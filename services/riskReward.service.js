const settings = require('../config/settings.config');

class RiskRewardService {
    constructor() {
        this.defaultRR = settings.signals.minRiskReward;
    }

    calculate(entryPrice, candles, indicators, direction = 'LONG') {
        if (!entryPrice || !indicators || !indicators.atr) {
            return this.getDefaultRR(entryPrice, direction);
        }

        const atr = indicators.atr;
        const swingLevels = this.findSwingLevels(candles);
        const supportResistance = this.findSupportResistance(candles);

        let stopLoss, target1, target2, target3;

        if (direction === 'LONG') {
            stopLoss = this.calculateLongStopLoss(entryPrice, atr, swingLevels, supportResistance);
            const targets = this.calculateLongTargets(entryPrice, atr, swingLevels, supportResistance);
            target1 = targets.target1;
            target2 = targets.target2;
            target3 = targets.target3;
        } else {
            stopLoss = this.calculateShortStopLoss(entryPrice, atr, swingLevels, supportResistance);
            const targets = this.calculateShortTargets(entryPrice, atr, swingLevels, supportResistance);
            target1 = targets.target1;
            target2 = targets.target2;
            target3 = targets.target3;
        }

        const risk = Math.abs(entryPrice - stopLoss);
        const reward1 = Math.abs(target1 - entryPrice);
        const reward2 = Math.abs(target2 - entryPrice);
        const reward3 = Math.abs(target3 - entryPrice);

        const rr1 = risk > 0 ? reward1 / risk : 0;
        const rr2 = risk > 0 ? reward2 / risk : 0;
        const rr3 = risk > 0 ? reward3 / risk : 0;

        const riskPercent = (risk / entryPrice) * 100;

        return {
            entry: entryPrice,
            stopLoss,
            target1,
            target2,
            target3,
            risk,
            riskPercent: parseFloat(riskPercent.toFixed(2)),
            reward1,
            reward2,
            reward3,
            rr1: parseFloat(rr1.toFixed(2)),
            rr2: parseFloat(rr2.toFixed(2)),
            rr3: parseFloat(rr3.toFixed(2)),
            primaryRR: parseFloat(rr2.toFixed(2)),
            valid: rr2 >= this.defaultRR,
            direction,
            atrUsed: atr,
            levels: {
                swingHigh: swingLevels.swingHigh,
                swingLow: swingLevels.swingLow,
                resistance: supportResistance.resistance,
                support: supportResistance.support
            }
        };
    }

    getDefaultRR(entryPrice, direction) {
        if (!entryPrice) {
            return { valid: false, error: 'No entry price' };
        }

        const defaultRisk = entryPrice * 0.015;
        const stopLoss = direction === 'LONG' ? entryPrice - defaultRisk : entryPrice + defaultRisk;
        const target1 = direction === 'LONG' ? entryPrice + defaultRisk * 1.5 : entryPrice - defaultRisk * 1.5;
        const target2 = direction === 'LONG' ? entryPrice + defaultRisk * 2 : entryPrice - defaultRisk * 2;
        const target3 = direction === 'LONG' ? entryPrice + defaultRisk * 3 : entryPrice - defaultRisk * 3;

        return {
            entry: entryPrice,
            stopLoss,
            target1,
            target2,
            target3,
            risk: defaultRisk,
            riskPercent: 1.5,
            rr1: 1.5,
            rr2: 2,
            rr3: 3,
            primaryRR: 2,
            valid: true,
            direction,
            method: 'DEFAULT'
        };
    }

    findSwingLevels(candles, lookback = 20) {
        if (!candles || candles.length < lookback) {
            return { swingHigh: null, swingLow: null };
        }

        const recentCandles = candles.slice(-lookback);
        
        let swingHigh = recentCandles[0].high;
        let swingLow = recentCandles[0].low;

        recentCandles.forEach(c => {
            if (c.high > swingHigh) swingHigh = c.high;
            if (c.low < swingLow) swingLow = c.low;
        });

        return { swingHigh, swingLow };
    }

    findSupportResistance(candles, lookback = 50) {
        if (!candles || candles.length < lookback) {
            return { resistance: null, support: null };
        }

        const recentCandles = candles.slice(-lookback);
        const prices = [];

        recentCandles.forEach(c => {
            prices.push(c.high);
            prices.push(c.low);
            prices.push(c.close);
        });

        prices.sort((a, b) => a - b);

        const clusters = this.findPriceClusters(prices);
        
        const currentPrice = candles[candles.length - 1].close;
        
        let resistance = null;
        let support = null;

        clusters.forEach(cluster => {
            if (cluster.price > currentPrice && (resistance === null || cluster.price < resistance)) {
                resistance = cluster.price;
            }
            if (cluster.price < currentPrice && (support === null || cluster.price > support)) {
                support = cluster.price;
            }
        });

        return { resistance, support };
    }

    findPriceClusters(prices, tolerance = 0.005) {
        const clusters = [];
        const used = new Set();

        prices.forEach(price => {
            if (used.has(price)) return;

            let clusterCount = 0;
            let clusterSum = 0;

            prices.forEach(p => {
                if (Math.abs(p - price) / price < tolerance) {
                    clusterCount++;
                    clusterSum += p;
                    used.add(p);
                }
            });

            if (clusterCount >= 3) {
                clusters.push({
                    price: clusterSum / clusterCount,
                    strength: clusterCount
                });
            }
        });

        clusters.sort((a, b) => b.strength - a.strength);
        return clusters.slice(0, 10);
    }

    calculateLongStopLoss(entryPrice, atr, swingLevels, supportResistance) {
        const atrStop = entryPrice - (atr * 1.5);
        const swingStop = swingLevels.swingLow ? swingLevels.swingLow * 0.995 : null;
        const supportStop = supportResistance.support ? supportResistance.support * 0.995 : null;

        const candidates = [atrStop];
        if (swingStop && swingStop < entryPrice) candidates.push(swingStop);
        if (supportStop && supportStop < entryPrice) candidates.push(supportStop);

        return Math.max(...candidates.filter(c => c !== null));
    }

    calculateShortStopLoss(entryPrice, atr, swingLevels, supportResistance) {
        const atrStop = entryPrice + (atr * 1.5);
        const swingStop = swingLevels.swingHigh ? swingLevels.swingHigh * 1.005 : null;
        const resistanceStop = supportResistance.resistance ? supportResistance.resistance * 1.005 : null;

        const candidates = [atrStop];
        if (swingStop && swingStop > entryPrice) candidates.push(swingStop);
        if (resistanceStop && resistanceStop > entryPrice) candidates.push(resistanceStop);

        return Math.min(...candidates.filter(c => c !== null));
    }

    calculateLongTargets(entryPrice, atr, swingLevels, supportResistance) {
        const atrTarget1 = entryPrice + (atr * 2);
        const atrTarget2 = entryPrice + (atr * 3);
        const atrTarget3 = entryPrice + (atr * 4.5);

        let target1 = atrTarget1;
        let target2 = atrTarget2;
        let target3 = atrTarget3;

        if (supportResistance.resistance) {
            if (supportResistance.resistance > entryPrice && supportResistance.resistance < atrTarget2) {
                target1 = supportResistance.resistance * 0.995;
            }
        }

        if (swingLevels.swingHigh && swingLevels.swingHigh > entryPrice) {
            if (swingLevels.swingHigh < atrTarget2) {
                target2 = Math.max(target2, swingLevels.swingHigh);
            }
        }

        return { target1, target2, target3 };
    }

    calculateShortTargets(entryPrice, atr, swingLevels, supportResistance) {
        const atrTarget1 = entryPrice - (atr * 2);
        const atrTarget2 = entryPrice - (atr * 3);
        const atrTarget3 = entryPrice - (atr * 4.5);

        let target1 = atrTarget1;
        let target2 = atrTarget2;
        let target3 = atrTarget3;

        if (supportResistance.support) {
            if (supportResistance.support < entryPrice && supportResistance.support > atrTarget2) {
                target1 = supportResistance.support * 1.005;
            }
        }

        if (swingLevels.swingLow && swingLevels.swingLow < entryPrice) {
            if (swingLevels.swingLow > atrTarget2) {
                target2 = Math.min(target2, swingLevels.swingLow);
            }
        }

        return { target1, target2, target3 };
    }

    calculatePositionSize(capital, riskPercent, entryPrice, stopLoss) {
        const riskAmount = capital * (riskPercent / 100);
        const riskPerShare = Math.abs(entryPrice - stopLoss);
        
        if (riskPerShare === 0) return 0;
        
        const shares = Math.floor(riskAmount / riskPerShare);
        const positionValue = shares * entryPrice;
        const maxPositionPercent = 20;
        const maxShares = Math.floor((capital * maxPositionPercent / 100) / entryPrice);

        return {
            shares: Math.min(shares, maxShares),
            positionValue: Math.min(shares, maxShares) * entryPrice,
            riskAmount: Math.min(shares, maxShares) * riskPerShare,
            riskPercent: (Math.min(shares, maxShares) * riskPerShare / capital) * 100
        };
    }

    evaluateRR(rr) {
        if (rr >= 3) return { grade: 'EXCELLENT', score: 100 };
        if (rr >= 2.5) return { grade: 'VERY_GOOD', score: 85 };
        if (rr >= 2) return { grade: 'GOOD', score: 70 };
        if (rr >= 1.5) return { grade: 'ACCEPTABLE', score: 55 };
        if (rr >= 1) return { grade: 'POOR', score: 40 };
        return { grade: 'UNACCEPTABLE', score: 20 };
    }
}

module.exports = new RiskRewardService();
