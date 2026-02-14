const wsService = require('./websocket.service');
const universeLoader = require('./universeLoader.service');
const indicatorService = require('./indicator.service');

class CrossMarketContextService {
    constructor() {
        // Index data
        this.indexData = new Map();        // indexName -> { price, change, trend, strength }
        this.indexHistory = new Map();     // indexName -> [{ price, timestamp }]
        
        // Sector data
        this.sectorData = new Map();       // sector -> { avgChange, leadership, stocks }
        this.sectorRanking = [];           // sorted array of sectors
        
        // Context weights
        this.contextWeight = 0.20;         // Max 20% influence
        
        // Configuration
        this.config = {
            indices: {
                'NIFTY': { token: '99926000', weight: 0.5 },
                'BANKNIFTY': { token: '99926009', weight: 0.3 },
                'FINNIFTY': { token: '99926037', weight: 0.15 },
                'MIDCPNIFTY': { token: '99926074', weight: 0.05 }
            },
            historySize: 100,
            sectorLeadershipThreshold: 60,  // percentile
            trendStrengthThreshold: 0.5,    // % move for trend confirmation
            updateIntervalMs: 30000
        };
        
        // Market context state
        this.marketBias = 'NEUTRAL';       // BULLISH, BEARISH, NEUTRAL
        this.marketStrength = 0;           // -100 to +100
        this.lastUpdate = null;
        
        this.updateInterval = null;
    }

    initialize() {
        console.log('[CROSS_MARKET] Initializing Cross-Market Context Engine...');
        
        // Subscribe to index price updates
        wsService.onPrice((data) => {
            this.processIndexUpdate(data);
        });
        
        // Periodic sector calculation
        this.startPeriodicUpdates();
        
        console.log('[CROSS_MARKET] Initialized');
    }

    startPeriodicUpdates() {
        if (this.updateInterval) return;
        
        this.updateInterval = setInterval(() => {
            this.calculateSectorLeadership();
            this.calculateMarketBias();
        }, this.config.updateIntervalMs);
    }

    // 🔴 PROCESS INDEX PRICE UPDATES
    processIndexUpdate(data) {
        const { token, ltp, timestamp } = data;
        
        // Find which index this is
        for (const [indexName, config] of Object.entries(this.config.indices)) {
            if (config.token === token) {
                this.updateIndexData(indexName, ltp, timestamp);
                break;
            }
        }
    }

    updateIndexData(indexName, price, timestamp = Date.now()) {
        const existing = this.indexData.get(indexName);
        const prevPrice = existing?.price || price;
        const change = ((price - prevPrice) / prevPrice) * 100;
        
        // Determine trend
        let trend = 'NEUTRAL';
        if (change > this.config.trendStrengthThreshold) trend = 'BULLISH';
        else if (change < -this.config.trendStrengthThreshold) trend = 'BEARISH';
        
        // Calculate trend strength (0-100)
        const strength = Math.min(100, Math.abs(change) * 20);
        
        this.indexData.set(indexName, {
            price,
            prevPrice,
            change: parseFloat(change.toFixed(3)),
            trend,
            strength: parseFloat(strength.toFixed(1)),
            timestamp
        });
        
        // Record history
        this.recordIndexHistory(indexName, price, timestamp);
        
        this.lastUpdate = timestamp;
    }

    recordIndexHistory(indexName, price, timestamp) {
        const history = this.indexHistory.get(indexName) || [];
        
        history.push({ price, timestamp });
        
        if (history.length > this.config.historySize) {
            history.shift();
        }
        
        this.indexHistory.set(indexName, history);
    }

    // 🔴 CALCULATE OVERALL MARKET BIAS
    calculateMarketBias() {
        let weightedScore = 0;
        let totalWeight = 0;
        
        for (const [indexName, config] of Object.entries(this.config.indices)) {
            const data = this.indexData.get(indexName);
            if (!data) continue;
            
            let score = 0;
            if (data.trend === 'BULLISH') score = data.strength;
            else if (data.trend === 'BEARISH') score = -data.strength;
            
            weightedScore += score * config.weight;
            totalWeight += config.weight;
        }
        
        if (totalWeight === 0) return;
        
        this.marketStrength = parseFloat((weightedScore / totalWeight).toFixed(1));
        
        if (this.marketStrength > 30) this.marketBias = 'STRONG_BULLISH';
        else if (this.marketStrength > 10) this.marketBias = 'BULLISH';
        else if (this.marketStrength < -30) this.marketBias = 'STRONG_BEARISH';
        else if (this.marketStrength < -10) this.marketBias = 'BEARISH';
        else this.marketBias = 'NEUTRAL';
    }

