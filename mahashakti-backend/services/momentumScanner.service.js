// ==========================================
// MOMENTUM SCANNER SERVICE (OPERATOR-GRADE)
// ROLE: Detect REAL momentum (NO SIGNAL)
// MAHASHAKTI LOCKED LOGIC
// ==========================================

/**
 * NEW ENGINE
 * Used by signalDecision.service.js
 */
function evaluateMomentumContext(data = {}) {
  try {
    const close = Number(data.close || 0);
    const ema20 = Number(data.ema20 || 0);
    const ema50 = Number(data.ema50 || 0);
    const rsi = Number(data.rsi || 0);
    const volume = Number(data.volume || 0);
    const avgVolume = Number(data.avgVolume || 0);

    if (!close || !ema20 || !ema50 || !rsi || !volume || !avgVolume) {
      return {
        active: false,
        confirmed: false,
        strength: "WEAK",
        reason: "INSUFFICIENT_DATA"
      };
    }

    // -----------------------------
    // TREND STRUCTURE
    // -----------------------------
    const uptrend = close > ema20 && ema20 > ema50;
    const downtrend = close < ema20 && ema20 < ema50;

    // -----------------------------
    // MOMENTUM FILTERS
    // -----------------------------
    const rsiBullish = rsi >= 55;
    const rsiBearish = rsi <= 45;
    const volumePower = volume >= avgVolume * 1.2;

    let active = false;
    let confirmed = false;
    let strength = "WEAK";

    // STRONG MOMENTUM
    if (uptrend && rsiBullish && volumePower) {
      active = true;
      confirmed = true;
      strength = "STRONG";
    } else if (downtrend && rsiBearish && volumePower) {
      active = true;
      confirmed = true;
      strength = "STRONG";
    }

    // WEAK / EARLY MOMENTUM
    else if (
      (uptrend && rsiBullish) ||
      (downtrend && rsiBearish)
    ) {
      active = true;
      confirmed = false;
      strength = "WEAK";
    }

    return {
      active,
      confirmed,
      strength,
      trend: uptrend ? "UPTREND" : downtrend ? "DOWNTREND" : "SIDEWAYS",
      volumePower,
      rsi
    };

  } catch (error) {
    return {
      active: false,
      confirmed: false,
      strength: "WEAK",
      reason: "MOMENTUM_ENGINE_ERROR"
    };
  }
}

/**
 * LEGACY ENGINE
 * Backward compatible for old modules
 */
function scanMomentum(data = {}) {
  const price = Number(data.price || 0);
  const currentVolume = Number(data.currentVolume || 0);
  const avgVolume = Number(data.avgVolume || 0);
  const rangeHigh = Number(data.rangeHigh || 0);
  const rangeLow = Number(data.rangeLow || 0);
  const open = Number(data.open || 0);
  const close = Number(data.close || 0);
  const direction = data.direction || "BUY";

  if (
    !price ||
    !close ||
    !open ||
    !avgVolume ||
    (!rangeHigh && !rangeLow)
  ) {
    return { active: false, reason: "INVALID_DATA" };
  }

  const volumeRatio = currentVolume / avgVolume;
  if (volumeRatio < 1.8) {
    return { active: false, reason: "NO_VOLUME_SPIKE" };
  }

  const bodySize = Math.abs(close - open);
  const candleRange = Math.max(
    Math.abs(rangeHigh - rangeLow),
    bodySize
  );

  const bodyStrength = bodySize / candleRange;
  if (bodyStrength < 0.5) {
    return { active: false, reason: "WEAK_CANDLE_BODY" };
  }

  if (direction === "BUY" && close <= rangeHigh) {
    return { active: false, reason: "NO_BREAKOUT" };
  }

  if (direction === "SELL" && close >= rangeLow) {
    return { active: false, reason: "NO_BREAKDOWN" };
  }

  return {
    active: true,
    state: "MOMENTUM_CONFIRMED",
    direction,
    volumeRatio: Number(volumeRatio.toFixed(2)),
    bodyStrength: Number(bodyStrength.toFixed(2)),
  };
}

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
  evaluateMomentumContext,
  scanMomentum
};
