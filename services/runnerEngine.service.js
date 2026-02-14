const instruments = require('../config/instruments.config');
const settings = require('../config/settings.config');
const wsService = require('./websocket.service');

class RunnerEngineService {
    constructor() {
        this.runners = new Map();
        this.earlyMovers = new Map();
        this.volumeLeaders = new Map();
        this.sectorStrength = new Map();
        this.rangeBreakouts = new Map();
        this.atrExpansions = new Map();
        this.priceHistory = new Map();
        this.lastScan = null;
        this.topRunners = [];
        
        // 🔴 INTRADAY CUMULATIVE TRACKER (Open → Current)
        this.intradayTrackers = new Map();  // token -> { openPrice, currentPrice, percentMove, tiers }
        this.tierAlerts = new Map();        // token -> [triggered tiers]
        
        // 🔴 PREMIUM GROWTH TRACKER (for options)
        this.premiumTrackers = new Map();   // token -> { startPremium, currentPremium, percentGain, tiers }
        this.premiumTierAlerts = new Map(); // token -> [triggered tiers]
        
        // Tier configurations
        this.equityTiers = [8, 12, 15, 20];
        this.premiumTiers = [50, 100, 200, 500, 1000];
        
        this.config = {
            earlyMovePercent: 1.5,
            volumeSpikeMultiplier: 3,
            rangeBreakoutATRMultiplier: 1.5,
            atrExpansionThreshold: 1.3,
            runnerThreshold: 5,
            bigRunnerThreshold: 15,
            maxRunners: 50
        };
    }

    initialize() {
        console.log('[RUNNER_ENGINE] Initializing runner detection engine...');
        this.loadConfig();
        
        wsService.onPrice((data) => {
            this.handleLivePrice(data);
        });
        
        console.log('[RUNNER_ENGINE] Initialized');
    }

    loadConfig() {
        const runnerConfig = settings.runners || {};
        this.config = {
            ...this.config,
            ...runnerConfig
        };
    }

    handleLivePrice(data) {
        const { token, ltp, volume, timestamp, open } = data;
        this.recordPrice(token, ltp, volume, timestamp);
        
        // 🔴 INTRADAY CUMULATIVE TRACKING
        if (open && open > 0) {
            this.updateIntradayTracker(token, open, ltp);
        }
    }

    // 🔴 INTRADAY CUMULATIVE % TRACKER
    updateIntradayTracker(token, openPrice, currentPrice) {
        const percentMove = ((currentPrice - openPrice) / openPrice) * 100;
        const triggeredTiers = this.tierAlerts.get(token) || [];
        const newTiers = [];
        
        // Check each tier (8%, 12%, 15%, 20%)
        for (const tier of this.equityTiers) {
            if (Math.abs(percentMove) >= tier && !triggeredTiers.includes(tier)) {
                newTiers.push(tier);
                console.log(`[RUNNER_ENGINE] 🔥 TIER ${tier}% TRIGGERED | Token: ${token} | Move: ${percentMove.toFixed(2)}%`);
            }
        }
        
        if (newTiers.length > 0) {
            this.tierAlerts.set(token, [...triggeredTiers, ...newTiers]);
        }
        
        this.intradayTrackers.set(token, {
            openPrice,
            currentPrice,
            percentMove: parseFloat(percentMove.toFixed(2)),
            direction: percentMove > 0 ? 'UP' : 'DOWN',
            triggeredTiers: this.tierAlerts.get(token) || [],
            lastUpdate: Date.now()
        });
    }

