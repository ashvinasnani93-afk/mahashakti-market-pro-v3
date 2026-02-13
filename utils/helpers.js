const settings = require('../config/settings.config');

function formatPrice(price, decimals = 2) {
    if (typeof price !== 'number' || isNaN(price)) return '0.00';
    return price.toFixed(decimals);
}

function formatPercent(value, decimals = 2) {
    if (typeof value !== 'number' || isNaN(value)) return '0.00%';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(decimals)}%`;
}

function formatVolume(volume) {
    if (typeof volume !== 'number' || isNaN(volume)) return '0';
    if (volume >= 10000000) return `${(volume / 10000000).toFixed(2)}Cr`;
    if (volume >= 100000) return `${(volume / 100000).toFixed(2)}L`;
    if (volume >= 1000) return `${(volume / 1000).toFixed(2)}K`;
    return volume.toString();
}

function formatTimestamp(ts) {
    if (!ts) return 'N/A';
    const date = new Date(ts);
    return date.toISOString().replace('T', ' ').slice(0, 19);
}

function formatTime(ts) {
    if (!ts) return 'N/A';
    const date = new Date(ts);
    return date.toTimeString().slice(0, 8);
}

function isMarketHours() {
    const now = new Date();
    const day = now.getDay();
    
    if (day === 0 || day === 6) return false;
    
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const time = hours * 60 + minutes;
    
    const marketConfig = settings.market;
    const marketOpen = marketConfig.openHour * 60 + marketConfig.openMinute;
    const marketClose = marketConfig.closeHour * 60 + marketConfig.closeMinute;
    
    return time >= marketOpen && time <= marketClose;
}

function getMarketSession() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const time = hours * 60 + minutes;
    
    const marketConfig = settings.market;
    const preMarket = (marketConfig.openHour * 60 + marketConfig.openMinute) - marketConfig.preOpenMinutes;
    const marketOpen = marketConfig.openHour * 60 + marketConfig.openMinute;
    const midDay = 12 * 60;
    const afternoon = 14 * 60;
    const marketClose = marketConfig.closeHour * 60 + marketConfig.closeMinute;
    
    if (time < preMarket) return 'PRE_MARKET';
    if (time < marketOpen) return 'PRE_OPEN';
    if (time < midDay) return 'MORNING_SESSION';
    if (time < afternoon) return 'MID_DAY';
    if (time < marketClose) return 'AFTERNOON_SESSION';
    return 'AFTER_HOURS';
}

function getMinutesSinceOpen() {
    const now = new Date();
    const marketConfig = settings.market;
    const marketOpen = new Date(now);
    marketOpen.setHours(marketConfig.openHour, marketConfig.openMinute, 0, 0);
    
    return Math.floor((now - marketOpen) / (1000 * 60));
}

function getMinutesToClose() {
    const now = new Date();
    const marketConfig = settings.market;
    const marketClose = new Date(now);
    marketClose.setHours(marketConfig.closeHour, marketConfig.closeMinute, 0, 0);
    
    return Math.floor((marketClose - now) / (1000 * 60));
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function retry(fn, maxAttempts = 3, delayMs = 1000) {
    return async function(...args) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn.apply(this, args);
            } catch (error) {
                lastError = error;
                console.log(`[RETRY] Attempt ${attempt}/${maxAttempts} failed: ${error.message}`);
                
                if (attempt < maxAttempts) {
                    await delay(delayMs * attempt);
                }
            }
        }
        
        throw lastError;
    };
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function roundToTick(price, tickSize = 0.05) {
    return Math.round(price / tickSize) * tickSize;
}

function calculateChangePercent(current, previous) {
    if (!previous || previous === 0) return 0;
    return ((current - previous) / previous) * 100;
}

function sanitizeInput(input) {
    if (typeof input === 'string') {
        return input.trim().replace(/[<>]/g, '');
    }
    return input;
}

function generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function groupBy(array, key) {
    return array.reduce((result, item) => {
        const group = item[key];
        if (!result[group]) {
            result[group] = [];
        }
        result[group].push(item);
        return result;
    }, {});
}

function sortByKey(array, key, descending = true) {
    return [...array].sort((a, b) => {
        const aVal = a[key] || 0;
        const bVal = b[key] || 0;
        return descending ? bVal - aVal : aVal - bVal;
    });
}

module.exports = {
    formatPrice,
    formatPercent,
    formatVolume,
    formatTimestamp,
    formatTime,
    isMarketHours,
    getMarketSession,
    getMinutesSinceOpen,
    getMinutesToClose,
    delay,
    retry,
    clamp,
    roundToTick,
    calculateChangePercent,
    sanitizeInput,
    generateId,
    groupBy,
    sortByKey
};
