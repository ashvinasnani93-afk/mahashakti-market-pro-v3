/**
 * OPTION PREMIUM MICRO-IGNITION ENGINE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE: Detect early premium bursts at 4-6% level, NOT after 20% move
 * 
 * MANDATORY CONDITIONS:
 * 1️⃣ Premium change ≥ 4% in 2 candles
 * 2️⃣ OI spike velocity rising
 * 3️⃣ Spread ≤ 12%
 * 4️⃣ Underlying direction aligned
 * 5️⃣ Theta impact adjusted
 * 
 * ACCELERATION VELOCITY SCORING:
 * - ₹3 → ₹4 in 3 min = HIGH priority (fast ignition)
 * - ₹3 → ₹6 in 40 min = LOW priority (slow move)
 * 
 * OUTPUT:
 * - OPTION_IGNITION_SCORE: 0-100
 * 
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */

class MicroIgnitionOptionService {
    constructor() {
        this.config = {
            // Premium burst
            minPremiumChangePercent: 4,    // ≥4% in 2 candles
            candlesToCheck: 2,
            
            // OI velocity
            minOIVelocity: 0.5,            // 0.5% OI change per candle
            
            // Spread
            maxSpreadPercent: 12,          // ≤12%
            
            // Velocity scoring thresholds (per minute)
            highVelocityThreshold: 0.5,    // >0.5%/min = HIGH
            lowVelocityThreshold: 0.1,     // <0.1%/min = LOW
            
            // Time window for ignition detection
            ignitionWindowMinutes: 10      // Look at last 10 min
        };

        this.state = {
            ignitions: new Map(),          // token -> ignition data
            premiumHistory: new Map(),     // token -> [{price, timestamp}]
            oiHistory: new Map()           // token -> [{oi, timestamp}]
        };

        console.log('[IGNITION_OPTION] Initializing option premium micro-ignition engine...');
        console.log('[IGNITION_OPTION] Conditions: Premium≥4%, OI rising, Spread≤12%, Direction aligned');
        console.log('[IGNITION_OPTION] Initialized');
    }

    /**
     * Update premium history for velocity calculation
     */
    updatePremiumHistory(token, price, timestamp = Date.now()) {
        if (!this.state.premiumHistory.has(token)) {
            this.state.premiumHistory.set(token, []);
        }
        
        const history = this.state.premiumHistory.get(token);
        history.push({ price, timestamp });
        
        // Keep last 50 data points
        if (history.length > 50) {
            history.shift();
        }
    }

    /**
     * Update OI history
     */
    updateOIHistory(token, oi, timestamp = Date.now()) {
        if (!this.state.oiHistory.has(token)) {
            this.state.oiHistory.set(token, []);
        }
        
        const history = this.state.oiHistory.get(token);
        history.push({ oi, timestamp });
        
        if (history.length > 50) {
            history.shift();
        }
    }

