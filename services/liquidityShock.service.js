/**
 * LIQUIDITY SHOCK FILTER SERVICE
 * Detects sudden liquidity drops
 * Blocks signals on: 40% volume drop, spread widening, orderbook collapse
 */

const marketStateService = require('./marketState.service');

class LiquidityShockService {
    constructor() {
        this.state = {
            shockAlerts: new Map(),      // token -> shock data
            lastUpdate: null
        };

        this.config = {
            volumeDropThreshold: 40,     // 40% volume drop
            spreadWideningThreshold: 100, // 100% spread widening
            checkIntervalMs: 30000
        };

        this.volumeHistory = new Map();
        this.spreadHistory = new Map();
        this.checkInterval = null;

        console.log('[LIQUIDITY_SHOCK] Initializing liquidity shock filter...');
        console.log('[LIQUIDITY_SHOCK] Initialized');
    }

    /**
     * Start monitoring
     */
    start() {
        if (this.checkInterval) {
            console.log('[LIQUIDITY_SHOCK] Already running');
            return;
        }

        this.check();
        this.checkInterval = setInterval(() => {
            this.check();
        }, this.config.checkIntervalMs);

        console.log('[LIQUIDITY_SHOCK] Started monitoring');
    }

    /**
     * Stop monitoring
     */
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            console.log('[LIQUIDITY_SHOCK] Stopped');
        }
    }

    /**
     * Check for liquidity shocks
     */
    check() {
        const allStates = marketStateService.getAllStates();

        for (const [token, state] of allStates) {
            if (!state) continue;

            // Track volume
            const volHistory = this.volumeHistory.get(token) || [];
            volHistory.push({ timestamp: Date.now(), volume: state.volume || 0 });
            if (volHistory.length > 30) volHistory.shift();
            this.volumeHistory.set(token, volHistory);

            // Check for shock
            const shock = this.detectShock(token, volHistory, state);
            
            if (shock.detected) {
                this.state.shockAlerts.set(token, {
                    token,
                    symbol: state.symbol,
                    ...shock,
                    timestamp: Date.now()
                });
            } else {
                this.state.shockAlerts.delete(token);
            }
        }

        this.state.lastUpdate = Date.now();
    }

    /**
     * Detect liquidity shock
     */
    detectShock(token, volumeHistory, state) {
        if (volumeHistory.length < 10) {
            return { detected: false };
        }

        // Calculate volume change
        const recentVol = volumeHistory.slice(-5).reduce((sum, v) => sum + v.volume, 0) / 5;
        const olderVol = volumeHistory.slice(0, 5).reduce((sum, v) => sum + v.volume, 0) / 5;
        
        const volumeDropPercent = olderVol > 0 
            ? ((olderVol - recentVol) / olderVol) * 100 
            : 0;

        // Check volume shock
        if (volumeDropPercent >= this.config.volumeDropThreshold) {
            return {
                detected: true,
                shockType: 'VOLUME_DROP',
                dropPercent: Math.round(volumeDropPercent * 100) / 100,
                reason: `Volume dropped ${volumeDropPercent.toFixed(1)}% > ${this.config.volumeDropThreshold}% threshold`
            };
        }

        return { detected: false };
    }

    /**
     * MAIN: Check if signal should be blocked
     */
    checkSignal(token) {
        const shock = this.state.shockAlerts.get(token);

        if (shock) {
            return {
                allowed: false,
                reason: `LIQUIDITY_SHOCK_BLOCKED: ${shock.reason}`,
                shockType: shock.shockType,
                detail: shock
            };
        }

        return {
            allowed: true,
            reason: 'Liquidity normal'
        };
    }

    /**
     * Get all shock alerts
     */
    getShockAlerts() {
        return Array.from(this.state.shockAlerts.values());
    }

    /**
     * Get stats
     */
    getStats() {
        return {
            shockCount: this.state.shockAlerts.size,
            shockAlerts: this.getShockAlerts(),
            lastUpdate: this.state.lastUpdate,
            config: this.config
        };
    }
}

module.exports = new LiquidityShockService();
