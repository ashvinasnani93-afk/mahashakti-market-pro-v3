const express = require('express');
const router = express.Router();
const universeLoaderService = require('../services/universeLoader.service');
const systemMonitorService = require('../services/systemMonitor.service');

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

module.exports = router;
