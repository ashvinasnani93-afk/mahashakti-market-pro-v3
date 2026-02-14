const instruments = require('../config/instruments.config');
const settings = require('../config/settings.config');
const candleService = require('./candle.service');
const indicatorService = require('./indicator.service');
const wsService = require('./websocket.service');

class MarketScannerLoopService {
    constructor() {
        this.isRunning = false;
        this.scanInterval = null;
        this.currentBatchIndex = 0;
        this.scanResults = new Map();
        this.momentumScores = new Map();
        this.volumeSpikes = new Map();
        this.priorityBuckets = {
            CORE: new Set(),
            ACTIVE: new Set(),
            ROTATION: new Set()
        };
        this.lastScanTime = null;
        this.scanStats = {
            totalScans: 0,
            batchesProcessed: 0,
            tokensScanned: 0,
            spikesDetected: 0,
            rotationsPerformed: 0
        };
        this.activeTokens = new Set();
        this.idleTokens = new Set();
        this.strikeDiscoveryQueue = [];
        
        // 🔴 CPU PROTECTION MODES
        this.reducedMode = false;
        this.coreOnlyMode = false;
        this.normalBatchInterval = 5000;
        this.reducedBatchInterval = 15000;
    }

    async initialize() {
        console.log('[SCANNER_LOOP] Initializing market scanner loop...');
        
        const indices = instruments.getIndices();
        indices.forEach(idx => {
            this.priorityBuckets.CORE.add(idx.token);
        });

        const allInstruments = instruments.getAll();
        allInstruments.forEach(inst => {
            if (!this.priorityBuckets.CORE.has(inst.token)) {
                this.idleTokens.add(inst.token);
            }
        });

        console.log(`[SCANNER_LOOP] Core tokens: ${this.priorityBuckets.CORE.size}`);
        console.log(`[SCANNER_LOOP] Idle tokens: ${this.idleTokens.size}`);
    }

    async start() {
        if (this.isRunning) {
            console.log('[SCANNER_LOOP] Already running');
            return;
        }

        console.log('[SCANNER_LOOP] Starting scanner loop...');
        this.isRunning = true;

        await this.runInitialScan();

        this.scanInterval = setInterval(() => {
            this.runBatchScan();
        }, settings.scanner.batchIntervalMs || 5000);

        setInterval(() => {
            this.performWSRotation();
        }, settings.scanner.wsRotationIntervalMs || 30000);
    }

    async runInitialScan() {
        console.log('[SCANNER_LOOP] Running initial full scan...');
        
        const coreTokens = Array.from(this.priorityBuckets.CORE);
        wsService.subscribeWithPriority(coreTokens, 'CORE');

        const allInstruments = instruments.getAll();
        const batchSize = settings.scanner.batchSize || 20;
        
        for (let i = 0; i < allInstruments.length; i += batchSize) {
            const batch = allInstruments.slice(i, i + batchSize);
            await this.processBatch(batch);
            await this.delay(settings.scanner.batchDelayMs || 500);
        }

        this.promoteTopMomentum();
        console.log('[SCANNER_LOOP] Initial scan complete');
    }

    async runBatchScan() {
        const allInstruments = instruments.getAll();
        const batchSize = settings.scanner.batchSize || 20;
        
        const startIdx = this.currentBatchIndex * batchSize;
        const batch = allInstruments.slice(startIdx, startIdx + batchSize);
        
        if (batch.length === 0) {
            this.currentBatchIndex = 0;
            this.scanStats.rotationsPerformed++;
            this.promoteTopMomentum();
            return;
        }

        await this.processBatch(batch);
        
        this.currentBatchIndex++;
        this.scanStats.batchesProcessed++;
        this.lastScanTime = Date.now();
    }

    async processBatch(batch) {
        for (const instrument of batch) {
            try {
                const result = await this.scanSingleInstrument(instrument);
                this.scanResults.set(instrument.token, result);
                this.scanStats.tokensScanned++;

                if (result.momentumScore > 0) {
                    this.momentumScores.set(instrument.token, {
                        score: result.momentumScore,
                        instrument,
                        timestamp: Date.now()
                    });
                }

                if (result.volumeSpike) {
                    this.volumeSpikes.set(instrument.token, {
                        ratio: result.volumeRatio,
                        instrument,
                        timestamp: Date.now()
                    });
                    this.scanStats.spikesDetected++;
                    
                    if (!this.priorityBuckets.ACTIVE.has(instrument.token)) {
                        this.queueForStrikeDiscovery(instrument);
                    }
                }
            } catch (error) {
                console.error(`[SCANNER_LOOP] Error scanning ${instrument.symbol}:`, error.message);
            }

            await this.delay(settings.scanner.apiDelayMs || 100);
        }
    }

