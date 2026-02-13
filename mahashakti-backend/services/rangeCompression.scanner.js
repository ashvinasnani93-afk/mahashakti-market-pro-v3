// ==================================================
// RANGE COMPRESSION SCANNER (NEW)
// Detects volatility squeeze
// ==================================================

function detectRangeCompression(data = {}) {
  const { highs = [], lows = [], closes = [] } = data;

  if (highs.length < 20 || lows.length < 20 || closes.length < 20) {
    return { compressed: false, reason: "Insufficient data" };
  }

  const h20 = highs.slice(-20);
  const l20 = lows.slice(-20);
  const c20 = closes.slice(-20);

  const ranges = h20.map((h, i) => h - l20[i]);
  const avg20 = ranges.reduce((s, r) => s + r, 0) / 20;

  const recent5 = ranges.slice(-5);
  const avg5 = recent5.reduce((s, r) => s + r, 0) / 5;

  const atrRatio = avg20 > 0 ? avg5 / avg20 : 1;
  const atrContracting = atrRatio < 0.7;

  const hi = Math.max(...h20.slice(-5));
  const lo = Math.min(...l20.slice(-5));
  const close = c20[c20.length - 1];
  const rangePercent = close > 0 ? ((hi - lo) / close) * 100 : 0;

  const tightRange = rangePercent < 2;

  let score = 0;
  if (atrContracting) score += 3;
  if (tightRange) score += 2;
  if (atrRatio < 0.5) score += 2;

  if (score >= 5) {
    return {
      compressed: true,
      confidence: "HIGH",
      score,
      atrRatio: atrRatio.toFixed(2),
      expectedMove: "BIG_BREAKOUT"
    };
  }

  if (score >= 3) {
    return {
      compressed: true,
      confidence: "MEDIUM",
      score,
      atrRatio: atrRatio.toFixed(2),
      expectedMove: "POSSIBLE_BREAKOUT"
    };
  }

  return {
    compressed: false,
    score,
    atrRatio: atrRatio.toFixed(2),
    reason: "No squeeze"
  };
}

module.exports = {
  detectRangeCompression
};
