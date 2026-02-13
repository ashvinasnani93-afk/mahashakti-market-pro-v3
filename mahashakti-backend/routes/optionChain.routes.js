// ==========================================
// OPTION CHAIN ROUTES - FIXED
// Real Angel One Option Chains
// SUPPORTS: INDEX | STOCKS | COMMODITIES
// ==========================================

const express = require("express");
const router = express.Router();

// PATH FIXED HERE
const { buildOptionChainFromAngel } = require("../optionchain.service");

/**
 * GET /api/option-chain?symbol=NIFTY
 * GET /api/option-chain?symbol=BANKNIFTY&expiry=2026-02-05
 * GET /api/option-chain?symbol=RELIANCE
 * GET /api/option-chain?symbol=GOLD (Commodity)
 * GET /api/option-chain?symbol=CRUDEOIL (Commodity)
 */
router.get("/", async (req, res) => {
  try {
    const { symbol, expiry } = req.query;

    if (!symbol) {
      return res.json({
        status: false,
        message: "symbol parameter required",
        examples: [
          "NIFTY - Index option chain",
          "BANKNIFTY - Index option chain",
          "RELIANCE - Stock option chain",
          "GOLD - Commodity option chain",
          "CRUDEOIL - Commodity option chain"
        ]
      });
    }

    const upperSymbol = symbol.toUpperCase();

    console.log(`📊 Building option chain for ${upperSymbol}`);

    const chain = await buildOptionChainFromAngel(upperSymbol, expiry);

    if (!chain || !chain.status) {
      return res.json({
        status: false,
        message: chain?.message || "Failed to build option chain",
        symbol: upperSymbol,
        hint: "Make sure Angel One login is successful and symbol has options available"
      });
    }

    return res.json({
      status: true,
      symbol: upperSymbol,
      type: chain.type,
      expiry: chain.expiry,
      availableExpiries: chain.availableExpiries,
      spot: chain.spot,
      atmStrike: chain.atmStrike,
      totalStrikes: chain.totalStrikes,
      chain: chain.chain,
      timestamp: Date.now(),
      note: "Option chain is context-only. No execution or recommendation."
    });

  } catch (err) {
    console.error("❌ Option Chain Route Error:", err.message);
    return res.status(500).json({
      status: false,
      message: "Option chain generation failed",
      error: err.message
    });
  }
});

module.exports = router;
