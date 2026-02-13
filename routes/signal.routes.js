const express = require('express');
const router = express.Router();
const orchestratorService = require('../services/orchestrator.service');
const candleService = require('../services/candle.service');
const indicatorService = require('../services/indicator.service');
const instruments = require('../config/instruments.config');

router.get('/active', (req, res) => {
    const { type, direction, minStrength } = req.query;
    
    const signals = orchestratorService.getActiveSignals({
        type,
        direction,
        minStrength: minStrength ? parseInt(minStrength) : undefined
    });

    res.json({
        success: true,
        count: signals.length,
        signals,
        timestamp: new Date().toISOString()
    });
});

router.get('/history', (req, res) => {
    const { token, limit } = req.query;
    
    let signals;
    if (token) {
        signals = orchestratorService.getSignalHistory(token, parseInt(limit) || 50);
    } else {
        signals = orchestratorService.getAllSignalHistory(parseInt(limit) || 100);
    }

    res.json({
        success: true,
        count: signals.length,
        signals,
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
        const mtfCandles = await candleService.getMultiTimeframeCandles(
            instrument.token,
            instrument.exchange
        );

        const result = await orchestratorService.analyzeInstrument(
            instrument,
            mtfCandles.m5,
            mtfCandles.m15,
            mtfCandles.d1
        );

        res.json({
            success: true,
            instrument,
            signal: result.signal,
            analysis: result.analysis,
            candleCounts: {
                m5: mtfCandles.m5?.length || 0,
                m15: mtfCandles.m15?.length || 0,
                h1: mtfCandles.h1?.length || 0,
                d1: mtfCandles.d1?.length || 0
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/indicators/:symbol', async (req, res) => {
    const { symbol } = req.params;
    const { timeframe } = req.query;
    
    const instrument = instruments.getBySymbol(symbol.toUpperCase());

    if (!instrument) {
        return res.status(404).json({
            success: false,
            error: `Instrument ${symbol} not found`
        });
    }

    try {
        let candles;
        const interval = timeframe || 'FIVE_MINUTE';
        
        switch (interval) {
            case 'ONE_DAY':
                candles = await candleService.getDailyCandles(instrument.token, instrument.exchange, 60);
                break;
            case 'ONE_HOUR':
                candles = await candleService.getHourlyCandles(instrument.token, instrument.exchange, 30);
                break;
            default:
                candles = await candleService.getRecentCandles(instrument.token, instrument.exchange, interval, 100);
        }

        const indicators = indicatorService.getFullIndicators(candles);

        res.json({
            success: true,
            instrument,
            timeframe: interval,
            candleCount: candles?.length || 0,
            indicators,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/last-analysis/:token', (req, res) => {
    const { token } = req.params;
    const analysis = orchestratorService.getLastAnalysis(token);

    if (!analysis) {
        return res.status(404).json({
            success: false,
            error: 'No analysis found for this token'
        });
    }

    res.json({
        success: true,
        analysis,
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
