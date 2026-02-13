const express = require('express');
const router = express.Router();
const signalService = require('../services/signal.service');
const candleService = require('../services/candle.service');
const instruments = require('../config/instruments.config');

router.get('/history', (req, res) => {
    const { token, limit } = req.query;
    
    let signals;
    if (token) {
        signals = signalService.getSignalHistory(token);
    } else {
        signals = signalService.getAllSignals();
    }

    if (limit) {
        signals = signals.slice(0, parseInt(limit));
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
    
    const watchlist = instruments.getWatchlist();
    const instrument = watchlist.find(i => i.symbol.toLowerCase() === symbol.toLowerCase());

    if (!instrument) {
        return res.status(404).json({
            success: false,
            error: `Instrument ${symbol} not found in watchlist`
        });
    }

    try {
        const [candles5m, candles15m, candlesDaily] = await Promise.all([
            candleService.getRecentCandles(instrument.token, instrument.exchange, 'FIVE_MINUTE', 100),
            candleService.getRecentCandles(instrument.token, instrument.exchange, 'FIFTEEN_MINUTE', 50),
            candleService.getDailyCandles(instrument.token, instrument.exchange, 20)
        ]);

        const result = await signalService.analyzeInstrument(
            instrument,
            candles5m,
            candles15m,
            candlesDaily
        );

        res.json({
            success: true,
            instrument,
            analysis: result,
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
