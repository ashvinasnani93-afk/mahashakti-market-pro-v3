const settings = require('../config/settings.config');

class PremiumMomentumService {
    constructor() {
        this.premiumData = new Map();
        this.explosionCandidates = new Map();
        this.momentumHistory = new Map();
        this.bigMovers = new Map();
    }

    recordPremium(token, data) {
        const existing = this.premiumData.get(token);
        const now = Date.now();

        if (!existing) {
            this.premiumData.set(token, {
                token,
                symbol: data.symbol,
                optionType: data.optionType,
                strikePrice: data.strikePrice,
                openingPremium: data.premium,
                currentPremium: data.premium,
                highPremium: data.premium,
                lowPremium: data.premium,
                openingVolume: data.volume || 0,
                currentVolume: data.volume || 0,
                openingOI: data.oi || 0,
                currentOI: data.oi || 0,
                history: [{
                    premium: data.premium,
                    volume: data.volume || 0,
                    oi: data.oi || 0,
                    timestamp: now
                }],
                firstRecordTime: now,
                lastUpdateTime: now
            });
            return;
        }

        existing.currentPremium = data.premium;
        existing.currentVolume = data.volume || existing.currentVolume;
        existing.currentOI = data.oi || existing.currentOI;
        existing.highPremium = Math.max(existing.highPremium, data.premium);
        existing.lowPremium = Math.min(existing.lowPremium, data.premium);
        existing.lastUpdateTime = now;

        existing.history.push({
            premium: data.premium,
            volume: data.volume || 0,
            oi: data.oi || 0,
            timestamp: now
        });

        if (existing.history.length > 200) {
            existing.history.shift();
        }

        this.premiumData.set(token, existing);

        this.checkForExplosion(token, existing);
    }

    calculateDeltas(token) {
        const data = this.premiumData.get(token);
        if (!data || data.history.length < 2) {
            return null;
        }

        const now = Date.now();
        const history = data.history;
        const current = history[history.length - 1];

        const delta5m = this.calculateDeltaForPeriod(history, 5 * 60 * 1000);
        const delta15m = this.calculateDeltaForPeriod(history, 15 * 60 * 1000);
        const deltaFromOpen = this.calculateDeltaFromOpen(data);

        const volumeChange = this.calculateVolumeChange(data);
        const oiChange = this.calculateOIChange(data);
        const accelerationScore = this.calculateAccelerationScore(delta5m, delta15m, volumeChange, oiChange);

        return {
            token,
            symbol: data.symbol,
            currentPremium: data.currentPremium,
            openingPremium: data.openingPremium,
            delta5mPercent: delta5m,
            delta15mPercent: delta15m,
            deltaFromOpenPercent: deltaFromOpen,
            volumeChangePercent: volumeChange,
            oiChangePercent: oiChange,
            accelerationScore,
            highPremium: data.highPremium,
            lowPremium: data.lowPremium,
            range: data.highPremium - data.lowPremium,
            rangePercent: data.openingPremium > 0 ? ((data.highPremium - data.lowPremium) / data.openingPremium) * 100 : 0,
            timestamp: now
        };
    }

    calculateDeltaForPeriod(history, periodMs) {
        if (history.length < 2) return 0;

        const now = Date.now();
        const cutoff = now - periodMs;

        const oldEntry = history.find(h => h.timestamp <= cutoff) || history[0];
        const currentEntry = history[history.length - 1];

        if (oldEntry.premium === 0) return 0;
        return ((currentEntry.premium - oldEntry.premium) / oldEntry.premium) * 100;
    }

    calculateDeltaFromOpen(data) {
        if (data.openingPremium === 0) return 0;
        return ((data.currentPremium - data.openingPremium) / data.openingPremium) * 100;
    }

    calculateVolumeChange(data) {
        if (data.openingVolume === 0) return 0;
        return ((data.currentVolume - data.openingVolume) / data.openingVolume) * 100;
    }

    calculateOIChange(data) {
        if (data.openingOI === 0) return 0;
        return ((data.currentOI - data.openingOI) / data.openingOI) * 100;
    }

    calculateAccelerationScore(delta5m, delta15m, volumeChange, oiChange) {
        let score = 0;

        if (Math.abs(delta5m) >= 5) score += 20;
        else if (Math.abs(delta5m) >= 3) score += 10;

        if (Math.abs(delta15m) >= 12) score += 25;
        else if (Math.abs(delta15m) >= 8) score += 15;
        else if (Math.abs(delta15m) >= 5) score += 10;

        if (volumeChange >= 200) score += 20;
        else if (volumeChange >= 100) score += 15;
        else if (volumeChange >= 50) score += 10;

        if (oiChange >= 20) score += 15;
        else if (oiChange >= 10) score += 10;
        else if (oiChange >= 5) score += 5;

        if (delta5m > 0 && delta15m > 0) score += 10;
        if (delta5m < 0 && delta15m < 0) score += 10;

        if (delta5m > delta15m / 3 && delta5m > 0) score += 10;
        if (delta5m < delta15m / 3 && delta5m < 0) score += 10;

        return Math.min(100, score);
    }

