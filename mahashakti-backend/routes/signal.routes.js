// ==========================================
// SIGNAL ROUTES
// MAHASHAKTI MARKET PRO
// Exposes /api/signal endpoint
// ==========================================

const express = require("express");
const router = express.Router();

const { buildEngineData } = require("../services/marketFeed.service");
const { finalDecision } = require("../signalDecision.service");
const { getLtpData } = require("../services/angel/angelApi.service");

// ===============================
// POST /api/signal
// ===============================
router.post("/", async (req, res) => {
  try {
    const { symbol } = req.body;

    // Validate input
    if (!symbol) {
      return res.status(400).json({
        status: false,
        signal: "WAIT",
        reason: "Symbol is required",
      });
    }

    // STEP 1: Fetch LIVE market data from Angel
    const marketData = await getLtpData(symbol);

    if (!marketData) {
      return res.json({
        status: false,
        signal: "WAIT",
        reason: "Unable to fetch market data",
      });
    }

    // STEP 2: Build Engine Data
    const engineData = buildEngineData({
      symbol: symbol,
      ltp: marketData.ltp,
      open: marketData.open,
      high: marketData.high,
      low: marketData.low,
      volume: marketData.volume,
    });

    if (!engineData) {
      return res.json({
        status: false,
        signal: "WAIT",
        reason: "Engine data creation failed",
      });
    }

    // STEP 3: Run Decision Engine
    const result = finalDecision(engineData);

    // STEP 4: Send Response
    return res.json({
      status: true,
      symbol: symbol,
      signal: result.signal,
      confidence: result.confidence,
      reason: result.reason,
      analysis: result.analysis,
      notes: result.notes,
      timestamp: result.timestamp,
    });

  } catch (err) {
    console.error("❌ Signal Route Error:", err.message);

    return res.status(500).json({
      status: false,
      signal: "WAIT",
      error: "Signal route failed",
    });
  }
});

module.exports = router;
