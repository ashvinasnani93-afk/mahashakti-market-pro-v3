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
