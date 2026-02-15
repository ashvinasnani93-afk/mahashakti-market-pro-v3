/**
 * SIGNAL EMISSION COUNTER TEST
 * 10 attempts - Count BLOCKED vs EMITTED
 */

console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║         🔢 SIGNAL EMISSION COUNTER TEST - 10 ATTEMPTS                                   ║');
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

// Mock calendar to bypass trading hours for testing
calendarService.isValidTradingTime = () => ({ valid: true, detail: 'TEST_MODE' });
calendarService.isHoliday = () => false;

// Reset all states
drawdownGuardService.resetForNewDay();
masterSignalGuard.stats.signalsChecked = 0;
masterSignalGuard.stats.signalsBlocked = 0;
masterSignalGuard.stats.signalsPassed = 0;
masterSignalGuard.stats.blockReasons.clear();

const testCases = [
    // 1. PANIC MODE
    { 
        name: 'PANIC_MODE', 
        setup: () => panicKillSwitchService.manualTrigger('TEST PANIC'),
        cleanup: () => panicKillSwitchService.manualRelease()
    },
    // 2. CIRCUIT BREAKER
    { 
        name: 'CIRCUIT_BREAKER', 
        setup: () => circuitBreakerService.state.circuitHits.set('TEST1', { token: 'TEST1', symbol: 'TEST', changePercent: 20, circuitType: 'UPPER_CIRCUIT' }),
        cleanup: () => circuitBreakerService.state.circuitHits.delete('TEST1'),
        token: 'TEST1'
    },
    // 3. LIQUIDITY T3
    { 
        name: 'LIQUIDITY_T3', 
        setup: () => liquidityTierService.state.tiers.set('TEST2', { token: 'TEST2', symbol: 'LOW', tier: 3, turnoverCr: 5, isBlocked: true }),
        cleanup: () => liquidityTierService.state.tiers.delete('TEST2'),
        token: 'TEST2'
    },
    // 4. THETA CRUSH
    { 
        name: 'THETA_CRUSH', 
        setup: () => { thetaEngineService.state.expiryThetaCrushActive = true; },
        cleanup: () => { thetaEngineService.state.expiryThetaCrushActive = false; },
        isOption: true
    },
    // 5. HIGH SPREAD
    { 
        name: 'HIGH_SPREAD', 
        setup: () => orderbookDepthService.state.depthData.set('TEST3', { token: 'TEST3', symbol: 'OPT', spreadPercent: 20, depthQuality: 'POOR' }),
        cleanup: () => orderbookDepthService.state.depthData.delete('TEST3'),
        token: 'TEST3',
        isOption: true
    },
    // 6. WEAK RS (BUY signal on weak stock)
    { 
        name: 'WEAK_RS_BUY', 
        setup: () => relativeStrengthService.state.rsScores.set('TEST4', { token: 'TEST4', symbol: 'WEAK', rs: -3, percentile: 5 }),
        cleanup: () => relativeStrengthService.state.rsScores.delete('TEST4'),
        token: 'TEST4',
        signalType: 'BUY'
    },
    // 7. DRAWDOWN (5 losses already)
    { 
        name: 'DRAWDOWN_5_LOSSES', 
        setup: () => {
            for (let i = 0; i < 5; i++) {
                drawdownGuardService.registerOutcome({ symbol: 'TEST' }, 'LOSS', -0.5);
            }
        },
        cleanup: () => drawdownGuardService.resetForNewDay()
    },
    // 8. VALID SIGNAL - Should PASS
    { 
        name: 'VALID_SIGNAL_1', 
        setup: () => {
            liquidityTierService.state.tiers.set('VALID1', { token: 'VALID1', symbol: 'GOOD', tier: 1, turnoverCr: 100, isBlocked: false });
            relativeStrengthService.state.rsScores.set('VALID1', { token: 'VALID1', symbol: 'GOOD', rs: 2, percentile: 80 });
        },
        cleanup: () => {
            liquidityTierService.state.tiers.delete('VALID1');
            relativeStrengthService.state.rsScores.delete('VALID1');
        },
        token: 'VALID1',
        shouldPass: true
    },
    // 9. VALID SIGNAL - Should PASS
    { 
        name: 'VALID_SIGNAL_2', 
        setup: () => {
            liquidityTierService.state.tiers.set('VALID2', { token: 'VALID2', symbol: 'GOOD2', tier: 1, turnoverCr: 150, isBlocked: false });
            relativeStrengthService.state.rsScores.set('VALID2', { token: 'VALID2', symbol: 'GOOD2', rs: 1.5, percentile: 70 });
        },
        cleanup: () => {
            liquidityTierService.state.tiers.delete('VALID2');
            relativeStrengthService.state.rsScores.delete('VALID2');
        },
        token: 'VALID2',
        shouldPass: true
    },
    // 10. LOW CONFIDENCE
    { 
        name: 'LOW_CONFIDENCE', 
        setup: () => {
            liquidityTierService.state.tiers.set('LOWCONF', { token: 'LOWCONF', symbol: 'LOWC', tier: 2, turnoverCr: 20, isBlocked: false });
            relativeStrengthService.state.rsScores.set('LOWCONF', { token: 'LOWCONF', symbol: 'LOWC', rs: -0.5, percentile: 35 });
        },
        cleanup: () => {
            liquidityTierService.state.tiers.delete('LOWCONF');
            relativeStrengthService.state.rsScores.delete('LOWCONF');
        },
        token: 'LOWCONF'
    }
];

