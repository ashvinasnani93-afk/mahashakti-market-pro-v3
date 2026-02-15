/**
 * CROWDING DETECTION SERVICE
 * Detects extreme positioning that signals trap risk
 * Flags: Extreme OI, PCR extremes, One-sided positioning
 */

const oiIntelligenceService = require('./oiIntelligence.service');

class CrowdingDetectorService {
    constructor() {
        this.state = {
            crowdingAlerts: new Map(),   // underlying -> crowding data
            lastUpdate: null
        };

        this.config = {
            pcrBullishExtreme: 0.5,      // PCR < 0.5 = extreme bullish
            pcrBearishExtreme: 1.5,      // PCR > 1.5 = extreme bearish
            oiConcentrationThreshold: 50, // >50% OI in single direction
            updateIntervalMs: 30000
        };

        this.pcrHistory = new Map();     // underlying -> PCR history
        this.updateInterval = null;

        console.log('[CROWDING_DETECTOR] Initializing crowding detection...');
        console.log('[CROWDING_DETECTOR] Initialized');
    }

    /**
     * Start crowding detection
     */
    start() {
        if (this.updateInterval) {
            console.log('[CROWDING_DETECTOR] Already running');
            return;
        }

        this.detect();
        this.updateInterval = setInterval(() => {
            this.detect();
        }, this.config.updateIntervalMs);

        console.log('[CROWDING_DETECTOR] Started - detecting every 30 seconds');
    }

