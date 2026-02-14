/**
 * 🔴 MARKET STATE SERVICE - Centralized Real-Time State Store
 * Maintains REAL-TIME state for EVERY active instrument
 * Updated on every WebSocket tick, reset daily at 9:15
 */

class MarketStateService {
    constructor() {
        // 🔴 CENTRALIZED STATE STORE - No recalculation in signal engine
        this.instrumentState = new Map();  // token -> full state object
        
        // Daily tracking
        this.marketOpenTime = null;
        this.isMarketOpen = false;
        this.sessionDate = null;
        
        // Index reference prices for relative strength
        this.indexPrices = {
            NIFTY: { prevClose: 0, open: 0, ltp: 0, change: 0 },
            BANKNIFTY: { prevClose: 0, open: 0, ltp: 0, change: 0 },
            FINNIFTY: { prevClose: 0, open: 0, ltp: 0, change: 0 }
        };
        
        // Index tokens
        this.indexTokens = {
            '99926000': 'NIFTY',
            '99926009': 'BANKNIFTY',
            '99926037': 'FINNIFTY'
        };
        
        // Configuration
        this.config = {
            marketOpenHour: 9,
            marketOpenMinute: 15,
            marketCloseHour: 15,
            marketCloseMinute: 30,
            vwapWindowSize: 100
        };
        
        // Stats
        this.stats = {
            totalInstruments: 0,
            lastUpdate: null,
            ticksProcessed: 0
        };
    }

    initialize() {
        console.log('[MARKET_STATE] Initializing centralized market state...');
        this.checkMarketTime();
        console.log('[MARKET_STATE] Initialized');
    }

    checkMarketTime() {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        
        // Check if market is open (9:15 AM to 3:30 PM IST)
        const currentMinutes = hours * 60 + minutes;
        const openMinutes = this.config.marketOpenHour * 60 + this.config.marketOpenMinute;
        const closeMinutes = this.config.marketCloseHour * 60 + this.config.marketCloseMinute;
        
        this.isMarketOpen = currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
        
        // Check for new session (reset at 9:15)
        const today = now.toDateString();
        if (this.sessionDate !== today && hours === 9 && minutes >= 15) {
            this.resetDailyState();
            this.sessionDate = today;
            this.marketOpenTime = now;
        }
    }

    // 🔴 RESET DAILY STATE AT 9:15
    resetDailyState() {
        console.log('[MARKET_STATE] Resetting daily state...');
        
        this.instrumentState.forEach((state, token) => {
            // Lock previous day close as reference
            if (state.ltp > 0) {
                state.prevClose = state.ltp;
            }
            // Reset intraday fields
            state.todayOpen = 0;
            state.openLocked = false;
            state.high = 0;
            state.low = Infinity;
            state.vwapSum = 0;
            state.vwapVolumeSum = 0;
            state.tickCount = 0;
        });
        
        this.stats.ticksProcessed = 0;
        console.log('[MARKET_STATE] Daily reset complete');
    }

    // 🔴 MAIN UPDATE FUNCTION - Called on every WebSocket tick
    updateFromTick(data) {
        const { token, ltp, open, high, low, close, volume, oi, timestamp } = data;
        
        if (!token || !ltp || ltp <= 0) return;
        
        let state = this.instrumentState.get(token);
        
        if (!state) {
            // Initialize new instrument state
            state = this.createEmptyState(token);
            this.instrumentState.set(token, state);
        }
        
        const prevLtp = state.ltp || ltp;
        
        // Update core prices
        state.ltp = ltp;
        state.lastVolume = volume || 0;
        state.lastOI = oi || 0;
        state.lastUpdate = timestamp || Date.now();
        
        // Lock today's open at first tick (9:15)
        if (!state.openLocked && open && open > 0) {
            state.todayOpen = open;
            state.openLocked = true;
        } else if (!state.openLocked && ltp > 0) {
            state.todayOpen = ltp;
            state.openLocked = true;
        }
        
        // Update high/low
        if (ltp > state.high || state.high === 0) state.high = ltp;
        if (ltp < state.low || state.low === Infinity) state.low = ltp;
        
        // Update prev close from data if available
        if (close && close > 0 && state.prevClose === 0) {
            state.prevClose = close;
        }
        
        // 🔴 CALCULATE ALL METRICS (Centralized - No recalc elsewhere)
        this.calculateMetrics(state, volume);
        
        // Update index reference if this is an index
        this.updateIndexReference(token, state);
        
        // Calculate relative strength vs index
        this.calculateRelativeStrength(state);
        
        state.tickCount++;
        this.stats.ticksProcessed++;
        this.stats.lastUpdate = Date.now();
        this.stats.totalInstruments = this.instrumentState.size;
    }

    createEmptyState(token) {
        return {
            token,
            symbol: null,
            prevClose: 0,
            todayOpen: 0,
            openLocked: false,
            high: 0,
            low: Infinity,
            ltp: 0,
            lastVolume: 0,
            lastOI: 0,
            avgVolume: 0,
            
            // Calculated metrics
            pointsChange: 0,
            percentChangeFromPrevClose: 0,
            percentChangeFromOpen: 0,
            intradayRangePercent: 0,
            vwap: 0,
            vwapDeviation: 0,
            relativeStrengthVsIndex: 0,
            
            // VWAP calculation helpers
            vwapSum: 0,
            vwapVolumeSum: 0,
            
            // Tracking
            tickCount: 0,
            lastUpdate: null
        };
    }

