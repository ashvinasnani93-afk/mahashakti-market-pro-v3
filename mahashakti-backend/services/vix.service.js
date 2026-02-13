// ==========================================
// VIX SERVICE – SAFETY CONTEXT ONLY (C3)
// ❌ No signal change
// ❌ No BUY / SELL logic
// ✅ Only risk awareness note
// ==========================================

/**
 * getVixContext
 * @param {number|null} vixValue
 * @returns {object} { level, note }
 */
function getVixContext(vixValue) {
  // Safety check
  if (typeof vixValue !== "number" || isNaN(vixValue)) {
    return {
      level: "UNKNOWN",
      note: null,
    };
  }

  // Calm market
  if (vixValue < 12) {
    return {
      level: "LOW",
      note: "Market calm – normal conditions",
    };
  }

  // Normal zone
  if (vixValue >= 12 && vixValue < 18) {
    return {
      level: "NORMAL",
      note: null,
    };
  }

  // Volatile zone
  if (vixValue >= 18 && vixValue < 22) {
    return {
      level: "HIGH",
      note: "Volatility rising – trade with caution",
    };
  }

  // Extreme risk
  if (vixValue >= 22) {
    return {
      level: "EXTREME",
      note: "High volatility – reduce position size",
    };
  }

  return {
    level: "UNKNOWN",
    note: null,
  };
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  getVixContext,
};
