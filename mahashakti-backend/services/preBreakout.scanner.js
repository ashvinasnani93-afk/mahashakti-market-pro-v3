// ==================================================
// PRE-BREAKOUT SCANNER (NEW)
// Detects compression BEFORE breakout
// ==================================================

function detectPreBreakout(data = {}) {
  const {
    close,
    high,
    low,
    highs = [],
    lows = [],
    volumes = [],
    avgVolume,
    resistance
  } = data;

  if (!close || highs.length < 10 || lows.length < 10) {
    return { preBreakout: false, reason: "Insufficient data" };
  }

  const last10Highs = highs.slice(-10);
  const last10Lows = lows.slice(-10);

  const ranges = last10Highs.map((h, i) => h - last10Lows[i]);
  const avgRange = ranges.reduce((s, r) => s + r, 0) / 10;

  const recent3 = ranges.slice(-3);
  const recentAvg = recent3.reduce((s, r) => s + r, 0) / 3;

  const compressionRatio = avgRange > 0 ? recentAvg / avgRange : 1;
  const isCompressed = compressionRatio < 0.7;

  if (!isCompressed) {
    return { preBreakout: false, reason: "No compression" };
  }

  let volumeBuilding = false;
  if (volumes.length >= 5 && avgVolume) {
    const last5 = volumes.slice(-5);
    const avg5 = last5.reduce((s, v) => s + v, 0) / 5;
    volumeBuilding = avg5 > avgVolume * 0.9;
  }

  let nearResistance = false;
  if (resistance) {
    const dist = ((resistance - close) / close) * 100;
    nearResistance = dist >= 0 && dist <= 1.5;
  } else {
    const recentHigh = Math.max(...last10Highs);
    const dist = ((recentHigh - close) / close) * 100;
    nearResistance = dist >= 0 && dist <= 2;
  }

  let higherLows = 0;
  const last5Lows = last10Lows.slice(-5);
  for (let i = 1; i < last5Lows.length; i++) {
    if (last5Lows[i] > last5Lows[i - 1]) higherLows++;
  }

  let score = 0;
  if (isCompressed) score += 3;
  if (volumeBuilding) score += 2;
  if (nearResistance) score += 2;
  if (higherLows >= 2) score += 2;
  if (compressionRatio < 0.5) score += 1;

  if (score >= 6) {
    return {
      preBreakout: true,
      confidence: "HIGH",
      score,
      note: "Stock coiling - breakout near",
      probability: "VERY_HIGH",
      action: "WATCH_CLOSELY"
    };
  }

  if (score >= 4) {
    return {
      preBreakout: true,
      confidence: "MEDIUM",
      score,
      note: "Possible breakout forming",
      probability: "MEDIUM",
      action: "MONITOR"
    };
  }

  return { preBreakout: false, score, reason: "Low setup strength" };
}

module.exports = {
  detectPreBreakout
};
