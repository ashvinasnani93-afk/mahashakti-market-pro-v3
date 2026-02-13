// ==================================================
// OPTIONS SELLER CONTEXT SERVICE (PHASE-3)
// SELLER LOGIC – RULE LOCKED
// NO EXECUTION | NO DUMMY
// ==================================================

/**
 * getOptionsSellerContext
 * @param {object} data
 * @returns {object}
 *
 * Expected input:
 * - regime
 * - trend
 * - safety
 * - expiryType
 */
function getOptionsSellerContext(data = {}) {
  const {
    regime,
    trend,
    safety,
    expiryType,
  } = data;

  // ------------------------------
  // HARD SAFETY
  // ------------------------------
  if (!regime || !safety || !expiryType) {
    return {
      sellerAllowed: false,
      sellerType: "NONE",
    };
  }

  // ------------------------------
  // GLOBAL BLOCKS (LOCKED)
  // ------------------------------
  if (safety.isExpiryDay || safety.isResultDay) {
    return {
      sellerAllowed: false,
      sellerType: "NONE",
    };
  }

  if (regime === "HIGH_RISK") {
    return {
      sellerAllowed: false,
      sellerType: "NONE",
    };
  }

  if (regime === "NO_TRADE_ZONE") {
    return {
      sellerAllowed: false,
      sellerType: "NONE",
    };
  }

  // ------------------------------
  // STRONG TREND = SELLER AVOID
  // ------------------------------
  if (regime === "TRENDING") {
    return {
      sellerAllowed: false,
      sellerType: "NONE",
    };
  }

  // ------------------------------
  // SIDEWAYS MARKET = SELLER ALLOWED
  // ------------------------------
  if (regime === "SIDEWAYS") {
    return {
      sellerAllowed: true,
      sellerType:
        expiryType === "MONTHLY_EXPIRY"
          ? "MONTHLY_STRANGLE"
          : "WEEKLY_PREMIUM_SELL",
    };
  }

  // ------------------------------
  // DEFAULT FALLBACK
  // ------------------------------
  return {
    sellerAllowed: false,
    sellerType: "NONE",
  };
}

// --------------------------------------------------
// EXPORT
// --------------------------------------------------
module.exports = {
  getOptionsSellerContext,
};
