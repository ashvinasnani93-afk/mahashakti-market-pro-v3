// ==========================================
// VIX SAFETY SERVICE – TEXT ONLY (PHASE-C3)
// VIX does NOT change BUY / SELL / WAIT
// Only adds a safety note for volatility
// ==========================================

/**
 * getVixSafetyNote
 * @param {number} vix
 * @returns {string|null}
 */
function getVixSafetyNote(vix) {
  if (typeof vix !== "number" || isNaN(vix)) {
    return null; // no VIX data → no note
  }

  // 🔴 High volatility zone
  if (vix >= 20) {
    return "⚠️ High volatility (VIX elevated) – reduce position size & be cautious";
  }

  // 🟡 Medium volatility
  if (vix >= 15 && vix < 20) {
    return "ℹ️ Moderate volatility – normal risk management advised";
  }

  // 🟢 Low volatility
  return null; // no warning needed
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  getVixSafetyNote,
};
