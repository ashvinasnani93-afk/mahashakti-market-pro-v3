const settings = require('../config/settings.config');
const premiumMomentumService = require('./premiumMomentum.service');

class ExplosionService {
    constructor() {
        this.priceSnapshots = new Map();
        this.explosionHistory = [];
        this.oiSnapshots = new Map();
        this.activeExplosions = new Map();
        this.topRunners = new Map();
        this.bigMovers15to20 = new Map();
        this.gammaAcceleration = new Map();
        this.rollingMemory = [];
        this.maxMemorySize = 500;
        
        // 🔴 MEMORY CAPS
        this.maxSnapshotsPerToken = 50;    // Max 50 records per token
        this.maxOISnapshotsPerToken = 30;  // Max 30 OI intervals per token
        this.maxExplosionHistory = 500;     // Global explosion history limit
    }

    recordPrice(token, price, volume, oi = null, timestamp = Date.now()) {
        const snapshots = this.priceSnapshots.get(token) || [];
        
        snapshots.push({ 
            price, 
            volume, 
            oi,
            timestamp 
        });
        
        // 🔴 MEMORY CAP: Max 50 records per token
        if (snapshots.length > this.maxSnapshotsPerToken) {
            snapshots.shift();
        }
        
        this.priceSnapshots.set(token, snapshots);

        if (oi !== null) {
            this.recordOI(token, oi, price, timestamp);
        }

        this.checkRunnerStatus(token, snapshots);
    }

    recordOI(token, oi, price, timestamp = Date.now()) {
        const snapshots = this.oiSnapshots.get(token) || [];
        
        snapshots.push({
            oi,
            price,
            timestamp
        });

        // 🔴 MEMORY CAP: Max 30 OI intervals per token
        if (snapshots.length > this.maxOISnapshotsPerToken) {
            snapshots.shift();
        }

        this.oiSnapshots.set(token, snapshots);
    }

    checkRunnerStatus(token, snapshots) {
        if (snapshots.length < 10) return;

        const first = snapshots[0];
        const last = snapshots[snapshots.length - 1];
        const movePercent = ((last.price - first.price) / first.price) * 100;

        if (Math.abs(movePercent) >= 15 && Math.abs(movePercent) < 20) {
            this.bigMovers15to20.set(token, {
                token,
                movePercent,
                startPrice: first.price,
                currentPrice: last.price,
                timestamp: Date.now()
            });
        } else if (Math.abs(movePercent) >= 20) {
            this.topRunners.set(token, {
                token,
                movePercent,
                startPrice: first.price,
                currentPrice: last.price,
                timestamp: Date.now()
            });
        }
    }

    detectExplosion(instrument, currentPrice, currentVolume, avgVolume, oi = null) {
        const token = instrument.token;
        const snapshots = this.priceSnapshots.get(token) || [];
        
        if (snapshots.length < 10) {
            return null;
        }

        const detectedExplosions = [];
        const config = settings.explosion || {};

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

        const gammaAccel = this.detectGammaAcceleration(token, instrument);
        if (gammaAccel) detectedExplosions.push(gammaAccel);

        const premiumExplosion = this.checkPremiumMomentumExplosion(token, instrument);
        if (premiumExplosion) detectedExplosions.push(premiumExplosion);

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
            rank: this.calculateExplosionRank(detectedExplosions),
            timestamp: Date.now()
        };

        this.recordExplosion(explosion);
        this.activeExplosions.set(token, explosion);
        this.addToRollingMemory(explosion);

