// ==========================================
// PCR SERVICE – INSTITUTIONAL CONTEXT (PHASE-2A)
// Put Call Ratio interpretation (TEXT ONLY)
// NOTE: UI-SAFE (NO STRATEGY / NO EXPLANATION)
// ==========================================

/**
 * getPCRContext
 * @param {number} pcrValue
 * @returns {object} bias + note
 *
 * ⚠️ Context only
 * ❌ No BUY / SELL enforcement
 * 🔒 No reasoning leak to UI
 */
function getPCRContext(pcrValue) {
  // -----------------------------
  // HARD VALIDATION
  // -----------------------------
  if (typeof pcrValue !== "number" || isNaN(pcrValue)) {
    return {
      bias: "NEUTRAL",
      note: "PCR context",
    };
  }

  // -----------------------------
  // EXTREME LOW PCR
  // -----------------------------
  if (pcrValue < 0.6) {
    return {
      bias: "BEARISH",
      note: "PCR context",
    };
  }

  // -----------------------------
  // LOW PCR
  // -----------------------------
  if (pcrValue >= 0.6 && pcrValue < 0.9) {
    return {
      bias: "BEARISH",
      note: "PCR context",
    };
  }

  // -----------------------------
  // BALANCED PCR
  // -----------------------------
  if (pcrValue >= 0.9 && pcrValue <= 1.2) {
    return {
      bias: "NEUTRAL",
      note: "PCR context",
    };
  }

  // -----------------------------
  // HIGH PCR
  // -----------------------------
  if (pcrValue > 1.2 && pcrValue <= 1.5) {
    return {
      bias: "BULLISH",
      note: "PCR context",
    };
  }

  // -----------------------------
  // EXTREME HIGH PCR
  // -----------------------------
  if (pcrValue > 1.5) {
    return {
      bias: "BULLISH",
      note: "PCR context",
    };
  }

  // -----------------------------
  // FALLBACK
  // -----------------------------
  return {
    bias: "NEUTRAL",
    note: "PCR context",
  };
}

module.exports = {
  getPCRContext,
};
