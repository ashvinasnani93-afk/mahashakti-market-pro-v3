/**
 * GAMMA CLUSTER DETECTION SERVICE
 * Detects near-ATM gamma clusters, IV surges, OI concentration
 * Upgrade signal only if cluster confirmed
 */

const marketStateService = require('./marketState.service');
const oiIntelligenceService = require('./oiIntelligence.service');

class GammaClusterService {
    constructor() {
        this.state = {
            clusters: new Map(),         // underlying -> cluster data
            lastUpdate: null
        };

        this.config = {
            updateIntervalMs: 10000,     // Update every 10 seconds
            atmWindow: 3,                // +/- 3 strikes from ATM
            oiConcentrationThreshold: 30, // % of total OI in ATM zone
            ivSurgeThreshold: 10,        // 10% IV increase = surge
            clusterStrengthMin: 60       // Minimum cluster strength for upgrade
        };

        this.ivHistory = new Map();      // strike -> IV history
        this.updateInterval = null;

        console.log('[GAMMA_CLUSTER] Initializing gamma cluster detection...');
        console.log('[GAMMA_CLUSTER] Initialized');
    }

    /**
     * Start periodic cluster detection
     */
    start() {
        if (this.updateInterval) {
            console.log('[GAMMA_CLUSTER] Already running');
            return;
        }

        this.detect();
        this.updateInterval = setInterval(() => {
            this.detect();
        }, this.config.updateIntervalMs);

        console.log('[GAMMA_CLUSTER] Started - detecting every 10 seconds');
    }

