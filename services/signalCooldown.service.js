const settings = require('../config/settings.config');

class SignalCooldownService {
    constructor() {
        this.signalHistory = new Map();
        this.cooldownMap = new Map();
        this.duplicateBlocked = new Map();
        this.noiseFilter = new Map();
        
        this.config = {
            cooldownMinutes: 15,
            maxSignalsPerToken: 3,
            noiseFilterWindow: 5,
            dedupeWindow: 60000
        };
    }

    initialize() {
        console.log('[SIGNAL_COOLDOWN] Initializing signal cooldown system...');
        this.loadConfig();
        
        setInterval(() => {
            this.cleanupExpired();
        }, 60000);
        
        console.log('[SIGNAL_COOLDOWN] Initialized with cooldown:', this.config.cooldownMinutes, 'minutes');
    }

    loadConfig() {
        const cooldownConfig = settings.cooldown || {};
        this.config = {
            ...this.config,
            ...cooldownConfig
        };
    }

    canEmitSignal(token, signalType, direction) {
        const key = `${token}_${signalType}_${direction}`;
        const now = Date.now();

        if (this.isInCooldown(key, now)) {
            this.duplicateBlocked.set(key, {
                blockedAt: now,
                reason: 'COOLDOWN_ACTIVE'
            });
            return { allowed: false, reason: 'COOLDOWN_ACTIVE', remainingMs: this.getRemainingCooldown(key, now) };
        }

        if (this.isDuplicate(key, now)) {
            this.duplicateBlocked.set(key, {
                blockedAt: now,
                reason: 'DUPLICATE_SIGNAL'
            });
            return { allowed: false, reason: 'DUPLICATE_SIGNAL', remainingMs: 0 };
        }

        if (this.isNoise(token, now)) {
            this.duplicateBlocked.set(key, {
                blockedAt: now,
                reason: 'NOISE_FILTERED'
            });
            return { allowed: false, reason: 'NOISE_FILTERED', remainingMs: 0 };
        }

        return { allowed: true, reason: null, remainingMs: 0 };
    }

    recordSignal(token, signalType, direction, signalData = {}) {
        const key = `${token}_${signalType}_${direction}`;
        const now = Date.now();

        const history = this.signalHistory.get(key) || [];
        history.push({
            timestamp: now,
            signalType,
            direction,
            ...signalData
        });

        if (history.length > 100) {
            history.shift();
        }

        this.signalHistory.set(key, history);

        const cooldownEnd = now + (this.config.cooldownMinutes * 60 * 1000);
        this.cooldownMap.set(key, cooldownEnd);

        this.recordNoiseData(token, now);

        return {
            recorded: true,
            cooldownEndsAt: new Date(cooldownEnd).toISOString(),
            historyCount: history.length
        };
    }

    isInCooldown(key, now) {
        const cooldownEnd = this.cooldownMap.get(key);
        if (!cooldownEnd) return false;
        return now < cooldownEnd;
    }

    getRemainingCooldown(key, now) {
        const cooldownEnd = this.cooldownMap.get(key);
        if (!cooldownEnd || now >= cooldownEnd) return 0;
        return cooldownEnd - now;
    }

    isDuplicate(key, now) {
        const history = this.signalHistory.get(key);
        if (!history || history.length === 0) return false;

        const lastSignal = history[history.length - 1];
        const timeSinceLast = now - lastSignal.timestamp;

        return timeSinceLast < this.config.dedupeWindow;
    }

    isNoise(token, now) {
        const noiseData = this.noiseFilter.get(token);
        if (!noiseData) return false;

        const windowMs = this.config.noiseFilterWindow * 60 * 1000;
        const recentSignals = noiseData.timestamps.filter(ts => now - ts < windowMs);

        return recentSignals.length >= this.config.maxSignalsPerToken;
    }