    // 🔴 PREMIUM GROWTH TRACKER (for options)
    updatePremiumTracker(token, startPremium, currentPremium, isOption = true) {
        if (!isOption || startPremium <= 0) return;
        
        const percentGain = ((currentPremium - startPremium) / startPremium) * 100;
        const triggeredTiers = this.premiumTierAlerts.get(token) || [];
        const newTiers = [];
        
        // Check each tier (50%, 100%, 200%, 500%, 1000%)
        for (const tier of this.premiumTiers) {
            if (percentGain >= tier && !triggeredTiers.includes(tier)) {
                newTiers.push(tier);
                console.log(`[RUNNER_ENGINE] 💎 PREMIUM ${tier}% TRIGGERED | Token: ${token} | Gain: ${percentGain.toFixed(2)}%`);
            }
        }
        
        if (newTiers.length > 0) {
            this.premiumTierAlerts.set(token, [...triggeredTiers, ...newTiers]);
        }
        
        this.premiumTrackers.set(token, {
            startPremium,
            currentPremium,
            percentGain: parseFloat(percentGain.toFixed(2)),
            triggeredTiers: this.premiumTierAlerts.get(token) || [],
            lastUpdate: Date.now()
        });
    }

    // 🔴 GET INTRADAY TIER RUNNERS
    getIntradayTierRunners(minTier = 8) {
        return Array.from(this.intradayTrackers.entries())
            .filter(([_, data]) => Math.abs(data.percentMove) >= minTier)
            .map(([token, data]) => ({ token, ...data }))
            .sort((a, b) => Math.abs(b.percentMove) - Math.abs(a.percentMove));
    }

    // 🔴 GET PREMIUM TIER EXPLOSIONS
    getPremiumTierExplosions(minTier = 50) {
        return Array.from(this.premiumTrackers.entries())
            .filter(([_, data]) => data.percentGain >= minTier)
            .map(([token, data]) => ({ token, ...data }))
            .sort((a, b) => b.percentGain - a.percentGain);
    }

    recordPrice(token, price, volume, timestamp = Date.now()) {
        const history = this.priceHistory.get(token) || [];
        
        history.push({ price, volume, timestamp });
        
        if (history.length > 200) {
            history.shift();
        }
        
        this.priceHistory.set(token, history);
        
        this.checkForRunner(token, history, price, volume);
    }

    checkForRunner(token, history, currentPrice, currentVolume) {
        if (history.length < 10) return;

        const instrument = instruments.getByToken(token);
        if (!instrument) return;

        const detections = [];

        const earlyMove = this.detectEarlyMove(history, currentPrice);
        if (earlyMove) detections.push(earlyMove);

        const volumeSpike = this.detectVolumeSpike(history, currentVolume);
        if (volumeSpike) detections.push(volumeSpike);

        const rangeBreakout = this.detectRangeBreakout(history, currentPrice);
        if (rangeBreakout) detections.push(rangeBreakout);

        const atrExpansion = this.detectATRExpansion(history);
        if (atrExpansion) detections.push(atrExpansion);

        // STRICT RUNNER VALIDATION FOR SCREEN 2
        const strictValidation = this.validateStrictRunner(history, currentPrice, currentVolume, detections, instrument);
        
        if (strictValidation.valid) {
            const runner = this.createRunnerRecord(instrument, history, currentPrice, currentVolume, detections);
            runner.strictValidation = strictValidation;
            this.runners.set(token, runner);
            this.updateTopRunners();
        }
    }