    calculateMetrics(state, volume) {
        const { prevClose, todayOpen, high, low, ltp } = state;
        
        // Points change from prev close
        if (prevClose > 0) {
            state.pointsChange = parseFloat((ltp - prevClose).toFixed(2));
            state.percentChangeFromPrevClose = parseFloat(((ltp - prevClose) / prevClose * 100).toFixed(2));
        }
        
        // Percent change from today's open
        if (todayOpen > 0) {
            state.percentChangeFromOpen = parseFloat(((ltp - todayOpen) / todayOpen * 100).toFixed(2));
        }
        
        // Intraday range percent
        if (low > 0 && low !== Infinity && high > 0) {
            state.intradayRangePercent = parseFloat(((high - low) / low * 100).toFixed(2));
        }
        
        // VWAP calculation
        if (volume && volume > 0) {
            state.vwapSum += ltp * volume;
            state.vwapVolumeSum += volume;
            
            if (state.vwapVolumeSum > 0) {
                state.vwap = parseFloat((state.vwapSum / state.vwapVolumeSum).toFixed(2));
                state.vwapDeviation = parseFloat(((ltp - state.vwap) / state.vwap * 100).toFixed(2));
            }
        }
    }

    updateIndexReference(token, state) {
        const indexName = this.indexTokens[token];
        if (!indexName) return;
        
        this.indexPrices[indexName] = {
            prevClose: state.prevClose,
            open: state.todayOpen,
            ltp: state.ltp,
            change: state.percentChangeFromOpen
        };
    }

    calculateRelativeStrength(state) {
        // Compare vs NIFTY (primary benchmark)
        const niftyChange = this.indexPrices.NIFTY.change || 0;
        const stockChange = state.percentChangeFromOpen || 0;
        
        if (niftyChange !== 0) {
            state.relativeStrengthVsIndex = parseFloat((stockChange - niftyChange).toFixed(2));
        } else {
            state.relativeStrengthVsIndex = stockChange;
        }
    }

    // 🔴 GETTERS - Used by other services (NO recalculation)
    
    getState(token) {
        return this.instrumentState.get(token);
    }

    getAllStates() {
        return Array.from(this.instrumentState.values());
    }

    getActiveStates() {
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        return this.getAllStates().filter(s => s.lastUpdate && s.lastUpdate > fiveMinAgo);
    }

    getPercentChangeFromOpen(token) {
        const state = this.instrumentState.get(token);
        return state ? state.percentChangeFromOpen : 0;
    }

    getPercentChangeFromClose(token) {
        const state = this.instrumentState.get(token);
        return state ? state.percentChangeFromPrevClose : 0;
    }

    getVWAP(token) {
        const state = this.instrumentState.get(token);
        return state ? state.vwap : 0;
    }

    getRelativeStrength(token) {
        const state = this.instrumentState.get(token);
        return state ? state.relativeStrengthVsIndex : 0;
    }

    getIntradayRange(token) {
        const state = this.instrumentState.get(token);
        return state ? state.intradayRangePercent : 0;
    }

    getIndexPrices() {
        return this.indexPrices;
    }

    // 🔴 BULK QUERIES FOR RANKING ENGINE
    
    getTopByPercentChange(count = 20, direction = 'gainers') {
        const states = this.getActiveStates();
        
        if (direction === 'gainers') {
            return states
                .filter(s => s.percentChangeFromOpen > 0)
                .sort((a, b) => b.percentChangeFromOpen - a.percentChangeFromOpen)
                .slice(0, count);
        } else {
            return states
                .filter(s => s.percentChangeFromOpen < 0)
                .sort((a, b) => a.percentChangeFromOpen - b.percentChangeFromOpen)
                .slice(0, count);
        }
    }

    getTopByRange(count = 20) {
        return this.getActiveStates()
            .sort((a, b) => b.intradayRangePercent - a.intradayRangePercent)
            .slice(0, count);
    }

    getTopByRelativeStrength(count = 20) {
        return this.getActiveStates()
            .sort((a, b) => b.relativeStrengthVsIndex - a.relativeStrengthVsIndex)
            .slice(0, count);
    }

    getTopByVWAPDeviation(count = 20) {
        return this.getActiveStates()
            .filter(s => s.vwap > 0)
            .sort((a, b) => Math.abs(b.vwapDeviation) - Math.abs(a.vwapDeviation))
            .slice(0, count);
    }

    // Set symbol name for token
    setSymbol(token, symbol) {
        const state = this.instrumentState.get(token);
        if (state) {
            state.symbol = symbol;
        }
    }

    // Set average volume from historical data
    setAvgVolume(token, avgVolume) {
        const state = this.instrumentState.get(token);
        if (state) {
            state.avgVolume = avgVolume;
        }
    }

    getStats() {
        return {
            ...this.stats,
            isMarketOpen: this.isMarketOpen,
            sessionDate: this.sessionDate,
            indexPrices: this.indexPrices
        };
    }

    clearState() {
        this.instrumentState.clear();
        this.stats.totalInstruments = 0;
    }
}

module.exports = new MarketStateService();
