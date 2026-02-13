// ==================================================
// SIGNAL DECISION SERVICE – FINAL (ALL CARRIES FIXED)
// MAHASHAKTI MARKET PRO - ENHANCED
// BUY / SELL / STRONG BUY / STRONG SELL / WAIT
// ==================================================

const { applySafety, getVixSafetyNote } = require("./safetyLayer.service");
const { calculateRiskReward, getSignalGrade } = require("./riskReward.service");
const { detectMarketRegime, isRegimeTradeable } = require("./marketRegime.service");

// ==================================================
// CARRY FIX: SAFE REQUIRE FOR OPTIONAL SCANNERS
// App won't crash if these files are missing
// ==================================================
let detectPreBreakout, detectVolumeBuildup, detectRangeCompression, evaluateMomentumContext;

try {
  detectPreBreakout = require("./preBreakout.scanner").detectPreBreakout;
} catch (e) {
  detectPreBreakout = (data) => ({ active: false, preBreakout: false });
}

try {
  detectVolumeBuildup = require("./volumeBuildup.detector").detectVolumeBuildup;
} catch (e) {
  detectVolumeBuildup = (data) => ({ active: false, buildupDetected: false });
}

try {
  detectRangeCompression = require("./rangeCompression.scanner").detectRangeCompression;
} catch (e) {
  detectRangeCompression = (data) => ({ active: false, compressed: false });
}

try {
  evaluateMomentumContext = require("./momentumScanner.service").evaluateMomentumContext;
} catch (e) {
  evaluateMomentumContext = (data) => ({ confirmed: false });
}

