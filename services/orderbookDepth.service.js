/**
 * ORDERBOOK DEPTH IMBALANCE SERVICE
 * Analyzes bid-ask spread and depth imbalance
 * Blocks signals on extreme spread or imbalance
 */

class OrderbookDepthService {
    constructor() {
        this.state = {
            depthData: new Map(),        // token -> depth analysis
            spreadAlerts: new Map(),     // token -> spread alert
            lastUpdate: null
        };

        this.config = {
            spreadBlockThreshold: 18,    // Block if spread > 18% of premium (was 15%)
            imbalanceBlockThreshold: 5,  // Block if imbalance ratio > 5x
            minDepthLevels: 5,           // Minimum depth levels to analyze
            updateIntervalMs: 5000
        };

        this.depthHistory = new Map();   // token -> depth history
        this.updateInterval = null;

        console.log('[ORDERBOOK_DEPTH] Initializing orderbook depth engine...');
        console.log('[ORDERBOOK_DEPTH] Initialized');
    }

    /**
     * Start periodic depth analysis
     */
    start() {
        if (this.updateInterval) {
            console.log('[ORDERBOOK_DEPTH] Already running');
            return;
        }

        console.log('[ORDERBOOK_DEPTH] Started depth monitoring');
    }

    /**
     * Stop depth analysis
     */
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('[ORDERBOOK_DEPTH] Stopped');
        }
    }

    /**
     * Register depth data for analysis
     * @param {string} token - Instrument token
     * @param {object} depth - { bids: [{price, qty}], asks: [{price, qty}], ltp }
     */
    registerDepth(token, symbol, depth) {
        if (!depth || !depth.bids || !depth.asks) {
            return null;
        }

        const analysis = this.analyzeDepth(depth);
        
        const depthData = {
            token,
            symbol,
            ...analysis,
            timestamp: Date.now()
        };

        this.state.depthData.set(token, depthData);

        // Track history
        const history = this.depthHistory.get(token) || [];
        history.push({
            timestamp: Date.now(),
            spread: analysis.spreadPercent,
            imbalance: analysis.imbalanceRatio
        });
        if (history.length > 60) history.shift();
        this.depthHistory.set(token, history);

        // Check for spread alert
        if (analysis.spreadPercent > this.config.spreadBlockThreshold) {
            this.state.spreadAlerts.set(token, {
                symbol,
                spreadPercent: analysis.spreadPercent,
                timestamp: Date.now()
            });
        } else {
            this.state.spreadAlerts.delete(token);
        }

        this.state.lastUpdate = Date.now();
        return depthData;
    }

    /**
     * Analyze depth data
     */
    analyzeDepth(depth) {
        const { bids, asks, ltp } = depth;

        // Best bid/ask
        const bestBid = bids.length > 0 ? bids[0].price : 0;
        const bestAsk = asks.length > 0 ? asks[0].price : 0;

        // Spread calculation
        const spread = bestAsk - bestBid;
        const midPrice = (bestBid + bestAsk) / 2;
        const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0;

        // Top 5 depth analysis
        const top5Bids = bids.slice(0, 5);
        const top5Asks = asks.slice(0, 5);

        const totalBidQty = top5Bids.reduce((sum, b) => sum + b.qty, 0);
        const totalAskQty = top5Asks.reduce((sum, a) => sum + a.qty, 0);

        // Imbalance ratio (higher = more buy pressure)
        const imbalanceRatio = totalAskQty > 0 ? totalBidQty / totalAskQty : 1;

        // Weighted average prices
        const weightedBidPrice = totalBidQty > 0 
            ? top5Bids.reduce((sum, b) => sum + b.price * b.qty, 0) / totalBidQty 
            : bestBid;
        const weightedAskPrice = totalAskQty > 0 
            ? top5Asks.reduce((sum, a) => sum + a.price * a.qty, 0) / totalAskQty 
            : bestAsk;

        // Depth classification
        let depthQuality;
        if (spreadPercent < 2 && totalBidQty > 1000 && totalAskQty > 1000) {
            depthQuality = 'EXCELLENT';
        } else if (spreadPercent < 5 && totalBidQty > 500) {
            depthQuality = 'GOOD';
        } else if (spreadPercent < 10) {
            depthQuality = 'FAIR';
        } else {
            depthQuality = 'POOR';
        }

        // Pressure direction
        let pressureDirection;
        if (imbalanceRatio > 1.5) {
            pressureDirection = 'BUY_HEAVY';
        } else if (imbalanceRatio < 0.67) {
            pressureDirection = 'SELL_HEAVY';
        } else {
            pressureDirection = 'BALANCED';
        }

        return {
            bestBid,
            bestAsk,
            spread: Math.round(spread * 100) / 100,
            spreadPercent: Math.round(spreadPercent * 100) / 100,
            midPrice: Math.round(midPrice * 100) / 100,
            totalBidQty,
            totalAskQty,
            imbalanceRatio: Math.round(imbalanceRatio * 100) / 100,
            weightedBidPrice: Math.round(weightedBidPrice * 100) / 100,
            weightedAskPrice: Math.round(weightedAskPrice * 100) / 100,
            depthLevels: Math.min(bids.length, asks.length),
            depthQuality,
            pressureDirection,
            ltp
        };
    }

    /**
     * MAIN: Check if signal should be allowed based on orderbook
     * @param {string} token - Instrument token
     * @returns {object} { allowed: boolean, reason: string }
     */
    checkSignal(token) {
        const depthData = this.state.depthData.get(token);

        if (!depthData) {
            return {
                allowed: true,
                reason: 'No depth data available',
                depthData: null
            };
        }

        // Check spread threshold
        if (depthData.spreadPercent > this.config.spreadBlockThreshold) {
            return {
                allowed: false,
                reason: `SPREAD_BLOCK_REASON: Spread ${depthData.spreadPercent.toFixed(2)}% > ${this.config.spreadBlockThreshold}% threshold`,
                spreadPercent: depthData.spreadPercent,
                detail: depthData
            };
        }

        // Check extreme imbalance
        if (depthData.imbalanceRatio > this.config.imbalanceBlockThreshold ||
            depthData.imbalanceRatio < (1 / this.config.imbalanceBlockThreshold)) {
            return {
                allowed: false,
                reason: `DEPTH_IMBALANCE_BLOCK: Extreme imbalance ratio ${depthData.imbalanceRatio.toFixed(2)}`,
                imbalanceRatio: depthData.imbalanceRatio,
                detail: depthData
            };
        }

        // Check poor depth quality
        if (depthData.depthQuality === 'POOR') {
            return {
                allowed: false,
                reason: `DEPTH_QUALITY_BLOCK: Poor orderbook depth (spread: ${depthData.spreadPercent.toFixed(2)}%)`,
                depthQuality: depthData.depthQuality,
                detail: depthData
            };
        }

        return {
            allowed: true,
            reason: `Orderbook OK - Quality: ${depthData.depthQuality}, Spread: ${depthData.spreadPercent.toFixed(2)}%`,
            depthQuality: depthData.depthQuality,
            spreadPercent: depthData.spreadPercent,
            pressureDirection: depthData.pressureDirection
        };
    }

    /**
     * Get depth data for a token
     */
    getDepthData(token) {
        return this.state.depthData.get(token) || null;
    }

    /**
     * Get all spread alerts
     */
    getSpreadAlerts() {
        return Array.from(this.state.spreadAlerts.values());
    }

    /**
     * Get stats
     */
    getStats() {
        const allDepth = Array.from(this.state.depthData.values());
        const excellentCount = allDepth.filter(d => d.depthQuality === 'EXCELLENT').length;
        const goodCount = allDepth.filter(d => d.depthQuality === 'GOOD').length;
        const fairCount = allDepth.filter(d => d.depthQuality === 'FAIR').length;
        const poorCount = allDepth.filter(d => d.depthQuality === 'POOR').length;

        return {
            trackedInstruments: allDepth.length,
            depthQualityBreakdown: {
                excellent: excellentCount,
                good: goodCount,
                fair: fairCount,
                poor: poorCount
            },
            spreadAlerts: this.getSpreadAlerts(),
            alertCount: this.state.spreadAlerts.size,
            lastUpdate: this.state.lastUpdate,
            config: this.config
        };
    }
}

module.exports = new OrderbookDepthService();
