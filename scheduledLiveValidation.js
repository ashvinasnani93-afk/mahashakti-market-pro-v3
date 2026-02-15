/**
 * MAHASHAKTI V7 - SCHEDULED LIVE MORNING VALIDATION
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTO-STARTS AT 09:16 IST
 * 
 * REQUIREMENTS:
 * - Real AngelOne WebSocket ONLY
 * - 300+ equity stocks minimum
 * - Index options ATM ±10 strikes
 * - Real timestamped logs
 * - NO synthetic data
 * - NO mock candles
 * - NO manual overrides
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

// Core Services
const calendarService = require('./services/calendar.service');
const universeLoaderService = require('./services/universeLoader.service');
const websocketService = require('./services/websocket.service');
const masterSignalGuardService = require('./services/masterSignalGuard.service');
const runnerProbabilityStockService = require('./services/runnerProbabilityStock.service');
const runnerProbabilityOptionService = require('./services/runnerProbabilityOption.service');

class ScheduledLiveValidation {
    constructor() {
        this.config = {
            scheduledStartTime: { hour: 9, minute: 16 },
            validationDuration: 10,  // minutes
            minStocksRequired: 300,
            atmRange: 10,
            logPath: '/app/logs/live_morning_validation.txt',
            indices: ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX']
        };

        this.state = {
            isRunning: false,
            startTime: null,
            endTime: null,
            
            // Scan counts
            stocksScanned: 0,
            optionsScanned: 0,
            websocketSubscriptions: 0,
            
            // Real data
            ltpUpdates: [],
            eliteTagged: [],
            screen1Signals: [],
            screen2Elite: [],
            blockReasons: {},
            
            // Validation status
            validationPassed: false,
            failReasons: []
        };

        this.logBuffer = [];
        this.rawLogStartTime = null;

        console.log('[LIVE_VAL] Scheduled Live Validation Engine initialized');
    }

    /**
     * Get current IST time
     */
    getISTTime() {
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        return new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + istOffset);
    }

    /**
     * Format timestamp for logging
     */
    timestamp() {
        const ist = this.getISTTime();
        return ist.toISOString().replace('T', ' ').substring(0, 23) + ' IST';
    }

    /**
     * Log with timestamp
     */
    log(message, level = 'INFO') {
        const ts = this.timestamp();
        const logLine = `[${ts}] [${level}] ${message}`;
        console.log(logLine);
        this.logBuffer.push(logLine);
        return logLine;
    }

    /**
     * Check if current time is validation time
     */
    isValidationTime() {
        const ist = this.getISTTime();
        const hour = ist.getHours();
        const minute = ist.getMinutes();

        // Check if within 09:16 - 09:30 window
        if (hour === 9 && minute >= 16 && minute <= 30) {
            return true;
        }
        return false;
    }

    /**
     * Check if trading day
     */
    isTradingDay() {
        const ist = this.getISTTime();
        const day = ist.getDay();
        
        // Weekend check
        if (day === 0 || day === 6) {
            this.log('Weekend - Market closed', 'WARN');
            return false;
        }

        // Holiday check
        if (calendarService.isHoliday(ist)) {
            this.log('Holiday - Market closed', 'WARN');
            return false;
        }

        return true;
    }

    /**
     * MAIN: Schedule and run validation
     */
    async scheduleValidation() {
        this.log('═══════════════════════════════════════════════════════════════');
        this.log('       MAHASHAKTI V7 - SCHEDULED LIVE VALIDATION               ');
        this.log('═══════════════════════════════════════════════════════════════');
        this.log(`Scheduled start: 09:16 IST`);
        this.log(`Validation duration: ${this.config.validationDuration} minutes`);
        this.log(`Min stocks required: ${this.config.minStocksRequired}`);
        this.log(`ATM range: ±${this.config.atmRange} strikes`);
        this.log('');

        // Check trading day
        if (!this.isTradingDay()) {
            this.log('Not a trading day - validation cannot proceed', 'ERROR');
            this.state.failReasons.push('NOT_TRADING_DAY');
            this.saveLog();
            return;
        }

        // Wait for validation time
        await this.waitForValidationTime();

        // Run validation
        await this.runLiveValidation();
    }

    /**
     * Wait for 09:16 IST
     */
    async waitForValidationTime() {
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                const ist = this.getISTTime();
                const hour = ist.getHours();
                const minute = ist.getMinutes();
                const second = ist.getSeconds();

                // Log waiting status every minute
                if (second === 0) {
                    this.log(`Waiting... Current: ${hour}:${minute}:${second} IST | Target: 09:16:00 IST`);
                }

                // Check if reached target time
                if (hour === 9 && minute >= 16) {
                    clearInterval(checkInterval);
                    this.log('Target time reached - Starting validation');
                    resolve();
                }

                // Also start if past 09:30 (missed window)
                if (hour >= 10 || (hour === 9 && minute > 30)) {
                    clearInterval(checkInterval);
                    this.log('Validation window passed', 'WARN');
                    resolve();
                }
            }, 1000);
        });
    }

    /**
     * Run live validation with real AngelOne data
     */
    async runLiveValidation() {
        this.state.isRunning = true;
        this.state.startTime = this.timestamp();
        this.rawLogStartTime = this.getISTTime();

        this.log('');
        this.log('🚀 LIVE VALIDATION STARTED');
        this.log('─'.repeat(60));

        try {
            // Step 1: Load Universe
            this.log('');
            this.log('📦 STEP 1: Loading Universe from AngelOne Master JSON');
            await this.loadUniverse();

            // Step 2: Connect WebSocket
            this.log('');
            this.log('🔌 STEP 2: Connecting to AngelOne WebSocket');
            await this.connectWebSocket();

            // Step 3: Subscribe to instruments
            this.log('');
            this.log('📡 STEP 3: Subscribing to instruments');
            await this.subscribeInstruments();

            // Step 4: Collect real-time data
            this.log('');
            this.log('📊 STEP 4: Collecting real-time price data (5 minutes)');
            await this.collectRealTimeData();

            // Step 5: Run validation checks
            this.log('');
            this.log('✅ STEP 5: Running validation checks');
            this.runValidationChecks();

        } catch (error) {
            this.log(`Validation error: ${error.message}`, 'ERROR');
            this.state.failReasons.push(`ERROR: ${error.message}`);
        }

        this.state.endTime = this.timestamp();
        this.state.isRunning = false;

        // Generate final report
        this.generateFinalReport();
        this.saveLog();
    }

    /**
     * Load universe from AngelOne
     */
    async loadUniverse() {
        const startTime = Date.now();

        try {
            await universeLoaderService.initialize();

            // Get stock counts
            const nseEquity = universeLoaderService.nseEquity?.size || 0;
            const fnoStocks = universeLoaderService.fnoStocks?.size || 0;

            this.state.stocksScanned = nseEquity;

            this.log(`NSE Equity loaded: ${nseEquity}`);
            this.log(`FNO Stocks loaded: ${fnoStocks}`);

            // Get index options
            const niftyOpts = universeLoaderService.niftyOptions?.size || 0;
            const bnOpts = universeLoaderService.bankniftyOptions?.size || 0;
            const fnOpts = universeLoaderService.finniftyOptions?.size || 0;
            const midcpOpts = universeLoaderService.midcpniftyOptions?.size || 0;
            const sensexOpts = universeLoaderService.sensexOptions?.size || 0;

            this.state.optionsScanned = niftyOpts + bnOpts + fnOpts + midcpOpts + sensexOpts;

            this.log(`NIFTY Options: ${niftyOpts}`);
            this.log(`BANKNIFTY Options: ${bnOpts}`);
            this.log(`FINNIFTY Options: ${fnOpts}`);
            this.log(`MIDCPNIFTY Options: ${midcpOpts}`);
            this.log(`SENSEX Options: ${sensexOpts}`);
            this.log(`Total Options: ${this.state.optionsScanned}`);

            const duration = Date.now() - startTime;
            this.log(`Universe loaded in ${duration}ms`);

            // Log raw scanned symbols (first 50)
            this.log('');
            this.log('RAW SCANNED STOCKS (First 50):');
            let count = 0;
            for (const [token, stock] of universeLoaderService.nseEquity || new Map()) {
                if (count >= 50) break;
                this.log(`  ${stock.symbol || token} | Token: ${token}`);
                count++;
            }
            this.log(`  ... and ${Math.max(0, nseEquity - 50)} more`);

        } catch (error) {
            this.log(`Universe load failed: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    /**
     * Connect to AngelOne WebSocket
     */
    async connectWebSocket() {
        try {
            const connected = await websocketService.connect();
            
            if (connected || websocketService.isConnected) {
                this.log('WebSocket connected successfully');
                this.log(`Connection status: ${websocketService.isConnected ? 'ACTIVE' : 'INACTIVE'}`);
            } else {
                this.log('WebSocket connection failed', 'WARN');
                this.state.failReasons.push('WEBSOCKET_CONNECTION_FAILED');
            }

        } catch (error) {
            this.log(`WebSocket error: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    /**
     * Subscribe to instruments
     */
    async subscribeInstruments() {
        try {
            // Get subscription counts
            const coreSubs = websocketService.priorityBuckets?.CORE?.size || 0;
            const equitySubs = websocketService.priorityBuckets?.ACTIVE_EQUITY?.size || 0;
            const optionSubs = websocketService.priorityBuckets?.ACTIVE_OPTIONS?.size || 0;
            const totalSubs = websocketService.subscriptions?.size || 0;

            this.state.websocketSubscriptions = totalSubs;

            this.log(`CORE subscriptions: ${coreSubs}`);
            this.log(`EQUITY subscriptions: ${equitySubs}`);
            this.log(`OPTIONS subscriptions: ${optionSubs}`);
            this.log(`Total active subscriptions: ${totalSubs}`);

            // Subscribe to indices first
            this.log('');
            this.log('Subscribing to Index tokens...');
            const indexTokens = ['99926000', '99926009', '99926037', '99926074', '99919000'];
            for (const token of indexTokens) {
                try {
                    websocketService.subscribe(token, 'INDEX');
                    this.log(`  Subscribed: ${token}`);
                } catch (e) {
                    this.log(`  Failed: ${token} - ${e.message}`, 'WARN');
                }
            }

        } catch (error) {
            this.log(`Subscription error: ${error.message}`, 'ERROR');
        }
    }

    /**
     * Collect real-time data for 5 minutes
     */
    async collectRealTimeData() {
        const collectionDuration = 5 * 60 * 1000; // 5 minutes
        const startTime = Date.now();

        this.log(`Collecting data for ${collectionDuration / 60000} minutes...`);
        this.log('');
        this.log('REAL-TIME LTP UPDATES:');

        // Set up price callback
        const priceCallback = (token, data) => {
            const update = {
                timestamp: this.timestamp(),
                token,
                ltp: data.ltp || data.lastPrice,
                volume: data.volume,
                change: data.changePercent || data.change
            };
            this.state.ltpUpdates.push(update);

            // Log first 100 updates
            if (this.state.ltpUpdates.length <= 100) {
                this.log(`  [LTP] ${update.timestamp} | ${token} | ₹${update.ltp} | Vol: ${update.volume || 'N/A'}`);
            }
        };

        // Register callback
        if (websocketService.onPrice) {
            websocketService.onPrice(priceCallback);
        }

        // Wait for collection period
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const remaining = Math.max(0, collectionDuration - elapsed);

                if (remaining <= 0) {
                    clearInterval(checkInterval);
                    this.log('');
                    this.log(`Data collection complete. Total LTP updates: ${this.state.ltpUpdates.length}`);
                    resolve();
                }

                // Log progress every 30 seconds
                if (elapsed % 30000 < 1000) {
                    this.log(`Collection progress: ${Math.round(elapsed / 1000)}s / ${collectionDuration / 1000}s | Updates: ${this.state.ltpUpdates.length}`);
                }
            }, 1000);
        });
    }

    /**
     * Run validation checks
     */
    runValidationChecks() {
        this.log('');
        this.log('VALIDATION CHECKS:');
        this.log('─'.repeat(40));

        let allPassed = true;

        // Check 1: Stock count
        const stockCheck = this.state.stocksScanned >= this.config.minStocksRequired;
        this.log(`[CHECK 1] Stocks scanned: ${this.state.stocksScanned} (min: ${this.config.minStocksRequired}) ${stockCheck ? '✓' : '✗'}`);
        if (!stockCheck) {
            allPassed = false;
            this.state.failReasons.push(`STOCKS_INSUFFICIENT: ${this.state.stocksScanned} < ${this.config.minStocksRequired}`);
        }

        // Check 2: WebSocket subscriptions
        const wsCheck = this.state.websocketSubscriptions > 0;
        this.log(`[CHECK 2] WebSocket subscriptions: ${this.state.websocketSubscriptions} ${wsCheck ? '✓' : '✗'}`);
        if (!wsCheck) {
            allPassed = false;
            this.state.failReasons.push('NO_WEBSOCKET_SUBSCRIPTIONS');
        }

        // Check 3: LTP updates received
        const ltpCheck = this.state.ltpUpdates.length > 0;
        this.log(`[CHECK 3] LTP updates received: ${this.state.ltpUpdates.length} ${ltpCheck ? '✓' : '✗'}`);
        if (!ltpCheck) {
            allPassed = false;
            this.state.failReasons.push('NO_LTP_UPDATES');
        }

        // Check 4: Options scanned
        const optCheck = this.state.optionsScanned > 0;
        this.log(`[CHECK 4] Options scanned: ${this.state.optionsScanned} ${optCheck ? '✓' : '✗'}`);
        if (!optCheck) {
            allPassed = false;
            this.state.failReasons.push('NO_OPTIONS_SCANNED');
        }

        // Check 5: Real timestamps present
        const tsCheck = this.state.ltpUpdates.length > 0 && this.state.ltpUpdates[0].timestamp;
        this.log(`[CHECK 5] Real timestamps: ${tsCheck ? '✓' : '✗'}`);
        if (!tsCheck) {
            allPassed = false;
            this.state.failReasons.push('NO_TIMESTAMPS');
        }

        this.state.validationPassed = allPassed;
        this.log('');
        this.log(`OVERALL VALIDATION: ${allPassed ? 'PASSED ✓' : 'FAILED ✗'}`);
    }

    /**
     * Generate final report
     */
    generateFinalReport() {
        this.log('');
        this.log('═══════════════════════════════════════════════════════════════');
        this.log('                    FINAL VALIDATION REPORT                      ');
        this.log('═══════════════════════════════════════════════════════════════');
        this.log('');
        this.log('📊 SUMMARY:');
        this.log(`  Start Time: ${this.state.startTime}`);
        this.log(`  End Time: ${this.state.endTime}`);
        this.log(`  Stocks Scanned: ${this.state.stocksScanned}`);
        this.log(`  Options Scanned: ${this.state.optionsScanned}`);
        this.log(`  WebSocket Subscriptions: ${this.state.websocketSubscriptions}`);
        this.log(`  LTP Updates Received: ${this.state.ltpUpdates.length}`);
        this.log('');
        
        // Raw log snippet (09:16-09:25)
        this.log('📋 RAW LOG SNIPPET (09:16-09:25 IST):');
        this.log('─'.repeat(60));
        const snippetLogs = this.logBuffer.filter(line => {
            const match = line.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
            if (match) {
                const timeStr = match[1];
                const hour = parseInt(timeStr.split(' ')[1].split(':')[0]);
                const minute = parseInt(timeStr.split(' ')[1].split(':')[1]);
                return hour === 9 && minute >= 16 && minute <= 25;
            }
            return false;
        });
        snippetLogs.slice(0, 50).forEach(line => this.log(line));
        this.log('');

        // Final status
        this.log('═══════════════════════════════════════════════════════════════');
        this.log('');
        this.log('MAHASHAKTI_V7_LIVE_VALIDATION_COMPLETE');
        this.log(`STOCKS_SCANNED: ${this.state.stocksScanned}`);
        this.log(`OPTIONS_SCANNED: ${this.state.optionsScanned}`);
        this.log(`WEBSOCKET_ACTIVE: ${this.state.websocketSubscriptions > 0 ? 'YES' : 'NO'}`);
        this.log(`LTP_UPDATES: ${this.state.ltpUpdates.length}`);
        this.log(`VALIDATION_STATUS: ${this.state.validationPassed ? 'PASSED' : 'FAILED'}`);
        
        if (this.state.failReasons.length > 0) {
            this.log('');
            this.log('FAIL REASONS:');
            this.state.failReasons.forEach(reason => this.log(`  - ${reason}`));
        }

        this.log('');
        this.log('═══════════════════════════════════════════════════════════════');
    }

    /**
     * Save log to file
     */
    saveLog() {
        try {
            const logsDir = path.dirname(this.config.logPath);
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }

            const logContent = this.logBuffer.join('\n');
            fs.writeFileSync(this.config.logPath, logContent);
            console.log(`[LIVE_VAL] Log saved to: ${this.config.logPath}`);
        } catch (error) {
            console.error(`[LIVE_VAL] Failed to save log: ${error.message}`);
        }
    }
}

// Main execution
const validator = new ScheduledLiveValidation();

// Start immediately if within market hours, otherwise schedule
const ist = validator.getISTTime();
const hour = ist.getHours();
const minute = ist.getMinutes();

console.log(`[LIVE_VAL] Current IST: ${hour}:${minute}`);

if (hour < 9 || (hour === 9 && minute < 16)) {
    console.log('[LIVE_VAL] Before market - scheduling for 09:16 IST');
    validator.scheduleValidation();
} else if (hour === 9 && minute <= 30) {
    console.log('[LIVE_VAL] Within validation window - starting immediately');
    validator.runLiveValidation();
} else if (hour >= 9 && hour < 16) {
    console.log('[LIVE_VAL] Market open - starting validation now');
    validator.runLiveValidation();
} else {
    console.log('[LIVE_VAL] After market hours - cannot run live validation');
    console.log('[LIVE_VAL] Schedule this script to run at 09:16 IST on a trading day');
}

module.exports = ScheduledLiveValidation;
