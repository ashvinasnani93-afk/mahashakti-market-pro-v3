// ==================================================
// OPTIONS SAFETY SERVICE (OPTIMIZED FOR REAL TRADING)
// ==================================================

function getOptionsSafetyContext(context = {}) {
  const {
    tradeContext,
    expiryType,
    isExpiryDay = false,
    isResultDay = false,
    vix,
    overnightRisk = false,
  } = context;

  const safety = {
    allowTrade: true, 
    riskLevel: "NORMAL",
    reason: null,
  };

  // ------------------------------
  // EVENT DAY: Allow with Caution (Instead of Block)
  // ------------------------------
  if (isResultDay) {
    safety.riskLevel = "HIGH";
    safety.reason = "Event day volatility: Use strict stop-loss";
  }

  // ------------------------------
  // EXPIRY DAY: Allow with Safety (Instead of Block)
  // ------------------------------
  if (isExpiryDay) {
    safety.riskLevel = "HIGH";
    safety.reason = "Expiry day: Mind the theta decay";
  }

  // ------------------------------
  // VIX: Optimized to 22 (18 was too tight for Indian Market)
  // ------------------------------
  if (typeof vix === "number" && vix >= 22) {
    return {
      safety: {
        allowTrade: false,
        riskLevel: "HIGH",
        reason: "Options blocked: VIX > 22 (Extreme Panic Zone)",
      },
      note: "Market panic is too high for safe option premiums",
    };
  }

  // ------------------------------
  // OVERNIGHT RISK
  // ------------------------------
  if (tradeContext === "POSITIONAL_OPTIONS" && overnightRisk === true) {
    safety.riskLevel = "HIGH";
    safety.reason = "Overnight gap risk protection active";
  }

  return {
    safety,
    note: "Options safety check: Optimized Pass",
  };
}

module.exports = {
  getOptionsSafetyContext,
};
