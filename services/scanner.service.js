const instruments = require('../config/instruments.config');
const settings = require('../config/settings.config');
const candleService = require('./candle.service');
const wsService = require('./websocket.service');
const indicatorService = require('./indicator.service');
const explosionService = require('./explosion.service');
const institutionalService = require('./institutional.service');
const rankingService = require('./ranking.service');
const orchestratorService = require('./orchestrator.service');

class ScannerService {
    constructor() {
        this.isRunning = false;
        this.scanInterval = null;
        this.scanResults = new Map();
        this.lastScanTime = null;
        this.scanQueue = [];
        this.livePrices = new Map();
        this.scanStats = {
            totalScans: 0,
            signalsGenerated: 0,
            explosionsDetected: 0,
            lastScanDuration: 0
        };
    }

    async initialize() {
        console.log('[SCANNER] Initializing market scanner...');
        
        wsService.onPrice((data) => {
            this.handleLivePrice(data);
        });

        await wsService.connect();
        
        const watchlist = instruments.getAll().slice(0, settings.websocket.maxSubscriptions);
        const tokens = watchlist.map(i => i.token);
        
        wsService.subscribe(tokens, 1, 3);
        
        console.log(`[SCANNER] Initialized with ${tokens.length} instruments`);
    }

    handleLivePrice(data) {
        const { token, ltp, volume, oi, timestamp } = data;
        
        this.livePrices.set(token, {
            price: ltp,
            volume,
            oi,
            timestamp
        });

        const instrument = instruments.getByToken(token);
        if (instrument) {
            const scanResult = this.scanResults.get(token);
            const avgVolume = scanResult?.indicators?.avgVolume || 0;
            
            explosionService.recordPrice(token, ltp, volume, oi, timestamp);
            
            if (oi) {
                institutionalService.updateOI(token, oi);
            }

            const explosion = explosionService.detectExplosion(
                instrument,
                ltp,
                volume,
                avgVolume,
                oi
            );

            if (explosion && explosion.severity !== 'LOW') {
                this.scanStats.explosionsDetected++;
                console.log(`[EXPLOSION] ${instrument.symbol}: ${explosion.severity} - ${explosion.types.map(t => t.type).join(', ')}`);
            }
        }
    }

    async start() {
        if (this.isRunning) {
            console.log('[SCANNER] Already running');
            return;
        }

        console.log('[SCANNER] Starting...');
        this.isRunning = true;

        await this.runFullScan();

        this.scanInterval = setInterval(() => {
            this.runFullScan();
        }, settings.scanner.scanIntervalMs);
    }

