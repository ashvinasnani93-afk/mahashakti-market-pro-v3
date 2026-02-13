// ==================================================
// VOLUME BUILDUP DETECTOR (NEW)
// Detects smart money accumulation
// ==================================================

function detectVolumeBuildup(data = {}) {
  const { volumes = [], avgVolume, closes = [] } = data;

  if (volumes.length < 10 || !avgVolume) {
    return { buildupDetected: false, reason: "Insufficient data" };
  }

  const last10 = volumes.slice(-10);
  const last5 = last10.slice(-5);
  const prev3 = last10.slice(-8, -5);

  const avg5 = last5.reduce((s, v) => s + v, 0) / 5;
  const avg3 = prev3.reduce((s, v) => s + v, 0) / 3;

  const volumeIncreasing = avg5 > avg3 * 1.1;
  const aboveAvg = avg5 > avgVolume * 0.85;

  const elevated = last5.filter(v => v > avgVolume * 0.9).length >= 3;

  let accumulation = false;
  if (closes.length >= 10) {
    const c10 = closes.slice(-10);
    const change = ((c10[9] - c10[0]) / c10[0]) * 100;
    if (change >= -2 && change <= 3 && volumeIncreasing) {
      accumulation = true;
    }
  }

  let score = 0;
  if (volumeIncreasing) score += 2;
  if (aboveAvg) score += 2;
  if (elevated) score += 2;
  if (accumulation) score += 3;

  const ratio = avgVolume > 0 ? avg5 / avgVolume : 0;

  if (score >= 7) {
    return {
      buildupDetected: true,
      confidence: "HIGH",
      score,
      volumeRatio: ratio.toFixed(2),
      pattern: "ACCUMULATION",
      action: "PREPARE_ENTRY"
    };
  }

  if (score >= 5) {
    return {
      buildupDetected: true,
      confidence: "MEDIUM",
      score,
      volumeRatio: ratio.toFixed(2),
      pattern: "VOLUME_BUILDUP",
      action: "WATCH"
    };
  }

  return {
    buildupDetected: false,
    score,
    volumeRatio: ratio.toFixed(2),
    reason: "No buildup"
  };
}

module.exports = {
  detectVolumeBuildup
};
