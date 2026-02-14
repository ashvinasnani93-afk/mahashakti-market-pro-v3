/**
 * 🔴 CAPITAL GUARD SERVICE - Capital Protection Core
 * Rules-based signal protection before final emit
 */

const safetyService = require('./safety.service');
const marketStateService = require('./marketState.service');

class CapitalGuardService {
    constructor() {
        // Signal history for pattern detection
        this.recentSignals = [];
        this.maxRecentSignals = 10;
        
        // Spike detection
        this.spikeHistory = new Map();  // token -> [{ time, change }]
        
        // Protection state
        this.protectionState = {
            weakSignalStreak: 0,
            isBuySuspended: false,
            lastCrashCheck: null,
            protectionLevel: 0  // 0-3 (normal to max protection)
        };
        
        // Configuration
        this.config = {
            weakSignalThreshold: 3,
            indexCrashThreshold: -2,      // 2% index drop
            spikeThreshold: 1.5,          // 1.5% in 1 min
            spikeConfirmationWait: 60000, // 60 sec wait after spike
            minLiquidity: 50000,
            vixHighThreshold: 25
        };
        
        this.lastUpdate = null;
    }

    initialize() {
        console.log('[CAPITAL_GUARD] Initializing capital protection...');
        console.log('[CAPITAL_GUARD] Initialized');
    }

    // 🔴 MAIN GUARD FUNCTION - Called before final signal emit
    evaluateSignal(signal) {
        const guards = [];
        let finalSignal = { ...signal };
        let shouldEmit = true;
        
        // Guard 1: Check VIX level
        const vixGuard = this.checkVIXGuard(signal);
        guards.push(vixGuard);
        if (vixGuard.action === 'DOWNGRADE') {
            finalSignal = this.downgradeSignal(finalSignal, vixGuard.reason);
        }
        
        // Guard 2: Check index crash
        const crashGuard = this.checkIndexCrashGuard(signal);
        guards.push(crashGuard);
        if (crashGuard.action === 'SUSPEND') {
            shouldEmit = false;
            finalSignal.suspended = true;
            finalSignal.suspendReason = crashGuard.reason;
        }
        
        // Guard 3: Check for sudden spike
        const spikeGuard = this.checkSpikeGuard(signal);
        guards.push(spikeGuard);
        if (spikeGuard.action === 'DEFER') {
            shouldEmit = false;
            finalSignal.deferred = true;
            finalSignal.deferReason = spikeGuard.reason;
        }
        
        // Guard 4: Check liquidity
        const liquidityGuard = this.checkLiquidityGuard(signal);
        guards.push(liquidityGuard);
        if (liquidityGuard.action === 'REJECT') {
            shouldEmit = false;
            finalSignal.rejected = true;
            finalSignal.rejectReason = liquidityGuard.reason;
        }
        
        // Guard 5: Check weak signal streak
        const streakGuard = this.checkWeakSignalStreak(signal);
        guards.push(streakGuard);
        if (streakGuard.action === 'REDUCE') {
            finalSignal = this.reduceSignalStrength(finalSignal, streakGuard.reason);
        }
        
        // Update protection level
        this.updateProtectionLevel(guards);
        
        return {
            shouldEmit,
            originalSignal: signal,
            finalSignal,
            guards,
            protectionLevel: this.protectionState.protectionLevel,
            timestamp: Date.now()
        };
    }

    // 🔴 GUARD 1: VIX CHECK
    checkVIXGuard(signal) {
        const vixData = safetyService.getVIXData();
        const vix = vixData.vix;
        const level = vixData.level;
        
        // High VIX → downgrade STRONG signals
        if ((level === 'HIGH' || level === 'EXTREME') && 
            (signal.signal === 'STRONG_BUY' || signal.signal === 'STRONG_SELL')) {
            return {
                name: 'VIX_GUARD',
                pass: false,
                action: 'DOWNGRADE',
                reason: `VIX ${vix} (${level}) - Downgrading STRONG to regular`,
                vix,
                level
            };
        }
        
        return {
            name: 'VIX_GUARD',
            pass: true,
            action: 'NONE',
            vix,
            level
        };
    }

    // 🔴 GUARD 2: INDEX CRASH CHECK
    checkIndexCrashGuard(signal) {
        const indexPrices = marketStateService.getIndexPrices();
        const niftyChange = indexPrices.NIFTY?.change || 0;
        
        // Index crash > 2% → suspend new BUY signals
        if (niftyChange <= this.config.indexCrashThreshold) {
            if (signal.signal === 'BUY' || signal.signal === 'STRONG_BUY') {
                this.protectionState.isBuySuspended = true;
                return {
                    name: 'CRASH_GUARD',
                    pass: false,
                    action: 'SUSPEND',
                    reason: `NIFTY crash ${niftyChange.toFixed(2)}% - BUY suspended`,
                    niftyChange
                };
            }
        } else {
            this.protectionState.isBuySuspended = false;
        }
        
        return {
            name: 'CRASH_GUARD',
            pass: true,
            action: 'NONE',
            niftyChange
        };
    }

