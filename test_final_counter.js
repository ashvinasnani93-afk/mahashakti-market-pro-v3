/**
 * FINAL SIGNAL EMISSION COUNTER TEST
 * All guards bypassed except the one being tested
 */

console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║      🔢 FINAL SIGNAL EMISSION COUNTER - ALL GUARDS WORKING                              ║');
console.log('╚══════════════════════════════════════════════════════════════════════════════════════════╝');
console.log('\n');

// Load services
const masterSignalGuard = require('./services/masterSignalGuard.service');
const panicKillSwitchService = require('./services/panicKillSwitch.service');
const circuitBreakerService = require('./services/circuitBreaker.service');
const liquidityTierService = require('./services/liquidityTier.service');
const thetaEngineService = require('./services/thetaEngine.service');
const orderbookDepthService = require('./services/orderbookDepth.service');
const drawdownGuardService = require('./services/drawdownGuard.service');
const relativeStrengthService = require('./services/relativeStrength.service');
const calendarService = require('./services/calendar.service');
const clockSyncService = require('./services/clockSync.service');
const latencyMonitorService = require('./services/latencyMonitor.service');
const volatilityRegimeService = require('./services/volatilityRegime.service');
const timeOfDayService = require('./services/timeOfDay.service');
const liquidityShockService = require('./services/liquidityShock.service');
const breadthService = require('./services/breadth.service');

// Mock ALL time/calendar to bypass for pure logic testing
calendarService.isValidTradingTime = () => ({ valid: true, detail: 'TEST_MODE' });
calendarService.isHoliday = () => false;
clockSyncService.shouldAllowSignals = () => ({ allowed: true });
latencyMonitorService.shouldAllowSignals = () => ({ allowed: true });
timeOfDayService.checkSignal = () => ({ allowed: true, mode: 'TEST_MODE' });
volatilityRegimeService.checkSignalCompatibility = () => ({ compatible: true });
liquidityShockService.checkSignal = () => ({ allowed: true });
breadthService.checkSignal = () => ({ adjustment: null });
breadthService.getSnapshot = () => ({ breadthPercent: 60 });

// Reset all states
drawdownGuardService.resetForNewDay();
masterSignalGuard.stats.signalsChecked = 0;
masterSignalGuard.stats.signalsBlocked = 0;
masterSignalGuard.stats.signalsPassed = 0;
masterSignalGuard.stats.blockReasons.clear();

// Helper to create valid signal base
function createSignal(token, symbol, opts = {}) {
    return {
        instrument: { token, symbol, name: symbol },
        type: opts.type || 'BUY',
        signal: opts.type || 'BUY',
        isOption: opts.isOption || false,
        underlying: opts.underlying || 'NIFTY',
        price: 100,
        strength: opts.strength || 12,
        higherTF: { aligned15m: true, alignedDaily: true },
        riskReward: { primaryRR: 2.5 }
    };
}

