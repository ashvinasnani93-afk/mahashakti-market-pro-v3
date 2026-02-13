// ==========================================
// MARKET REGIME SERVICE
// Determines market state:
// TRENDING_UP | TRENDING_DOWN | SIDEWAYS | HIGH_RISK | NO_TRADE
// ==========================================

// ==========================================
// DETECT MARKET REGIME
// ==========================================
function detectMarketRegime(data = {}) {
  const {
    close,
    prevClose,
    ema20,
    ema50,
    candleSizePercent,
    overlapPercent,
    vix
  } = data;

  // Hard validation
  if (
    typeof close !== "number" ||
    typeof prevClose !== "number" ||
    typeof ema20 !== "number" ||
    typeof ema50 !== "number"
  ) {
    return {
      regime: "NO_TRADE",
      reason: "Insufficient data for regime detection"
    };
  }

  // HIGH RISK - VIX elevated
  if (typeof vix === "number" && vix >= 20) {
    return {
      regime: "HIGH_RISK",
      reason: "High volatility environment (VIX elevated)"
    };
  }

  // EMA alignment
  const emaUp = close > ema20 && ema20 > ema50;
  const emaDown = close < ema20 && ema20 < ema50;

  // Price speed
  const priceChangePercent = Math.abs((close - prevClose) / prevClose) * 100;
  const strongMove = priceChangePercent >= 0.35;
  const slowMove = priceChangePercent < 0.15;

  // SIDEWAYS detection
  if (overlapPercent >= 60 || slowMove) {
    return {
      regime: "SIDEWAYS",
      reason: "Price overlapping / low momentum"
    };
  }

  // TRENDING UP
  if (emaUp && strongMove && candleSizePercent >= 0.25) {
    return {
      regime: "TRENDING_UP",
      reason: "Price > EMA20 > EMA50 with strong momentum"
    };
  }

  // TRENDING DOWN
  if (emaDown && strongMove && candleSizePercent >= 0.25) {
    return {
      regime: "TRENDING_DOWN",
      reason: "Price < EMA20 < EMA50 with strong momentum"
    };
  }

  return {
    regime: "NO_TRADE",
    reason: "Regime unclear - capital protection"
  };
}

// ==========================================
// CHECK IF REGIME ALLOWS TRADING
// ==========================================
function isRegimeTradeable(regime) {
  const tradeableRegimes = ["TRENDING_UP", "TRENDING_DOWN"];
  return tradeableRegimes.includes(regime);
}

// ==========================================
// GET REGIME COLOR (for UI)
// ==========================================
function getRegimeColor(regime) {
  const colors = {
    TRENDING_UP: "GREEN",
    TRENDING_DOWN: "RED",
    SIDEWAYS: "YELLOW",
    HIGH_RISK: "ORANGE",
    NO_TRADE: "GRAY"
  };
  return colors[regime] || "GRAY";
}

module.exports = {
  detectMarketRegime,
  isRegimeTradeable,
  getRegimeColor
};