    validateStrictRunner(history, currentPrice, currentVolume, detections, instrument) {
        const validation = {
            valid: false,
            conditions: {},
            failedConditions: []
        };

        // Condition 1: Price move >= 1.5% in 15 mins (approx 15 data points)
        const recentHistory = history.slice(-15);
        if (recentHistory.length >= 15) {
            const firstPrice = recentHistory[0].price;
            const movePercent = Math.abs((currentPrice - firstPrice) / firstPrice) * 100;
            validation.conditions.priceMove15min = movePercent >= 1.5;
            if (!validation.conditions.priceMove15min) {
                validation.failedConditions.push(`Price move ${movePercent.toFixed(2)}% < 1.5%`);
            }
        } else {
            validation.conditions.priceMove15min = false;
            validation.failedConditions.push('Insufficient 15min history');
        }

        // Condition 2: Volume spike >= 3x
        const volumeDetection = detections.find(d => d.type === 'VOLUME_SPIKE');
        validation.conditions.volumeSpike3x = volumeDetection && volumeDetection.volumeRatio >= 3;
        if (!validation.conditions.volumeSpike3x) {
            const ratio = volumeDetection?.volumeRatio || 0;
            validation.failedConditions.push(`Volume ${ratio.toFixed(2)}x < 3x`);
        }

        // Condition 3: Sector strength >= 60 percentile
        const sectorData = this.sectorStrength.get(instrument.sector);
        const sectorScore = sectorData?.outperformance || 0;
        validation.conditions.sectorStrength = sectorScore >= 12; // 60 percentile = 12+ score
        if (!validation.conditions.sectorStrength) {
            validation.failedConditions.push(`Sector score ${sectorScore.toFixed(0)} < 12`);
        }

        // Condition 4: ATR expanding
        const atrDetection = detections.find(d => d.type === 'ATR_EXPANSION');
        validation.conditions.atrExpanding = !!atrDetection;
        if (!validation.conditions.atrExpanding) {
            validation.failedConditions.push('ATR not expanding');
        }

        // Condition 5: Liquidity > minimum threshold (50000 avg volume)
        const avgVolume = history.reduce((sum, h) => sum + h.volume, 0) / history.length;
        validation.conditions.liquidityOk = avgVolume >= 50000;
        if (!validation.conditions.liquidityOk) {
            validation.failedConditions.push(`Avg volume ${Math.round(avgVolume)} < 50000`);
        }

        // Runner is valid only if AT LEAST 4 out of 5 conditions pass
        const passedCount = Object.values(validation.conditions).filter(v => v === true).length;
        validation.valid = passedCount >= 4;
        validation.passedCount = passedCount;
        validation.totalConditions = 5;

        return validation;
    }

    detectEarlyMove(history, currentPrice) {
        if (history.length < 5) return null;

        const firstPrice = history[0].price;
        const movePercent = ((currentPrice - firstPrice) / firstPrice) * 100;

        if (Math.abs(movePercent) >= this.config.earlyMovePercent) {
            this.earlyMovers.set(history[0].token, {
                movePercent,
                direction: movePercent > 0 ? 'UP' : 'DOWN',
                timestamp: Date.now()
            });

            return {
                type: 'EARLY_MOVE',
                movePercent: parseFloat(movePercent.toFixed(2)),
                direction: movePercent > 0 ? 'UP' : 'DOWN',
                strength: Math.min(1, Math.abs(movePercent) / (this.config.earlyMovePercent * 3))
            };
        }

        return null;
    }

    detectVolumeSpike(history, currentVolume) {
        if (history.length < 20) return null;

        const recentVolumes = history.slice(-20).map(h => h.volume);
        const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;

        if (avgVolume === 0) return null;

        const volumeRatio = currentVolume / avgVolume;

        if (volumeRatio >= this.config.volumeSpikeMultiplier) {
            return {
                type: 'VOLUME_SPIKE',
                volumeRatio: parseFloat(volumeRatio.toFixed(2)),
                currentVolume,
                avgVolume: Math.round(avgVolume),
                strength: Math.min(1, volumeRatio / (this.config.volumeSpikeMultiplier * 2))
            };
        }

        return null;
    }

    detectRangeBreakout(history, currentPrice) {
        if (history.length < 30) return null;

        const prices = history.slice(0, -5).map(h => h.price);
        const high = Math.max(...prices);
        const low = Math.min(...prices);
        const range = high - low;

        if (range === 0) return null;

        const avgPrice = (high + low) / 2;
        const atr = range;

        const breakoutUp = currentPrice > high + (atr * 0.1);
        const breakoutDown = currentPrice < low - (atr * 0.1);

        if (breakoutUp || breakoutDown) {
            const breakoutPercent = breakoutUp 
                ? ((currentPrice - high) / high) * 100
                : ((low - currentPrice) / low) * 100;

            this.rangeBreakouts.set(history[0]?.token, {
                direction: breakoutUp ? 'UP' : 'DOWN',
                breakoutPercent,
                timestamp: Date.now()
            });

            return {
                type: 'RANGE_BREAKOUT',
                direction: breakoutUp ? 'UP' : 'DOWN',
                breakoutPercent: parseFloat(Math.abs(breakoutPercent).toFixed(2)),
                previousHigh: high,
                previousLow: low,
                currentPrice,
                strength: Math.min(1, Math.abs(breakoutPercent) / 3)
            };
        }

        return null;
    }

