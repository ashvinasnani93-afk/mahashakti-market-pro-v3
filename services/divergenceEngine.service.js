/**
 * UNDERLYING-OPTION DIVERGENCE SERVICE
 * Detects when underlying is flat but premium moving
 * Identifies IV/gamma/theta traps
 */

const marketStateService = require('./marketState.service');

class DivergenceEngineService {
    constructor() {
        this.state = {
            divergences: new Map(),      // optionToken -> divergence data
            lastUpdate: null
        };

        this.config = {
            flatUnderlyingThreshold: 0.1, // < 0.1% move = flat
            significantPremiumMove: 5,    // > 5% premium move = significant
            updateIntervalMs: 30000
        };

        this.underlyingHistory = new Map();
        this.premiumHistory = new Map();

        console.log('[DIVERGENCE_ENGINE] Initializing divergence detection...');
        console.log('[DIVERGENCE_ENGINE] Initialized');
    }

    /**
     * Register underlying and premium for divergence tracking
     */
    registerPair(optionToken, optionSymbol, underlyingToken, premiumPrice, underlyingPrice) {
        // Track underlying history
        const underlyingHist = this.underlyingHistory.get(underlyingToken) || [];
        underlyingHist.push({ timestamp: Date.now(), price: underlyingPrice });
        if (underlyingHist.length > 30) underlyingHist.shift();
        this.underlyingHistory.set(underlyingToken, underlyingHist);

        // Track premium history
        const premiumHist = this.premiumHistory.get(optionToken) || [];
        premiumHist.push({ timestamp: Date.now(), price: premiumPrice });
        if (premiumHist.length > 30) premiumHist.shift();
        this.premiumHistory.set(optionToken, premiumHist);

        // Check for divergence
        const divergence = this.detectDivergence(
            optionToken, 
            optionSymbol,
            underlyingHist, 
            premiumHist
        );

        if (divergence.detected) {
            this.state.divergences.set(optionToken, divergence);
        } else {
            this.state.divergences.delete(optionToken);
        }

        this.state.lastUpdate = Date.now();
        return divergence;
    }

    /**
     * Detect divergence between underlying and premium
     */
    detectDivergence(optionToken, optionSymbol, underlyingHistory, premiumHistory) {
        if (underlyingHistory.length < 5 || premiumHistory.length < 5) {
            return { detected: false, reason: 'Insufficient history' };
        }

        // Calculate underlying move
        const underlyingOld = underlyingHistory[0].price;
        const underlyingNew = underlyingHistory[underlyingHistory.length - 1].price;
        const underlyingMove = Math.abs((underlyingNew - underlyingOld) / underlyingOld) * 100;

        // Calculate premium move
        const premiumOld = premiumHistory[0].price;
        const premiumNew = premiumHistory[premiumHistory.length - 1].price;
        const premiumMove = ((premiumNew - premiumOld) / premiumOld) * 100;

        // Check for divergence: flat underlying + moving premium
        if (underlyingMove < this.config.flatUnderlyingThreshold &&
            Math.abs(premiumMove) >= this.config.significantPremiumMove) {
            
            const divergenceType = this.classifyDivergence(premiumMove);

            return {
                detected: true,
                optionToken,
                optionSymbol,
                underlyingMove: Math.round(underlyingMove * 100) / 100,
                premiumMove: Math.round(premiumMove * 100) / 100,
                divergenceType,
                trapRisk: this.assessTrapRisk(premiumMove, divergenceType),
                timestamp: Date.now()
            };
        }

        return { 
            detected: false,
            underlyingMove: Math.round(underlyingMove * 100) / 100,
            premiumMove: Math.round(premiumMove * 100) / 100
        };
    }

    /**
     * Classify divergence type
     */
    classifyDivergence(premiumMove) {
        if (premiumMove > 10) {
            return 'IV_SURGE'; // Premium up without underlying move = IV expansion
        }
        if (premiumMove < -10) {
            return 'THETA_CRUSH'; // Premium down without underlying move = Theta decay
        }
        if (premiumMove > 0) {
            return 'GAMMA_PUMP'; // Moderate premium rise = Gamma effect
        }
        return 'TIME_DECAY'; // Moderate premium drop = Normal decay
    }

    /**
     * Assess trap risk
     */
    assessTrapRisk(premiumMove, divergenceType) {
        if (divergenceType === 'IV_SURGE' && premiumMove > 15) {
            return {
                level: 'HIGH',
                warning: 'IV TRAP: Premium inflated without underlying support. Risk of crush on IV normalization.'
            };
        }

        if (divergenceType === 'GAMMA_PUMP' && premiumMove > 8) {
            return {
                level: 'MODERATE',
                warning: 'GAMMA TRAP: Premium rising on gamma. Risk of rapid decay if move doesn\'t follow.'
            };
        }

        if (divergenceType === 'THETA_CRUSH') {
            return {
                level: 'LOW',
                warning: 'Expected theta decay. Normal for time-based premium erosion.'
            };
        }

        return { level: 'LOW', warning: null };
    }

    /**
     * MAIN: Check if option signal has divergence risk
     */
    checkSignal(optionToken) {
        const divergence = this.state.divergences.get(optionToken);

        if (!divergence) {
            return {
                hasDivergence: false,
                reason: 'No divergence detected'
            };
        }

        // IV surge on buy = trap risk
        if (divergence.divergenceType === 'IV_SURGE') {
            return {
                hasDivergence: true,
                blocked: true,
                reason: `DIVERGENCE_TRAP_BLOCKED: ${divergence.divergenceType} - Premium +${divergence.premiumMove.toFixed(1)}% with flat underlying`,
                trapRisk: divergence.trapRisk,
                detail: divergence
            };
        }

        return {
            hasDivergence: true,
            blocked: false,
            reason: `${divergence.divergenceType} detected - ${divergence.trapRisk.level} risk`,
            trapRisk: divergence.trapRisk,
            detail: divergence
        };
    }

    /**
     * Get all divergences
     */
    getAllDivergences() {
        return Array.from(this.state.divergences.values());
    }

    /**
     * Get stats
     */
    getStats() {
        const divergences = this.getAllDivergences();
        const ivSurge = divergences.filter(d => d.divergenceType === 'IV_SURGE').length;
        const thetaCrush = divergences.filter(d => d.divergenceType === 'THETA_CRUSH').length;
        const gammaPump = divergences.filter(d => d.divergenceType === 'GAMMA_PUMP').length;

        return {
            totalDivergences: divergences.length,
            byType: { ivSurge, thetaCrush, gammaPump },
            divergences,
            lastUpdate: this.state.lastUpdate,
            config: this.config
        };
    }
}

module.exports = new DivergenceEngineService();