    async scanSingleInstrument(instrument) {
        const candles = await candleService.getRecentCandles(
            instrument.token,
            instrument.exchange,
            'FIVE_MINUTE',
            50
        );

        if (!candles || candles.length < 20) {
            return {
                instrument,
                momentumScore: 0,
                volumeSpike: false,
                error: 'Insufficient data'
            };
        }

        const indicators = indicatorService.getFullIndicators(candles);
        
        if (indicators.error) {
            return {
                instrument,
                momentumScore: 0,
                volumeSpike: false,
                error: indicators.error
            };
        }

        const momentumScore = this.calculateMomentumScore(indicators, candles);
        const volumeSpike = indicators.volumeRatio >= (settings.scanner.volumeSpikeThreshold || 2);
        const priceChange = this.calculatePriceChange(candles);

        return {
            instrument,
            indicators,
            momentumScore,
            volumeSpike,
            volumeRatio: indicators.volumeRatio,
            priceChange,
            priceChangePercent: priceChange.percent,
            isRunner: Math.abs(priceChange.percent) >= 5,
            isBigRunner: Math.abs(priceChange.percent) >= 15,
            timestamp: Date.now()
        };
    }

    calculateMomentumScore(indicators, candles) {
        let score = 0;

        if (indicators.emaTrend === 'STRONG_BULLISH') score += 25;
        else if (indicators.emaTrend === 'BULLISH') score += 15;
        else if (indicators.emaTrend === 'STRONG_BEARISH') score += 20;
        else if (indicators.emaTrend === 'BEARISH') score += 10;

        if (indicators.rsi > 60 && indicators.rsi < 80) score += 15;
        else if (indicators.rsi < 40 && indicators.rsi > 20) score += 15;
        else if (indicators.rsi >= 80 || indicators.rsi <= 20) score += 10;

        if (indicators.volumeRatio >= 3) score += 25;
        else if (indicators.volumeRatio >= 2) score += 15;
        else if (indicators.volumeRatio >= 1.5) score += 10;

        if (indicators.macdHistogram > 0 && indicators.macdTrend === 'BULLISH') score += 10;
        else if (indicators.macdHistogram < 0 && indicators.macdTrend === 'BEARISH') score += 10;

        if (indicators.adx > 25) {
            score += 10;
            if (indicators.adx > 40) score += 5;
        }

        const priceChange = this.calculatePriceChange(candles);
        if (Math.abs(priceChange.percent) >= 3) score += 15;
        if (Math.abs(priceChange.percent) >= 5) score += 10;

        return Math.min(100, score);
    }

    calculatePriceChange(candles) {
        if (!candles || candles.length < 2) {
            return { absolute: 0, percent: 0 };
        }

        const first = candles[0];
        const last = candles[candles.length - 1];
        const absolute = last.close - first.open;
        const percent = (absolute / first.open) * 100;

        return {
            absolute,
            percent,
            direction: absolute > 0 ? 'UP' : absolute < 0 ? 'DOWN' : 'FLAT'
        };
    }

    promoteTopMomentum() {
        const sortedMomentum = Array.from(this.momentumScores.entries())
            .sort((a, b) => b[1].score - a[1].score)
            .slice(0, 30);

        const wsStatus = wsService.getStatus();
        const availableSlots = wsStatus.maxSubscriptions - this.priorityBuckets.CORE.size - 5;

        this.priorityBuckets.ACTIVE.clear();
        this.priorityBuckets.ROTATION.clear();

        sortedMomentum.slice(0, Math.min(availableSlots, 20)).forEach(([token, data]) => {
            if (!this.priorityBuckets.CORE.has(token)) {
                this.priorityBuckets.ACTIVE.add(token);
            }
        });

        sortedMomentum.slice(20, 30).forEach(([token, data]) => {
            if (!this.priorityBuckets.CORE.has(token) && !this.priorityBuckets.ACTIVE.has(token)) {
                this.priorityBuckets.ROTATION.add(token);
            }
        });

        console.log(`[SCANNER_LOOP] Promoted ${this.priorityBuckets.ACTIVE.size} to ACTIVE, ${this.priorityBuckets.ROTATION.size} to ROTATION`);
    }

