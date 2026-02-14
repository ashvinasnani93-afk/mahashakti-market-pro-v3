/**
 * PANIC KILL SWITCH SERVICE
 * Global signal blocking during market panic
 * Triggers on: NIFTY -2% in 15min, VIX +15%, Breadth <20%
 */

const marketStateService = require('./marketState.service');
const safetyService = require('./safety.service');

class PanicKillSwitchService {
    constructor() {
        this.state = {
            panicMode: false,
            panicReason: null,
            panicTriggeredAt: null,
            niftyHistory: [],
            vixHistory: [],
            breadthHistory: [],
            cooldownUntil: null
        };

        this.config = {
            niftyDropThreshold: -2,       // -2% drop
            niftyDropWindowMinutes: 15,   // In 15 minutes
            vixSpikeThreshold: 15,        // +15% VIX spike
            vixSpikeWindowMinutes: 15,
            breadthPanicThreshold: 20,    // Below 20% = panic
            panicCooldownMinutes: 30,     // Stay in panic for at least 30 min
            checkIntervalMs: 5000
        };

        this.checkInterval = null;

        console.log('[PANIC_KILL] Initializing panic kill switch...');
        console.log('[PANIC_KILL] Initialized');
    }

    /**
     * Start panic monitoring
     */
    start() {
        if (this.checkInterval) {
            console.log('[PANIC_KILL] Already running');
            return;
        }

        this.check();
        this.checkInterval = setInterval(() => {
            this.check();
        }, this.config.checkIntervalMs);

        console.log('[PANIC_KILL] Started monitoring');
    }

