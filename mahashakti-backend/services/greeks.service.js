// ==========================================
// GREEKS SERVICE – INSTITUTIONAL CONTEXT
// PHASE-2A (SIMPLIFIED, TEXT ONLY)
// ==========================================

/**
 * getGreeksContext
 * @param {object} greeks
 * Expected:
 * {
 *   delta,
 *   gamma,
 *   theta,
 *   vega
 * }
 *
 * ⚠️ Context only
 * ❌ No BUY / SELL enforcement
 */
function getGreeksContext(greeks = {}) {
  if (!greeks || typeof greeks !== "object") {
    return {
      bias: "NEUTRAL",
      note: "Greeks data not available",
    };
  }

  const {
    delta,
    gamma,
    theta,
    vega,
  } = greeks;

  // -----------------------------
  // HIGH RISK CONTEXT (PRIORITY)
  // -----------------------------
  if (typeof gamma === "number" && gamma > 0.15) {
    return {
      bias: "HIGH_RISK",
      note:
        "High gamma – sharp price sensitivity, fast moves possible",
    };
  }

  // -----------------------------
  // SELLER FAVORABLE (THETA)
  // -----------------------------
  if (typeof theta === "number" && theta < -0.05) {
    return {
      bias: "SELLER_FAVORABLE",
      note:
        "Strong theta decay – time working in favor of option sellers",
    };
  }

  // -----------------------------
  // BUYER FAVORABLE (DELTA)
  // -----------------------------
  if (typeof delta === "number" && delta > 0.6) {
    return {
      bias: "BUYER_FAVORABLE",
      note:
        "High delta – strong directional momentum present",
    };
  }

  // -----------------------------
  // VOLATILITY CONTEXT (VEGA)
  // -----------------------------
  if (typeof vega === "number" && vega > 0.12) {
    return {
      bias: "VOLATILITY_SENSITIVE",
      note:
        "High vega – option premium sensitive to volatility changes",
    };
  }

  // -----------------------------
  // DEFAULT
  // -----------------------------
  return {
    bias: "NEUTRAL",
    note: "Greeks balanced – no strong institutional edge",
  };
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  getGreeksContext,
};
