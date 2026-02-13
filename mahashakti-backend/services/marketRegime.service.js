// ==========================================
// MARKET REGIME SERVICE (PHASE-R1)
// Determines market state:
// TRENDING_UP | TRENDING_DOWN | SIDEWAYS | HIGH_RISK | NO_TRADE
// RULE-LOCKED – CORE FOUNDATION
// ==========================================

/**
 * detectMarketRegime
 * @param {object} data
 * @returns {object}
 *
 * Required:
 * - close
 * - prevClose
 * - ema20
 * - ema50
 * - candleSizePercent
 * - overlapPercent
 * - vix (optional, text only)
 */
function detectMarketRegime(data = {}) {
  const {
    close,
    prevClose,
    ema20,
    ema50,
    candleSizePercent,
    overlapPercent,
    vix,
  } = data;

  // ----------------------------------
  // HARD VALIDATION
  // ----------------------------------
  if (
    typeof close !== "number" ||
    typeof prevClose !== "number" ||
    typeof ema20 !== "number" ||
    typeof ema50 !== "number"
  ) {
    return {
      regime: "NO_TRADE",
      reason: "Insufficient data for regime detection",
    };
  }

  // ----------------------------------
  // HIGH RISK – VOLATILITY TRAP
  // ----------------------------------
  if (typeof vix === "number" && vix >= 20) {
    return {
      regime: "HIGH_RISK",
      reason: "High volatility environment (VIX elevated)",
    };
  }

  // ----------------------------------
  // EMA ALIGNMENT (TREND ENGINE)
  // ----------------------------------
  const emaUp = close > ema20 && ema20 > ema50;
  const emaDown = close < ema20 && ema20 < ema50;

  // ----------------------------------
  // PRICE SPEED CHECK
  // ----------------------------------
  const priceChangePercent =
    Math.abs((close - prevClose) / prevClose) * 100;

  const strongMove = priceChangePercent >= 0.35;
  const slowMove = priceChangePercent < 0.15;

  // ----------------------------------
  // SIDEWAYS / NO-TRADE DETECTION
  // ----------------------------------
  if (
    overlapPercent >= 60 || // candles overlapping
    slowMove
  ) {
    return {
      regime: "SIDEWAYS",
      reason: "Price overlapping / low momentum",
    };
  }

  // ----------------------------------
  // TRENDING UP
  // ----------------------------------
  if (emaUp && strongMove && candleSizePercent >= 0.25) {
    return {
      regime: "TRENDING_UP",
      reason: "Price > EMA20 > EMA50 with strong momentum",
    };
  }

  // ----------------------------------
  // TRENDING DOWN
  // ----------------------------------
  if (emaDown && strongMove && candleSizePercent >= 0.25) {
    return {
      regime: "TRENDING_DOWN",
      reason: "Price < EMA20 < EMA50 with strong momentum",
    };
  }

  // ----------------------------------
  // DEFAULT SAFE FALLBACK
  // ----------------------------------
  return {
    regime: "NO_TRADE",
    reason: "Regime unclear – capital protection",
  };
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  detectMarketRegime,
};