const testCases = [
    // 1. PANIC MODE - Should BLOCK
    { 
        name: '1. PANIC_MODE', 
        setup: () => {
            liquidityTierService.state.tiers.set('TKN1', { token: 'TKN1', tier: 1, turnoverCr: 100, isBlocked: false });
            relativeStrengthService.state.rsScores.set('TKN1', { token: 'TKN1', rs: 2, percentile: 80 });
            panicKillSwitchService.manualTrigger('NIFTY -2% CRASH');
        },
        cleanup: () => {
            panicKillSwitchService.manualRelease();
            liquidityTierService.state.tiers.delete('TKN1');
            relativeStrengthService.state.rsScores.delete('TKN1');
        },
        signal: createSignal('TKN1', 'RELIANCE', { strength: 15 }),
        expectedBlock: 'PANIC_BLOCKED'
    },
    // 2. CIRCUIT BREAKER - Should BLOCK
    { 
        name: '2. CIRCUIT_BREAKER', 
        setup: () => {
            liquidityTierService.state.tiers.set('TKN2', { token: 'TKN2', tier: 1, turnoverCr: 100, isBlocked: false });
            relativeStrengthService.state.rsScores.set('TKN2', { token: 'TKN2', rs: 2, percentile: 80 });
            circuitBreakerService.state.circuitHits.set('TKN2', { token: 'TKN2', symbol: 'YESBANK', changePercent: 20, circuitType: 'UPPER_CIRCUIT' });
        },
        cleanup: () => {
            circuitBreakerService.state.circuitHits.delete('TKN2');
            liquidityTierService.state.tiers.delete('TKN2');
            relativeStrengthService.state.rsScores.delete('TKN2');
        },
        signal: createSignal('TKN2', 'YESBANK', { strength: 15 }),
        expectedBlock: 'CIRCUIT_BLOCKED'
    },
    // 3. LIQUIDITY T3 - Should BLOCK
    { 
        name: '3. LIQUIDITY_T3', 
        setup: () => {
            liquidityTierService.state.tiers.set('TKN3', { token: 'TKN3', tier: 3, turnoverCr: 5, isBlocked: true });
            relativeStrengthService.state.rsScores.set('TKN3', { token: 'TKN3', rs: 2, percentile: 80 });
        },
        cleanup: () => {
            liquidityTierService.state.tiers.delete('TKN3');
            relativeStrengthService.state.rsScores.delete('TKN3');
        },
        signal: createSignal('TKN3', 'SMALLCAP', { strength: 15 }),
        expectedBlock: 'LIQUIDITY_BLOCKED'
    },
    // 4. DRAWDOWN GUARD - Should BLOCK
    { 
        name: '4. DRAWDOWN_5_LOSSES', 
        setup: () => {
            liquidityTierService.state.tiers.set('TKN4', { token: 'TKN4', tier: 1, turnoverCr: 100, isBlocked: false });
            relativeStrengthService.state.rsScores.set('TKN4', { token: 'TKN4', rs: 2, percentile: 80 });
            for (let i = 0; i < 5; i++) {
                drawdownGuardService.registerOutcome({ symbol: 'LOSS' }, 'LOSS', -0.5);
            }
        },
        cleanup: () => {
            drawdownGuardService.resetForNewDay();
            liquidityTierService.state.tiers.delete('TKN4');
            relativeStrengthService.state.rsScores.delete('TKN4');
        },
        signal: createSignal('TKN4', 'AFTERLOSS', { strength: 15 }),
        expectedBlock: 'DRAWDOWN_BLOCKED'
    },
    // 5. WEAK RS - Should BLOCK
    { 
        name: '5. WEAK_RS_BUY', 
        setup: () => {
            liquidityTierService.state.tiers.set('TKN5', { token: 'TKN5', tier: 1, turnoverCr: 100, isBlocked: false });
            relativeStrengthService.state.rsScores.set('TKN5', { token: 'TKN5', rs: -3, percentile: 5 });
        },
        cleanup: () => {
            liquidityTierService.state.tiers.delete('TKN5');
            relativeStrengthService.state.rsScores.delete('TKN5');
        },
        signal: createSignal('TKN5', 'WEAKSTOCK', { strength: 15, type: 'BUY' }),
        expectedBlock: 'RS_BLOCKED'
    },
    // 6. THETA CRUSH (Option) - Should BLOCK
    { 
        name: '6. THETA_CRUSH', 
        setup: () => {
            liquidityTierService.state.tiers.set('TKN6', { token: 'TKN6', tier: 1, turnoverCr: 100, isBlocked: false });
            relativeStrengthService.state.rsScores.set('TKN6', { token: 'TKN6', rs: 2, percentile: 80 });
            thetaEngineService.state.expiryThetaCrushActive = true;
        },
        cleanup: () => {
            thetaEngineService.state.expiryThetaCrushActive = false;
            liquidityTierService.state.tiers.delete('TKN6');
            relativeStrengthService.state.rsScores.delete('TKN6');
        },
        signal: createSignal('TKN6', 'NIFTY25000CE', { strength: 15, isOption: true }),
        expectedBlock: 'THETA_BLOCKED'
    },
    // 7. HIGH SPREAD (Option) - Should BLOCK
    { 
        name: '7. HIGH_SPREAD', 
        setup: () => {
            liquidityTierService.state.tiers.set('TKN7', { token: 'TKN7', tier: 1, turnoverCr: 100, isBlocked: false });
            relativeStrengthService.state.rsScores.set('TKN7', { token: 'TKN7', rs: 2, percentile: 80 });
            orderbookDepthService.state.depthData.set('TKN7', { token: 'TKN7', spreadPercent: 20, depthQuality: 'POOR' });
        },
        cleanup: () => {
            orderbookDepthService.state.depthData.delete('TKN7');
            liquidityTierService.state.tiers.delete('TKN7');
            relativeStrengthService.state.rsScores.delete('TKN7');
        },
        signal: createSignal('TKN7', 'NIFTY24000PE', { strength: 15, isOption: true }),
        expectedBlock: 'SPREAD_BLOCKED'
    },
    // 8. VALID SIGNAL 1 - Should PASS
    { 
        name: '8. VALID_SIGNAL_1', 
        setup: () => {
            liquidityTierService.state.tiers.set('VALID1', { token: 'VALID1', tier: 1, turnoverCr: 200, isBlocked: false });
            relativeStrengthService.state.rsScores.set('VALID1', { token: 'VALID1', rs: 2.5, percentile: 85 });
        },
        cleanup: () => {
            liquidityTierService.state.tiers.delete('VALID1');
            relativeStrengthService.state.rsScores.delete('VALID1');
        },
        signal: createSignal('VALID1', 'RELIANCE', { strength: 15 }),
        expectedBlock: null // Should PASS
    },
    // 9. VALID SIGNAL 2 - Should PASS
    { 
        name: '9. VALID_SIGNAL_2', 
        setup: () => {
            liquidityTierService.state.tiers.set('VALID2', { token: 'VALID2', tier: 1, turnoverCr: 150, isBlocked: false });
            relativeStrengthService.state.rsScores.set('VALID2', { token: 'VALID2', rs: 1.8, percentile: 75 });
        },
        cleanup: () => {
            liquidityTierService.state.tiers.delete('VALID2');
            relativeStrengthService.state.rsScores.delete('VALID2');
        },
        signal: createSignal('VALID2', 'HDFC', { strength: 15 }),
        expectedBlock: null // Should PASS
    },
    // 10. VALID SIGNAL 3 - Should PASS
    { 
        name: '10. VALID_SIGNAL_3', 
        setup: () => {
            liquidityTierService.state.tiers.set('VALID3', { token: 'VALID3', tier: 1, turnoverCr: 180, isBlocked: false });
            relativeStrengthService.state.rsScores.set('VALID3', { token: 'VALID3', rs: 2.0, percentile: 78 });
        },
        cleanup: () => {
            liquidityTierService.state.tiers.delete('VALID3');
            relativeStrengthService.state.rsScores.delete('VALID3');
        },
        signal: createSignal('VALID3', 'INFY', { strength: 15 }),
        expectedBlock: null // Should PASS
    }
];

