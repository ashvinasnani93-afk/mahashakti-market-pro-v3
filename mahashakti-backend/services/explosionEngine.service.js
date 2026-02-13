// ==================================================
// EXPLOSION ENGINE - SCREEN 2
// Detects early explosive moves:
// - EARLY_EXPANSION (1.5-2% move detection)
// - HIGH_MOMENTUM_RUNNER (15-20% runners)
// - OPTION_ACCELERATION (premium/OI spikes)
// - SWING_CONTINUATION (daily breakouts)
// ==================================================

// ==================================================
// A) EARLY INTRADAY EXPANSION
// Detect at 1.5-2% move with volume + ATR expansion
// ==================================================
function detectEarlyExpansion(data = {}) {
  const {
    ltp,
    prevClose,
    open,
    high,
    low,
    volume,
    avgVolume,
    atr,
    ema20,
    ema50,
    symbol
  } = data;

  if (!ltp || !prevClose || !volume || !avgVolume || !atr) {
    return { detected: false, reason: "Insufficient data" };
  }

  // Calculate change
  const changePercent = ((ltp - prevClose) / prevClose) * 100;
  const absChange = Math.abs(changePercent);

  // Volume ratio
  const volumeRatio = volume / avgVolume;

  // Range expansion
  const range = high - low;
  const rangeRatio = range / atr;

  // Body percentage
  const body = Math.abs(ltp - open);
  const bodyPercent = range > 0 ? (body / range) * 100 : 0;

  // EMA alignment
  const emaAligned = ema20 && ema50 && (
    (changePercent > 0 && ema20 > ema50) ||
    (changePercent < 0 && ema20 < ema50)
  );

  // EARLY EXPANSION CONDITIONS
  const conditions = {
    change: absChange >= 1.5,           // Change >= 1.5%
    volume: volumeRatio >= 2.0,         // Volume >= 2x avg
    range: rangeRatio >= 1.8,           // Range >= 1.8x ATR
    body: bodyPercent >= 60,            // Body >= 60%
    ema: emaAligned
  };

  const score = Object.values(conditions).filter(Boolean).length;

  if (score >= 4) {
    return {
      detected: true,
      type: "EARLY_EXPANSION",
      symbol,
      direction: changePercent > 0 ? "BULLISH" : "BEARISH",
      changePercent: parseFloat(changePercent.toFixed(2)),
      volumeRatio: parseFloat(volumeRatio.toFixed(2)),
      rangeRatio: parseFloat(rangeRatio.toFixed(2)),
      bodyPercent: parseFloat(bodyPercent.toFixed(2)),
      score,
      confidence: score >= 5 ? "HIGH" : "MEDIUM",
      conditions,
      timestamp: new Date().toISOString()
    };
  }

  return { detected: false, score, reason: "Conditions not met" };
}

// ==================================================
// B) HIGH MOMENTUM RUNNER (15-20%+)
// Detect stocks making big moves early
// ==================================================
function detectHighMomentumRunner(data = {}) {
  const {
    ltp,
    prevClose,
    volume,
    avgVolume,
    atr,
    sectorStrength,
    symbol
  } = data;

  if (!ltp || !prevClose || !volume || !avgVolume) {
    return { detected: false, reason: "Insufficient data" };
  }

  const changePercent = ((ltp - prevClose) / prevClose) * 100;
  const absChange = Math.abs(changePercent);
  const volumeRatio = volume / avgVolume;

  // HIGH MOMENTUM CONDITIONS
  // Stage 1: 8%+ move
  // Stage 2: 15%+ move
  // Stage 3: 20%+ move

  let stage = null;
  let tag = null;

  if (absChange >= 20) {
    stage = 3;
    tag = "EXPLOSIVE_RUNNER";
  } else if (absChange >= 15) {
    stage = 2;
    tag = "HIGH_MOMENTUM_RUNNER";
  } else if (absChange >= 8) {
    stage = 1;
    tag = "MOMENTUM_BUILDING";
  }

  if (!stage) {
    return { detected: false, reason: "Change below threshold" };
  }

  // Additional checks
  const volumeStrong = volumeRatio >= 3.0;
  const rangeExpanded = atr ? (Math.abs(ltp - prevClose) >= atr * 2) : false;

  if (volumeStrong || stage >= 2) {
    return {
      detected: true,
      type: tag,
      symbol,
      direction: changePercent > 0 ? "BULLISH" : "BEARISH",
      stage,
      changePercent: parseFloat(changePercent.toFixed(2)),
      volumeRatio: parseFloat(volumeRatio.toFixed(2)),
      confidence: stage >= 2 ? "HIGH" : "MEDIUM",
      sectorStrength: sectorStrength || "UNKNOWN",
      timestamp: new Date().toISOString()
    };
  }

  return { detected: false, stage, reason: "Volume not confirming" };
}