    // 🔴 CALCULATE SECTOR LEADERSHIP
    calculateSectorLeadership() {
        const sectors = ['IT', 'BANKING', 'FINANCE', 'AUTO', 'PHARMA', 'METAL', 'ENERGY', 'POWER', 'FMCG', 'INFRA', 'TELECOM', 'REALTY', 'CHEMICAL'];
        
        sectors.forEach(sector => {
            const stocks = universeLoader.getBySector(sector);
            if (stocks.length === 0) return;
            
            let totalChange = 0;
            let validStocks = 0;
            const stockChanges = [];
            
            stocks.forEach(stock => {
                const livePrice = wsService.getLivePrice(stock.token);
                if (livePrice && livePrice.open > 0) {
                    const change = ((livePrice.ltp - livePrice.open) / livePrice.open) * 100;
                    totalChange += change;
                    validStocks++;
                    stockChanges.push({ symbol: stock.symbol, change });
                }
            });
            
            if (validStocks > 0) {
                const avgChange = totalChange / validStocks;
                
                this.sectorData.set(sector, {
                    sector,
                    avgChange: parseFloat(avgChange.toFixed(2)),
                    stockCount: validStocks,
                    topGainers: stockChanges.sort((a, b) => b.change - a.change).slice(0, 3),
                    topLosers: stockChanges.sort((a, b) => a.change - b.change).slice(0, 3),
                    timestamp: Date.now()
                });
            }
        });
        
        // Calculate sector rankings
        this.calculateSectorRanking();
    }

    calculateSectorRanking() {
        this.sectorRanking = Array.from(this.sectorData.values())
            .sort((a, b) => b.avgChange - a.avgChange)
            .map((data, index) => ({
                ...data,
                rank: index + 1,
                percentile: parseFloat(((1 - index / this.sectorData.size) * 100).toFixed(1)),
                isLeader: index < Math.ceil(this.sectorData.size * 0.4)  // Top 40%
            }));
    }

    // 🔴 GET SECTOR LEADERSHIP SCORE
    getSectorLeadershipScore(sector) {
        const sectorInfo = this.sectorRanking.find(s => s.sector === sector);
        if (!sectorInfo) return { percentile: 50, isLeader: false };
        
        return {
            percentile: sectorInfo.percentile,
            isLeader: sectorInfo.isLeader,
            rank: sectorInfo.rank,
            avgChange: sectorInfo.avgChange
        };
    }

    // 🔴 EVALUATE SIGNAL CONTEXT (For signal upgrade/downgrade)
    evaluateSignalContext(signal) {
        if (!signal) return { adjustment: 0, reason: 'No signal' };
        
        const direction = signal.direction; // 'LONG' or 'SHORT'
        const sector = signal.instrument?.sector;
        
        let adjustment = 0;
        const reasons = [];
        
        // 1. Index Bias Check
        const indexBiasAdjustment = this.getIndexBiasAdjustment(direction);
        adjustment += indexBiasAdjustment.adjustment;
        if (indexBiasAdjustment.reason) reasons.push(indexBiasAdjustment.reason);
        
        // 2. Sector Leadership Check
        const sectorAdjustment = this.getSectorAdjustment(sector, direction);
        adjustment += sectorAdjustment.adjustment;
        if (sectorAdjustment.reason) reasons.push(sectorAdjustment.reason);
        
        // Cap adjustment at ±20% (contextWeight)
        const cappedAdjustment = Math.max(-20, Math.min(20, adjustment));
        
        // Determine action
        let action = 'MAINTAIN';
        if (cappedAdjustment >= 10) action = 'UPGRADE';
        else if (cappedAdjustment <= -10) action = 'DOWNGRADE';
        
        return {
            adjustment: cappedAdjustment,
            action,
            reasons,
            indexBias: this.marketBias,
            marketStrength: this.marketStrength,
            timestamp: Date.now()
        };
    }

