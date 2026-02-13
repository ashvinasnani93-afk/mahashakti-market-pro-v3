// ==================================================
// LONG-TERM EQUITY DECISION ENGINE (PHASE-L1 FINAL)
// HOLD / PARTIAL EXIT / FULL EXIT
// CONDITION BASED – NO FIXED TIME – NO PREDICTION
// ==================================================

const {
  getLongTermSafetyContext,
} = require("./longTermSafety.service");

/**
 * decideLongTermAction
 * @param {object} data
 * @returns {object}
 *
 * Required:
 * - symbol
 * - weeklyTrend   (UPTREND / DOWNTREND / SIDEWAYS)
 * - monthlyTrend  (UPTREND / DOWNTREND / SIDEWAYS)
 * - entryPrice
 * - currentPrice
 * - timeInTradeDays (number, optional)
 * - intradaySignal (optional)
 * - isResultDay (optional)
 * - isMarketCrash (optional)
 */
function decideLongTermAction(data = {}) {
  const {
    symbol,
    weeklyTrend,
    monthlyTrend,
    entryPrice,
    currentPrice,
    timeInTradeDays,
    intradaySignal,
    isResultDay,
    isMarketCrash,
  } = data;

  // --------------------------------------------------
  // HARD INPUT VALIDATION
  // --------------------------------------------------
  if (
    !symbol ||
    !weeklyTrend ||
    !monthlyTrend ||
    typeof entryPrice !== "number" ||
    typeof currentPrice !== "number"
  ) {
    return {
      status: "WAIT",
      action: "NO_DECISION",
      reason: "Insufficient long-term input data",
    };
  }

  // --------------------------------------------------
  // SAFETY CONTEXT (PHASE-L1 – LOCKED)
  // --------------------------------------------------
  const safetyContext = getLongTermSafetyContext({
    isMarketCrash: isMarketCrash === true,
    isResultDay: isResultDay === true,
    intradaySignal,
  });

  if (safetyContext.status !== "SAFE") {
    return {
      status: safetyContext.status,
      action: safetyContext.action || "HOLD",
      reason: safetyContext.reason,
    };
  }

  // --------------------------------------------------
  // PROFIT / LOSS CONTEXT (TEXT ONLY)
  // --------------------------------------------------
  const pnlPercent =
    ((currentPrice - entryPrice) / entryPrice) * 100;

  // --------------------------------------------------
  // TIME IN TRADE CONTEXT (TEXT ONLY)
  // --------------------------------------------------
  let timeContext = "Holding period not specified";
  if (typeof timeInTradeDays === "number") {
    if (timeInTradeDays < 90) {
      timeContext = "Early stage long-term holding";
    } else if (timeInTradeDays < 365) {
      timeContext = "Mid-stage long-term holding";
    } else {
      timeContext = "Mature long-term holding";
    }
  }

  // --------------------------------------------------
  // CORE LONG-TERM DECISION LOGIC (LOCKED)
  // --------------------------------------------------

  // 🟢 STRONG HOLD
  if (
    weeklyTrend === "UPTREND" &&
    monthlyTrend === "UPTREND"
  ) {
    return {
      status: "OK",
      action: "HOLD",
      confidence: "HIGH",
      trendContext: "Weekly and Monthly trends aligned upward",
      timeContext,
      pnlContext: `Approx P&L: ${pnlPercent.toFixed(2)}%`,
      note:
        "Long-term structure strong. No exit pressure. Continue holding.",
    };
  }

  // 🟡 PARTIAL EXIT
  if (
    weeklyTrend === "DOWNTREND" &&
    monthlyTrend === "UPTREND"
  ) {
    return {
      status: "OK",
      action: "PARTIAL_EXIT",
      confidence: "MEDIUM",
      trendContext:
        "Weekly trend weakened, monthly trend still supportive",
      timeContext,
      pnlContext: `Approx P&L: ${pnlPercent.toFixed(2)}%`,
      note:
        "Structural caution phase. Partial profit booking can reduce risk.",
    };
  }

  // 🔴 FULL EXIT
  if (
    weeklyTrend === "DOWNTREND" &&
    monthlyTrend === "DOWNTREND"
  ) {
    return {
      status: "OK",
      action: "FULL_EXIT",
      confidence: "HIGH",
      trendContext: "Weekly and Monthly structure broken",
      timeContext,
      pnlContext: `Approx P&L: ${pnlPercent.toFixed(2)}%`,
      note:
        "Long-term trend damage confirmed. Capital protection prioritized.",
    };
  }

  // --------------------------------------------------
  // DEFAULT SAFE HOLD
  // --------------------------------------------------
  return {
    status: "OK",
    action: "HOLD",
    confidence: "LOW",
    trendContext: "Mixed or sideways long-term structure",
    timeContext,
    pnlContext: `Approx P&L: ${pnlPercent.toFixed(2)}%`,
    note:
      "No clear breakdown. Hold with patience and monitor structure.",
  };
}

// ==================================================
// EXPORT
// ==================================================
module.exports = {
  decideLongTermAction,
};
