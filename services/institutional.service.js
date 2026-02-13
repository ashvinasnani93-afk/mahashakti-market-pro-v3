const settings = require('../config/settings.config');

class InstitutionalService {
    constructor() {
        this.oiData = new Map();
        this.oiHistory = new Map();
        this.pcrHistory = [];
        this.sectorStrength = new Map();
        this.breadthData = {
            advancing: 0,
            declining: 0,
            unchanged: 0,
            advanceDeclineRatio: 1,
            timestamp: null
        };
    }

    updateOI(token, currentOI, previousOI = null) {
        const existing = this.oiData.get(token);
        
        if (!existing && previousOI === null) {
            this.oiData.set(token, {
                current: currentOI,
                previous: currentOI,
                change: 0,
                changePercent: 0,
                history: [{ oi: currentOI, timestamp: Date.now() }],
                lastUpdate: Date.now()
            });
            return;
        }

        const prev = previousOI !== null ? previousOI : (existing?.current || currentOI);
        const change = currentOI - prev;
        const changePercent = prev > 0 ? (change / prev) * 100 : 0;

        const history = existing?.history || [];
        history.push({ oi: currentOI, timestamp: Date.now() });
        
        if (history.length > 100) {
            history.shift();
        }

        this.oiData.set(token, {
            current: currentOI,
            previous: prev,
            change,
            changePercent,
            history,
            lastUpdate: Date.now()
        });

        const tokenHistory = this.oiHistory.get(token) || [];
        tokenHistory.push({
            oi: currentOI,
            change,
            changePercent,
            timestamp: Date.now()
        });
        
        if (tokenHistory.length > 500) {
            tokenHistory.shift();
        }
        this.oiHistory.set(token, tokenHistory);
    }

    getOIData(token) {
        return this.oiData.get(token) || null;
    }

    getOIDelta(token, periodsBack = 1) {
        const data = this.oiData.get(token);
        if (!data || !data.history || data.history.length < periodsBack + 1) {
            return null;
        }

        const current = data.history[data.history.length - 1];
        const previous = data.history[data.history.length - 1 - periodsBack];

        const delta = current.oi - previous.oi;
        const deltaPercent = previous.oi > 0 ? (delta / previous.oi) * 100 : 0;

        return {
            delta,
            deltaPercent,
            current: current.oi,
            previous: previous.oi,
            periodMs: current.timestamp - previous.timestamp
        };
    }

    analyzeOIPriceRelation(token, priceChange, priceChangePercent) {
        const oiData = this.oiData.get(token);
        if (!oiData) return null;

        const oiChange = oiData.changePercent;
        const threshold = settings.institutional.oiChangeThreshold;

        let interpretation = 'NEUTRAL';
        let strength = 'WEAK';

        if (oiChange > threshold && priceChangePercent > 0) {
            interpretation = 'LONG_BUILDUP';
            strength = oiChange > threshold * 2 ? 'STRONG' : 'MODERATE';
        } else if (oiChange > threshold && priceChangePercent < 0) {
            interpretation = 'SHORT_BUILDUP';
            strength = oiChange > threshold * 2 ? 'STRONG' : 'MODERATE';
        } else if (oiChange < -threshold && priceChangePercent > 0) {
            interpretation = 'SHORT_COVERING';
            strength = oiChange < -threshold * 2 ? 'STRONG' : 'MODERATE';
        } else if (oiChange < -threshold && priceChangePercent < 0) {
            interpretation = 'LONG_UNWINDING';
            strength = oiChange < -threshold * 2 ? 'STRONG' : 'MODERATE';
        }

        return {
            interpretation,
            strength,
            oiChange,
            priceChange: priceChangePercent,
            bullish: interpretation === 'LONG_BUILDUP' || interpretation === 'SHORT_COVERING',
            bearish: interpretation === 'SHORT_BUILDUP' || interpretation === 'LONG_UNWINDING'
        };
    }

    updatePCR(callOI, putOI) {
        const pcr = callOI > 0 ? putOI / callOI : 1;
        
        this.pcrHistory.push({
            pcr,
            callOI,
            putOI,
            timestamp: Date.now()
        });

        if (this.pcrHistory.length > 500) {
            this.pcrHistory.shift();
        }

        return pcr;
    }

