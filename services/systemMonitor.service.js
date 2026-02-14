const os = require('os');
const v8 = require('v8');

class SystemMonitorService {
    constructor() {
        this.cpuHistory = [];
        this.memoryHistory = [];
        this.eventLoopLag = 0;
        this.lastCpuInfo = os.cpus();
        this.lastCpuTime = Date.now();
        
        this.status = 'NORMAL';
        this.protectionLevel = 0;
        
        this.config = {
            sampleIntervalMs: 5000,
            historySize: 60,
            cpuWarningThreshold: 75,
            cpuCriticalThreshold: 90,
            memoryWarningMB: 120,
            memoryCriticalMB: 150,
            eventLoopLagWarning: 100,
            eventLoopLagCritical: 500
        };
        
        this.callbacks = {
            onWarning: null,
            onCritical: null,
            onNormal: null
        };
        
        this.monitorInterval = null;
        this.logInterval = null;
    }

    initialize() {
        console.log('[SYSTEM_MONITOR] Initializing CPU/Memory monitor...');
        this.startMonitoring();
        this.startLogging();
        console.log('[SYSTEM_MONITOR] Initialized');
    }

    startMonitoring() {
        if (this.monitorInterval) return;

        this.monitorInterval = setInterval(() => {
            this.sample();
            this.evaluateStatus();
        }, this.config.sampleIntervalMs);

        // Initial sample
        this.sample();
    }

    startLogging() {
        if (this.logInterval) return;

        this.logInterval = setInterval(() => {
            this.logStatus();
        }, 60000); // Log every 60 seconds
    }

    sample() {
        // CPU Usage
        const cpuUsage = this.calculateCpuUsage();
        this.cpuHistory.push({ value: cpuUsage, timestamp: Date.now() });
        if (this.cpuHistory.length > this.config.historySize) {
            this.cpuHistory.shift();
        }

        // Memory Usage
        const memUsage = process.memoryUsage();
        const memoryMB = memUsage.rss / 1024 / 1024;
        this.memoryHistory.push({ value: memoryMB, timestamp: Date.now() });
        if (this.memoryHistory.length > this.config.historySize) {
            this.memoryHistory.shift();
        }

        // Event Loop Lag
        this.measureEventLoopLag();
    }

    calculateCpuUsage() {
        const cpus = os.cpus();
        const now = Date.now();
        
        let totalIdle = 0;
        let totalTick = 0;

        for (let i = 0; i < cpus.length; i++) {
            const cpu = cpus[i];
            const prevCpu = this.lastCpuInfo[i];

            const idle = cpu.times.idle - (prevCpu?.times?.idle || 0);
            const total = Object.values(cpu.times).reduce((a, b) => a + b, 0) -
                         Object.values(prevCpu?.times || {}).reduce((a, b) => a + b, 0);

            totalIdle += idle;
            totalTick += total;
        }

        this.lastCpuInfo = cpus;
        this.lastCpuTime = now;

        if (totalTick === 0) return 0;
        return Math.round((1 - totalIdle / totalTick) * 100);
    }

    measureEventLoopLag() {
        const start = process.hrtime.bigint();
        
        setImmediate(() => {
            const end = process.hrtime.bigint();
            this.eventLoopLag = Number(end - start) / 1000000; // Convert to ms
        });
    }

    evaluateStatus() {
        const cpu = this.getCurrentCpu();
        const memory = this.getCurrentMemory();
        const lag = this.eventLoopLag;

        let newStatus = 'NORMAL';
        let newProtectionLevel = 0;

        // Check CPU
        if (cpu >= this.config.cpuCriticalThreshold) {
            newStatus = 'CRITICAL';
            newProtectionLevel = 2;
        } else if (cpu >= this.config.cpuWarningThreshold) {
            newStatus = 'WARNING';
            newProtectionLevel = Math.max(newProtectionLevel, 1);
        }

        // Check Memory
        if (memory >= this.config.memoryCriticalMB) {
            newStatus = 'CRITICAL';
            newProtectionLevel = 2;
        } else if (memory >= this.config.memoryWarningMB) {
            if (newStatus !== 'CRITICAL') newStatus = 'WARNING';
            newProtectionLevel = Math.max(newProtectionLevel, 1);
        }

        // Check Event Loop Lag
        if (lag >= this.config.eventLoopLagCritical) {
            newStatus = 'CRITICAL';
            newProtectionLevel = 2;
        } else if (lag >= this.config.eventLoopLagWarning) {
            if (newStatus !== 'CRITICAL') newStatus = 'WARNING';
            newProtectionLevel = Math.max(newProtectionLevel, 1);
        }

        // Trigger callbacks on status change
        if (newStatus !== this.status) {
            this.onStatusChange(this.status, newStatus);
        }

        this.status = newStatus;
        this.protectionLevel = newProtectionLevel;
    }

