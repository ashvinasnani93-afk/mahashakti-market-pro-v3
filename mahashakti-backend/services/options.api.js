const express = require("express");
const router = express.Router();

// ==========================================
// OPTIONS API (PHASE-4 | STEP-2C FINAL)
// Single Entry Point for Options Module
// SAFETY → DECISION → UI RESPONSE
// NO EXECUTION | FRONTEND READY
// ==========================================

const { getOptionsContext } = require("./optionsMaster.service");
const { decideOptionTrade } = require("./options/optionDecision.service.js");

// ==========================================
// POST /options
// ==========================================
router.post("/options", async (req, res) => {
  try {
    const body = req.body;

    // -----------------------------
    // BASIC INPUT CHECK
    // -----------------------------
    if (!body || typeof body !== "object") {
      return res.json({
        status: false,
        message: "Invalid options input",
      });
    }

    if (!body.symbol || typeof body.spotPrice !== "number") {
      return res.json({
        status: false,
        message: "symbol and spotPrice required",
      });
    }

    // -----------------------------
    // STEP 1: OPTIONS MASTER CONTEXT
    // (Safety handled INSIDE master – single source)
    // -----------------------------
    const optionsContext = getOptionsContext({
      symbol: body.symbol,
      spotPrice: body.spotPrice,
      expiry: body.expiry,         // WEEKLY / MONTHLY
      tradeType: body.tradeType,  // INTRADAY / POSITIONAL
    });

    if (optionsContext.status !== "READY") {
      return res.json({
        status: true,
        context: optionsContext,
      });
    }

    // -----------------------------
    // STEP 2: FINAL OPTIONS DECISION
    // (UI + TEXT decided by engine)
    // -----------------------------
    const decision = decideOptionTrade({
      ...optionsContext,
      ema20: body.ema20,
      ema50: body.ema50,
      rsi: body.rsi,
      vix: body.vix,
    });

    // -----------------------------
    // FINAL API RESPONSE (FROZEN)
    // -----------------------------
    return res.json({
      status: true,
      context: optionsContext,
      decision, // ← UI signal comes from decision engine only
    });

  } catch (e) {
    console.error("❌ Options API Error:", e.message);

    return res.json({
      status: false,
      message: "Options processing error",
    });
  }
});

// ==========================================
// GET /options/chain
// OPTION CHAIN DATA FEED (UI ONLY)
// CONTEXT-ONLY | NO EXECUTION
// ==========================================
router.get("/chain", async (req, res) => {
  try {
    const { symbol, expiry } = req.query;

    if (!symbol || !expiry) {
      return res.json({
        status: false,
        message: "symbol and expiry required",
      });
    }

    // Pull context from master (same safety layer)
    const context = getOptionsContext({
      symbol,
      expiry,
      tradeType: "INTRADAY",
    });

    if (!context || !context.chain) {
      return res.json({
        status: true,
        symbol,
        expiry,
        chain: [],
      });
    }

    return res.json({
      status: true,
      symbol,
      expiry,
      chain: context.chain,
    });

  } catch (e) {
    console.error("❌ Option Chain Error:", e.message);

    return res.json({
      status: false,
      message: "Option chain load failed",
    });
  }
});

module.exports = router;
