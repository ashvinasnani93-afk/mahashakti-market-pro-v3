/**
 * INTRADAY VOLATILITY REGIME CLASSIFIER
 * Detects: Compression, Expansion, Trend Day, Mean Reversion
 * Uses ATR slope + range expansion
 */

const marketStateService = require('./marketState.service');

class VolatilityRegimeService {
    constructor() {
        this.state = {
            currentRegime: 'UNKNOWN',
            regimeConfidence: 0,
            atrSlope: 0,
            rangeExpansion: 0,
            lastUpdate: null
        };

        this.config = {
            atrPeriod: 14,
            compressionThreshold: -20,   // ATR declining > 20%
            expansionThreshold: 30,      // ATR expanding > 30%
            trendDayRangeMultiple: 2,    // Range > 2x average
            updateIntervalMs: 60000      // Update every minute
        };

        this.regimeHistory = [];
        this.rangeHistory = [];
        this.atrHistory = [];
        this.updateInterval = null;

        console.log('[VOLATILITY_REGIME] Initializing volatility regime classifier...');
        console.log('[VOLATILITY_REGIME] Initialized');
    }

    /**
     * Start regime classification
     */
    start() {
        if (this.updateInterval) {
            console.log('[VOLATILITY_REGIME] Already running');
            return;
        }

        this.classify();
        this.updateInterval = setInterval(() => {
            this.classify();
        }, this.config.updateIntervalMs);

        console.log('[VOLATILITY_REGIME] Started - classifying every minute');
    }

