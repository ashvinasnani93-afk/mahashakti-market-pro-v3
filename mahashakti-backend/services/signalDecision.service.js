// ==================================================
// SIGNAL DECISION SERVICE - CORE SNIPER ENGINE
// Generates: BUY | STRONG_BUY | SELL | STRONG_SELL
// NO WAIT signals to UI - only actionable
// ==================================================

const { applySafety, getVixSafetyNote } = require("./safetyLayer.service");
const { calculateRiskReward, getSignalGrade } = require("./riskReward.service");
const { detectMarketRegime, isRegimeTradeable } = require("./marketRegime.service");

// ==================================================
// NORMALIZE INPUT VALUES
// ==================================================
function normalizeValue(value) {
  if (typeof value === "number") return value;
  if (Array.isArray(value) && value.length > 0) return value[value.length - 1];
  return null;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

// ==================================================
// TREND CHECK
// ==================================================
function checkTrend(data) {
  const close = normalizeValue(data.close);
  const ema20 = normalizeValue(data.ema20);
  const ema50 = normalizeValue(data.ema50);

  if (!close || !ema20 || !ema50) {
    return { trend: "UNKNOWN", strength: "WEAK" };
  }

  const ema20Above50 = ema20 > ema50;
  const priceAbove20 = close > ema20;
  const emaDiff = Math.abs(ema20 - ema50) / ema50;

  if (priceAbove20 && ema20Above50) {
    const strength = emaDiff > 0.01 ? "STRONG" : "MODERATE";
    return { trend: "UPTREND", strength };
  }

  const ema20Below50 = ema20 < ema50;
  const priceBelow20 = close < ema20;

  if (priceBelow20 && ema20Below50) {
    const strength = emaDiff > 0.01 ? "STRONG" : "MODERATE";
    return { trend: "DOWNTREND", strength };
  }

  return { trend: "SIDEWAYS", strength: "WEAK" };
}

// ==================================================
// RSI CHECK
// ==================================================
function checkRSI(data) {
  const rsi = normalizeValue(data.rsi);
  const trend = data.trend;

  if (typeof rsi !== "number") {
    return { allowed: true, note: "RSI data missing" };
  }

  // Extreme zones block
  if (trend === "UPTREND" && rsi >= 75) {
    return { allowed: false, note: "RSI extreme overbought" };
  }

  if (trend === "DOWNTREND" && rsi <= 25) {
    return { allowed: false, note: "RSI extreme oversold" };
  }

  // Good zones
  if (trend === "UPTREND" && rsi >= 50 && rsi < 70) {
    return { allowed: true, note: "RSI bullish zone", boost: true };
  }

  if (trend === "DOWNTREND" && rsi <= 50 && rsi > 30) {
    return { allowed: true, note: "RSI bearish zone", boost: true };
  }

  return { allowed: true, note: "RSI neutral" };
}

// ==================================================
// VOLUME CHECK
// ==================================================
function checkVolume(data) {
  const volume = normalizeValue(data.volume);
  const avgVolume = normalizeValue(data.avgVolume);

  if (!volume || !avgVolume || avgVolume === 0) {
    return { confirmed: false, level: "UNKNOWN", note: "Volume data missing" };
  }

  const ratio = volume / avgVolume;

  if (ratio >= 2.0) {
    return { confirmed: true, level: "VERY_STRONG", ratio: ratio.toFixed(2), note: "Very high volume" };
  }

  if (ratio >= 1.5) {
    return { confirmed: true, level: "STRONG", ratio: ratio.toFixed(2), note: "High volume" };
  }

  if (ratio >= 1.1) {
    return { confirmed: true, level: "MODERATE", ratio: ratio.toFixed(2), note: "Decent volume" };
  }

  return { confirmed: false, level: "WEAK", ratio: ratio.toFixed(2), note: "Low volume" };
}

// ==================================================
// BREAKOUT CHECK
// ==================================================
function checkBreakout(data) {
  const close = normalizeValue(data.close);
  const rangeHigh = normalizeValue(data.rangeHigh);
  const rangeLow = normalizeValue(data.rangeLow);

  if (!close) {
    return { breakout: false, soft: false, note: "Close missing" };
  }

  // Hard breakout
  if (rangeHigh && close > rangeHigh) {
    return { breakout: true, type: "BULLISH_BREAKOUT", soft: false };
  }

  if (rangeLow && close < rangeLow) {
    return { breakout: true, type: "BEARISH_BREAKDOWN", soft: false };
  }

  // Soft breakout (near range)
  if (rangeHigh && close >= rangeHigh * 0.998) {
    return { breakout: false, soft: true, type: "BULLISH_BREAKOUT" };
  }

  if (rangeLow && close <= rangeLow * 1.002) {
    return { breakout: false, soft: true, type: "BEARISH_BREAKDOWN" };
  }

  return { breakout: false, soft: false, type: null };
}

// ==================================================
// CANDLE STRENGTH CHECK
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

  if (bodyPercent > 60 && changePercent > 0.5) {
    return { strength: "STRONG", changePercent: changePercent.toFixed(2) };
  }

  if (bodyPercent > 40) {
    return { strength: "MODERATE", changePercent: changePercent.toFixed(2) };
  }

  return { strength: "WEAK", changePercent: changePercent.toFixed(2) };
}

