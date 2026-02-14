/**
 * CORPORATE ACTION ADJUSTMENT SERVICE
 * Handles split, bonus, dividend adjustments for historical data
 * Applies before indicator calculation
 */

class CorporateActionService {
    constructor() {
        // In-memory corporate action registry
        // In production, this would be fetched from NSE/BSE
        this.actions = new Map();
        this.adjustedCandles = new Map();
        this.config = {
            splitAdjustmentEnabled: true,
            bonusAdjustmentEnabled: true,
            dividendNormalizationEnabled: true
        };
        console.log('[CORPORATE_ACTION] Initializing corporate action service...');
        console.log('[CORPORATE_ACTION] Initialized');
    }

    /**
     * Register a corporate action
     * @param {string} symbol - Stock symbol
     * @param {object} action - { type: 'SPLIT'|'BONUS'|'DIVIDEND', date, ratio, value }
     */
    registerAction(symbol, action) {
        if (!this.actions.has(symbol)) {
            this.actions.set(symbol, []);
        }
        this.actions.get(symbol).push({
            ...action,
            registeredAt: Date.now()
        });
        console.log(`[CORPORATE_ACTION] Registered ${action.type} for ${symbol}: ${JSON.stringify(action)}`);
    }

    /**
     * MAIN: Adjust candles for corporate actions
     * @param {string} symbol - Stock symbol
     * @param {Array} candles - Raw candle data
     * @returns {object} { adjusted: Array, adjustments: Array }
     */
    adjustCandles(symbol, candles) {
        const result = {
            adjusted: [...candles],
            adjustments: [],
            before: candles.length > 0 ? { ...candles[0] } : null,
            after: null
        };

        const actions = this.actions.get(symbol);
        if (!actions || actions.length === 0) {
            result.after = result.before;
            return result;
        }

        // Sort actions by date (newest first for backward adjustment)
        const sortedActions = [...actions].sort((a, b) => 
            new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        for (const action of sortedActions) {
            const actionDate = new Date(action.date).getTime();

            switch (action.type) {
                case 'SPLIT':
                    if (this.config.splitAdjustmentEnabled) {
                        result.adjusted = this.applySplitAdjustment(result.adjusted, actionDate, action.ratio);
                        result.adjustments.push({
                            type: 'SPLIT',
                            date: action.date,
                            ratio: action.ratio,
                            candlesAdjusted: result.adjusted.filter(c => c.timestamp < actionDate).length
                        });
                    }
                    break;

                case 'BONUS':
                    if (this.config.bonusAdjustmentEnabled) {
                        result.adjusted = this.applyBonusAdjustment(result.adjusted, actionDate, action.ratio);
                        result.adjustments.push({
                            type: 'BONUS',
                            date: action.date,
                            ratio: action.ratio,
                            candlesAdjusted: result.adjusted.filter(c => c.timestamp < actionDate).length
                        });
                    }
                    break;

                case 'DIVIDEND':
                    if (this.config.dividendNormalizationEnabled) {
                        result.adjusted = this.applyDividendNormalization(result.adjusted, actionDate, action.value);
                        result.adjustments.push({
                            type: 'DIVIDEND',
                            date: action.date,
                            value: action.value,
                            candlesAdjusted: result.adjusted.filter(c => c.timestamp < actionDate).length
                        });
                    }
                    break;
            }
        }

        result.after = result.adjusted.length > 0 ? { ...result.adjusted[0] } : null;

        // Log sample
        if (result.adjustments.length > 0) {
            console.log(`[CORPORATE_ACTION] Adjusted ${symbol}:`);
            console.log(`   Before: O=${result.before?.open} H=${result.before?.high} L=${result.before?.low} C=${result.before?.close}`);
            console.log(`   After:  O=${result.after?.open?.toFixed(2)} H=${result.after?.high?.toFixed(2)} L=${result.after?.low?.toFixed(2)} C=${result.after?.close?.toFixed(2)}`);
        }

        return result;
    }

    /**
     * SPLIT ADJUSTMENT
     * Example: 1:5 split means old price / 5
     */
    applySplitAdjustment(candles, actionDate, ratio) {
        // ratio format: "1:5" or just 5 (denominator)
        let divisor = ratio;
        if (typeof ratio === 'string' && ratio.includes(':')) {
            divisor = parseFloat(ratio.split(':')[1]);
        }

        return candles.map(c => {
            if (c.timestamp < actionDate) {
                return {
                    ...c,
                    open: c.open / divisor,
                    high: c.high / divisor,
                    low: c.low / divisor,
                    close: c.close / divisor,
                    volume: c.volume * divisor, // Volume increases inversely
                    adjusted: true,
                    adjustmentType: 'SPLIT'
                };
            }
            return c;
        });
    }

    /**
     * BONUS ADJUSTMENT
     * Example: 1:1 bonus means old price / 2
     */
    applyBonusAdjustment(candles, actionDate, ratio) {
        // ratio format: "1:1" means 1 bonus for every 1 held
        let bonusRatio = 1;
        if (typeof ratio === 'string' && ratio.includes(':')) {
            const parts = ratio.split(':');
            bonusRatio = parseFloat(parts[0]) / parseFloat(parts[1]);
        } else {
            bonusRatio = ratio;
        }

        const divisor = 1 + bonusRatio; // 1:1 means divide by 2

        return candles.map(c => {
            if (c.timestamp < actionDate) {
                return {
                    ...c,
                    open: c.open / divisor,
                    high: c.high / divisor,
                    low: c.low / divisor,
                    close: c.close / divisor,
                    volume: c.volume * divisor,
                    adjusted: true,
                    adjustmentType: 'BONUS'
                };
            }
            return c;
        });
    }

    /**
     * DIVIDEND NORMALIZATION
     * Subtract dividend from pre-ex-date prices
     */
    applyDividendNormalization(candles, exDate, dividendValue) {
        return candles.map(c => {
            if (c.timestamp < exDate) {
                return {
                    ...c,
                    open: c.open - dividendValue,
                    high: c.high - dividendValue,
                    low: c.low - dividendValue,
                    close: c.close - dividendValue,
                    adjusted: true,
                    adjustmentType: 'DIVIDEND'
                };
            }
            return c;
        });
    }

    /**
     * Check if symbol has pending adjustments
     */
    hasPendingAdjustments(symbol) {
        const actions = this.actions.get(symbol);
        return actions && actions.length > 0;
    }

    /**
     * Get all registered actions for a symbol
     */
    getActions(symbol) {
        return this.actions.get(symbol) || [];
    }

    /**
     * Clear actions for a symbol
     */
    clearActions(symbol) {
        this.actions.delete(symbol);
        this.adjustedCandles.delete(symbol);
    }

    /**
     * Get service stats
     */
    getStats() {
        const symbolsWithActions = Array.from(this.actions.keys());
        const totalActions = Array.from(this.actions.values()).reduce((sum, arr) => sum + arr.length, 0);

        return {
            symbolsTracked: symbolsWithActions.length,
            totalActions,
            config: this.config,
            symbols: symbolsWithActions.map(s => ({
                symbol: s,
                actions: this.actions.get(s).length
            }))
        };
    }

    /**
     * Bulk register actions (for initialization)
     */
    bulkRegister(actionsArray) {
        for (const item of actionsArray) {
            this.registerAction(item.symbol, item.action);
        }
        console.log(`[CORPORATE_ACTION] Bulk registered ${actionsArray.length} actions`);
    }
}

module.exports = new CorporateActionService();