    detectATRExpansion(history) {
        if (history.length < 30) return null;

        const recentBars = history.slice(-10);
        const olderBars = history.slice(-30, -10);

        const recentATR = this.calculateATR(recentBars);
        const olderATR = this.calculateATR(olderBars);

        if (olderATR === 0) return null;

        const atrRatio = recentATR / olderATR;

        if (atrRatio >= this.config.atrExpansionThreshold) {
            return {
                type: 'ATR_EXPANSION',
                atrRatio: parseFloat(atrRatio.toFixed(2)),
                recentATR: parseFloat(recentATR.toFixed(2)),
                olderATR: parseFloat(olderATR.toFixed(2)),
                strength: Math.min(1, (atrRatio - 1) / 0.5)
            };
        }

        return null;
    }

    calculateATR(bars) {
        if (bars.length < 2) return 0;

        let totalRange = 0;
        for (let i = 1; i < bars.length; i++) {
            const high = Math.max(bars[i].price, bars[i - 1].price);
            const low = Math.min(bars[i].price, bars[i - 1].price);
            totalRange += (high - low);
        }

        return totalRange / (bars.length - 1);
    }

    createRunnerRecord(instrument, history, currentPrice, currentVolume, detections) {
        const firstPrice = history[0].price;
        const totalMovePercent = ((currentPrice - firstPrice) / firstPrice) * 100;

        let totalScore = 0;
        detections.forEach(d => {
            totalScore += (d.strength || 0.5) * 25;
        });

        const sectorScore = this.getSectorOutperformance(instrument);
        totalScore += sectorScore;

        return {
            instrument: {
                symbol: instrument.symbol,
                token: instrument.token,
                name: instrument.name,
                sector: instrument.sector,
                exchange: instrument.exchange
            },
            currentPrice,
            startPrice: firstPrice,
            totalMovePercent: parseFloat(totalMovePercent.toFixed(2)),
            direction: totalMovePercent > 0 ? 'UP' : 'DOWN',
            currentVolume,
            detections,
            detectionCount: detections.length,
            score: Math.min(100, totalScore),
            sectorOutperformance: sectorScore,
            isRunner: Math.abs(totalMovePercent) >= this.config.runnerThreshold,
            isBigRunner: Math.abs(totalMovePercent) >= this.config.bigRunnerThreshold,
            timestamp: Date.now()
        };
    }

    getSectorOutperformance(instrument) {
        if (!instrument.sector) return 0;

        const sectorData = this.sectorStrength.get(instrument.sector);
        if (!sectorData) return 0;

        return sectorData.outperformance || 0;
    }

    async calculateSectorStrength() {
        const sectors = Object.keys(instruments.sectors);
        
        for (const sector of sectors) {
            const sectorStocks = instruments.getBySector(sector);
            if (sectorStocks.length === 0) continue;

            let totalMove = 0;
            let count = 0;

            for (const stock of sectorStocks) {
                const history = this.priceHistory.get(stock.token);
                if (history && history.length >= 10) {
                    const firstPrice = history[0].price;
                    const lastPrice = history[history.length - 1].price;
                    const movePercent = ((lastPrice - firstPrice) / firstPrice) * 100;
                    totalMove += movePercent;
                    count++;
                }
            }

            const avgMove = count > 0 ? totalMove / count : 0;
            
            this.sectorStrength.set(sector, {
                sector,
                avgMovePercent: parseFloat(avgMove.toFixed(2)),
                stockCount: count,
                outperformance: avgMove > 1 ? Math.min(20, avgMove * 5) : 0,
                timestamp: Date.now()
            });
        }
    }

