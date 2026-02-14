/**
 * IV SKEW CURVE ENGINE
 * Tracks Call IV vs Put IV skew
 * Monitors skew acceleration for signal context
 */

const oiIntelligenceService = require('./oiIntelligence.service');

class IVSkewService {
    constructor() {
        this.state = {
            skewData: new Map(),         // underlying -> skew data
            lastUpdate: null
        };

        this.config = {
            extremeSkewThreshold: 30,    // 30% IV difference = extreme
            skewAccelerationThreshold: 10, // 10% change in skew
            updateIntervalMs: 30000
        };

        this.skewHistory = new Map();    // underlying -> skew history
        this.updateInterval = null;

        console.log('[IV_SKEW] Initializing IV skew engine...');
        console.log('[IV_SKEW] Initialized');
    }

    /**
     * Start skew tracking
     */
    start() {
        if (this.updateInterval) {
            console.log('[IV_SKEW] Already running');
            return;
        }

        this.calculate();
        this.updateInterval = setInterval(() => {
            this.calculate();
        }, this.config.updateIntervalMs);

        console.log('[IV_SKEW] Started - tracking every 30 seconds');
    }

    /**
     * Stop skew tracking
     */
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('[IV_SKEW] Stopped');
        }
    }

    /**
     * Calculate IV skew for all underlyings
     */
    calculate() {
        const underlyings = ['NIFTY', 'BANKNIFTY', 'FINNIFTY'];

        for (const underlying of underlyings) {
            const skew = this.calculateForUnderlying(underlying);
            if (skew) {
                this.state.skewData.set(underlying, skew);
            }
        }

        this.state.lastUpdate = Date.now();
    }

    /**
     * Calculate IV skew for specific underlying
     */
    calculateForUnderlying(underlying) {
        // This would get actual IV data from options chain
        // For now, using OI intelligence data as proxy
        const oiData = oiIntelligenceService.getOIData(underlying);
        if (!oiData) return null;

        // Simulate IV calculation from OI patterns
        // In production, this would use actual option IV data
        const callWeight = oiData.totalCallOI || 0;
        const putWeight = oiData.totalPutOI || 0;
        
        // Simulated IV values
        const baseIV = 15; // Base IV
        const callIV = baseIV + (putWeight > callWeight ? 2 : -1);
        const putIV = baseIV + (callWeight > putWeight ? 3 : -1);
        
        const skew = putIV - callIV; // Positive = put skew, Negative = call skew

        // Track history
        const history = this.skewHistory.get(underlying) || [];
        history.push({ timestamp: Date.now(), skew, callIV, putIV });
        if (history.length > 60) history.shift();
        this.skewHistory.set(underlying, history);

        // Calculate acceleration
        const acceleration = this.calculateAcceleration(history);

        return {
            underlying,
            callIV: Math.round(callIV * 100) / 100,
            putIV: Math.round(putIV * 100) / 100,
            skew: Math.round(skew * 100) / 100,
            skewType: this.classifySkew(skew),
            acceleration: Math.round(acceleration * 100) / 100,
            isExtreme: Math.abs(skew) >= this.config.extremeSkewThreshold,
            isAccelerating: Math.abs(acceleration) >= this.config.skewAccelerationThreshold,
            timestamp: Date.now()
        };
    }

    /**
     * Calculate skew acceleration
     */
    calculateAcceleration(history) {
        if (history.length < 10) return 0;

        const recentSkew = history.slice(-5).reduce((sum, h) => sum + h.skew, 0) / 5;
        const olderSkew = history.slice(-10, -5).reduce((sum, h) => sum + h.skew, 0) / 5;

        return recentSkew - olderSkew;
    }

    /**
     * Classify skew type
     */
    classifySkew(skew) {
        if (skew >= 5) return 'PUT_SKEW';
        if (skew <= -5) return 'CALL_SKEW';
        return 'NEUTRAL';
    }

    /**
     * MAIN: Check signal context from IV skew
     */
    checkSignalContext(underlying, signalType) {
        const skewData = this.state.skewData.get(underlying);

        if (!skewData) {
            return {
                hasContext: false,
                reason: 'No IV skew data available'
            };
        }

        // Extreme put skew + buy signal = confirmation (fear in market, good for contrarian buy)
        if (skewData.skewType === 'PUT_SKEW' && 
            (signalType === 'BUY' || signalType === 'STRONG_BUY')) {
            return {
                hasContext: true,
                supportive: true,
                reason: `Put skew ${skewData.skew.toFixed(1)} - Fear elevated, contrarian buy supported`,
                skewData
            };
        }

        // Extreme call skew + sell signal = confirmation
        if (skewData.skewType === 'CALL_SKEW' && 
            (signalType === 'SELL' || signalType === 'STRONG_SELL')) {
            return {
                hasContext: true,
                supportive: true,
                reason: `Call skew ${skewData.skew.toFixed(1)} - Complacency elevated, sell supported`,
                skewData
            };
        }

        // Accelerating skew = caution
        if (skewData.isAccelerating) {
            return {
                hasContext: true,
                supportive: false,
                reason: `Skew accelerating ${skewData.acceleration.toFixed(1)} - Market transitioning, caution advised`,
                skewData
            };
        }

        return {
            hasContext: true,
            supportive: null,
            reason: `Skew neutral ${skewData.skew.toFixed(1)}`,
            skewData
        };
    }

    /**
     * Get skew data for underlying
     */
    getSkew(underlying) {
        return this.state.skewData.get(underlying) || null;
    }

    /**
     * Get all skew data
     */
    getAllSkew() {
        return Object.fromEntries(this.state.skewData);
    }

    /**
     * Get stats
     */
    getStats() {
        return {
            underlyingsTracked: this.state.skewData.size,
            skewData: this.getAllSkew(),
            lastUpdate: this.state.lastUpdate,
            config: this.config
        };
    }
}

module.exports = new IVSkewService();
