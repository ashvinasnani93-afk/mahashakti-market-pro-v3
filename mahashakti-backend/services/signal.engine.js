// ==========================================
// SIGNAL ENGINE – FOUNDER VERSION
// DIRECTION HARD | ENTRY SOFT
// ==========================================

// ==========================================
// STEP 1 – TREND CHECK (🟢 HARD – NEVER SOFT)
// EMA 20 / EMA 50
// ==========================================
function checkTrend({ closes = [], ema20 = [], ema50 = [] }) {
  if (
    !Array.isArray(closes) ||
    !Array.isArray(ema20) ||
    !Array.isArray(ema50) ||
    closes.length === 0 ||
    ema20.length === 0 ||
    ema50.length === 0
  ) {
    return { trend: "NO_TRADE" };
  }

  const price = closes[closes.length - 1];
  const e20 = ema20[ema20.length - 1];
  const e50 = ema50[ema50.length - 1];

  if (
    typeof price !== "number" ||
    typeof e20 !== "number" ||
    typeof e50 !== "number"
  ) {
    return { trend: "NO_TRADE" };
  }

  if (price > e20 && e20 > e50) {
    return { trend: "UPTREND" };
  }

  if (price < e20 && e20 < e50) {
    return { trend: "DOWNTREND" };
  }

  return { trend: "NO_TRADE" };
}

// ==========================================
// STEP 2 – RSI SANITY (🟡 SOFT)
// Only extreme blocks
// ==========================================
function checkRSI({ rsi, trend }) {
  if (typeof rsi !== "number") return { allowed: false };

  if (trend === "UPTREND" && rsi >= 75) return { allowed: false };
  if (trend === "DOWNTREND" && rsi <= 25) return { allowed: false };

  return { allowed: true };
}

// ==========================================
// STEP 3 – BREAKOUT / BREAKDOWN (🟢 HARD)
// Support / Resistance mandatory
// ==========================================
function checkBreakout({ close, support, resistance, trend }) {
  if (
    typeof close !== "number" ||
    typeof support !== "number" ||
    typeof resistance !== "number"
  ) {
    return { allowed: false };
  }

  if (trend === "UPTREND" && close > resistance) {
    return { allowed: true, action: "BUY" };
  }

  if (trend === "DOWNTREND" && close < support) {
    return { allowed: true, action: "SELL" };
  }

  return { allowed: false };
}

// ==========================================
// STEP 4 – VOLUME CONFIRMATION (🟡 SOFT)
// ==========================================
function checkVolume({ volume, avgVolume }) {
  if (typeof volume !== "number" || typeof avgVolume !== "number") {
    return { allowed: false };
  }

  if (volume >= avgVolume * 1.1) {
    return { allowed: true };
  }

  return { allowed: false };
}

// ==========================================
// STEP 5 – STRONG SIGNAL CHECK (🔥 RARE)
// ==========================================
function checkStrongSignal({
  trend,
  breakoutAction,
  close,
  prevClose,
  volume,
  avgVolume,
}) {
  if (!trend || !breakoutAction) {
    return { strong: false };
  }

  if (
    typeof close !== "number" ||
    typeof prevClose !== "number" ||
    typeof volume !== "number" ||
    typeof avgVolume !== "number"
  ) {
    return { strong: false };
  }

  const candleMove = Math.abs(close - prevClose);
  const strongCandle = candleMove >= close * 0.002; // ~0.2%
  const highVolume = volume >= avgVolume * 1.5;

  if (
    breakoutAction === "BUY" &&
    trend === "UPTREND" &&
    strongCandle &&
    highVolume
  ) {
    return { strong: true, signal: "STRONG_BUY" };
  }

  if (
    breakoutAction === "SELL" &&
    trend === "DOWNTREND" &&
    strongCandle &&
    highVolume
  ) {
    return { strong: true, signal: "STRONG_SELL" };
  }

  return { strong: false };
}

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
  checkTrend,
  checkRSI,
  checkBreakout,
  checkVolume,
  checkStrongSignal,
};
