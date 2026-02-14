/**
 * CORRELATION ENGINE SERVICE
 * Tracks rolling correlation between stock and index
 * High corr + divergence = Strong signal
 * Low corr = Ignore
 */

const marketStateService = require('./marketState.service');

class CorrelationEngineService {
    constructor() {
        this.state = {
            correlations: new Map(),     // token -> correlation data
            lastUpdate: null
        };

        this.config = {
            lookbackPeriod: 30,          // 30 data points for correlation
            highCorrelationThreshold: 0.7,
            lowCorrelationThreshold: 0.3,
            divergenceThreshold: 1,      // 1% divergence
            updateIntervalMs: 30000
        };

        this.priceHistory = new Map();   // token -> price history
        this.indexHistory = [];
        this.updateInterval = null;

        console.log('[CORRELATION_ENGINE] Initializing correlation engine...');
        console.log('[CORRELATION_ENGINE] Initialized');
    }

    /**
     * Start correlation tracking
     */
    start() {
        if (this.updateInterval) {
            console.log('[CORRELATION_ENGINE] Already running');
            return;
        }

        this.calculate();
        this.updateInterval = setInterval(() => {
            this.calculate();
        }, this.config.updateIntervalMs);

        console.log('[CORRELATION_ENGINE] Started - calculating every 30 seconds');
    }

