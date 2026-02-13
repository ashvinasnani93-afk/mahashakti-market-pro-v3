// ==========================================
// SCANNER ROUTES
// API endpoints for market scanning
// ==========================================

const express = require("express");
const router = express.Router();

const {
  runFullScan,
  getScanResults,
  getUniversalSignals,
  getExplosionSignals,
  scanSymbol,
  scanIndices,
  scanFnOStocks
} = require("../services/scanner.service");

// ==========================================
// GET /api/scanner/results - All scan results
// ==========================================
router.get("/results", (req, res) => {
  const results = getScanResults();

  res.json({
    status: true,
    screen1: {
      name: "Universal Signals",
      description: "STRONG_BUY, BUY, STRONG_SELL, SELL only",
      signals: results.screen1,
      count: results.screen1?.length || 0
    },
    screen2: {
      name: "Explosion Signals",
      description: "EARLY_EXPANSION, HIGH_MOMENTUM_RUNNER, OPTION_ACCELERATION, SWING_CONTINUATION",
      signals: results.screen2,
      count: results.screen2?.length || 0
    },
    meta: {
      lastScanTime: results.lastScanTime,
      scanDuration: results.scanDuration,
      indicesScanned: results.indicesScanned,
      stocksScanned: results.stocksScanned
    }
  });
});

// ==========================================
// GET /api/scanner/universal - Screen 1 signals
// ==========================================
router.get("/universal", (req, res) => {
  const signals = getUniversalSignals();

  res.json({
    status: true,
    screenType: "SCREEN_1_UNIVERSAL",
    ...signals
  });
});

// ==========================================
// GET /api/scanner/explosions - Screen 2 signals
// ==========================================
router.get("/explosions", (req, res) => {
  const signals = getExplosionSignals();

  res.json({
    status: true,
    screenType: "SCREEN_2_EXPLOSION",
    ...signals
  });
});

// ==========================================
// POST /api/scanner/run - Trigger manual scan
// ==========================================
router.post("/run", async (req, res) => {
  try {
    console.log("[SCANNER] Manual scan triggered...");
    
    const results = await runFullScan();

    res.json({
      status: true,
      message: "Scan completed",
      results: {
        universalSignals: results.screen1?.length || 0,
        explosionSignals: results.screen2?.length || 0,
        duration: results.scanDuration
      }
    });

  } catch (err) {
    res.status(500).json({
      status: false,
      error: err.message
    });
  }
});

// ==========================================
// GET /api/scanner/symbol/:symbol - Scan single symbol
// ==========================================
router.get("/symbol/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;

    if (!symbol) {
      return res.status(400).json({
        status: false,
        error: "Symbol required"
      });
    }

    const result = await scanSymbol(symbol.toUpperCase());

    res.json({
      status: result.success,
      ...result
    });

  } catch (err) {
    res.status(500).json({
      status: false,
      error: err.message
    });
  }
});

// ==========================================
// GET /api/scanner/indices - Scan all indices
// ==========================================
router.get("/indices", async (req, res) => {
  try {
    const results = await scanIndices();

    res.json({
      status: true,
      indices: results,
      count: results.length
    });

  } catch (err) {
    res.status(500).json({
      status: false,
      error: err.message
    });
  }
});

// ==========================================
// GET /api/scanner/fno - Scan F&O stocks
// ==========================================
router.get("/fno", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const results = await scanFnOStocks(limit);

    res.json({
      status: true,
      stocks: results,
      count: results.length,
      limit
    });

  } catch (err) {
    res.status(500).json({
      status: false,
      error: err.message
    });
  }
});

// ==========================================
// GET /api/scanner/strong-buy - Only STRONG_BUY signals
// ==========================================
router.get("/strong-buy", (req, res) => {
  const results = getScanResults();
  const strongBuys = results.screen1?.filter(s => s.signal === "STRONG_BUY") || [];

  res.json({
    status: true,
    signal: "STRONG_BUY",
    signals: strongBuys,
    count: strongBuys.length,
    lastScan: results.lastScanTime
  });
});

// ==========================================
// GET /api/scanner/strong-sell - Only STRONG_SELL signals
// ==========================================
router.get("/strong-sell", (req, res) => {
  const results = getScanResults();
  const strongSells = results.screen1?.filter(s => s.signal === "STRONG_SELL") || [];

  res.json({
    status: true,
    signal: "STRONG_SELL",
    signals: strongSells,
    count: strongSells.length,
    lastScan: results.lastScanTime
  });
});

module.exports = router;
