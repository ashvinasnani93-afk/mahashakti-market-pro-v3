/**
 * RELATIVE STRENGTH SERVICE
 * Computes stock vs index relative strength
 * HARD BLOCK if stock underperforming index by >1%
 */

const marketStateService = require('./marketState.service');

class RelativeStrengthService {
    constructor() {
        this.state = {
            rsScores: new Map(),        // token -> RS data
            rsPercentiles: new Map(),   // token -> percentile rank
            lastUpdate: null
        };

        this.config = {
            updateIntervalMs: 5000,
            underperformThreshold: -1,   // Block if RS < -1%
            strongOutperformThreshold: 2, // Upgrade if RS > 2%
            lookbackCandles15m: 12,       // 3 hours of 15m candles
            lookbackCandles1h: 6          // 6 hours of 1h candles
        };

        // Index tokens for comparison
        this.indexTokens = {
            NIFTY: '99926000',
            BANKNIFTY: '99926009'
        };

        this.rsHistory = new Map();  // token -> [{ timestamp, rs }]
        this.updateInterval = null;

        console.log('[RELATIVE_STRENGTH] Initializing RS engine...');
        console.log('[RELATIVE_STRENGTH] Initialized');
    }

    /**
     * Start periodic RS calculation
     */
    start() {
        if (this.updateInterval) {
            console.log('[RELATIVE_STRENGTH] Already running');
            return;
        }

        this.calculate();
        this.updateInterval = setInterval(() => {
            this.calculate();
        }, this.config.updateIntervalMs);

        console.log('[RELATIVE_STRENGTH] Started - updating every 5 seconds');
    }

