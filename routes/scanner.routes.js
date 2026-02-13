const express = require('express');
const router = express.Router();
const scannerService = require('../services/scanner.service');
const explosionService = require('../services/explosion.service');
const instruments = require('../config/instruments.config');

router.get('/results', (req, res) => {
    const { type, minStrength } = req.query;
    
    const signals = scannerService.getSignals({
        type,
        minStrength: minStrength ? parseInt(minStrength) : undefined
    });

    res.json({
        success: true,
        count: signals.length,
        signals,
        timestamp: new Date().toISOString()
    });
});

router.get('/explosions', (req, res) => {
    const minutes = parseInt(req.query.minutes) || 30;
    const explosions = scannerService.getExplosions(minutes);

    res.json({
        success: true,
        count: explosions.length,
        explosions,
        timestamp: new Date().toISOString()
    });
});

router.get('/instrument/:token', (req, res) => {
    const { token } = req.params;
    const result = scannerService.getScanResult(token);

    if (!result) {
        return res.status(404).json({
            success: false,
            error: 'Instrument not found or not scanned'
        });
    }

    res.json({
        success: true,
        result,
        timestamp: new Date().toISOString()
    });
});

router.get('/all', (req, res) => {
    const results = scannerService.getAllResults();

    res.json({
        success: true,
        count: results.length,
        results,
        timestamp: new Date().toISOString()
    });
});

router.get('/watchlist', (req, res) => {
    const watchlist = instruments.getWatchlist();

    res.json({
        success: true,
        count: watchlist.length,
        instruments: watchlist
    });
});

router.post('/start', async (req, res) => {
    try {
        await scannerService.start();
        res.json({
            success: true,
            message: 'Scanner started',
            status: scannerService.getStatus()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/stop', (req, res) => {
    scannerService.stop();
    res.json({
        success: true,
        message: 'Scanner stopped',
        status: scannerService.getStatus()
    });
});

module.exports = router;
