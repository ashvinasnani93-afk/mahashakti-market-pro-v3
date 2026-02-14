const instruments = require('../config/instruments.config');
const orchestratorService = require('./orchestrator.service');
const explosionService = require('./explosion.service');
const premiumMomentumService = require('./premiumMomentum.service');
const marketScannerLoopService = require('./marketScannerLoop.service');

class MarketAggregatorService {
    constructor() {
        this.lastUpdate = null;
        this.screen1Cache = null;
        this.screen2Cache = null;
        this.cacheExpiry = 5000;
    }

    getScreen1Data() {
        if (this.screen1Cache && Date.now() - this.lastUpdate < this.cacheExpiry) {
            return this.screen1Cache;
        }

        const allSignals = orchestratorService.getActiveSignals();
        
        const indicesSignals = allSignals.filter(s => {
            const inst = instruments.getByToken(s.instrument.token);
            return inst && instruments.getIndices().some(idx => idx.token === inst.token);
        }).map(s => this.formatSignalForScreen(s));

        const stockSignals = allSignals.filter(s => {
            const inst = instruments.getByToken(s.instrument.token);
            if (!inst) return false;
            const isIndex = instruments.getIndices().some(idx => idx.token === inst.token);
            const isOption = s.instrument.symbol?.includes('CE') || s.instrument.symbol?.includes('PE');
            return !isIndex && !isOption;
        }).map(s => this.formatSignalForScreen(s));

        const optionSignals = allSignals.filter(s => {
            const symbol = s.instrument.symbol || '';
            return symbol.includes('CE') || symbol.includes('PE');
        }).map(s => this.formatSignalForScreen(s));

        this.screen1Cache = {
            indices: indicesSignals.sort((a, b) => b.strength - a.strength),
            stocks: stockSignals.sort((a, b) => b.strength - a.strength).slice(0, 20),
            options: optionSignals.sort((a, b) => b.strength - a.strength).slice(0, 20),
            totalSignals: allSignals.length,
            timestamp: new Date().toISOString()
        };

        this.lastUpdate = Date.now();
        return this.screen1Cache;
    }

    getScreen2Data() {
        if (this.screen2Cache && Date.now() - this.lastUpdate < this.cacheExpiry) {
            return this.screen2Cache;
        }

        const stockRunners = marketScannerLoopService.getBigRunners()
            .map(r => this.formatRunnerForScreen(r, 'STOCK'));

        const runners15to20 = explosionService.get15to20PercentMovers()
            .map(r => ({
                symbol: instruments.getByToken(r.token)?.symbol || r.token,
                token: r.token,
                movePercent: parseFloat(r.movePercent.toFixed(2)),
                startPrice: r.startPrice,
                currentPrice: r.currentPrice,
                direction: r.movePercent > 0 ? 'UP' : 'DOWN',
                timestamp: new Date(r.timestamp).toISOString()
            }));

        const topRunners = explosionService.getTopRunners(20)
            .map(r => ({
                symbol: instruments.getByToken(r.token)?.symbol || r.token,
                token: r.token,
                movePercent: parseFloat(r.movePercent.toFixed(2)),
                startPrice: r.startPrice,
                currentPrice: r.currentPrice,
                direction: r.movePercent > 0 ? 'UP' : 'DOWN',
                timestamp: new Date(r.timestamp).toISOString()
            }));

        const premiumExplosions = premiumMomentumService.getExplosionCandidates()
            .map(c => ({
                symbol: c.symbol,
                token: c.token,
                currentPremium: c.currentPremium,
                delta5mPercent: parseFloat(c.delta5mPercent.toFixed(2)),
                delta15mPercent: parseFloat(c.delta15mPercent.toFixed(2)),
                volumeChangePercent: parseFloat(c.volumeChangePercent.toFixed(2)),
                accelerationScore: c.accelerationScore,
                direction: c.delta5mPercent > 0 ? 'UP' : 'DOWN',
                timestamp: new Date(c.timestamp).toISOString()
            }));

        const premiumBigMovers = premiumMomentumService.getBigMovers(15)
            .map(m => ({
                symbol: m.symbol,
                token: m.token,
                currentPremium: m.currentPremium,
                deltaFromOpenPercent: parseFloat(m.deltaFromOpenPercent.toFixed(2)),
                accelerationScore: m.accelerationScore,
                direction: m.deltaFromOpenPercent > 0 ? 'UP' : 'DOWN',
                timestamp: new Date(m.timestamp).toISOString()
            }));

        const gammaAccelerators = explosionService.getGammaAccelerators(10)
            .map(g => ({
                symbol: g.symbol,
                token: g.token,
                gammaScore: parseFloat(g.gammaScore.toFixed(2)),
                delta5m: parseFloat(g.delta5m.toFixed(2)),
                delta15m: parseFloat(g.delta15m.toFixed(2)),
                timestamp: new Date(g.timestamp).toISOString()
            }));

        const activeExplosions = explosionService.getActiveExplosions()
            .map(e => ({
                symbol: e.instrument.symbol,
                token: e.instrument.token,
                price: e.price,
                severity: e.severity,
                direction: e.direction,
                rank: e.rank,
                types: e.types.map(t => t.type),
                actionable: e.actionable,
                timestamp: new Date(e.timestamp).toISOString()
            }));

        const explosionStocks = [...stockRunners, ...runners15to20, ...topRunners]
            .filter((item, index, self) => 
                index === self.findIndex(t => t.token === item.token)
            )
            .sort((a, b) => Math.abs(b.movePercent || 0) - Math.abs(a.movePercent || 0))
            .slice(0, 20);

        const explosionOptions = [...premiumExplosions, ...premiumBigMovers]
            .filter((item, index, self) => 
                index === self.findIndex(t => t.token === item.token)
            )
            .sort((a, b) => (b.accelerationScore || 0) - (a.accelerationScore || 0))
            .slice(0, 20);

        this.screen2Cache = {
            explosionStocks,
            explosionOptions,
            gammaAccelerators,
            activeExplosions: activeExplosions.slice(0, 20),
            stats: explosionService.getStats(),
            timestamp: new Date().toISOString()
        };

        return this.screen2Cache;
    }

