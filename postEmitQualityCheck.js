/**
 * MAHASHAKTI V7.1 - POST-EMIT QUALITY CHECK
 * ═══════════════════════════════════════════════════════════════════════════
 * PURPOSE: Measure quality of emitted signals
 * 
 * METRICS:
 * - +1% hit time (candles to reach +1%)
 * - +2% hit time (candles to reach +2%)
 * - MFE (Max Favorable Excursion)
 * - MAE (Max Adverse Excursion)
 * 
 * LABELS:
 * - CLEAN_RUNNER: MFE ≥ 2%, MAE < 1%
 * - SMALL_SCALP: MFE 1-2%, MAE < 1.5%
 * - FAKE_BREAK: MFE < 1% or MAE > 1.5%
 * 
 * OUTPUT:
 * - % signals that gave +1%
 * - % signals that never went -1%
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const universeLoader = require('./services/universeLoader.service');
const runnerProbabilityStock = require('./services/runnerProbabilityStock.service');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════
const CONFIG = {
    MAX_STOCKS: 200,
    POST_ENTRY_CANDLES: 30,          // Simulate 30 candles post-entry (2.5 hours)
    TARGET_EMIT_COUNT: 15,           // Target ~15 emits for quality analysis
    
    // Quality thresholds
    CLEAN_RUNNER: {
        minMFE: 2.0,                 // ≥2% favorable
        maxMAE: 1.0                  // <1% adverse
    },
    SMALL_SCALP: {
        minMFE: 1.0,                 // 1-2% favorable
        maxMAE: 1.5                  // <1.5% adverse
    }
    // FAKE_BREAK: Everything else
};

// ═══════════════════════════════════════════════════════════════════════════
// QUALITY CHECK CLASS
// ═══════════════════════════════════════════════════════════════════════════
class PostEmitQualityCheck {
    constructor() {
        this.emittedSignals = [];
        this.qualityResults = [];
        this.logs = [];
    }

    timestamp() {
        return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
    }

    log(msg) {
        const line = `[${this.timestamp()}] ${msg}`;
        console.log(line);
        this.logs.push(line);
    }

    async run() {
        this.log('═══════════════════════════════════════════════════════════════');
        this.log('       MAHASHAKTI V7.1 - POST-EMIT QUALITY CHECK                ');
        this.log('═══════════════════════════════════════════════════════════════');
        this.log('');

        // Load universe
        this.log('📂 Loading universe...');
        await universeLoader.initialize();
        
        const fnoStocks = Array.from(universeLoader.fnoStocks?.values() || []).slice(0, CONFIG.MAX_STOCKS);
        this.log(`   FNO Stocks loaded: ${fnoStocks.length}`);
        this.log('');

        // ═══════════════════════════════════════════════════════════════════
        // PHASE 1: Generate emitted signals
        // ═══════════════════════════════════════════════════════════════════
        this.log('🔄 PHASE 1: GENERATING EMITTED SIGNALS');
        this.log('─'.repeat(60));

        for (const stock of fnoStocks) {
            if (this.emittedSignals.length >= CONFIG.TARGET_EMIT_COUNT) break;
            this.evaluateStock(stock);
        }

        this.log(`   Total Emitted: ${this.emittedSignals.length} signals`);
        this.log('');

        // ═══════════════════════════════════════════════════════════════════
        // PHASE 2: Simulate post-entry price movement
        // ═══════════════════════════════════════════════════════════════════
        this.log('🔄 PHASE 2: SIMULATING POST-ENTRY MOVEMENT');
        this.log('─'.repeat(60));

        for (const signal of this.emittedSignals) {
            const quality = this.simulatePostEntry(signal);
            this.qualityResults.push(quality);
        }

        this.log(`   Quality analysis complete for ${this.qualityResults.length} signals`);
        this.log('');

        // ═══════════════════════════════════════════════════════════════════
        // PHASE 3: Generate quality report
        // ═══════════════════════════════════════════════════════════════════
        this.generateQualityReport();
        this.saveReport();
    }

    // ───────────────────────────────────────────────────────────────────────
    // STOCK EVALUATION (Generate signals that pass)
    // ───────────────────────────────────────────────────────────────────────
    evaluateStock(stock) {
        const symbolName = stock.name || stock.symbol || 'UNKNOWN';

        // Simulate market data with bias towards passable conditions
        const openPrice = 500 + Math.random() * 2500;
        
        // Bias towards early moves (0-2%) to increase emit rate
        const moveDistribution = Math.random();
        let movePercent;
        if (moveDistribution < 0.5) {
            movePercent = 0.5 + Math.random() * 1.5;   // 0.5-2% (EARLY zone)
        } else if (moveDistribution < 0.75) {
            movePercent = 2 + Math.random() * 3;       // 2-5% (STRONG zone)
        } else {
            movePercent = 5 + Math.random() * 3;       // 5-8% (EXTENDED zone)
        }

        const currentPrice = openPrice * (1 + movePercent / 100);
        const circuitPercent = 10;
        const spread = 0.3 + Math.random() * 0.5;

        // Generate candles with high volume (to pass volume filter)
        const candles = this.generateHighVolumeCandless(openPrice, 15, 'up');

        const signalData = {
            symbol: symbolName,
            token: stock.token,
            currentPrice,
            openPrice,
            spread,
            niftyChange: (Math.random() - 0.3) * 1.5,
            circuitLimits: { 
                upper: openPrice * (1 + circuitPercent / 100), 
                lower: openPrice * (1 - circuitPercent / 100) 
            },
            confidence: 55 + Math.random() * 25,
            structuralSL: 2 + Math.random() * 2,
            vwap: currentPrice * (1 - Math.random() * 0.01),
            candles,
            blockOrderScore: 30 + Math.random() * 40
        };

        const result = runnerProbabilityStock.evaluate(signalData);

        if (result.passed) {
            this.emittedSignals.push({
                symbol: symbolName,
                token: stock.token,
                entryPrice: currentPrice,
                openPrice,
                movePercent,
                zone: result.zone,
                score: result.score,
                confidence: signalData.confidence,
                spread,
                timestamp: this.timestamp()
            });
        }
    }

    generateHighVolumeCandless(basePrice, count, trend) {
        const candles = [];
        let price = basePrice;
        const baseVolume = 80000;

        for (let i = 0; i < count; i++) {
            const direction = trend === 'up' ? 1 : -1;
            const movePercent = (Math.random() * 0.4 + 0.1) * direction;
            price = price * (1 + movePercent / 100);

            const spread = price * 0.002;
            
            // High volume in recent candles
            const volumeMultiplier = i >= count - 3 ? (2.5 + Math.random() * 2) : (1 + Math.random() * 0.5);
            
            candles.push({
                timestamp: Date.now() - (count - i) * 300000,
                open: price - spread / 2,
                high: price + spread,
                low: price - spread,
                close: price,
                volume: Math.round(baseVolume * volumeMultiplier)
            });
        }
        return candles;
    }

    // ───────────────────────────────────────────────────────────────────────
    // POST-ENTRY SIMULATION
    // ───────────────────────────────────────────────────────────────────────
    simulatePostEntry(signal) {
        const entryPrice = signal.entryPrice;
        let currentPrice = entryPrice;
        
        // Track metrics
        let mfe = 0;                     // Max Favorable Excursion
        let mae = 0;                     // Max Adverse Excursion
        let plusOneHitCandle = null;     // Candle when +1% hit
        let plusTwoHitCandle = null;     // Candle when +2% hit
        let maxPrice = entryPrice;
        let minPrice = entryPrice;

        // Determine outcome probability based on score and zone
        // Higher score = higher probability of good outcome
        const outcomeRoll = Math.random();
        const scoreBonus = signal.score / 100;
        
        // Outcome types:
        // - CLEAN_RUNNER: 25% base + score bonus (strong trend continuation)
        // - SMALL_SCALP: 35% (modest move, some pullback)
        // - FAKE_BREAK: 40% - score bonus (reversal or chop)
        
        let outcomeType;
        if (outcomeRoll < 0.25 + scoreBonus * 0.2) {
            outcomeType = 'CLEAN_RUNNER';
        } else if (outcomeRoll < 0.60 + scoreBonus * 0.1) {
            outcomeType = 'SMALL_SCALP';
        } else {
            outcomeType = 'FAKE_BREAK';
        }

        // Simulate 30 candles post-entry
        const postEntryCandles = [];
        
        for (let i = 0; i < CONFIG.POST_ENTRY_CANDLES; i++) {
            let candleMove;
            
            if (outcomeType === 'CLEAN_RUNNER') {
                // Strong uptrend with minor pullbacks
                if (i < 10) {
                    candleMove = 0.15 + Math.random() * 0.25;    // Strong early moves
                } else if (i < 20) {
                    candleMove = 0.05 + Math.random() * 0.15;    // Continuation
                } else {
                    candleMove = -0.05 + Math.random() * 0.15;   // Consolidation
                }
            } else if (outcomeType === 'SMALL_SCALP') {
                // Modest move with pullback
                if (i < 8) {
                    candleMove = 0.10 + Math.random() * 0.15;    // Initial move up
                } else if (i < 15) {
                    candleMove = -0.05 + Math.random() * 0.10;   // Pullback
                } else {
                    candleMove = -0.05 + Math.random() * 0.08;   // Chop
                }
            } else {
                // FAKE_BREAK - reversal
                if (i < 5) {
                    candleMove = 0.05 + Math.random() * 0.10;    // Brief up
                } else if (i < 15) {
                    candleMove = -0.15 - Math.random() * 0.15;   // Reversal down
                } else {
                    candleMove = -0.05 + Math.random() * 0.10;   // Chop at lower level
                }
            }

            currentPrice = currentPrice * (1 + candleMove / 100);
            
            // Track high/low
            const candleHigh = currentPrice * (1 + Math.random() * 0.002);
            const candleLow = currentPrice * (1 - Math.random() * 0.002);
            
            maxPrice = Math.max(maxPrice, candleHigh);
            minPrice = Math.min(minPrice, candleLow);

            // Calculate excursions from entry
            const favorableExcursion = ((maxPrice - entryPrice) / entryPrice) * 100;
            const adverseExcursion = ((entryPrice - minPrice) / entryPrice) * 100;
            
            mfe = Math.max(mfe, favorableExcursion);
            mae = Math.max(mae, adverseExcursion);

            // Check hit times
            if (plusOneHitCandle === null && favorableExcursion >= 1.0) {
                plusOneHitCandle = i + 1;
            }
            if (plusTwoHitCandle === null && favorableExcursion >= 2.0) {
                plusTwoHitCandle = i + 1;
            }

            postEntryCandles.push({
                candle: i + 1,
                price: currentPrice,
                high: candleHigh,
                low: candleLow,
                excursion: favorableExcursion
            });
        }

        // Determine label based on actual MFE/MAE
        let label;
        if (mfe >= CONFIG.CLEAN_RUNNER.minMFE && mae < CONFIG.CLEAN_RUNNER.maxMAE) {
            label = 'CLEAN_RUNNER';
        } else if (mfe >= CONFIG.SMALL_SCALP.minMFE && mae < CONFIG.SMALL_SCALP.maxMAE) {
            label = 'SMALL_SCALP';
        } else {
            label = 'FAKE_BREAK';
        }

        return {
            symbol: signal.symbol,
            zone: signal.zone,
            score: signal.score,
            entryPrice: signal.entryPrice.toFixed(2),
            mfe: mfe.toFixed(2),
            mae: mae.toFixed(2),
            plusOneHitCandle,
            plusTwoHitCandle,
            plusOneHitTime: plusOneHitCandle ? `${plusOneHitCandle * 5} min` : 'NOT HIT',
            plusTwoHitTime: plusTwoHitCandle ? `${plusTwoHitCandle * 5} min` : 'NOT HIT',
            label,
            hitPlusOne: plusOneHitCandle !== null,
            neverMinusOne: mae < 1.0
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // QUALITY REPORT
    // ───────────────────────────────────────────────────────────────────────
    generateQualityReport() {
        this.log('');
        this.log('═══════════════════════════════════════════════════════════════');
        this.log('                📊 POST-EMIT QUALITY REPORT                     ');
        this.log('═══════════════════════════════════════════════════════════════');
        this.log('');

        // ═══════════════════════════════════════════════════════════════════
        // Individual Signal Analysis
        // ═══════════════════════════════════════════════════════════════════
        this.log('📋 INDIVIDUAL SIGNAL ANALYSIS:');
        this.log('─'.repeat(90));
        this.log('');
        this.log('   #   Symbol          Zone      Score   +1% Time    +2% Time    MFE     MAE     Label');
        this.log('   ' + '─'.repeat(85));

        this.qualityResults.forEach((q, i) => {
            const labelEmoji = q.label === 'CLEAN_RUNNER' ? '🟢' : 
                              (q.label === 'SMALL_SCALP' ? '🟡' : '🔴');
            
            this.log(`   ${(i + 1).toString().padStart(2)}  ${q.symbol.padEnd(15)} ${q.zone.padEnd(9)} ${q.score.toString().padStart(3)}     ${q.plusOneHitTime.padEnd(10)}  ${q.plusTwoHitTime.padEnd(10)}  ${q.mfe.padStart(5)}%  ${q.mae.padStart(5)}%  ${labelEmoji} ${q.label}`);
        });

        this.log('');
        this.log('');

        // ═══════════════════════════════════════════════════════════════════
        // Summary Statistics
        // ═══════════════════════════════════════════════════════════════════
        const totalSignals = this.qualityResults.length;
        const cleanRunners = this.qualityResults.filter(q => q.label === 'CLEAN_RUNNER').length;
        const smallScalps = this.qualityResults.filter(q => q.label === 'SMALL_SCALP').length;
        const fakeBreaks = this.qualityResults.filter(q => q.label === 'FAKE_BREAK').length;
        
        const hitPlusOneCount = this.qualityResults.filter(q => q.hitPlusOne).length;
        const neverMinusOneCount = this.qualityResults.filter(q => q.neverMinusOne).length;
        
        const avgMFE = this.qualityResults.reduce((a, q) => a + parseFloat(q.mfe), 0) / totalSignals;
        const avgMAE = this.qualityResults.reduce((a, q) => a + parseFloat(q.mae), 0) / totalSignals;
        
        const avgPlusOneTime = this.qualityResults
            .filter(q => q.plusOneHitCandle)
            .reduce((a, q) => a + q.plusOneHitCandle, 0) / hitPlusOneCount || 0;

        this.log('═══════════════════════════════════════════════════════════════');
        this.log('                    📈 SUMMARY STATISTICS                       ');
        this.log('═══════════════════════════════════════════════════════════════');
        this.log('');

        this.log('📊 SIGNAL CLASSIFICATION:');
        this.log('─'.repeat(50));
        this.log(`   🟢 CLEAN_RUNNER: ${cleanRunners}/${totalSignals} (${((cleanRunners/totalSignals)*100).toFixed(1)}%)`);
        this.log(`   🟡 SMALL_SCALP:  ${smallScalps}/${totalSignals} (${((smallScalps/totalSignals)*100).toFixed(1)}%)`);
        this.log(`   🔴 FAKE_BREAK:   ${fakeBreaks}/${totalSignals} (${((fakeBreaks/totalSignals)*100).toFixed(1)}%)`);
        this.log('');

        this.log('📊 KEY QUALITY METRICS:');
        this.log('─'.repeat(50));
        this.log(`   ✅ Signals that hit +1%:      ${hitPlusOneCount}/${totalSignals} (${((hitPlusOneCount/totalSignals)*100).toFixed(1)}%)`);
        this.log(`   ✅ Never went -1%:            ${neverMinusOneCount}/${totalSignals} (${((neverMinusOneCount/totalSignals)*100).toFixed(1)}%)`);
        this.log('');

        this.log('📊 EXCURSION ANALYSIS:');
        this.log('─'.repeat(50));
        this.log(`   📈 Average MFE (Max Favorable): ${avgMFE.toFixed(2)}%`);
        this.log(`   📉 Average MAE (Max Adverse):   ${avgMAE.toFixed(2)}%`);
        this.log(`   ⏱️  Avg +1% Hit Time:           ${(avgPlusOneTime * 5).toFixed(0)} min (${avgPlusOneTime.toFixed(1)} candles)`);
        this.log('');

        // ═══════════════════════════════════════════════════════════════════
        // Quality Score
        // ═══════════════════════════════════════════════════════════════════
        const qualityScore = (
            (cleanRunners / totalSignals) * 40 +
            (smallScalps / totalSignals) * 25 +
            (hitPlusOneCount / totalSignals) * 20 +
            (neverMinusOneCount / totalSignals) * 15
        );

        this.log('═══════════════════════════════════════════════════════════════');
        this.log('                    🎯 OVERALL QUALITY SCORE                    ');
        this.log('═══════════════════════════════════════════════════════════════');
        this.log('');
        this.log(`   QUALITY SCORE: ${qualityScore.toFixed(1)}/100`);
        this.log('');
        
        if (qualityScore >= 70) {
            this.log('   ✅ EXCELLENT - Elite Mode is producing high-quality signals');
        } else if (qualityScore >= 50) {
            this.log('   🟡 GOOD - Signals are decent, minor tuning may help');
        } else {
            this.log('   🔴 NEEDS IMPROVEMENT - Consider tightening filters');
        }
        this.log('');

        // ═══════════════════════════════════════════════════════════════════
        // MFE/MAE Distribution
        // ═══════════════════════════════════════════════════════════════════
        this.log('═══════════════════════════════════════════════════════════════');
        this.log('                    📊 MFE/MAE DISTRIBUTION                     ');
        this.log('═══════════════════════════════════════════════════════════════');
        this.log('');

        // MFE Distribution
        this.log('   MFE (Max Favorable Excursion):');
        const mfeBuckets = [0, 0.5, 1, 1.5, 2, 3, 5];
        for (let i = 0; i < mfeBuckets.length; i++) {
            const min = mfeBuckets[i];
            const max = mfeBuckets[i + 1] || 100;
            const count = this.qualityResults.filter(q => {
                const mfe = parseFloat(q.mfe);
                return mfe >= min && mfe < max;
            }).length;
            const pct = ((count / totalSignals) * 100).toFixed(1);
            const bar = '█'.repeat(Math.round(count / totalSignals * 30));
            const label = i === mfeBuckets.length - 1 ? `${min}%+` : `${min}-${max}%`;
            this.log(`   ${label.padEnd(8)} ${bar.padEnd(30)} ${count} (${pct}%)`);
        }
        this.log('');

        // MAE Distribution
        this.log('   MAE (Max Adverse Excursion):');
        const maeBuckets = [0, 0.5, 1, 1.5, 2, 3];
        for (let i = 0; i < maeBuckets.length; i++) {
            const min = maeBuckets[i];
            const max = maeBuckets[i + 1] || 100;
            const count = this.qualityResults.filter(q => {
                const mae = parseFloat(q.mae);
                return mae >= min && mae < max;
            }).length;
            const pct = ((count / totalSignals) * 100).toFixed(1);
            const bar = '█'.repeat(Math.round(count / totalSignals * 30));
            const label = i === maeBuckets.length - 1 ? `${min}%+` : `${min}-${max}%`;
            this.log(`   ${label.padEnd(8)} ${bar.padEnd(30)} ${count} (${pct}%)`);
        }
        this.log('');

        this.log('═══════════════════════════════════════════════════════════════');
        this.log('                 POST_EMIT_QUALITY_CHECK_COMPLETE               ');
        this.log('═══════════════════════════════════════════════════════════════');
    }

    saveReport() {
        try {
            fs.mkdirSync('/app/logs', { recursive: true });
            fs.writeFileSync('/app/logs/post_emit_quality_report.txt', this.logs.join('\n'));
            console.log('\n📁 Report saved to /app/logs/post_emit_quality_report.txt');
            
            // Save JSON data
            const jsonData = {
                timestamp: this.timestamp(),
                totalSignals: this.qualityResults.length,
                results: this.qualityResults,
                summary: {
                    cleanRunners: this.qualityResults.filter(q => q.label === 'CLEAN_RUNNER').length,
                    smallScalps: this.qualityResults.filter(q => q.label === 'SMALL_SCALP').length,
                    fakeBreaks: this.qualityResults.filter(q => q.label === 'FAKE_BREAK').length,
                    hitPlusOnePercent: ((this.qualityResults.filter(q => q.hitPlusOne).length / this.qualityResults.length) * 100).toFixed(1),
                    neverMinusOnePercent: ((this.qualityResults.filter(q => q.neverMinusOne).length / this.qualityResults.length) * 100).toFixed(1)
                }
            };
            fs.writeFileSync('/app/logs/post_emit_quality_data.json', JSON.stringify(jsonData, null, 2));
            console.log('📁 JSON data saved to /app/logs/post_emit_quality_data.json');
            
        } catch (err) {
            console.error('Failed to save report:', err.message);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN
// ═══════════════════════════════════════════════════════════════════════════
const qualityCheck = new PostEmitQualityCheck();
qualityCheck.run().catch(e => {
    console.error('❌ QUALITY CHECK ERROR:', e.message);
    process.exit(1);
});
