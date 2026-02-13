function formatPrice(price) {
    if (typeof price !== 'number') return '0.00';
    return price.toFixed(2);
}

function formatPercent(value) {
    if (typeof value !== 'number') return '0.00%';
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatVolume(volume) {
    if (typeof volume !== 'number') return '0';
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

function isMarketHours() {
    const now = new Date();
    const day = now.getDay();
    
    if (day === 0 || day === 6) return false;
    
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const time = hours * 60 + minutes;
    
    const marketOpen = 9 * 60 + 15;
    const marketClose = 15 * 60 + 30;
    
    return time >= marketOpen && time <= marketClose;
}

function getMarketSession() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const time = hours * 60 + minutes;
    
    const preMarket = 9 * 60;
    const marketOpen = 9 * 60 + 15;
    const midDay = 12 * 60;
    const afternoon = 14 * 60;
    const marketClose = 15 * 60 + 30;
    
    if (time < preMarket) return 'PRE_MARKET';
    if (time < marketOpen) return 'PRE_OPEN';
    if (time < midDay) return 'MORNING_SESSION';
    if (time < afternoon) return 'MID_DAY';
    if (time < marketClose) return 'AFTERNOON_SESSION';
    return 'AFTER_HOURS';
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
                console.log(`Retry ${attempt}/${maxAttempts} failed: ${error.message}`);
                
                if (attempt < maxAttempts) {
                    await delay(delayMs * attempt);
                }
            }
        }
        
        throw lastError;
    };
}

function sanitizeInput(input) {
    if (typeof input === 'string') {
        return input.trim().replace(/[<>]/g, '');
    }
    return input;
}

module.exports = {
    formatPrice,
    formatPercent,
    formatVolume,
    formatTimestamp,
    isMarketHours,
    getMarketSession,
    delay,
    retry,
    sanitizeInput
};
