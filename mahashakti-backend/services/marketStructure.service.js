// ==================================================
// MARKET STRUCTURE SERVICE (FOUNDER-SAFE SOFT VERSION)
// Direction HARD, Noise Tolerant
// ==================================================

function analyzeMarketStructure(data = {}) {
  const { highs = [], lows = [] } = data;

  if (
    !Array.isArray(highs) ||
    !Array.isArray(lows) ||
    highs.length < 4 ||
    lows.length < 4
  ) {
    return {
      valid: false,
      structure: "UNKNOWN",
      reason: "Insufficient structure data",
    };
  }

  const recentHighs = highs.slice(-4);
  const recentLows = lows.slice(-4);

  let higherHighs = 0;
  let higherLows = 0;
  let lowerHighs = 0;
  let lowerLows = 0;

  for (let i = 1; i < recentHighs.length; i++) {
    if (recentHighs[i] > recentHighs[i - 1]) higherHighs++;
    if (recentHighs[i] < recentHighs[i - 1]) lowerHighs++;
  }

  for (let i = 1; i < recentLows.length; i++) {
    if (recentLows[i] > recentLows[i - 1]) higherLows++;
    if (recentLows[i] < recentLows[i - 1]) lowerLows++;
  }

  // 🔼 UPTREND (dominant structure)
  if (higherHighs >= 2 && higherLows >= 1) {
    return {
      valid: true,
      structure: "UPTREND",
      reason: "Dominant higher highs / higher lows",
    };
  }

  // 🔽 DOWNTREND (dominant structure)
  if (lowerHighs >= 2 && lowerLows >= 1) {
    return {
      valid: true,
      structure: "DOWNTREND",
      reason: "Dominant lower highs / lower lows",
    };
  }

  // SIDEWAYS / NO CLEAR STRUCTURE
  return {
    valid: false,
    structure: "UNCLEAR",
    reason: "No dominant price structure",
  };
}

module.exports = {
  analyzeMarketStructure,
};
