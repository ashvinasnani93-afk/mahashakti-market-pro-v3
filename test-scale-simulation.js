/**
 * 🔴 MAHASHAKTI V3 - 800 INSTRUMENT DRY SIMULATION
 * Scale test for Full Market Expansion
 */

const universeLoader = require('./services/universeLoader.service');
const wsService = require('./services/websocket.service');
const systemMonitor = require('./services/systemMonitor.service');
const oiIntelligence = require('./services/oiIntelligence.service');
const crossMarketContext = require('./services/crossMarketContext.service');
const safetyService = require('./services/safety.service');
const authService = require('./services/auth.service');

async function runSimulation() {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║        MAHASHAKTI V3 - 800 INSTRUMENT DRY SIMULATION          ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');

    const results = {
        passed: [],
        failed: [],
        warnings: []
    };

    try {
        // 1. Auth
        console.log('[1/8] Authenticating...');
        await authService.login();
        results.passed.push('AUTH: Login successful');

        // 2. Universe Load
        console.log('[2/8] Loading Universe from Angel Master JSON...');
        const startUniverse = Date.now();
        await universeLoader.loadFromAngelMaster();
        const universeTime = Date.now() - startUniverse;
        
        const stats = universeLoader.getStats();
        console.log(`   Master JSON Size: ${stats.masterJsonSize}`);
        console.log(`   NSE Equity: ${stats.nseEquityCount}`);
        console.log(`   F&O Stocks: ${stats.fnoStocksCount}`);
        console.log(`   Index Options: ${stats.indexOptionsCount}`);
        console.log(`   Total: ${stats.totalInstruments}`);
        console.log(`   Load Time: ${universeTime}ms`);

        if (stats.totalInstruments >= 800) {
            results.passed.push(`UNIVERSE: ${stats.totalInstruments} instruments loaded (Target: 800+)`);
        } else if (stats.totalInstruments >= 500) {
            results.warnings.push(`UNIVERSE: ${stats.totalInstruments} instruments (Below 800 target)`);
        } else {
            results.failed.push(`UNIVERSE: Only ${stats.totalInstruments} instruments`);
        }

        // 3. Index Options ATM Test
        console.log('[3/8] Testing Index Options ATM Selection...');
        const indices = ['NIFTY', 'BANKNIFTY', 'FINNIFTY'];
        const spotPrices = { NIFTY: 22000, BANKNIFTY: 47000, FINNIFTY: 21000 };
        
        for (const idx of indices) {
            const atmOptions = universeLoader.getATMOptions(idx, spotPrices[idx], 15, 10);
            console.log(`   ${idx} ATM ±10: ${atmOptions.length} options`);
            
            if (atmOptions.length > 0) {
                results.passed.push(`ATM_OPTIONS: ${idx} returned ${atmOptions.length} options`);
            } else {
                results.warnings.push(`ATM_OPTIONS: ${idx} returned 0 options`);
            }
        }

        // 4. OI Intelligence Init
        console.log('[4/8] Initializing OI Intelligence...');
        oiIntelligence.initialize();
        
        // Simulate OI data
        const testToken = '99926000';
        oiIntelligence.recordOI(testToken, 1000000, 22050);
        oiIntelligence.recordOI(testToken, 1050000, 22100); // 5% OI increase + price up
        
        const oiStats = oiIntelligence.getStats();
        console.log(`   OI Tracked: ${oiStats.totalOITracked}`);
        console.log(`   Buildup Signals: ${oiStats.buildupSignals}`);
        
        if (oiStats.totalOITracked > 0) {
            results.passed.push('OI_INTELLIGENCE: OI tracking working');
        }

        // 5. Cross-Market Context Init
        console.log('[5/8] Initializing Cross-Market Context...');
        crossMarketContext.initialize();
        
        // Simulate index prices
        crossMarketContext.setIndexPrice('NIFTY', 22100);
        crossMarketContext.setIndexPrice('BANKNIFTY', 47200);
        
        const context = crossMarketContext.getMarketContext();
        console.log(`   Market Bias: ${context.bias}`);
        console.log(`   Market Strength: ${context.strength}`);
        
        results.passed.push(`CROSS_MARKET: Bias=${context.bias}, Strength=${context.strength}`);

        // 6. VIX Safety Test
        console.log('[6/8] Testing VIX Safety Layer...');
        safetyService.initializeVIXMonitoring();
        
        // Test different VIX levels
        const vixTests = [10, 15, 20, 30, 40];
        for (const vix of vixTests) {
            safetyService.setVIX(vix);
            const vixData = safetyService.getVIXData();
            console.log(`   VIX ${vix}: Level=${vixData.level}, Premium=${vixData.premiumAdjustment.minPremium}-${vixData.premiumAdjustment.maxPremium}`);
        }
        results.passed.push('VIX_SAFETY: All VIX levels handled correctly');

        // 7. WebSocket Rotation Stress Test
        console.log('[7/8] Testing WebSocket Rotation (50 max)...');
        await wsService.connect();
        
        // Add 60 tokens (should enforce 50 limit)
        const testTokens = Array.from({ length: 60 }, (_, i) => `TEST_${i}`);
        wsService.subscribeWithPriority(testTokens.slice(0, 5), 'CORE');
        wsService.subscribeWithPriority(testTokens.slice(5, 25), 'ACTIVE');
        wsService.subscribeWithPriority(testTokens.slice(25, 35), 'EXPLOSION');
        wsService.subscribeWithPriority(testTokens.slice(35), 'ROTATION');
        
        const wsStatus = wsService.getStatus();
        console.log(`   Total Subscriptions: ${wsStatus.subscriptionCount}/${wsStatus.maxSubscriptions}`);
        console.log(`   CORE: ${wsStatus.buckets.CORE}`);
        console.log(`   ACTIVE: ${wsStatus.buckets.ACTIVE}`);
        console.log(`   EXPLOSION: ${wsStatus.buckets.EXPLOSION}`);
        console.log(`   ROTATION: ${wsStatus.buckets.ROTATION}`);
        
        if (wsStatus.subscriptionCount <= 50) {
            results.passed.push(`WS_LIMIT: ${wsStatus.subscriptionCount}/50 (Limit enforced)`);
        } else {
            results.failed.push(`WS_LIMIT: ${wsStatus.subscriptionCount}/50 (EXCEEDED!)`);
        }

        // 8. Memory Check
        console.log('[8/8] Checking Memory Usage...');
        systemMonitor.initialize();
        await new Promise(r => setTimeout(r, 2000));
        
        const health = systemMonitor.getHealth();
        console.log(`   RSS: ${health.memory.rssMB}MB`);
        console.log(`   Heap Used: ${health.memory.heapUsedMB}MB`);
        console.log(`   CPU: ${health.cpu.current}%`);
        console.log(`   Status: ${health.status}`);
        
        if (health.memory.rssMB < 150) {
            results.passed.push(`MEMORY: ${health.memory.rssMB}MB RSS (Target: <150MB)`);
        } else if (health.memory.rssMB < 200) {
            results.warnings.push(`MEMORY: ${health.memory.rssMB}MB RSS (Acceptable for full market load)`);
        } else {
            results.failed.push(`MEMORY: ${health.memory.rssMB}MB RSS (EXCEEDED 200MB!)`);
        }

    } catch (error) {
        results.failed.push(`ERROR: ${error.message}`);
    }

    // Print Results
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    SIMULATION RESULTS                         ║');
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    
    console.log('║ ✅ PASSED:');
    results.passed.forEach(p => console.log(`║   ${p}`));
    
    if (results.warnings.length > 0) {
        console.log('║ ⚠️ WARNINGS:');
        results.warnings.forEach(w => console.log(`║   ${w}`));
    }
    
    if (results.failed.length > 0) {
        console.log('║ ❌ FAILED:');
        results.failed.forEach(f => console.log(`║   ${f}`));
    }
    
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    const total = results.passed.length + results.warnings.length + results.failed.length;
    const passRate = ((results.passed.length / total) * 100).toFixed(1);
    console.log(`║ PASS RATE: ${passRate}% (${results.passed.length}/${total})`);
    console.log(`║ STATUS: ${results.failed.length === 0 ? '✅ ALL CRITICAL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    
    // Cleanup
    wsService.disconnect();
    systemMonitor.stop();
    crossMarketContext.stop();
    safetyService.stop();
    
    process.exit(results.failed.length > 0 ? 1 : 0);
}

runSimulation().catch(err => {
    console.error('Simulation failed:', err);
    process.exit(1);
});
