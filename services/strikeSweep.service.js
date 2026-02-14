const axios = require('axios');
const config = require('../config/angel.config');
const settings = require('../config/settings.config');
const authService = require('./auth.service');
const wsService = require('./websocket.service');

class StrikeSweepService {
    constructor() {
        this.optionChainCache = new Map();
        this.selectedStrikes = new Map();
        this.atmStrikes = new Map();
        this.deepOTMStrikes = new Map();
        this.ivSpikes = new Map();
        this.oiDeltaAcceleration = new Map();
        this.premiumHistory = new Map();
        this.cacheExpiry = 60000;
        
        this.config = {
            minPremium: 3,
            maxPremium: 650,
            strikesAroundATM: 20,
            deepOTMThreshold: 0.05,
            ivSpikeThreshold: 20,
            oiDeltaThreshold: 10,
            minVolume: 1000,
            minOI: 10000
        };
    }

    async initialize() {
        console.log('[STRIKE_SWEEP] Initializing strike sweep engine...');
        this.loadConfig();
        console.log('[STRIKE_SWEEP] Initialized with config:', this.config);
    }

    loadConfig() {
        const strikeConfig = settings.strikes || {};
        this.config = {
            ...this.config,
            ...strikeConfig
        };
    }

    async sweepAllStrikes(symbol, spotPrice, exchange = 'NFO') {
        console.log(`[STRIKE_SWEEP] Sweeping strikes for ${symbol} @ ${spotPrice}`);
        
        const atmStrike = this.calculateATM(symbol, spotPrice);
        this.atmStrikes.set(symbol, { strike: atmStrike, spotPrice, timestamp: Date.now() });

        const allStrikes = await this.fetchOptionChain(symbol, exchange);
        if (!allStrikes || allStrikes.length === 0) {
            return this.generateSyntheticStrikes(symbol, spotPrice);
        }

        const atmWindow = this.getATMWindow(allStrikes, atmStrike, this.config.strikesAroundATM);
        const premiumFiltered = this.filterByPremium(atmWindow);
        const volumeFiltered = this.filterByVolume(premiumFiltered);
        const ivSpikes = this.detectIVSpikes(volumeFiltered);
        const oiAccelerated = this.detectOIDeltaAcceleration(volumeFiltered);
        const deepOTM = this.isolateDeepOTM(allStrikes, atmStrike, spotPrice);

        const result = {
            symbol,
            spotPrice,
            atmStrike,
            atmWindow: atmWindow.length,
            premiumFiltered: premiumFiltered.length,
            selectedStrikes: {
                calls: premiumFiltered.filter(s => s.optionType === 'CE').slice(0, 15),
                puts: premiumFiltered.filter(s => s.optionType === 'PE').slice(0, 15),
                ivSpikes: ivSpikes.slice(0, 10),
                oiAccelerated: oiAccelerated.slice(0, 10),
                deepOTM: deepOTM.slice(0, 10)
            },
            timestamp: Date.now()
        };

        this.selectedStrikes.set(symbol, result);
        return result;
    }

    async fetchOptionChain(symbol, exchange = 'NFO') {
        const cacheKey = `${symbol}_${exchange}`;
        const cached = this.optionChainCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.data;
        }

        await authService.ensureAuthenticated();

