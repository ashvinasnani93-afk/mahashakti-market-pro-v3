// ==========================================
// BATCH SIGNALS API
// Get signals for multiple stocks at once
// Real Angel One Data - NO DUMMY
// ==========================================

const express = require("express");
const router = express.Router();

// Import signal engine
const { finalDecision } = require("../signalDecision.service");

// ==========================================
// POST /signals/batch
// Body: { symbols: ["RELIANCE", "TCS", "INFY"] }
// ==========================================
router.post("/batch", async (req, res) => {
  try {
    const { symbols } = req.body;

    // Validate input
    if (!Array.isArray(symbols)) {
      return res.json({
        status: false,
        message: "symbols array required",
      });
    }

    if (symbols.length === 0) {
      return res.json({
        status: false,
        message: "symbols array is empty",
      });
    }

    // Limit batch size
    if (symbols.length > 50) {
      return res.json({
        status: false,
        message: "Maximum 50 symbols allowed per batch",
      });
    }

    console.log(`📊 Batch Signal Request for ${symbols.length} symbols`);

    const results = [];

    // Process each symbol
    for (const symbol of symbols) {
      try {
        const upperSymbol = symbol.toUpperCase();

        // Subscribe to symbol for live data
        if (global.subscribeSymbol) {
          global.subscribeSymbol(upperSymbol);
        }

        // Get stock data
        const ltp = getStockLTP(upperSymbol);

        if (!ltp || ltp === 0) {
          results.push({
            symbol: upperSymbol,
            signal: "WAIT",
            display: "🟡 WAIT",
            emoji: "🟡",
            color: "WAIT",
            ltp: null,
            momentumActive: false,
            reason: "LTP not available",
          });
          continue;
        }

        // Prepare signal data
        const signalData = {
          symbol: upperSymbol,
          close: ltp,
          tradeType: "INTRADAY",
        };

        // Get signal
        const signal = finalDecision(signalData);

        results.push({
          symbol: upperSymbol,
          signal: signal?.signal || "WAIT",
          display: signal?.display || "🟡 WAIT",
          emoji: signal?.emoji || "🟡",
          color: signal?.color || "WAIT",
          ltp: Number(ltp.toFixed(2)),
          momentumActive: signal?.momentumActive || false,
          preBreakout: signal?.preBreakout || null,
          volumeBuildup: signal?.volumeBuildup || null,
        });
      } catch (err) {
        console.error(`Error processing ${symbol}:`, err.message);
        results.push({
          symbol: symbol.toUpperCase(),
          signal: "WAIT",
          display: "🟡 WAIT",
          emoji: "🟡",
          color: "WAIT",
          ltp: null,
          momentumActive: false,
          reason: "Processing error",
        });
      }
    }

    console.log(`✅ Batch signal processing complete: ${results.length} results`);

    return res.json({
      status: true,
      count: results.length,
      signals: results,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("❌ Batch Signals Error:", error.message);
    return res.json({
      status: false,
      message: "Batch signal processing failed",
    });
  }
});

// ==========================================
// HELPER: Get Stock LTP
// ==========================================
function getStockLTP(symbol) {
  // Access global latestLTP from server.js
  if (global.latestLTP && global.latestLTP[symbol]) {
    return global.latestLTP[symbol];
  }

  return null;
}

// ==========================================
// EXPORT
// ==========================================
module.exports = router;