    /**
     * Stop correlation tracking
     */
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('[CORRELATION_ENGINE] Stopped');
        }
    }

    /**
     * Calculate correlations for all tracked instruments
     */
    calculate() {
        // Get NIFTY price
        const niftyState = marketStateService.getState('99926000');
        if (!niftyState?.ltp) return;

        // Update index history
        this.indexHistory.push({
            timestamp: Date.now(),
            price: niftyState.ltp,
            change: niftyState.change || 0
        });
        if (this.indexHistory.length > 100) {
            this.indexHistory.shift();
        }

        // Calculate for all instruments
        const allStates = marketStateService.getAllStates();
        
        for (const [token, state] of allStates) {
            if (!state?.ltp || token === '99926000') continue;

            // Update price history
            const history = this.priceHistory.get(token) || [];
            history.push({
                timestamp: Date.now(),
                price: state.ltp,
                change: state.change || 0
            });
            if (history.length > 100) {
                history.shift();
            }
            this.priceHistory.set(token, history);

            // Calculate correlation if enough data
            if (history.length >= this.config.lookbackPeriod && 
                this.indexHistory.length >= this.config.lookbackPeriod) {
                
                const correlation = this.calculateCorrelation(
                    history.slice(-this.config.lookbackPeriod),
                    this.indexHistory.slice(-this.config.lookbackPeriod)
                );

                const divergence = this.calculateDivergence(
                    history.slice(-5),
                    this.indexHistory.slice(-5)
                );

                this.state.correlations.set(token, {
                    token,
                    symbol: state.symbol,
                    correlation: Math.round(correlation * 1000) / 1000,
                    divergence: Math.round(divergence * 100) / 100,
                    correlationType: this.classifyCorrelation(correlation),
                    signalStrength: this.calculateSignalStrength(correlation, divergence),
                    timestamp: Date.now()
                });
            }
        }

        this.state.lastUpdate = Date.now();
    }

    /**
     * Calculate Pearson correlation coefficient
     */
    calculateCorrelation(stockHistory, indexHistory) {
        if (stockHistory.length !== indexHistory.length || stockHistory.length < 2) {
            return 0;
        }

        // Get returns
        const stockReturns = [];
        const indexReturns = [];

        for (let i = 1; i < stockHistory.length; i++) {
            stockReturns.push((stockHistory[i].price - stockHistory[i-1].price) / stockHistory[i-1].price);
            indexReturns.push((indexHistory[i].price - indexHistory[i-1].price) / indexHistory[i-1].price);
        }

        // Calculate means
        const stockMean = stockReturns.reduce((a, b) => a + b, 0) / stockReturns.length;
        const indexMean = indexReturns.reduce((a, b) => a + b, 0) / indexReturns.length;

        // Calculate correlation
        let numerator = 0;
        let stockVariance = 0;
        let indexVariance = 0;

        for (let i = 0; i < stockReturns.length; i++) {
            const stockDev = stockReturns[i] - stockMean;
            const indexDev = indexReturns[i] - indexMean;
            numerator += stockDev * indexDev;
            stockVariance += stockDev * stockDev;
            indexVariance += indexDev * indexDev;
        }

        const denominator = Math.sqrt(stockVariance * indexVariance);
        
        if (denominator === 0) return 0;
        return numerator / denominator;
    }

    /**
     * Calculate divergence (stock return - index return)
     */
    calculateDivergence(stockHistory, indexHistory) {
        if (stockHistory.length < 2 || indexHistory.length < 2) return 0;

        const stockReturn = ((stockHistory[stockHistory.length - 1].price - stockHistory[0].price) / stockHistory[0].price) * 100;
        const indexReturn = ((indexHistory[indexHistory.length - 1].price - indexHistory[0].price) / indexHistory[0].price) * 100;

        return stockReturn - indexReturn;
    }

    /**
     * Classify correlation level
     */
    classifyCorrelation(correlation) {
        const absCorr = Math.abs(correlation);
        if (absCorr >= this.config.highCorrelationThreshold) {
            return correlation > 0 ? 'HIGH_POSITIVE' : 'HIGH_NEGATIVE';
        }
        if (absCorr <= this.config.lowCorrelationThreshold) {
            return 'LOW';
        }
        return correlation > 0 ? 'MODERATE_POSITIVE' : 'MODERATE_NEGATIVE';
    }

    /**
     * Calculate signal strength from correlation and divergence
     */
    calculateSignalStrength(correlation, divergence) {
        // High correlation + significant divergence = Strong signal
        if (correlation >= this.config.highCorrelationThreshold && 
            Math.abs(divergence) >= this.config.divergenceThreshold) {
            return 'STRONG';
        }

        // Low correlation = Weak/Ignore
        if (correlation <= this.config.lowCorrelationThreshold) {
            return 'WEAK';
        }

        // Moderate correlation
        if (Math.abs(divergence) >= this.config.divergenceThreshold) {
            return 'MODERATE';
        }

        return 'NEUTRAL';
    }

    /**
     * MAIN: Check if signal should be considered based on correlation
     * @param {string} token - Instrument token
     * @returns {object} { consider: boolean, strength: string, reason: string }
     */
    checkSignal(token) {
        const corrData = this.state.correlations.get(token);

        if (!corrData) {
            return {
                consider: true,
                reason: 'No correlation data available',
                strength: 'UNKNOWN'
            };
        }

        // Low correlation - ignore signal
        if (corrData.correlationType === 'LOW') {
            return {
                consider: false,
                reason: `CORRELATION_IGNORE: Low correlation (${corrData.correlation.toFixed(2)}) - Stock moves independently`,
                correlation: corrData.correlation,
                strength: 'WEAK'
            };
        }

        // High correlation + divergence - strong signal
        if (corrData.signalStrength === 'STRONG') {
            return {
                consider: true,
                upgrade: true,
                reason: `CORRELATION_STRONG: High correlation (${corrData.correlation.toFixed(2)}) with ${corrData.divergence.toFixed(2)}% divergence`,
                correlation: corrData.correlation,
                divergence: corrData.divergence,
                strength: 'STRONG'
            };
        }

        return {
            consider: true,
            correlation: corrData.correlation,
            divergence: corrData.divergence,
            strength: corrData.signalStrength
        };
    }

    /**
     * Get correlation for a specific token
     */
    getCorrelation(token) {
        return this.state.correlations.get(token) || null;
    }

    /**
     * Get top correlators
     */
    getTopCorrelators(limit = 10) {
        return Array.from(this.state.correlations.values())
            .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
            .slice(0, limit);
    }

    /**
     * Get top divergers
     */
    getTopDivergers(limit = 10) {
        return Array.from(this.state.correlations.values())
            .sort((a, b) => Math.abs(b.divergence) - Math.abs(a.divergence))
            .slice(0, limit);
    }

    /**
     * Get stats
     */
    getStats() {
        const correlations = Array.from(this.state.correlations.values());
        const highCorr = correlations.filter(c => c.correlationType.includes('HIGH')).length;
        const lowCorr = correlations.filter(c => c.correlationType === 'LOW').length;

        return {
            trackedInstruments: correlations.length,
            highCorrelationCount: highCorr,
            lowCorrelationCount: lowCorr,
            topCorrelators: this.getTopCorrelators(5),
            topDivergers: this.getTopDivergers(5),
            lastUpdate: this.state.lastUpdate,
            config: this.config
        };
    }
}

module.exports = new CorrelationEngineService();
