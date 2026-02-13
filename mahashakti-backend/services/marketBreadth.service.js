// ==================================================
// MARKET BREADTH SERVICE (FINAL – LOCKED)
// Advance / Decline based market strength
// No BUY / SELL – context only
// ==================================================

/**
 * analyzeMarketBreadth
 * @param {object} data
 * @returns {object}
 *
 * Required:
 * - advances (number)  // stocks up
 * - declines (number)  // stocks down
 */
function analyzeMarketBreadth(data = {}) {
  const {
    advances,
    declines,
  } = data;

  // -----------------------------
  // HARD VALIDATION
  // -----------------------------
  if (
    typeof advances !== "number" ||
    typeof declines !== "number"
  ) {
    return {
      status: "UNKNOWN",
      strength: "UNKNOWN",
      reason: "Invalid breadth input",
    };
  }

  const total = advances + declines;

  if (total === 0) {
    return {
      status: "UNKNOWN",
      strength: "UNKNOWN",
      reason: "No breadth data available",
    };
  }

  // -----------------------------
  // BREADTH RATIO
  // -----------------------------
  const ratio = advances / total;

  // -----------------------------
  // STRONG MARKET
  // -----------------------------
  if (ratio >= 0.65) {
    return {
      status: "STRONG",
      strength: "BULLISH",
      reason:
        "Broad participation: majority stocks advancing",
      breadthRatio: Number(ratio.toFixed(2)),
    };
  }

  // -----------------------------
  // WEAK MARKET
  // -----------------------------
  if (ratio <= 0.35) {
    return {
      status: "WEAK",
      strength: "BEARISH",
      reason:
        "Broad selling: majority stocks declining",
      breadthRatio: Number(ratio.toFixed(2)),
    };
  }

  // -----------------------------
  // NEUTRAL / MIXED
  // -----------------------------
  return {
    status: "NEUTRAL",
    strength: "SIDEWAYS",
    reason:
      "Mixed advance-decline – market lacks conviction",
    breadthRatio: Number(ratio.toFixed(2)),
  };
}

// ==================================================
// EXPORT
// ==================================================
module.exports = {
  analyzeMarketBreadth,
};