    formatSignalForScreen(signal) {
        return {
            symbol: signal.instrument.symbol,
            token: signal.instrument.token,
            name: signal.instrument.name,
            signal: signal.signal,
            direction: signal.direction,
            strength: signal.strength,
            confidence: signal.confidence,
            price: signal.price,
            entry: signal.entry,
            stopLoss: signal.stopLoss,
            target1: signal.target1,
            target2: signal.target2,
            riskReward: signal.riskReward,
            timestamp: new Date(signal.timestamp).toISOString()
        };
    }

    formatRunnerForScreen(runner, type) {
        return {
            symbol: runner.instrument?.symbol || 'UNKNOWN',
            token: runner.instrument?.token,
            type,
            movePercent: parseFloat((runner.priceChangePercent || 0).toFixed(2)),
            momentumScore: runner.momentumScore || 0,
            volumeRatio: runner.volumeRatio || 0,
            direction: (runner.priceChangePercent || 0) > 0 ? 'UP' : 'DOWN',
            timestamp: new Date(runner.timestamp || Date.now()).toISOString()
        };
    }

    getCombinedData() {
        return {
            screen1: this.getScreen1Data(),
            screen2: this.getScreen2Data()
        };
    }

    getTopSignals(count = 10) {
        const screen1 = this.getScreen1Data();
        const allSignals = [
            ...screen1.indices,
            ...screen1.stocks,
            ...screen1.options
        ];

        return allSignals
            .sort((a, b) => b.strength - a.strength)
            .slice(0, count);
    }

    getTopExplosions(count = 10) {
        const screen2 = this.getScreen2Data();
        const allExplosions = [
            ...screen2.explosionStocks,
            ...screen2.explosionOptions
        ];

        return allExplosions
            .sort((a, b) => {
                const scoreA = Math.abs(a.movePercent || 0) + (a.accelerationScore || 0);
                const scoreB = Math.abs(b.movePercent || 0) + (b.accelerationScore || 0);
                return scoreB - scoreA;
            })
            .slice(0, count);
    }

    getSummary() {
        const screen1 = this.getScreen1Data();
        const screen2 = this.getScreen2Data();

        return {
            signalSummary: {
                totalSignals: screen1.totalSignals,
                indicesCount: screen1.indices.length,
                stocksCount: screen1.stocks.length,
                optionsCount: screen1.options.length,
                strongSignals: [...screen1.indices, ...screen1.stocks, ...screen1.options]
                    .filter(s => s.signal === 'STRONG_BUY' || s.signal === 'STRONG_SELL').length
            },
            explosionSummary: {
                stockExplosions: screen2.explosionStocks.length,
                optionExplosions: screen2.explosionOptions.length,
                gammaAccelerators: screen2.gammaAccelerators.length,
                activeExplosions: screen2.activeExplosions.length
            },
            marketHealth: this.calculateMarketHealth(screen1, screen2),
            timestamp: new Date().toISOString()
        };
    }

    calculateMarketHealth(screen1, screen2) {
        const buySignals = [...screen1.indices, ...screen1.stocks]
            .filter(s => s.signal === 'BUY' || s.signal === 'STRONG_BUY').length;
        const sellSignals = [...screen1.indices, ...screen1.stocks]
            .filter(s => s.signal === 'SELL' || s.signal === 'STRONG_SELL').length;
        
        const upExplosions = screen2.explosionStocks.filter(e => e.direction === 'UP').length;
        const downExplosions = screen2.explosionStocks.filter(e => e.direction === 'DOWN').length;

        let sentiment = 'NEUTRAL';
        if (buySignals > sellSignals * 1.5 && upExplosions > downExplosions) {
            sentiment = 'BULLISH';
        } else if (sellSignals > buySignals * 1.5 && downExplosions > upExplosions) {
            sentiment = 'BEARISH';
        }

        const activityScore = Math.min(100, 
            (screen1.totalSignals * 5) + 
            (screen2.explosionStocks.length * 10) + 
            (screen2.activeExplosions.length * 15)
        );

        return {
            sentiment,
            activityScore,
            buyVsSell: { buy: buySignals, sell: sellSignals },
            explosionDirection: { up: upExplosions, down: downExplosions }
        };
    }

    invalidateCache() {
        this.screen1Cache = null;
        this.screen2Cache = null;
        this.lastUpdate = null;
    }
}

module.exports = new MarketAggregatorService();
