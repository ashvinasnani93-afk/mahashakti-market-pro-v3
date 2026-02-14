const wsService = require('./websocket.service');
const universeLoader = require('./universeLoader.service');

class OIIntelligenceService {
    constructor() {
        // OI data stores
        this.oiSnapshots = new Map();      // token -> { oi, prevOi, change, changePercent, timestamp }
        this.oiDeltaHistory = new Map();   // token -> [{ delta, timestamp }]
        this.buildupSignals = new Map();   // token -> { type, strength, timestamp }
        
        // PCR data (Index level only)
        this.pcrData = new Map();          // index -> { pcr, prevPcr, trend, callOI, putOI }
        this.pcrHistory = new Map();       // index -> [{ pcr, timestamp }]
        
        // Expiry-wise PCR
        this.expiryPCR = new Map();        // `${index}_${expiry}` -> { pcr, callOI, putOI }
        
        // Configuration
        this.config = {
            oiDeltaThreshold: 5,           // 5% change = significant
            accelerationThreshold: 10,     // 10% = acceleration
            pcrHistorySize: 100,
            oiHistorySize: 50,
            buildupStrengthMin: 3,
            indices: ['NIFTY', 'BANKNIFTY', 'FINNIFTY']
        };
        
        // Stats
        this.stats = {
            totalOITracked: 0,
            buildupSignals: 0,
            pcrUpdates: 0,
            lastUpdate: null
        };
    }

    initialize() {
        console.log('[OI_INTELLIGENCE] Initializing OI Intelligence Layer...');
        
        // Listen to live price updates for OI changes
        wsService.onPrice((data) => {
            if (data.oi !== undefined && data.oi > 0) {
                this.processOIUpdate(data.token, data.oi, data.ltp, data.timestamp);
            }
        });
        
        console.log('[OI_INTELLIGENCE] Initialized');
    }

    // 🔴 PROCESS OI UPDATE FROM WEBSOCKET
    processOIUpdate(token, currentOI, ltp, timestamp = Date.now()) {
        const existing = this.oiSnapshots.get(token);
        
        if (existing) {
            const prevOI = existing.oi;
            const oiChange = currentOI - prevOI;
            const oiChangePercent = prevOI > 0 ? (oiChange / prevOI) * 100 : 0;
            
            // Update snapshot
            this.oiSnapshots.set(token, {
                oi: currentOI,
                prevOi: prevOI,
                change: oiChange,
                changePercent: oiChangePercent,
                ltp,
                prevLtp: existing.ltp,
                timestamp
            });
            
            // Record delta history
            this.recordOIDelta(token, oiChangePercent, timestamp);
            
            // Check for buildup signals
            if (Math.abs(oiChangePercent) >= this.config.oiDeltaThreshold) {
                this.detectBuildup(token, oiChange, oiChangePercent, ltp, existing.ltp);
            }
            
            // Update PCR if this is an index option
            this.updatePCRIfIndexOption(token, currentOI);
            
        } else {
            // First snapshot
            this.oiSnapshots.set(token, {
                oi: currentOI,
                prevOi: currentOI,
                change: 0,
                changePercent: 0,
                ltp,
                prevLtp: ltp,
                timestamp
            });
        }
        
        this.stats.totalOITracked = this.oiSnapshots.size;
        this.stats.lastUpdate = timestamp;
    }

    recordOIDelta(token, deltaPercent, timestamp) {
        const history = this.oiDeltaHistory.get(token) || [];
        
        history.push({
            delta: deltaPercent,
            timestamp
        });
        
        if (history.length > this.config.oiHistorySize) {
            history.shift();
        }
        
        this.oiDeltaHistory.set(token, history);
    }

