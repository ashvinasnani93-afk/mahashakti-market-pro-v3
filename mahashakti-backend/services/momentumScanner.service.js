// ==================================================
// MOMENTUM SCANNER SERVICE
// Evaluates momentum context for signals
// ==================================================

function evaluateMomentumContext(data = {}) {
  const {
    trend,
    rsi,
    volume,
    avgVolume,
    breakoutAction,
    macdSignal,
    adx
  } = data;

  if (!trend || trend === "UNKNOWN" || trend === "SIDEWAYS") {
    return { confirmed: false, reason: "No clear trend" };
  }

  let score = 0;
  const factors = [];

  // Trend confirmation
  if (trend === "UPTREND" && breakoutAction === "BUY") {
    score += 2;
    factors.push("TREND_ALIGNED_BULL");
  } else if (trend === "DOWNTREND" && breakoutAction === "SELL") {
    score += 2;
    factors.push("TREND_ALIGNED_BEAR");
  }

  // RSI momentum
  if (typeof rsi === "number") {
    if (trend === "UPTREND" && rsi >= 50 && rsi <= 70) {
      score += 2;
      factors.push("RSI_BULLISH_MOMENTUM");
    } else if (trend === "DOWNTREND" && rsi <= 50 && rsi >= 30) {
      score += 2;
      factors.push("RSI_BEARISH_MOMENTUM");
    }
  }

  // Volume momentum
  if (volume && avgVolume && avgVolume > 0) {
    const volRatio = volume / avgVolume;
    if (volRatio >= 1.5) {
      score += 2;
      factors.push("STRONG_VOLUME");
    } else if (volRatio >= 1.2) {
      score += 1;
      factors.push("DECENT_VOLUME");
    }
  }

  // ADX momentum (if available)
  if (typeof adx === "number") {
    if (adx >= 25) {
      score += 2;
      factors.push("STRONG_ADX");
    } else if (adx >= 20) {
      score += 1;
      factors.push("MODERATE_ADX");
    }
  }

  // MACD confirmation (if available)
  if (macdSignal) {
    if ((trend === "UPTREND" && macdSignal === "BULLISH") ||
        (trend === "DOWNTREND" && macdSignal === "BEARISH")) {
      score += 2;
      factors.push("MACD_ALIGNED");
    }
  }

  const confirmed = score >= 4;

  return {
    confirmed,
    score,
    factors,
    momentum: score >= 6 ? "STRONG" : score >= 4 ? "MODERATE" : "WEAK",
    direction: trend === "UPTREND" ? "BULLISH" : "BEARISH"
  };
}

module.exports = {
  evaluateMomentumContext
};
