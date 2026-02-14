/**
 * 🔴 MARKET ROUTES - Unified Market Snapshot API
 * Primary dashboard feed endpoint
 */

const express = require('express');
const router = express.Router();

const marketStateService = require('../services/marketState.service');
const globalRankingService = require('../services/globalRanking.service');
const regimeService = require('../services/regime.service');
const safetyService = require('../services/safety.service');
const runnerEngineService = require('../services/runnerEngine.service');
const capitalGuardService = require('../services/capitalGuard.service');

// 🔴 GET /api/market/full-overview - Primary Dashboard Feed
router.get('/full-overview', (req, res) => {
    try {
        const rankings = globalRankingService.getAllRankings();
        const regime = regimeService.getCurrentRegime();
        const dayType = regimeService.getDayType();
        const vix = safetyService.getVIXData();
        const indexPrices = marketStateService.getIndexPrices();
        const protection = capitalGuardService.getProtectionState();
        
        // Get tier hits
        const intradayTiers = runnerEngineService.getIntradayTierRunners(8);
        const premiumTiers = runnerEngineService.getPremiumTierExplosions(50);
        
        res.json({
            success: true,
            data: {
                indexMoves: indexPrices,
                topGainers: rankings.topGainers,
                topLosers: rankings.topLosers,
                topMomentum: rankings.topIntradayMomentum,
                topVolumeSpike: rankings.topVolumeSpike,
                explosiveStrikes: rankings.topPremiumGrowth.slice(0, 10),
                regime: regime ? {
                    type: regime.regime,
                    confidence: regime.confidence,
                    tradingApproach: regime.tradingApproach,
                    shouldTrade: regime.shouldTrade
                } : null,
                dayType: dayType,
                vix: {
                    value: vix.vix,
                    level: vix.level,
                    premiumBand: vix.premiumAdjustment
                },
                intradayTierHits: {
                    count: intradayTiers.length,
                    tiers: [8, 12, 15, 20],
                    top5: intradayTiers.slice(0, 5)
                },
                premiumTierHits: {
                    count: premiumTiers.length,
                    tiers: [50, 100, 200, 500, 1000],
                    top5: premiumTiers.slice(0, 5)
                },
                protectionLevel: protection.protectionLevel,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔴 GET /api/market/rankings - All Rankings
router.get('/rankings', (req, res) => {
    try {
        const count = parseInt(req.query.count) || 20;
        const rankings = globalRankingService.getAllRankings();
        
        res.json({
            success: true,
            data: {
                topGainers: rankings.topGainers.slice(0, count),
                topLosers: rankings.topLosers.slice(0, count),
                topRangeExpansion: rankings.topRangeExpansion.slice(0, count),
                topVolumeSpike: rankings.topVolumeSpike.slice(0, count),
                topRelativeStrength: rankings.topRelativeStrength.slice(0, count),
                topMomentum: rankings.topIntradayMomentum.slice(0, count),
                lastUpdate: rankings.lastUpdate
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔴 GET /api/market/gainers - Top Gainers
router.get('/gainers', (req, res) => {
    try {
        const count = parseInt(req.query.count) || 20;
        const gainers = globalRankingService.getTopGainers(count);
        res.json({ success: true, count: gainers.length, data: gainers });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔴 GET /api/market/losers - Top Losers
router.get('/losers', (req, res) => {
    try {
        const count = parseInt(req.query.count) || 20;
        const losers = globalRankingService.getTopLosers(count);
        res.json({ success: true, count: losers.length, data: losers });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔴 GET /api/market/momentum - Top Momentum
router.get('/momentum', (req, res) => {
    try {
        const count = parseInt(req.query.count) || 20;
        const momentum = globalRankingService.getTopMomentum(count);
        res.json({ success: true, count: momentum.length, data: momentum });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔴 GET /api/market/premium-tiers - Premium Explosions
router.get('/premium-tiers', (req, res) => {
    try {
        const minTier = parseInt(req.query.minTier) || 50;
        const count = parseInt(req.query.count) || 20;
        const premiums = globalRankingService.getTopPremiumGrowth(count)
            .filter(p => p.percentGrowth >= minTier);
        
        res.json({
            success: true,
            minTier,
            tiers: [50, 100, 200, 500, 1000],
            count: premiums.length,
            data: premiums
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔴 GET /api/market/regime - Current Regime & Day Type
router.get('/regime', (req, res) => {
    try {
        const regime = regimeService.getCurrentRegime();
        const dayType = regimeService.getDayType();
        const gapInfo = regimeService.getGapInfo();
        
        res.json({
            success: true,
            data: {
                regime,
                dayType,
                gapInfo,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔴 GET /api/market/state/:token - Get State for Specific Token
router.get('/state/:token', (req, res) => {
    try {
        const { token } = req.params;
        const state = marketStateService.getState(token);
        
        if (!state) {
            return res.status(404).json({ success: false, error: 'Token not found in market state' });
        }
        
        res.json({ success: true, data: state });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔴 GET /api/market/indices - Index Prices
router.get('/indices', (req, res) => {
    try {
        const indexPrices = marketStateService.getIndexPrices();
        const stats = marketStateService.getStats();
        
        res.json({
            success: true,
            data: {
                indices: indexPrices,
                isMarketOpen: stats.isMarketOpen,
                sessionDate: stats.sessionDate
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔴 GET /api/market/protection - Capital Protection State
router.get('/protection', (req, res) => {
    try {
        const protection = capitalGuardService.getProtectionState();
        res.json({ success: true, data: protection });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔴 GET /api/market/stats - Market State Stats
router.get('/stats', (req, res) => {
    try {
        const marketStats = marketStateService.getStats();
        const rankingStats = globalRankingService.getStats();
        
        res.json({
            success: true,
            data: {
                market: marketStats,
                rankings: rankingStats
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