    /**
     * Stop crowding detection
     */
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('[CROWDING_DETECTOR] Stopped');
        }
    }

    /**
     * Detect crowding for all underlyings
     */
    detect() {
        const underlyings = ['NIFTY', 'BANKNIFTY', 'FINNIFTY'];

        for (const underlying of underlyings) {
            const crowding = this.detectForUnderlying(underlying);
            if (crowding) {
                this.state.crowdingAlerts.set(underlying, crowding);
            }
        }

        this.state.lastUpdate = Date.now();
    }

    /**
     * Detect crowding for specific underlying
     */
    detectForUnderlying(underlying) {
        const pcr = oiIntelligenceService.getPCR(underlying);
        
        if (!pcr) return null;

        // Track PCR history
        const history = this.pcrHistory.get(underlying) || [];
        history.push({ timestamp: Date.now(), pcr: pcr.pcr });
        if (history.length > 60) history.shift();
        this.pcrHistory.set(underlying, history);

        // Analyze crowding
        const crowdingScore = this.calculateCrowdingScore(pcr.pcr, history);
        const trapRisk = this.assessTrapRisk(pcr.pcr, history);

        const result = {
            underlying,
            pcr: pcr.pcr,
            crowdingScore,
            trapRisk,
            direction: pcr.pcr < 1 ? 'CALL_HEAVY' : 'PUT_HEAVY',
            extremeLevel: this.classifyExtreme(pcr.pcr),
            pcrChange: this.calculatePCRChange(history),
            timestamp: Date.now()
        };

        // Log if extreme
        if (result.extremeLevel !== 'NORMAL') {
            console.log(`[CROWDING_DETECTOR] ⚠️ ${underlying}: ${result.extremeLevel} - PCR ${pcr.pcr.toFixed(2)} | Trap Risk: ${trapRisk}`);
        }

        return result;
    }

    /**
     * Calculate crowding score (0-100)
     */
    calculateCrowdingScore(currentPCR, history) {
        let score = 0;

        // PCR extreme contribution (0-50)
        if (currentPCR < this.config.pcrBullishExtreme) {
            score += 50 * (1 - currentPCR / this.config.pcrBullishExtreme);
        } else if (currentPCR > this.config.pcrBearishExtreme) {
            score += 50 * (currentPCR - 1) / (this.config.pcrBearishExtreme - 1);
        }

        // PCR velocity contribution (0-30)
        if (history.length >= 5) {
            const recentPCR = history.slice(-3).reduce((sum, h) => sum + h.pcr, 0) / 3;
            const olderPCR = history.slice(-6, -3).reduce((sum, h) => sum + h.pcr, 0) / 3;
            const velocity = Math.abs(recentPCR - olderPCR);
            score += Math.min(30, velocity * 30);
        }

        // Sustained extreme contribution (0-20)
        if (history.length >= 10) {
            const extremeCount = history.slice(-10).filter(h => 
                h.pcr < this.config.pcrBullishExtreme || h.pcr > this.config.pcrBearishExtreme
            ).length;
            score += extremeCount * 2;
        }

        return Math.min(100, Math.round(score));
    }

    /**
     * Assess trap risk
     */
    assessTrapRisk(currentPCR, history) {
        // Extreme PCR + Recent directional move = High trap risk
        if (currentPCR < this.config.pcrBullishExtreme) {
            // Everyone is buying calls - potential call trap
            return 'HIGH_CALL_TRAP_RISK';
        }

        if (currentPCR > this.config.pcrBearishExtreme) {
            // Everyone is buying puts - potential put trap
            return 'HIGH_PUT_TRAP_RISK';
        }

        // Check for rapid PCR change (could indicate crowding)
        if (history.length >= 5) {
            const pcrChange = this.calculatePCRChange(history);
            if (Math.abs(pcrChange) > 20) {
                return pcrChange > 0 ? 'MODERATE_BEAR_CROWDING' : 'MODERATE_BULL_CROWDING';
            }
        }

        return 'LOW';
    }

    /**
     * Classify PCR extreme level
     */
    classifyExtreme(pcr) {
        if (pcr < this.config.pcrBullishExtreme) {
            return 'EXTREME_BULLISH';
        }
        if (pcr < 0.7) {
            return 'BULLISH';
        }
        if (pcr > this.config.pcrBearishExtreme) {
            return 'EXTREME_BEARISH';
        }
        if (pcr > 1.3) {
            return 'BEARISH';
        }
        return 'NORMAL';
    }

    /**
     * Calculate PCR change percentage
     */
    calculatePCRChange(history) {
        if (history.length < 5) return 0;
        
        const recent = history.slice(-3).reduce((sum, h) => sum + h.pcr, 0) / 3;
        const older = history.slice(0, 3).reduce((sum, h) => sum + h.pcr, 0) / 3;
        
        if (older === 0) return 0;
        return ((recent - older) / older) * 100;
    }

    /**
     * MAIN: Check if signal should be flagged for trap risk
     */
    checkTrapRisk(underlying, signalType) {
        const crowding = this.state.crowdingAlerts.get(underlying);
        
        if (!crowding) {
            return {
                flagged: false,
                reason: 'No crowding data available'
            };
        }

        // High trap risk scenarios
        if (crowding.trapRisk === 'HIGH_CALL_TRAP_RISK' && 
            (signalType === 'BUY' || signalType === 'STRONG_BUY')) {
            return {
                flagged: true,
                reason: `TRAP_RISK_WARNING: High call trap risk - Everyone long calls (PCR ${crowding.pcr.toFixed(2)})`,
                crowdingScore: crowding.crowdingScore,
                recommendation: 'Consider reducing size or waiting for PCR normalization'
            };
        }

        if (crowding.trapRisk === 'HIGH_PUT_TRAP_RISK' && 
            (signalType === 'SELL' || signalType === 'STRONG_SELL')) {
            return {
                flagged: true,
                reason: `TRAP_RISK_WARNING: High put trap risk - Everyone long puts (PCR ${crowding.pcr.toFixed(2)})`,
                crowdingScore: crowding.crowdingScore,
                recommendation: 'Consider reducing size or waiting for PCR normalization'
            };
        }

        return {
            flagged: false,
            crowdingScore: crowding.crowdingScore,
            trapRisk: crowding.trapRisk,
            pcr: crowding.pcr
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // V6 UPGRADES: Late Breakout + PCR Extreme + OI Concentration
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * V6: Detect late breakout (parabolic + volume spike = retail entry)
     */
    detectLateBreakout(candles, volumeData) {
        if (!candles || candles.length < 20) {
            return { detected: false };
        }

        const result = {
            detected: false,
            type: null,
            confidence: 0,
            reason: null
        };

        // Get recent vs older data
        const recent = candles.slice(-5);
        const older = candles.slice(-20, -5);

        // Calculate avg ranges
        const recentAvgRange = recent.reduce((s, c) => s + (c.high - c.low), 0) / recent.length;
        const olderAvgRange = older.reduce((s, c) => s + (c.high - c.low), 0) / older.length;

        // Parabolic detection: recent range >> older range
        const rangeExpansion = recentAvgRange / (olderAvgRange || 1);

        // Volume spike detection
        const recentAvgVol = recent.reduce((s, c) => s + (c.volume || 0), 0) / recent.length;
        const olderAvgVol = older.reduce((s, c) => s + (c.volume || 0), 0) / older.length;
        const volumeSpike = recentAvgVol / (olderAvgVol || 1);

        // Price move from 20 candles ago
        const startPrice = candles[candles.length - 20]?.close || 0;
        const endPrice = candles[candles.length - 1]?.close || 0;
        const movePercent = startPrice > 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0;

        // Late breakout conditions
        if (rangeExpansion >= 2.5 && volumeSpike >= 3.0) {
            result.detected = true;
            result.type = 'PARABOLIC_VOLUME_SPIKE';
            result.confidence = Math.min(100, (rangeExpansion * 15) + (volumeSpike * 10));
            result.reason = `LATE_RETAIL_ENTRY: Range ${rangeExpansion.toFixed(1)}x + Volume ${volumeSpike.toFixed(1)}x`;
        } else if (Math.abs(movePercent) >= 5 && volumeSpike >= 4.0) {
            result.detected = true;
            result.type = 'EXTENDED_MOVE_HIGH_VOLUME';
            result.confidence = Math.min(100, (Math.abs(movePercent) * 8) + (volumeSpike * 8));
            result.reason = `LATE_CHASE: ${movePercent.toFixed(1)}% move with ${volumeSpike.toFixed(1)}x volume`;
        }

        if (result.detected) {
            console.log(`[CROWDING_DETECTOR] 🚨 LATE_BREAKOUT: ${result.type} | ${result.reason}`);
        }

        return {
            ...result,
            metrics: {
                rangeExpansion,
                volumeSpike,
                movePercent
            }
        };
    }

    /**
     * V6: Check for extreme OI concentration (one-sided positioning)
     */
    checkOIExtreme(underlying) {
        const result = {
            extreme: false,
            direction: null,
            concentration: 0,
            reason: null
        };

        const crowding = this.state.crowdingAlerts.get(underlying);
        if (!crowding) return result;

        const pcr = crowding.pcr;

        // Extreme call concentration
        if (pcr < 0.4) {
            result.extreme = true;
            result.direction = 'EXTREME_CALL_HEAVY';
            result.concentration = Math.round((1 - pcr) * 100);
            result.reason = `OI_EXTREME: ${result.concentration}% call-biased (PCR ${pcr.toFixed(2)})`;
        }
        // Extreme put concentration
        else if (pcr > 2.0) {
            result.extreme = true;
            result.direction = 'EXTREME_PUT_HEAVY';
            result.concentration = Math.round((pcr / 2) * 100);
            result.reason = `OI_EXTREME: ${result.concentration}% put-biased (PCR ${pcr.toFixed(2)})`;
        }

        return result;
    }

    /**
     * V6: Check PCR extreme condition
     */
    checkPCRExtreme(underlying) {
        const result = {
            extreme: false,
            level: 'NORMAL',
            pcr: null,
            action: 'NONE',
            reason: null
        };

        const crowding = this.state.crowdingAlerts.get(underlying);
        if (!crowding) return result;

        result.pcr = crowding.pcr;
        result.level = crowding.extremeLevel;

        // Extreme bullish (everyone buying calls) - contrarian bearish signal
        if (crowding.extremeLevel === 'EXTREME_BULLISH') {
            result.extreme = true;
            result.action = 'DOWNGRADE_BUY';
            result.reason = `PCR_EXTREME_BULLISH: Market too complacent (PCR ${crowding.pcr.toFixed(2)})`;
        }
        // Extreme bearish (everyone buying puts) - contrarian bullish signal
        else if (crowding.extremeLevel === 'EXTREME_BEARISH') {
            result.extreme = true;
            result.action = 'DOWNGRADE_SELL';
            result.reason = `PCR_EXTREME_BEARISH: Market too fearful (PCR ${crowding.pcr.toFixed(2)})`;
        }

        return result;
    }

    /**
     * V6: Full crowd psychology check (combines all V6 checks)
     * Returns action: BLOCK / DOWNGRADE / PASS
     */
    fullCrowdCheck(underlying, signalType, candles, volumeData) {
        const result = {
            action: 'PASS',
            confidenceAdjustment: 0,
            warnings: [],
            checks: []
        };

        // Check 1: Late breakout
        const lateBreakout = this.detectLateBreakout(candles, volumeData);
        result.checks.push({ name: 'LATE_BREAKOUT', ...lateBreakout });
        
        if (lateBreakout.detected) {
            if (lateBreakout.confidence >= 80) {
                result.action = 'BLOCK';
                result.warnings.push(lateBreakout.reason);
                return result;
            } else {
                result.confidenceAdjustment -= 15;
                result.warnings.push(lateBreakout.reason);
            }
        }

        // Check 2: OI extreme
        const oiExtreme = this.checkOIExtreme(underlying);
        result.checks.push({ name: 'OI_EXTREME', ...oiExtreme });
        
        if (oiExtreme.extreme) {
            result.confidenceAdjustment -= 10;
            result.warnings.push(oiExtreme.reason);
        }

        // Check 3: PCR extreme
        const pcrExtreme = this.checkPCRExtreme(underlying);
        result.checks.push({ name: 'PCR_EXTREME', ...pcrExtreme });
        
        if (pcrExtreme.extreme) {
            // Check if signal direction conflicts with extreme
            if ((pcrExtreme.action === 'DOWNGRADE_BUY' && signalType === 'BUY') ||
                (pcrExtreme.action === 'DOWNGRADE_SELL' && signalType === 'SELL')) {
                result.confidenceAdjustment -= 20;
                result.warnings.push(pcrExtreme.reason);
            }
        }

        // Determine final action
        if (result.confidenceAdjustment <= -30) {
            result.action = 'BLOCK';
        } else if (result.confidenceAdjustment < 0) {
            result.action = 'DOWNGRADE';
        }

        return result;
    }

    /**
     * Get crowding data for underlying
     */
    getCrowding(underlying) {
        return this.state.crowdingAlerts.get(underlying) || null;
    }

    /**
     * Get all crowding alerts
     */
    getAllCrowding() {
        return Object.fromEntries(this.state.crowdingAlerts);
    }

    /**
     * Get stats
     */
    getStats() {
        return {
            alertsTracked: this.state.crowdingAlerts.size,
            alerts: this.getAllCrowding(),
            lastUpdate: this.state.lastUpdate,
            config: this.config
        };
    }
}

module.exports = new CrowdingDetectorService();
