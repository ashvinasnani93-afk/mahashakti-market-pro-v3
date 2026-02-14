/**
 * BREADTH SERVICE
 * Real Advance-Decline Breadth Engine
 * Tracks market-wide participation for signal validation
 */

const marketStateService = require('./marketState.service');

class BreadthService {
    constructor() {
        this.state = {
            advancers: 0,
            decliners: 0,
            unchanged: 0,
            totalTracked: 0,
            aboveVWAP: 0,
            belowVWAP: 0,
            breadthPercent: 50,
            vwapPercent: 50,
            sectorParticipation: new Map(),
            lastUpdate: null
        };

        this.config = {
            updateIntervalMs: 5000,
            weakBreadthThreshold: 35,    // Below this = downgrade longs
            strongBreadthThreshold: 70,  // Above this = upgrade
            sectors: ['BANKING', 'IT', 'PHARMA', 'AUTO', 'METAL', 'ENERGY', 'FMCG', 'REALTY', 'INFRA']
        };

        this.sectorStocks = new Map([
            ['BANKING', ['HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK', 'AXISBANK', 'INDUSINDBK', 'BANKBARODA', 'PNB']],
            ['IT', ['TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM', 'LTIM', 'MPHASIS', 'COFORGE']],
            ['PHARMA', ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'APOLLOHOSP', 'BIOCON', 'LUPIN']],
            ['AUTO', ['TATAMOTORS', 'MARUTI', 'M&M', 'BAJAJ-AUTO', 'HEROMOTOCO', 'EICHERMOT', 'ASHOKLEY']],
            ['METAL', ['TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'VEDL', 'COALINDIA', 'NMDC', 'SAIL']],
            ['ENERGY', ['RELIANCE', 'ONGC', 'BPCL', 'IOC', 'GAIL', 'NTPC', 'POWERGRID', 'ADANIGREEN']],
            ['FMCG', ['HINDUNILVR', 'ITC', 'NESTLEIND', 'BRITANNIA', 'DABUR', 'MARICO', 'COLPAL']],
            ['REALTY', ['DLF', 'GODREJPROP', 'OBEROIRLTY', 'PRESTIGE', 'SOBHA', 'BRIGADE']],
            ['INFRA', ['LT', 'ADANIENT', 'ADANIPORTS', 'SIEMENS', 'ABB', 'HAVELLS']]
        ]);

        this.updateInterval = null;

        console.log('[BREADTH] Initializing market breadth engine...');
        console.log('[BREADTH] Initialized');
    }

    /**
     * Start periodic breadth calculation
     */
    start() {
        if (this.updateInterval) {
            console.log('[BREADTH] Already running');
            return;
        }

        this.calculate();
        this.updateInterval = setInterval(() => {
            this.calculate();
        }, this.config.updateIntervalMs);

        console.log('[BREADTH] Started - updating every 5 seconds');
    }

    /**
     * Stop breadth calculation
     */
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('[BREADTH] Stopped');
        }
    }

    /**
     * Calculate market breadth from market state
     */
    calculate() {
        const allStates = marketStateService.getAllStates();
        
        let advancers = 0;
        let decliners = 0;
        let unchanged = 0;
        let aboveVWAP = 0;
        let belowVWAP = 0;
        let total = 0;

        // Reset sector tracking
        this.state.sectorParticipation = new Map();
        for (const sector of this.config.sectors) {
            this.state.sectorParticipation.set(sector, {
                advancers: 0,
                decliners: 0,
                total: 0,
                participation: 0
            });
        }

        for (const [token, state] of allStates) {
            if (!state || !state.ltp || !state.prevClose) continue;
            
            total++;
            const change = ((state.ltp - state.prevClose) / state.prevClose) * 100;

            // Advance/Decline
            if (change > 0.1) {
                advancers++;
            } else if (change < -0.1) {
                decliners++;
            } else {
                unchanged++;
            }

            // VWAP tracking
            if (state.vwap) {
                if (state.ltp > state.vwap) {
                    aboveVWAP++;
                } else {
                    belowVWAP++;
                }
            }

            // Sector tracking
            const symbol = state.symbol || '';
            for (const [sector, stocks] of this.sectorStocks) {
                if (stocks.includes(symbol)) {
                    const sectorData = this.state.sectorParticipation.get(sector);
                    sectorData.total++;
                    if (change > 0.1) {
                        sectorData.advancers++;
                    } else if (change < -0.1) {
                        sectorData.decliners++;
                    }
                    sectorData.participation = sectorData.total > 0 
                        ? (sectorData.advancers / sectorData.total) * 100 
                        : 0;
                }
            }
        }

        // Update state
        this.state.advancers = advancers;
        this.state.decliners = decliners;
        this.state.unchanged = unchanged;
        this.state.totalTracked = total;
        this.state.aboveVWAP = aboveVWAP;
        this.state.belowVWAP = belowVWAP;
        this.state.breadthPercent = total > 0 ? (advancers / total) * 100 : 50;
        this.state.vwapPercent = (aboveVWAP + belowVWAP) > 0 
            ? (aboveVWAP / (aboveVWAP + belowVWAP)) * 100 
            : 50;
        this.state.lastUpdate = Date.now();

        return this.state;
    }

    /**
     * MAIN: Check if breadth allows signal
     * @param {string} signalType - 'BUY' or 'SELL'
     * @returns {object} { allowed: boolean, adjustment: string, reason: string }
     */
    checkSignal(signalType) {
        const breadth = this.state.breadthPercent;

        // Weak breadth - downgrade longs
        if (breadth < this.config.weakBreadthThreshold) {
            if (signalType === 'BUY' || signalType === 'STRONG_BUY') {
                return {
                    allowed: true,
                    adjustment: 'DOWNGRADE',
                    reason: `Weak breadth ${breadth.toFixed(1)}% < ${this.config.weakBreadthThreshold}%`,
                    breadth,
                    action: 'STRONG_BUY → BUY, BUY → WEAK_BUY'
                };
            }
            // Short signals ok in weak breadth
            return {
                allowed: true,
                adjustment: 'UPGRADE',
                reason: `Weak breadth ${breadth.toFixed(1)}% favors shorts`,
                breadth
            };
        }

        // Strong breadth - upgrade longs
        if (breadth > this.config.strongBreadthThreshold) {
            if (signalType === 'BUY' || signalType === 'STRONG_BUY') {
                return {
                    allowed: true,
                    adjustment: 'UPGRADE',
                    reason: `Strong breadth ${breadth.toFixed(1)}% > ${this.config.strongBreadthThreshold}%`,
                    breadth,
                    action: 'BUY → STRONG_BUY'
                };
            }
            // Short signals downgraded in strong breadth
            return {
                allowed: true,
                adjustment: 'DOWNGRADE',
                reason: `Strong breadth ${breadth.toFixed(1)}% against shorts`,
                breadth
            };
        }

        // Neutral breadth
        return {
            allowed: true,
            adjustment: 'NONE',
            reason: `Neutral breadth ${breadth.toFixed(1)}%`,
            breadth
        };
    }

    /**
     * Get advance-decline ratio
     */
    getADRatio() {
        if (this.state.decliners === 0) return this.state.advancers;
        return this.state.advancers / this.state.decliners;
    }

    /**
     * Get sector breadth
     */
    getSectorBreadth(sector) {
        return this.state.sectorParticipation.get(sector) || null;
    }

    /**
     * Get leading sectors
     */
    getLeadingSectors() {
        const sectors = Array.from(this.state.sectorParticipation.entries())
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.participation - a.participation);

        return {
            leading: sectors.slice(0, 3),
            lagging: sectors.slice(-3).reverse()
        };
    }

    /**
     * Get full breadth snapshot
     */
    getSnapshot() {
        return {
            advancers: this.state.advancers,
            decliners: this.state.decliners,
            unchanged: this.state.unchanged,
            totalTracked: this.state.totalTracked,
            breadthPercent: Math.round(this.state.breadthPercent * 100) / 100,
            aboveVWAP: this.state.aboveVWAP,
            belowVWAP: this.state.belowVWAP,
            vwapPercent: Math.round(this.state.vwapPercent * 100) / 100,
            adRatio: Math.round(this.getADRatio() * 100) / 100,
            sectorParticipation: Object.fromEntries(this.state.sectorParticipation),
            leadingSectors: this.getLeadingSectors(),
            lastUpdate: this.state.lastUpdate,
            marketBias: this.state.breadthPercent > 55 ? 'BULLISH' 
                : this.state.breadthPercent < 45 ? 'BEARISH' 
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

module.exports = new BreadthService();
