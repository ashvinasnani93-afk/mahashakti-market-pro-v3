const axios = require('axios');
const config = require('../config/angel.config');
const settings = require('../config/settings.config');
const authService = require('./auth.service');

class UniverseLoaderService {
    constructor() {
        this.nseEquity = new Map();
        this.fnoStocks = new Map();
        this.indexOptions = new Map();
        this.commodities = new Map();
        this.allInstruments = new Map();
        
        this.lastRefresh = null;
        this.isLoading = false;
        this.refreshScheduled = false;
        
        this.config = {
            refreshHour: 8,
            refreshMinute: 45,
            indices: ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'],
            exchanges: {
                NSE: 1,
                NFO: 2,
                BSE: 3,
                BFO: 4,
                MCX: 5
            }
        };
        
        this.stats = {
            nseEquityCount: 0,
            fnoStocksCount: 0,
            indexOptionsCount: 0,
            totalInstruments: 0,
            lastRefreshDuration: 0
        };
    }

    async initialize() {
        console.log('[UNIVERSE] Initializing universe loader...');
        await this.loadFullUniverse();
        this.scheduleAutoRefresh();
        console.log('[UNIVERSE] Initialized');
    }

    async loadFullUniverse() {
        if (this.isLoading) {
            console.log('[UNIVERSE] Already loading, skipping...');
            return;
        }

        this.isLoading = true;
        const startTime = Date.now();
        console.log('[UNIVERSE] Loading full market universe...');

        try {
            await authService.ensureAuthenticated();

            // Load NSE Equity
            await this.loadNSEEquity();
            
            // Load F&O Stocks
            await this.loadFNOStocks();
            
            // Load Index Options
            await this.loadIndexOptions();

            // Build combined map
            this.buildAllInstruments();

            this.lastRefresh = new Date();
            this.stats.lastRefreshDuration = Date.now() - startTime;

            console.log('[UNIVERSE] Load complete:');
            console.log(`   NSE Equity: ${this.stats.nseEquityCount}`);
            console.log(`   F&O Stocks: ${this.stats.fnoStocksCount}`);
            console.log(`   Index Options: ${this.stats.indexOptionsCount}`);
            console.log(`   Total: ${this.stats.totalInstruments}`);
            console.log(`   Duration: ${this.stats.lastRefreshDuration}ms`);

        } catch (error) {
            console.error('[UNIVERSE] Load error:', error.message);
        } finally {
            this.isLoading = false;
        }
    }

    async loadNSEEquity() {
        try {
            const response = await axios.get(
                `${config.endpoints.base}/rest/secure/angelbroking/market/v1/searchscrip`,
                {
                    params: { exchange: 'NSE' },
                    headers: authService.getAuthHeaders(),
                    timeout: 30000
                }
            );

            if (response.data?.data && response.data.data.length > 0) {
                this.parseInstruments(response.data.data, 'NSE_EQ', this.nseEquity);
            } else {
                console.log('[UNIVERSE] NSE Equity API returned empty, using fallback list');
                this.loadFallbackNSEEquity();
            }
        } catch (error) {
            console.log('[UNIVERSE] NSE Equity API unavailable, using fallback list');
            this.loadFallbackNSEEquity();
        }

        this.stats.nseEquityCount = this.nseEquity.size;
    }

    async loadFNOStocks() {
        try {
            const response = await axios.get(
                `${config.endpoints.base}/rest/secure/angelbroking/market/v1/searchscrip`,
                {
                    params: { exchange: 'NFO' },
                    headers: authService.getAuthHeaders(),
                    timeout: 30000
                }
            );

            if (response.data?.data && response.data.data.length > 0) {
                this.parseInstruments(response.data.data, 'FNO', this.fnoStocks);
            } else {
                console.log('[UNIVERSE] F&O API returned empty, using fallback list');
                this.loadFallbackFNOStocks();
            }
        } catch (error) {
            console.log('[UNIVERSE] F&O API unavailable, using fallback list');
            this.loadFallbackFNOStocks();
        }

        this.stats.fnoStocksCount = this.fnoStocks.size;
    }