        return explosion;
    }

    detectEarlyIntradayExpansion(snapshots, currentPrice, config) {
        const now = new Date();
        const marketConfig = settings.market || {};
        const marketOpen = new Date(now);
        marketOpen.setHours(marketConfig.openHour || 9, marketConfig.openMinute || 15, 0, 0);
        
        const timeSinceOpen = (now - marketOpen) / (1000 * 60);
        
        if (timeSinceOpen > (config.detectionWindowMinutes || 60) || timeSinceOpen < 0) {
            return null;
        }

        const openingSnapshots = snapshots.filter(s => {
            const snapTime = new Date(s.timestamp);
            return snapTime >= marketOpen;
        });

        if (openingSnapshots.length < 3) return null;

        const openPrice = openingSnapshots[0].price;
        const movePercent = ((currentPrice - openPrice) / openPrice) * 100;

        if (Math.abs(movePercent) >= (config.earlyMovePercent || 1.5)) {
            return {
                type: 'EARLY_INTRADAY_EXPANSION',
                movePercent: parseFloat(movePercent.toFixed(2)),
                direction: movePercent > 0 ? 'UP' : 'DOWN',
                openPrice,
                currentPrice,
                minutesSinceOpen: Math.round(timeSinceOpen),
                strength: Math.min(1, Math.abs(movePercent) / ((config.earlyMovePercent || 1.5) * 3))
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

        if (recentAcceleration >= (config.accelerationMultiplier || 2)) {
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
                strength: Math.min(1, recentAcceleration / ((config.accelerationMultiplier || 2) * 2))
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

        if (volumeRatioToAvg >= (config.volumeAccelerationRatio || 3)) {
            return {
                type: 'VOLUME_EXPLOSION',
                volumeRatioToAvg: parseFloat(volumeRatioToAvg.toFixed(2)),
                volumeRatioToRecent: parseFloat(volumeRatioToRecent.toFixed(2)),
                currentVolume,
                avgVolume,
                recentAvg: Math.round(recentAvg),
                accelerating: volumeAccelerating,
                strength: Math.min(1, volumeRatioToAvg / ((config.volumeAccelerationRatio || 3) * 2))
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

        const threshold = config.oiDeltaThreshold || 5;

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

        const recentRange = recentHigh - recentLow;
        const midRange = midHigh - midLow;

        if (midRange === 0) return null;

        const rangeExpansion = recentRange / midRange;

        if (rangeExpansion >= (config.optionRangeExpansion || 2)) {
            const isCall = symbol.includes('CE');
            const direction = currentPrice > recent5[0].price ? 'UP' : 'DOWN';
            const premiumChange = ((currentPrice - snapshots[0].price) / snapshots[0].price) * 100;

            return {
                type: 'OPTION_STRIKE_ACCELERATION',
                optionType: isCall ? 'CALL' : 'PUT',
                rangeExpansion: parseFloat(rangeExpansion.toFixed(2)),
                direction,
                recentRange: parseFloat(recentRange.toFixed(2)),
                midRange: parseFloat(midRange.toFixed(2)),
                premiumChangePercent: parseFloat(premiumChange.toFixed(2)),
                favorable: (isCall && direction === 'UP') || (!isCall && direction === 'DOWN'),
                strength: Math.min(1, rangeExpansion / ((config.optionRangeExpansion || 2) * 2))
            };
        }

        return null;
    }

    detectGammaAcceleration(token, instrument) {
        const premiumData = premiumMomentumService.getPremiumData(token);
        if (!premiumData) return null;

        const deltas = premiumMomentumService.calculateDeltas(token);
        if (!deltas) return null;

        if (deltas.delta5mPercent > deltas.delta15mPercent / 2 && deltas.delta5mPercent > 3) {
            const gammaScore = deltas.delta5mPercent / (deltas.delta15mPercent / 3 || 1);

            this.gammaAcceleration.set(token, {
                token,
                symbol: instrument.symbol,
                gammaScore,
                delta5m: deltas.delta5mPercent,
                delta15m: deltas.delta15mPercent,
                timestamp: Date.now()
            });

            return {
                type: 'GAMMA_ACCELERATION',
                gammaScore: parseFloat(gammaScore.toFixed(2)),
                delta5mPercent: parseFloat(deltas.delta5mPercent.toFixed(2)),
                delta15mPercent: parseFloat(deltas.delta15mPercent.toFixed(2)),
                accelerationScore: deltas.accelerationScore,
                strength: Math.min(1, gammaScore / 3)
            };
        }

        return null;
    }

    checkPremiumMomentumExplosion(token, instrument) {
        const candidates = premiumMomentumService.getExplosionCandidates();
        const match = candidates.find(c => c.token === token);

        if (match) {
            return {
                type: 'PREMIUM_MOMENTUM_EXPLOSION',
                delta5mPercent: parseFloat(match.delta5mPercent.toFixed(2)),
                delta15mPercent: parseFloat(match.delta15mPercent.toFixed(2)),
                volumeChangePercent: parseFloat(match.volumeChangePercent.toFixed(2)),
                oiChangePercent: parseFloat(match.oiChangePercent.toFixed(2)),
                accelerationScore: match.accelerationScore,
                direction: match.delta5mPercent > 0 ? 'UP' : 'DOWN',
                strength: Math.min(1, match.accelerationScore / 100)
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
                case 'GAMMA_ACCELERATION':
                    totalScore += baseScore * 3;
                    break;
                case 'PREMIUM_MOMENTUM_EXPLOSION':
                    totalScore += baseScore * 3.5;
                    break;
                default:
                    totalScore += baseScore;
            }
        });

        if (totalScore >= 10) return 'CRITICAL';
        if (totalScore >= 6) return 'HIGH';
        if (totalScore >= 3) return 'MEDIUM';
        return 'LOW';
    }

    calculateExplosionRank(explosions) {
        let rank = 0;
        
        explosions.forEach(e => {
            rank += (e.strength || 0.5) * 20;
        });

        return Math.min(100, rank);
    }

    determineDirection(explosions, snapshots, currentPrice) {
        let upVotes = 0;
        let downVotes = 0;

        explosions.forEach(e => {
            if (e.direction === 'UP') upVotes += 2;
            if (e.direction === 'DOWN') downVotes += 2;
            if (e.bullish) upVotes += 1;
            if (e.bearish) downVotes += 1;
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
        const config = settings.safety || {};
        const minLiquidity = config.minLiquidity || 50000;
        
        let score = 'LOW';
        if (avgVolume > minLiquidity * 2) {
            score = 'HIGH';
        } else if (avgVolume > minLiquidity) {
            score = 'MEDIUM';
        }

        return {
            score,
            avgVolume,
            currentVolume,
            tradeable: score !== 'LOW'
        };
    }

    isActionable(explosions, avgVolume) {
        const hasSignificantExplosion = explosions.some(e => 
            e.type === 'EARLY_INTRADAY_EXPANSION' ||
            e.type === 'HIGH_MOMENTUM_RUNNER' ||
            e.type === 'PREMIUM_MOMENTUM_EXPLOSION' ||
            e.type === 'GAMMA_ACCELERATION' ||
            (e.type === 'VOLUME_EXPLOSION' && e.strength > 0.6)
        );

        const minLiquidity = settings.safety?.minLiquidity || 50000;
        const hasLiquidity = avgVolume > minLiquidity;

        return hasSignificantExplosion && hasLiquidity;
    }

    addToRollingMemory(explosion) {
        this.rollingMemory.push(explosion);
        
        if (this.rollingMemory.length > this.maxMemorySize) {
            this.rollingMemory.shift();
        }
    }

    recordExplosion(explosion) {
        this.explosionHistory.push(explosion);
        
        // 🔴 MEMORY CAP: Limit global explosion history
        if (this.explosionHistory.length > this.maxExplosionHistory) {
            this.explosionHistory = this.explosionHistory.slice(-Math.floor(this.maxExplosionHistory * 0.8));
        }
    }

    getTopRunners(count = 20) {
        return Array.from(this.topRunners.values())
            .sort((a, b) => Math.abs(b.movePercent) - Math.abs(a.movePercent))
            .slice(0, count);
    }

    get15to20PercentMovers() {
        return Array.from(this.bigMovers15to20.values())
            .sort((a, b) => Math.abs(b.movePercent) - Math.abs(a.movePercent));
    }

    getGammaAccelerators(count = 10) {
        return Array.from(this.gammaAcceleration.values())
            .sort((a, b) => b.gammaScore - a.gammaScore)
            .slice(0, count);
    }

    getRollingMemory(count = 100) {
        return this.rollingMemory.slice(-count).reverse();
    }

    getRankedExplosions(count = 20) {
        return this.explosionHistory
            .sort((a, b) => b.rank - a.rank)
            .slice(0, count);
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
            topRunnersCount: this.topRunners.size,
            bigMovers15to20Count: this.bigMovers15to20.size,
            gammaAcceleratorsCount: this.gammaAcceleration.size,
            rollingMemorySize: this.rollingMemory.length,
            trackedTokens: this.priceSnapshots.size
        };
    }

    clearHistory() {
        this.explosionHistory = [];
        this.priceSnapshots.clear();
        this.oiSnapshots.clear();
        this.activeExplosions.clear();
        this.topRunners.clear();
        this.bigMovers15to20.clear();
        this.gammaAcceleration.clear();
        this.rollingMemory = [];
    }
}

module.exports = new ExplosionService();
