/**
 * 🔴 GLOBAL RANKING SERVICE - Continuously Updated Sorted Arrays
 * Updates every 5 seconds from marketState memory (NO full market rescan)
 */

const marketStateService = require('./marketState.service');

class GlobalRankingService {
    constructor() {
        // 🔴 SORTED ARRAYS - Updated every 5 seconds
        this.rankings = {
            topGainers: [],          // by % from open
            topLosers: [],           // by % from open (negative)
            topRangeExpansion: [],   // by intraday range %
            topVolumeSpike: [],      // by volume vs avg
            topRelativeStrength: [], // vs NIFTY
            topIntradayMomentum: [], // combined score
            topPremiumGrowth: []     // options by premium %
        };
        
        // Premium tracking for options
        this.premiumSnapshots = new Map();  // token -> { startPremium, currentPremium }
        
        // Configuration
        this.config = {
            updateIntervalMs: 5000,
            maxRankingSize: 50,
            minPercentForGainer: 1,
            minPercentForLoser: -1,
            minVolumeRatio: 2
        };
        
        this.updateInterval = null;
        this.lastUpdate = null;
    }

    initialize() {
        console.log('[GLOBAL_RANKING] Initializing ranking engine...');
        this.startPeriodicUpdate();
        console.log('[GLOBAL_RANKING] Initialized - Updates every 5 seconds');
    }

    startPeriodicUpdate() {
        if (this.updateInterval) return;
        
        // Initial update
        this.updateAllRankings();
        
        // Periodic updates every 5 seconds
        this.updateInterval = setInterval(() => {
            this.updateAllRankings();
        }, this.config.updateIntervalMs);
    }

    // 🔴 UPDATE ALL RANKINGS FROM MEMORY (No full scan)
    updateAllRankings() {
        const states = marketStateService.getActiveStates();
        if (states.length === 0) return;
        
        // Top Gainers (by % from open)
        this.rankings.topGainers = states
            .filter(s => s.percentChangeFromOpen >= this.config.minPercentForGainer)
            .sort((a, b) => b.percentChangeFromOpen - a.percentChangeFromOpen)
            .slice(0, this.config.maxRankingSize)
            .map(s => this.formatRanking(s, 'gainer'));

        // Top Losers (by % from open)
        this.rankings.topLosers = states
            .filter(s => s.percentChangeFromOpen <= this.config.minPercentForLoser)
            .sort((a, b) => a.percentChangeFromOpen - b.percentChangeFromOpen)
            .slice(0, this.config.maxRankingSize)
            .map(s => this.formatRanking(s, 'loser'));

        // Top Range Expansion
        this.rankings.topRangeExpansion = states
            .filter(s => s.intradayRangePercent > 2)
            .sort((a, b) => b.intradayRangePercent - a.intradayRangePercent)
            .slice(0, this.config.maxRankingSize)
            .map(s => this.formatRanking(s, 'range'));

        // Top Volume Spike
        this.rankings.topVolumeSpike = states
            .filter(s => s.avgVolume > 0 && s.lastVolume > 0)
            .map(s => ({
                ...s,
                volumeRatio: s.lastVolume / s.avgVolume
            }))
            .filter(s => s.volumeRatio >= this.config.minVolumeRatio)
            .sort((a, b) => b.volumeRatio - a.volumeRatio)
            .slice(0, this.config.maxRankingSize)
            .map(s => this.formatRanking(s, 'volume'));

        // Top Relative Strength (vs NIFTY)
        this.rankings.topRelativeStrength = states
            .filter(s => s.relativeStrengthVsIndex > 0)
            .sort((a, b) => b.relativeStrengthVsIndex - a.relativeStrengthVsIndex)
            .slice(0, this.config.maxRankingSize)
            .map(s => this.formatRanking(s, 'strength'));

        // Top Intraday Momentum (combined score)
        this.rankings.topIntradayMomentum = states
            .map(s => ({
                ...s,
                momentumScore: this.calculateMomentumScore(s)
            }))
            .filter(s => s.momentumScore > 50)
            .sort((a, b) => b.momentumScore - a.momentumScore)
            .slice(0, this.config.maxRankingSize)
            .map(s => this.formatRanking(s, 'momentum'));

        // Top Premium Growth (options)
        this.updatePremiumRankings();

        this.lastUpdate = Date.now();
    }

    calculateMomentumScore(state) {
        let score = 0;
        
        // Percent change contribution (max 40)
        const absChange = Math.abs(state.percentChangeFromOpen);
        if (absChange >= 5) score += 40;
        else if (absChange >= 3) score += 30;
        else if (absChange >= 2) score += 20;
        else if (absChange >= 1) score += 10;
        
        // Range expansion (max 20)
        if (state.intradayRangePercent >= 5) score += 20;
        else if (state.intradayRangePercent >= 3) score += 15;
        else if (state.intradayRangePercent >= 2) score += 10;
        
        // Relative strength (max 20)
        if (state.relativeStrengthVsIndex >= 3) score += 20;
        else if (state.relativeStrengthVsIndex >= 2) score += 15;
        else if (state.relativeStrengthVsIndex >= 1) score += 10;
        
        // VWAP deviation (max 20)
        const vwapDev = Math.abs(state.vwapDeviation);
        if (vwapDev >= 2) score += 20;
        else if (vwapDev >= 1) score += 10;
        
        return Math.min(100, score);
    }

