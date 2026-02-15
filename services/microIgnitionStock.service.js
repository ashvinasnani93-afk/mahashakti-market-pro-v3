/**
 * STOCK MICRO-IGNITION ENGINE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE: Detect early stock moves at 1-1.5% level, NOT after 15% breakout
 * 
 * MANDATORY CONDITIONS (ALL must pass):
 * 1️⃣ Last 2 candles strong body (>60% body size)
 * 2️⃣ Volume ≥ 1.8x average
 * 3️⃣ VWAP reclaim + hold
 * 4️⃣ ATR expansion slope rising
 * 5️⃣ Spread normal (<0.5% for stocks)
 * 6️⃣ Not circuit proximity (<18% from circuit)
 * 
 * OUTPUT:
 * - IGNITION_DETECTED: STOCK
 * - IGNITION_STRENGTH: 0-100
 * 
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */

class MicroIgnitionStockService {
    constructor() {
        this.config = {
            // Body strength
            minBodyRatio: 0.60,           // >60% body size
            candlesToCheck: 2,            // Last 2 candles
            
            // Volume
            minVolumeMultiple: 1.8,       // ≥1.8x average
            volumeAvgPeriod: 20,          // 20 candle avg
            
            // VWAP
            vwapReclaimBuffer: 0.001,     // 0.1% above VWAP
            
            // ATR
            atrPeriod: 14,
            atrSlopeMinRise: 0.05,        // 5% ATR expansion
            
            // Spread
            maxSpreadPercent: 0.5,        // <0.5% spread
            
            // Circuit proximity
            circuitProximityThreshold: 18 // <18% from circuit
        };

        this.state = {
            ignitions: new Map(),         // token -> ignition data
            lastUpdate: null
        };

        console.log('[IGNITION_STOCK] Initializing stock micro-ignition engine...');
        console.log('[IGNITION_STOCK] Conditions: Body>60%, Vol≥1.8x, VWAP reclaim, ATR rising');
        console.log('[IGNITION_STOCK] Initialized');
    }

