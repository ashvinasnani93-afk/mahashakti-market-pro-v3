/**
 * LATENCY MONITOR SERVICE
 * Tracks API response time, WebSocket lag, candle delays
 * Freezes signals if latency threshold breached
 */

class LatencyMonitorService {
    constructor() {
        this.state = {
            apiLatency: [],
            wsLatency: [],
            candleDelay: [],
            alertActive: false,
            alertReason: null,
            lastCheck: null
        };

        this.config = {
            apiLatencyThresholdMs: 5000,   // 5 second API threshold
            wsLatencyThresholdMs: 1000,    // 1 second WS threshold
            candleDelayThresholdMs: 30000, // 30 second candle delay threshold
            maxSamples: 60,                // Keep last 60 samples
            alertTriggerCount: 3           // 3 consecutive breaches = alert
        };

        this.breachCounts = {
            api: 0,
            ws: 0,
            candle: 0
        };

        console.log('[LATENCY_MONITOR] Initializing latency monitor...');
        console.log('[LATENCY_MONITOR] Initialized');
    }

    /**
     * Record API latency
     */
    recordApiLatency(endpoint, latencyMs, success = true) {
        this.state.apiLatency.push({
            timestamp: Date.now(),
            endpoint,
            latencyMs,
            success
        });

        if (this.state.apiLatency.length > this.config.maxSamples) {
            this.state.apiLatency.shift();
        }

        // Check threshold
        if (latencyMs > this.config.apiLatencyThresholdMs) {
            this.breachCounts.api++;
            console.log(`[LATENCY_MONITOR] ⚠️ API latency ${latencyMs}ms > ${this.config.apiLatencyThresholdMs}ms threshold`);
        } else {
            this.breachCounts.api = Math.max(0, this.breachCounts.api - 1);
        }

        this.checkAlertStatus();
    }

    /**
     * Record WebSocket latency
     */
    recordWsLatency(latencyMs) {
        this.state.wsLatency.push({
            timestamp: Date.now(),
            latencyMs
        });

        if (this.state.wsLatency.length > this.config.maxSamples) {
            this.state.wsLatency.shift();
        }

        // Check threshold
        if (latencyMs > this.config.wsLatencyThresholdMs) {
            this.breachCounts.ws++;
            console.log(`[LATENCY_MONITOR] ⚠️ WS latency ${latencyMs}ms > ${this.config.wsLatencyThresholdMs}ms threshold`);
        } else {
            this.breachCounts.ws = Math.max(0, this.breachCounts.ws - 1);
        }

        this.checkAlertStatus();
    }

    /**
     * Record candle delay
     */
    recordCandleDelay(token, expectedTime, actualTime) {
        const delay = actualTime - expectedTime;
        
        this.state.candleDelay.push({
            timestamp: Date.now(),
            token,
            delay,
            expectedTime,
            actualTime
        });

        if (this.state.candleDelay.length > this.config.maxSamples) {
            this.state.candleDelay.shift();
        }

        // Check threshold
        if (delay > this.config.candleDelayThresholdMs) {
            this.breachCounts.candle++;
            console.log(`[LATENCY_MONITOR] ⚠️ Candle delay ${delay}ms > ${this.config.candleDelayThresholdMs}ms threshold`);
        } else {
            this.breachCounts.candle = Math.max(0, this.breachCounts.candle - 1);
        }

        this.checkAlertStatus();
    }

    /**
     * Check if alert should be triggered/released
     */
    checkAlertStatus() {
        const alertReasons = [];

        if (this.breachCounts.api >= this.config.alertTriggerCount) {
            alertReasons.push(`API latency breach ${this.breachCounts.api}x`);
        }

        if (this.breachCounts.ws >= this.config.alertTriggerCount) {
            alertReasons.push(`WS latency breach ${this.breachCounts.ws}x`);
        }

        if (this.breachCounts.candle >= this.config.alertTriggerCount) {
            alertReasons.push(`Candle delay breach ${this.breachCounts.candle}x`);
        }

        if (alertReasons.length > 0 && !this.state.alertActive) {
            this.state.alertActive = true;
            this.state.alertReason = alertReasons.join('; ');
            console.log(`[LATENCY_MONITOR] 🚨 LATENCY_ALERT: ${this.state.alertReason}`);
        } else if (alertReasons.length === 0 && this.state.alertActive) {
            console.log('[LATENCY_MONITOR] ✓ Latency normalized - Alert cleared');
            this.state.alertActive = false;
            this.state.alertReason = null;
        }

        this.state.lastCheck = Date.now();
    }

    /**
     * MAIN: Check if signals should be allowed
     */
    shouldAllowSignals() {
        if (this.state.alertActive) {
            return {
                allowed: false,
                reason: `LATENCY_BLOCKED: ${this.state.alertReason}`,
                detail: {
                    apiBreaches: this.breachCounts.api,
                    wsBreaches: this.breachCounts.ws,
                    candleBreaches: this.breachCounts.candle
                }
            };
        }

        return {
            allowed: true,
            reason: 'Latency within thresholds'
        };
    }

    /**
     * Get average latencies
     */
    getAverages() {
        const apiAvg = this.state.apiLatency.length > 0
            ? this.state.apiLatency.reduce((sum, l) => sum + l.latencyMs, 0) / this.state.apiLatency.length
            : 0;

        const wsAvg = this.state.wsLatency.length > 0
            ? this.state.wsLatency.reduce((sum, l) => sum + l.latencyMs, 0) / this.state.wsLatency.length
            : 0;

        const candleAvg = this.state.candleDelay.length > 0
            ? this.state.candleDelay.reduce((sum, l) => sum + l.delay, 0) / this.state.candleDelay.length
            : 0;

        return {
            apiAvgMs: Math.round(apiAvg),
            wsAvgMs: Math.round(wsAvg),
            candleAvgMs: Math.round(candleAvg)
        };
    }

    /**
     * Get P95 latencies
     */
    getP95() {
        const getP95 = (arr, field) => {
            if (arr.length === 0) return 0;
            const sorted = arr.map(l => l[field]).sort((a, b) => a - b);
            const index = Math.floor(sorted.length * 0.95);
            return sorted[index] || sorted[sorted.length - 1];
        };

        return {
            apiP95Ms: Math.round(getP95(this.state.apiLatency, 'latencyMs')),
            wsP95Ms: Math.round(getP95(this.state.wsLatency, 'latencyMs')),
            candleP95Ms: Math.round(getP95(this.state.candleDelay, 'delay'))
        };
    }

    /**
     * Reset all metrics
     */
    reset() {
        this.state.apiLatency = [];
        this.state.wsLatency = [];
        this.state.candleDelay = [];
        this.state.alertActive = false;
        this.state.alertReason = null;
        this.breachCounts = { api: 0, ws: 0, candle: 0 };
        console.log('[LATENCY_MONITOR] Metrics reset');
    }

    /**
     * Get stats
     */
    getStats() {
        const averages = this.getAverages();
        const p95 = this.getP95();

        return {
            alertActive: this.state.alertActive,
            alertReason: this.state.alertReason,
            breachCounts: this.breachCounts,
            averages,
            p95,
            sampleCounts: {
                api: this.state.apiLatency.length,
                ws: this.state.wsLatency.length,
                candle: this.state.candleDelay.length
            },
            thresholds: {
                apiMs: this.config.apiLatencyThresholdMs,
                wsMs: this.config.wsLatencyThresholdMs,
                candleMs: this.config.candleDelayThresholdMs
            },
            lastCheck: this.state.lastCheck
        };
    }
}

module.exports = new LatencyMonitorService();
