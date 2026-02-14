/**
 * CIRCUIT BREAKER DETECTION SERVICE
 * Detects upper/lower circuit and near-freeze conditions
 * Blocks signals for circuit-hit stocks
 */

const marketStateService = require('./marketState.service');

class CircuitBreakerService {
    constructor() {
        this.state = {
            circuitHits: new Map(),      // token -> circuit data
            nearCircuit: new Map(),      // token -> near circuit warning
            lastUpdate: null
        };

        this.config = {
            upperCircuitThreshold: 19,   // 19% = upper circuit approaching
            lowerCircuitThreshold: -19,  // -19% = lower circuit approaching
            nearCircuitBuffer: 1,        // Within 1% of circuit = near freeze
            checkIntervalMs: 5000
        };

        // Standard NSE circuit limits by category
        this.circuitLimits = {
            INDEX: { upper: 20, lower: -20 },      // Indices
            LARGECAP: { upper: 20, lower: -20 },   // Large cap stocks
            MIDCAP: { upper: 20, lower: -20 },     // Mid cap
            SMALLCAP: { upper: 20, lower: -20 },   // Small cap (can be 5%, 10%, 20%)
            FNO: { upper: 20, lower: -20 }         // F&O stocks
        };

        this.checkInterval = null;

        console.log('[CIRCUIT_BREAKER] Initializing circuit breaker detection...');
        console.log('[CIRCUIT_BREAKER] Initialized');
    }

    /**
     * Start circuit monitoring
     */
    start() {
        if (this.checkInterval) {
            console.log('[CIRCUIT_BREAKER] Already running');
            return;
        }

        this.scan();
        this.checkInterval = setInterval(() => {
            this.scan();
        }, this.config.checkIntervalMs);

        console.log('[CIRCUIT_BREAKER] Started monitoring');
    }

    /**
     * Stop circuit monitoring
     */
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            console.log('[CIRCUIT_BREAKER] Stopped');
        }
    }

    /**
     * Scan all instruments for circuit conditions
     */
    scan() {
        const allStates = marketStateService.getAllStates();

        for (const [token, state] of allStates) {
            if (!state || !state.ltp || !state.prevClose) continue;

            const changePercent = ((state.ltp - state.prevClose) / state.prevClose) * 100;
            const circuitCheck = this.checkCircuit(token, state.symbol, changePercent);

            if (circuitCheck.isCircuit) {
                this.state.circuitHits.set(token, {
                    ...circuitCheck,
                    timestamp: Date.now()
                });
            } else {
                this.state.circuitHits.delete(token);
            }

            if (circuitCheck.isNearCircuit) {
                this.state.nearCircuit.set(token, {
                    ...circuitCheck,
                    timestamp: Date.now()
                });
            } else {
                this.state.nearCircuit.delete(token);
            }
        }

        this.state.lastUpdate = Date.now();
    }

    /**
     * Check circuit status for an instrument
     */
    checkCircuit(token, symbol, changePercent) {
        const limits = this.circuitLimits.FNO; // Default to F&O limits
        
        const distanceToUpper = limits.upper - changePercent;
        const distanceToLower = changePercent - limits.lower;

        const result = {
            token,
            symbol,
            changePercent: Math.round(changePercent * 100) / 100,
            upperLimit: limits.upper,
            lowerLimit: limits.lower,
            distanceToUpper: Math.round(distanceToUpper * 100) / 100,
            distanceToLower: Math.round(distanceToLower * 100) / 100,
            isCircuit: false,
            isNearCircuit: false,
            circuitType: null
        };

        // Check upper circuit
        if (changePercent >= limits.upper) {
            result.isCircuit = true;
            result.circuitType = 'UPPER_CIRCUIT';
        }
        // Check lower circuit
        else if (changePercent <= limits.lower) {
            result.isCircuit = true;
            result.circuitType = 'LOWER_CIRCUIT';
        }
        // Check near upper circuit
        else if (distanceToUpper <= this.config.nearCircuitBuffer) {
            result.isNearCircuit = true;
            result.circuitType = 'NEAR_UPPER';
        }
        // Check near lower circuit
        else if (distanceToLower <= this.config.nearCircuitBuffer) {
            result.isNearCircuit = true;
            result.circuitType = 'NEAR_LOWER';
        }

        return result;
    }

    /**
     * MAIN: Check if signal should be allowed
     * @param {string} token - Instrument token
     * @returns {object} { allowed: boolean, reason: string }
     */
    checkSignal(token) {
        const circuitHit = this.state.circuitHits.get(token);
        const nearCircuit = this.state.nearCircuit.get(token);

        if (circuitHit) {
            return {
                allowed: false,
                reason: `CIRCUIT_BLOCKED: ${circuitHit.circuitType} hit at ${circuitHit.changePercent}%`,
                circuitType: circuitHit.circuitType,
                changePercent: circuitHit.changePercent,
                detail: circuitHit
            };
        }

        if (nearCircuit) {
            return {
                allowed: false,
                reason: `CIRCUIT_BLOCKED: ${nearCircuit.circuitType} - Only ${nearCircuit.circuitType.includes('UPPER') ? nearCircuit.distanceToUpper : nearCircuit.distanceToLower}% from circuit`,
                circuitType: nearCircuit.circuitType,
                changePercent: nearCircuit.changePercent,
                detail: nearCircuit
            };
        }

        return {
            allowed: true,
            reason: 'No circuit conditions'
        };
    }

    /**
     * Get all circuit hits
     */
    getCircuitHits() {
        return Array.from(this.state.circuitHits.values());
    }

    /**
     * Get all near-circuit warnings
     */
    getNearCircuitWarnings() {
        return Array.from(this.state.nearCircuit.values());
    }

    /**
     * Check specific token for circuit
     */
    isCircuitHit(token) {
        return this.state.circuitHits.has(token);
    }

    /**
     * Check if near circuit
     */
    isNearCircuit(token) {
        return this.state.nearCircuit.has(token);
    }

    /**
     * Get stats
     */
    getStats() {
        return {
            circuitHitsCount: this.state.circuitHits.size,
            nearCircuitCount: this.state.nearCircuit.size,
            circuitHits: this.getCircuitHits(),
            nearCircuitWarnings: this.getNearCircuitWarnings(),
            lastUpdate: this.state.lastUpdate,
            config: this.config
        };
    }
}

module.exports = new CircuitBreakerService();
