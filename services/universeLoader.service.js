const axios = require('axios');
const config = require('../config/angel.config');
const settings = require('../config/settings.config');

class UniverseLoaderService {
    constructor() {
        // Primary data stores
        this.nseEquity = new Map();
        this.fnoStocks = new Map();
        this.indexOptions = new Map();
        this.allInstruments = new Map();
        
        // Index-specific option chains
        this.niftyOptions = new Map();
        this.bankniftyOptions = new Map();
        this.finniftyOptions = new Map();
        this.midcpniftyOptions = new Map();
        this.sensexOptions = new Map();
        
        // Expiry tracking
        this.weeklyExpiries = [];
        this.monthlyExpiries = [];
        this.currentExpiry = null;
        this.nextExpiry = null;
        
        // Loading state
        this.lastRefresh = null;
        this.isLoading = false;
        this.refreshScheduled = false;
        this.masterData = null;
        
        // Configuration
        this.config = {
            masterJsonUrl: 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json',
            refreshHour: 8,
            refreshMinute: 30,
            indices: ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'],
            indexTokens: {
                'NIFTY': '99926000',
                'BANKNIFTY': '99926009',
                'FINNIFTY': '99926037',
                'MIDCPNIFTY': '99926074',
                'SENSEX': '99919000'
            },
            exchanges: {
                NSE: 'NSE',
                NFO: 'NFO',
                BSE: 'BSE',
                BFO: 'BFO',
                MCX: 'MCX'
            },
            atmWindow: 20,
            minLiquidity: 50000
        };
        
        // Statistics
        this.stats = {
            nseEquityCount: 0,
            fnoStocksCount: 0,
            indexOptionsCount: 0,
            niftyOptionsCount: 0,
            bankniftyOptionsCount: 0,
            finniftyOptionsCount: 0,
            midcpniftyOptionsCount: 0,
            sensexOptionsCount: 0,
            totalInstruments: 0,
            lastRefreshDuration: 0,
            masterJsonSize: 0
        };
    }

    async initialize() {
        console.log('[UNIVERSE] Initializing full market universe loader...');
        await this.loadFromAngelMaster();
        this.scheduleAutoRefresh();
        console.log('[UNIVERSE] Initialized');
    }