    /**
     * Stop RS calculation
     */
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('[RELATIVE_STRENGTH] Stopped');
        }
    }

    /**
     * Calculate RS for all tracked instruments
     */
    calculate() {
        const allStates = marketStateService.getAllStates();
        const niftyState = allStates.get(this.indexTokens.NIFTY);
        
        if (!niftyState || !niftyState.ltp || !niftyState.prevClose) {
            return;
        }

        const niftyChange = ((niftyState.ltp - niftyState.prevClose) / niftyState.prevClose) * 100;

        const rsScores = [];

        for (const [token, state] of allStates) {
            if (!state || !state.ltp || !state.prevClose) continue;
            if (token === this.indexTokens.NIFTY || token === this.indexTokens.BANKNIFTY) continue;

            const stockChange = ((state.ltp - state.prevClose) / state.prevClose) * 100;
            const rs = stockChange - niftyChange;

            // Calculate RS slope (rate of change)
            const history = this.rsHistory.get(token) || [];
            history.push({ timestamp: Date.now(), rs, stockChange, indexChange: niftyChange });
            
            // Keep last 60 readings (5 min of 5-sec updates)
            if (history.length > 60) {
                history.shift();
            }
            this.rsHistory.set(token, history);

            // Calculate slopes
            const rs15mSlope = this.calculateSlope(history, 12);  // ~1 min of data
            const rs1hSlope = this.calculateSlope(history, 60);   // ~5 min of data

            const rsData = {
                token,
                symbol: state.symbol,
                rs: Math.round(rs * 100) / 100,
                stockChange: Math.round(stockChange * 100) / 100,
                indexChange: Math.round(niftyChange * 100) / 100,
                rs15mSlope: Math.round(rs15mSlope * 100) / 100,
                rs1hSlope: Math.round(rs1hSlope * 100) / 100,
                trend: rs > 0 ? 'OUTPERFORM' : rs < 0 ? 'UNDERPERFORM' : 'INLINE',
                strength: Math.abs(rs) > 2 ? 'STRONG' : Math.abs(rs) > 1 ? 'MODERATE' : 'WEAK',
                timestamp: Date.now()
            };

            this.state.rsScores.set(token, rsData);
            rsScores.push(rsData);
        }

        // Calculate percentiles
        rsScores.sort((a, b) => b.rs - a.rs);
        rsScores.forEach((data, index) => {
            const percentile = ((rsScores.length - index) / rsScores.length) * 100;
            this.state.rsPercentiles.set(data.token, Math.round(percentile));
            data.percentile = Math.round(percentile);
        });

        this.state.lastUpdate = Date.now();
    }

    /**
     * Calculate slope from history
     */
    calculateSlope(history, lookback) {
        if (history.length < 2) return 0;
        
        const slice = history.slice(-Math.min(lookback, history.length));
        if (slice.length < 2) return 0;

        const first = slice[0].rs;
        const last = slice[slice.length - 1].rs;
        
        return last - first;
    }

    /**
     * MAIN: Check if signal should be allowed based on RS
     * @param {string} token - Instrument token
     * @param {string} signalType - 'BUY' or 'SELL'
     * @returns {object} { allowed: boolean, reason: string }
     */
    checkSignal(token, signalType) {
        const rsData = this.state.rsScores.get(token);
        
        if (!rsData) {
            return {
                allowed: true,
                reason: 'No RS data available',
                rsScore: null
            };
        }

        // For BUY signals, check if stock is underperforming
        if (signalType === 'BUY' || signalType === 'STRONG_BUY') {
            if (rsData.rs < this.config.underperformThreshold) {
                return {
                    allowed: false,
                    reason: `MTF_BLOCK_REASON: Stock underperforming index by ${Math.abs(rsData.rs).toFixed(2)}%`,
                    rsScore: rsData.rs,
                    percentile: rsData.percentile,
                    detail: rsData
                };
            }

            // Strong outperformance - can upgrade signal
            if (rsData.rs > this.config.strongOutperformThreshold) {
                return {
                    allowed: true,
                    adjustment: 'UPGRADE',
                    reason: `Strong RS ${rsData.rs.toFixed(2)}% - Can upgrade signal`,
                    rsScore: rsData.rs,
                    percentile: rsData.percentile
                };
            }
        }

        // For SELL signals, inverse logic
        if (signalType === 'SELL' || signalType === 'STRONG_SELL') {
            if (rsData.rs > -this.config.underperformThreshold) {
                // Stock strong - maybe not best short candidate
                return {
                    allowed: true,
                    adjustment: 'DOWNGRADE',
                    reason: `Stock showing strength RS=${rsData.rs.toFixed(2)}% - Consider downgrading short`,
                    rsScore: rsData.rs,
                    percentile: rsData.percentile
                };
            }
        }

        return {
            allowed: true,
            adjustment: 'NONE',
            reason: `RS ${rsData.rs.toFixed(2)}% within normal range`,
            rsScore: rsData.rs,
            percentile: rsData.percentile
        };
    }

    /**
     * Get RS for a specific token
     */
    getRS(token) {
        return this.state.rsScores.get(token) || null;
    }

    /**
     * Get top outperformers
     */
    getTopOutperformers(limit = 10) {
        const scores = Array.from(this.state.rsScores.values());
        return scores
            .filter(s => s.rs > 0)
            .sort((a, b) => b.rs - a.rs)
            .slice(0, limit);
    }

    /**
     * Get top underperformers
     */
    getTopUnderperformers(limit = 10) {
        const scores = Array.from(this.state.rsScores.values());
        return scores
            .filter(s => s.rs < 0)
            .sort((a, b) => a.rs - b.rs)
            .slice(0, limit);
    }

    /**
     * Get RS percentile for a token
     */
    getPercentile(token) {
        return this.state.rsPercentiles.get(token) || null;
    }

    /**
     * Get full RS snapshot
     */
    getSnapshot() {
        const scores = Array.from(this.state.rsScores.values());
        const outperforming = scores.filter(s => s.rs > 0).length;
        const underperforming = scores.filter(s => s.rs < 0).length;

        return {
            totalTracked: scores.length,
            outperforming,
            underperforming,
            avgRS: scores.length > 0 
                ? Math.round((scores.reduce((sum, s) => sum + s.rs, 0) / scores.length) * 100) / 100
                : 0,
            topOutperformers: this.getTopOutperformers(5),
            topUnderperformers: this.getTopUnderperformers(5),
            lastUpdate: this.state.lastUpdate,
            marketRSBias: outperforming > underperforming * 1.2 ? 'STRONG_MARKET'
                : underperforming > outperforming * 1.2 ? 'WEAK_MARKET'
                : 'NEUTRAL'
        };
    }

    /**
     * Get stats for API
     */
    getStats() {
        return this.getSnapshot();
    }
}

module.exports = new RelativeStrengthService();