    onStatusChange(oldStatus, newStatus) {
        console.log(`[SYSTEM_MONITOR] Status changed: ${oldStatus} → ${newStatus}`);

        if (newStatus === 'CRITICAL' && this.callbacks.onCritical) {
            this.callbacks.onCritical(this.getHealth());
        } else if (newStatus === 'WARNING' && this.callbacks.onWarning) {
            this.callbacks.onWarning(this.getHealth());
        } else if (newStatus === 'NORMAL' && this.callbacks.onNormal) {
            this.callbacks.onNormal(this.getHealth());
        }
    }

    logStatus() {
        const cpu = this.getCurrentCpu();
        const memory = this.getCurrentMemory();
        const heap = this.getHeapStats();
        
        console.log(`[SYSTEM_MONITOR] CPU: ${cpu}% | Memory: ${memory.toFixed(1)}MB | Heap: ${heap.used.toFixed(1)}/${heap.total.toFixed(1)}MB | Status: ${this.status}`);
    }

    // Getters
    getCurrentCpu() {
        if (this.cpuHistory.length === 0) return 0;
        return this.cpuHistory[this.cpuHistory.length - 1].value;
    }

    getAverageCpu(minutes = 5) {
        const cutoff = Date.now() - (minutes * 60 * 1000);
        const recent = this.cpuHistory.filter(h => h.timestamp >= cutoff);
        if (recent.length === 0) return 0;
        return recent.reduce((sum, h) => sum + h.value, 0) / recent.length;
    }

    getCurrentMemory() {
        if (this.memoryHistory.length === 0) return 0;
        return this.memoryHistory[this.memoryHistory.length - 1].value;
    }

    getHeapStats() {
        const mem = process.memoryUsage();
        return {
            used: mem.heapUsed / 1024 / 1024,
            total: mem.heapTotal / 1024 / 1024,
            external: mem.external / 1024 / 1024
        };
    }

    getHealth() {
        const cpu = this.getCurrentCpu();
        const memory = this.getCurrentMemory();
        const heap = this.getHeapStats();

        return {
            status: this.status,
            protectionLevel: this.protectionLevel,
            cpu: {
                current: cpu,
                average5m: Math.round(this.getAverageCpu(5)),
                threshold: {
                    warning: this.config.cpuWarningThreshold,
                    critical: this.config.cpuCriticalThreshold
                }
            },
            memory: {
                rssMB: Math.round(memory * 100) / 100,
                heapUsedMB: Math.round(heap.used * 100) / 100,
                heapTotalMB: Math.round(heap.total * 100) / 100,
                threshold: {
                    warning: this.config.memoryWarningMB,
                    critical: this.config.memoryCriticalMB
                }
            },
            eventLoop: {
                lagMs: Math.round(this.eventLoopLag * 100) / 100,
                threshold: {
                    warning: this.config.eventLoopLagWarning,
                    critical: this.config.eventLoopLagCritical
                }
            },
            recommendations: this.getRecommendations(),
            timestamp: new Date().toISOString()
        };
    }

    getRecommendations() {
        const recommendations = [];
        
        if (this.protectionLevel >= 2) {
            recommendations.push('REDUCE_SCAN_FREQUENCY');
            recommendations.push('PAUSE_DEEP_OTM_SCANNING');
            recommendations.push('CORE_INDEX_ONLY_MODE');
        } else if (this.protectionLevel >= 1) {
            recommendations.push('REDUCE_SCAN_FREQUENCY');
            recommendations.push('PAUSE_DEEP_OTM_SCANNING');
        }

        return recommendations;
    }

    // Protection level methods
    shouldReduceScanFrequency() {
        return this.protectionLevel >= 1;
    }

    shouldPauseDeepOTM() {
        return this.protectionLevel >= 1;
    }

    shouldUseCoreIndexOnly() {
        return this.protectionLevel >= 2;
    }

    // Callbacks registration
    onWarning(callback) {
        this.callbacks.onWarning = callback;
    }

    onCritical(callback) {
        this.callbacks.onCritical = callback;
    }

    onNormal(callback) {
        this.callbacks.onNormal = callback;
    }

    stop() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
        if (this.logInterval) {
            clearInterval(this.logInterval);
            this.logInterval = null;
        }
    }
}

module.exports = new SystemMonitorService();
