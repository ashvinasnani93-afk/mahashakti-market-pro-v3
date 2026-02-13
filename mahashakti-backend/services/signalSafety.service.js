// ==========================================
// SIGNAL SAFETY SERVICE – FINAL (SOFT + SAFE)
// MAHASHAKTI MARKET PRO
// ==========================================

/**
 * applySafety
 * ROLE:
 * ❌ Do NOT kill BUY / SELL
 * ✅ Add risk warnings only
 */
function applySafety(signalResult, context = {}) {

  // -------------------------------
  // BASIC VALIDATION
  // -------------------------------
  if (!signalResult || !signalResult.signal) {
    return { signal: "WAIT" };
  }

  let finalSignal = signalResult.signal;
  let warnings = [];

  const {
    isResultDay = false,
    isExpiryDay = false,
    tradeCountToday = 0,
    tradeType = "INTRADAY",
    vix = null,
  } = context;

  // -------------------------------
  // RESULT DAY (SOFT)
  // -------------------------------
  if (isResultDay && finalSignal !== "WAIT") {
    warnings.push("⚠️ Result day volatility – use strict SL");
  }

  // -------------------------------
  // EXPIRY DAY (SOFT)
  // -------------------------------
  if (isExpiryDay && finalSignal !== "WAIT") {
    warnings.push("⚠️ Expiry day – quick targets only");
  }

  // -------------------------------
  // OVERTRADE GUARD (SOFT)
  // -------------------------------
  if (tradeCountToday >= 3 && finalSignal !== "WAIT") {
    warnings.push("⚠️ Overtrading risk – avoid revenge trades");
  }

  // -------------------------------
  // EQUITY SELL SAFETY (SOFT)
  // -------------------------------
  if (tradeType === "EQUITY" && finalSignal === "SELL") {
    warnings.push("ℹ️ Equity SELL – confirm higher timeframe");
  }

  // -------------------------------
  // VIX CONTEXT (TEXT ONLY)
  // -------------------------------
  if (typeof vix === "number" && vix >= 20) {
    warnings.push("⚠️ High VIX – reduce position size");
  }

  // -------------------------------
  // FINAL SAFE OUTPUT
  // -------------------------------
  return {
    signal: finalSignal,
    warnings,        // UI / chat me dikha sakte ho
  };
}

module.exports = {
  applySafety,
};
