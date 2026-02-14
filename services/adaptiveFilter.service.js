const settings = require('../config/settings.config');

class AdaptiveFilterService {
    constructor() {
        this.scanHistory = [];
        this.currentFilters = {
            volumeThreshold: 1.5,
            rsiRangeBullish: { min: 52, max: 75 },
            rsiRangeBearish: { min: 25, max: 48 },
            atrThreshold: 4.0
        };
        
        this.baseFilters = {
            volumeThreshold: 1.5,
            rsiRangeBullish: { min: 52, max: 75 },
            rsiRangeBearish: { min: 25, max: 48 },
            atrThreshold: 4.0
        };
        
        this.tightenedFilters = {
            volumeThreshold: 2.0,
            rsiRangeBullish: { min: 55, max: 72 },
            rsiRangeBearish: { min: 28, max: 45 },
            atrThreshold: 3.5
        };

        this.config = {
            candidateThresholdPercent: 20,
            historySize: 10,
            autoResetAfterScans: 5
        };

        this.tightenedScanCount = 0;
        this.isTightened = false;
    }

    recordScanResult(scannedCount, candidateCount) {
        const candidatePercent = (candidateCount / scannedCount) * 100;

        this.scanHistory.push({
            scanned: scannedCount,
            candidates: candidateCount,
            percent: candidatePercent,
            timestamp: Date.now()
        });

        if (this.scanHistory.length > this.config.historySize) {
            this.scanHistory.shift();
        }

        // Evaluate if filters should be tightened
        this.evaluateFilters(candidatePercent);

        return {
            candidatePercent,
            filtersTightened: this.isTightened,
            currentFilters: this.currentFilters
        };
    }

    evaluateFilters(candidatePercent) {
        if (candidatePercent > this.config.candidateThresholdPercent) {
            if (!this.isTightened) {
                this.tightenFilters();
                console.log(`[ADAPTIVE_FILTER] Tightening filters: ${candidatePercent.toFixed(1)}% candidates > ${this.config.candidateThresholdPercent}% threshold`);
            }
            this.tightenedScanCount = 0;
        } else if (this.isTightened) {
            this.tightenedScanCount++;
            
            // Auto-reset after X consecutive scans below threshold
            if (this.tightenedScanCount >= this.config.autoResetAfterScans) {
                this.resetFilters();
                console.log('[ADAPTIVE_FILTER] Resetting filters to base (sustained low candidate count)');
            }
        }
    }

    tightenFilters() {
        this.currentFilters = { ...this.tightenedFilters };
        this.isTightened = true;
    }

    resetFilters() {
        this.currentFilters = { ...this.baseFilters };
        this.isTightened = false;
        this.tightenedScanCount = 0;
    }

    getFilters() {
        return {
            ...this.currentFilters,
            isTightened: this.isTightened
        };
    }

    getVolumeThreshold() {
        return this.currentFilters.volumeThreshold;
    }

    getRSIRange(direction) {
        if (direction === 'BULLISH') {
            return this.currentFilters.rsiRangeBullish;
        }
        return this.currentFilters.rsiRangeBearish;
    }

    getATRThreshold() {
        return this.currentFilters.atrThreshold;
    }

    // Used by orchestrator for breakout validation
    validateBreakout(indicators, direction) {
        const volumeRatio = indicators.volumeRatio || 0;
        const rsi = indicators.rsi || 50;
        const atrPercent = indicators.atrPercent || 0;

        const filters = this.getFilters();
        const rsiRange = direction === 'BULLISH' ? filters.rsiRangeBullish : filters.rsiRangeBearish;

        return {
            volumePass: volumeRatio >= filters.volumeThreshold,
            rsiPass: rsi >= rsiRange.min && rsi <= rsiRange.max,
            atrPass: atrPercent < filters.atrThreshold,
            filters: {
                volumeThreshold: filters.volumeThreshold,
                rsiRange,
                atrThreshold: filters.atrThreshold,
                isTightened: filters.isTightened
            }
        };
    }

    getStats() {
        const avgCandidatePercent = this.scanHistory.length > 0
            ? this.scanHistory.reduce((sum, h) => sum + h.percent, 0) / this.scanHistory.length
            : 0;

        return {
            isTightened: this.isTightened,
            currentFilters: this.currentFilters,
            baseFilters: this.baseFilters,
            tightenedFilters: this.tightenedFilters,
            scanHistoryCount: this.scanHistory.length,
            avgCandidatePercent: avgCandidatePercent.toFixed(2),
            tightenedScanCount: this.tightenedScanCount,
            lastScan: this.scanHistory.length > 0 ? this.scanHistory[this.scanHistory.length - 1] : null
        };
    }
}

module.exports = new AdaptiveFilterService();