    performWSRotation() {
        const activeTokens = Array.from(this.priorityBuckets.ACTIVE);
        const rotationTokens = Array.from(this.priorityBuckets.ROTATION);
        const coreTokens = Array.from(this.priorityBuckets.CORE);

        wsService.subscribeWithPriority(coreTokens, 'CORE');
        wsService.subscribeWithPriority(activeTokens, 'ACTIVE');

        if (rotationTokens.length > 0) {
            const rotationSlots = 50 - coreTokens.length - activeTokens.length;
            if (rotationSlots > 0) {
                const toSubscribe = rotationTokens.slice(0, rotationSlots);
                wsService.subscribeWithPriority(toSubscribe, 'ROTATION');
            }
        }

        this.activeTokens = new Set([...coreTokens, ...activeTokens]);
    }

    queueForStrikeDiscovery(instrument) {
        if (!this.strikeDiscoveryQueue.find(i => i.token === instrument.token)) {
            this.strikeDiscoveryQueue.push(instrument);
            
            if (this.strikeDiscoveryQueue.length > 20) {
                this.strikeDiscoveryQueue.shift();
            }
        }
    }

    getStrikeDiscoveryQueue() {
        return [...this.strikeDiscoveryQueue];
    }

    clearStrikeDiscoveryQueue() {
        this.strikeDiscoveryQueue = [];
    }

    getTopMomentumStocks(count = 20) {
        return Array.from(this.momentumScores.entries())
            .sort((a, b) => b[1].score - a[1].score)
            .slice(0, count)
            .map(([token, data]) => ({
                token,
                symbol: data.instrument.symbol,
                score: data.score,
                timestamp: data.timestamp
            }));
    }

    getVolumeSpikes(count = 20) {
        return Array.from(this.volumeSpikes.entries())
            .sort((a, b) => b[1].ratio - a[1].ratio)
            .slice(0, count)
            .map(([token, data]) => ({
                token,
                symbol: data.instrument.symbol,
                ratio: data.ratio,
                timestamp: data.timestamp
            }));
    }

    getBigRunners() {
        return Array.from(this.scanResults.values())
            .filter(r => r.isBigRunner)
            .sort((a, b) => Math.abs(b.priceChangePercent) - Math.abs(a.priceChangePercent));
    }

    getRunners() {
        return Array.from(this.scanResults.values())
            .filter(r => r.isRunner)
            .sort((a, b) => Math.abs(b.priceChangePercent) - Math.abs(a.priceChangePercent));
    }

    getScanResult(token) {
        return this.scanResults.get(token);
    }

    getPriorityBuckets() {
        return {
            CORE: Array.from(this.priorityBuckets.CORE),
            ACTIVE: Array.from(this.priorityBuckets.ACTIVE),
            ROTATION: Array.from(this.priorityBuckets.ROTATION)
        };
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            currentBatchIndex: this.currentBatchIndex,
            lastScanTime: this.lastScanTime,
            stats: this.scanStats,
            buckets: {
                core: this.priorityBuckets.CORE.size,
                active: this.priorityBuckets.ACTIVE.size,
                rotation: this.priorityBuckets.ROTATION.size
            },
            momentumCount: this.momentumScores.size,
            volumeSpikeCount: this.volumeSpikes.size,
            strikeDiscoveryQueueLength: this.strikeDiscoveryQueue.length,
            protectionMode: {
                reducedMode: this.reducedMode,
                coreOnlyMode: this.coreOnlyMode
            }
        };
    }

    // 🔴 CPU PROTECTION: REDUCED MODE (CPU > 75%)
    setReducedMode(enabled) {
        if (this.reducedMode === enabled) return;
        
        this.reducedMode = enabled;
        
        if (enabled) {
            console.log('[SCANNER_LOOP] REDUCED MODE ENABLED - Slowing scan frequency');
            this.restartWithInterval(this.reducedBatchInterval);
        } else {
            console.log('[SCANNER_LOOP] REDUCED MODE DISABLED - Normal scan frequency');
            this.restartWithInterval(this.normalBatchInterval);
        }
    }

    // 🔴 CPU PROTECTION: CORE ONLY MODE (CPU > 90%)
    setCoreOnlyMode(enabled) {
        if (this.coreOnlyMode === enabled) return;
        
        this.coreOnlyMode = enabled;
        
        if (enabled) {
            console.log('[SCANNER_LOOP] CORE ONLY MODE ENABLED - Scanning indices only');
        } else {
            console.log('[SCANNER_LOOP] CORE ONLY MODE DISABLED - Full scanning resumed');
        }
    }

    restartWithInterval(intervalMs) {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
        }
        
        if (this.isRunning) {
            this.scanInterval = setInterval(() => {
                this.runBatchScan();
            }, intervalMs);
        }
    }

    stop() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
        this.isRunning = false;
        console.log('[SCANNER_LOOP] Stopped');
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new MarketScannerLoopService();
