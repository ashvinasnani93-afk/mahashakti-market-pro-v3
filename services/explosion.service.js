class ExplosionService {
    constructor() {
        this.explosionHistory = [];
        this.priceSnapshots = new Map();
        this.thresholds = {
            earlyMovePercent: 1.5,
            accelerationMultiplier: 2,
            volumeAcceleration: 3,
            oiDeltaThreshold: 5
        };
    }

    recordPrice(token, price, volume, timestamp = Date.now()) {
        const snapshots = this.priceSnapshots.get(token) || [];
        
        snapshots.push({ price, volume, timestamp });
        
        if (snapshots.length > 100) {
            snapshots.shift();
        }
        
        this.priceSnapshots.set(token, snapshots);
    }

    detectExplosion(instrument, currentPrice, currentVolume, avgVolume, openInterest = null) {
        const token = instrument.token;
        const snapshots = this.priceSnapshots.get(token) || [];
        
        if (snapshots.length < 5) {
            return null;
        }

        const explosions = [];

        const earlyMove = this.detectEarlyIntradayMove(snapshots, currentPrice);
        if (earlyMove) explosions.push(earlyMove);

        const acceleration = this.detectPriceAcceleration(snapshots, currentPrice);
        if (acceleration) explosions.push(acceleration);

        const volumeAccel = this.detectVolumeAcceleration(snapshots, currentVolume, avgVolume);
        if (volumeAccel) explosions.push(volumeAccel);

        if (openInterest) {
            const oiExplosion = this.detectOIPriceCombo(snapshots, currentPrice, openInterest);
            if (oiExplosion) explosions.push(oiExplosion);
        }

        const optionAccel = this.detectOptionStrikeAcceleration(snapshots, currentPrice, instrument);
        if (optionAccel) explosions.push(optionAccel);

        if (explosions.length === 0) {
            return null;
        }

        const explosion = {
            instrument: {
                symbol: instrument.symbol,
                token: instrument.token,
                name: instrument.name
            },
            timestamp: Date.now(),
            price: currentPrice,
            types: explosions,
            severity: this.calculateSeverity(explosions),
            liquidityCheck: this.checkLiquidity(avgVolume, currentVolume)
        };

        this.recordExplosion(explosion);
        return explosion;
    }

    detectEarlyIntradayMove(snapshots, currentPrice) {
        const now = new Date();
        const marketOpen = new Date(now);
        marketOpen.setHours(9, 15, 0, 0);
        
        const timeSinceOpen = (now - marketOpen) / (1000 * 60);
        
        if (timeSinceOpen > 60 || timeSinceOpen < 0) {
            return null;
        }

        const openingSnapshots = snapshots.filter(s => {
            const snapTime = new Date(s.timestamp);
            return snapTime >= marketOpen;
        });

        if (openingSnapshots.length < 2) return null;

        const openPrice = openingSnapshots[0].price;
        const movePercent = ((currentPrice - openPrice) / openPrice) * 100;

        if (Math.abs(movePercent) >= this.thresholds.earlyMovePercent) {
            return {
                type: 'EARLY_INTRADAY_EXPANSION',
                movePercent: movePercent.toFixed(2),
                direction: movePercent > 0 ? 'UP' : 'DOWN',
                openPrice,
                currentPrice,
                minutesSinceOpen: Math.round(timeSinceOpen)
            };
        }

        return null;
    }

    detectPriceAcceleration(snapshots, currentPrice) {
        if (snapshots.length < 10) return null;

        const recent5 = snapshots.slice(-5);
        const prev5 = snapshots.slice(-10, -5);

        const recentMove = Math.abs(recent5[recent5.length - 1].price - recent5[0].price);
        const prevMove = Math.abs(prev5[prev5.length - 1].price - prev5[0].price);

        if (prevMove === 0) return null;

        const acceleration = recentMove / prevMove;

        if (acceleration >= this.thresholds.accelerationMultiplier) {
            const direction = recent5[recent5.length - 1].price > recent5[0].price ? 'UP' : 'DOWN';
            
            return {
                type: 'PRICE_ACCELERATION',
                accelerationRatio: acceleration.toFixed(2),
                direction,
                recentMove: recentMove.toFixed(2),
                prevMove: prevMove.toFixed(2)
            };
        }

        return null;
    }

    detectVolumeAcceleration(snapshots, currentVolume, avgVolume) {
        if (snapshots.length < 5) return null;

        const recentVolumes = snapshots.slice(-5).map(s => s.volume);
        const recentAvg = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;

        const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 0;
        const recentAcceleration = recentAvg > 0 ? currentVolume / recentAvg : 0;

        if (volumeRatio >= this.thresholds.volumeAcceleration) {
            return {
                type: 'VOLUME_EXPLOSION',
                volumeRatio: volumeRatio.toFixed(2),
                currentVolume,
                avgVolume,
                recentAcceleration: recentAcceleration.toFixed(2)
            };
        }

        return null;
    }

    detectOIPriceCombo(snapshots, currentPrice, openInterest) {
        if (!openInterest || !openInterest.current || !openInterest.previous) {
            return null;
        }

        const oiChange = openInterest.current - openInterest.previous;
        const oiChangePercent = (oiChange / openInterest.previous) * 100;

        const oldPrice = snapshots[0].price;
        const priceChangePercent = ((currentPrice - oldPrice) / oldPrice) * 100;

        const oiBullish = oiChangePercent > this.thresholds.oiDeltaThreshold && priceChangePercent > 0;
        const oiBearish = oiChangePercent > this.thresholds.oiDeltaThreshold && priceChangePercent < 0;
        const shortCovering = oiChangePercent < -this.thresholds.oiDeltaThreshold && priceChangePercent > 0;
        const longUnwinding = oiChangePercent < -this.thresholds.oiDeltaThreshold && priceChangePercent < 0;

        if (oiBullish || oiBearish || shortCovering || longUnwinding) {
            let interpretation = 'NEUTRAL';
            if (oiBullish) interpretation = 'LONG_BUILDUP';
            if (oiBearish) interpretation = 'SHORT_BUILDUP';
            if (shortCovering) interpretation = 'SHORT_COVERING';
            if (longUnwinding) interpretation = 'LONG_UNWINDING';

            return {
                type: 'OI_PRICE_COMBO',
                interpretation,
                oiChangePercent: oiChangePercent.toFixed(2),
                priceChangePercent: priceChangePercent.toFixed(2),
                oiCurrent: openInterest.current,
                oiPrevious: openInterest.previous
            };
        }

        return null;
    }

    detectOptionStrikeAcceleration(snapshots, currentPrice, instrument) {
        if (!instrument.symbol.includes('CE') && !instrument.symbol.includes('PE')) {
            return null;
        }

        if (snapshots.length < 10) return null;

        const recent = snapshots.slice(-5);
        const prev = snapshots.slice(-10, -5);

        const recentHigh = Math.max(...recent.map(s => s.price));
        const recentLow = Math.min(...recent.map(s => s.price));
        const prevHigh = Math.max(...prev.map(s => s.price));
        const prevLow = Math.min(...prev.map(s => s.price));

        const recentRange = recentHigh - recentLow;
        const prevRange = prevHigh - prevLow;

        if (prevRange === 0) return null;

        const rangeExpansion = recentRange / prevRange;

        if (rangeExpansion >= 2) {
            const isCall = instrument.symbol.includes('CE');
            const direction = currentPrice > recent[0].price ? 'UP' : 'DOWN';
            
            return {
                type: 'OPTION_STRIKE_ACCELERATION',
                optionType: isCall ? 'CALL' : 'PUT',
                rangeExpansion: rangeExpansion.toFixed(2),
                direction,
                recentRange: recentRange.toFixed(2),
                prevRange: prevRange.toFixed(2)
            };
        }

        return null;
    }

    checkLiquidity(avgVolume, currentVolume) {
        const liquidityScore = avgVolume > 100000 ? 'HIGH' : avgVolume > 50000 ? 'MEDIUM' : 'LOW';
        const tradeable = liquidityScore !== 'LOW';

        return {
            score: liquidityScore,
            tradeable,
            avgVolume,
            currentVolume
        };
    }

    calculateSeverity(explosions) {
        let score = 0;
        
        explosions.forEach(e => {
            switch (e.type) {
                case 'EARLY_INTRADAY_EXPANSION':
                    score += Math.abs(parseFloat(e.movePercent)) * 2;
                    break;
                case 'PRICE_ACCELERATION':
                    score += parseFloat(e.accelerationRatio);
                    break;
                case 'VOLUME_EXPLOSION':
                    score += parseFloat(e.volumeRatio);
                    break;
                case 'OI_PRICE_COMBO':
                    score += 3;
                    break;
                case 'OPTION_STRIKE_ACCELERATION':
                    score += parseFloat(e.rangeExpansion);
                    break;
            }
        });

        if (score >= 10) return 'CRITICAL';
        if (score >= 6) return 'HIGH';
        if (score >= 3) return 'MEDIUM';
        return 'LOW';
    }

    recordExplosion(explosion) {
        this.explosionHistory.push(explosion);
        
        if (this.explosionHistory.length > 500) {
            this.explosionHistory.shift();
        }
    }

    getExplosionHistory() {
        return this.explosionHistory.slice().reverse();
    }

    getRecentExplosions(minutes = 30) {
        const cutoff = Date.now() - (minutes * 60 * 1000);
        return this.explosionHistory
            .filter(e => e.timestamp >= cutoff)
            .reverse();
    }

    clearHistory() {
        this.explosionHistory = [];
        this.priceSnapshots.clear();
    }
}

module.exports = new ExplosionService();
