// ==========================================
// OI GAINERS / LOSERS – INSTITUTIONAL CONTEXT
// PHASE-2A (SOFT BIAS ONLY)
// ==========================================

/**
 * analyzeOIGainers
 * @param {Array} oiList
 * Expected item:
 * {
 *   symbol,
 *   oiChange,
 *   priceChange
 * }
 */
function analyzeOIGainers(oiList = []) {
  if (!Array.isArray(oiList) || oiList.length === 0) {
    return {
      bias: "NEUTRAL",
      note: "No OI gainer data available",
    };
  }

  let longBias = 0;
  let shortBias = 0;

  oiList.forEach((item) => {
    const oi = Number(item.oiChange || 0);
    const price = Number(item.priceChange || 0);

    // Long buildup
    if (oi > 0 && price > 0) longBias++;

    // Short buildup
    if (oi > 0 && price < 0) shortBias++;
  });

  if (longBias > shortBias) {
    return {
      bias: "BULLISH",
      note: "OI gainers show institutional long buildup dominance",
    };
  }

  if (shortBias > longBias) {
    return {
      bias: "BEARISH",
      note: "OI gainers show institutional short buildup dominance",
    };
  }

  return {
    bias: "NEUTRAL",
    note: "OI gainers activity balanced",
  };
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  analyzeOIGainers,
};