    // 🔴 MAIN LOADER - Angel OpenAPI Master JSON
    async loadFromAngelMaster() {
        if (this.isLoading) {
            console.log('[UNIVERSE] Already loading, skipping...');
            return;
        }

        this.isLoading = true;
        const startTime = Date.now();
        console.log('[UNIVERSE] Fetching Angel OpenAPI Master JSON...');

        try {
            const response = await axios.get(this.config.masterJsonUrl, {
                timeout: 60000,
                headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate'
                }
            });

            if (!response.data || !Array.isArray(response.data)) {
                throw new Error('Invalid master JSON response');
            }

            this.masterData = response.data;
            this.stats.masterJsonSize = response.data.length;
            console.log(`[UNIVERSE] Master JSON loaded: ${this.stats.masterJsonSize} instruments`);

            // Clear existing data
            this.clearAllMaps();

            // Parse and categorize instruments
            this.parseNSEEquity();
            this.parseFNOStocks();
            this.parseIndexOptions();
            this.detectExpiries();
            this.buildAllInstruments();

            // 🔴 MEMORY OPTIMIZATION - Clear master data immediately
            this.masterData = null;
            if (global.gc) {
                global.gc();
            }

            this.lastRefresh = new Date();
            this.stats.lastRefreshDuration = Date.now() - startTime;

            this.logStats();

        } catch (error) {
            console.error('[UNIVERSE] Master JSON load error:', error.message);
            console.log('[UNIVERSE] Falling back to static list...');
            this.loadFallbackUniverse();
        } finally {
            this.isLoading = false;
        }
    }

    clearAllMaps() {
        this.nseEquity.clear();
        this.fnoStocks.clear();
        this.indexOptions.clear();
        this.niftyOptions.clear();
        this.bankniftyOptions.clear();
        this.finniftyOptions.clear();
        this.midcpniftyOptions.clear();
        this.sensexOptions.clear();
        this.allInstruments.clear();
    }

    // 🔴 PARSE NSE EQUITY (Tradable stocks)
    parseNSEEquity() {
        if (!this.masterData) return;

        // Filter NSE Cash segment stocks (EQ/BE series)
        const nseStocks = this.masterData.filter(item => {
            const exchSeg = item.exch_seg || '';
            const instType = (item.instrumenttype || '').toUpperCase();
            const symbol = item.symbol || '';
            
            // NSE Cash segment - either EQ instrumenttype or empty for cash stocks
            return exchSeg === 'NSE' && 
                   (instType === '' || instType === 'EQ') &&
                   symbol &&
                   !symbol.includes('-') &&
                   !symbol.includes('_') &&
                   symbol.length <= 20;
        });

        nseStocks.forEach(item => {
            const instrument = {
                symbol: item.symbol,
                token: item.token,
                name: item.name || item.symbol,
                exchange: 'NSE',
                exchangeCode: 1,
                instrumentType: 'NSE_EQ',
                lotSize: parseInt(item.lotsize) || 1,
                tickSize: parseFloat(item.tick_size) || 0.05,
                sector: this.detectSector(item.symbol),
                isin: item.isin || null
            };
            this.nseEquity.set(item.token, instrument);
        });

        this.stats.nseEquityCount = this.nseEquity.size;
        console.log(`[UNIVERSE] NSE Equity parsed: ${this.stats.nseEquityCount}`);
    }

    // 🔴 PARSE F&O STOCKS (Futures)
    parseFNOStocks() {
        if (!this.masterData) return;

        const fnoFutures = this.masterData.filter(item => 
            item.exch_seg === 'NFO' && 
            item.instrumenttype === 'FUTSTK'
        );

        // Group by underlying and get nearest expiry
        const underlyingMap = new Map();
        
        fnoFutures.forEach(item => {
            const underlying = item.name;
            const expiry = item.expiry;
            
            if (!underlyingMap.has(underlying)) {
                underlyingMap.set(underlying, []);
            }
            underlyingMap.get(underlying).push(item);
        });

        // Get nearest expiry for each underlying
        underlyingMap.forEach((futures, underlying) => {
            futures.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
            const nearest = futures[0];
            
            if (nearest) {
                const instrument = {
                    symbol: nearest.symbol,
                    token: nearest.token,
                    name: nearest.name,
                    underlying: underlying,
                    exchange: 'NFO',
                    exchangeCode: 2,
                    instrumentType: 'FUTSTK',
                    lotSize: parseInt(nearest.lotsize) || 1,
                    tickSize: parseFloat(nearest.tick_size) || 0.05,
                    expiry: nearest.expiry,
                    strikePrice: 0
                };
                this.fnoStocks.set(nearest.token, instrument);
            }
        });

        this.stats.fnoStocksCount = this.fnoStocks.size;
        console.log(`[UNIVERSE] F&O Stocks parsed: ${this.stats.fnoStocksCount}`);
    }

    // 🔴 PARSE INDEX OPTIONS (All weekly + monthly)
    parseIndexOptions() {
        if (!this.masterData) return;

        // Index options filters
        const indexOptFilters = {
            'NIFTY': { seg: 'NFO', type: 'OPTIDX', name: 'NIFTY' },
            'BANKNIFTY': { seg: 'NFO', type: 'OPTIDX', name: 'BANKNIFTY' },
            'FINNIFTY': { seg: 'NFO', type: 'OPTIDX', name: 'FINNIFTY' },
            'MIDCPNIFTY': { seg: 'NFO', type: 'OPTIDX', name: 'MIDCPNIFTY' },
            'SENSEX': { seg: 'BFO', type: 'OPTIDX', name: 'SENSEX' }
        };

        for (const [indexName, filter] of Object.entries(indexOptFilters)) {
            const options = this.masterData.filter(item =>
                item.exch_seg === filter.seg &&
                item.instrumenttype === filter.type &&
                item.name === filter.name
            );

            options.forEach(item => {
                const instrument = {
                    symbol: item.symbol,
                    token: item.token,
                    name: item.name,
                    underlying: indexName,
                    exchange: filter.seg,
                    exchangeCode: filter.seg === 'NFO' ? 2 : 4,
                    instrumentType: 'INDEX_OPTION',
                    optionType: item.symbol.endsWith('CE') ? 'CE' : 'PE',
                    strikePrice: parseFloat(item.strike) / 100 || 0,
                    lotSize: parseInt(item.lotsize) || 1,
                    tickSize: parseFloat(item.tick_size) || 0.05,
                    expiry: item.expiry,
                    expiryType: this.detectExpiryType(item.expiry)
                };

                // Store in index-specific map
                const mapKey = `${instrument.strikePrice}_${instrument.optionType}_${instrument.expiry}`;
                
                switch (indexName) {
                    case 'NIFTY':
                        this.niftyOptions.set(mapKey, instrument);
                        break;
                    case 'BANKNIFTY':
                        this.bankniftyOptions.set(mapKey, instrument);
                        break;
                    case 'FINNIFTY':
                        this.finniftyOptions.set(mapKey, instrument);
                        break;
                    case 'MIDCPNIFTY':
                        this.midcpniftyOptions.set(mapKey, instrument);
                        break;
                    case 'SENSEX':
                        this.sensexOptions.set(mapKey, instrument);
                        break;
                }

                // Store in combined index options
                this.indexOptions.set(item.token, instrument);
            });
        }

        this.stats.niftyOptionsCount = this.niftyOptions.size;
        this.stats.bankniftyOptionsCount = this.bankniftyOptions.size;
        this.stats.finniftyOptionsCount = this.finniftyOptions.size;
        this.stats.midcpniftyOptionsCount = this.midcpniftyOptions.size;
        this.stats.sensexOptionsCount = this.sensexOptions.size;
        this.stats.indexOptionsCount = this.indexOptions.size;

        console.log(`[UNIVERSE] Index Options parsed:`);
        console.log(`   NIFTY: ${this.stats.niftyOptionsCount}`);
        console.log(`   BANKNIFTY: ${this.stats.bankniftyOptionsCount}`);
        console.log(`   FINNIFTY: ${this.stats.finniftyOptionsCount}`);
        console.log(`   MIDCPNIFTY: ${this.stats.midcpniftyOptionsCount}`);
        console.log(`   SENSEX: ${this.stats.sensexOptionsCount}`);
    }

    detectExpiryType(expiryStr) {
        if (!expiryStr) return 'UNKNOWN';
        
        const expiry = new Date(expiryStr);
        const day = expiry.getDay();
        const date = expiry.getDate();
        
        // Check if it's last Thursday of month (monthly)
        const lastDay = new Date(expiry.getFullYear(), expiry.getMonth() + 1, 0).getDate();
        const lastThursday = lastDay - ((new Date(expiry.getFullYear(), expiry.getMonth() + 1, 0).getDay() + 3) % 7);
        
        if (date === lastThursday || date > lastThursday - 7) {
            return 'MONTHLY';
        }
        return 'WEEKLY';
    }

    detectExpiries() {
        const expiries = new Set();
        
        this.indexOptions.forEach(opt => {
            if (opt.expiry) expiries.add(opt.expiry);
        });

        const sortedExpiries = Array.from(expiries)
            .map(e => new Date(e))
            .filter(d => d > new Date())
            .sort((a, b) => a - b);

        this.weeklyExpiries = sortedExpiries.filter(d => {
            const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
            const lastThursday = lastDay - ((new Date(d.getFullYear(), d.getMonth() + 1, 0).getDay() + 3) % 7);
            return d.getDate() !== lastThursday;
        }).slice(0, 4);

        this.monthlyExpiries = sortedExpiries.filter(d => {
            const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
            const lastThursday = lastDay - ((new Date(d.getFullYear(), d.getMonth() + 1, 0).getDay() + 3) % 7);
            return d.getDate() === lastThursday || d.getDate() > lastThursday - 7;
        }).slice(0, 3);

        if (sortedExpiries.length > 0) {
            this.currentExpiry = sortedExpiries[0];
            this.nextExpiry = sortedExpiries[1] || null;
        }

        console.log(`[UNIVERSE] Expiries detected: ${this.weeklyExpiries.length} weekly, ${this.monthlyExpiries.length} monthly`);
    }

    buildAllInstruments() {
        this.allInstruments.clear();

        // Add index spot tokens
        const indices = [
            { symbol: 'NIFTY 50', token: '99926000', exchange: 'NSE', type: 'INDEX' },
            { symbol: 'NIFTY BANK', token: '99926009', exchange: 'NSE', type: 'INDEX' },
            { symbol: 'NIFTY FIN SERVICE', token: '99926037', exchange: 'NSE', type: 'INDEX' },
            { symbol: 'NIFTY MID SELECT', token: '99926074', exchange: 'NSE', type: 'INDEX' },
            { symbol: 'SENSEX', token: '99919000', exchange: 'BSE', type: 'INDEX' }
        ];
        indices.forEach(idx => this.allInstruments.set(idx.token, idx));

        // Add NSE Equity
        this.nseEquity.forEach((inst, token) => this.allInstruments.set(token, inst));

        // Add F&O Stocks
        this.fnoStocks.forEach((inst, token) => this.allInstruments.set(token, inst));

        // Add Index Options
        this.indexOptions.forEach((inst, token) => this.allInstruments.set(token, inst));

        this.stats.totalInstruments = this.allInstruments.size;
    }

    // 🔴 GET ATM OPTIONS FOR INDEX (Dynamic window based on VIX)
    getATMOptions(indexName, spotPrice, vixLevel = 15, windowOverride = null) {
        const optionsMap = this.getOptionsMap(indexName);
        if (!optionsMap || optionsMap.size === 0) return [];

        const strikeGap = this.getStrikeGap(indexName, spotPrice);
        const atmStrike = Math.round(spotPrice / strikeGap) * strikeGap;

        // Dynamic window based on VIX
        let window = windowOverride || this.config.atmWindow;
        if (vixLevel > 25) window = Math.min(30, window + 10);
        else if (vixLevel < 12) window = Math.max(10, window - 5);

        const minStrike = atmStrike - (window * strikeGap);
        const maxStrike = atmStrike + (window * strikeGap);

        const result = [];

        optionsMap.forEach((opt, key) => {
            if (opt.strikePrice >= minStrike && opt.strikePrice <= maxStrike) {
                result.push({
                    ...opt,
                    moneyness: ((opt.strikePrice - atmStrike) / atmStrike) * 100,
                    distanceFromATM: Math.abs(opt.strikePrice - atmStrike) / strikeGap
                });
            }
        });

        return result.sort((a, b) => a.distanceFromATM - b.distanceFromATM);
    }

    getOptionsMap(indexName) {
        switch (indexName.toUpperCase()) {
            case 'NIFTY': return this.niftyOptions;
            case 'BANKNIFTY': return this.bankniftyOptions;
            case 'FINNIFTY': return this.finniftyOptions;
            case 'MIDCPNIFTY': return this.midcpniftyOptions;
            case 'SENSEX': return this.sensexOptions;
            default: return null;
        }
    }

    getStrikeGap(indexName, spotPrice) {
        switch (indexName.toUpperCase()) {
            case 'NIFTY': return 50;
            case 'BANKNIFTY': return 100;
            case 'FINNIFTY': return 50;
            case 'MIDCPNIFTY': return 25;
            case 'SENSEX': return 100;
            default:
                if (spotPrice > 5000) return 100;
                if (spotPrice > 1000) return 50;
                return 25;
        }
    }

    formatExpiry(date) {
        if (!date) return null;
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const month = months[d.getMonth()];
        const year = d.getFullYear();
        return `${day}${month}${year}`;
    }

    detectSector(symbol) {
        const sectors = {
            'IT': ['TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM', 'LTIM', 'MPHASIS', 'COFORGE', 'PERSISTENT'],
            'BANKING': ['HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK', 'AXISBANK', 'INDUSINDBK', 'PNB', 'BANKBARODA', 'FEDERALBNK', 'IDFCFIRSTB'],
            'FINANCE': ['BAJFINANCE', 'BAJAJFINSV', 'CHOLAFIN', 'SBILIFE', 'HDFCLIFE', 'ICICIPRULI', 'MUTHOOTFIN', 'MANAPPURAM', 'SHRIRAMFIN'],
            'AUTO': ['MARUTI', 'TATAMOTORS', 'M&M', 'HEROMOTOCO', 'BAJAJ-AUTO', 'EICHERMOT', 'ASHOKLEY', 'TVSMOTORS', 'MOTHERSON'],
            'PHARMA': ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'LUPIN', 'BIOCON', 'AUROPHARMA', 'TORNTPHARM', 'ALKEM', 'ZYDUSLIFE'],
            'METAL': ['TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'VEDL', 'JINDALSTEL', 'NMDC', 'SAIL', 'NATIONALUM', 'HINDZINC'],
            'ENERGY': ['RELIANCE', 'ONGC', 'BPCL', 'IOC', 'GAIL', 'PETRONET', 'HINDPETRO', 'OIL', 'MRPL'],
            'POWER': ['NTPC', 'POWERGRID', 'TATAPOWER', 'ADANIGREEN', 'NHPC', 'PFC', 'RECLTD', 'SJVN', 'TORNTPOWER'],
            'FMCG': ['HINDUNILVR', 'ITC', 'NESTLEIND', 'BRITANNIA', 'DABUR', 'MARICO', 'COLPAL', 'GODREJCP', 'TATACONSUM'],
            'INFRA': ['LT', 'ADANIENT', 'ADANIPORTS', 'DLF', 'GRASIM', 'ULTRACEMCO', 'AMBUJACEM', 'ACC', 'SHREECEM'],
            'TELECOM': ['BHARTIARTL', 'IDEA', 'INDUSTOWER'],
            'REALTY': ['DLF', 'GODREJPROP', 'OBEROIRLTY', 'PRESTIGE', 'BRIGADE', 'SOBHA'],
            'MEDIA': ['ZEEL', 'SUNTV', 'PVR', 'NETWORK18'],
            'CHEMICAL': ['PIDILITIND', 'SRF', 'ATUL', 'DEEPAKNTR', 'NAVINFLUOR', 'PIIND']
        };

        for (const [sector, stocks] of Object.entries(sectors)) {
            if (stocks.includes(symbol)) return sector;
        }
        return 'OTHER';
    }

    // Fallback universe when API fails
    loadFallbackUniverse() {
        console.log('[UNIVERSE] Loading fallback static universe...');
        
        // Nifty 50 + Next 50 stocks
        const nifty100 = [
            'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'HINDUNILVR', 'SBIN',
            'BHARTIARTL', 'KOTAKBANK', 'ITC', 'LT', 'AXISBANK', 'BAJFINANCE', 'ASIANPAINT',
            'MARUTI', 'TITAN', 'SUNPHARMA', 'ULTRACEMCO', 'NESTLEIND', 'WIPRO',
            'TATAMOTORS', 'M&M', 'HCLTECH', 'NTPC', 'POWERGRID', 'TECHM', 'INDUSINDBK',
            'TATASTEEL', 'ADANIENT', 'ADANIPORTS', 'BAJAJFINSV', 'ONGC', 'JSWSTEEL',
            'COALINDIA', 'GRASIM', 'DRREDDY', 'CIPLA', 'BPCL', 'DIVISLAB', 'HEROMOTOCO',
            'BRITANNIA', 'EICHERMOT', 'TATACONSUM', 'APOLLOHOSP', 'SBILIFE', 'HINDALCO',
            'BAJAJ-AUTO', 'UPL', 'LTIM', 'HDFCLIFE', 'ADANIGREEN', 'AMBUJACEM', 'BANKBARODA',
            'BERGEPAINT', 'BIOCON', 'BOSCHLTD', 'CHOLAFIN', 'COLPAL', 'CONCOR', 'DABUR',
            'DLF', 'GAIL', 'GODREJCP', 'HAVELLS', 'ICICIPRULI', 'IDEA', 'IGL', 'INDUSTOWER',
            'IOC', 'IRCTC', 'JINDALSTEL', 'LTF', 'LUPIN', 'MARICO', 'MCDOWELL-N', 'MUTHOOTFIN',
            'NAUKRI', 'NHPC', 'NMDC', 'PAGEIND', 'PEL', 'PETRONET', 'PFC', 'PIDILITIND',
            'PNB', 'RECLTD', 'SBICARD', 'SHREECEM', 'SIEMENS', 'SRF', 'TATAPOWER',
            'TORNTPHARM', 'TRENT', 'VEDL', 'ZOMATO', 'ZYDUSLIFE'
        ];

        nifty100.forEach((symbol, index) => {
            const token = `NSE_${index}`;
            this.nseEquity.set(token, {
                symbol,
                token,
                name: symbol,
                exchange: 'NSE',
                exchangeCode: 1,
                instrumentType: 'NSE_EQ',
                lotSize: 1,
                sector: this.detectSector(symbol)
            });
        });

        // F&O stocks
        const fnoStocks = nifty100.slice(0, 50);
        fnoStocks.forEach((symbol, index) => {
            const token = `FNO_${index}`;
            this.fnoStocks.set(token, {
                symbol: `${symbol}-FUT`,
                token,
                name: symbol,
                underlying: symbol,
                exchange: 'NFO',
                exchangeCode: 2,
                instrumentType: 'FUTSTK',
                lotSize: this.getFallbackLotSize(symbol)
            });
        });

        this.stats.nseEquityCount = this.nseEquity.size;
        this.stats.fnoStocksCount = this.fnoStocks.size;
        this.buildAllInstruments();
    }

    getFallbackLotSize(symbol) {
        const lotSizes = {
            'RELIANCE': 250, 'TCS': 150, 'HDFCBANK': 550, 'INFY': 300, 'ICICIBANK': 700,
            'SBIN': 1500, 'BHARTIARTL': 950, 'KOTAKBANK': 400, 'ITC': 1600, 'LT': 150
        };
        return lotSizes[symbol] || 500;
    }

    scheduleAutoRefresh() {
        if (this.refreshScheduled) return;

        const now = new Date();
        const target = new Date();
        target.setHours(this.config.refreshHour, this.config.refreshMinute, 0, 0);

        if (now > target) {
            target.setDate(target.getDate() + 1);
        }

        const delay = target - now;
        console.log(`[UNIVERSE] Auto-refresh scheduled at ${target.toLocaleTimeString()} (${Math.round(delay / 60000)} min)`);

        setTimeout(() => {
            this.loadFromAngelMaster();
            this.scheduleAutoRefresh();
        }, delay);

        this.refreshScheduled = true;
    }

    async manualRefresh() {
        console.log('[UNIVERSE] Manual refresh triggered');
        this.refreshScheduled = false;
        await this.loadFromAngelMaster();
        return this.getStats();
    }

    logStats() {
        console.log('[UNIVERSE] === FULL UNIVERSE STATS ===');
        console.log(`   NSE Equity: ${this.stats.nseEquityCount}`);
        console.log(`   F&O Stocks: ${this.stats.fnoStocksCount}`);
        console.log(`   Index Options: ${this.stats.indexOptionsCount}`);
        console.log(`     - NIFTY: ${this.stats.niftyOptionsCount}`);
        console.log(`     - BANKNIFTY: ${this.stats.bankniftyOptionsCount}`);
        console.log(`     - FINNIFTY: ${this.stats.finniftyOptionsCount}`);
        console.log(`     - MIDCPNIFTY: ${this.stats.midcpniftyOptionsCount}`);
        console.log(`     - SENSEX: ${this.stats.sensexOptionsCount}`);
        console.log(`   Total Instruments: ${this.stats.totalInstruments}`);
        console.log(`   Master JSON Size: ${this.stats.masterJsonSize}`);
        console.log(`   Duration: ${this.stats.lastRefreshDuration}ms`);
        console.log('[UNIVERSE] ===========================');
    }

    // Getters
    getAll() {
        return Array.from(this.allInstruments.values());
    }

    getNSEEquity() {
        return Array.from(this.nseEquity.values());
    }

    getFNOStocks() {
        return Array.from(this.fnoStocks.values());
    }

    getIndexOptions(indexName = null) {
        if (indexName) {
            const map = this.getOptionsMap(indexName);
            return map ? Array.from(map.values()) : [];
        }
        return Array.from(this.indexOptions.values());
    }

    getByToken(token) {
        return this.allInstruments.get(token);
    }

    getBySymbol(symbol) {
        for (const inst of this.allInstruments.values()) {
            if (inst.symbol === symbol) return inst;
        }
        return null;
    }

    getBySector(sector) {
        return this.getAll().filter(inst => inst.sector === sector);
    }

    getExpiries() {
        return {
            current: this.currentExpiry,
            next: this.nextExpiry,
            weekly: this.weeklyExpiries,
            monthly: this.monthlyExpiries
        };
    }

    getStats() {
        return {
            ...this.stats,
            lastRefresh: this.lastRefresh?.toISOString() || null,
            isLoading: this.isLoading,
            expiries: {
                current: this.currentExpiry?.toISOString() || null,
                weekly: this.weeklyExpiries.length,
                monthly: this.monthlyExpiries.length
            }
        };
    }
}

module.exports = new UniverseLoaderService();
