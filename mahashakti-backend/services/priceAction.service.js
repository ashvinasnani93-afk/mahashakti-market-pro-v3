// ==================================================
// PRICE ACTION SERVICE (FINAL – LOCKED)
// Candle psychology engine
// ==================================================

function analyzePriceAction(candle = {}) {
  const { open, high, low, close } = candle;

  if (
    typeof open !== "number" ||
    typeof high !== "number" ||
    typeof low !== "number" ||
    typeof close !== "number"
  ) {
    return {
      valid: false,
      sentiment: "UNKNOWN",
      strength: "NONE",
      reason: "Invalid candle data",
    };
  }

  const body = Math.abs(close - open);
  const range = high - low;

  if (range === 0) {
    return {
      valid: false,
      sentiment: "UNKNOWN",
      strength: "NONE",
      reason: "Zero range candle",
    };
  }

  const upperWick = high - Math.max(open, close);
  const lowerWick = Math.min(open, close) - low;

  const bodyPercent = (body / range) * 100;
  const upperWickPercent = (upperWick / range) * 100;
  const lowerWickPercent = (lowerWick / range) * 100;

  // STRONG BULLISH
  if (close > open && bodyPercent > 60 && upperWickPercent < 20) {
    return {
      valid: true,
      sentiment: "BULLISH",
      strength: "STRONG",
      reason: "Strong bullish candle with control",
    };
  }

  // STRONG BEARISH
  if (close < open && bodyPercent > 60 && lowerWickPercent < 20) {
    return {
      valid: true,
      sentiment: "BEARISH",
      strength: "STRONG",
      reason: "Strong bearish candle with control",
    };
  }

  // BUY REJECTION
  if (close > open && lowerWickPercent > 40 && bodyPercent < 40) {
    return {
      valid: true,
      sentiment: "BULLISH",
      strength: "MEDIUM",
      reason: "Buyer rejection from support",
    };
  }

  // SELL REJECTION
  if (close < open && upperWickPercent > 40 && bodyPercent < 40) {
    return {
      valid: true,
      sentiment: "BEARISH",
      strength: "MEDIUM",
      reason: "Seller rejection from resistance",
    };
  }

  // SIDEWAYS / DOJI
  if (bodyPercent < 25) {
    return {
      valid: false,
      sentiment: "NEUTRAL",
      strength: "WEAK",
      reason: "Indecision candle (Doji / small body)",
    };
  }

  return {
    valid: false,
    sentiment: "NEUTRAL",
    strength: "UNKNOWN",
    reason: "No clear price action edge",
  };
}

module.exports = {
  analyzePriceAction,
};
