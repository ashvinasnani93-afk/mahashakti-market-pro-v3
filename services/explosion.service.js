const settings = require('../config/settings.config');

class ExplosionService {
    constructor() {
        this.priceSnapshots = new Map();
        this.explosionHistory = [];
        this.oiSnapshots = new Map();
        this.strikeData = new Map();
        this.activeExplosions = new Map();
    }

    recordPrice(token, price, volume, oi = null, timestamp = Date.now()) {
        const snapshots = this.priceSnapshots.get(token) || [];
        
        snapshots.push({ 
            price, 
            volume, 
            oi,
            timestamp 
        });
        
        if (snapshots.length > 200) {
            snapshots.shift();
        }
        
        this.priceSnapshots.set(token, snapshots);

        if (oi !== null) {
            this.recordOI(token, oi, price, timestamp);
        }
    }

    recordOI(token, oi, price, timestamp = Date.now()) {
        const snapshots = this.oiSnapshots.get(token) || [];
        
        snapshots.push({
            oi,
            price,
            timestamp
        });

        if (snapshots.length > 200) {
            snapshots.shift();
        }

        this.oiSnapshots.set(token, snapshots);
    }

    recordStrikeData(underlyingToken, strikePrice, optionType, data) {
        const key = `${underlyingToken}_${strikePrice}_${optionType}`;
        const existing = this.strikeData.get(key) || { history: [] };
        
        existing.current = data;
        existing.history.push({ ...data, timestamp: Date.now() });
        
        if (existing.history.length > 100) {
            existing.history.shift();
        }
        
        this.strikeData.set(key, existing);
    }

    detectExplosion(instrument, currentPrice, currentVolume, avgVolume, oi = null) {
        const token = instrument.token;
        const snapshots = this.priceSnapshots.get(token) || [];
        
        if (snapshots.length < 10) {
            return null;
        }

        const detectedExplosions = [];
        const config = settings.explosion;

        const earlyMove = this.detectEarlyIntradayExpansion(snapshots, currentPrice, config);
        if (earlyMove) detectedExplosions.push(earlyMove);

        const priceAccel = this.detectPriceAcceleration(snapshots, currentPrice, config);
        if (priceAccel) detectedExplosions.push(priceAccel);

        const volumeAccel = this.detectVolumeAcceleration(snapshots, currentVolume, avgVolume, config);
        if (volumeAccel) detectedExplosions.push(volumeAccel);

        const highMomentum = this.detectHighMomentumRunner(snapshots, currentPrice, currentVolume, avgVolume);
        if (highMomentum) detectedExplosions.push(highMomentum);

        if (oi !== null) {
            const oiExplosion = this.detectOIPriceExplosion(token, currentPrice, oi, config);
            if (oiExplosion) detectedExplosions.push(oiExplosion);
        }

        const optionAccel = this.detectOptionStrikeAcceleration(snapshots, currentPrice, instrument, config);
        if (optionAccel) detectedExplosions.push(optionAccel);

        if (detectedExplosions.length === 0) {
            this.activeExplosions.delete(token);
            return null;
        }

        const explosion = {
            instrument: {
                symbol: instrument.symbol,
                token: instrument.token,
                name: instrument.name,
                exchange: instrument.exchange
            },
            price: currentPrice,
            volume: currentVolume,
            avgVolume,
            oi,
            types: detectedExplosions,
            severity: this.calculateSeverity(detectedExplosions),
            direction: this.determineDirection(detectedExplosions, snapshots, currentPrice),
            liquidityCheck: this.checkLiquidity(avgVolume, currentVolume),
            actionable: this.isActionable(detectedExplosions, avgVolume),
            timestamp: Date.now()
        };

        this.recordExplosion(explosion);
        this.activeExplosions.set(token, explosion);

        return explosion;
    }

    detectEarlyIntradayExpansion(snapshots, currentPrice, config) {
        const now = new Date();
        const marketOpen = new Date(now);
        marketOpen.setHours(settings.market.openHour, settings.market.openMinute, 0, 0);
        
        const timeSinceOpen = (now - marketOpen) / (1000 * 60);
        
        if (timeSinceOpen > config.detectionWindowMinutes || timeSinceOpen < 0) {
            return null;
        }

        const openingSnapshots = snapshots.filter(s => {
            const snapTime = new Date(s.timestamp);
            return snapTime >= marketOpen;
        });

        if (openingSnapshots.length < 3) return null;

        const openPrice = openingSnapshots[0].price;
        const movePercent = ((currentPrice - openPrice) / openPrice) * 100;

        if (Math.abs(movePercent) >= config.earlyMovePercent) {
            return {
                type: 'EARLY_INTRADAY_EXPANSION',
                movePercent: parseFloat(movePercent.toFixed(2)),
                direction: movePercent > 0 ? 'UP' : 'DOWN',
                openPrice,
                currentPrice,
                minutesSinceOpen: Math.round(timeSinceOpen),
                strength: Math.min(1, Math.abs(movePercent) / (config.earlyMovePercent * 3))
            };
        }

        return null;
    }

