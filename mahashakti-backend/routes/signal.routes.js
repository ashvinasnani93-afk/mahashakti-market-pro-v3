// ==========================================
// SIGNAL ROUTES
// API endpoints for signal generation
// ==========================================

const express = require("express");
const router = express.Router();

const { finalDecision } = require("../services/signalDecision.service");
const { scanSymbol } = require("../services/scanner.service");

// ==========================================
// GET /api/signal - Get signal for a symbol
// ==========================================
router.get("/", async (req, res) => {
  try {
    const { symbol } = req.query;

    if (!symbol) {
      return res.status(400).json({
        status: false,
        error: "Symbol required. Example: /api/signal?symbol=NIFTY"
      });
    }

    const result = await scanSymbol(symbol.toUpperCase());

    if (!result.success) {
      return res.status(400).json({
        status: false,
        error: result.error,
        symbol
      });
    }

    res.json({
      status: true,
      symbol: result.symbol,
      signal: result.signal,
      explosions: result.explosions,
      indicators: result.indicators,
      timestamp: result.timestamp
    });

  } catch (err) {
    res.status(500).json({
      status: false,
      error: err.message
    });
  }
});

// ==========================================
// POST /api/signal - Get signal from custom data
// ==========================================
router.post("/", (req, res) => {
  try {
    const data = req.body;

    if (!data || !data.close) {
      return res.status(400).json({
        status: false,
        error: "Request body with at least 'close' price required"
      });
    }

    const decision = finalDecision(data);

    res.json({
      status: true,
      ...decision
    });

  } catch (err) {
    res.status(500).json({
      status: false,
      error: err.message
    });
  }
});

// ==========================================
// GET /api/signal/test - Test signal engine
// ==========================================
router.get("/test", (req, res) => {
  const testData = {
    symbol: "TEST",
    close: 100,
    open: 99,
    high: 101,
    low: 98,
    prevClose: 98.5,
    ema20: 99.5,
    ema50: 98,
    rsi: 62,
    atr: 1.5,
    volume: 150000,
    avgVolume: 100000
  };

  const decision = finalDecision(testData);

  res.json({
    status: true,
    testData,
    decision
  });
});

module.exports = router;
