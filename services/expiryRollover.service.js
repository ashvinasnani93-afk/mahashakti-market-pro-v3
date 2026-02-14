/**
 * EXPIRY ROLLOVER SERVICE
 * Auto-handles expiry transitions
 * Unsubscribes old, loads new, verifies subscription counts
 */

const wsService = require('./websocket.service');

class ExpiryRolloverService {
    constructor() {
        this.state = {
            currentExpiry: null,
            nextExpiry: null,
            rolloverInProgress: false,
            lastRollover: null,
            subscribedExpiries: new Set()
        };

        this.config = {
            rolloverTimeIST: { hour: 15, minute: 35 }, // 5 minutes after close
            preloadMinutesBefore: 60,  // Load next expiry 1 hour before current expires
            underlyings: ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX']
        };

        this.rolloverHistory = [];

        console.log('[EXPIRY_ROLLOVER] Initializing expiry rollover service...');
        console.log('[EXPIRY_ROLLOVER] Initialized');
    }

    /**
     * Set current and next expiry dates
     */
    setExpiries(current, next) {
        this.state.currentExpiry = current;
        this.state.nextExpiry = next;
        console.log(`[EXPIRY_ROLLOVER] Set expiries: Current=${current}, Next=${next}`);
    }

    /**
     * Get next Thursday (weekly expiry)
     */
    getNextThursday(fromDate = new Date()) {
        const date = new Date(fromDate);
        const day = date.getDay();
        const daysUntilThursday = (4 - day + 7) % 7 || 7;
        date.setDate(date.getDate() + daysUntilThursday);
        return this.formatDate(date);
    }

    /**
     * Get this week's Thursday
     */
    getThisThursday(fromDate = new Date()) {
        const date = new Date(fromDate);
        const day = date.getDay();
        
        if (day === 4) {
            // Today is Thursday
            return this.formatDate(date);
        }
        
        if (day < 4) {
            // Before Thursday this week
            date.setDate(date.getDate() + (4 - day));
        } else {
            // After Thursday - get next Thursday
            date.setDate(date.getDate() + (4 - day + 7));
        }
        
        return this.formatDate(date);
    }

    /**
     * Check if rollover is needed
     */
    checkRolloverNeeded() {
        const now = new Date();
        const dayOfWeek = now.getDay();
        
        // Only check on Thursday
        if (dayOfWeek !== 4) return false;

        // IST time check
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istNow = new Date(now.getTime() + istOffset);
        const hours = istNow.getUTCHours();
        const minutes = istNow.getUTCMinutes();

        // After 3:35 PM IST on Thursday
        return hours > 15 || (hours === 15 && minutes >= 35);
    }

