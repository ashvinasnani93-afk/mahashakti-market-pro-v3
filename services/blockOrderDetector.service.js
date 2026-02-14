/**
 * BLOCK ORDER DETECTOR SERVICE
 * Detects institutional block orders
 * Single candle: 5x volume, narrow spread, no wick
 */

const marketStateService = require('./marketState.service');

class BlockOrderDetectorService {
    constructor() {
        this.state = {
            blockOrders: new Map(),      // token -> recent block order
            lastUpdate: null
        };

        this.config = {
            volumeMultipleThreshold: 5,  // 5x average volume
            maxWickPercent: 20,          // Max 20% wick of total range
            maxSpreadPercent: 0.5,       // Max 0.5% spread
            lookbackCandles: 20          // Average volume lookback
        };

        this.volumeHistory = new Map();  // token -> volume history

        console.log('[BLOCK_ORDER] Initializing block order detector...');
        console.log('[BLOCK_ORDER] Initialized');
    }

    /**
     * Register candle for block order detection
     */
    registerCandle(token, symbol, candle, avgVolume) {
        const volumeMultiple = avgVolume > 0 ? candle.volume / avgVolume : 0;

        // Track volume history
        const history = this.volumeHistory.get(token) || [];
        history.push({ timestamp: Date.now(), volume: candle.volume });
        if (history.length > 50) history.shift();
        this.volumeHistory.set(token, history);

        // Check block order conditions
        const isBlockOrder = this.detectBlockOrder(candle, volumeMultiple);

        if (isBlockOrder.detected) {
            this.state.blockOrders.set(token, {
                token,
                symbol,
                ...isBlockOrder,
                candle,
                volumeMultiple: Math.round(volumeMultiple * 100) / 100,
                timestamp: Date.now()
            });

            console.log(`[BLOCK_ORDER] 📦 BLOCK ORDER: ${symbol} | Volume ${volumeMultiple.toFixed(1)}x | Direction: ${isBlockOrder.direction}`);
        }

        this.state.lastUpdate = Date.now();
        return isBlockOrder;
    }

    /**
     * Detect if candle is a block order
     */
    detectBlockOrder(candle, volumeMultiple) {
        // Condition 1: High volume (5x)
        if (volumeMultiple < this.config.volumeMultipleThreshold) {
            return { detected: false, reason: 'Volume not sufficient' };
        }

        // Calculate candle characteristics
        const range = candle.high - candle.low;
        const body = Math.abs(candle.close - candle.open);
        const upperWick = candle.high - Math.max(candle.open, candle.close);
        const lowerWick = Math.min(candle.open, candle.close) - candle.low;
        const totalWick = upperWick + lowerWick;

        // Condition 2: Narrow spread (minimal wicks)
        const wickPercent = range > 0 ? (totalWick / range) * 100 : 0;
        if (wickPercent > this.config.maxWickPercent) {
            return { detected: false, reason: 'Too much wick' };
        }

        // Condition 3: Strong body
        const bodyPercent = range > 0 ? (body / range) * 100 : 0;
        if (bodyPercent < 60) {
            return { detected: false, reason: 'Weak body' };
        }

        // Determine direction
        const direction = candle.close > candle.open ? 'BUY_BLOCK' : 'SELL_BLOCK';

        return {
            detected: true,
            direction,
            volumeMultiple,
            bodyPercent: Math.round(bodyPercent),
            wickPercent: Math.round(wickPercent),
            characteristics: {
                range,
                body,
                upperWick,
                lowerWick
            }
        };
    }

    /**
     * Check if recent block order exists for token
     */
    hasRecentBlockOrder(token, maxAgeMs = 300000) {
        const block = this.state.blockOrders.get(token);
        if (!block) return null;

        if (Date.now() - block.timestamp > maxAgeMs) {
            return null;
        }

        return block;
    }

    /**
     * MAIN: Check if signal aligns with block order
     */
    checkSignalAlignment(token, signalType) {
        const blockOrder = this.hasRecentBlockOrder(token);

        if (!blockOrder) {
            return {
                hasBlock: false,
                reason: 'No recent block order'
            };
        }

        // Check alignment
        const isBuySignal = signalType === 'BUY' || signalType === 'STRONG_BUY';
        const isBuyBlock = blockOrder.direction === 'BUY_BLOCK';

        if ((isBuySignal && isBuyBlock) || (!isBuySignal && !isBuyBlock)) {
            return {
                hasBlock: true,
                aligned: true,
                reason: `Signal aligned with ${blockOrder.direction} - Institutional confirmation`,
                upgrade: true,
                blockOrder
            };
        }

        return {
            hasBlock: true,
            aligned: false,
            reason: `Signal against ${blockOrder.direction} - Caution advised`,
            downgrade: true,
            blockOrder
        };
    }

    /**
     * Get recent block orders
     */
    getRecentBlockOrders(maxAgeMs = 600000) {
        const recent = [];
        const cutoff = Date.now() - maxAgeMs;

        for (const [token, block] of this.state.blockOrders) {
            if (block.timestamp > cutoff) {
                recent.push(block);
            }
        }

        return recent.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get stats
     */
    getStats() {
        return {
            totalBlockOrders: this.state.blockOrders.size,
            recentBlockOrders: this.getRecentBlockOrders(),
            lastUpdate: this.state.lastUpdate,
            config: this.config
        };
    }
}

module.exports = new BlockOrderDetectorService();
