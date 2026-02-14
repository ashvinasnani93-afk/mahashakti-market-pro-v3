/**
 * THETA ENGINE SERVICE
 * Implements theta decay tracking and TrueMomentum calculation
 * Blocks signals on expiry-day theta crush and deep OTM
 */

class ThetaEngineService {
    constructor() {
        this.state = {
            thetaData: new Map(),        // token -> theta tracking
            expiryThetaCrushActive: false,
            lastUpdate: null
        };

        this.config = {
            updateIntervalMs: 30000,     // Update every 30 seconds
            thetaCrushHours: 3,          // Last 3 hours on expiry = crush zone
            deepOTMThresholdPercent: 5,  // > 5% from ATM = deep OTM
            minTrueMomentum: 10,         // Minimum true momentum % for signal
            expectedDailyDecay: {
                atm: 2,                  // ATM loses ~2% daily to theta
                otm1: 3,                 // 1 strike OTM loses ~3%
                otm2: 5,                 // 2 strikes OTM loses ~5%
                deepOtm: 10              // Deep OTM loses ~10%
            }
        };

        this.premiumHistory = new Map(); // token -> [{ timestamp, premium }]
        this.updateInterval = null;

        console.log('[THETA_ENGINE] Initializing theta decay engine...');
        console.log('[THETA_ENGINE] Initialized');
    }

    /**
     * Start periodic theta tracking
     */
    start() {
        if (this.updateInterval) {
            console.log('[THETA_ENGINE] Already running');
            return;
        }

        this.checkExpiryThetaCrush();
        this.updateInterval = setInterval(() => {
            this.calculate();
            this.checkExpiryThetaCrush();
        }, this.config.updateIntervalMs);

        console.log('[THETA_ENGINE] Started - tracking every 30 seconds');
    }