    /**
     * MAIN DETECTION METHOD
     */
    detectIgnition(token, candles, currentOI, spreadPercent, underlyingDirection, thetaImpact = 0) {
        const result = {
            detected: false,
            strength: 0,
            type: 'OPTION',
            accelerationScore: 0,
            velocityPerMin: 0,
            velocityGrade: 'LOW',
            conditions: {
                premiumBurst: { passed: false, value: 0 },
                oiVelocity: { passed: false, value: 0 },
                spread: { passed: false, value: 0 },
                directionAligned: { passed: false, value: null },
                thetaAdjusted: { passed: false, value: 0 }
            },
            reason: null
        };

        if (!candles || candles.length < 5) {
            result.reason = 'INSUFFICIENT_DATA';
            return result;
        }

        // ─────────────────────────────────────────────────────────────────────────
        // CONDITION 1: Premium change ≥ 4% in 2 candles
        // ─────────────────────────────────────────────────────────────────────────
        const currentPrice = candles[candles.length - 1]?.close || 0;
        const previousPrice = candles[candles.length - 3]?.close || currentPrice;
        const premiumChange = previousPrice > 0 
            ? ((currentPrice - previousPrice) / previousPrice) * 100 
            : 0;

        result.conditions.premiumBurst.value = premiumChange.toFixed(2);
        result.conditions.premiumBurst.passed = premiumChange >= this.config.minPremiumChangePercent;

        // ─────────────────────────────────────────────────────────────────────────
        // CONDITION 2: OI spike velocity rising
        // ─────────────────────────────────────────────────────────────────────────
        const oiHistory = this.state.oiHistory.get(token) || [];
        let oiVelocity = 0;
        
        if (oiHistory.length >= 2 && currentOI > 0) {
            const oldOI = oiHistory[Math.max(0, oiHistory.length - 5)]?.oi || currentOI;
            oiVelocity = oldOI > 0 ? ((currentOI - oldOI) / oldOI) * 100 : 0;
        }

        result.conditions.oiVelocity.value = oiVelocity.toFixed(2);
        result.conditions.oiVelocity.passed = oiVelocity >= this.config.minOIVelocity;

        // ─────────────────────────────────────────────────────────────────────────
        // CONDITION 3: Spread ≤ 12%
        // ─────────────────────────────────────────────────────────────────────────
        result.conditions.spread.value = spreadPercent.toFixed(2);
        result.conditions.spread.passed = spreadPercent <= this.config.maxSpreadPercent;

        // ─────────────────────────────────────────────────────────────────────────
        // CONDITION 4: Underlying direction aligned
        // ─────────────────────────────────────────────────────────────────────────
        // For CE: underlying should be bullish (+1)
        // For PE: underlying should be bearish (-1)
        const isCallOption = this.isCallOption(token);
        const directionMatches = isCallOption 
            ? underlyingDirection > 0 
            : underlyingDirection < 0;

        result.conditions.directionAligned.value = underlyingDirection;
        result.conditions.directionAligned.passed = directionMatches || underlyingDirection === 0;

        // ─────────────────────────────────────────────────────────────────────────
        // CONDITION 5: Theta impact adjusted
        // ─────────────────────────────────────────────────────────────────────────
        // If theta decay is eating >20% of the move, downgrade
        const thetaImpactPercent = Math.abs(thetaImpact);
        const netPremiumMove = premiumChange - thetaImpactPercent;
        
        result.conditions.thetaAdjusted.value = netPremiumMove.toFixed(2);
        result.conditions.thetaAdjusted.passed = netPremiumMove >= this.config.minPremiumChangePercent * 0.8;

        // ─────────────────────────────────────────────────────────────────────────
        // CALCULATE ACCELERATION VELOCITY SCORE
        // ─────────────────────────────────────────────────────────────────────────
        const premiumHistory = this.state.premiumHistory.get(token) || [];
        
        if (premiumHistory.length >= 2) {
            const oldest = premiumHistory[0];
            const newest = premiumHistory[premiumHistory.length - 1];
            const timeMinutes = (newest.timestamp - oldest.timestamp) / (1000 * 60);
            const priceChange = oldest.price > 0 
                ? ((newest.price - oldest.price) / oldest.price) * 100 
                : 0;
            
            result.velocityPerMin = timeMinutes > 0 ? priceChange / timeMinutes : 0;
            
            // Grade the velocity
            if (result.velocityPerMin >= this.config.highVelocityThreshold) {
                result.velocityGrade = 'HIGH';
                result.accelerationScore = Math.min(100, result.velocityPerMin * 100);
            } else if (result.velocityPerMin >= this.config.lowVelocityThreshold) {
                result.velocityGrade = 'MEDIUM';
                result.accelerationScore = Math.min(70, result.velocityPerMin * 200);
            } else {
                result.velocityGrade = 'LOW';
                result.accelerationScore = Math.min(30, result.velocityPerMin * 300);
            }
        }

        // ─────────────────────────────────────────────────────────────────────────
        // CALCULATE FINAL IGNITION
        // ─────────────────────────────────────────────────────────────────────────
        const passedConditions = Object.values(result.conditions).filter(c => c.passed).length;
        const totalConditions = Object.keys(result.conditions).length;

        // At least 4/5 conditions must pass
        if (passedConditions >= 4) {
            result.detected = true;
            
            // Calculate strength (0-100)
            let strength = 0;
            
            // Premium burst contribution (0-30)
            strength += Math.min(30, (premiumChange / 10) * 30);
            
            // OI velocity contribution (0-20)
            strength += Math.min(20, oiVelocity * 10);
            
            // Acceleration score contribution (0-25)
            strength += Math.min(25, result.accelerationScore * 0.25);
            
            // Low spread bonus (0-15)
            strength += Math.max(0, (12 - spreadPercent) / 12 * 15);
            
            // Direction alignment bonus (0-10)
            if (directionMatches) strength += 10;
            
            result.strength = Math.min(100, Math.round(strength));
            result.reason = 'IGNITION_DETECTED';
            
            // Store ignition
            this.state.ignitions.set(token, {
                token,
                strength: result.strength,
                accelerationScore: result.accelerationScore,
                velocityGrade: result.velocityGrade,
                detectedAt: Date.now(),
                conditions: result.conditions
            });
            
            console.log(`[IGNITION_OPTION] 🚀 OPTION_IGNITION_DETECTED: ${token} | Score: ${result.strength} | Velocity: ${result.velocityGrade}`);
        } else {
            result.reason = `CONDITIONS_FAILED: ${passedConditions}/${totalConditions}`;
        }

        return result;
    }