    // 🔴 DETECT BUILDUP TYPE
    detectBuildup(token, oiChange, oiChangePercent, currentLtp, prevLtp) {
        const priceChange = prevLtp > 0 ? ((currentLtp - prevLtp) / prevLtp) * 100 : 0;
        const priceUp = priceChange > 0.1;
        const priceDown = priceChange < -0.1;
        const oiUp = oiChange > 0;
        const oiDown = oiChange < 0;
        
        let buildupType = 'NEUTRAL';
        let interpretation = '';
        
        // 🔴 BUILDUP LOGIC
        if (oiUp && priceUp) {
            buildupType = 'LONG_BUILDUP';
            interpretation = 'Fresh longs being created - Bullish';
        } else if (oiUp && priceDown) {
            buildupType = 'SHORT_BUILDUP';
            interpretation = 'Fresh shorts being created - Bearish';
        } else if (oiDown && priceUp) {
            buildupType = 'SHORT_COVERING';
            interpretation = 'Shorts closing positions - Bullish';
        } else if (oiDown && priceDown) {
            buildupType = 'LONG_UNWINDING';
            interpretation = 'Longs closing positions - Bearish';
        }
        
        // Calculate strength (1-10)
        const strength = Math.min(10, Math.floor(Math.abs(oiChangePercent) / 2) + Math.floor(Math.abs(priceChange) * 2));
        
        if (strength >= this.config.buildupStrengthMin) {
            const signal = {
                type: buildupType,
                interpretation,
                oiChange,
                oiChangePercent: parseFloat(oiChangePercent.toFixed(2)),
                priceChange: parseFloat(priceChange.toFixed(2)),
                strength,
                bullish: buildupType === 'LONG_BUILDUP' || buildupType === 'SHORT_COVERING',
                bearish: buildupType === 'SHORT_BUILDUP' || buildupType === 'LONG_UNWINDING',
                timestamp: Date.now()
            };
            
            this.buildupSignals.set(token, signal);
            this.stats.buildupSignals++;
            
            console.log(`[OI_INTELLIGENCE] ${buildupType} detected | OI: ${oiChangePercent.toFixed(1)}% | Price: ${priceChange.toFixed(2)}% | Strength: ${strength}`);
        }
        
        return buildupType;
    }

    // 🔴 DETECT OI DELTA ACCELERATION
    detectOIDeltaAcceleration(token) {
        const history = this.oiDeltaHistory.get(token);
        if (!history || history.length < 10) return null;
        
        const recent = history.slice(-5);
        const older = history.slice(-10, -5);
        
        const recentAvg = recent.reduce((sum, h) => sum + Math.abs(h.delta), 0) / recent.length;
        const olderAvg = older.reduce((sum, h) => sum + Math.abs(h.delta), 0) / older.length;
        
        if (olderAvg === 0) return null;
        
        const accelerationRatio = recentAvg / olderAvg;
        
        if (accelerationRatio >= 2) {
            return {
                accelerating: true,
                ratio: parseFloat(accelerationRatio.toFixed(2)),
                recentAvgDelta: parseFloat(recentAvg.toFixed(2)),
                olderAvgDelta: parseFloat(olderAvg.toFixed(2)),
                intensity: accelerationRatio >= 3 ? 'HIGH' : 'MODERATE'
            };
        }
        
        return { accelerating: false, ratio: parseFloat(accelerationRatio.toFixed(2)) };
    }

    // 🔴 UPDATE PCR FOR INDEX OPTIONS
    updatePCRIfIndexOption(token, currentOI) {
        const instrument = universeLoader.getByToken(token);
        if (!instrument || instrument.instrumentType !== 'INDEX_OPTION') return;
        
        const indexName = instrument.underlying;
        if (!this.config.indices.includes(indexName)) return;
        
        const expiry = instrument.expiry;
        const optionType = instrument.optionType;
        
        // Update expiry-wise PCR
        const expiryKey = `${indexName}_${expiry}`;
        const expiryData = this.expiryPCR.get(expiryKey) || { callOI: 0, putOI: 0, pcr: 0 };
        
        if (optionType === 'CE') {
            expiryData.callOI += currentOI;
        } else if (optionType === 'PE') {
            expiryData.putOI += currentOI;
        }
        
        if (expiryData.callOI > 0) {
            expiryData.pcr = expiryData.putOI / expiryData.callOI;
        }
        
        this.expiryPCR.set(expiryKey, expiryData);
        
        // Update index-level PCR
        this.updateIndexPCR(indexName);
    }

    updateIndexPCR(indexName) {
        let totalCallOI = 0;
        let totalPutOI = 0;
        
        // Sum up all expiries for this index
        this.expiryPCR.forEach((data, key) => {
            if (key.startsWith(indexName)) {
                totalCallOI += data.callOI;
                totalPutOI += data.putOI;
            }
        });
        
        if (totalCallOI === 0) return;
        
        const newPCR = totalPutOI / totalCallOI;
        const existing = this.pcrData.get(indexName);
        const prevPCR = existing?.pcr || newPCR;
        
        // Detect PCR trend
        const pcrChange = newPCR - prevPCR;
        let trend = 'STABLE';
        if (pcrChange > 0.02) trend = 'RISING';
        else if (pcrChange < -0.02) trend = 'FALLING';
        
        this.pcrData.set(indexName, {
            pcr: parseFloat(newPCR.toFixed(3)),
            prevPcr: parseFloat(prevPCR.toFixed(3)),
            change: parseFloat(pcrChange.toFixed(4)),
            trend,
            callOI: totalCallOI,
            putOI: totalPutOI,
            timestamp: Date.now()
        });
        
        // Record PCR history
        this.recordPCRHistory(indexName, newPCR);
        
        this.stats.pcrUpdates++;
    }