    // 🔴 GUARD 3: SPIKE DETECTION
    checkSpikeGuard(signal) {
        const token = signal.token;
        const state = marketStateService.getState(token);
        
        if (!state) return { name: 'SPIKE_GUARD', pass: true, action: 'NONE' };
        
        // Record current state
        const history = this.spikeHistory.get(token) || [];
        history.push({
            time: Date.now(),
            ltp: state.ltp,
            change: state.percentChangeFromOpen
        });
        
        // Keep last 10 entries
        if (history.length > 10) history.shift();
        this.spikeHistory.set(token, history);
        
        // Check for sudden spike (1.5% in last minute)
        if (history.length >= 2) {
            const now = Date.now();
            const oneMinAgo = now - 60000;
            const recentHistory = history.filter(h => h.time > oneMinAgo);
            
            if (recentHistory.length >= 2) {
                const firstChange = recentHistory[0].change;
                const lastChange = recentHistory[recentHistory.length - 1].change;
                const spikePercent = Math.abs(lastChange - firstChange);
                
                if (spikePercent >= this.config.spikeThreshold) {
                    return {
                        name: 'SPIKE_GUARD',
                        pass: false,
                        action: 'DEFER',
                        reason: `Sudden ${spikePercent.toFixed(2)}% spike in 1 min - Deferred for confirmation`,
                        spikePercent
                    };
                }
            }
        }
        
        return { name: 'SPIKE_GUARD', pass: true, action: 'NONE' };
    }

    // 🔴 GUARD 4: LIQUIDITY CHECK
    checkLiquidityGuard(signal) {
        const token = signal.token;
        const state = marketStateService.getState(token);
        
        if (!state) return { name: 'LIQUIDITY_GUARD', pass: true, action: 'NONE' };
        
        const avgVolume = state.avgVolume || 0;
        
        if (avgVolume > 0 && avgVolume < this.config.minLiquidity) {
            return {
                name: 'LIQUIDITY_GUARD',
                pass: false,
                action: 'REJECT',
                reason: `Low liquidity (avg vol: ${avgVolume}) - Signal rejected`,
                avgVolume
            };
        }
        
        return { name: 'LIQUIDITY_GUARD', pass: true, action: 'NONE', avgVolume };
    }

    // 🔴 GUARD 5: WEAK SIGNAL STREAK
    checkWeakSignalStreak(signal) {
        // Record signal quality
        const isStrong = signal.signal === 'STRONG_BUY' || signal.signal === 'STRONG_SELL';
        
        this.recentSignals.push({
            time: Date.now(),
            isStrong,
            score: signal.score || 50
        });
        
        if (this.recentSignals.length > this.maxRecentSignals) {
            this.recentSignals.shift();
        }
        
        // Check last 3 signals
        const lastThree = this.recentSignals.slice(-3);
        const weakCount = lastThree.filter(s => !s.isStrong && s.score < 60).length;
        
        if (weakCount >= this.config.weakSignalThreshold) {
            this.protectionState.weakSignalStreak = weakCount;
            return {
                name: 'STREAK_GUARD',
                pass: false,
                action: 'REDUCE',
                reason: `${weakCount} consecutive weak signals - Reducing strength`,
                weakCount
            };
        }
        
        this.protectionState.weakSignalStreak = 0;
        return { name: 'STREAK_GUARD', pass: true, action: 'NONE' };
    }

    // 🔴 HELPER FUNCTIONS
    
    downgradeSignal(signal, reason) {
        const downgraded = { ...signal };
        
        if (signal.signal === 'STRONG_BUY') {
            downgraded.signal = 'BUY';
            downgraded.downgraded = true;
            downgraded.downgradeReason = reason;
            console.log(`[CAPITAL_GUARD] STRONG_BUY → BUY: ${reason}`);
        } else if (signal.signal === 'STRONG_SELL') {
            downgraded.signal = 'SELL';
            downgraded.downgraded = true;
            downgraded.downgradeReason = reason;
            console.log(`[CAPITAL_GUARD] STRONG_SELL → SELL: ${reason}`);
        }
        
        return downgraded;
    }

    reduceSignalStrength(signal, reason) {
        const reduced = { ...signal };
        reduced.strengthReduced = true;
        reduced.reduceReason = reason;
        
        if (reduced.score) {
            reduced.originalScore = reduced.score;
            reduced.score = Math.max(30, reduced.score - 20);
        }
        
        return reduced;
    }

    updateProtectionLevel(guards) {
        const failedGuards = guards.filter(g => !g.pass).length;
        
        if (failedGuards >= 3) {
            this.protectionState.protectionLevel = 3;
        } else if (failedGuards >= 2) {
            this.protectionState.protectionLevel = 2;
        } else if (failedGuards >= 1) {
            this.protectionState.protectionLevel = 1;
        } else {
            this.protectionState.protectionLevel = 0;
        }
    }

    getProtectionState() {
        return {
            ...this.protectionState,
            recentSignalsCount: this.recentSignals.length,
            spikeHistoryTokens: this.spikeHistory.size,
            lastUpdate: this.lastUpdate
        };
    }

    resetDaily() {
        this.recentSignals = [];
        this.spikeHistory.clear();
        this.protectionState = {
            weakSignalStreak: 0,
            isBuySuspended: false,
            lastCrashCheck: null,
            protectionLevel: 0
        };
    }
}

module.exports = new CapitalGuardService();
