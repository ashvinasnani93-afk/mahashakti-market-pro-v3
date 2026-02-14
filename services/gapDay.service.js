/**
 * GAP DAY OVERRIDE SERVICE
 * Adjusts breakout thresholds on gap days (>1.5% gap)
 */

const marketStateService = require('./marketState.service');

class GapDayService {
    constructor() {
        this.state = {
            isGapDay: false,
            gapType: null,              // 'GAP_UP' or 'GAP_DOWN'
            gapPercent: 0,
            niftyGap: 0,
            adjustmentsActive: false,
            detectedAt: null
        };

        this.config = {
            gapThresholdPercent: 1.5,   // >1.5% = gap day
            largeGapThresholdPercent: 3, // >3% = large gap
            breakoutMultiplier: 1.5,    // Increase breakout threshold by 50%
            largeGapBreakoutMultiplier: 2, // Double for large gaps
            volumeMultiplier: 1.3       // Require 30% more volume
        };

        this.gapHistory = [];

        console.log('[GAP_DAY] Initializing gap day override service...');
        console.log('[GAP_DAY] Initialized');
    }

    /**
     * Detect gap at market open
     * Call this once after market opens
     */
    detectGap() {
        const niftyState = marketStateService.getState('99926000');
        
        if (!niftyState || !niftyState.open || !niftyState.prevClose) {
            return { detected: false, reason: 'No NIFTY data available' };
        }

        const gapPercent = ((niftyState.open - niftyState.prevClose) / niftyState.prevClose) * 100;
        this.state.niftyGap = Math.round(gapPercent * 100) / 100;

        if (Math.abs(gapPercent) >= this.config.gapThresholdPercent) {
            this.state.isGapDay = true;
            this.state.gapType = gapPercent > 0 ? 'GAP_UP' : 'GAP_DOWN';
            this.state.gapPercent = this.state.niftyGap;
            this.state.adjustmentsActive = true;
            this.state.detectedAt = Date.now();

            // Determine gap size
            const isLargeGap = Math.abs(gapPercent) >= this.config.largeGapThresholdPercent;

            this.gapHistory.push({
                date: new Date().toISOString().split('T')[0],
                gapPercent: this.state.niftyGap,
                gapType: this.state.gapType,
                isLargeGap,
                timestamp: Date.now()
            });

            console.log(`[GAP_DAY] 📊 GAP ${this.state.gapType} detected: ${this.state.niftyGap}%${isLargeGap ? ' (LARGE GAP)' : ''}`);

            return {
                detected: true,
                gapType: this.state.gapType,
                gapPercent: this.state.niftyGap,
                isLargeGap,
                adjustments: this.getAdjustments()
            };
        }

        this.state.isGapDay = false;
        this.state.gapType = null;
        this.state.adjustmentsActive = false;

        return {
            detected: false,
            gapPercent: this.state.niftyGap,
            reason: `Gap ${this.state.niftyGap}% < ${this.config.gapThresholdPercent}% threshold`
        };
    }

    /**
     * Get current adjustments for gap day
     */
    getAdjustments() {
        if (!this.state.isGapDay) {
            return null;
        }

        const isLargeGap = Math.abs(this.state.gapPercent) >= this.config.largeGapThresholdPercent;

        return {
            breakoutMultiplier: isLargeGap 
                ? this.config.largeGapBreakoutMultiplier 
                : this.config.breakoutMultiplier,
            volumeMultiplier: this.config.volumeMultiplier,
            gapType: this.state.gapType,
            gapPercent: this.state.gapPercent,
            isLargeGap,
            recommendation: this.getRecommendation()
        };
    }

    /**
     * Get trading recommendation based on gap
     */
    getRecommendation() {
        if (!this.state.isGapDay) {
            return 'Normal day - No special adjustments';
        }

        const isLargeGap = Math.abs(this.state.gapPercent) >= this.config.largeGapThresholdPercent;

        if (this.state.gapType === 'GAP_UP') {
            if (isLargeGap) {
                return 'Large Gap Up: Wait for first hour. Look for gap fill shorts or continuation after consolidation.';
            }
            return 'Gap Up: Breakouts need confirmation. Watch for profit booking pressure.';
        }

        if (this.state.gapType === 'GAP_DOWN') {
            if (isLargeGap) {
                return 'Large Gap Down: High volatility expected. Look for panic selling climax or gap fill reversal.';
            }
            return 'Gap Down: Watch for support levels. Breakdowns need volume confirmation.';
        }

        return 'Monitor price action for gap fill or continuation';
    }

    /**
     * MAIN: Check if signal should be adjusted based on gap
     * @param {object} signal - Signal with breakout level and volume
     * @returns {object} { adjusted: boolean, adjustedValues: object }
     */
    checkSignal(signal) {
        if (!this.state.isGapDay) {
            return {
                adjusted: false,
                reason: 'Not a gap day',
                adjustments: null
            };
        }

        const adjustments = this.getAdjustments();

        // For gap up days, longs need higher threshold
        if (this.state.gapType === 'GAP_UP' && (signal.type === 'BUY' || signal.type === 'STRONG_BUY')) {
            return {
                adjusted: true,
                reason: `Gap Up day: Breakout threshold increased ${adjustments.breakoutMultiplier}x`,
                adjustments: {
                    originalBreakout: signal.breakoutLevel,
                    adjustedBreakout: signal.breakoutLevel * adjustments.breakoutMultiplier,
                    volumeRequired: signal.volumeThreshold * adjustments.volumeMultiplier
                },
                recommendation: adjustments.recommendation
            };
        }

        // For gap down days, shorts need higher threshold
        if (this.state.gapType === 'GAP_DOWN' && (signal.type === 'SELL' || signal.type === 'STRONG_SELL')) {
            return {
                adjusted: true,
                reason: `Gap Down day: Breakdown threshold increased ${adjustments.breakoutMultiplier}x`,
                adjustments: {
                    originalBreakdown: signal.breakdownLevel,
                    adjustedBreakdown: signal.breakdownLevel * adjustments.breakoutMultiplier,
                    volumeRequired: signal.volumeThreshold * adjustments.volumeMultiplier
                },
                recommendation: adjustments.recommendation
            };
        }

        return {
            adjusted: false,
            reason: 'Signal direction aligned with gap',
            adjustments,
            recommendation: adjustments.recommendation
        };
    }

    /**
     * Reset for new day
     */
    resetForNewDay() {
        this.state.isGapDay = false;
        this.state.gapType = null;
        this.state.gapPercent = 0;
        this.state.adjustmentsActive = false;
        this.state.detectedAt = null;
        console.log('[GAP_DAY] Reset for new day');
    }

    /**
     * Get stats
     */
    getStats() {
        return {
            isGapDay: this.state.isGapDay,
            gapType: this.state.gapType,
            gapPercent: this.state.gapPercent,
            niftyGap: this.state.niftyGap,
            adjustmentsActive: this.state.adjustmentsActive,
            currentAdjustments: this.getAdjustments(),
            recommendation: this.getRecommendation(),
            gapHistory: this.gapHistory.slice(-10),
            config: this.config
        };
    }
}

module.exports = new GapDayService();