    /**
     * Stop regime classification
     */
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('[VOLATILITY_REGIME] Stopped');
        }
    }

    /**
     * Classify current volatility regime
     */
    classify() {
        const niftyState = marketStateService.getState('99926000');
        
        if (!niftyState) {
            return null;
        }

        // Track range
        const currentRange = niftyState.high && niftyState.low 
            ? niftyState.high - niftyState.low 
            : 0;

        this.rangeHistory.push({
            timestamp: Date.now(),
            range: currentRange,
            high: niftyState.high,
            low: niftyState.low
        });

        if (this.rangeHistory.length > 100) {
            this.rangeHistory.shift();
        }

        // Calculate metrics
        const avgRange = this.calculateAverageRange();
        const rangeExpansion = avgRange > 0 
            ? ((currentRange - avgRange) / avgRange) * 100 
            : 0;

        const atrSlope = this.calculateATRSlope();

        this.state.atrSlope = Math.round(atrSlope * 100) / 100;
        this.state.rangeExpansion = Math.round(rangeExpansion * 100) / 100;

        // Classify regime
        let regime = 'NORMAL';
        let confidence = 50;

        // Compression: ATR declining, range contracting
        if (atrSlope < this.config.compressionThreshold && rangeExpansion < 0) {
            regime = 'COMPRESSION';
            confidence = Math.min(90, 50 + Math.abs(atrSlope));
        }
        // Expansion: ATR expanding, range expanding
        else if (atrSlope > this.config.expansionThreshold && rangeExpansion > 50) {
            regime = 'EXPANSION';
            confidence = Math.min(90, 50 + atrSlope / 2);
        }
        // Trend Day: Large range, sustained movement
        else if (rangeExpansion > 100 && currentRange > avgRange * this.config.trendDayRangeMultiple) {
            regime = 'TREND_DAY';
            confidence = Math.min(95, 60 + rangeExpansion / 10);
        }
        // Mean Reversion: Oscillating, range normal
        else if (Math.abs(rangeExpansion) < 20 && Math.abs(atrSlope) < 10) {
            regime = 'MEAN_REVERSION';
            confidence = 60;
        }

        // Update state
        this.state.currentRegime = regime;
        this.state.regimeConfidence = Math.round(confidence);
        this.state.lastUpdate = Date.now();

        // Track regime history
        this.regimeHistory.push({
            timestamp: Date.now(),
            regime,
            confidence,
            atrSlope: this.state.atrSlope,
            rangeExpansion: this.state.rangeExpansion
        });

        if (this.regimeHistory.length > 100) {
            this.regimeHistory.shift();
        }

        return this.getClassification();
    }

    /**
     * Calculate average range from history
     */
    calculateAverageRange() {
        if (this.rangeHistory.length < 5) return 0;
        
        const recentRanges = this.rangeHistory.slice(-20);
        return recentRanges.reduce((sum, r) => sum + r.range, 0) / recentRanges.length;
    }

    /**
     * Calculate ATR slope (rate of change)
     */
    calculateATRSlope() {
        if (this.rangeHistory.length < 10) return 0;

        // Calculate ATR for two periods
        const recentATR = this.calculateATR(this.rangeHistory.slice(-5));
        const olderATR = this.calculateATR(this.rangeHistory.slice(-10, -5));

        if (olderATR === 0) return 0;
        return ((recentATR - olderATR) / olderATR) * 100;
    }

    /**
     * Calculate ATR from range data
     */
    calculateATR(ranges) {
        if (ranges.length === 0) return 0;
        return ranges.reduce((sum, r) => sum + r.range, 0) / ranges.length;
    }

    /**
     * Get current classification
     */
    getClassification() {
        return {
            regime: this.state.currentRegime,
            confidence: this.state.regimeConfidence,
            atrSlope: this.state.atrSlope,
            rangeExpansion: this.state.rangeExpansion,
            recommendation: this.getRecommendation(),
            timestamp: this.state.lastUpdate
        };
    }

    /**
     * Get trading recommendation based on regime
     */
    getRecommendation() {
        switch (this.state.currentRegime) {
            case 'COMPRESSION':
                return 'Low volatility - Avoid breakout trades, wait for expansion. Good for premium selling.';
            case 'EXPANSION':
                return 'High volatility - Ride momentum, use trailing stops. Good for directional trades.';
            case 'TREND_DAY':
                return 'Strong trend - Trade with trend, avoid counter-trend. Add on pullbacks.';
            case 'MEAN_REVERSION':
                return 'Range bound - Fade extremes, trade support/resistance. Good for options selling.';
            default:
                return 'Normal conditions - Standard trading rules apply.';
        }
    }

    /**
     * MAIN: Check signal compatibility with regime
     */
    checkSignalCompatibility(signalType) {
        const regime = this.state.currentRegime;

        // Compression regime - avoid breakouts
        if (regime === 'COMPRESSION') {
            return {
                compatible: false,
                reason: `REGIME_BLOCK: Compression regime - Breakouts likely to fail`,
                regime,
                recommendation: 'Wait for expansion before taking positions'
            };
        }

        // All other regimes allow signals
        return {
            compatible: true,
            regime,
            adjustment: this.getSignalAdjustment(signalType),
            recommendation: this.getRecommendation()
        };
    }

    /**
     * Get signal adjustment based on regime
     */
    getSignalAdjustment(signalType) {
        const regime = this.state.currentRegime;

        if (regime === 'TREND_DAY') {
            return {
                type: 'UPGRADE',
                reason: 'Trend day - Signals in trend direction stronger',
                stopLossMultiplier: 0.8,  // Tighter stops
                targetMultiplier: 1.5     // Extended targets
            };
        }

        if (regime === 'EXPANSION') {
            return {
                type: 'ADJUST',
                reason: 'Expansion - Use wider stops for volatility',
                stopLossMultiplier: 1.3,
                targetMultiplier: 1.2
            };
        }

        if (regime === 'MEAN_REVERSION') {
            return {
                type: 'ADJUST',
                reason: 'Mean reversion - Trade reversals at extremes',
                stopLossMultiplier: 1,
                targetMultiplier: 0.8     // Shorter targets
            };
        }

        return null;
    }

    /**
     * Get stats
     */
    getStats() {
        const classification = this.getClassification();
        
        // Regime distribution from history
        const regimeDistribution = {};
        for (const entry of this.regimeHistory) {
            regimeDistribution[entry.regime] = (regimeDistribution[entry.regime] || 0) + 1;
        }

        return {
            ...classification,
            regimeDistribution,
            historyCount: this.regimeHistory.length,
            recentRegimes: this.regimeHistory.slice(-10),
            config: this.config
        };
    }
}

module.exports = new VolatilityRegimeService();