    recordNoiseData(token, timestamp) {
        const noiseData = this.noiseFilter.get(token) || { timestamps: [] };
        noiseData.timestamps.push(timestamp);

        const windowMs = this.config.noiseFilterWindow * 60 * 1000;
        noiseData.timestamps = noiseData.timestamps.filter(ts => timestamp - ts < windowMs);

        this.noiseFilter.set(token, noiseData);
    }

    clearCooldown(token, signalType = null, direction = null) {
        if (signalType && direction) {
            const key = `${token}_${signalType}_${direction}`;
            this.cooldownMap.delete(key);
            this.signalHistory.delete(key);
        } else {
            const keysToDelete = [];
            this.cooldownMap.forEach((_, key) => {
                if (key.startsWith(`${token}_`)) {
                    keysToDelete.push(key);
                }
            });
            keysToDelete.forEach(key => {
                this.cooldownMap.delete(key);
                this.signalHistory.delete(key);
            });
        }

        this.noiseFilter.delete(token);
    }

    cleanupExpired() {
        const now = Date.now();
        let cleaned = 0;

        this.cooldownMap.forEach((cooldownEnd, key) => {
            if (now >= cooldownEnd) {
                this.cooldownMap.delete(key);
                cleaned++;
            }
        });

        const historyMaxAge = 24 * 60 * 60 * 1000;
        this.signalHistory.forEach((history, key) => {
            const filtered = history.filter(h => now - h.timestamp < historyMaxAge);
            if (filtered.length === 0) {
                this.signalHistory.delete(key);
            } else if (filtered.length !== history.length) {
                this.signalHistory.set(key, filtered);
            }
        });

        const blockedMaxAge = 60 * 60 * 1000;
        this.duplicateBlocked.forEach((data, key) => {
            if (now - data.blockedAt > blockedMaxAge) {
                this.duplicateBlocked.delete(key);
            }
        });

        if (cleaned > 0) {
            console.log(`[SIGNAL_COOLDOWN] Cleaned ${cleaned} expired cooldowns`);
        }
    }

    getSignalHistory(token, signalType = null, direction = null) {
        if (signalType && direction) {
            const key = `${token}_${signalType}_${direction}`;
            return this.signalHistory.get(key) || [];
        }

        const allHistory = [];
        this.signalHistory.forEach((history, key) => {
            if (key.startsWith(`${token}_`)) {
                allHistory.push(...history);
            }
        });

        return allHistory.sort((a, b) => b.timestamp - a.timestamp);
    }

    getCooldownStatus(token) {
        const now = Date.now();
        const status = [];

        this.cooldownMap.forEach((cooldownEnd, key) => {
            if (key.startsWith(`${token}_`)) {
                const parts = key.split('_');
                status.push({
                    signalType: parts[1],
                    direction: parts[2],
                    cooldownEnd: new Date(cooldownEnd).toISOString(),
                    remainingMs: Math.max(0, cooldownEnd - now),
                    active: now < cooldownEnd
                });
            }
        });

        return status;
    }

    getBlockedSignals(count = 50) {
        return Array.from(this.duplicateBlocked.entries())
            .sort((a, b) => b[1].blockedAt - a[1].blockedAt)
            .slice(0, count)
            .map(([key, data]) => ({
                key,
                ...data,
                blockedAt: new Date(data.blockedAt).toISOString()
            }));
    }

    getStats() {
        const now = Date.now();
        let activeCooldowns = 0;
        
        this.cooldownMap.forEach((cooldownEnd) => {
            if (now < cooldownEnd) activeCooldowns++;
        });

        return {
            totalSignalsRecorded: this.signalHistory.size,
            activeCooldowns,
            blockedSignals: this.duplicateBlocked.size,
            noiseFilteredTokens: this.noiseFilter.size,
            config: this.config
        };
    }

    resetAll() {
        this.signalHistory.clear();
        this.cooldownMap.clear();
        this.duplicateBlocked.clear();
        this.noiseFilter.clear();
        console.log('[SIGNAL_COOLDOWN] All cooldowns reset');
    }
}

module.exports = new SignalCooldownService();