        try {
            const response = await axios.post(
                `${config.endpoints.base}/rest/secure/angelbroking/market/v1/optionchain`,
                { symbol, exchange },
                {
                    headers: authService.getAuthHeaders(),
                    timeout: 15000
                }
            );

            if (response.data.status && response.data.data) {
                const data = this.parseOptionChain(response.data.data);
                this.optionChainCache.set(cacheKey, { data, timestamp: Date.now() });
                return data;
            }

            return null;
        } catch (error) {
            console.error(`[STRIKE_SWEEP] Error fetching option chain for ${symbol}:`, error.message);
            return null;
        }
    }

    parseOptionChain(rawData) {
        if (!Array.isArray(rawData)) return [];
        
        return rawData.map(item => ({
            symbol: item.symbol,
            token: item.token,
            strikePrice: parseFloat(item.strikePrice) || 0,
            optionType: item.optionType,
            ltp: parseFloat(item.ltp) || 0,
            volume: parseInt(item.volume) || 0,
            oi: parseInt(item.openInterest) || 0,
            oiChange: parseInt(item.changeInOI) || 0,
            iv: parseFloat(item.impliedVolatility) || 0,
            delta: parseFloat(item.delta) || 0,
            gamma: parseFloat(item.gamma) || 0,
            theta: parseFloat(item.theta) || 0,
            vega: parseFloat(item.vega) || 0,
            bidPrice: parseFloat(item.bidPrice) || 0,
            askPrice: parseFloat(item.askPrice) || 0,
            bidQty: parseInt(item.bidQty) || 0,
            askQty: parseInt(item.askQty) || 0
        }));
    }

    calculateATM(symbol, spotPrice) {
        const strikeGap = this.getStrikeGap(symbol, spotPrice);
        return Math.round(spotPrice / strikeGap) * strikeGap;
    }

    getStrikeGap(symbol, spotPrice) {
        if (symbol === 'NIFTY') return 50;
        if (symbol === 'BANKNIFTY') return 100;
        if (symbol === 'FINNIFTY') return 50;
        if (symbol === 'MIDCPNIFTY') return 25;
        
        if (spotPrice > 5000) return 100;
        if (spotPrice > 1000) return 50;
        if (spotPrice > 500) return 25;
        if (spotPrice > 100) return 10;
        return 5;
    }

    getATMWindow(allStrikes, atmStrike, windowSize = 20) {
        const uniqueStrikes = [...new Set(allStrikes.map(s => s.strikePrice))].sort((a, b) => a - b);
        const atmIndex = uniqueStrikes.findIndex(s => s >= atmStrike);
        
        const startIdx = Math.max(0, atmIndex - windowSize);
        const endIdx = Math.min(uniqueStrikes.length, atmIndex + windowSize + 1);
        const selectedStrikePrices = new Set(uniqueStrikes.slice(startIdx, endIdx));

        return allStrikes.filter(s => selectedStrikePrices.has(s.strikePrice));
    }

    filterByPremium(strikes) {
        return strikes.filter(strike => {
            const premium = strike.ltp || 0;
            return premium >= this.config.minPremium && premium <= this.config.maxPremium;
        }).map(strike => ({
            ...strike,
            premiumScore: this.calculatePremiumScore(strike.ltp)
        })).sort((a, b) => b.premiumScore - a.premiumScore);
    }

    calculatePremiumScore(premium) {
        if (premium >= 50 && premium <= 200) return 100;
        if (premium >= 20 && premium < 50) return 80;
        if (premium >= 200 && premium <= 400) return 75;
        if (premium >= 10 && premium < 20) return 60;
        if (premium >= 400 && premium <= 650) return 50;
        if (premium >= 3 && premium < 10) return 40;
        return 0;
    }

    filterByVolume(strikes) {
        return strikes.filter(strike => {
            const volume = strike.volume || 0;
            const oi = strike.oi || 0;
            return volume >= this.config.minVolume || oi >= this.config.minOI;
        });
    }

    detectIVSpikes(strikes) {
        const avgIV = strikes.reduce((sum, s) => sum + (s.iv || 0), 0) / (strikes.length || 1);
        const threshold = avgIV * (1 + this.config.ivSpikeThreshold / 100);

        const ivSpikes = strikes.filter(strike => {
            const iv = strike.iv || 0;
            return iv > threshold;
        }).map(strike => ({
            ...strike,
            ivSpike: true,
            ivPercent: avgIV > 0 ? ((strike.iv - avgIV) / avgIV) * 100 : 0
        }));

        ivSpikes.forEach(spike => {
            this.ivSpikes.set(spike.token, {
                ...spike,
                detectedAt: Date.now()
            });
        });

        return ivSpikes.sort((a, b) => b.ivPercent - a.ivPercent);
    }

    detectOIDeltaAcceleration(strikes) {
        const accelerated = strikes.filter(strike => {
            const oiChange = strike.oiChange || 0;
            const oi = strike.oi || 1;
            const oiChangePercent = (oiChange / oi) * 100;
            
            return Math.abs(oiChangePercent) >= this.config.oiDeltaThreshold;
        }).map(strike => {
            const oiChangePercent = ((strike.oiChange || 0) / (strike.oi || 1)) * 100;
            
            let interpretation = 'NEUTRAL';
            const priceUp = strike.ltp > (strike.bidPrice + strike.askPrice) / 2;
            
            if (strike.oiChange > 0 && priceUp) interpretation = 'LONG_BUILDUP';
            else if (strike.oiChange > 0 && !priceUp) interpretation = 'SHORT_BUILDUP';
            else if (strike.oiChange < 0 && priceUp) interpretation = 'SHORT_COVERING';
            else if (strike.oiChange < 0 && !priceUp) interpretation = 'LONG_UNWINDING';

            return {
                ...strike,
                oiChangePercent,
                interpretation,
                accelerated: true
            };
        });

        accelerated.forEach(acc => {
            this.oiDeltaAcceleration.set(acc.token, {
                ...acc,
                detectedAt: Date.now()
            });
        });

        return accelerated.sort((a, b) => Math.abs(b.oiChangePercent) - Math.abs(a.oiChangePercent));
    }

    isolateDeepOTM(allStrikes, atmStrike, spotPrice) {
        const threshold = spotPrice * this.config.deepOTMThreshold;
        
        const deepOTM = allStrikes.filter(strike => {
            const diff = Math.abs(strike.strikePrice - atmStrike);
            return diff > threshold;
        }).map(strike => {
            const moneyness = strike.optionType === 'CE'
                ? (spotPrice - strike.strikePrice) / spotPrice
                : (strike.strikePrice - spotPrice) / spotPrice;
            
            return {
                ...strike,
                deepOTM: true,
                moneyness: parseFloat((moneyness * 100).toFixed(2)),
                potentialMultiplier: this.calculateOTMPotential(strike.ltp, moneyness)
            };
        }).filter(strike => {
            const premium = strike.ltp || 0;
            return premium >= 3 && premium <= 50;
        });

        deepOTM.forEach(otm => {
            this.deepOTMStrikes.set(otm.token, {
                ...otm,
                detectedAt: Date.now()
            });
        });

        return deepOTM.sort((a, b) => b.potentialMultiplier - a.potentialMultiplier);
    }

    calculateOTMPotential(premium, moneyness) {
        if (premium <= 0) return 0;
        const baseMultiplier = Math.abs(moneyness) * 10;
        const premiumBonus = premium < 20 ? 2 : premium < 50 ? 1.5 : 1;
        return Math.min(10, baseMultiplier * premiumBonus);
    }

    generateSyntheticStrikes(symbol, spotPrice) {
        const strikes = [];
        const strikeGap = this.getStrikeGap(symbol, spotPrice);
        const atmStrike = this.calculateATM(symbol, spotPrice);

        for (let i = -this.config.strikesAroundATM; i <= this.config.strikesAroundATM; i++) {
            const strikePrice = atmStrike + (i * strikeGap);
            const moneyness = (spotPrice - strikePrice) / spotPrice;
            
            strikes.push({
                symbol: `${symbol}${strikePrice}CE`,
                strikePrice,
                optionType: 'CE',
                ltp: this.estimatePremium(spotPrice, strikePrice, 'CE'),
                volume: 0,
                oi: 0,
                oiChange: 0,
                iv: 15,
                synthetic: true,
                moneyness: parseFloat((moneyness * 100).toFixed(2))
            });

            strikes.push({
                symbol: `${symbol}${strikePrice}PE`,
                strikePrice,
                optionType: 'PE',
                ltp: this.estimatePremium(spotPrice, strikePrice, 'PE'),
                volume: 0,
                oi: 0,
                oiChange: 0,
                iv: 15,
                synthetic: true,
                moneyness: parseFloat((-(moneyness) * 100).toFixed(2))
            });
        }

        return {
            symbol,
            spotPrice,
            atmStrike,
            atmWindow: strikes.length,
            premiumFiltered: strikes.filter(s => s.ltp >= 3 && s.ltp <= 650).length,
            selectedStrikes: {
                calls: strikes.filter(s => s.optionType === 'CE' && s.ltp >= 3 && s.ltp <= 650),
                puts: strikes.filter(s => s.optionType === 'PE' && s.ltp >= 3 && s.ltp <= 650),
                ivSpikes: [],
                oiAccelerated: [],
                deepOTM: []
            },
            synthetic: true,
            timestamp: Date.now()
        };
    }

    estimatePremium(spotPrice, strikePrice, optionType) {
        const moneyness = optionType === 'CE'
            ? (spotPrice - strikePrice) / spotPrice
            : (strikePrice - spotPrice) / spotPrice;
        
        const intrinsic = Math.max(0, moneyness * spotPrice);
        const timeValue = spotPrice * 0.02;
        
        return Math.max(3, intrinsic + timeValue);
    }

    recordPremiumTick(token, data) {
        const history = this.premiumHistory.get(token) || [];
        
        history.push({
            premium: data.ltp,
            volume: data.volume,
            oi: data.oi,
            timestamp: Date.now()
        });

        if (history.length > 200) {
            history.shift();
        }

        this.premiumHistory.set(token, history);

        this.checkSuddenSpike(token, history, data);
    }

    checkSuddenSpike(token, history, data) {
        if (history.length < 5) return;

        const recent = history.slice(-5);
        const older = history.slice(-10, -5);
        
        if (older.length === 0) return;

        const recentAvg = recent.reduce((sum, h) => sum + h.premium, 0) / recent.length;
        const olderAvg = older.reduce((sum, h) => sum + h.premium, 0) / older.length;

        if (olderAvg === 0) return;

        const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;

        if (Math.abs(changePercent) >= 15) {
            console.log(`[STRIKE_SWEEP] SUDDEN SPIKE detected: ${data.symbol || token} | Change: ${changePercent.toFixed(2)}%`);
        }
    }

    getSelectedStrikes(symbol) {
        return this.selectedStrikes.get(symbol);
    }

    getAllSelectedStrikes() {
        const all = [];
        this.selectedStrikes.forEach((data, symbol) => {
            all.push({ symbol, ...data });
        });
        return all;
    }

    getIVSpikes(count = 10) {
        return Array.from(this.ivSpikes.values())
            .sort((a, b) => b.ivPercent - a.ivPercent)
            .slice(0, count);
    }

    getOIDeltaAccelerated(count = 10) {
        return Array.from(this.oiDeltaAcceleration.values())
            .sort((a, b) => Math.abs(b.oiChangePercent) - Math.abs(a.oiChangePercent))
            .slice(0, count);
    }

    getDeepOTMStrikes(count = 10) {
        return Array.from(this.deepOTMStrikes.values())
            .sort((a, b) => b.potentialMultiplier - a.potentialMultiplier)
            .slice(0, count);
    }

    getStatus() {
        return {
            cachedChains: this.optionChainCache.size,
            selectedSymbols: this.selectedStrikes.size,
            ivSpikes: this.ivSpikes.size,
            oiAccelerated: this.oiDeltaAcceleration.size,
            deepOTMTracked: this.deepOTMStrikes.size,
            premiumHistoryTokens: this.premiumHistory.size
        };
    }

    clearCache() {
        this.optionChainCache.clear();
        this.selectedStrikes.clear();
        this.ivSpikes.clear();
        this.oiDeltaAcceleration.clear();
        this.deepOTMStrikes.clear();
    }
}

module.exports = new StrikeSweepService();