    checkForExplosion(token, data) {
        const deltas = this.calculateDeltas(token);
        if (!deltas) return;

        const config = settings.premiumMomentum || {};
        const delta5mThreshold = config.delta5mThreshold || 5;
        const delta15mThreshold = config.delta15mThreshold || 12;
        const volumeThreshold = config.volumeThreshold || 200;

        const isExplosionCandidate = (
            Math.abs(deltas.delta5mPercent) >= delta5mThreshold &&
            Math.abs(deltas.delta15mPercent) >= delta15mThreshold &&
            deltas.volumeChangePercent >= volumeThreshold
        );

        if (isExplosionCandidate) {
            this.explosionCandidates.set(token, {
                ...deltas,
                detectedAt: Date.now(),
                direction: deltas.delta5mPercent > 0 ? 'UP' : 'DOWN'
            });
            console.log(`[PREMIUM_MOMENTUM] Explosion candidate: ${data.symbol} | 5m: ${deltas.delta5mPercent.toFixed(2)}% | 15m: ${deltas.delta15mPercent.toFixed(2)}%`);
        } else {
            this.explosionCandidates.delete(token);
        }

        if (Math.abs(deltas.deltaFromOpenPercent) >= 15) {
            this.bigMovers.set(token, {
                ...deltas,
                detectedAt: Date.now()
            });
        }

        if (Math.abs(deltas.deltaFromOpenPercent) >= 20) {
            console.log(`[PREMIUM_MOMENTUM] BIG MOVER: ${data.symbol} | Move: ${deltas.deltaFromOpenPercent.toFixed(2)}%`);
        }
    }

    getExplosionCandidates() {
        return Array.from(this.explosionCandidates.values())
            .sort((a, b) => b.accelerationScore - a.accelerationScore);
    }

    getBigMovers(minMovePercent = 15) {
        return Array.from(this.bigMovers.values())
            .filter(m => Math.abs(m.deltaFromOpenPercent) >= minMovePercent)
            .sort((a, b) => Math.abs(b.deltaFromOpenPercent) - Math.abs(a.deltaFromOpenPercent));
    }

    getTopRunners(count = 20) {
        const allDeltas = [];
        
        this.premiumData.forEach((data, token) => {
            const deltas = this.calculateDeltas(token);
            if (deltas) {
                allDeltas.push(deltas);
            }
        });

        return allDeltas
            .sort((a, b) => b.accelerationScore - a.accelerationScore)
            .slice(0, count);
    }

    getGammaAcceleration() {
        const candidates = [];

        this.premiumData.forEach((data, token) => {
            const deltas = this.calculateDeltas(token);
            if (!deltas) return;

            if (deltas.delta5mPercent > deltas.delta15mPercent / 2 && deltas.delta5mPercent > 3) {
                candidates.push({
                    ...deltas,
                    gammaScore: deltas.delta5mPercent / (deltas.delta15mPercent / 3 || 1)
                });
            }
        });

        return candidates.sort((a, b) => b.gammaScore - a.gammaScore).slice(0, 10);
    }

    getPremiumData(token) {
        return this.premiumData.get(token);
    }

    getAllPremiumData() {
        return Array.from(this.premiumData.values());
    }

    getPremiumRange(minPremium = 3, maxPremium = 650) {
        return Array.from(this.premiumData.values())
            .filter(d => d.currentPremium >= minPremium && d.currentPremium <= maxPremium)
            .sort((a, b) => {
                const deltasA = this.calculateDeltas(a.token);
                const deltasB = this.calculateDeltas(b.token);
                return (deltasB?.accelerationScore || 0) - (deltasA?.accelerationScore || 0);
            });
    }

    getStatus() {
        return {
            trackedTokens: this.premiumData.size,
            explosionCandidates: this.explosionCandidates.size,
            bigMovers: this.bigMovers.size
        };
    }

    clearData() {
        this.premiumData.clear();
        this.explosionCandidates.clear();
        this.momentumHistory.clear();
        this.bigMovers.clear();
    }

    resetDaily() {
        this.premiumData.forEach((data, token) => {
            data.openingPremium = data.currentPremium;
            data.openingVolume = data.currentVolume;
            data.openingOI = data.currentOI;
            data.highPremium = data.currentPremium;
            data.lowPremium = data.currentPremium;
            data.history = [{
                premium: data.currentPremium,
                volume: data.currentVolume,
                oi: data.currentOI,
                timestamp: Date.now()
            }];
            data.firstRecordTime = Date.now();
        });

        this.explosionCandidates.clear();
        this.bigMovers.clear();
        console.log('[PREMIUM_MOMENTUM] Daily reset complete');
    }
}

module.exports = new PremiumMomentumService();
