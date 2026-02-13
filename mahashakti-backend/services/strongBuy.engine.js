// ==================================================
// STRONG BUY / STRONG SELL ENGINE (FINAL – LOCKED)
// Rare + High Conviction Signals Only
// Used by Market Opportunity Board
// ==================================================

/**
 * generateStrongSignal
 * @param {object} data
 * @returns {object}
 *
 * REQUIRED INPUT:
 * - structure        (UP / DOWN)
 * - trend            (UPTREND / DOWNTREND)
 * - emaAlignment     (BULLISH / BEARISH)
 * - priceAction      (STRONG_BULL / STRONG_BEAR / WEAK)
 * - volumeConfirm    (true / false)
 * - breakoutQuality  (REAL / FAKE / NONE)
 * - marketBreadth    (BULLISH / BEARISH / SIDEWAYS)
 * - vixLevel         (LOW / NORMAL / HIGH)
 * - isResultDay      (boolean)
 * - isExpiryDay      (boolean)
 */

function generateStrongSignal(data = {}) {
  const {
    structure,
    trend,
    emaAlignment,
    priceAction,
    volumeConfirm,
    breakoutQuality,
    marketBreadth,
    vixLevel,
    isResultDay = false,
    isExpiryDay = false,
  } = data;

  // --------------------------------------------------
  // HARD SAFETY BLOCKS
  // --------------------------------------------------
  if (isResultDay || isExpiryDay) {
    return {
      status: "WAIT",
      signal: "NO_STRONG_SIGNAL",
      reason: "Result / Expiry day – strong signals blocked",
    };
  }

  if (vixLevel === "HIGH") {
    return {
      status: "WAIT",
      signal: "NO_STRONG_SIGNAL",
      reason: "High volatility – conviction reduced",
    };
  }

  // --------------------------------------------------
  // STRONG BUY CONDITIONS (ALL MUST PASS)
  // --------------------------------------------------
  const strongBuy =
    structure === "UP" &&
    trend === "UPTREND" &&
    emaAlignment === "BULLISH" &&
    priceAction === "STRONG_BULL" &&
    volumeConfirm === true &&
    breakoutQuality === "REAL" &&
    marketBreadth === "BULLISH";

  if (strongBuy) {
    return {
      status: "READY",
      signal: "STRONG_BUY",
      confidence: "VERY_HIGH",
      reason:
        "Structure + Trend + EMA + Price Action + Volume + Breadth aligned",
      frequency: "RARE",
      note:
        "High-quality bullish opportunity. Risk-managed entry only.",
    };
  }

  // --------------------------------------------------
  // STRONG SELL CONDITIONS (ALL MUST PASS)
  // --------------------------------------------------
  const strongSell =
    structure === "DOWN" &&
    trend === "DOWNTREND" &&
    emaAlignment === "BEARISH" &&
    priceAction === "STRONG_BEAR" &&
    volumeConfirm === true &&
    breakoutQuality === "REAL" &&
    marketBreadth === "BEARISH";

  if (strongSell) {
    return {
      status: "READY",
      signal: "STRONG_SELL",
      confidence: "VERY_HIGH",
      reason:
        "Bearish structure + momentum + volume + breadth aligned",
      frequency: "RARE",
      note:
        "High-quality bearish opportunity. Strict SL mandatory.",
    };
  }

  // --------------------------------------------------
  // DEFAULT – NO STRONG SIGNAL
  // --------------------------------------------------
  return {
    status: "WAIT",
    signal: "NO_STRONG_SIGNAL",
    reason:
      "Strong conditions not fully aligned – normal signals only",
  };
}

// ==================================================
// EXPORT
// ==================================================
module.exports = {
  generateStrongSignal,
};