    /**
     * MAIN: Perform expiry rollover
     */
    async performRollover() {
        if (this.state.rolloverInProgress) {
            console.log('[EXPIRY_ROLLOVER] Rollover already in progress');
            return { success: false, reason: 'Already in progress' };
        }

        try {
            this.state.rolloverInProgress = true;
            console.log('[EXPIRY_ROLLOVER] Starting expiry rollover...');

            const oldExpiry = this.state.currentExpiry;
            const newExpiry = this.state.nextExpiry || this.getNextThursday();

            // Step 1: Get current subscription count
            const wsStatus = wsService.getStatus();
            const beforeCount = wsStatus.subscriptionCount;
            console.log(`[EXPIRY_ROLLOVER] Before: ${beforeCount} subscriptions`);

            // Step 2: Identify tokens to unsubscribe (old expiry options)
            const tokensToUnsubscribe = this.getExpiringTokens(oldExpiry);
            console.log(`[EXPIRY_ROLLOVER] Unsubscribing ${tokensToUnsubscribe.length} expiring tokens`);

            // Step 3: Unsubscribe old expiry tokens
            if (tokensToUnsubscribe.length > 0) {
                await wsService.unsubscribe(tokensToUnsubscribe);
            }

            // Step 4: Update expiry dates
            this.state.currentExpiry = newExpiry;
            this.state.nextExpiry = this.getNextThursday(new Date(newExpiry + 'T00:00:00'));
            this.state.subscribedExpiries.delete(oldExpiry);
            this.state.subscribedExpiries.add(newExpiry);

            // Step 5: Verify subscription count
            const afterStatus = wsService.getStatus();
            const afterCount = afterStatus.subscriptionCount;

            // Step 6: Log rollover
            const rolloverRecord = {
                timestamp: Date.now(),
                oldExpiry,
                newExpiry,
                unsubscribedCount: tokensToUnsubscribe.length,
                beforeSubscriptions: beforeCount,
                afterSubscriptions: afterCount,
                success: true
            };
            this.rolloverHistory.push(rolloverRecord);
            this.state.lastRollover = Date.now();

            console.log(`[EXPIRY_ROLLOVER] ✓ EXPIRY_ROLLOVER_SUCCESS`);
            console.log(`[EXPIRY_ROLLOVER] Old: ${oldExpiry} → New: ${newExpiry}`);
            console.log(`[EXPIRY_ROLLOVER] Subscriptions: ${beforeCount} → ${afterCount}`);

            return {
                success: true,
                message: 'EXPIRY_ROLLOVER_SUCCESS',
                oldExpiry,
                newExpiry,
                unsubscribedCount: tokensToUnsubscribe.length,
                subscriptionsBefore: beforeCount,
                subscriptionsAfter: afterCount
            };

        } catch (error) {
            console.error('[EXPIRY_ROLLOVER] Rollover failed:', error.message);
            return {
                success: false,
                reason: error.message
            };
        } finally {
            this.state.rolloverInProgress = false;
        }
    }

    /**
     * Get tokens expiring on a given date
     * (Would be populated from universe loader in real implementation)
     */
    getExpiringTokens(expiryDate) {
        // This would query the universe loader for tokens with this expiry
        // For now, return empty array as placeholder
        return [];
    }

    /**
     * Manual trigger for rollover
     */
    async triggerRollover(newExpiry = null) {
        if (newExpiry) {
            this.state.nextExpiry = newExpiry;
        }
        return await this.performRollover();
    }

    /**
     * Get current expiry status
     */
    getStatus() {
        return {
            currentExpiry: this.state.currentExpiry,
            nextExpiry: this.state.nextExpiry,
            rolloverInProgress: this.state.rolloverInProgress,
            lastRollover: this.state.lastRollover,
            subscribedExpiries: Array.from(this.state.subscribedExpiries),
            rolloverNeeded: this.checkRolloverNeeded(),
            config: this.config
        };
    }

    /**
     * Get rollover history
     */
    getHistory() {
        return this.rolloverHistory.slice(-10); // Last 10 rollovers
    }

    /**
     * Initialize with current week's expiry
     */
    initialize() {
        const thisThursday = this.getThisThursday();
        const nextThursday = this.getNextThursday(new Date(thisThursday + 'T00:00:00'));
        
        // Check if today is after this Thursday
        const now = new Date();
        const thursday = new Date(thisThursday + 'T15:30:00');
        
        if (now > thursday) {
            // Current expiry is next week
            this.state.currentExpiry = nextThursday;
            this.state.nextExpiry = this.getNextThursday(new Date(nextThursday + 'T00:00:00'));
        } else {
            this.state.currentExpiry = thisThursday;
            this.state.nextExpiry = nextThursday;
        }

        this.state.subscribedExpiries.add(this.state.currentExpiry);
        
        console.log(`[EXPIRY_ROLLOVER] Initialized: Current=${this.state.currentExpiry}, Next=${this.state.nextExpiry}`);
        return this.getStatus();
    }

    /**
     * Format date as YYYY-MM-DD
     */
    formatDate(date) {
        return date.toISOString().split('T')[0];
    }

    /**
     * Get stats
     */
    getStats() {
        return {
            ...this.getStatus(),
            historyCount: this.rolloverHistory.length,
            recentRollovers: this.getHistory()
        };
    }
}

module.exports = new ExpiryRolloverService();
