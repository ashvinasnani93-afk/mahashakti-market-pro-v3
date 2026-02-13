// ==================================================
// RANGE COMPRESSION SCANNER
// Detects narrowing ranges before explosive moves
// ==================================================

function detectRangeCompression(data = {}) {
  const { highs = [], lows = [], closes = [] } = data;

  if (highs.length < 15 || lows.length < 15) {
    return { active: false, compressed: false, reason: "Insufficient data" };
  }

  // Calculate ranges for last 15 candles
  const last15Highs = highs.slice(-15);
  const last15Lows = lows.slice(-15);

  const ranges = last15Highs.map((h, i) => h - last15Lows[i]);

  // Compare recent 5 vs previous 10
  const recent5 = ranges.slice(-5);
  const prev10 = ranges.slice(-15, -5);

  const recentAvg = recent5.reduce((s, r) => s + r, 0) / 5;
  const prevAvg = prev10.reduce((s, r) => s + r, 0) / 10;

  const compressionRatio = prevAvg > 0 ? recentAvg / prevAvg : 1;

  // Check for narrowing trend
  let narrowingCount = 0;
  for (let i = 1; i < recent5.length; i++) {
    if (recent5[i] < recent5[i - 1]) narrowingCount++;
  }

  // Check for tight range
  const tightRange = compressionRatio < 0.6;
  const moderateCompression = compressionRatio < 0.75;

  // Price consolidation check
  let consolidating = false;
  if (closes.length >= 10) {
    const last10Closes = closes.slice(-10);
    const maxClose = Math.max(...last10Closes);
    const minClose = Math.min(...last10Closes);
    const consolidationRange = ((maxClose - minClose) / minClose) * 100;
    consolidating = consolidationRange < 2;
  }

  let score = 0;
  if (tightRange) score += 4;
  else if (moderateCompression) score += 2;
  if (narrowingCount >= 3) score += 2;
  if (consolidating) score += 2;

  if (score >= 6) {
    return {
      active: true,
      compressed: true,
      confidence: "HIGH",
      score,
      compressionRatio: compressionRatio.toFixed(2),
      narrowingCandles: narrowingCount,
      pattern: "TIGHT_COMPRESSION",
      note: "Explosive move imminent",
      action: "READY_FOR_BREAKOUT"
    };
  }

  if (score >= 4) {
    return {
      active: true,
      compressed: true,
      confidence: "MEDIUM",
      score,
      compressionRatio: compressionRatio.toFixed(2),
      narrowingCandles: narrowingCount,
      pattern: "MODERATE_COMPRESSION",
      note: "Building energy",
      action: "MONITOR"
    };
  }

  return {
    active: false,
    compressed: false,
    score,
    compressionRatio: compressionRatio.toFixed(2),
    reason: "No compression detected"
  };
}

module.exports = {
  detectRangeCompression
};