    // 🔴 PREMIUM TRACKING FOR OPTIONS
    recordPremiumSnapshot(token, premium, isOption = true) {
        if (!isOption || premium <= 0) return;
        
        let snapshot = this.premiumSnapshots.get(token);
        
        if (!snapshot) {
            snapshot = {
                startPremium: premium,
                currentPremium: premium,
                maxPremium: premium,
                percentGrowth: 0,
                lastUpdate: Date.now()
            };
            this.premiumSnapshots.set(token, snapshot);
        } else {
            snapshot.currentPremium = premium;
            if (premium > snapshot.maxPremium) snapshot.maxPremium = premium;
            snapshot.percentGrowth = ((premium - snapshot.startPremium) / snapshot.startPremium) * 100;
            snapshot.lastUpdate = Date.now();
        }
    }

    updatePremiumRankings() {
        const premiumStates = Array.from(this.premiumSnapshots.entries())
            .map(([token, snapshot]) => ({
                token,
                ...snapshot
            }))
            .filter(s => s.percentGrowth >= 30)
            .sort((a, b) => b.percentGrowth - a.percentGrowth)
            .slice(0, this.config.maxRankingSize);

        this.rankings.topPremiumGrowth = premiumStates.map(s => ({
            token: s.token,
            startPremium: s.startPremium,
            currentPremium: s.currentPremium,
            maxPremium: s.maxPremium,
            percentGrowth: parseFloat(s.percentGrowth.toFixed(2)),
            tier: this.getPremiumTier(s.percentGrowth),
            lastUpdate: s.lastUpdate
        }));
    }

    getPremiumTier(percentGrowth) {
        if (percentGrowth >= 1000) return '1000%';
        if (percentGrowth >= 500) return '500%';
        if (percentGrowth >= 200) return '200%';
        if (percentGrowth >= 100) return '100%';
        if (percentGrowth >= 50) return '50%';
        return 'below_50%';
    }

    formatRanking(state, type) {
        const base = {
            token: state.token,
            symbol: state.symbol || state.token,
            ltp: state.ltp,
            percentChangeFromOpen: state.percentChangeFromOpen,
            percentChangeFromClose: state.percentChangeFromPrevClose,
            relativeStrength: state.relativeStrengthVsIndex,
            lastUpdate: state.lastUpdate
        };

        switch (type) {
            case 'gainer':
            case 'loser':
                return { ...base, rank: 'by_percent_change' };
            case 'range':
                return { ...base, intradayRange: state.intradayRangePercent };
            case 'volume':
                return { ...base, volumeRatio: state.volumeRatio };
            case 'strength':
                return { ...base, vsNifty: state.relativeStrengthVsIndex };
            case 'momentum':
                return { ...base, momentumScore: state.momentumScore };
            default:
                return base;
        }
    }

    // 🔴 GETTERS
    
    getTopGainers(count = 20) {
        return this.rankings.topGainers.slice(0, count);
    }

    getTopLosers(count = 20) {
        return this.rankings.topLosers.slice(0, count);
    }

    getTopRangeExpansion(count = 20) {
        return this.rankings.topRangeExpansion.slice(0, count);
    }

    getTopVolumeSpike(count = 20) {
        return this.rankings.topVolumeSpike.slice(0, count);
    }

    getTopRelativeStrength(count = 20) {
        return this.rankings.topRelativeStrength.slice(0, count);
    }

    getTopMomentum(count = 20) {
        return this.rankings.topIntradayMomentum.slice(0, count);
    }

    getTopPremiumGrowth(count = 20) {
        return this.rankings.topPremiumGrowth.slice(0, count);
    }

    getAllRankings() {
        return {
            topGainers: this.rankings.topGainers.slice(0, 10),
            topLosers: this.rankings.topLosers.slice(0, 10),
            topRangeExpansion: this.rankings.topRangeExpansion.slice(0, 10),
            topVolumeSpike: this.rankings.topVolumeSpike.slice(0, 10),
            topRelativeStrength: this.rankings.topRelativeStrength.slice(0, 10),
            topIntradayMomentum: this.rankings.topIntradayMomentum.slice(0, 10),
            topPremiumGrowth: this.rankings.topPremiumGrowth.slice(0, 10),
            lastUpdate: this.lastUpdate
        };
    }

    getStats() {
        return {
            lastUpdate: this.lastUpdate,
            rankings: {
                gainers: this.rankings.topGainers.length,
                losers: this.rankings.topLosers.length,
                rangeExpansion: this.rankings.topRangeExpansion.length,
                volumeSpike: this.rankings.topVolumeSpike.length,
                relativeStrength: this.rankings.topRelativeStrength.length,
                momentum: this.rankings.topIntradayMomentum.length,
                premiumGrowth: this.rankings.topPremiumGrowth.length
            },
            premiumTracking: this.premiumSnapshots.size
        };
    }

    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    resetDaily() {
        this.premiumSnapshots.clear();
        Object.keys(this.rankings).forEach(key => {
            this.rankings[key] = [];
        });
    }
}

module.exports = new GlobalRankingService();
