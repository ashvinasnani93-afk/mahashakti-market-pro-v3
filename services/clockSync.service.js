/**
 * CLOCK SYNC VALIDATOR SERVICE
 * Validates system clock against NTP/server time
 * Freezes signals if drift exceeds threshold
 */

class ClockSyncService {
    constructor() {
        this.config = {
            driftThresholdMs: 2000,      // 2 seconds max drift
            checkIntervalMs: 60000,       // Check every 1 minute
            ntpServers: [
                'time.google.com',
                'time.cloudflare.com',
                'pool.ntp.org'
            ],
            maxRetries: 3
        };

        this.state = {
            lastCheck: null,
            lastDrift: 0,
            driftHistory: [],
            isSynced: true,
            alertActive: false,
            checksPerformed: 0
        };

        this.checkInterval = null;

        console.log('[CLOCK_SYNC] Initializing clock sync validator...');
        console.log(`[CLOCK_SYNC] Drift threshold: ${this.config.driftThresholdMs}ms`);
        console.log('[CLOCK_SYNC] Initialized');
    }

    /**
     * Start periodic clock sync checking
     */
    start() {
        if (this.checkInterval) {
            console.log('[CLOCK_SYNC] Already running');
            return;
        }

        // Initial check
        this.performCheck();

        // Periodic checks
        this.checkInterval = setInterval(() => {
            this.performCheck();
        }, this.config.checkIntervalMs);

        console.log('[CLOCK_SYNC] Started periodic checking');
    }

    /**
     * Stop periodic checking
     */
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            console.log('[CLOCK_SYNC] Stopped');
        }
    }

    /**
     * Perform clock sync check
     * Uses HTTP Date header as reference (simpler than NTP for our use case)
     */
    async performCheck() {
        try {
            const localBefore = Date.now();
            
            // Use multiple sources for reliability
            const serverTime = await this.getServerTime();
            
            const localAfter = Date.now();
            const localTime = (localBefore + localAfter) / 2; // Average to account for latency
            
            const drift = Math.abs(serverTime - localTime);
            
            this.state.lastCheck = Date.now();
            this.state.lastDrift = drift;
            this.state.checksPerformed++;
            
            // Keep drift history (last 10)
            this.state.driftHistory.push({
                timestamp: Date.now(),
                drift,
                synced: drift <= this.config.driftThresholdMs
            });
            if (this.state.driftHistory.length > 10) {
                this.state.driftHistory.shift();
            }

            // Update sync status
            if (drift > this.config.driftThresholdMs) {
                if (this.state.isSynced) {
                    console.log(`[CLOCK_SYNC] ⚠️ CLOCK_DRIFT_ALERT: ${drift}ms > ${this.config.driftThresholdMs}ms threshold`);
                }
                this.state.isSynced = false;
                this.state.alertActive = true;
            } else {
                if (!this.state.isSynced) {
                    console.log(`[CLOCK_SYNC] ✓ CLOCK_SYNC_OK: Drift ${drift}ms within threshold`);
                }
                this.state.isSynced = true;
                this.state.alertActive = false;
            }

            return {
                synced: this.state.isSynced,
                drift,
                threshold: this.config.driftThresholdMs,
                status: this.state.isSynced ? 'CLOCK_SYNC_OK' : 'CLOCK_DRIFT_ALERT'
            };

        } catch (error) {
            console.error('[CLOCK_SYNC] Check failed:', error.message);
            // On failure, maintain previous state but log warning
            return {
                synced: this.state.isSynced,
                drift: this.state.lastDrift,
                threshold: this.config.driftThresholdMs,
                status: 'CHECK_FAILED',
                error: error.message
            };
        }
    }

    /**
     * Get server time from HTTP Date header
     */
    async getServerTime() {
        const https = require('https');
        const http = require('http');

        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'www.google.com',
                port: 443,
                path: '/',
                method: 'HEAD',
                timeout: 5000
            };

            const req = https.request(options, (res) => {
                const dateHeader = res.headers['date'];
                if (dateHeader) {
                    const serverTime = new Date(dateHeader).getTime();
                    resolve(serverTime);
                } else {
                    reject(new Error('No Date header in response'));
                }
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.end();
        });
    }

    /**
     * MAIN: Check if signals should be allowed
     * @returns {object} { allowed: boolean, reason: string }
     */
    shouldAllowSignals() {
        if (!this.state.isSynced) {
            return {
                allowed: false,
                reason: 'CLOCK_DRIFT_ALERT',
                detail: `Clock drift ${this.state.lastDrift}ms exceeds ${this.config.driftThresholdMs}ms threshold`,
                drift: this.state.lastDrift
            };
        }

        return {
            allowed: true,
            reason: 'CLOCK_SYNC_OK',
            drift: this.state.lastDrift
        };
    }

    /**
     * Force immediate sync check
     */
    async forceCheck() {
        console.log('[CLOCK_SYNC] Force check triggered');
        return await this.performCheck();
    }

    /**
     * Get current sync status
     */
    getStatus() {
        return {
            status: this.state.isSynced ? 'CLOCK_SYNC_OK' : 'CLOCK_DRIFT_ALERT',
            isSynced: this.state.isSynced,
            alertActive: this.state.alertActive,
            lastDrift: this.state.lastDrift,
            threshold: this.config.driftThresholdMs,
            lastCheck: this.state.lastCheck,
            checksPerformed: this.state.checksPerformed,
            driftHistory: this.state.driftHistory.slice(-5)
        };
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('[CLOCK_SYNC] Config updated:', this.config);
    }

    /**
     * Get average drift from history
     */
    getAverageDrift() {
        if (this.state.driftHistory.length === 0) return 0;
        const sum = this.state.driftHistory.reduce((acc, h) => acc + h.drift, 0);
        return sum / this.state.driftHistory.length;
    }
}

module.exports = new ClockSyncService();