// ==================================================
// HTF ALIGNMENT CHECK
// ==================================================
function checkHTFAlignment(data) {
  const { htf15m, htf1h, htfDaily } = data;
  
  let alignedCount = 0;
  let direction = null;
  
  const checkTF = (tf) => {
    if (!tf) return null;
    if (tf.trend === "UPTREND" && tf.ema20 > tf.ema50 && tf.rsi > 50) return "UP";
    if (tf.trend === "DOWNTREND" && tf.ema20 < tf.ema50 && tf.rsi < 50) return "DOWN";
    return null;
  };
  
  const tf15 = checkTF(htf15m);
  const tf1h = checkTF(htf1h);
  const tfDaily = checkTF(htfDaily);
  
  if (tf15) { alignedCount++; direction = tf15; }
  if (tf1h && (tf1h === direction || !direction)) { alignedCount++; direction = tf1h; }
  if (tfDaily && (tfDaily === direction || !direction)) { alignedCount++; direction = tfDaily; }
  
  return {
    aligned: alignedCount >= 2,
    count: alignedCount,
    direction,
    tf15m: tf15,
    tf1h: tf1h,
    tfDaily: tfDaily
  };
}

// ==================================================
// MAIN DECISION ENGINE
// ==================================================
function finalDecision(data = {}) {
  try {
    // Input validation
    if (!data || typeof data !== "object") {
      return { signal: null, reason: "Invalid input data", actionable: false };
    }

    // Normalize inputs
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
      vix: normalizeValue(data.vix)
    };

    // Minimum data check
    if (!normalizedData.close || !normalizedData.ema20 || !normalizedData.ema50) {
      return { signal: null, reason: "Insufficient data", actionable: false };
    }

    // Run all checks
    const trendCheck = checkTrend(normalizedData);
    normalizedData.trend = trendCheck.trend;

    const rsiCheck = checkRSI(normalizedData);
    const volumeCheck = checkVolume(normalizedData);
    const breakoutCheck = checkBreakout(normalizedData);
    const candleCheck = checkCandleStrength(normalizedData);

    // Market regime
    const regime = detectMarketRegime({
      close: normalizedData.close,
      prevClose: normalizedData.prevClose,
      ema20: normalizedData.ema20,
      ema50: normalizedData.ema50,
      candleSizePercent: candleCheck.changePercent,
      vix: normalizedData.vix
    });

    // Scoring system
    let bullScore = 0;
    let bearScore = 0;

    // Trend score (most important)
    if (trendCheck.trend === "UPTREND") {
      bullScore += trendCheck.strength === "STRONG" ? 3 : 2;
    } else if (trendCheck.trend === "DOWNTREND") {
      bearScore += trendCheck.strength === "STRONG" ? 3 : 2;
    }

    // RSI score
    if (rsiCheck.allowed && rsiCheck.boost) {
      if (trendCheck.trend === "UPTREND") bullScore += 1;
      if (trendCheck.trend === "DOWNTREND") bearScore += 1;
    }

    // Volume score
    if (volumeCheck.confirmed) {
      const points = volumeCheck.level === "VERY_STRONG" ? 3 : volumeCheck.level === "STRONG" ? 2 : 1;
      if (trendCheck.trend === "UPTREND") bullScore += points;
      if (trendCheck.trend === "DOWNTREND") bearScore += points;
    }

    // Breakout score
    if (breakoutCheck.breakout) {
      if (breakoutCheck.type === "BULLISH_BREAKOUT") bullScore += 2;
      if (breakoutCheck.type === "BEARISH_BREAKDOWN") bearScore += 2;
    } else if (breakoutCheck.soft) {
      if (breakoutCheck.type === "BULLISH_BREAKOUT") bullScore += 1;
      if (breakoutCheck.type === "BEARISH_BREAKDOWN") bearScore += 1;
    }

    // Candle score
    if (candleCheck.strength === "STRONG") {
      if (trendCheck.trend === "UPTREND") bullScore += 1;
      if (trendCheck.trend === "DOWNTREND") bearScore += 1;
    }

    // Regime bonus
    if (regime.regime === "TRENDING_UP") bullScore += 2;
    if (regime.regime === "TRENDING_DOWN") bearScore += 2;

    // HTF alignment bonus
    if (data.htfAligned) {
      if (trendCheck.trend === "UPTREND") bullScore += 2;
      if (trendCheck.trend === "DOWNTREND") bearScore += 2;
    }

    // Decision logic - Only actionable signals
    let signal = null;
    let confidence = null;
    let reason = null;

    // STRONG BUY: Score >= 7 with breakout OR >= 8
    if (bullScore >= 8 || (bullScore >= 7 && breakoutCheck.breakout)) {
      signal = "STRONG_BUY";
      confidence = "VERY_HIGH";
      reason = `Multi-TF alignment + breakout + volume (Score: ${bullScore})`;
    }
    // BUY: Score >= 5 with volume confirmed
    else if (bullScore >= 5 && volumeCheck.confirmed && rsiCheck.allowed) {
      signal = "BUY";
      confidence = bullScore >= 6 ? "HIGH" : "MEDIUM";
      reason = `Trend + RSI + Volume aligned (Score: ${bullScore})`;
    }
    // STRONG SELL: Score >= 7 with breakdown OR >= 8
    else if (bearScore >= 8 || (bearScore >= 7 && breakoutCheck.breakout)) {
      signal = "STRONG_SELL";
      confidence = "VERY_HIGH";
      reason = `Multi-TF alignment + breakdown + volume (Score: ${bearScore})`;
    }
    // SELL: Score >= 5 with volume confirmed
    else if (bearScore >= 5 && volumeCheck.confirmed && rsiCheck.allowed) {
      signal = "SELL";
      confidence = bearScore >= 6 ? "HIGH" : "MEDIUM";
      reason = `Trend + RSI + Volume aligned (Score: ${bearScore})`;
    }

    // R:R validation
    let rrResult = null;
    if (signal && normalizedData.atr && normalizedData.close) {
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
        signal = null;
        reason = `R:R ratio ${rrResult.ratio} below minimum 1.2`;
      }

      // Upgrade to STRONG if R:R >= 2
      if (rrResult && rrResult.ratio >= 2) {
        if (signal === "BUY") signal = "STRONG_BUY";
        if (signal === "SELL") signal = "STRONG_SELL";
      }
    }

    // Safety layer
    const safetyContext = {
      isResultDay: data.isResultDay === true,
      isExpiryDay: data.isExpiryDay === true,
      tradeCountToday: Number(data.tradeCountToday || 0),
      tradeType: data.tradeType || "INTRADAY",
      vix: normalizedData.vix
    };

    const safetyResult = applySafety({ signal }, safetyContext);

    if (safetyResult.blocked) {
      signal = null;
      reason = `Safety blocked: ${safetyResult.blockedReasons.join(", ")}`;
    }

    // VIX note
    const vixNote = getVixSafetyNote(normalizedData.vix);

    // Return only if actionable
    if (!signal) {
      return {
        signal: null,
        actionable: false,
        reason: reason || "No actionable signal",
        symbol: normalizedData.symbol,
        scores: { bullish: bullScore, bearish: bearScore },
        regime: regime.regime
      };
    }

    return {
      signal,
      actionable: true,
      confidence,
      reason,
      symbol: normalizedData.symbol,
      timestamp: new Date().toISOString(),
      
      analysis: {
        trend: trendCheck,
        rsi: rsiCheck,
        volume: volumeCheck,
        breakout: breakoutCheck,
        candle: candleCheck,
        regime: regime,
        scores: { bullish: bullScore, bearish: bearScore }
      },

      targets: rrResult ? {
        entry: normalizedData.close,
        target: rrResult.target,
        stopLoss: rrResult.stopLoss,
        riskReward: rrResult.ratio
      } : null,

      notes: {
        vix: vixNote,
        safety: safetyContext
      }
    };

  } catch (error) {
    console.error("[SIGNAL] Decision error:", error.message);
    return {
      signal: null,
      actionable: false,
      reason: "System error",
      error: error.message
    };
  }
}

// ==================================================
// PROCESS MULTIPLE STOCKS
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

module.exports = {
  finalDecision,
  processMultipleStocks,
  checkTrend,
  checkRSI,
  checkVolume,
  checkBreakout
};
