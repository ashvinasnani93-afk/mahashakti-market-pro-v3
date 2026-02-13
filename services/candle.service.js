const axios = require('axios');
const config = require('../config/angel.config');
const authService = require('./auth.service');

class CandleService {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = 60000;
    }

    async getCandles(token, exchange, interval, fromDate, toDate) {
        const cacheKey = `${token}_${interval}_${fromDate}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.time < this.cacheExpiry) {
            return cached.data;
        }

        await authService.ensureAuthenticated();

        try {
            const response = await axios.post(
                `${config.endpoints.base}${config.endpoints.candle}`,
                {
                    exchange: exchange === 1 ? 'NSE' : exchange === 2 ? 'NFO' : exchange === 5 ? 'MCX' : 'BSE',
                    symboltoken: token,
                    interval: interval,
                    fromdate: fromDate,
                    todate: toDate
                },
                { headers: authService.getHeaders() }
            );

            if (response.data.status && response.data.data) {
                const candles = response.data.data.map(c => ({
                    timestamp: new Date(c[0]).getTime(),
                    open: parseFloat(c[1]),
                    high: parseFloat(c[2]),
                    low: parseFloat(c[3]),
                    close: parseFloat(c[4]),
                    volume: parseInt(c[5])
                }));

                this.cache.set(cacheKey, { data: candles, time: Date.now() });
                return candles;
            }

            return [];
        } catch (error) {
            console.error(`[CANDLE] Error fetching candles for ${token}:`, error.message);
            return [];
        }
    }

    async getRecentCandles(token, exchange, interval = 'FIVE_MINUTE', count = 50) {
        const now = new Date();
        const from = new Date(now.getTime() - count * 5 * 60 * 1000);
        
        const formatDate = (d) => {
            return d.toISOString().slice(0, 19).replace('T', ' ');
        };

        return this.getCandles(token, exchange, interval, formatDate(from), formatDate(now));
    }

    async getDailyCandles(token, exchange, days = 20) {
        const now = new Date();
        const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        
        const formatDate = (d) => {
            return d.toISOString().slice(0, 19).replace('T', ' ');
        };

        return this.getCandles(token, exchange, 'ONE_DAY', formatDate(from), formatDate(now));
    }

    clearCache() {
        this.cache.clear();
    }
}

module.exports = new CandleService();
