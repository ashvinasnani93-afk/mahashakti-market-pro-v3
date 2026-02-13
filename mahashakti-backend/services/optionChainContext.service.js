// ==================================================
// OPTION CHAIN CONTEXT SERVICE (PHASE-B1)
// Strike-wise CONTEXT ONLY (NO BUY / SELL WORDS)
// Symbol-based guidance for non-literate users
// RULE-LOCKED | FRONTEND READY
// ==================================================

/**
 * SYMBOL LEGEND (LOCKED)
 * 🟢 GREEN  → Buyer-favourable context
 * 🔴 RED    → Seller-favourable context
 * 🟡 YELLOW → No-trade / avoid / risky
 */

/**
 * getStrikeContext
 * @param {object} params
 * @returns {object}
 *
 * INPUT:
 * - strikePrice
 * - spotPrice
 * - optionType (CE / PE)
 * - buyerAllowed (boolean)
 * - sellerAllowed (boolean)
 * - regime (TRENDING / SIDEWAYS / NO_TRADE_ZONE)
 */
function getStrikeContext(params = {}) {
  const {
    strikePrice,
    spotPrice,
    optionType,
    buyerAllowed,
    sellerAllowed,
    regime,
  } = params;

  // -----------------------------
  // HARD VALIDATION
  // -----------------------------
  if (
    typeof strikePrice !== "number" ||
    typeof spotPrice !== "number" ||
    !optionType
  ) {
    return {
      symbol: "🟡",
      context: "Invalid strike data",
    };
  }

  // -----------------------------
  // NO TRADE ZONE (GLOBAL BLOCK)
  // -----------------------------
  if (regime === "NO_TRADE_ZONE") {
    return {
      symbol: "🟡",
      context: "Market in no-trade zone",
    };
  }

  // -----------------------------
  // BUYER CONTEXT (GREEN)
  // -----------------------------
  if (buyerAllowed) {
    if (
      (optionType === "CE" && strikePrice >= spotPrice) ||
      (optionType === "PE" && strikePrice <= spotPrice)
    ) {
      return {
        symbol: "🟢",
        context: "Trend-aligned strike (buyer-favourable)",
      };
    }
  }

  // -----------------------------
  // SELLER CONTEXT (RED)
  // -----------------------------
  if (sellerAllowed) {
    if (
      (optionType === "CE" && strikePrice > spotPrice) ||
      (optionType === "PE" && strikePrice < spotPrice)
    ) {
      return {
        symbol: "🔴",
        context: "Range-based strike (seller-favourable)",
      };
    }
  }

  // -----------------------------
  // DEFAULT AVOID
  // -----------------------------
  return {
    symbol: "🟡",
    context: "Avoid / unclear strike context",
  };
}

// ==================================================
// EXPORT
// ==================================================
module.exports = {
  getStrikeContext,
};
