// ==========================================
// LONG TERM EQUITY API (PHASE-L1 FINAL)
// Frontend Entry Point
// HOLD / PARTIAL EXIT / FULL EXIT (TEXT ONLY)
// ==========================================

const {
  decideLongTermAction,
} = require("./longTermDecision.service");

// ==========================================
// POST /equity/long-term
// ==========================================
function getLongTermEquity(req, res) {
  try {
    const body = req.body;

    // -----------------------------
    // BASIC INPUT CHECK
    // -----------------------------
    if (!body || typeof body !== "object") {
      return res.json({
        status: false,
        message: "Invalid long-term equity input",
      });
    }

    if (
      !body.symbol ||
      !body.weeklyTrend ||
      !body.monthlyTrend ||
      typeof body.entryPrice !== "number" ||
      typeof body.currentPrice !== "number"
    ) {
      return res.json({
        status: false,
        message:
          "symbol, weeklyTrend, monthlyTrend, entryPrice, currentPrice required",
      });
    }

    // -----------------------------
    // LONG TERM DECISION ENGINE
    // (SAFETY CONTEXT PASSED THROUGH)
    // -----------------------------
    const result = decideLongTermAction({
      symbol: body.symbol,
      weeklyTrend: body.weeklyTrend,     // UPTREND / DOWNTREND / SIDEWAYS
      monthlyTrend: body.monthlyTrend,   // UPTREND / DOWNTREND / SIDEWAYS
      entryPrice: body.entryPrice,
      currentPrice: body.currentPrice,

      // ---- OPTIONAL CONTEXT ----
      timeInTradeDays:
        typeof body.timeInTradeDays === "number"
          ? body.timeInTradeDays
          : null,

      intradaySignal: body.intradaySignal || null,
      isResultDay: body.isResultDay === true,
      isMarketCrash: body.isMarketCrash === true,
    });

   // -----------------------------
// SANITIZED LONG-TERM RESPONSE
// -----------------------------
return res.json({
  status: true,
  decision: {
    action: result.action,
    confidence: result.confidence || "LOW",
    note: result.note || "Long-term guidance",
  },
});
  } catch (e) {
    console.error("❌ Long Term Equity API Error:", e.message);

    return res.json({
      status: false,
      message: "Long-term equity processing error",
    });
  }
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  getLongTermEquity,
};