    /**
     * Stop panic monitoring
     */
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            console.log('[PANIC_KILL] Stopped');
        }
    }

    /**
     * Main panic check
     */
    check() {
        const now = Date.now();

        // Check cooldown
        if (this.state.cooldownUntil && now < this.state.cooldownUntil) {
            return; // Still in panic cooldown
        }

        // Get current data
        const niftyState = marketStateService.getState('99926000');
        const vixData = safetyService.getVIXData();

        // Track NIFTY history
        if (niftyState?.ltp) {
            this.state.niftyHistory.push({
                timestamp: now,
                ltp: niftyState.ltp,
                change: niftyState.change || 0
            });
            // Keep last 30 minutes of data
            const cutoff = now - (30 * 60 * 1000);
            this.state.niftyHistory = this.state.niftyHistory.filter(h => h.timestamp > cutoff);
        }

        // Track VIX history
        if (vixData?.vix) {
            this.state.vixHistory.push({
                timestamp: now,
                vix: vixData.vix
            });
            const cutoff = now - (30 * 60 * 1000);
            this.state.vixHistory = this.state.vixHistory.filter(h => h.timestamp > cutoff);
        }

        // Check panic conditions
        const panicReasons = [];

        // Condition 1: NIFTY -2% in 15 min
        const niftyCheck = this.checkNiftyDrop();
        if (niftyCheck.triggered) {
            panicReasons.push(niftyCheck.reason);
        }

        // Condition 2: VIX +15% spike
        const vixCheck = this.checkVIXSpike();
        if (vixCheck.triggered) {
            panicReasons.push(vixCheck.reason);
        }

        // Condition 3: Breadth < 20%
        const breadthCheck = this.checkBreadthPanic();
        if (breadthCheck.triggered) {
            panicReasons.push(breadthCheck.reason);
        }

        // Update panic state
        if (panicReasons.length > 0 && !this.state.panicMode) {
            this.triggerPanic(panicReasons.join(' | '));
        } else if (panicReasons.length === 0 && this.state.panicMode) {
            this.releasePanic();
        }
    }

    /**
     * Check NIFTY drop condition
     */
    checkNiftyDrop() {
        const windowMs = this.config.niftyDropWindowMinutes * 60 * 1000;
        const cutoff = Date.now() - windowMs;
        const recentHistory = this.state.niftyHistory.filter(h => h.timestamp > cutoff);

        if (recentHistory.length < 2) {
            return { triggered: false };
        }

        const oldest = recentHistory[0];
        const newest = recentHistory[recentHistory.length - 1];
        const changePercent = ((newest.ltp - oldest.ltp) / oldest.ltp) * 100;

        if (changePercent <= this.config.niftyDropThreshold) {
            return {
                triggered: true,
                reason: `NIFTY ${changePercent.toFixed(2)}% in ${this.config.niftyDropWindowMinutes}min`
            };
        }

        return { triggered: false };
    }

    /**
     * Check VIX spike condition
     */
    checkVIXSpike() {
        const windowMs = this.config.vixSpikeWindowMinutes * 60 * 1000;
        const cutoff = Date.now() - windowMs;
        const recentHistory = this.state.vixHistory.filter(h => h.timestamp > cutoff);

        if (recentHistory.length < 2) {
            return { triggered: false };
        }

        const oldest = recentHistory[0];
        const newest = recentHistory[recentHistory.length - 1];
        const changePercent = ((newest.vix - oldest.vix) / oldest.vix) * 100;

        if (changePercent >= this.config.vixSpikeThreshold) {
            return {
                triggered: true,
                reason: `VIX +${changePercent.toFixed(2)}% spike`
            };
        }

        return { triggered: false };
    }

    /**
     * Check breadth panic condition
     */
    checkBreadthPanic() {
        // Get from breadth service if available
        try {
            const breadthService = require('./breadth.service');
            const snapshot = breadthService.getSnapshot();
            
            if (snapshot.breadthPercent < this.config.breadthPanicThreshold) {
                return {
                    triggered: true,
                    reason: `Breadth ${snapshot.breadthPercent.toFixed(1)}% < ${this.config.breadthPanicThreshold}%`
                };
            }
        } catch (e) {
            // Breadth service not available
        }

        return { triggered: false };
    }

    /**
     * Trigger panic mode
     */
    triggerPanic(reason) {
        this.state.panicMode = true;
        this.state.panicReason = reason;
        this.state.panicTriggeredAt = Date.now();
        this.state.cooldownUntil = Date.now() + (this.config.panicCooldownMinutes * 60 * 1000);

        console.log(`[PANIC_KILL] 🚨 GLOBAL_SIGNAL_BLOCKED: PANIC_MODE`);
        console.log(`[PANIC_KILL] Reason: ${reason}`);
        console.log(`[PANIC_KILL] Cooldown until: ${new Date(this.state.cooldownUntil).toLocaleTimeString()}`);
    }

    /**
     * Release panic mode
     */
    releasePanic() {
        console.log(`[PANIC_KILL] ✓ Panic mode released after ${Math.round((Date.now() - this.state.panicTriggeredAt) / 60000)} minutes`);
        
        this.state.panicMode = false;
        this.state.panicReason = null;
        this.state.panicTriggeredAt = null;
        this.state.cooldownUntil = null;
    }

    /**
     * MAIN: Check if signals should be allowed
     * @returns {object} { allowed: boolean, reason: string }
     */
    shouldAllowSignals() {
        if (this.state.panicMode) {
            return {
                allowed: false,
                reason: `GLOBAL_SIGNAL_BLOCKED: PANIC_MODE`,
                detail: this.state.panicReason,
                panicTriggeredAt: this.state.panicTriggeredAt,
                cooldownRemaining: Math.round((this.state.cooldownUntil - Date.now()) / 60000)
            };
        }

        return {
            allowed: true,
            reason: 'Market conditions normal'
        };
    }

    /**
     * Manual panic trigger (for testing or emergency)
     */
    manualTrigger(reason = 'Manual trigger') {
        this.triggerPanic(reason);
        return this.getStatus();
    }

    /**
     * Manual panic release
     */
    manualRelease() {
        this.state.cooldownUntil = null;
        this.releasePanic();
        return this.getStatus();
    }

    /**
     * Get panic status
     */
    getStatus() {
        return {
            panicMode: this.state.panicMode,
            panicReason: this.state.panicReason,
            panicTriggeredAt: this.state.panicTriggeredAt,
            cooldownUntil: this.state.cooldownUntil,
            cooldownRemaining: this.state.cooldownUntil 
                ? Math.max(0, Math.round((this.state.cooldownUntil - Date.now()) / 60000))
                : 0,
            niftyHistoryCount: this.state.niftyHistory.length,
            vixHistoryCount: this.state.vixHistory.length,
            config: this.config
        };
    }

    /**
     * Get stats
     */
    getStats() {
        return this.getStatus();
    }
}

module.exports = new PanicKillSwitchService();