    getPCRAnalysis() {
        if (this.pcrHistory.length === 0) {
            return { pcr: 1, sentiment: 'NEUTRAL', trend: 'FLAT' };
        }

        const latest = this.pcrHistory[this.pcrHistory.length - 1];
        const config = settings.institutional;

        let sentiment = 'NEUTRAL';
        if (latest.pcr > config.pcrBearish) {
            sentiment = 'BEARISH';
        } else if (latest.pcr < config.pcrBullish) {
            sentiment = 'BULLISH';
        }

        let trend = 'FLAT';
        if (this.pcrHistory.length >= 5) {
            const recent = this.pcrHistory.slice(-5);
            const avgRecent = recent.reduce((a, b) => a + b.pcr, 0) / recent.length;
            const older = this.pcrHistory.slice(-10, -5);
            
            if (older.length >= 5) {
                const avgOlder = older.reduce((a, b) => a + b.pcr, 0) / older.length;
                if (avgRecent > avgOlder * 1.1) {
                    trend = 'RISING';
                } else if (avgRecent < avgOlder * 0.9) {
                    trend = 'FALLING';
                }
            }
        }

        return {
            pcr: latest.pcr,
            callOI: latest.callOI,
            putOI: latest.putOI,
            sentiment,
            trend,
            history: this.pcrHistory.slice(-20)
        };
    }

    updateBreadth(advancing, declining, unchanged = 0) {
        this.breadthData = {
            advancing,
            declining,
            unchanged,
            advanceDeclineRatio: declining > 0 ? advancing / declining : advancing,
            advanceDeclineLine: advancing - declining,
            percentAdvancing: (advancing / (advancing + declining + unchanged)) * 100,
            percentDeclining: (declining / (advancing + declining + unchanged)) * 100,
            timestamp: Date.now()
        };
    }

    getBreadthAnalysis() {
        const config = settings.institutional;
        const data = this.breadthData;

        let sentiment = 'NEUTRAL';
        if (data.percentAdvancing > config.breadthBullish) {
            sentiment = 'BULLISH';
        } else if (data.percentDeclining > (100 - config.breadthBearish)) {
            sentiment = 'BEARISH';
        }

        return {
            ...data,
            sentiment,
            strength: Math.abs(data.advanceDeclineLine) > 20 ? 'STRONG' : 'WEAK'
        };
    }

    updateSectorStrength(sector, data) {
        const existing = this.sectorStrength.get(sector) || { history: [] };
        
        existing.current = data;
        existing.history.push({ ...data, timestamp: Date.now() });
        
        if (existing.history.length > 100) {
            existing.history.shift();
        }

        this.sectorStrength.set(sector, existing);
    }

    getSectorRotation() {
        const sectors = [];
        
        this.sectorStrength.forEach((data, sector) => {
            if (data.current) {
                sectors.push({
                    sector,
                    ...data.current,
                    momentum: this.calculateSectorMomentum(data.history)
                });
            }
        });

        sectors.sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));

        return {
            leaders: sectors.slice(0, 3),
            laggards: sectors.slice(-3).reverse(),
            all: sectors
        };
    }

    calculateSectorMomentum(history) {
        if (!history || history.length < 5) return 0;

        const recent = history.slice(-5);
        const changes = recent.map(h => h.changePercent || 0);
        return changes.reduce((a, b) => a + b, 0) / changes.length;
    }

    getInstitutionalSummary() {
        return {
            pcr: this.getPCRAnalysis(),
            breadth: this.getBreadthAnalysis(),
            sectorRotation: this.getSectorRotation(),
            oiDataCount: this.oiData.size,
            timestamp: Date.now()
        };
    }

    clearData() {
        this.oiData.clear();
        this.oiHistory.clear();
        this.pcrHistory = [];
        this.sectorStrength.clear();
        this.breadthData = {
            advancing: 0,
            declining: 0,
            unchanged: 0,
            advanceDeclineRatio: 1,
            timestamp: null
        };
    }
}

module.exports = new InstitutionalService();