// ==================================================
// C) OPTION STRIKE ACCELERATION
// Detect premium spike + OI spike + acceleration
// For both INDEX and STOCK options
// ==================================================
function detectOptionAcceleration(data = {}) {
  const {
    optionSymbol,
    optionLtp,
    optionPrevLtp,
    optionVolume,
    optionAvgVolume,
    oi,
    prevOi,
    underlyingChange,
    spread,
    avgSpread,
    isCircuitLocked,
    optionType // CE or PE
  } = data;

  if (!optionLtp || !optionPrevLtp || !optionVolume || !oi) {
    return { detected: false, reason: "Insufficient option data" };
  }

  // Premium change
  const premiumChange = ((optionLtp - optionPrevLtp) / optionPrevLtp) * 100;
  const absPremiumChange = Math.abs(premiumChange);

  // Acceleration ratio (option speed vs underlying)
  const optionSpeed = absPremiumChange;
  const underlyingSpeed = Math.abs(underlyingChange || 0);
  const accelerationRatio = underlyingSpeed > 0 ? optionSpeed / underlyingSpeed : 0;

  // OI change
  const oiChange = prevOi > 0 ? ((oi - prevOi) / prevOi) * 100 : 0;

  // Volume burst
  const volumeRatio = optionAvgVolume > 0 ? optionVolume / optionAvgVolume : 0;

  // Spread check
  const spreadTight = avgSpread ? spread <= avgSpread * 1.5 : true;

  // CONDITIONS
  const conditions = {
    premiumSpike: absPremiumChange >= 25,        // Premium >= 25%
    acceleration: accelerationRatio >= 5,         // 5x underlying speed
    oiSpike: Math.abs(oiChange) >= 15,           // OI change >= 15%
    volumeBurst: volumeRatio >= 3,                // Volume >= 3x avg
    spreadOk: spreadTight,
    notLocked: !isCircuitLocked
  };

  const score = Object.values(conditions).filter(Boolean).length;

  // GAMMA-LIKE MOVE detection
  const isGammaLike = accelerationRatio >= 10 && absPremiumChange >= 50;

  if (score >= 4 || isGammaLike) {
    return {
      detected: true,
      type: isGammaLike ? "GAMMA_LIKE_MOVE" : "OPTION_ACCELERATION",
      symbol: optionSymbol,
      optionType,
      direction: premiumChange > 0 ? "BULLISH" : "BEARISH",
      premiumChange: parseFloat(premiumChange.toFixed(2)),
      accelerationRatio: parseFloat(accelerationRatio.toFixed(2)),
      oiChange: parseFloat(oiChange.toFixed(2)),
      volumeRatio: parseFloat(volumeRatio.toFixed(2)),
      score,
      conditions,
      confidence: score >= 5 || isGammaLike ? "HIGH" : "MEDIUM",
      timestamp: new Date().toISOString()
    };
  }

  return { detected: false, score, reason: "Conditions not met" };
}