    async loadIndexOptions() {
        for (const index of this.config.indices) {
            try {
                const response = await axios.post(
                    `${config.endpoints.base}/rest/secure/angelbroking/market/v1/optionchain`,
                    { symbol: index, exchange: 'NFO' },
                    {
                        headers: authService.getAuthHeaders(),
                        timeout: 15000
                    }
                );

                if (response.data?.data) {
                    response.data.data.forEach(item => {
                        const key = `${item.symbol}_${item.strikePrice}_${item.optionType}`;
                        this.indexOptions.set(key, {
                            symbol: item.symbol,
                            token: item.token,
                            strikePrice: parseFloat(item.strikePrice),
                            optionType: item.optionType,
                            expiry: item.expiry,
                            exchange: 2,
                            instrumentType: 'INDEX_OPTION',
                            underlying: index
                        });
                    });
                }
            } catch (error) {
                console.log(`[UNIVERSE] ${index} options unavailable`);
            }
        }

        this.stats.indexOptionsCount = this.indexOptions.size;
    }

    parseInstruments(data, type, targetMap) {
        if (!Array.isArray(data)) return;

        data.forEach(item => {
            const instrument = {
                symbol: item.tradingsymbol || item.symbol,
                token: item.symboltoken || item.token,
                name: item.name || item.tradingsymbol,
                exchange: item.exchange === 'NSE' ? 1 : item.exchange === 'NFO' ? 2 : 1,
                instrumentType: type,
                lotSize: parseInt(item.lotsize) || 1,
                tickSize: parseFloat(item.ticksize) || 0.05,
                expiry: item.expiry || null
            };

            targetMap.set(instrument.token, instrument);
        });
    }

    loadFallbackNSEEquity() {
        const nifty50 = [
            'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'HINDUNILVR', 'SBIN',
            'BHARTIARTL', 'KOTAKBANK', 'ITC', 'LT', 'AXISBANK', 'BAJFINANCE', 'ASIANPAINT',
            'MARUTI', 'TITAN', 'SUNPHARMA', 'ULTRACEMCO', 'NESTLEIND', 'WIPRO',
            'TATAMOTORS', 'M&M', 'HCLTECH', 'NTPC', 'POWERGRID', 'TECHM', 'INDUSINDBK',
            'TATASTEEL', 'ADANIENT', 'ADANIPORTS', 'BAJAJFINSV', 'ONGC', 'JSWSTEEL',
            'COALINDIA', 'GRASIM', 'DRREDDY', 'CIPLA', 'BPCL', 'DIVISLAB', 'HEROMOTOCO',
            'BRITANNIA', 'EICHERMOT', 'TATACONSUM', 'APOLLOHOSP', 'SBILIFE', 'HINDALCO',
            'BAJAJ-AUTO', 'UPL', 'LTIM', 'HDFCLIFE'
        ];

        const niftyNext50 = [
            'ADANIGREEN', 'AMBUJACEM', 'BANKBARODA', 'BERGEPAINT', 'BIOCON', 'BOSCHLTD',
            'CHOLAFIN', 'COLPAL', 'CONCOR', 'DABUR', 'DLF', 'GAIL', 'GODREJCP',
            'HAVELLS', 'ICICIPRULI', 'IDEA', 'IGL', 'INDUSTOWER', 'IOC', 'IRCTC',
            'JINDALSTEL', 'LTF', 'LUPIN', 'MARICO', 'MCDOWELL-N', 'MUTHOOTFIN',
            'NAUKRI', 'NHPC', 'NMDC', 'PAGEIND', 'PEL', 'PETRONET', 'PFC', 'PIDILITIND',
            'PNB', 'RECLTD', 'SBICARD', 'SHREECEM', 'SIEMENS', 'SRF', 'TATAPOWER',
            'TORNTPHARM', 'TRENT', 'VEDL', 'ZOMATO', 'ZYDUSLIFE'
        ];

        const allStocks = [...nifty50, ...niftyNext50];
        
        allStocks.forEach((symbol, index) => {
            const token = `NSE_${index}`;
            this.nseEquity.set(token, {
                symbol,
                token,
                name: symbol,
                exchange: 1,
                instrumentType: 'NSE_EQ',
                lotSize: 1,
                sector: this.getSector(symbol)
            });
        });
    }