    detectPriceAcceleration(snapshots, currentPrice, config) {
        if (snapshots.length < 15) return null;

        const recent5 = snapshots.slice(-5);
        const mid5 = snapshots.slice(-10, -5);
        const older5 = snapshots.slice(-15, -10);

        const recentMove = Math.abs(recent5[recent5.length - 1].price - recent5[0].price);
        const midMove = Math.abs(mid5[mid5.length - 1].price - mid5[0].price);
        const olderMove = Math.abs(older5[older5.length - 1].price - older5[0].price);

        if (midMove === 0 || olderMove === 0) return null;

        const recentAcceleration = recentMove / midMove;
        const sustainedAcceleration = recentMove / olderMove;

        if (recentAcceleration >= config.accelerationMultiplier) {
            const direction = recent5[recent5.length - 1].price > recent5[0].price ? 'UP' : 'DOWN';
            const avgPrice = (recent5[0].price + recent5[recent5.length - 1].price) / 2;
            const movePercent = (recentMove / avgPrice) * 100;

            return {
                type: 'PRICE_ACCELERATION',
                accelerationRatio: parseFloat(recentAcceleration.toFixed(2)),
                sustainedRatio: parseFloat(sustainedAcceleration.toFixed(2)),
                direction,
                recentMove: parseFloat(recentMove.toFixed(2)),
                midMove: parseFloat(midMove.toFixed(2)),
                movePercent: parseFloat(movePercent.toFixed(2)),
                strength: Math.min(1, recentAcceleration / (config.accelerationMultiplier * 2))
            };
        }

        return null;
    }

    detectVolumeAcceleration(snapshots, currentVolume, avgVolume, config) {
        if (snapshots.length < 10 || avgVolume === 0) return null;

        const recentVolumes = snapshots.slice(-10).map(s => s.volume);
        const recentAvg = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;

        const volumeRatioToAvg = currentVolume / avgVolume;
        const volumeRatioToRecent = recentAvg > 0 ? currentVolume / recentAvg : 0;

        let volumeAccelerating = false;
        for (let i = 1; i < Math.min(5, recentVolumes.length); i++) {
            if (recentVolumes[recentVolumes.length - i] > recentVolumes[recentVolumes.length - i - 1] * 1.2) {
                volumeAccelerating = true;
                break;
            }
        }

        if (volumeRatioToAvg >= config.volumeAccelerationRatio) {
            return {
                type: 'VOLUME_EXPLOSION',
                volumeRatioToAvg: parseFloat(volumeRatioToAvg.toFixed(2)),
                volumeRatioToRecent: parseFloat(volumeRatioToRecent.toFixed(2)),
                currentVolume,
                avgVolume,
                recentAvg: Math.round(recentAvg),
                accelerating: volumeAccelerating,
                strength: Math.min(1, volumeRatioToAvg / (config.volumeAccelerationRatio * 2))
            };
        }

        return null;
    }

    detectHighMomentumRunner(snapshots, currentPrice, currentVolume, avgVolume) {
        if (snapshots.length < 20) return null;

        const last20 = snapshots.slice(-20);
        const priceStart = last20[0].price;
        const totalMove = ((currentPrice - priceStart) / priceStart) * 100;

        let consecutiveUp = 0;
        let consecutiveDown = 0;
        let maxConsecutive = 0;

        for (let i = 1; i < last20.length; i++) {
            if (last20[i].price > last20[i - 1].price) {
                consecutiveUp++;
                consecutiveDown = 0;
            } else if (last20[i].price < last20[i - 1].price) {
                consecutiveDown++;
                consecutiveUp = 0;
            }
            maxConsecutive = Math.max(maxConsecutive, consecutiveUp, consecutiveDown);
        }

        const volumeSupport = currentVolume > avgVolume * 1.5;

        if (Math.abs(totalMove) >= 2 && maxConsecutive >= 5 && volumeSupport) {
            return {
                type: 'HIGH_MOMENTUM_RUNNER',
                totalMovePercent: parseFloat(totalMove.toFixed(2)),
                direction: totalMove > 0 ? 'UP' : 'DOWN',
                consecutiveBars: maxConsecutive,
                volumeSupported: volumeSupport,
                strength: Math.min(1, (Math.abs(totalMove) / 5) * (maxConsecutive / 10))
            };
        }

        return null;
    }

