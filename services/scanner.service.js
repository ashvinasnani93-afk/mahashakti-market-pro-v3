const instruments = require('../config/instruments.config');
const candleService = require('./candle.service');
const signalService = require('./signal.service');
const explosionService = require('./explosion.service');
const indicatorService = require('./indicator.service');
const wsService = require('./websocket.service');

class ScannerService {
    constructor() {
        this.isRunning = false;
        this.scanInterval = null;
        this.liveSignals = [];
        this.scanResults = new Map();
        this.lastScanTime = null;
        this.scanIntervalMs = 60000;
        this.livePrices = new Map();
    }

    async initialize() {
        console.log('[SCANNER] Initializing...');
        
        wsService.onPrice((data) => {
            this.handleLivePrice(data);
        });

        await wsService.connect();
        
        const watchlist = instruments.getWatchlist();
        const tokens = watchlist.map(i => i.token);
        
        wsService.subscribe(tokens, 1, 3);
        
        console.log(`[SCANNER] Subscribed to ${tokens.length} instruments`);
    }

    handleLivePrice(data) {
        const { token, ltp, volume, timestamp } = data;
        
        this.livePrices.set(token, {
            price: ltp,
            volume,
            timestamp
        });

        const instrument = instruments.getByToken(token);
        if (instrument) {
            const avgVolume = this.getAverageVolume(token);
            explosionService.recordPrice(token, ltp, volume, timestamp);
            
            const explosion = explosionService.detectExplosion(
                instrument,
                ltp,
                volume,
                avgVolume
            );

            if (explosion) {
                console.log(`[EXPLOSION] ${instrument.symbol}: ${explosion.severity} - ${explosion.types.map(t => t.type).join(', ')}`);
            }
        }
    }

    getAverageVolume(token) {
        const cached = this.scanResults.get(token);
        if (cached && cached.indicators) {
            return cached.indicators.avgVolume || 0;
        }
        return 0;
    }

    async start() {
        if (this.isRunning) {
            console.log('[SCANNER] Already running');
            return;
        }

        console.log('[SCANNER] Starting market scanner...');
        this.isRunning = true;

        await this.runFullScan();

        this.scanInterval = setInterval(() => {
            this.runFullScan();
        }, this.scanIntervalMs);
    }

    async runFullScan() {
        console.log('[SCANNER] Running full scan...');
        this.lastScanTime = Date.now();
        
        const watchlist = instruments.getWatchlist();
        this.liveSignals = [];

        for (const instrument of watchlist) {
            try {
                const result = await this.scanInstrument(instrument);
                this.scanResults.set(instrument.token, result);

                if (result.signal) {
                    this.liveSignals.push(result.signal);
                    console.log(`[SIGNAL] ${instrument.symbol}: ${result.signal.signal} (Strength: ${result.signal.strength})`);
                }
            } catch (error) {
                console.error(`[SCANNER] Error scanning ${instrument.symbol}:`, error.message);
            }

            await this.delay(200);
        }

        console.log(`[SCANNER] Scan complete. Found ${this.liveSignals.length} signals.`);
    }

    async scanInstrument(instrument) {
        const [candles5m, candles15m, candlesDaily] = await Promise.all([
            candleService.getRecentCandles(instrument.token, instrument.exchange, 'FIVE_MINUTE', 100),
            candleService.getRecentCandles(instrument.token, instrument.exchange, 'FIFTEEN_MINUTE', 50),
            candleService.getDailyCandles(instrument.token, instrument.exchange, 20)
        ]);

        const indicators = indicatorService.getIndicators(candles5m);
        
        const signalResult = await signalService.analyzeInstrument(
            instrument,
            candles5m,
            candles15m,
            candlesDaily
        );

        const livePrice = this.livePrices.get(instrument.token);

        return {
            instrument,
            indicators,
            signal: signalResult?.signal ? signalResult : null,
            livePrice,
            timestamp: Date.now()
        };
    }

    stop() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
        this.isRunning = false;
        console.log('[SCANNER] Stopped');
    }

    getSignals(filters = {}) {
        let signals = [...this.liveSignals];

        if (filters.type) {
            signals = signals.filter(s => s.signal === filters.type);
        }
        if (filters.minStrength) {
            signals = signals.filter(s => s.strength >= filters.minStrength);
        }

        return signals.sort((a, b) => b.strength - a.strength);
    }

    getExplosions(minutes = 30) {
        return explosionService.getRecentExplosions(minutes);
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            lastScanTime: this.lastScanTime,
            signalCount: this.liveSignals.length,
            watchlistCount: instruments.getWatchlist().length,
            livePricesCount: this.livePrices.size,
            wsStatus: wsService.getStatus()
        };
    }

    getScanResult(token) {
        return this.scanResults.get(token) || null;
    }

    getAllResults() {
        const results = [];
        this.scanResults.forEach((value, key) => {
            results.push(value);
        });
        return results;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new ScannerService();
