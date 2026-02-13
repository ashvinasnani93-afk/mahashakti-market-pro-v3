const express = require('express');
const router = express.Router();
const scannerService = require('../services/scanner.service');
const explosionService = require('../services/explosion.service');
const rankingService = require('../services/ranking.service');
const instruments = require('../config/instruments.config');

router.get('/results', (req, res) => {
    const { type, direction, minStrength, sector } = req.query;
    
    const signals = scannerService.getSignals({
        type,
        direction,
        minStrength: minStrength ? parseInt(minStrength) : undefined,
        sector
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
    const severity = req.query.severity;
    
    let explosions = scannerService.getExplosions(minutes);
    
    if (severity) {
        explosions = explosions.filter(e => e.severity === severity);
    }

    res.json({
        success: true,
        count: explosions.length,
        explosions,
        stats: explosionService.getStats(),
        timestamp: new Date().toISOString()
    });
});

router.get('/rankings', (req, res) => {
    const count = parseInt(req.query.count) || 10;
    const category = req.query.category;
    
    let rankings;
    if (category) {
        rankings = rankingService.getTopByCategory(category, count);
    } else {
        rankings = scannerService.getRankings(count);
    }

    res.json({
        success: true,
        count: rankings.length,
        rankings,
        movers: rankingService.getMoversSummary(),
        timestamp: new Date().toISOString()
    });
});

router.get('/rankings/bullish', (req, res) => {
    const count = parseInt(req.query.count) || 10;
    const rankings = rankingService.getTopBullish(count);

    res.json({
        success: true,
        count: rankings.length,
        rankings,
        timestamp: new Date().toISOString()
    });
});

router.get('/rankings/bearish', (req, res) => {
    const count = parseInt(req.query.count) || 10;
    const rankings = rankingService.getTopBearish(count);

    res.json({
        success: true,
        count: rankings.length,
        rankings,
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
        results: results.map(r => ({
            symbol: r.instrument.symbol,
            token: r.instrument.token,
            price: r.indicators?.price,
            signal: r.signal?.signal,
            strength: r.signal?.strength
        })),
        timestamp: new Date().toISOString()
    });
});

router.get('/watchlist', (req, res) => {
    const type = req.query.type;
    
    let list;
    switch (type) {
        case 'indices':
            list = instruments.getIndices();
            break;
        case 'fno':
            list = instruments.getFNOStocks();
            break;
        case 'commodities':
            list = instruments.getCommodities();
            break;
        default:
            list = instruments.getAll();
    }

    res.json({
        success: true,
        count: list.length,
        instruments: list
    });
});

router.get('/institutional', (req, res) => {
    const summary = scannerService.getInstitutionalSummary();

    res.json({
        success: true,
        data: summary,
        timestamp: new Date().toISOString()
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