    detectOIPriceExplosion(token, currentPrice, currentOI, config) {
        const oiSnapshots = this.oiSnapshots.get(token);
        if (!oiSnapshots || oiSnapshots.length < 5) return null;

        const oldSnapshot = oiSnapshots[0];
        const recentSnapshot = oiSnapshots[oiSnapshots.length - 5] || oldSnapshot;

        const oiChangeTotal = ((currentOI - oldSnapshot.oi) / oldSnapshot.oi) * 100;
        const oiChangeRecent = ((currentOI - recentSnapshot.oi) / recentSnapshot.oi) * 100;
        const priceChangeTotal = ((currentPrice - oldSnapshot.price) / oldSnapshot.price) * 100;
        const priceChangeRecent = ((currentPrice - recentSnapshot.price) / recentSnapshot.price) * 100;

        const threshold = config.oiDeltaThreshold;

        let interpretation = null;
        let strength = 0;

        if (oiChangeRecent > threshold && priceChangeRecent > 0) {
            interpretation = 'LONG_BUILDUP';
            strength = Math.min(1, (oiChangeRecent / threshold) * 0.5 + (priceChangeRecent / 2) * 0.5);
        } else if (oiChangeRecent > threshold && priceChangeRecent < 0) {
            interpretation = 'SHORT_BUILDUP';
            strength = Math.min(1, (oiChangeRecent / threshold) * 0.5 + (Math.abs(priceChangeRecent) / 2) * 0.5);
        } else if (oiChangeRecent < -threshold && priceChangeRecent > 0) {
            interpretation = 'SHORT_COVERING';
            strength = Math.min(1, (Math.abs(oiChangeRecent) / threshold) * 0.5 + (priceChangeRecent / 2) * 0.5);
        } else if (oiChangeRecent < -threshold && priceChangeRecent < 0) {
            interpretation = 'LONG_UNWINDING';
            strength = Math.min(1, (Math.abs(oiChangeRecent) / threshold) * 0.5 + (Math.abs(priceChangeRecent) / 2) * 0.5);
        }

        if (interpretation) {
            return {
                type: 'OI_PRICE_COMBO',
                interpretation,
                oiChangeTotal: parseFloat(oiChangeTotal.toFixed(2)),
                oiChangeRecent: parseFloat(oiChangeRecent.toFixed(2)),
                priceChangeTotal: parseFloat(priceChangeTotal.toFixed(2)),
                priceChangeRecent: parseFloat(priceChangeRecent.toFixed(2)),
                currentOI,
                previousOI: recentSnapshot.oi,
                bullish: interpretation === 'LONG_BUILDUP' || interpretation === 'SHORT_COVERING',
                bearish: interpretation === 'SHORT_BUILDUP' || interpretation === 'LONG_UNWINDING',
                strength
            };
        }

        return null;
    }

    detectOptionStrikeAcceleration(snapshots, currentPrice, instrument, config) {
        const symbol = instrument.symbol || '';
        const isOption = symbol.includes('CE') || symbol.includes('PE');
        
        if (!isOption) return null;
        if (snapshots.length < 15) return null;

        const recent5 = snapshots.slice(-5);
        const mid5 = snapshots.slice(-10, -5);
        const older5 = snapshots.slice(-15, -10);

        const recentHigh = Math.max(...recent5.map(s => s.price));
        const recentLow = Math.min(...recent5.map(s => s.price));
        const midHigh = Math.max(...mid5.map(s => s.price));
        const midLow = Math.min(...mid5.map(s => s.price));
        const olderHigh = Math.max(...older5.map(s => s.price));
        const olderLow = Math.min(...older5.map(s => s.price));

        const recentRange = recentHigh - recentLow;
        const midRange = midHigh - midLow;
        const olderRange = olderHigh - olderLow;

        if (midRange === 0 || olderRange === 0) return null;

        const rangeExpansion = recentRange / midRange;
        const sustainedExpansion = recentRange / olderRange;

        if (rangeExpansion >= config.optionRangeExpansion) {
            const isCall = symbol.includes('CE');
            const direction = currentPrice > recent5[0].price ? 'UP' : 'DOWN';
            const premiumChange = ((currentPrice - snapshots[0].price) / snapshots[0].price) * 100;

            return {
                type: 'OPTION_STRIKE_ACCELERATION',
                optionType: isCall ? 'CALL' : 'PUT',
                rangeExpansion: parseFloat(rangeExpansion.toFixed(2)),
                sustainedExpansion: parseFloat(sustainedExpansion.toFixed(2)),
                direction,
                recentRange: parseFloat(recentRange.toFixed(2)),
                midRange: parseFloat(midRange.toFixed(2)),
                premiumChangePercent: parseFloat(premiumChange.toFixed(2)),
                favorable: (isCall && direction === 'UP') || (!isCall && direction === 'DOWN'),
                strength: Math.min(1, rangeExpansion / (config.optionRangeExpansion * 2))
            };
        }

        return null;
    }