    async runFullScan() {
        const startTime = Date.now();
        console.log('[SCANNER] Running full market scan...');
        this.lastScanTime = startTime;
        this.scanStats.totalScans++;

        const watchlist = instruments.getAll();
        const analysisResults = [];
        let breakoutCandidates = 0;
        let currentVolumeThreshold = 1.8;

        // FIRST PASS: Initial scan with base threshold
        for (const instrument of watchlist) {
            try {
                const result = await this.scanInstrument(instrument, currentVolumeThreshold);
                this.scanResults.set(instrument.token, result);
                analysisResults.push(result);

                if (result.isBreakoutCandidate) {
                    breakoutCandidates++;
                }

                if (result.signal) {
                    this.scanStats.signalsGenerated++;
                }
            } catch (error) {
                console.error(`[SCANNER] Error scanning ${instrument.symbol}:`, error.message);
            }

            await this.delay(settings.scanner.apiDelayMs);
        }

        // SANITY FILTER: If breakout candidates > 20%, tighten filter
        const candidatePercent = (breakoutCandidates / watchlist.length) * 100;
        
        if (candidatePercent > 20) {
            console.log(`[SCANNER] Too many candidates (${breakoutCandidates}/${watchlist.length} = ${candidatePercent.toFixed(1)}%). Tightening filter...`);
            currentVolumeThreshold = 2.0;
            
            // SECOND PASS: Re-filter with stricter threshold
            let filteredCandidates = 0;
            for (const result of analysisResults) {
                if (result.isBreakoutCandidate) {
                    const volumeRatio = result.indicators?.volumeRatio || 0;
                    if (volumeRatio < currentVolumeThreshold) {
                        result.isBreakoutCandidate = false;
                        result.signal = null;
                        result.filterReason = 'DYNAMIC_VOLUME_FILTER';
                    } else {
                        filteredCandidates++;
                    }
                }
            }
            
            console.log(`[SCANNER] After filter: ${filteredCandidates} candidates (threshold: ${currentVolumeThreshold}x volume)`);
            this.scanStats.dynamicFilterApplied = true;
            this.scanStats.volumeThresholdUsed = currentVolumeThreshold;
        } else {
            this.scanStats.dynamicFilterApplied = false;
            this.scanStats.volumeThresholdUsed = currentVolumeThreshold;
        }

        rankingService.rankInstruments(analysisResults);

        this.updateBreadth(analysisResults);

        const duration = Date.now() - startTime;
        this.scanStats.lastScanDuration = duration;
        this.scanStats.breakoutCandidates = breakoutCandidates;

        const signals = orchestratorService.getActiveSignals();
        console.log(`[SCANNER] Scan complete in ${duration}ms. Candidates: ${breakoutCandidates}, Signals: ${signals.length}`);
    }

    async scanInstrument(instrument, volumeThreshold = 1.8) {
        const mtfCandles = await candleService.getMultiTimeframeCandles(
            instrument.token,
            instrument.exchange
        );

        const indicators = indicatorService.getFullIndicators(mtfCandles.m5);
        
        // Mark if this is a breakout candidate
        const isBreakoutCandidate = indicators.volumeRatio >= volumeThreshold && 
            (indicators.rsi >= 55 || indicators.rsi <= 45);
        
        const analysisResult = await orchestratorService.analyzeInstrument(
            instrument,
            mtfCandles.m5,
            mtfCandles.m15,
            mtfCandles.d1
        );

        const livePrice = this.livePrices.get(instrument.token);

        return {
            instrument,
            indicators,
            isBreakoutCandidate,
            signal: analysisResult.signal,
            analysis: analysisResult.analysis,
            livePrice,
            candles: {
                m5Count: mtfCandles.m5?.length || 0,
                m15Count: mtfCandles.m15?.length || 0,
                h1Count: mtfCandles.h1?.length || 0,
                d1Count: mtfCandles.d1?.length || 0
            },
            timestamp: Date.now()
        };
    }

    updateBreadth(results) {
        let advancing = 0;
        let declining = 0;
        let unchanged = 0;

        results.forEach(result => {
            if (!result.indicators || result.indicators.error) return;

            const priceChange = result.indicators.price - (result.indicators.open || result.indicators.price);
            
            if (priceChange > 0) advancing++;
            else if (priceChange < 0) declining++;
            else unchanged++;
        });

        institutionalService.updateBreadth(advancing, declining, unchanged);
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
        return orchestratorService.getActiveSignals(filters);
    }

    getExplosions(minutes = 30) {
        return explosionService.getRecentExplosions(minutes);
    }

    getRankings(count = 10) {
        return rankingService.getTopRanked(count);
    }

    getScanResult(token) {
        return this.scanResults.get(token) || null;
    }

    getAllResults() {
        return Array.from(this.scanResults.values());
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            lastScanTime: this.lastScanTime,
            scanStats: this.scanStats,
            signalCount: orchestratorService.getActiveSignals().length,
            watchlistCount: instruments.getAll().length,
            livePricesCount: this.livePrices.size,
            wsStatus: wsService.getStatus(),
            candleCacheStats: candleService.getCacheStats()
        };
    }

    getInstitutionalSummary() {
        return institutionalService.getInstitutionalSummary();
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new ScannerService();
