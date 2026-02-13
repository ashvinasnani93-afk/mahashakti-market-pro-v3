const express = require('express');
const router = express.Router();
const regimeService = require('../services/regime.service');
const candleService = require('../services/candle.service');
const indicatorService = require('../services/indicator.service');
const instruments = require('../config/instruments.config');

router.get('/current', (req, res) => {
    const regime = regimeService.getCurrentRegime();

    res.json({
        success: true,
        regime,
        timestamp: new Date().toISOString()
    });
});

router.get('/history', (req, res) => {
    const count = parseInt(req.query.count) || 50;
    const history = regimeService.getRegimeHistory(count);

    res.json({
        success: true,
        count: history.length,
        history,
        timestamp: new Date().toISOString()
    });
});

router.get('/volatility', (req, res) => {
    const count = parseInt(req.query.count) || 50;
    const history = regimeService.getVolatilityHistory(count);

    res.json({
        success: true,
        count: history.length,
        history,
        timestamp: new Date().toISOString()
    });
});

router.get('/trend', (req, res) => {
    const count = parseInt(req.query.count) || 50;
    const history = regimeService.getTrendHistory(count);

    res.json({
        success: true,
        count: history.length,
        history,
        timestamp: new Date().toISOString()
    });
});

router.get('/analyze/:symbol', async (req, res) => {
    const { symbol } = req.params;
    
    const instrument = instruments.getBySymbol(symbol.toUpperCase());

    if (!instrument) {
        return res.status(404).json({
            success: false,
            error: `Instrument ${symbol} not found`
        });
    }

    try {
        const candles = await candleService.getRecentCandles(
            instrument.token,
            instrument.exchange,
            'FIVE_MINUTE',
            100
        );

        const indicators = indicatorService.getFullIndicators(candles);
        const regime = regimeService.analyzeRegime(candles, indicators);

        res.json({
            success: true,
            instrument,
            regime,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