let blocked = 0;
let emitted = 0;
const results = [];

console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('                    RUNNING 10 SIGNAL TESTS');
console.log('═══════════════════════════════════════════════════════════════════════════════\n');

for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    
    // Setup
    tc.setup();
    
    // Validate
    const result = masterSignalGuard.validateSignalSync(tc.signal, []);
    
    const status = result.allowed ? '✅ EMITTED' : '🚫 BLOCKED';
    const reason = result.allowed ? '-' : result.blockReasons[0];
    const expected = tc.expectedBlock ? `Should block with ${tc.expectedBlock}` : 'Should PASS';
    const match = tc.expectedBlock ? (reason && reason.includes(tc.expectedBlock.replace('_BLOCKED', ''))) : result.allowed;
    
    results.push({
        num: i + 1,
        scenario: tc.name,
        result: status,
        reason: reason ? reason.substring(0, 45) : '-',
        expected: expected,
        correct: match ? '✓' : '✗'
    });
    
    console.log(`${tc.name}: ${status} ${match ? '✓' : '✗'}`);
    if (!result.allowed) {
        console.log(`   └─ Block: ${reason}`);
    }
    
    if (result.allowed) {
        emitted++;
    } else {
        blocked++;
    }
    
    // Cleanup
    tc.cleanup();
}

console.log('\n');
console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('                    DETAILED RESULTS TABLE');
console.log('═══════════════════════════════════════════════════════════════════════════════\n');

console.log(`| #  | Scenario             | Result      | Block Reason                           | ✓/✗ |`);
console.log(`|----|----------------------|-------------|----------------------------------------|-----|`);
for (const r of results) {
    const num = String(r.num).padStart(2);
    const scenario = r.scenario.substring(3).padEnd(20);
    const result = r.result.padEnd(11);
    const reason = (r.reason || '-').padEnd(40);
    console.log(`| ${num} | ${scenario} | ${result} | ${reason} | ${r.correct}   |`);
}

console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║                          📊 FINAL SIGNAL EMISSION COUNTER                               ║');
console.log('╠══════════════════════════════════════════════════════════════════════════════════════════╣');
console.log(`║     TOTAL_ATTEMPTS:  ${String(testCases.length).padStart(3)}                                                            ║`);
console.log(`║     BLOCKED:         ${String(blocked).padStart(3)}                                                            ║`);
console.log(`║     EMITTED:         ${String(emitted).padStart(3)}                                                            ║`);
console.log(`║     BLOCK_RATE:      ${((blocked / testCases.length) * 100).toFixed(0)}%                                                             ║`);
console.log('╚══════════════════════════════════════════════════════════════════════════════════════════╝');
console.log('\n');

// Master Guard Stats
console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('MASTER GUARD ENFORCEMENT STATS:');
console.log('═══════════════════════════════════════════════════════════════════════════════');
const stats = masterSignalGuard.getStats();
console.log('Signals Checked:', stats.signalsChecked);
console.log('Signals Blocked:', stats.signalsBlocked);
console.log('Signals Passed:', stats.signalsPassed);
console.log('Block Rate:', stats.blockRate);
console.log('Pass Rate:', stats.passRate);
console.log('\nBlock Reasons Distribution:');
console.log(JSON.stringify(stats.blockReasons, null, 2));
