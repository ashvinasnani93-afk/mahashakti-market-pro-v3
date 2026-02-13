// ==================================================
// COMMODITY DECISION SERVICE (PHASE-C2)
// Direction / Zone based logic
// NO FIXED TARGETS | NO EXECUTION
// ==================================================

const { getCommoditySafetyContext } = require("./commoditySafety.service");

/**
 * decideCommodityTrade
 * @param {object} data
 * @returns {object}
 *
 * Supported commodities:
 * GOLD | SILVER | CRUDE | NATURAL_GAS
 */
function decideCommodityTrade(data = {}) {
  const {
    commodity,
    trend,            // UPTREND / DOWNTREND / SIDEWAYS
    price,
    safetyInput,      // event / spike / volatility info
    userType = "FREE", // FREE / TRIAL / PRO
  } = data;

  // --------------------------------------------------
  // HARD INPUT VALIDATION
  // --------------------------------------------------
  if (!commodity || typeof price !== "number") {
    return {
      status: "WAIT",
      decision: "NO_TRADE",
      reason: "Invalid commodity or price data",
    };
  }

  // --------------------------------------------------
  // SAFETY CHECK (MANDATORY – CAPITAL PROTECTION)
  // --------------------------------------------------
  const safety = getCommoditySafetyContext(safetyInput || {});

  if (safety.status !== "SAFE") {
    return {
      status: "WAIT",
      decision: "NO_TRADE",
      commodity,
      reason: safety.reason,
      note: "Commodity trade blocked by safety layer",
    };
  }

  // --------------------------------------------------
  // FREE / TRIAL → DIRECTION ONLY (LOCKED RULE)
  // --------------------------------------------------
  if (userType === "FREE" || userType === "TRIAL") {
    return {
      status: "READY",
      commodity,
      direction: trend,
      price,
      mode: "DIRECTION_ONLY",
      note: "Free/Trial mode: direction view only (no zones, no targets)",
    };
  }

  // --------------------------------------------------
  // PRO USER → ZONE BASED CONTEXT (NO TARGETS)
  // --------------------------------------------------
  if (userType === "PRO") {
    let zone = "NEUTRAL_ZONE";
    let biasNote = "Market unclear, wait for structure";

    if (trend === "UPTREND") {
      zone = "BUY_ZONE";
      biasNote = "Bullish structure: accumulation / buy-on-dips zone";
    }

    if (trend === "DOWNTREND") {
      zone = "SELL_ZONE";
      biasNote = "Bearish structure: distribution / sell-on-rise zone";
    }

    if (trend === "SIDEWAYS") {
      zone = "NO_TRADE_ZONE";
      biasNote = "Sideways / noisy commodity market";
    }

    return {
      status: "READY",
      commodity,
      trend,
      price,
      zone,
      mode: "ZONE_BASED",
      riskNote: "Commodity volatility can spike suddenly",
      note: biasNote,
    };
  }

  // --------------------------------------------------
  // FALLBACK (SHOULD NOT HIT)
  // --------------------------------------------------
  return {
    status: "WAIT",
    decision: "NO_TRADE",
    commodity,
    reason: "Unhandled commodity decision state",
  };
}

// ==================================================
// EXPORT
// ==================================================
module.exports = {
  decideCommodityTrade,
};
