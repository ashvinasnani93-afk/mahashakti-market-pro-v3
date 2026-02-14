const express = require('express');
const router = express.Router();
const universeLoaderService = require('../services/universeLoader.service');
const systemMonitorService = require('../services/systemMonitor.service');
const oiIntelligenceService = require('../services/oiIntelligence.service');
const crossMarketContextService = require('../services/crossMarketContext.service');
const safetyService = require('../services/safety.service');

// GET /api/system/universe - Get universe stats
router.get('/universe', (req, res) => {
    try {
        const stats = universeLoaderService.getStats();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/system/refresh-universe - Manual refresh
router.post('/refresh-universe', async (req, res) => {
    try {
        const stats = await universeLoaderService.manualRefresh();
        res.json({
            success: true,
            message: 'Universe refresh completed',
            data: stats
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/system/health - System health
router.get('/health', (req, res) => {
    try {
        const health = systemMonitorService.getHealth();
        const statusCode = health.status === 'CRITICAL' ? 503 : health.status === 'WARNING' ? 200 : 200;
        res.status(statusCode).json({
            success: true,
            data: health
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/system/instruments - List all instruments
router.get('/instruments', (req, res) => {
    try {
        const { type, sector, limit } = req.query;
        let instruments = universeLoaderService.getAll();

        if (type === 'equity') {
            instruments = universeLoaderService.getNSEEquity();
        } else if (type === 'fno') {
            instruments = universeLoaderService.getFNOStocks();
        } else if (type === 'options') {
            instruments = universeLoaderService.getIndexOptions();
        }

        if (sector) {
            instruments = instruments.filter(i => i.sector === sector.toUpperCase());
        }

        if (limit) {
            instruments = instruments.slice(0, parseInt(limit));
        }

        res.json({
            success: true,
            count: instruments.length,
            data: instruments
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔴 OI INTELLIGENCE ENDPOINTS

// GET /api/system/oi/stats - OI Intelligence stats
router.get('/oi/stats', (req, res) => {
    try {
        const stats = oiIntelligenceService.getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/system/oi/pcr - All PCR data
router.get('/oi/pcr', (req, res) => {
    try {
        const pcr = oiIntelligenceService.getAllPCR();
        res.json({ success: true, data: pcr });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/system/oi/pcr/:index - PCR for specific index
router.get('/oi/pcr/:index', (req, res) => {
    try {
        const { index } = req.params;
        const pcr = oiIntelligenceService.getPCR(index.toUpperCase());
        res.json({ success: true, index: index.toUpperCase(), data: pcr });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/system/oi/buildups - Top buildup signals
router.get('/oi/buildups', (req, res) => {
    try {
        const { type, count } = req.query;
        let signals;
        
        if (type === 'long') {
            signals = oiIntelligenceService.getLongBuildups(parseInt(count) || 10);
        } else if (type === 'short') {
            signals = oiIntelligenceService.getShortBuildups(parseInt(count) || 10);
        } else if (type === 'covering') {
            signals = oiIntelligenceService.getShortCoverings(parseInt(count) || 10);
        } else if (type === 'unwinding') {
            signals = oiIntelligenceService.getLongUnwindings(parseInt(count) || 10);
        } else {
            signals = oiIntelligenceService.getTopBuildupSignals(null, parseInt(count) || 20);
        }
        
        res.json({ success: true, count: signals.length, data: signals });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/system/oi/token/:token - OI intelligence for specific token
router.get('/oi/token/:token', (req, res) => {
    try {
        const { token } = req.params;
        const intelligence = oiIntelligenceService.getOIIntelligence(token);
        res.json({ success: true, token, data: intelligence });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔴 CROSS-MARKET CONTEXT ENDPOINTS

// GET /api/system/context - Full market context
router.get('/context', (req, res) => {
    try {
        const context = crossMarketContextService.getMarketContext();
        res.json({ success: true, data: context });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/system/context/indices - Index data
router.get('/context/indices', (req, res) => {
    try {
        const indices = crossMarketContextService.getAllIndexData();
        res.json({ success: true, data: indices });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/system/context/sectors - Sector ranking
router.get('/context/sectors', (req, res) => {
    try {
        const sectors = crossMarketContextService.getSectorRanking();
        res.json({ success: true, count: sectors.length, data: sectors });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/system/context/sectors/top - Top performing sectors
router.get('/context/sectors/top', (req, res) => {
    try {
        const { count } = req.query;
        const sectors = crossMarketContextService.getTopSectors(parseInt(count) || 5);
        res.json({ success: true, data: sectors });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/system/context/sectors/bottom - Bottom performing sectors
router.get('/context/sectors/bottom', (req, res) => {
    try {
        const { count } = req.query;
        const sectors = crossMarketContextService.getBottomSectors(parseInt(count) || 5);
        res.json({ success: true, data: sectors });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔴 VIX ENDPOINT

// GET /api/system/vix - VIX data
router.get('/vix', (req, res) => {
    try {
        const vix = safetyService.getVIXData();
        res.json({ success: true, data: vix });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/system/vix/set - Set VIX manually (for testing)
router.post('/vix/set', (req, res) => {
    try {
        const { vix } = req.body;
        if (vix === undefined || isNaN(vix)) {
            return res.status(400).json({ success: false, error: 'Valid VIX value required' });
        }
        safetyService.setVIX(parseFloat(vix));
        const vixData = safetyService.getVIXData();
        res.json({ success: true, message: 'VIX updated', data: vixData });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔴 INDEX OPTIONS ENDPOINTS

// GET /api/system/options/:index - Get ATM options for index
router.get('/options/:index', (req, res) => {
    try {
        const { index } = req.params;
        const { spot, vix, window } = req.query;
        
        const spotPrice = parseFloat(spot) || getDefaultSpot(index);
        const vixLevel = parseFloat(vix) || safetyService.currentVix;
        const windowOverride = window ? parseInt(window) : null;
        
        const options = universeLoaderService.getATMOptions(
            index.toUpperCase(), 
            spotPrice, 
            vixLevel, 
            windowOverride
        );
        
        res.json({
            success: true,
            index: index.toUpperCase(),
            spotPrice,
            vixLevel,
            atmWindow: windowOverride || 20,
            count: options.length,
            data: options.slice(0, 100) // Limit response
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/system/expiries - Get expiry information
router.get('/expiries', (req, res) => {
    try {
        const expiries = universeLoaderService.getExpiries();
        res.json({ success: true, data: expiries });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

function getDefaultSpot(index) {
    const defaults = {
        'NIFTY': 22000,
        'BANKNIFTY': 47000,
        'FINNIFTY': 21000,
        'MIDCPNIFTY': 10000,
        'SENSEX': 72000
    };
    return defaults[index.toUpperCase()] || 20000;
}

module.exports = router;
