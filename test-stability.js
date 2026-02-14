const wsService = require('./services/websocket.service');
const explosionService = require('./services/explosion.service');
const signalCooldownService = require('./services/signalCooldown.service');

console.log('================================================================');
console.log('     MAHASHAKTI V3 - 20 MINUTE RUNTIME STABILITY TEST');
console.log('================================================================');
console.log('');

const TEST_DURATION_MS = 20 * 60 * 1000; // 20 minutes
const SAMPLE_INTERVAL_MS = 60 * 1000; // Sample every 1 minute

const samples = [];
let errors = [];
let startTime = Date.now();

function getMemoryStats() {
    const mem = process.memoryUsage();
    return {
        heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2),
        heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(2),
        rss: (mem.rss / 1024 / 1024).toFixed(2),
        external: (mem.external / 1024 / 1024).toFixed(2)
    };
}

function getSubscriptionStats() {
    const status = wsService.getStatus();
    return {
        connected: status.connected,
        subscriptionCount: status.subscriptionCount,
        maxSubscriptions: status.maxSubscriptions,
        buckets: status.buckets,
        leakGuardSize: status.leakGuardSize
    };
}

function recordSample(minute) {
    const mem = getMemoryStats();
    const subs = getSubscriptionStats();
    const explosion = explosionService.getStats();
    
    samples.push({
        minute,
        timestamp: new Date().toISOString(),
        memory: mem,
        subscriptions: subs,
        explosions: {
            tracked: explosion.trackedTokens,
            active: explosion.activeCount,
            rollingMemory: explosion.rollingMemorySize
        }
    });
    
    console.log(`[Minute ${minute}] RSS: ${mem.rss} MB | Heap: ${mem.heapUsed}/${mem.heapTotal} MB | Subs: ${subs.subscriptionCount}/${subs.maxSubscriptions} | Explosions Tracked: ${explosion.trackedTokens}`);
}

function checkForLeaks() {
    if (samples.length < 2) return { hasLeak: false };
    
    const first = samples[0];
    const last = samples[samples.length - 1];
    
    const rssGrowth = parseFloat(last.memory.rss) - parseFloat(first.memory.rss);
    const heapGrowth = parseFloat(last.memory.heapUsed) - parseFloat(first.memory.heapUsed);
    const subGrowth = last.subscriptions.subscriptionCount - first.subscriptions.subscriptionCount;
    
    return {
        hasLeak: rssGrowth > 50 || heapGrowth > 30,
        rssGrowth: rssGrowth.toFixed(2),
        heapGrowth: heapGrowth.toFixed(2),
        subscriptionGrowth: subGrowth
    };
}

function generateReport() {
    console.log('');
    console.log('================================================================');
    console.log('               20 MINUTE STABILITY TEST REPORT');
    console.log('================================================================');
    console.log('');
    
    const first = samples[0];
    const last = samples[samples.length - 1];
    const leakCheck = checkForLeaks();
    
    console.log('📊 MEMORY ANALYSIS:');
    console.log('-------------------');
    console.log(`Initial RSS: ${first.memory.rss} MB`);
    console.log(`Final RSS: ${last.memory.rss} MB`);
    console.log(`RSS Growth: ${leakCheck.rssGrowth} MB`);
    console.log('');
    console.log(`Initial Heap: ${first.memory.heapUsed} MB`);
    console.log(`Final Heap: ${last.memory.heapUsed} MB`);
    console.log(`Heap Growth: ${leakCheck.heapGrowth} MB`);
    console.log('');
    
    console.log('📊 SUBSCRIPTION ANALYSIS:');
    console.log('-------------------------');
    console.log(`Initial Subscriptions: ${first.subscriptions.subscriptionCount}`);
    console.log(`Final Subscriptions: ${last.subscriptions.subscriptionCount}`);
    console.log(`Subscription Growth: ${leakCheck.subscriptionGrowth}`);
    console.log('');
    
    console.log('📊 ERROR ANALYSIS:');
    console.log('------------------');
    console.log(`Unhandled Errors: ${errors.length}`);
    if (errors.length > 0) {
        errors.slice(0, 5).forEach((e, i) => {
            console.log(`  ${i + 1}. ${e.message}`);
        });
    }
    console.log('');
    
    console.log('📊 MEMORY SAMPLES OVER TIME:');
    console.log('----------------------------');
    samples.forEach(s => {
        console.log(`  Min ${s.minute}: RSS=${s.memory.rss}MB | Heap=${s.memory.heapUsed}MB | Subs=${s.subscriptions.subscriptionCount}`);
    });
    console.log('');
    
    console.log('📊 FINAL VERDICT:');
    console.log('-----------------');
    const rssPassed = parseFloat(leakCheck.rssGrowth) < 50;
    const heapPassed = parseFloat(leakCheck.heapGrowth) < 30;
    const subsPassed = leakCheck.subscriptionGrowth <= 5;
    const errorsPassed = errors.length === 0;
    
    console.log(`RSS Leak Test: ${rssPassed ? '✅ PASS' : '❌ FAIL'} (Growth: ${leakCheck.rssGrowth} MB, Threshold: <50 MB)`);
    console.log(`Heap Leak Test: ${heapPassed ? '✅ PASS' : '❌ FAIL'} (Growth: ${leakCheck.heapGrowth} MB, Threshold: <30 MB)`);
    console.log(`Subscription Leak Test: ${subsPassed ? '✅ PASS' : '❌ FAIL'} (Growth: ${leakCheck.subscriptionGrowth}, Threshold: <=5)`);
    console.log(`Unhandled Errors Test: ${errorsPassed ? '✅ PASS' : '❌ FAIL'} (Count: ${errors.length})`);
    console.log('');
    
    const allPassed = rssPassed && heapPassed && subsPassed && errorsPassed;
    console.log('================================================================');
    console.log(`           OVERALL STABILITY: ${allPassed ? '✅ STABLE' : '❌ UNSTABLE'}`);
    console.log('================================================================');
    
    return allPassed;
}

// Error handlers
process.on('uncaughtException', (err) => {
    errors.push({ type: 'uncaughtException', message: err.message, timestamp: Date.now() });
    console.error('[ERROR] Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
    errors.push({ type: 'unhandledRejection', message: String(reason), timestamp: Date.now() });
    console.error('[ERROR] Unhandled Rejection:', reason);
});

// Start test
console.log(`Starting ${TEST_DURATION_MS / 60000} minute stability test...`);
console.log(`Sampling every ${SAMPLE_INTERVAL_MS / 1000} seconds`);
console.log('');

// Initial sample
recordSample(0);

let currentMinute = 1;
const sampleInterval = setInterval(() => {
    recordSample(currentMinute);
    currentMinute++;
}, SAMPLE_INTERVAL_MS);

// Simulate some activity
const activityInterval = setInterval(() => {
    // Simulate price updates
    for (let i = 0; i < 10; i++) {
        const token = `SIM_${Math.floor(Math.random() * 100)}`;
        explosionService.recordPrice(token, 1000 + Math.random() * 100, Math.floor(50000 + Math.random() * 50000));
    }
    
    // Simulate cooldown checks
    signalCooldownService.canEmitSignal(`TOKEN_${Math.floor(Math.random() * 50)}`, 'BUY', 'LONG');
}, 5000);

// End test after duration
setTimeout(() => {
    clearInterval(sampleInterval);
    clearInterval(activityInterval);
    
    // Final sample
    recordSample(20);
    
    const passed = generateReport();
    process.exit(passed ? 0 : 1);
}, TEST_DURATION_MS);

console.log('Test running... Please wait 20 minutes for completion.');
console.log('');