// ==================================================
// CARRY FIX #1: NORMALIZE INPUT VALUES
// Handle both arrays and single values
// ==================================================
function normalizeValue(value) {
  if (typeof value === "number") {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[value.length - 1]; // Last value
  }
  return null;
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

// ==================================================
// CARRY FIX #2: SOFTENED TREND CHECK
// No longer requires perfect EMA alignment
// ==================================================
function checkTrendSoft(data) {
  const close = normalizeValue(data.close);
  const ema20 = normalizeValue(data.ema20);
  const ema50 = normalizeValue(data.ema50);

  if (!close || !ema20 || !ema50) {
    return { trend: "UNKNOWN", strength: "WEAK" };
  }

  // UPTREND: Price above EMA20 and EMA20 trending above EMA50
  const ema20Above50 = ema20 > ema50;
  const priceAbove20 = close > ema20;
  const emaDiff = Math.abs(ema20 - ema50) / ema50;

  if (priceAbove20 && ema20Above50) {
    const strength = emaDiff > 0.01 ? "STRONG" : "MODERATE";
    return { trend: "UPTREND", strength };
  }

  // DOWNTREND: Price below EMA20 and EMA20 trending below EMA50
  const ema20Below50 = ema20 < ema50;
  const priceBelow20 = close < ema20;

  if (priceBelow20 && ema20Below50) {
    const strength = emaDiff > 0.01 ? "STRONG" : "MODERATE";
    return { trend: "DOWNTREND", strength };
  }

  // SIDEWAYS: Mixed signals
  return { trend: "SIDEWAYS", strength: "WEAK" };
}

// ==================================================
// CARRY FIX #3: SOFTENED RSI CHECK
// Only extreme zones block trades
// ==================================================
function checkRSISoft(data) {
  const rsi = normalizeValue(data.rsi);
  const trend = data.trend;

  if (typeof rsi !== "number") {
    return { allowed: true, note: "RSI data missing" };
  }

  // Extreme overbought (block BUY)
  if (trend === "UPTREND" && rsi >= 75) {
    return { allowed: false, note: "RSI extreme overbought" };
  }

  // Extreme oversold (block SELL)
  if (trend === "DOWNTREND" && rsi <= 25) {
    return { allowed: false, note: "RSI extreme oversold" };
  }

  // RSI in good zone
  if (trend === "UPTREND" && rsi >= 50 && rsi < 70) {
    return { allowed: true, note: "RSI bullish zone", boost: true };
  }

  if (trend === "DOWNTREND" && rsi <= 50 && rsi > 30) {
    return { allowed: true, note: "RSI bearish zone", boost: true };
  }

  return { allowed: true, note: "RSI neutral" };
}

// ==================================================
// CARRY FIX #4: OPTIONAL BREAKOUT CHECK
// Breakout gives STRONG signal, not mandatory
// ==================================================
function checkBreakoutSoft(data) {
  const close = normalizeValue(data.close);
  const rangeHigh = normalizeValue(data.rangeHigh);
  const rangeLow = normalizeValue(data.rangeLow);

  if (!close) {
    return { breakout: false, soft: false, note: "Close missing" };
  }

  let breakout = false;
  let soft = false;
  let type = null;

  // HARD breakout
  if (rangeHigh && close > rangeHigh) {
    breakout = true;
    type = "BULLISH_BREAKOUT";
  }

  if (rangeLow && close < rangeLow) {
    breakout = true;
    type = "BEARISH_BREAKDOWN";
  }

  // SOFT breakout (near range)
  if (!breakout) {
    if (rangeHigh && close >= rangeHigh * 0.998) {
      soft = true;
      type = "BULLISH_BREAKOUT";
    }

    if (rangeLow && close <= rangeLow * 1.002) {
      soft = true;
      type = "BEARISH_BREAKDOWN";
    }
  }

  return {
    breakout,
    soft,
    type,
    note: breakout ? "Hard breakout" : soft ? "Soft breakout" : "No breakout"
  };
}

// ==================================================
// CARRY FIX #5: VOLUME CONFIRMATION
// Multiple levels: strong, moderate, weak
// ==================================================
function checkVolumeSoft(data) {
  const volume = normalizeValue(data.volume);
  const avgVolume = normalizeValue(data.avgVolume);

  if (!volume || !avgVolume || avgVolume === 0) {
    return { 
      confirmed: false, 
      level: "UNKNOWN",
      note: "Volume data missing" 
    };
  }

  const ratio = volume / avgVolume;

  // Very Strong volume spike
  if (ratio >= 2.0) {
    return { 
      confirmed: true, 
      level: "VERY_STRONG",
      ratio: ratio.toFixed(2),
      note: "Very high volume confirmation"
    };
  }

  // Strong volume spike
  if (ratio >= 1.5) {
    return { 
      confirmed: true, 
      level: "STRONG",
      ratio: ratio.toFixed(2),
      note: "High volume confirmation"
    };
  }

  // Moderate volume
  if (ratio >= 1.1) {
    return { 
      confirmed: true, 
      level: "MODERATE",
      ratio: ratio.toFixed(2),
      note: "Decent volume"
    };
  }

  // Low volume
  return { 
    confirmed: false, 
    level: "WEAK",
    ratio: ratio.toFixed(2),
    note: "Low volume - weak signal"
  };
}

// ==================================================
// CARRY FIX #6: CANDLE STRENGTH CHECK
// ==================================================
function checkCandleStrength(data) {
  const open = normalizeValue(data.open);
  const high = normalizeValue(data.high);
  const low = normalizeValue(data.low);
  const close = normalizeValue(data.close);
  const prevClose = normalizeValue(data.prevClose);

  if (!open || !high || !low || !close || !prevClose) {
    return { strength: "UNKNOWN", note: "Candle data missing" };
  }

  const body = Math.abs(close - open);
  const range = high - low;
  
  if (range === 0) {
    return { strength: "UNKNOWN", note: "Zero range candle" };
  }

  const bodyPercent = (body / range) * 100;
  const changePercent = Math.abs((close - prevClose) / prevClose) * 100;

  // Strong candle
  if (bodyPercent > 60 && changePercent > 0.5) {
    return { 
      strength: "STRONG", 
      bodyPercent: bodyPercent.toFixed(2),
      changePercent: changePercent.toFixed(2),
      note: "Strong candle movement"
    };
  }

  // Moderate candle
  if (bodyPercent > 40) {
    return { 
      strength: "MODERATE",
      bodyPercent: bodyPercent.toFixed(2),
      changePercent: changePercent.toFixed(2),
      note: "Moderate candle"
    };
  }

  // Weak candle
  return { 
    strength: "WEAK",
    bodyPercent: bodyPercent.toFixed(2),
    changePercent: changePercent.toFixed(2),
    note: "Weak candle - indecision"
  };
}

// ==================================================
// HTF ALIGNMENT CHECK (NEW)
// Higher Timeframe alignment
// ==================================================
function checkHTFAlignment(data) {
  const { htf15m, htf1h, htfDaily, trend } = data;
  
  let alignedCount = 0;
  let direction = null;
  const alignments = {};
  
  // Check 15m
  if (htf15m && htf15m.trend === trend) {
    alignedCount++;
    alignments["15m"] = true;
  }
  
  // Check 1h
  if (htf1h && htf1h.trend === trend) {
    alignedCount++;
    alignments["1h"] = true;
  }
  
  // Check Daily
  if (htfDaily && htfDaily.trend === trend) {
    alignedCount++;
    alignments["daily"] = true;
  }
  
  return {
    aligned: alignedCount >= 2,
    count: alignedCount,
    direction: trend,
    alignments
  };
}

// ==================================================
// INSTITUTIONAL LAYER CHECK (NEW)
// OI, PCR, Breadth analysis
// ==================================================
function checkInstitutionalLayer(data) {
  const { oi, oiChange, pcr, breadth, fiiData } = data;
  
  let score = 0;
  const signals = [];
  
  // OI Analysis
  if (oiChange) {
    if (oiChange > 10) {
      score += 2;
      signals.push("OI_BUILDUP");
    } else if (oiChange < -10) {
      score += 1;
      signals.push("OI_UNWINDING");
    }
  }
  
  // PCR Analysis
  if (pcr) {
    if (pcr > 1.2) {
      score += 2;
      signals.push("BULLISH_PCR");
    } else if (pcr < 0.8) {
      score += 2;
      signals.push("BEARISH_PCR");
    }
  }
  
  // Market Breadth
  if (breadth) {
    if (breadth.advanceDeclineRatio > 2) {
      score += 2;
      signals.push("STRONG_BREADTH");
    } else if (breadth.advanceDeclineRatio < 0.5) {
      score += 2;
      signals.push("WEAK_BREADTH");
    }
  }
  
  return {
    active: score >= 3,
    score,
    signals,
    bullish: signals.includes("BULLISH_PCR") || signals.includes("STRONG_BREADTH"),
    bearish: signals.includes("BEARISH_PCR") || signals.includes("WEAK_BREADTH")
  };
}

// ==================================================
// MAIN DECISION ENGINE (CARRY FIX #7)
// Combines all checks with scoring system
// ==================================================
function finalDecision(data = {}) {
  try {
    // =====================================
    // STEP 1: INPUT VALIDATION
    // =====================================
    if (!data || typeof data !== "object") {
      return {
        signal: "WAIT",
        reason: "Invalid input data",
        confidence: "NONE"
      };
    }

    // =====================================
    // STEP 2: NORMALIZE ALL INPUTS
    // FIX: Added volumes, rangeHigh, rangeLow
    // =====================================
    const normalizedData = {
      symbol: data.symbol || "UNKNOWN",
      close: normalizeValue(data.close),
      open: normalizeValue(data.open),
      high: normalizeValue(data.high),
      low: normalizeValue(data.low),
      prevClose: normalizeValue(data.prevClose),
      ema20: normalizeValue(data.ema20),
      ema50: normalizeValue(data.ema50),
      rsi: normalizeValue(data.rsi),
      atr: normalizeValue(data.atr),
      volume: normalizeValue(data.volume),
      avgVolume: normalizeValue(data.avgVolume),
      rangeHigh: normalizeValue(data.rangeHigh),
      rangeLow: normalizeValue(data.rangeLow),
      support: normalizeValue(data.support),
      resistance: normalizeValue(data.resistance),
      vix: normalizeValue(data.vix),
      oi: normalizeValue(data.oi),
      oiChange: normalizeValue(data.oiChange),
      pcr: normalizeValue(data.pcr),
      closes: normalizeArray(data.closes),
      highs: normalizeArray(data.highs),
      lows: normalizeArray(data.lows),
      volumes: normalizeArray(data.volumes),
    };

    // =====================================
    // STEP 3: MINIMUM DATA CHECK
    // =====================================
    if (
      normalizedData.close == null ||
      normalizedData.ema20 == null ||
      normalizedData.ema50 == null
    ) {
      return {
        signal: "WAIT",
        reason: "Insufficient price or EMA data",
        confidence: "NONE"
      };
    }

    // =====================================
    // STEP 4: RUN ALL CHECKS
    // FIX: Trend check FIRST before scanners need it
    // =====================================
    const trendCheck = checkTrendSoft(normalizedData);
    normalizedData.trend = trendCheck.trend;

    const rsiCheck = checkRSISoft(normalizedData);
    const breakoutCheck = checkBreakoutSoft(normalizedData);
    const volumeCheck = checkVolumeSoft(normalizedData);
    const candleCheck = checkCandleStrength(normalizedData);

    // ===============================
    // EARLY + INSTITUTIONAL SCANNERS
    // FIX: Now called AFTER trend is set
    // ===============================
    const preBreakout = detectPreBreakout({
      close: normalizedData.close,
      high: normalizedData.high,
      low: normalizedData.low,
      highs: normalizedData.highs,
      lows: normalizedData.lows,
      volumes: normalizedData.volumes,
      avgVolume: normalizedData.avgVolume,
      resistance: normalizedData.resistance
    });

    const volumeBuildup = detectVolumeBuildup({
      volumes: normalizedData.volumes,
      avgVolume: normalizedData.avgVolume,
      closes: normalizedData.closes
    });

    const compression = detectRangeCompression({
      highs: normalizedData.highs,
      lows: normalizedData.lows,
      closes: normalizedData.closes
    });

    const momentum = evaluateMomentumContext({
      trend: normalizedData.trend,
      rsi: normalizedData.rsi,
      volume: normalizedData.volume,
      avgVolume: normalizedData.avgVolume,
      breakoutAction: normalizedData.trend === "UPTREND" ? "BUY" : "SELL"
    });

    // HTF Alignment
    const htfAlignment = checkHTFAlignment({
      trend: normalizedData.trend,
      htf15m: data.htf15m,
      htf1h: data.htf1h,
      htfDaily: data.htfDaily
    });

    // Institutional Layer
    const institutional = checkInstitutionalLayer({
      oi: normalizedData.oi,
      oiChange: normalizedData.oiChange,
      pcr: normalizedData.pcr,
      breadth: data.breadth,
      fiiData: data.fiiData
    });

    // Market Regime
    const regime = detectMarketRegime({
      close: normalizedData.close,
      prevClose: normalizedData.prevClose,
      ema20: normalizedData.ema20,
      ema50: normalizedData.ema50,
      candleSizePercent: parseFloat(candleCheck.changePercent) || 0,
      vix: normalizedData.vix
    });

    // =====================================
    // STEP 5: SCORING SYSTEM
    // =====================================
    let bullScore = 0;
    let bearScore = 0;
    
    // ================================
    // STRONG SIGNAL BOOSTERS (OPERATOR GRADE)
    // ================================

    // Pre-breakout = early strength
    if (preBreakout && (preBreakout.active === true || preBreakout.preBreakout === true)) {
      if (normalizedData.trend === "UPTREND") bullScore += 2;
      if (normalizedData.trend === "DOWNTREND") bearScore += 2;
    }

    // Volume buildup = quality move
    if (volumeBuildup && (volumeBuildup.active === true || volumeBuildup.buildupDetected === true)) {
      if (normalizedData.trend === "UPTREND") bullScore += 2;
      if (normalizedData.trend === "DOWNTREND") bearScore += 2;
    }

    // Compression = explosive potential
    if (compression && (compression.active === true || compression.compressed === true)) {
      if (normalizedData.trend === "UPTREND") bullScore += 2;
      if (normalizedData.trend === "DOWNTREND") bearScore += 2;
    }

    // Momentum alignment = operator-grade confirmation
    if (momentum && momentum.confirmed === true) {
      if (normalizedData.trend === "UPTREND") bullScore += 3;
      if (normalizedData.trend === "DOWNTREND") bearScore += 3;
    }

    // HTF Alignment bonus
    if (htfAlignment.aligned) {
      if (normalizedData.trend === "UPTREND") bullScore += 2;
      if (normalizedData.trend === "DOWNTREND") bearScore += 2;
    }

    // Institutional layer bonus
    if (institutional.active) {
      if (institutional.bullish) bullScore += 2;
      if (institutional.bearish) bearScore += 2;
    }

    // Regime bonus
    if (regime.regime === "TRENDING_UP") bullScore += 2;
    if (regime.regime === "TRENDING_DOWN") bearScore += 2;

    // Trend Score (Most Important)
    if (trendCheck.trend === "UPTREND") {
      bullScore += trendCheck.strength === "STRONG" ? 3 : 2;
    } else if (trendCheck.trend === "DOWNTREND") {
      bearScore += trendCheck.strength === "STRONG" ? 3 : 2;
    }

    // RSI Score
    if (rsiCheck.allowed && rsiCheck.boost) {
      if (normalizedData.trend === "UPTREND") bullScore += 1;
      if (normalizedData.trend === "DOWNTREND") bearScore += 1;
    }

    // Volume Score
    if (volumeCheck.confirmed) {
      const points = volumeCheck.level === "VERY_STRONG" ? 3 : volumeCheck.level === "STRONG" ? 2 : 1;
      if (normalizedData.trend === "UPTREND") bullScore += points;
      if (normalizedData.trend === "DOWNTREND") bearScore += points;
    }

    // Breakout Score (Bonus for STRONG signals)
    if (breakoutCheck.breakout) {
      if (breakoutCheck.type === "BULLISH_BREAKOUT") bullScore += 2;
      if (breakoutCheck.type === "BEARISH_BREAKDOWN") bearScore += 2;
    } else if (breakoutCheck.soft) {
      if (breakoutCheck.type === "BULLISH_BREAKOUT") bullScore += 1;
      if (breakoutCheck.type === "BEARISH_BREAKDOWN") bearScore += 1;
    }

    // Candle Score
    if (candleCheck.strength === "STRONG") {
      if (normalizedData.trend === "UPTREND") bullScore += 1;
      if (normalizedData.trend === "DOWNTREND") bearScore += 1;
    }

    // =====================================
    // CARRY-3: WAIT TRAP GUARD
    // =====================================
    const weakContext =
      trendCheck.trend === "SIDEWAYS" &&
      !volumeCheck.confirmed &&
      !breakoutCheck.breakout &&
      candleCheck.strength === "WEAK";

    const missingCoreData =
      !normalizedData.close ||
      !normalizedData.ema20 ||
      !normalizedData.ema50 ||
      typeof normalizedData.rsi !== "number";

    if (missingCoreData) {
      return {
        signal: "WAIT",
        confidence: "NONE",
        reason: "Core market data missing",
        symbol: normalizedData.symbol,
        timestamp: new Date().toISOString()
      };
    }

    if (weakContext) {
      return {
        signal: "WAIT",
        confidence: "LOW",
        reason: "No trend, no volume, no breakout — market undecided",
        symbol: normalizedData.symbol,
        timestamp: new Date().toISOString()
      };
    }

    // =====================================
    // STEP 6: DECISION LOGIC
    // =====================================
    let signal = "WAIT";
    let confidence = "LOW";
    let reason = "Market conditions unclear";

    // STRONG BUY (Score >= 6, with breakout)
    if (
      bullScore >= 8 ||
      (bullScore >= 6 && breakoutCheck.breakout) ||
      (bullScore >= 5 && breakoutCheck.soft && breakoutCheck.type === "BULLISH_BREAKOUT")
    ) {
      signal = "STRONG_BUY";
      confidence = "VERY_HIGH";
      reason = `Strong uptrend + breakout + volume (Score: ${bullScore})`;
    }
    // NORMAL BUY (Trend + RSI + Volume aligned)
    else if (
      bullScore >= 3 &&
      rsiCheck.allowed &&
      volumeCheck.confirmed
    ) {
      signal = "BUY";
      confidence = bullScore >= 5 ? "HIGH" : "MEDIUM";
      reason = `Trend + RSI + Volume aligned (Score: ${bullScore})`;
    }
    // STRONG SELL (Score >= 6, with breakdown)
    else if (
      bearScore >= 8 ||
      (bearScore >= 6 && breakoutCheck.breakout) ||
      (bearScore >= 5 && breakoutCheck.soft && breakoutCheck.type === "BEARISH_BREAKDOWN")
    ) {
      signal = "STRONG_SELL";
      confidence = "VERY_HIGH";
      reason = `Strong downtrend + breakdown + volume (Score: ${bearScore})`;
    }
    // NORMAL SELL (Trend + RSI + Volume aligned)
    else if (
      bearScore >= 3 &&
      rsiCheck.allowed &&
      volumeCheck.confirmed
    ) {
      signal = "SELL";
      confidence = bearScore >= 5 ? "HIGH" : "MEDIUM";
      reason = `Trend + RSI + Volume aligned (Score: ${bearScore})`;
    }
    // WAIT (No clear direction)
    else {
      signal = "WAIT";
      confidence = "LOW";
      reason = `Trend weak or conflicting signals (Bull: ${bullScore}, Bear: ${bearScore})`;
    }

    // =====================================
    // STEP 6.5: RISK REWARD VALIDATION
    // =====================================
    let rrResult = null;
    if (signal !== "WAIT" && normalizedData.atr && normalizedData.close) {
      const entry = normalizedData.close;
      const atr = normalizedData.atr;
      
      if (signal === "BUY" || signal === "STRONG_BUY") {
        const target = entry + (atr * 2);
        const stopLoss = entry - atr;
        rrResult = calculateRiskReward(entry, target, stopLoss);
      } else {
        const target = entry - (atr * 2);
        const stopLoss = entry + atr;
        rrResult = calculateRiskReward(entry, target, stopLoss);
      }

      // Reject if R:R < 1.2
      if (rrResult && !rrResult.acceptable) {
        const originalSignal = signal;
        signal = "WAIT";
        reason = `R:R ratio ${rrResult.ratio} below minimum 1.2 (was ${originalSignal})`;
        confidence = "BLOCKED";
      }

      // Upgrade to STRONG if R:R >= 2
      if (rrResult && rrResult.ratio >= 2 && signal !== "WAIT") {
        if (signal === "BUY") signal = "STRONG_BUY";
        if (signal === "SELL") signal = "STRONG_SELL";
      }
    }

    // =====================================
    // STEP 7: SAFETY LAYER
    // =====================================
    const safetyContext = {
      isResultDay: data.isResultDay === true,
      isExpiryDay: data.isExpiryDay === true,
      tradeCountToday: Number(data.tradeCountToday || 0),
      tradeType: data.tradeType || "INTRADAY",
      vix: normalizedData.vix,
    };

    const safeSignal = applySafety({ signal }, safetyContext);

    // If safety blocked the signal
    if (safeSignal.blocked && signal !== "WAIT") {
      reason = `Trade blocked by safety: ${safeSignal.blockedReasons?.join(", ") || "unknown"}`;
      confidence = "BLOCKED";
    }

    // =====================================
    // STEP 8: VIX WARNING (TEXT ONLY)
    // =====================================
    const vixNote = getVixSafetyNote(normalizedData.vix);

    // =====================================
    // STEP 9: FINAL RESPONSE
    // =====================================
    return {
      signal: safeSignal.blocked ? "WAIT" : signal,
      confidence,
      reason,
      actionable: signal !== "WAIT" && !safeSignal.blocked,

      // Detailed breakdown
      analysis: {
        trend: trendCheck,
        rsi: rsiCheck,
        breakout: breakoutCheck,
        volume: volumeCheck,
        candle: candleCheck,
        preBreakout: preBreakout,
        volumeBuildup: volumeBuildup,
        compression: compression,
        momentum: momentum,
        htfAlignment: htfAlignment,
        institutional: institutional,
        regime: regime,
        scores: {
          bullish: bullScore,
          bearish: bearScore,
        },
      },

      // Targets (if available)
      targets: rrResult ? {
        entry: normalizedData.close,
        target: rrResult.target,
        stopLoss: rrResult.stopLoss,
        riskReward: rrResult.ratio
      } : null,

      // Context notes
      notes: {
        vix: vixNote,
        safety: safetyContext,
        warnings: safeSignal.warnings || []
      },

      // Metadata
      symbol: normalizedData.symbol,
      timestamp: new Date().toISOString(),
    };

  } catch (error) {
    console.error("[SIGNAL] finalDecision Error:", error.message);
    
    return {
      signal: "WAIT",
      reason: "System error in decision engine",
      confidence: "ERROR",
      error: error.message,
      actionable: false
    };
  }
}

// ==================================================
// LEGACY SUPPORT: getFinalMarketSignal
// (Kept for backward compatibility)
// ==================================================
function getFinalMarketSignal(dataInput) {
  // Multi-stock scanner logic
  if (Array.isArray(dataInput)) {
    return dataInput.map(stock => finalDecision(stock));
  }

  // Single stock
  return finalDecision(dataInput);
}

// ==================================================
// PROCESS MULTIPLE STOCKS (For Scanner)
// Returns only actionable signals
// ==================================================
function processMultipleStocks(stocksData) {
  const results = [];
  
  for (const stock of stocksData) {
    const decision = finalDecision(stock);
    if (decision.actionable) {
      results.push(decision);
    }
  }
  
  // Sort by confidence
  results.sort((a, b) => {
    const order = { VERY_HIGH: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    return (order[b.confidence] || 0) - (order[a.confidence] || 0);
  });
  
  return results;
}

// ==================================================
// EXPORTS
// ==================================================
module.exports = {
  finalDecision,
  getFinalMarketSignal,
  processMultipleStocks,
  // Export individual checks for testing
  checkTrendSoft,
  checkRSISoft,
  checkVolumeSoft,
  checkBreakoutSoft,
  checkCandleStrength,
  checkHTFAlignment,
  checkInstitutionalLayer
};