let blocked = 0;
let emitted = 0;
const results = [];

for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    
    // Setup
    tc.setup();
    
    // Create test signal
    const signal = {
        instrument: { 
            token: tc.token || `TKN${i}`, 
            symbol: tc.name,
            name: tc.name
        },
        type: tc.signalType || 'BUY',
        signal: tc.signalType || 'BUY',
        isOption: tc.isOption || false,
        price: 100,
        strength: tc.shouldPass ? 10 : 5,
        higherTF: { aligned15m: tc.shouldPass, alignedDaily: tc.shouldPass }
    };
    
    // Validate
    const result = masterSignalGuard.validateSignalSync(signal, []);
    
    const status = result.allowed ? '✅ EMITTED' : '🚫 BLOCKED';
    const reason = result.allowed ? '-' : result.blockReasons[0];
    
    results.push({
        '#': i + 1,
        scenario: tc.name,
        result: status,
        reason: reason ? reason.substring(0, 50) : '-'
    });
    
    if (result.allowed) {
        emitted++;
    } else {
        blocked++;
    }
    
    // Cleanup
    tc.cleanup();
}

console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('                    DETAILED RESULTS TABLE');
console.log('═══════════════════════════════════════════════════════════════════════════════');

console.log('');
console.log(`| #  | Scenario            | Result      | Block Reason                         |`);
console.log(`|----|---------------------|-------------|--------------------------------------|`);
for (const r of results) {
    const num = String(r['#']).padStart(2);
    const scenario = r.scenario.padEnd(19);
    const result = r.result.padEnd(11);
    const reason = (r.reason || '-').substring(0, 36).padEnd(36);
    console.log(`| ${num} | ${scenario} | ${result} | ${reason} |`);
}

console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║                          📊 FINAL SIGNAL EMISSION COUNTER                               ║');
console.log('╠══════════════════════════════════════════════════════════════════════════════════════════╣');
console.log(`║     TOTAL_ATTEMPTS:  ${String(testCases.length).padStart(3)}                                                            ║`);
console.log(`║     BLOCKED:         ${String(blocked).padStart(3)}                                                            ║`);
console.log(`║     EMITTED:         ${String(emitted).padStart(3)}                                                            ║`);
console.log(`║     BLOCK_RATE:      ${((blocked / testCases.length) * 100).toFixed(0)}%                                                            ║`);
console.log('╚══════════════════════════════════════════════════════════════════════════════════════════╝');
console.log('\n');

// Master Guard Stats
console.log('═══════════════════════════════════════════════════════════════════════════════');
console.log('MASTER GUARD STATS:');
console.log('═══════════════════════════════════════════════════════════════════════════════');
const stats = masterSignalGuard.getStats();
console.log('Signals Checked:', stats.signalsChecked);
console.log('Signals Blocked:', stats.signalsBlocked);
console.log('Signals Passed:', stats.signalsPassed);
console.log('Block Rate:', stats.blockRate);
console.log('Block Reasons:', JSON.stringify(stats.blockReasons, null, 2));