    /**
     * Stop cluster detection
     */
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            console.log('[GAMMA_CLUSTER] Stopped');
        }
    }

    /**
     * Detect gamma clusters for all tracked underlyings
     */
    detect() {
        const underlyings = ['NIFTY', 'BANKNIFTY', 'FINNIFTY'];
        
        for (const underlying of underlyings) {
            const cluster = this.detectForUnderlying(underlying);
            if (cluster) {
                this.state.clusters.set(underlying, cluster);
            }
        }

        this.state.lastUpdate = Date.now();
    }

    /**
     * Detect gamma cluster for a specific underlying
     */
    detectForUnderlying(underlying) {
        const oiData = oiIntelligenceService.getOIData(underlying);
        if (!oiData) return null;

        // Get spot price for ATM calculation
        const spotToken = underlying === 'NIFTY' ? '99926000' 
            : underlying === 'BANKNIFTY' ? '99926009' 
            : '99926037'; // FINNIFTY
        const spotState = marketStateService.getState(spotToken);
        const spotPrice = spotState?.ltp || 0;

        if (!spotPrice) return null;

        // Determine strike interval
        const strikeInterval = underlying === 'BANKNIFTY' ? 100 : 50;
        const atmStrike = Math.round(spotPrice / strikeInterval) * strikeInterval;

        // Calculate ATM zone strikes
        const atmStrikes = [];
        for (let i = -this.config.atmWindow; i <= this.config.atmWindow; i++) {
            atmStrikes.push(atmStrike + (i * strikeInterval));
        }

        // Analyze OI concentration in ATM zone
        let atmCallOI = 0;
        let atmPutOI = 0;
        let totalCallOI = 0;
        let totalPutOI = 0;
        let atmIVSum = 0;
        let atmIVCount = 0;

        const strikeData = oiData.strikeData || new Map();
        
        for (const [strike, data] of strikeData) {
            const strikeNum = parseInt(strike);
            totalCallOI += data.callOI || 0;
            totalPutOI += data.putOI || 0;

            if (atmStrikes.includes(strikeNum)) {
                atmCallOI += data.callOI || 0;
                atmPutOI += data.putOI || 0;
                
                if (data.callIV) {
                    atmIVSum += data.callIV;
                    atmIVCount++;
                }
                if (data.putIV) {
                    atmIVSum += data.putIV;
                    atmIVCount++;
                }
            }
        }

        const totalOI = totalCallOI + totalPutOI;
        const atmOI = atmCallOI + atmPutOI;
        const oiConcentration = totalOI > 0 ? (atmOI / totalOI) * 100 : 0;
        const avgATMIV = atmIVCount > 0 ? atmIVSum / atmIVCount : 0;

        // Check for IV surge
        const ivHistoryKey = `${underlying}_ATM`;
        const ivHistory = this.ivHistory.get(ivHistoryKey) || [];
        ivHistory.push({ timestamp: Date.now(), iv: avgATMIV });
        if (ivHistory.length > 30) ivHistory.shift();
        this.ivHistory.set(ivHistoryKey, ivHistory);

        let ivSurge = false;
        if (ivHistory.length >= 6) {
            const recentIV = ivHistory.slice(-3).reduce((sum, h) => sum + h.iv, 0) / 3;
            const olderIV = ivHistory.slice(0, 3).reduce((sum, h) => sum + h.iv, 0) / 3;
            const ivChange = olderIV > 0 ? ((recentIV - olderIV) / olderIV) * 100 : 0;
            ivSurge = ivChange >= this.config.ivSurgeThreshold;
        }

        // Calculate cluster strength (0-100)
        let clusterStrength = 0;
        
        // OI concentration component (0-40)
        clusterStrength += Math.min(40, oiConcentration * 1.3);
        
        // IV surge component (0-30)
        if (ivSurge) {
            clusterStrength += 30;
        } else if (avgATMIV > 15) {
            clusterStrength += avgATMIV > 20 ? 20 : 10;
        }

        // ATM Call/Put balance component (0-30)
        const atmPCR = atmCallOI > 0 ? atmPutOI / atmCallOI : 1;
        if (atmPCR > 0.8 && atmPCR < 1.2) {
            clusterStrength += 30; // Balanced = strong cluster
        } else if (atmPCR > 0.6 && atmPCR < 1.5) {
            clusterStrength += 20;
        } else {
            clusterStrength += 10;
        }

        const clusterDetected = clusterStrength >= this.config.clusterStrengthMin;

        return {
            underlying,
            spotPrice,
            atmStrike,
            atmStrikes,
            oiConcentration: Math.round(oiConcentration * 100) / 100,
            atmCallOI,
            atmPutOI,
            atmPCR: Math.round(atmPCR * 100) / 100,
            avgATMIV: Math.round(avgATMIV * 100) / 100,
            ivSurge,
            clusterStrength: Math.round(clusterStrength),
            clusterDetected,
            clusterType: this.classifyCluster(oiConcentration, ivSurge, atmPCR),
            timestamp: Date.now()
        };
    }

    /**
     * Classify cluster type
     */
    classifyCluster(oiConcentration, ivSurge, pcr) {
        if (oiConcentration > 40 && ivSurge) {
            return 'STRONG_GAMMA_PIN';
        }
        if (oiConcentration > 30) {
            return 'GAMMA_MAGNET';
        }
        if (ivSurge) {
            return 'IV_EXPANSION';
        }
        if (pcr > 1.3) {
            return 'PUT_HEAVY';
        }
        if (pcr < 0.7) {
            return 'CALL_HEAVY';
        }
        return 'NEUTRAL';
    }

    /**
     * MAIN: Check if signal should be upgraded based on gamma cluster
     * @param {string} underlying - NIFTY, BANKNIFTY, etc.
     * @param {string} signalType - Signal type
     * @returns {object} { upgrade: boolean, reason: string }
     */
    checkSignal(underlying, signalType) {
        const cluster = this.state.clusters.get(underlying);
        
        if (!cluster) {
            return {
                upgrade: false,
                reason: 'No cluster data available',
                clusterStrength: null
            };
        }

        if (!cluster.clusterDetected) {
            return {
                upgrade: false,
                reason: `Weak cluster strength ${cluster.clusterStrength}% < ${this.config.clusterStrengthMin}%`,
                clusterStrength: cluster.clusterStrength,
                clusterType: cluster.clusterType
            };
        }

        // Strong cluster detected - can upgrade
        return {
            upgrade: true,
            reason: `Strong ${cluster.clusterType} detected - Strength ${cluster.clusterStrength}%`,
            clusterStrength: cluster.clusterStrength,
            clusterType: cluster.clusterType,
            detail: cluster
        };
    }

    /**
     * Get cluster for underlying
     */
    getCluster(underlying) {
        return this.state.clusters.get(underlying) || null;
    }

    /**
     * Get all clusters
     */
    getAllClusters() {
        return Object.fromEntries(this.state.clusters);
    }

    /**
     * Get stats
     */
    getStats() {
        return {
            clustersTracked: this.state.clusters.size,
            clusters: this.getAllClusters(),
            lastUpdate: this.state.lastUpdate,
            config: this.config
        };
    }
}

module.exports = new GammaClusterService();