    getIndexBiasAdjustment(direction) {
        // If signal direction matches market bias -> positive adjustment
        // If opposite -> negative adjustment
        
        if (direction === 'LONG') {
            if (this.marketBias === 'STRONG_BULLISH') return { adjustment: 10, reason: 'Strong bullish market supports LONG' };
            if (this.marketBias === 'BULLISH') return { adjustment: 5, reason: 'Bullish market supports LONG' };
            if (this.marketBias === 'BEARISH') return { adjustment: -5, reason: 'Bearish market opposes LONG' };
            if (this.marketBias === 'STRONG_BEARISH') return { adjustment: -10, reason: 'Strong bearish market opposes LONG' };
        } else if (direction === 'SHORT') {
            if (this.marketBias === 'STRONG_BEARISH') return { adjustment: 10, reason: 'Strong bearish market supports SHORT' };
            if (this.marketBias === 'BEARISH') return { adjustment: 5, reason: 'Bearish market supports SHORT' };
            if (this.marketBias === 'BULLISH') return { adjustment: -5, reason: 'Bullish market opposes SHORT' };
            if (this.marketBias === 'STRONG_BULLISH') return { adjustment: -10, reason: 'Strong bullish market opposes SHORT' };
        }
        
        return { adjustment: 0, reason: null };
    }

    getSectorAdjustment(sector, direction) {
        if (!sector) return { adjustment: 0, reason: null };
        
        const leadership = this.getSectorLeadershipScore(sector);
        
        if (direction === 'LONG') {
            if (leadership.percentile >= this.config.sectorLeadershipThreshold) {
                return { 
                    adjustment: 10, 
                    reason: `Sector ${sector} in top ${100 - leadership.percentile}% - supports LONG`
                };
            }
            if (leadership.percentile <= 30) {
                return { 
                    adjustment: -5, 
                    reason: `Sector ${sector} lagging (${leadership.percentile}th percentile)`
                };
            }
        } else if (direction === 'SHORT') {
            if (leadership.percentile <= 30) {
                return { 
                    adjustment: 10, 
                    reason: `Sector ${sector} weak (${leadership.percentile}th percentile) - supports SHORT`
                };
            }
            if (leadership.percentile >= 70) {
                return { 
                    adjustment: -5, 
                    reason: `Sector ${sector} strong - opposes SHORT`
                };
            }
        }
        
        return { adjustment: 0, reason: null };
    }

    // 🔴 APPLY CONTEXT TO SIGNAL STRENGTH
    applyContextToSignal(signal) {
        if (!signal) return signal;
        
        const context = this.evaluateSignalContext(signal);
        
        // Apply adjustment to signal strength (never override mandatory breakout logic)
        const adjustedStrength = signal.strength + (signal.strength * context.adjustment / 100);
        
        return {
            ...signal,
            contextAdjustment: context,
            adjustedStrength: parseFloat(adjustedStrength.toFixed(1)),
            originalStrength: signal.strength
        };
    }

    // 🔴 GETTERS
    getMarketContext() {
        return {
            bias: this.marketBias,
            strength: this.marketStrength,
            indices: Object.fromEntries(this.indexData),
            lastUpdate: this.lastUpdate
        };
    }

    getIndexData(indexName) {
        return this.indexData.get(indexName);
    }

    getAllIndexData() {
        return Object.fromEntries(this.indexData);
    }

    getSectorRanking() {
        return this.sectorRanking;
    }

    getTopSectors(count = 5) {
        return this.sectorRanking.slice(0, count);
    }

    getBottomSectors(count = 5) {
        return this.sectorRanking.slice(-count).reverse();
    }

    getSectorData(sector) {
        return this.sectorData.get(sector);
    }

    // Manual update for testing
    setIndexPrice(indexName, price) {
        this.updateIndexData(indexName, price, Date.now());
        this.calculateMarketBias();
    }

    getStats() {
        return {
            marketBias: this.marketBias,
            marketStrength: this.marketStrength,
            indicesTracked: this.indexData.size,
            sectorsTracked: this.sectorData.size,
            lastUpdate: this.lastUpdate,
            contextWeight: `${this.contextWeight * 100}%`
        };
    }

    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
}

module.exports = new CrossMarketContextService();
