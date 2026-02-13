// ==========================================
// SIDEWAYS BREAK UTILITY
// ROLE: Detect range compression breakout (NO SIGNAL)
// ==========================================

/**
 * detectSidewaysBreak
 * @param {Object} data
 * @returns {Object}
 *
 * Required:
 * - highs (array of numbers)
 * - lows (array of numbers)
 * - close (number)
 */
function detectSidewaysBreak(data = {}) {
  const highs = Array.isArray(data.highs) ? data.highs : [];
  const lows = Array.isArray(data.lows) ? data.lows : [];
  const close = Number(data.close || 0);

  if (highs.length === 0 || lows.length === 0) {
    return { breakout: false, reason: "Insufficient data" };
  }

  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);

  // Close must be above recent range high
  if (close > rangeHigh) {
    return {
      breakout: true,
      rangeHigh,
      rangeLow,
    };
  }

  return {
    breakout: false,
    rangeHigh,
    rangeLow,
  };
}

module.exports = {
  detectSidewaysBreak,
};
