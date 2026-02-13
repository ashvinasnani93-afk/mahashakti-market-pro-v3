// ==========================================
// OI SERVICE – INSTITUTIONAL ANALYSIS (PHASE-2A)
// Used by Signal Decision Engine
// ==========================================

/**
 * detectBuildup
 * Supports Angel raw OI data:
 * oiChange + priceChange
 */
function detectBuildup(item = {}) {
  const oiChange = Number(item.oiChange || 0);
  const priceChange = Number(item.priceChange || 0);

  if (oiChange > 0 && priceChange > 0) return "LONG_BUILDUP";
  if (oiChange > 0 && priceChange < 0) return "SHORT_BUILDUP";
  if (oiChange < 0 && priceChange > 0) return "SHORT_COVERING";
  if (oiChange < 0 && priceChange < 0) return "LONG_UNWINDING";

  return "NEUTRAL";
}

/**
 * summarizeOI
 * @param {Array} oiData
 * Supports:
 * 1️⃣ { buildup: "LONG_BUILDUP" }
 * 2️⃣ { oiChange, priceChange }  ← Angel real data
 */
function summarizeOI(oiData = []) {
  // -----------------------------
  // HARD SAFETY – NO DATA
  // -----------------------------
 if (!Array.isArray(oiData) || oiData.length === 0) {
  return {
    bias: "NEUTRAL",
  };
}

  let longBuildUp = 0;
  let shortBuildUp = 0;
  let shortCovering = 0;
  let longUnwinding = 0;

  oiData.forEach((item) => {
    const buildup = item.buildup || detectBuildup(item);

    switch (buildup) {
      case "LONG_BUILDUP":
        longBuildUp++;
        break;
      case "SHORT_BUILDUP":
        shortBuildUp++;
        break;
      case "SHORT_COVERING":
        shortCovering++;
        break;
      case "LONG_UNWINDING":
        longUnwinding++;
        break;
    }
  });

  const bullishScore = longBuildUp + shortCovering;
  const bearishScore = shortBuildUp + longUnwinding;

  // -----------------------------
  // INSTITUTIONAL BIAS LOGIC
  // -----------------------------
 if (bullishScore > bearishScore) {
  return {
    bias: "BULLISH",
  };
}

  if (bearishScore > bullishScore) {
  return {
    bias: "BEARISH",
  };
}

 return {
  bias: "NEUTRAL",
};
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  summarizeOI,
};
