/**
 * DRAWDOWN GUARD SERVICE
 * Daily drawdown protection
 * Locks signals if failed signal count or loss threshold breached
 */

class DrawdownGuardService {
    constructor() {
        this.state = {
            signalsGenerated: 0,
            signalsFailed: 0,
            simulatedPnL: 0,
            dailyLocked: false,
            lockReason: null,
            lockedAt: null,
            signalLog: []
        };

        this.config = {
            maxFailedSignals: 5,         // Lock after 5 failed signals
            maxDailyLossPercent: 2,      // Lock if simulated loss > 2%
            capitalBase: 1000000,        // 10L base for simulation
            avgTradeSize: 50000,         // 50K per trade average
            lockoutMinutes: 60           // Lock for 1 hour
        };

        console.log('[DRAWDOWN_GUARD] Initializing drawdown guard...');
        console.log('[DRAWDOWN_GUARD] Initialized');
    }

    /**
     * Register a signal outcome
     * @param {object} signal - Signal data
     * @param {string} outcome - 'WIN', 'LOSS', 'BREAKEVEN'
     * @param {number} pnlPercent - Percentage P&L
     */
    registerOutcome(signal, outcome, pnlPercent) {
        this.state.signalsGenerated++;

        const pnlAmount = (this.config.avgTradeSize * pnlPercent) / 100;
        this.state.simulatedPnL += pnlAmount;

        if (outcome === 'LOSS') {
            this.state.signalsFailed++;
        }

        this.state.signalLog.push({
            timestamp: Date.now(),
            symbol: signal.symbol,
            type: signal.type,
            outcome,
            pnlPercent,
            pnlAmount,
            cumulativePnL: this.state.simulatedPnL
        });

        // Keep last 50 signals
        if (this.state.signalLog.length > 50) {
            this.state.signalLog.shift();
        }

        this.checkLockConditions();

        console.log(`[DRAWDOWN_GUARD] Signal ${outcome}: ${signal.symbol} | PnL: ${pnlPercent.toFixed(2)}% | Cumulative: ₹${this.state.simulatedPnL.toFixed(0)}`);
    }

    /**
     * Check if lock conditions are met
     */
    checkLockConditions() {
        if (this.state.dailyLocked) {
            // Check if lockout period has passed
            if (this.state.lockedAt) {
                const lockDuration = Date.now() - this.state.lockedAt;
                const lockoutMs = this.config.lockoutMinutes * 60 * 1000;
                
                if (lockDuration >= lockoutMs) {
                    this.releaseLock();
                }
            }
            return;
        }

        const lockReasons = [];

        // Check failed signal count
        if (this.state.signalsFailed >= this.config.maxFailedSignals) {
            lockReasons.push(`${this.state.signalsFailed} failed signals`);
        }

        // Check daily loss threshold
        const dailyLossPercent = (Math.abs(Math.min(0, this.state.simulatedPnL)) / this.config.capitalBase) * 100;
        if (dailyLossPercent >= this.config.maxDailyLossPercent) {
            lockReasons.push(`Daily loss ${dailyLossPercent.toFixed(2)}% >= ${this.config.maxDailyLossPercent}%`);
        }

        if (lockReasons.length > 0) {
            this.triggerLock(lockReasons.join(' | '));
        }
    }

    /**
     * Trigger daily lock
     */
    triggerLock(reason) {
        this.state.dailyLocked = true;
        this.state.lockReason = reason;
        this.state.lockedAt = Date.now();

        console.log(`[DRAWDOWN_GUARD] 🔒 DAILY_LOCK_TRIGGERED: ${reason}`);
        console.log(`[DRAWDOWN_GUARD] Locked for ${this.config.lockoutMinutes} minutes`);
    }

    /**
     * Release lock
     */
    releaseLock() {
        console.log(`[DRAWDOWN_GUARD] 🔓 Lock released after ${this.config.lockoutMinutes} minutes`);
        this.state.dailyLocked = false;
        this.state.lockReason = null;
        this.state.lockedAt = null;
    }

    /**
     * MAIN: Check if signals should be allowed
     */
    shouldAllowSignals() {
        this.checkLockConditions(); // Re-check in case lockout expired

        if (this.state.dailyLocked) {
            const lockRemaining = this.state.lockedAt 
                ? Math.max(0, (this.config.lockoutMinutes * 60 * 1000) - (Date.now() - this.state.lockedAt))
                : 0;

            return {
                allowed: false,
                reason: `DRAWDOWN_LOCKED: ${this.state.lockReason}`,
                lockRemaining: Math.round(lockRemaining / 60000),
                detail: {
                    signalsFailed: this.state.signalsFailed,
                    simulatedPnL: this.state.simulatedPnL
                }
            };
        }

        return {
            allowed: true,
            reason: 'Within daily limits',
            signalsFailed: this.state.signalsFailed,
            maxAllowed: this.config.maxFailedSignals
        };
    }

    /**
     * Reset for new day
     */
    resetForNewDay() {
        this.state.signalsGenerated = 0;
        this.state.signalsFailed = 0;
        this.state.simulatedPnL = 0;
        this.state.dailyLocked = false;
        this.state.lockReason = null;
        this.state.lockedAt = null;
        this.state.signalLog = [];
        console.log('[DRAWDOWN_GUARD] Reset for new day');
    }

    /**
     * Manual lock release (for testing)
     */
    manualRelease() {
        this.releaseLock();
        return this.getStats();
    }

    /**
     * Get win rate
     */
    getWinRate() {
        const wins = this.state.signalLog.filter(s => s.outcome === 'WIN').length;
        const total = this.state.signalLog.filter(s => s.outcome !== 'BREAKEVEN').length;
        return total > 0 ? (wins / total) * 100 : 0;
    }

    /**
     * Get stats
     */
    getStats() {
        const dailyLossPercent = (Math.abs(Math.min(0, this.state.simulatedPnL)) / this.config.capitalBase) * 100;

        return {
            dailyLocked: this.state.dailyLocked,
            lockReason: this.state.lockReason,
            lockRemaining: this.state.lockedAt
                ? Math.max(0, Math.round(((this.config.lockoutMinutes * 60 * 1000) - (Date.now() - this.state.lockedAt)) / 60000))
                : 0,
            signalsGenerated: this.state.signalsGenerated,
            signalsFailed: this.state.signalsFailed,
            simulatedPnL: Math.round(this.state.simulatedPnL),
            dailyLossPercent: Math.round(dailyLossPercent * 100) / 100,
            winRate: Math.round(this.getWinRate() * 100) / 100,
            recentSignals: this.state.signalLog.slice(-10),
            config: this.config
        };
    }
}

module.exports = new DrawdownGuardService();