    loadFallbackFNOStocks() {
        const fnoStocks = [
            'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'BHARTIARTL',
            'KOTAKBANK', 'ITC', 'LT', 'AXISBANK', 'BAJFINANCE', 'MARUTI', 'TATAMOTORS',
            'M&M', 'HCLTECH', 'TATASTEEL', 'ADANIENT', 'JSWSTEEL', 'POWERGRID',
            'NTPC', 'COALINDIA', 'ONGC', 'BPCL', 'HINDALCO', 'TECHM', 'WIPRO',
            'SUNPHARMA', 'DRREDDY', 'CIPLA', 'TITAN', 'NESTLEIND', 'ULTRACEMCO',
            'GRASIM', 'INDUSINDBK', 'BAJAJFINSV', 'DIVISLAB', 'HEROMOTOCO', 'EICHERMOT',
            'BRITANNIA', 'DLF', 'VEDL', 'TATAPOWER', 'PNB', 'BANKBARODA'
        ];

        fnoStocks.forEach((symbol, index) => {
            const token = `FNO_${index}`;
            this.fnoStocks.set(token, {
                symbol: `${symbol}-FUT`,
                token,
                name: symbol,
                exchange: 2,
                instrumentType: 'FNO',
                underlying: symbol,
                lotSize: this.getFNOLotSize(symbol)
            });
        });

        // Add index futures
        this.config.indices.forEach((index, i) => {
            const token = `INDEX_${i}`;
            this.fnoStocks.set(token, {
                symbol: `${index}-FUT`,
                token,
                name: index,
                exchange: 2,
                instrumentType: 'INDEX_FUT',
                underlying: index,
                lotSize: this.getIndexLotSize(index)
            });
        });
    }

    buildAllInstruments() {
        this.allInstruments.clear();

        // Add indices
        const indices = [
            { symbol: 'NIFTY 50', token: '99926000', exchange: 1, type: 'INDEX' },
            { symbol: 'NIFTY BANK', token: '99926009', exchange: 1, type: 'INDEX' },
            { symbol: 'NIFTY FIN SERVICE', token: '99926037', exchange: 1, type: 'INDEX' },
            { symbol: 'NIFTY MID SELECT', token: '99926074', exchange: 1, type: 'INDEX' }
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

    getSector(symbol) {
        const sectors = {
            'IT': ['TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM', 'LTIM', 'MPHASIS'],
            'BANKING': ['HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK', 'AXISBANK', 'INDUSINDBK', 'PNB', 'BANKBARODA'],
            'FINANCE': ['BAJFINANCE', 'BAJAJFINSV', 'CHOLAFIN', 'SBILIFE', 'HDFCLIFE', 'ICICIPRULI'],
            'AUTO': ['MARUTI', 'TATAMOTORS', 'M&M', 'HEROMOTOCO', 'BAJAJ-AUTO', 'EICHERMOT'],
            'PHARMA': ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'LUPIN', 'BIOCON'],
            'METAL': ['TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'VEDL', 'JINDALSTEL', 'NMDC'],
            'ENERGY': ['RELIANCE', 'ONGC', 'BPCL', 'IOC', 'GAIL', 'PETRONET'],
            'POWER': ['NTPC', 'POWERGRID', 'TATAPOWER', 'ADANIGREEN', 'NHPC', 'PFC', 'RECLTD'],
            'FMCG': ['HINDUNILVR', 'ITC', 'NESTLEIND', 'BRITANNIA', 'DABUR', 'MARICO', 'COLPAL'],
            'INFRA': ['LT', 'ADANIENT', 'ADANIPORTS', 'DLF', 'GRASIM', 'ULTRACEMCO']
        };

        for (const [sector, stocks] of Object.entries(sectors)) {
            if (stocks.includes(symbol)) return sector;
        }
        return 'OTHER';
    }

    getFNOLotSize(symbol) {
        const lotSizes = {
            'RELIANCE': 250, 'TCS': 150, 'HDFCBANK': 550, 'INFY': 300, 'ICICIBANK': 700,
            'SBIN': 1500, 'BHARTIARTL': 950, 'KOTAKBANK': 400, 'ITC': 1600, 'LT': 150,
            'AXISBANK': 1200, 'BAJFINANCE': 125, 'MARUTI': 100, 'TATAMOTORS': 1425,
            'M&M': 350, 'HCLTECH': 350, 'TATASTEEL': 5500, 'ADANIENT': 250
        };
        return lotSizes[symbol] || 500;
    }

    getIndexLotSize(index) {
        const lotSizes = {
            'NIFTY': 50, 'BANKNIFTY': 15, 'FINNIFTY': 40, 'MIDCPNIFTY': 50, 'SENSEX': 10
        };
        return lotSizes[index] || 50;
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
        console.log(`[UNIVERSE] Auto-refresh scheduled at ${target.toLocaleTimeString()}`);

        setTimeout(() => {
            this.loadFullUniverse();
            this.scheduleAutoRefresh();
        }, delay);

        this.refreshScheduled = true;
    }

    async manualRefresh() {
        console.log('[UNIVERSE] Manual refresh triggered');
        await this.loadFullUniverse();
        return this.getStats();
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

    getIndexOptions() {
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

    getStats() {
        return {
            ...this.stats,
            lastRefresh: this.lastRefresh?.toISOString() || null,
            isLoading: this.isLoading
        };
    }
}

module.exports = new UniverseLoaderService();
