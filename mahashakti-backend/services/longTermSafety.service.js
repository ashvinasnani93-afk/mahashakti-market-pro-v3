// ==================================================
// LONG TERM EQUITY SAFETY SERVICE (PHASE-L1)
// Capital Protection & Conflict Layer
// NO BUY / SELL DECISION
// ==================================================

/**
 * getLongTermSafetyContext
 * @param {object} data
 * @returns {object}
 *
 * Used BEFORE long-term decision logic
 */
function getLongTermSafetyContext(data = {}) {
  const {
    isMarketCrash = false,     // extreme fall / panic
    isResultDay = false,       // budget, results, events
    intradaySignal = null,     // BUY / SELL / WAIT
  } = data;

  // -----------------------------
  // HARD BLOCK – MARKET CRASH
  // -----------------------------
  if (isMarketCrash) {
    return {
      status: "UNSAFE",
      action: "HOLD",
      reason: "Market crash risk – capital protection mode",
    };
  }

  // -----------------------------
  // SOFT WARNING – RESULT / EVENT
  // -----------------------------
  if (isResultDay) {
    return {
      status: "CAUTION",
      action: "HOLD",
      reason: "Event / result day – avoid emotional decisions",
    };
  }

  // -----------------------------
  // INTRADAY vs LONG-TERM CONFLICT
  // -----------------------------
  if (intradaySignal === "SELL") {
    return {
      status: "CONFLICT",
      action: "HOLD",
      reason:
        "Intraday SELL detected – long-term position not forced to exit",
    };
  }

  // -----------------------------
  // SAFE PASS
  // -----------------------------
  return {
    status: "SAFE",
    note: "Long-term safety check passed",
  };
}

// ==================================================
// EXPORT
// ==================================================
module.exports = {
  getLongTermSafetyContext,
};