    /**
     * Stop theta tracking
     */
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('[THETA_ENGINE] Stopped');
        }
    }

    /**
     * Check if expiry-day theta crush is active
     */
    checkExpiryThetaCrush() {
        const now = new Date();
        const dayOfWeek = now.getDay();
        
        // Thursday = weekly expiry
        if (dayOfWeek !== 4) {
            this.state.expiryThetaCrushActive = false;
            return;
        }

        // IST time check
        const hours = now.getHours();
        const istHours = (hours + 5) % 24 + (now.getMinutes() + 30 >= 60 ? 1 : 0);
        
        // Crush zone: last 3 hours before market close (12:30 - 3:30 IST)
        if (istHours >= 12.5) {
            this.state.expiryThetaCrushActive = true;
            console.log('[THETA_ENGINE] ⚠️ EXPIRY DAY THETA CRUSH ACTIVE');
        } else {
            this.state.expiryThetaCrushActive = false;
        }
    }

    /**
     * Calculate theta metrics for tracked options
     */
    calculate() {
        // This would be called with actual premium data
        // For now, we track what's been registered
        this.state.lastUpdate = Date.now();
    }

    /**
     * Register premium update for theta tracking
     */
    registerPremium(token, symbol, premium, spotPrice, strikePrice, optionType) {
        const history = this.premiumHistory.get(token) || [];
        history.push({
            timestamp: Date.now(),
            premium,
            spotPrice,
            strikePrice
        });

        // Keep last 60 readings (30 minutes of 30-sec updates)
        if (history.length > 60) {
            history.shift();
        }
        this.premiumHistory.set(token, history);

        // Calculate metrics
        const moneyness = this.calculateMoneyness(spotPrice, strikePrice, optionType);
        const expectedDecay = this.getExpectedDecay(moneyness);
        const actualMove = this.calculateActualMove(history);
        const thetaImpact = this.estimateThetaImpact(history, expectedDecay);
        const trueMomentum = actualMove - thetaImpact;
        const thetaVelocity = this.calculateThetaVelocity(history);

        const thetaData = {
            token,
            symbol,
            premium,
            spotPrice,
            strikePrice,
            optionType,
            moneyness: Math.round(moneyness * 100) / 100,
            moneynessType: this.classifyMoneyness(moneyness),
            expectedDecay: Math.round(expectedDecay * 100) / 100,
            actualMove: Math.round(actualMove * 100) / 100,
            thetaImpact: Math.round(thetaImpact * 100) / 100,
            trueMomentum: Math.round(trueMomentum * 100) / 100,
            thetaVelocity: Math.round(thetaVelocity * 100) / 100,
            timestamp: Date.now()
        };

        this.state.thetaData.set(token, thetaData);
        return thetaData;
    }

    /**
     * Calculate moneyness (% from ATM)
     */
    calculateMoneyness(spotPrice, strikePrice, optionType) {
        const diff = optionType === 'CE' 
            ? (strikePrice - spotPrice) / spotPrice * 100
            : (spotPrice - strikePrice) / spotPrice * 100;
        return diff;
    }

    /**
     * Classify moneyness
     */
    classifyMoneyness(moneyness) {
        const absMoneyness = Math.abs(moneyness);
        if (absMoneyness < 0.5) return 'ATM';
        if (absMoneyness < 1.5) return 'OTM_1';
        if (absMoneyness < 3) return 'OTM_2';
        return 'DEEP_OTM';
    }

    /**
     * Get expected decay based on moneyness
     */
    getExpectedDecay(moneyness) {
        const type = this.classifyMoneyness(moneyness);
        switch (type) {
            case 'ATM': return this.config.expectedDailyDecay.atm;
            case 'OTM_1': return this.config.expectedDailyDecay.otm1;
            case 'OTM_2': return this.config.expectedDailyDecay.otm2;
            default: return this.config.expectedDailyDecay.deepOtm;
        }
    }

    /**
     * Calculate actual premium move from history
     */
    calculateActualMove(history) {
        if (history.length < 2) return 0;
        
        const oldest = history[0].premium;
        const newest = history[history.length - 1].premium;
        
        if (oldest === 0) return 0;
        return ((newest - oldest) / oldest) * 100;
    }

    /**
     * Estimate theta impact based on time elapsed
     */
    estimateThetaImpact(history, expectedDailyDecay) {
        if (history.length < 2) return 0;
        
        const timeElapsedMs = history[history.length - 1].timestamp - history[0].timestamp;
        const hoursElapsed = timeElapsedMs / (1000 * 60 * 60);
        const tradingHoursPerDay = 6.25; // 9:15 to 3:30
        
        // Proportional decay
        return (expectedDailyDecay * hoursElapsed) / tradingHoursPerDay;
    }

    /**
     * Calculate theta velocity (5-min decay rate)
     */
    calculateThetaVelocity(history) {
        if (history.length < 10) return 0;
        
        // Look at last 10 readings (~5 min of 30-sec data)
        const recent = history.slice(-10);
        const older = history.slice(-20, -10);
        
        if (older.length === 0) return 0;
        
        const recentAvg = recent.reduce((sum, h) => sum + h.premium, 0) / recent.length;
        const olderAvg = older.reduce((sum, h) => sum + h.premium, 0) / older.length;
        
        if (olderAvg === 0) return 0;
        return ((recentAvg - olderAvg) / olderAvg) * 100;
    }

    /**
     * MAIN: Check if signal should be allowed based on theta
     * @param {string} token - Option token
     * @returns {object} { allowed: boolean, reason: string }
     */
    checkSignal(token) {
        const thetaData = this.state.thetaData.get(token);
        
        // Check expiry day theta crush
        if (this.state.expiryThetaCrushActive) {
            return {
                allowed: false,
                reason: 'THETA_CRUSH_BLOCKED: Expiry day theta crush zone active',
                expiryThetaCrush: true
            };
        }

        if (!thetaData) {
            return {
                allowed: true,
                reason: 'No theta data - allowing signal',
                thetaData: null
            };
        }

        // Block deep OTM
        if (thetaData.moneynessType === 'DEEP_OTM') {
            return {
                allowed: false,
                reason: `THETA_CRUSH_BLOCKED: Deep OTM option (${thetaData.moneyness.toFixed(2)}% from ATM)`,
                deepOTM: true,
                moneyness: thetaData.moneyness
            };
        }

        // Check true momentum
        if (thetaData.trueMomentum < this.config.minTrueMomentum && 
            thetaData.actualMove > 0) {
            return {
                allowed: false,
                reason: `THETA_CRUSH_BLOCKED: True momentum ${thetaData.trueMomentum.toFixed(2)}% < ${this.config.minTrueMomentum}% (Theta eating gains)`,
                trueMomentum: thetaData.trueMomentum,
                thetaImpact: thetaData.thetaImpact
            };
        }

        // Check negative theta velocity (rapid decay)
        if (thetaData.thetaVelocity < -5) {
            return {
                allowed: false,
                reason: `THETA_CRUSH_BLOCKED: Rapid theta decay velocity ${thetaData.thetaVelocity.toFixed(2)}%/5min`,
                thetaVelocity: thetaData.thetaVelocity
            };
        }

        return {
            allowed: true,
            reason: `Theta OK - True momentum ${thetaData.trueMomentum.toFixed(2)}%`,
            trueMomentum: thetaData.trueMomentum,
            thetaData
        };
    }

    /**
     * Get theta data for a token
     */
    getThetaData(token) {
        return this.state.thetaData.get(token) || null;
    }

    /**
     * Get all theta data
     */
    getAllThetaData() {
        return Object.fromEntries(this.state.thetaData);
    }

    /**
     * Check if expiry crush is active
     */
    isExpiryCrushActive() {
        return this.state.expiryThetaCrushActive;
    }

    /**
     * Get stats
     */
    getStats() {
        return {
            trackedOptions: this.state.thetaData.size,
            expiryThetaCrushActive: this.state.expiryThetaCrushActive,
            lastUpdate: this.state.lastUpdate,
            config: this.config,
            summary: {
                atm: Array.from(this.state.thetaData.values()).filter(d => d.moneynessType === 'ATM').length,
                otm1: Array.from(this.state.thetaData.values()).filter(d => d.moneynessType === 'OTM_1').length,
                otm2: Array.from(this.state.thetaData.values()).filter(d => d.moneynessType === 'OTM_2').length,
                deepOtm: Array.from(this.state.thetaData.values()).filter(d => d.moneynessType === 'DEEP_OTM').length
            }
        };
    }
}

module.exports = new ThetaEngineService();
