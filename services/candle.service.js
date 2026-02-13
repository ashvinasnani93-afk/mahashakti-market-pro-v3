const axios = require('axios');
const config = require('../config/angel.config');
const settings = require('../config/settings.config');
const authService = require('./auth.service');

class CandleService {
    constructor() {
        this.cache = new Map();
        this.cacheTimestamps = new Map();
        this.pendingRequests = new Map();
    }

    getCacheKey(token, interval, fromDate) {
        return `${token}_${interval}_${fromDate}`;
    }

    isCacheValid(key) {
        const timestamp = this.cacheTimestamps.get(key);
        if (!timestamp) return false;
        return (Date.now() - timestamp) < settings.candles.cacheExpiryMs;
    }

    async getCandles(token, exchange, interval, fromDate, toDate) {
        const cacheKey = this.getCacheKey(token, interval, fromDate);
        
        if (this.isCacheValid(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        if (this.pendingRequests.has(cacheKey)) {
            return this.pendingRequests.get(cacheKey);
        }

        const requestPromise = this.fetchCandles(token, exchange, interval, fromDate, toDate, cacheKey);
        this.pendingRequests.set(cacheKey, requestPromise);

        try {
            const result = await requestPromise;
            return result;
        } finally {
            this.pendingRequests.delete(cacheKey);
        }
    }

    async fetchCandles(token, exchange, interval, fromDate, toDate, cacheKey) {
        await authService.ensureAuthenticated();

        try {
            const exchangeName = config.exchangeNames[exchange] || 'NSE';
            
            const response = await axios.post(
                `${config.endpoints.base}${config.endpoints.candle}`,
                {
                    exchange: exchangeName,
                    symboltoken: token,
                    interval: interval,
                    fromdate: fromDate,
                    todate: toDate
                },
                { 
                    headers: authService.getAuthHeaders(),
                    timeout: 15000
                }
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

                this.cache.set(cacheKey, candles);
                this.cacheTimestamps.set(cacheKey, Date.now());

                this.enforceMaxCacheSize();

                return candles;
            }

            return [];
        } catch (error) {
            console.error(`[CANDLE] Error fetching ${token} ${interval}:`, error.message);
            return [];
        }
    }

    enforceMaxCacheSize() {
        if (this.cache.size > settings.candles.maxCacheSize) {
            const entries = Array.from(this.cacheTimestamps.entries());
            entries.sort((a, b) => a[1] - b[1]);
            
            const toRemove = entries.slice(0, Math.floor(settings.candles.maxCacheSize * 0.2));
            toRemove.forEach(([key]) => {
                this.cache.delete(key);
                this.cacheTimestamps.delete(key);
            });
        }
    }

    formatDate(date) {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}`;
    }

    async getRecentCandles(token, exchange, interval = 'FIVE_MINUTE', count = 100) {
        const now = new Date();
        let minutesBack;
        
        switch (interval) {
            case 'ONE_MINUTE':
                minutesBack = count * 1;
                break;
            case 'THREE_MINUTE':
                minutesBack = count * 3;
                break;
            case 'FIVE_MINUTE':
                minutesBack = count * 5;
                break;
            case 'FIFTEEN_MINUTE':
                minutesBack = count * 15;
                break;
            case 'THIRTY_MINUTE':
                minutesBack = count * 30;
                break;
            case 'ONE_HOUR':
                minutesBack = count * 60;
                break;
            case 'ONE_DAY':
                minutesBack = count * 24 * 60;
                break;
            default:
                minutesBack = count * 5;
        }
        
        const from = new Date(now.getTime() - minutesBack * 60 * 1000);
        
        return this.getCandles(
            token, 
            exchange, 
            interval, 
            this.formatDate(from), 
            this.formatDate(now)
        );
    }

    async getDailyCandles(token, exchange, days = 60) {
        const now = new Date();
        const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        
        return this.getCandles(
            token,
            exchange,
            'ONE_DAY',
            this.formatDate(from),
            this.formatDate(now)
        );
    }

    async getHourlyCandles(token, exchange, hours = 30) {
        const now = new Date();
        const from = new Date(now.getTime() - hours * 60 * 60 * 1000);
        
        return this.getCandles(
            token,
            exchange,
            'ONE_HOUR',
            this.formatDate(from),
            this.formatDate(now)
        );
    }

    async getMultiTimeframeCandles(token, exchange) {
        const [m5, m15, h1, d1] = await Promise.all([
            this.getRecentCandles(token, exchange, 'FIVE_MINUTE', 100),
            this.getRecentCandles(token, exchange, 'FIFTEEN_MINUTE', 50),
            this.getHourlyCandles(token, exchange, 30),
            this.getDailyCandles(token, exchange, 60)
        ]);

        return {
            m5,
            m15,
            h1,
            d1
        };
    }

    getCacheStats() {
        return {
            size: this.cache.size,
            maxSize: settings.candles.maxCacheSize,
            pendingRequests: this.pendingRequests.size
        };
    }

    clearCache() {
        this.cache.clear();
        this.cacheTimestamps.clear();
        console.log('[CANDLE] Cache cleared');
    }

    invalidateToken(token) {
        for (const key of this.cache.keys()) {
            if (key.startsWith(`${token}_`)) {
                this.cache.delete(key);
                this.cacheTimestamps.delete(key);
            }
        }
    }
}

module.exports = new CandleService();
