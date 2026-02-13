// ==================================================
// OPTIONS SELLER ENGINE (PHASE-4.2)
// RANGE / SIDEWAYS MARKET – SELL DECISION + STRIKE LOGIC
// NO EXECUTION | RULE LOCKED
// ==================================================

/**
 * calculateStrike
 * @param {number} spotPrice
 * @param {string} expiryType  WEEKLY_EXPIRY / MONTHLY_EXPIRY
 * @returns {object}
 */
function calculateStrike(spotPrice, expiryType) {
  // ATM rounded to nearest 50
  const atm = Math.round(spotPrice / 50) * 50;

  // Distance rules (risk-locked)
  const percent =
    expiryType === "WEEKLY_EXPIRY"
      ? 0.01   // 1.0% weekly (safer)
      : 0.025; // 2.5% monthly (positional seller)

  const distance = Math.round((spotPrice * percent) / 50) * 50;

  return {
    atm,
    ceStrike: atm + distance,
    peStrike: atm - distance,
    distance,
  };
}

/**
 * evaluateSellerContext
 * @param {object} context
 * @returns {object}
 *
 * Input comes from optionsSignal.engine
 */
function evaluateSellerContext(context = {}) {
  const {
    trend,        // UPTREND / DOWNTREND / SIDEWAYS
    regime,       // SIDEWAYS / TRENDING / HIGH_RISK
    rsi,
    safety,
    spotPrice,
    expiryType,
  } = context;

  // ----------------------------------
  // HARD SAFETY
  // ----------------------------------
  if (!safety) {
    return {
      sellerAllowed: false,
      note: "Safety context missing",
    };
  }

  if (safety.isExpiryDay || safety.isResultDay) {
    return {
      sellerAllowed: false,
      note: "Option selling blocked on expiry / result day",
    };
  }

  // ----------------------------------
  // REGIME CHECK (FINAL AUTHORITY)
  // ----------------------------------
  if (regime !== "SIDEWAYS") {
    return {
      sellerAllowed: false,
      note: "Market not sideways – option selling avoided",
    };
  }

  // ----------------------------------
  // RSI FILTER (SELLER SAFETY)
  // ----------------------------------
  if (typeof rsi !== "number") {
    return {
      sellerAllowed: false,
      note: "RSI data missing for seller decision",
    };
  }

  if (rsi > 65 || rsi < 35) {
    return {
      sellerAllowed: false,
      note: "RSI extreme – unsafe for option selling",
    };
  }

  // ----------------------------------
  // STRIKE SELECTION (RULE LOCKED)
  // ----------------------------------
  if (typeof spotPrice !== "number" || !expiryType) {
    return {
      sellerAllowed: false,
      note: "Spot price / expiry missing for strike selection",
    };
  }

  const strikeInfo = calculateStrike(spotPrice, expiryType);

  // ----------------------------------
  // ✅ SELL ALLOWED
  // ----------------------------------
  return {
    sellerAllowed: true,
    strategy: "RANGE_OPTION_SELL",
    expiryType,
    atm: strikeInfo.atm,
    ceStrike: strikeInfo.ceStrike,
    peStrike: strikeInfo.peStrike,
    strikeDistance: strikeInfo.distance,
    note:
      "Sideways market + stable RSI → CE & PE selling allowed at safe distance",
  };
}

// ----------------------------------
// EXPORT
// ----------------------------------
module.exports = {
  evaluateSellerContext,
};