    calculateSeverity(explosions) {
        let totalScore = 0;
        
        explosions.forEach(e => {
            const baseScore = e.strength || 0.5;
            
            switch (e.type) {
                case 'EARLY_INTRADAY_EXPANSION':
                    totalScore += baseScore * 3;
                    break;
                case 'PRICE_ACCELERATION':
                    totalScore += baseScore * 2.5;
                    break;
                case 'VOLUME_EXPLOSION':
                    totalScore += baseScore * 2;
                    break;
                case 'HIGH_MOMENTUM_RUNNER':
                    totalScore += baseScore * 3;
                    break;
                case 'OI_PRICE_COMBO':
                    totalScore += baseScore * 2.5;
                    break;
                case 'OPTION_STRIKE_ACCELERATION':
                    totalScore += baseScore * 2;
                    break;
                default:
                    totalScore += baseScore;
            }
        });

        if (totalScore >= 8) return 'CRITICAL';
        if (totalScore >= 5) return 'HIGH';
        if (totalScore >= 3) return 'MEDIUM';
        return 'LOW';
    }

    determineDirection(explosions, snapshots, currentPrice) {
        let upVotes = 0;
        let downVotes = 0;

        explosions.forEach(e => {
            if (e.direction === 'UP') upVotes++;
            if (e.direction === 'DOWN') downVotes++;
            if (e.bullish) upVotes++;
            if (e.bearish) downVotes++;
        });

        if (snapshots.length >= 5) {
            const recentTrend = currentPrice > snapshots[snapshots.length - 5].price;
            if (recentTrend) upVotes++;
            else downVotes++;
        }

        if (upVotes > downVotes) return 'BULLISH';
        if (downVotes > upVotes) return 'BEARISH';
        return 'NEUTRAL';
    }

    checkLiquidity(avgVolume, currentVolume) {
        const config = settings.safety;
        
        let score = 'LOW';
        if (avgVolume > config.minLiquidity * 2) {
            score = 'HIGH';
        } else if (avgVolume > config.minLiquidity) {
            score = 'MEDIUM';
        }

        return {
            score,
            avgVolume,
            currentVolume,
            tradeable: score !== 'LOW',
            warning: score === 'LOW' ? 'Low liquidity - exercise caution' : null
        };
    }

    isActionable(explosions, avgVolume) {
        const hasSignificantExplosion = explosions.some(e => 
            e.type === 'EARLY_INTRADAY_EXPANSION' ||
            e.type === 'HIGH_MOMENTUM_RUNNER' ||
            (e.type === 'VOLUME_EXPLOSION' && e.strength > 0.6)
        );

        const hasLiquidity = avgVolume > settings.safety.minLiquidity;

        return hasSignificantExplosion && hasLiquidity;
    }

    recordExplosion(explosion) {
        this.explosionHistory.push(explosion);
        
        if (this.explosionHistory.length > 1000) {
            this.explosionHistory = this.explosionHistory.slice(-500);
        }
    }

    getExplosionHistory(count = 100) {
        return this.explosionHistory.slice(-count).reverse();
    }

    getRecentExplosions(minutes = 30) {
        const cutoff = Date.now() - (minutes * 60 * 1000);
        return this.explosionHistory
            .filter(e => e.timestamp >= cutoff)
            .reverse();
    }

    getActiveExplosions() {
        return Array.from(this.activeExplosions.values());
    }

    getExplosionsByType(type) {
        return this.explosionHistory.filter(e => 
            e.types.some(t => t.type === type)
        ).reverse();
    }

    getExplosionsBySeverity(severity) {
        return this.explosionHistory.filter(e => e.severity === severity).reverse();
    }

    clearHistory() {
        this.explosionHistory = [];
        this.priceSnapshots.clear();
        this.oiSnapshots.clear();
        this.strikeData.clear();
        this.activeExplosions.clear();
    }

    getStats() {
        const last24h = Date.now() - 24 * 60 * 60 * 1000;
        const recent = this.explosionHistory.filter(e => e.timestamp >= last24h);

        return {
            total: this.explosionHistory.length,
            last24h: recent.length,
            bySeverity: {
                critical: recent.filter(e => e.severity === 'CRITICAL').length,
                high: recent.filter(e => e.severity === 'HIGH').length,
                medium: recent.filter(e => e.severity === 'MEDIUM').length,
                low: recent.filter(e => e.severity === 'LOW').length
            },
            activeCount: this.activeExplosions.size,
            trackedTokens: this.priceSnapshots.size
        };
    }
}

module.exports = new ExplosionService();