    updateTopRunners() {
        this.topRunners = Array.from(this.runners.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, this.config.maxRunners);
    }

    getTopRunners(count = 10) {
        // 🔴 EXPOSE TOP 10 WITH runnerScore
        return this.topRunners
            .filter(r => r.strictValidation && r.strictValidation.valid)
            .slice(0, count)
            .map(runner => ({
                ...runner,
                runnerScore: this.calculateRunnerScore(runner)
            }));
    }

    calculateRunnerScore(runner) {
        let score = 0;
        
        // Base score from detection count
        score += (runner.detectionCount || 0) * 10;
        
        // Move percent bonus
        const movePercent = Math.abs(runner.totalMovePercent || 0);
        if (movePercent >= 15) score += 40;
        else if (movePercent >= 10) score += 30;
        else if (movePercent >= 5) score += 20;
        else if (movePercent >= 3) score += 10;
        
        // Strict validation bonus
        if (runner.strictValidation) {
            score += runner.strictValidation.passedCount * 8;
        }
        
        // Sector outperformance
        score += (runner.sectorOutperformance || 0);
        
        return Math.min(100, score);
    }

    getRunnersByMovePercent(minMove = 5, count = 20) {
        return Array.from(this.runners.values())
            .filter(r => Math.abs(r.totalMovePercent) >= minMove)
            .sort((a, b) => Math.abs(b.totalMovePercent) - Math.abs(a.totalMovePercent))
            .slice(0, count);
    }

    getBigRunners(count = 10) {
        return Array.from(this.runners.values())
            .filter(r => r.isBigRunner)
            .sort((a, b) => Math.abs(b.totalMovePercent) - Math.abs(a.totalMovePercent))
            .slice(0, count);
    }

    getEarlyMovers(count = 10) {
        return Array.from(this.earlyMovers.entries())
            .sort((a, b) => Math.abs(b[1].movePercent) - Math.abs(a[1].movePercent))
            .slice(0, count)
            .map(([token, data]) => ({
                token,
                symbol: instruments.getByToken(token)?.symbol || token,
                ...data
            }));
    }

    getVolumeLeaders(count = 10) {
        return Array.from(this.volumeLeaders.values())
            .sort((a, b) => b.volumeRatio - a.volumeRatio)
            .slice(0, count);
    }

    getRangeBreakouts(count = 10) {
        return Array.from(this.rangeBreakouts.values())
            .sort((a, b) => Math.abs(b.breakoutPercent) - Math.abs(a.breakoutPercent))
            .slice(0, count);
    }

    getSectorStrengthReport() {
        return Array.from(this.sectorStrength.values())
            .sort((a, b) => b.avgMovePercent - a.avgMovePercent);
    }

    getRunnerByToken(token) {
        return this.runners.get(token);
    }

    getStatus() {
        return {
            totalRunners: this.runners.size,
            topRunnersCount: this.topRunners.length,
            earlyMovers: this.earlyMovers.size,
            volumeLeaders: this.volumeLeaders.size,
            rangeBreakouts: this.rangeBreakouts.size,
            sectorsTracked: this.sectorStrength.size,
            priceHistoryTokens: this.priceHistory.size,
            lastScan: this.lastScan
        };
    }

    clearData() {
        this.runners.clear();
        this.earlyMovers.clear();
        this.volumeLeaders.clear();
        this.rangeBreakouts.clear();
        this.atrExpansions.clear();
        this.priceHistory.clear();
        this.topRunners = [];
    }

    resetDaily() {
        this.runners.clear();
        this.earlyMovers.clear();
        this.volumeLeaders.clear();
        this.rangeBreakouts.clear();
        this.atrExpansions.clear();
        this.topRunners = [];
        console.log('[RUNNER_ENGINE] Daily reset complete');
    }
}

module.exports = new RunnerEngineService();
