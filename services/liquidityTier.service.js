/**
 * LIQUIDITY TIER SERVICE
 * Classifies instruments by turnover/liquidity
 * Tier 3 (< 10Cr) = HARD BLOCK for breakouts
 */

const marketStateService = require('./marketState.service');

class LiquidityTierService {
    constructor() {
        this.state = {
            tiers: new Map(),           // token -> tier data
            tierCounts: { 1: 0, 2: 0, 3: 0 },
            lastUpdate: null
        };

        this.config = {
            updateIntervalMs: 30000,     // Update every 30 seconds
            tier1Threshold: 50,          // > 50 Cr = Tier 1
            tier2Threshold: 10,          // 10-50 Cr = Tier 2
            // < 10 Cr = Tier 3 (blocked)
            tier3BlockEnabled: true,
            minVolumeForSignal: 100000   // Minimum volume
        };

        this.turnoverHistory = new Map(); // token -> [{ timestamp, turnover }]
        this.updateInterval = null;

        console.log('[LIQUIDITY_TIER] Initializing liquidity tier engine...');
        console.log('[LIQUIDITY_TIER] Tier thresholds: T1 > 50Cr, T2 10-50Cr, T3 < 10Cr');
        console.log('[LIQUIDITY_TIER] Initialized');
    }

    /**
     * Start periodic tier calculation
     */
    start() {
        if (this.updateInterval) {
            console.log('[LIQUIDITY_TIER] Already running');
            return;
        }

        this.calculate();
        this.updateInterval = setInterval(() => {
            this.calculate();
        }, this.config.updateIntervalMs);

        console.log('[LIQUIDITY_TIER] Started - updating every 30 seconds');
    }

    /**
     * Stop tier calculation
     */
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('[LIQUIDITY_TIER] Stopped');
        }
    }

    /**
     * Calculate liquidity tiers for all instruments
     */
    calculate() {
        const allStates = marketStateService.getAllStates();
        
        this.state.tierCounts = { 1: 0, 2: 0, 3: 0 };

        for (const [token, state] of allStates) {
            if (!state || !state.ltp || !state.volume) continue;

            // Calculate turnover in Crores
            const turnover = (state.ltp * state.volume) / 10000000; // Convert to Cr

            // Determine tier
            let tier;
            let tierName;
            if (turnover >= this.config.tier1Threshold) {
                tier = 1;
                tierName = 'TIER_1_HIGH_LIQUIDITY';
            } else if (turnover >= this.config.tier2Threshold) {
                tier = 2;
                tierName = 'TIER_2_MEDIUM_LIQUIDITY';
            } else {
                tier = 3;
                tierName = 'TIER_3_LOW_LIQUIDITY';
            }

            this.state.tierCounts[tier]++;

            // Track turnover history
            const history = this.turnoverHistory.get(token) || [];
            history.push({ timestamp: Date.now(), turnover });
            if (history.length > 20) {
                history.shift();
            }
            this.turnoverHistory.set(token, history);

            // Calculate average turnover
            const avgTurnover = history.reduce((sum, h) => sum + h.turnover, 0) / history.length;

            const tierData = {
                token,
                symbol: state.symbol,
                tier,
                tierName,
                turnoverCr: Math.round(turnover * 100) / 100,
                avgTurnoverCr: Math.round(avgTurnover * 100) / 100,
                volume: state.volume,
                ltp: state.ltp,
                isBlocked: tier === 3 && this.config.tier3BlockEnabled,
                timestamp: Date.now()
            };

            this.state.tiers.set(token, tierData);
        }

        this.state.lastUpdate = Date.now();
    }

    /**
     * MAIN: Check if signal should be allowed based on liquidity
     * @param {string} token - Instrument token
     * @returns {object} { allowed: boolean, reason: string, tier: number }
     */
    checkSignal(token) {
        const tierData = this.state.tiers.get(token);
        
        if (!tierData) {
            return {
                allowed: true,
                reason: 'No liquidity data available',
                tier: null
            };
        }

        // Tier 3 block
        if (tierData.tier === 3 && this.config.tier3BlockEnabled) {
            return {
                allowed: false,
                reason: `LIQUIDITY_BLOCK: Tier 3 (${tierData.turnoverCr.toFixed(2)} Cr < ${this.config.tier2Threshold} Cr threshold)`,
                tier: 3,
                turnoverCr: tierData.turnoverCr,
                detail: tierData
            };
        }

        // Tier 2 - allowed but flagged
        if (tierData.tier === 2) {
            return {
                allowed: true,
                warning: true,
                reason: `Medium liquidity Tier 2 (${tierData.turnoverCr.toFixed(2)} Cr)`,
                tier: 2,
                turnoverCr: tierData.turnoverCr,
                recommendation: 'Consider reduced position size'
            };
        }

        // Tier 1 - full green
        return {
            allowed: true,
            reason: `High liquidity Tier 1 (${tierData.turnoverCr.toFixed(2)} Cr)`,
            tier: 1,
            turnoverCr: tierData.turnoverCr
        };
    }

    /**
     * Get tier for a specific token
     */
    getTier(token) {
        return this.state.tiers.get(token) || null;
    }

    /**
     * Get all Tier 1 instruments
     */
    getTier1Instruments() {
        return Array.from(this.state.tiers.values())
            .filter(t => t.tier === 1)
            .sort((a, b) => b.turnoverCr - a.turnoverCr);
    }

    /**
     * Get all Tier 2 instruments
     */
    getTier2Instruments() {
        return Array.from(this.state.tiers.values())
            .filter(t => t.tier === 2)
            .sort((a, b) => b.turnoverCr - a.turnoverCr);
    }

    /**
     * Get all blocked (Tier 3) instruments
     */
    getBlockedInstruments() {
        return Array.from(this.state.tiers.values())
            .filter(t => t.tier === 3 && t.isBlocked)
            .sort((a, b) => b.turnoverCr - a.turnoverCr);
    }

    /**
     * Get top liquid instruments
     */
    getTopLiquid(limit = 20) {
        return Array.from(this.state.tiers.values())
            .sort((a, b) => b.turnoverCr - a.turnoverCr)
            .slice(0, limit);
    }

    /**
     * Get liquidity snapshot
     */
    getSnapshot() {
        const tiers = Array.from(this.state.tiers.values());
        const totalTurnover = tiers.reduce((sum, t) => sum + t.turnoverCr, 0);

        return {
            totalTracked: tiers.length,
            tierCounts: this.state.tierCounts,
            tier1Count: this.state.tierCounts[1],
            tier2Count: this.state.tierCounts[2],
            tier3Count: this.state.tierCounts[3],
            blockedCount: tiers.filter(t => t.isBlocked).length,
            totalTurnoverCr: Math.round(totalTurnover * 100) / 100,
            avgTurnoverCr: tiers.length > 0 
                ? Math.round((totalTurnover / tiers.length) * 100) / 100 
                : 0,
            topLiquid: this.getTopLiquid(10),
            lastUpdate: this.state.lastUpdate,
            config: {
                tier1Threshold: this.config.tier1Threshold,
                tier2Threshold: this.config.tier2Threshold,
                tier3BlockEnabled: this.config.tier3BlockEnabled
            }
        };
    }

    /**
     * Get stats for API
     */
    getStats() {
        return this.getSnapshot();
    }

    /**
     * Update config
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('[LIQUIDITY_TIER] Config updated:', this.config);
    }
}

module.exports = new LiquidityTierService();