// ==================================================
// D) SWING CONTINUATION ENGINE
// Daily breakout with weekly level confirmation
// ==================================================
function detectSwingContinuation(data = {}) {
  const {
    symbol,
    dailyClose,
    weeklyLevel,  // Weekly resistance/support
    dailyEma20,
    dailyEma50,
    dailyVolume,
    dailyAvgVolume,
    dailyRsi
  } = data;

  if (!dailyClose || !dailyEma20 || !dailyEma50) {
    return { detected: false, reason: "Insufficient daily data" };
  }

  // Check breakout above weekly level
  const aboveWeeklyLevel = weeklyLevel ? dailyClose > weeklyLevel : false;

  // EMA alignment on daily
  const emaAligned = dailyEma20 > dailyEma50;
  const priceAboveEma = dailyClose > dailyEma20;

  // Volume confirmation
  const volumeRatio = dailyAvgVolume > 0 ? dailyVolume / dailyAvgVolume : 0;
  const volumeConfirmed = volumeRatio >= 1.8;

  // RSI check
  const rsiGood = dailyRsi > 50 && dailyRsi < 75;

  // CONDITIONS
  const conditions = {
    weeklyBreakout: aboveWeeklyLevel,
    emaAligned: emaAligned,
    priceAboveEma: priceAboveEma,
    volumeConfirmed: volumeConfirmed,
    rsiOk: rsiGood
  };

  const score = Object.values(conditions).filter(Boolean).length;

  if (score >= 3) {
    return {
      detected: true,
      type: "SWING_CONTINUATION",
      symbol,
      direction: "BULLISH",
      dailyClose,
      weeklyLevel,
      ema20: dailyEma20,
      ema50: dailyEma50,
      volumeRatio: parseFloat(volumeRatio.toFixed(2)),
      rsi: dailyRsi,
      score,
      conditions,
      confidence: score >= 4 ? "HIGH" : "MEDIUM",
      timestamp: new Date().toISOString()
    };
  }

  // Check bearish swing
  const belowWeeklyLevel = weeklyLevel ? dailyClose < weeklyLevel : false;
  const emaBearish = dailyEma20 < dailyEma50;
  const priceBelowEma = dailyClose < dailyEma20;
  const rsiBearish = dailyRsi < 50 && dailyRsi > 25;

  const bearConditions = {
    weeklyBreakdown: belowWeeklyLevel,
    emaBearish: emaBearish,
    priceBelowEma: priceBelowEma,
    volumeConfirmed: volumeConfirmed,
    rsiBearish: rsiBearish
  };

  const bearScore = Object.values(bearConditions).filter(Boolean).length;

  if (bearScore >= 3) {
    return {
      detected: true,
      type: "SWING_CONTINUATION",
      symbol,
      direction: "BEARISH",
      dailyClose,
      weeklyLevel,
      score: bearScore,
      conditions: bearConditions,
      confidence: bearScore >= 4 ? "HIGH" : "MEDIUM",
      timestamp: new Date().toISOString()
    };
  }

  return { detected: false, score: Math.max(score, bearScore), reason: "No swing setup" };
}

// ==================================================
// PROCESS ALL EXPLOSION TYPES
// ==================================================
function processExplosionScan(stockData, optionData = null) {
  const results = [];

  // Check early expansion
  const earlyExp = detectEarlyExpansion(stockData);
  if (earlyExp.detected) results.push(earlyExp);

  // Check high momentum
  const highMom = detectHighMomentumRunner(stockData);
  if (highMom.detected) results.push(highMom);

  // Check swing continuation (if daily data available)
  if (stockData.dailyClose) {
    const swing = detectSwingContinuation(stockData);
    if (swing.detected) results.push(swing);
  }

  // Check option acceleration (if option data available)
  if (optionData) {
    const optAcc = detectOptionAcceleration(optionData);
    if (optAcc.detected) results.push(optAcc);
  }

  return results;
}

// ==================================================
// CONVERT EXPLOSION TO SIGNAL
// Map explosion types to actionable signals
// ==================================================
function explosionToSignal(explosion) {
  if (!explosion || !explosion.detected) return null;

  const signalMap = {
    EARLY_EXPANSION: explosion.direction === "BULLISH" ? "STRONG_BUY" : "STRONG_SELL",
    HIGH_MOMENTUM_RUNNER: explosion.direction === "BULLISH" ? "STRONG_BUY" : "STRONG_SELL",
    EXPLOSIVE_RUNNER: explosion.direction === "BULLISH" ? "STRONG_BUY" : "STRONG_SELL",
    MOMENTUM_BUILDING: explosion.direction === "BULLISH" ? "BUY" : "SELL",
    OPTION_ACCELERATION: explosion.direction === "BULLISH" ? "STRONG_BUY" : "STRONG_SELL",
    GAMMA_LIKE_MOVE: explosion.direction === "BULLISH" ? "STRONG_BUY" : "STRONG_SELL",
    SWING_CONTINUATION: explosion.direction === "BULLISH" ? "BUY" : "SELL"
  };

  return {
    signal: signalMap[explosion.type] || "BUY",
    source: "EXPLOSION_ENGINE",
    explosionType: explosion.type,
    ...explosion
  };
}

module.exports = {
  detectEarlyExpansion,
  detectHighMomentumRunner,
  detectOptionAcceleration,
  detectSwingContinuation,
  processExplosionScan,
  explosionToSignal
};
