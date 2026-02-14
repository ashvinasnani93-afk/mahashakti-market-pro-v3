const axios = require('axios');
const config = require('../config/angel.config');
const settings = require('../config/settings.config');
const authService = require('./auth.service');

class StrikeSelectorService {
    constructor() {
        this.strikeCache = new Map();
        this.cacheExpiry = 60000;
        this.selectedStrikes = new Map();
        this.strikeHistory = new Map();
    }

    async fetchOptionChain(symbol, exchange = 'NFO') {
        const cacheKey = `${symbol}_${exchange}`;
        const cached = this.strikeCache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.data;
        }

        await authService.ensureAuthenticated();

        try {
            const response = await axios.post(
                `${config.endpoints.base}/rest/secure/angelbroking/market/v1/optionchain`,
                {
                    symbol: symbol,
                    exchange: exchange
                },
                {
                    headers: authService.getAuthHeaders(),
                    timeout: 15000
                }
            );

            if (response.data.status && response.data.data) {
                const data = response.data.data;
                this.strikeCache.set(cacheKey, {
                    data,
                    timestamp: Date.now()
                });
                return data;
            }

            return null;
        } catch (error) {
            console.error(`[STRIKE_SELECTOR] Error fetching option chain for ${symbol}:`, error.message);
            return null;
        }
    }

    async selectStrikes(symbol, spotPrice, exchange = 'NFO') {
        const optionChain = await this.fetchOptionChain(symbol, exchange);
        
        if (!optionChain) {
            return this.generateSyntheticStrikes(symbol, spotPrice);
        }

        const premiumConfig = settings.strikes || {};
        const minPremium = premiumConfig.minPremium || 3;
        const maxPremium = premiumConfig.maxPremium || 650;
        const minVolume = premiumConfig.minVolume || 1000;
        const strikesAroundATM = premiumConfig.strikesAroundATM || 5;

        const atmStrike = this.findATMStrike(optionChain, spotPrice);
        const strikes = this.getStrikesAroundATM(optionChain, atmStrike, strikesAroundATM);

        const filteredStrikes = strikes.filter(strike => {
            const premium = strike.ltp || 0;
            const volume = strike.volume || 0;
            const oiChange = strike.oiChange || 0;

            return (
                premium >= minPremium &&
                premium <= maxPremium &&
                volume >= minVolume &&
                oiChange >= 0
            );
        });

        const rankedStrikes = this.rankStrikes(filteredStrikes);

        const topStrikes = {
            calls: rankedStrikes.filter(s => s.optionType === 'CE').slice(0, 10),
            puts: rankedStrikes.filter(s => s.optionType === 'PE').slice(0, 10),
            all: rankedStrikes.slice(0, 10)
        };

        this.selectedStrikes.set(symbol, {
            strikes: topStrikes,
            atmStrike,
            spotPrice,
            timestamp: Date.now()
        });

        return topStrikes;
    }

    generateSyntheticStrikes(symbol, spotPrice) {
        const strikes = [];
        const strikesConfig = settings.strikes || {};
        const strikeGap = this.getStrikeGap(symbol, spotPrice);

        const atmStrike = Math.round(spotPrice / strikeGap) * strikeGap;

        for (let i = -5; i <= 5; i++) {
            const strikePrice = atmStrike + (i * strikeGap);
            
            strikes.push({
                symbol: `${symbol}${strikePrice}CE`,
                strikePrice,
                optionType: 'CE',
                ltp: this.estimatePremium(spotPrice, strikePrice, 'CE'),
                volume: 0,
                oi: 0,
                oiChange: 0,
                synthetic: true
            });

            strikes.push({
                symbol: `${symbol}${strikePrice}PE`,
                strikePrice,
                optionType: 'PE',
                ltp: this.estimatePremium(spotPrice, strikePrice, 'PE'),
                volume: 0,
                oi: 0,
                oiChange: 0,
                synthetic: true
            });
        }

        return {
            calls: strikes.filter(s => s.optionType === 'CE'),
            puts: strikes.filter(s => s.optionType === 'PE'),
            all: strikes,
            synthetic: true
        };
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

    estimatePremium(spotPrice, strikePrice, optionType) {
        const moneyness = optionType === 'CE' 
            ? (spotPrice - strikePrice) / spotPrice 
            : (strikePrice - spotPrice) / spotPrice;
        
        const intrinsic = Math.max(0, moneyness * spotPrice);
        const timeValue = spotPrice * 0.02;
        
        return Math.max(3, intrinsic + timeValue);
    }

    findATMStrike(optionChain, spotPrice) {
        if (!optionChain || !Array.isArray(optionChain)) {
            return Math.round(spotPrice / 50) * 50;
        }

        let closestStrike = null;
        let minDiff = Infinity;

        optionChain.forEach(item => {
            const diff = Math.abs(item.strikePrice - spotPrice);
            if (diff < minDiff) {
                minDiff = diff;
                closestStrike = item.strikePrice;
            }
        });

        return closestStrike || Math.round(spotPrice / 50) * 50;
    }

    getStrikesAroundATM(optionChain, atmStrike, count) {
        if (!optionChain || !Array.isArray(optionChain)) {
            return [];
        }

        const uniqueStrikes = [...new Set(optionChain.map(item => item.strikePrice))].sort((a, b) => a - b);
        const atmIndex = uniqueStrikes.findIndex(s => s >= atmStrike);
        
        const startIdx = Math.max(0, atmIndex - count);
        const endIdx = Math.min(uniqueStrikes.length, atmIndex + count + 1);
        const selectedStrikePrices = uniqueStrikes.slice(startIdx, endIdx);

        return optionChain.filter(item => selectedStrikePrices.includes(item.strikePrice));
    }

    rankStrikes(strikes) {
        return strikes.map(strike => {
            let score = 0;

            const volumeScore = Math.min(30, (strike.volume || 0) / 10000);
            score += volumeScore;

            const oiChangeScore = Math.min(25, Math.max(0, (strike.oiChange || 0) / 1000));
            score += oiChangeScore;

            const premiumScore = this.calculatePremiumScore(strike.ltp);
            score += premiumScore;

            if (strike.volumeChange && strike.volumeChange > 100) {
                score += 15;
            }

            if (strike.oiChange > 0 && strike.priceChange > 0) {
                score += 10;
            }

            return {
                ...strike,
                rankScore: score
            };
        }).sort((a, b) => b.rankScore - a.rankScore);
    }

    calculatePremiumScore(premium) {
        if (premium >= 50 && premium <= 200) return 20;
        if (premium >= 20 && premium < 50) return 15;
        if (premium >= 200 && premium <= 400) return 15;
        if (premium >= 10 && premium < 20) return 10;
        if (premium >= 400 && premium <= 650) return 10;
        if (premium >= 3 && premium < 10) return 5;
        return 0;
    }

    async getTopStrikesForSymbol(symbol, spotPrice, count = 10) {
        const strikes = await this.selectStrikes(symbol, spotPrice);
        return strikes.all.slice(0, count);
    }

    async getExplosionCandidateStrikes(symbol, spotPrice) {
        const strikes = await this.selectStrikes(symbol, spotPrice);
        
        return strikes.all.filter(strike => {
            const premium = strike.ltp || 0;
            const volume = strike.volume || 0;
            const oiChange = strike.oiChange || 0;

            return (
                premium >= 3 &&
                premium <= 100 &&
                volume > 5000 &&
                oiChange > 0
            );
        }).slice(0, 5);
    }

    getSelectedStrikes(symbol) {
        return this.selectedStrikes.get(symbol);
    }

    getAllSelectedStrikes() {
        const all = [];
        this.selectedStrikes.forEach((data, symbol) => {
            all.push({
                symbol,
                ...data
            });
        });
        return all;
    }

    trackStrikePerformance(token, data) {
        const history = this.strikeHistory.get(token) || [];
        history.push({
            ...data,
            timestamp: Date.now()
        });

        if (history.length > 100) {
            history.shift();
        }

        this.strikeHistory.set(token, history);
    }

    getStrikeHistory(token) {
        return this.strikeHistory.get(token) || [];
    }

    clearCache() {
        this.strikeCache.clear();
        this.selectedStrikes.clear();
    }

    getStatus() {
        return {
            cachedSymbols: this.strikeCache.size,
            selectedSymbols: this.selectedStrikes.size,
            trackedStrikes: this.strikeHistory.size
        };
    }
}

module.exports = new StrikeSelectorService();
