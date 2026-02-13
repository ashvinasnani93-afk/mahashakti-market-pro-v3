// ==========================================
// STRONG BUY / STRONG SELL ENGINE
// MAHASHAKTI MARKET PRO (LOCKED CORE)
// ==========================================

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
    isResultDay,
    isExpiryDay
  } = data;

  // HARD SAFETY
  if (isResultDay || isExpiryDay) {
    return { status: "WAIT", signal: "WAIT", note: "Event day risk" };
  }

  const rulesPassed =
    structure &&
    trend &&
    emaAlignment &&
    priceAction &&
    volumeConfirm === true &&
    breakoutQuality === "REAL" &&
    marketBreadth !== "BEARISH" &&
    vixLevel !== "HIGH";

  if (!rulesPassed) {
    return { status: "WAIT", signal: "WAIT", note: "Conditions not aligned" };
  }

  if (trend === "UPTREND") {
    return {
      status: "READY",
      signal: "STRONG_BUY",
      note: "Institutional momentum confirmed"
    };
  }

  if (trend === "DOWNTREND") {
    return {
      status: "READY",
      signal: "STRONG_SELL",
      note: "Distribution momentum confirmed"
    };
  }

  return { status: "WAIT", signal: "WAIT" };
}

module.exports = {
  generateStrongSignal
};