    /**
     * MAIN DETECTION METHOD
     * Called BEFORE breakout confirmation
     */
    detectIgnition(token, candles, ltp, spreadPercent = 0, circuitPercent = 100) {
        const result = {
            detected: false,
            strength: 0,
            type: 'STOCK',
            conditions: {
                bodyStrength: { passed: false, value: 0 },
                volume: { passed: false, value: 0 },
                vwap: { passed: false, value: 0 },
                atrSlope: { passed: false, value: 0 },
                spread: { passed: false, value: 0 },
                circuitSafe: { passed: false, value: 0 }
            },
            reason: null
        };

        if (!candles || candles.length < 20) {
            result.reason = 'INSUFFICIENT_DATA';
            return result;
        }

        // ─────────────────────────────────────────────────────────────────────────
        // CONDITION 1: Last 2 candles strong body (>60%)
        // ─────────────────────────────────────────────────────────────────────────
        const recentCandles = candles.slice(-this.config.candlesToCheck);
        let totalBodyRatio = 0;
        let bullishCount = 0;

        for (const candle of recentCandles) {
            const range = Math.abs(candle.high - candle.low);
            const body = Math.abs(candle.close - candle.open);
            const bodyRatio = range > 0 ? body / range : 0;
            totalBodyRatio += bodyRatio;
            
            if (candle.close > candle.open) bullishCount++;
        }

        const avgBodyRatio = totalBodyRatio / recentCandles.length;
        result.conditions.bodyStrength.value = (avgBodyRatio * 100).toFixed(1);
        result.conditions.bodyStrength.passed = avgBodyRatio >= this.config.minBodyRatio;

        // ─────────────────────────────────────────────────────────────────────────
        // CONDITION 2: Volume ≥ 1.8x average
        // ─────────────────────────────────────────────────────────────────────────
        const volumeCandles = candles.slice(-this.config.volumeAvgPeriod - 2, -2);
        const avgVolume = volumeCandles.reduce((sum, c) => sum + (c.volume || 0), 0) / volumeCandles.length;
        const currentVolume = (candles[candles.length - 1]?.volume || 0);
        const volumeMultiple = avgVolume > 0 ? currentVolume / avgVolume : 0;

        result.conditions.volume.value = volumeMultiple.toFixed(2);
        result.conditions.volume.passed = volumeMultiple >= this.config.minVolumeMultiple;

        // ─────────────────────────────────────────────────────────────────────────
        // CONDITION 3: VWAP reclaim + hold
        // ─────────────────────────────────────────────────────────────────────────
        const vwap = this.calculateVWAP(candles);
        const priceAboveVWAP = ltp > vwap * (1 + this.config.vwapReclaimBuffer);
        const lastCandleAboveVWAP = candles[candles.length - 1]?.close > vwap;
        const secondLastAboveVWAP = candles[candles.length - 2]?.close > vwap;

        result.conditions.vwap.value = ((ltp / vwap - 1) * 100).toFixed(2);
        result.conditions.vwap.passed = priceAboveVWAP && lastCandleAboveVWAP;

        // ─────────────────────────────────────────────────────────────────────────
        // CONDITION 4: ATR expansion slope rising
        // ─────────────────────────────────────────────────────────────────────────
        const currentATR = this.calculateATR(candles, this.config.atrPeriod);
        const previousATR = this.calculateATR(candles.slice(0, -5), this.config.atrPeriod);
        const atrSlope = previousATR > 0 ? (currentATR - previousATR) / previousATR : 0;

        result.conditions.atrSlope.value = (atrSlope * 100).toFixed(2);
        result.conditions.atrSlope.passed = atrSlope >= this.config.atrSlopeMinRise;

        // ─────────────────────────────────────────────────────────────────────────
        // CONDITION 5: Spread normal (<0.5%)
        // ─────────────────────────────────────────────────────────────────────────
        result.conditions.spread.value = spreadPercent.toFixed(2);
        result.conditions.spread.passed = spreadPercent <= this.config.maxSpreadPercent;

        // ─────────────────────────────────────────────────────────────────────────
        // CONDITION 6: Not circuit proximity (<18% from circuit)
        // ─────────────────────────────────────────────────────────────────────────
        // circuitPercent = distance from circuit (100 = far, 5 = close)
        // We want: NOT in circuit proximity, so circuitPercent should be HIGH (>18)
        result.conditions.circuitSafe.value = circuitPercent.toFixed(1);
        result.conditions.circuitSafe.passed = circuitPercent > this.config.circuitProximityThreshold;

        // ─────────────────────────────────────────────────────────────────────────
        // CALCULATE IGNITION STRENGTH
        // ─────────────────────────────────────────────────────────────────────────
        const passedConditions = Object.values(result.conditions).filter(c => c.passed).length;
        const totalConditions = Object.keys(result.conditions).length;

        // All 6 conditions must pass for ignition
        if (passedConditions === totalConditions) {
            result.detected = true;
            
            // Calculate strength (0-100)
            let strength = 0;
            
            // Body strength contribution (0-20)
            strength += Math.min(20, (avgBodyRatio / 0.8) * 20);
            
            // Volume contribution (0-25)
            strength += Math.min(25, (volumeMultiple / 3) * 25);
            
            // VWAP distance contribution (0-15)
            const vwapDistance = (ltp / vwap - 1) * 100;
            strength += Math.min(15, vwapDistance * 5);
            
            // ATR slope contribution (0-20)
            strength += Math.min(20, (atrSlope / 0.15) * 20);
            
            // Bullish candles bonus (0-10)
            strength += (bullishCount / 2) * 10;
            
            // Low spread bonus (0-10)
            strength += Math.max(0, (0.5 - spreadPercent) / 0.5 * 10);
            
            result.strength = Math.min(100, Math.round(strength));
            result.reason = 'IGNITION_DETECTED';
            
            // Store ignition
            this.state.ignitions.set(token, {
                token,
                strength: result.strength,
                detectedAt: Date.now(),
                conditions: result.conditions
            });
            
            console.log(`[IGNITION_STOCK] 🚀 IGNITION_DETECTED: ${token} | Strength: ${result.strength}`);
        } else {
            result.reason = `CONDITIONS_FAILED: ${passedConditions}/${totalConditions}`;
        }

        return result;
    }

    /**
     * Calculate VWAP
     */
    calculateVWAP(candles) {
        let cumulativeTPV = 0;  // Typical Price * Volume
        let cumulativeVolume = 0;

        for (const candle of candles) {
            const typicalPrice = (candle.high + candle.low + candle.close) / 3;
            const volume = candle.volume || 0;
            cumulativeTPV += typicalPrice * volume;
            cumulativeVolume += volume;
        }

        return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : 0;
    }

    /**
     * Calculate ATR
     */
    calculateATR(candles, period = 14) {
        if (candles.length < period + 1) return 0;

        const trs = [];
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;
            
            const tr = Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
            );
            trs.push(tr);
        }

        const recentTRs = trs.slice(-period);
        return recentTRs.reduce((sum, tr) => sum + tr, 0) / recentTRs.length;
    }

    /**
     * Check if ignition exists for token
     */
    hasIgnition(token) {
        const ignition = this.state.ignitions.get(token);
        if (!ignition) return false;
        
        // Ignition valid for 5 minutes
        const age = Date.now() - ignition.detectedAt;
        if (age > 5 * 60 * 1000) {
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
            if (now - ignition.detectedAt <= 5 * 60 * 1000) {
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

module.exports = new MicroIgnitionStockService();
