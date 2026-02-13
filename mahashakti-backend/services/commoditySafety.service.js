// ==================================================
// COMMODITY SAFETY SERVICE (PHASE-C2)
// Capital Protection Layer
// NO BUY / SELL DECISION
// ==================================================

/**
 * getCommoditySafetyContext
 * @param {object} data
 * @returns {object}
 *
 * Used BEFORE commodity decision logic
 * Safety only – no signal generation
 */
function getCommoditySafetyContext(data = {}) {
  const {
    isEventDay = false,     // RBI, OPEC, inventory, war news
    isSpikeCandle = false, // abnormal candle / sudden move
    volatility = "NORMAL", // LOW / NORMAL / HIGH
  } = data;

  // -----------------------------
  // EVENT DAY BLOCK
  // -----------------------------
  if (isEventDay) {
    return {
      status: "UNSAFE",
      riskLevel: "HIGH",
      reason: "Commodity safety: event day risk",
    };
  }

  // -----------------------------
  // SPIKE PROTECTION
  // -----------------------------
  if (isSpikeCandle) {
    return {
      status: "UNSAFE",
      riskLevel: "HIGH",
      reason: "Commodity safety: abnormal price spike detected",
    };
  }

  // -----------------------------
  // HIGH VOLATILITY BLOCK
  // -----------------------------
  if (volatility === "HIGH") {
    return {
      status: "UNSAFE",
      riskLevel: "HIGH",
      reason: "Commodity safety: extreme volatility",
    };
  }

  // -----------------------------
  // SAFE PASS
  // -----------------------------
  return {
    status: "SAFE",
    riskLevel: "NORMAL",
    note: "Commodity safety check passed",
  };
}

// ==================================================
// EXPORT
// ==================================================
module.exports = {
  getCommoditySafetyContext,
};