    recordPCRHistory(indexName, pcr) {
        const history = this.pcrHistory.get(indexName) || [];
        
        history.push({
            pcr,
            timestamp: Date.now()
        });
        
        if (history.length > this.config.pcrHistorySize) {
            history.shift();
        }
        
        this.pcrHistory.set(indexName, history);
    }

    // 🔴 DETECT PCR TREND SHIFT
    detectPCRTrendShift(indexName) {
        const history = this.pcrHistory.get(indexName);
        if (!history || history.length < 10) return null;
        
        const recent = history.slice(-5);
        const older = history.slice(-10, -5);
        
        const recentAvg = recent.reduce((sum, h) => sum + h.pcr, 0) / recent.length;
        const olderAvg = older.reduce((sum, h) => sum + h.pcr, 0) / older.length;
        
        const shift = recentAvg - olderAvg;
        const shiftPercent = olderAvg > 0 ? (shift / olderAvg) * 100 : 0;
        
        let shiftType = 'STABLE';
        let interpretation = 'PCR stable - no significant shift';
        
        if (shiftPercent > 5) {
            shiftType = 'BULLISH_SHIFT';
            interpretation = 'PCR rising - More puts being written - Bullish support';
        } else if (shiftPercent < -5) {
            shiftType = 'BEARISH_SHIFT';
            interpretation = 'PCR falling - More calls being written - Bearish pressure';
        }
        
        return {
            shiftType,
            interpretation,
            recentPCR: parseFloat(recentAvg.toFixed(3)),
            olderPCR: parseFloat(olderAvg.toFixed(3)),
            shift: parseFloat(shift.toFixed(4)),
            shiftPercent: parseFloat(shiftPercent.toFixed(2)),
            timestamp: Date.now()
        };
    }

    // 🔴 GET OI INTELLIGENCE FOR TOKEN
    getOIIntelligence(token) {
        const snapshot = this.oiSnapshots.get(token);
        const buildup = this.buildupSignals.get(token);
        const acceleration = this.detectOIDeltaAcceleration(token);
        
        return {
            snapshot,
            buildup,
            acceleration,
            hasSignificantActivity: buildup?.strength >= 5 || acceleration?.accelerating
        };
    }

    // 🔴 GET PCR DATA
    getPCR(indexName) {
        const data = this.pcrData.get(indexName);
        const trendShift = this.detectPCRTrendShift(indexName);
        
        return {
            ...data,
            trendShift
        };
    }

    getAllPCR() {
        const result = {};
        this.config.indices.forEach(index => {
            result[index] = this.getPCR(index);
        });
        return result;
    }

    getExpiryPCR(indexName, expiry) {
        const key = `${indexName}_${expiry}`;
        return this.expiryPCR.get(key);
    }

    // 🔴 GET TOP BUILDUP SIGNALS
    getTopBuildupSignals(type = null, count = 20) {
        let signals = Array.from(this.buildupSignals.entries())
            .map(([token, signal]) => ({
                token,
                instrument: universeLoader.getByToken(token),
                ...signal
            }));
        
        if (type) {
            signals = signals.filter(s => s.type === type);
        }
        
        return signals
            .sort((a, b) => b.strength - a.strength)
            .slice(0, count);
    }

    getLongBuildups(count = 10) {
        return this.getTopBuildupSignals('LONG_BUILDUP', count);
    }

    getShortBuildups(count = 10) {
        return this.getTopBuildupSignals('SHORT_BUILDUP', count);
    }

    getShortCoverings(count = 10) {
        return this.getTopBuildupSignals('SHORT_COVERING', count);
    }

    getLongUnwindings(count = 10) {
        return this.getTopBuildupSignals('LONG_UNWINDING', count);
    }

    // 🔴 MANUAL OI INPUT (for testing or batch updates)
    recordOI(token, oi, ltp) {
        this.processOIUpdate(token, oi, ltp, Date.now());
    }

    getStats() {
        return {
            ...this.stats,
            buildupBreakdown: {
                longBuildup: this.getTopBuildupSignals('LONG_BUILDUP', 100).length,
                shortBuildup: this.getTopBuildupSignals('SHORT_BUILDUP', 100).length,
                shortCovering: this.getTopBuildupSignals('SHORT_COVERING', 100).length,
                longUnwinding: this.getTopBuildupSignals('LONG_UNWINDING', 100).length
            },
            pcrTracked: this.pcrData.size,
            expiryPCRTracked: this.expiryPCR.size
        };
    }

    clearData() {
        this.oiSnapshots.clear();
        this.oiDeltaHistory.clear();
        this.buildupSignals.clear();
        this.pcrData.clear();
        this.pcrHistory.clear();
        this.expiryPCR.clear();
        this.stats.totalOITracked = 0;
        this.stats.buildupSignals = 0;
        this.stats.pcrUpdates = 0;
    }
}

module.exports = new OIIntelligenceService();