    /**
     * Calculate velocity score for specific price move
     * Example: ₹3 → ₹4 in 3 min vs ₹3 → ₹6 in 40 min
     */
    calculateVelocityScore(startPrice, endPrice, timeMinutes) {
        if (startPrice <= 0 || timeMinutes <= 0) return 0;
        
        const changePercent = ((endPrice - startPrice) / startPrice) * 100;
        const velocityPerMin = changePercent / timeMinutes;
        
        // Examples:
        // ₹3 → ₹4 in 3 min = 33.3% / 3 = 11.1%/min = HIGH (score: 100)
        // ₹3 → ₹6 in 40 min = 100% / 40 = 2.5%/min = MEDIUM (score: 50)
        
        let score = 0;
        if (velocityPerMin >= 5) {
            score = 100;  // ULTRA HIGH
        } else if (velocityPerMin >= 2) {
            score = 80;   // HIGH
        } else if (velocityPerMin >= 0.5) {
            score = 50;   // MEDIUM
        } else if (velocityPerMin >= 0.1) {
            score = 30;   // LOW
        } else {
            score = 10;   // VERY LOW
        }
        
        return {
            score,
            velocityPerMin: velocityPerMin.toFixed(2),
            grade: score >= 80 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW'
        };
    }

    /**
     * Check if token is Call option
     */
    isCallOption(token) {
        const symbol = String(token).toUpperCase();
        return symbol.endsWith('CE') || symbol.includes('CE');
    }

    /**
     * Check if ignition exists
     */
    hasIgnition(token) {
        const ignition = this.state.ignitions.get(token);
        if (!ignition) return false;
        
        // Ignition valid for 3 minutes (options move fast)
        const age = Date.now() - ignition.detectedAt;
        if (age > 3 * 60 * 1000) {
            this.state.ignitions.delete(token);
            return false;
        }
        
        return true;
    }

    /**
     * Get ignition data
     */
    getIgnition(token) {
        if (this.hasIgnition(token)) {
            return this.state.ignitions.get(token);
        }
        return null;
    }

    /**
     * Get all active ignitions
     */
    getActiveIgnitions() {
        const now = Date.now();
        const active = [];
        
        for (const [token, ignition] of this.state.ignitions) {
            if (now - ignition.detectedAt <= 3 * 60 * 1000) {
                active.push(ignition);
            }
        }
        
        return active;
    }

    /**
     * Get stats
     */
    getStats() {
        return {
            activeIgnitions: this.getActiveIgnitions().length,
            totalDetected: this.state.ignitions.size,
            config: this.config
        };
    }
}

module.exports = new MicroIgnitionOptionService();
