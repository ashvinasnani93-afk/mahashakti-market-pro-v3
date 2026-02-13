// ==========================================
// INDICATORS SERVICE
// MAHASHAKTI MARKET PRO
// Technical indicators: EMA, RSI, ATR
// Pure JavaScript - No external libraries
// ==========================================

// ==========================================
// EMA (Exponential Moving Average)
// ==========================================
function calculateEMA(closes, period) {
  if (!closes || closes.length < period) {
    return null;
  }
  
  const multiplier = 2 / (period + 1);
  
  // Start with SMA for first EMA value
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += closes[i];
  }
  let ema = sum / period;
  
  // Calculate EMA for remaining values
  for (let i = period; i < closes.length; i++) {
    ema = (closes[i] - ema) * multiplier + ema;
  }
  
  return parseFloat(ema.toFixed(2));
}

// ==========================================
// RSI (Relative Strength Index)
// ==========================================
function calculateRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) {
    return null;
  }
  
  let gains = [];
  let losses = [];
  
  // Calculate price changes
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  // Calculate initial average gain and loss
  let avgGain = 0;
  let avgLoss = 0;
  
  for (let i = 0; i < period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  
  avgGain = avgGain / period;
  avgLoss = avgLoss / period;
  
  // Calculate smoothed averages
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }
  
  // Calculate RSI
  if (avgLoss === 0) {
    return 100;
  }
  
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  
  return parseFloat(rsi.toFixed(2));
}

// ==========================================
// ATR (Average True Range)
// ==========================================
function calculateATR(highs, lows, closes, period = 14) {
  if (!highs || !lows || !closes) {
    return null;
  }
  
  if (highs.length < period + 1 || lows.length < period + 1 || closes.length < period + 1) {
    return null;
  }
  
  let trueRanges = [];
  
  // Calculate True Range for each candle
  for (let i = 1; i < closes.length; i++) {
    const highLow = highs[i] - lows[i];
    const highPrevClose = Math.abs(highs[i] - closes[i - 1]);
    const lowPrevClose = Math.abs(lows[i] - closes[i - 1]);
    
    const tr = Math.max(highLow, highPrevClose, lowPrevClose);
    trueRanges.push(tr);
  }
  
  // Calculate initial ATR (simple average)
  let atr = 0;
  for (let i = 0; i < period; i++) {
    atr += trueRanges[i];
  }
  atr = atr / period;
  
  // Calculate smoothed ATR
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }
  
  return parseFloat(atr.toFixed(2));
}

// ==========================================
// VOLATILITY CLASSIFICATION (ATR-Based)
// ==========================================
function classifyVolatility(atr, currentPrice) {
  if (!atr || !currentPrice || currentPrice === 0) {
   return "NORMAL";
  }
  
  // ATR as percentage of price
  const atrPercent = (atr / currentPrice) * 100;
  
  // Classification thresholds
  if (atrPercent >= 2.0) {
    return "EXTREME ";
  } else if (atrPercent >= 1.2) {
    return "HIGH ";
  } else {
    return  "NORMAL ";
  }
}

// ==========================================
// TREND DETECTION
// ==========================================
function detectTrend(closes, ema20, ema50) {
  if (!closes || closes.length === 0 || !ema20 || !ema50) {
    return { trend: "UNKNOWN", strength: "WEAK" };
  }
  
  const currentPrice = closes[closes.length - 1];
  
  // Calculate EMA difference as percentage
  const emaDiff = Math.abs(ema20 - ema50) / ema50;
  
  // UPTREND: Price > EMA20 > EMA50
  if (currentPrice > ema20 && ema20 > ema50) {
    const strength = emaDiff > 0.01 ? "STRONG" : "MODERATE";
    return { trend: "UPTREND", strength };
  }
  
  // DOWNTREND: Price < EMA20 < EMA50
  if (currentPrice < ema20 && ema20 < ema50) {
    const strength = emaDiff > 0.01 ? "STRONG" : "MODERATE";
    return { trend: "DOWNTREND", strength };
  }
  
  // SIDEWAYS
  return { trend: "SIDEWAYS", strength: "WEAK" };
}

// ==========================================
// HTF ALIGNMENT CHECK
// Higher Time Frame alignment
// ==========================================
function checkHTFAlignment(trend, ema20, ema50, rsi) {
  if (trend === "UNKNOWN" || trend === "SIDEWAYS") {
    return false;
  }
  
  // UPTREND alignment: EMA20 > EMA50 and RSI > 50
  if (trend === "UPTREND" && ema20 > ema50 && rsi > 50) {
    return true;
  }
  
  // DOWNTREND alignment: EMA20 < EMA50 and RSI < 50
  if (trend === "DOWNTREND" && ema20 < ema50 && rsi < 50) {
    return true;
  }
  
  return false;
}

// ==========================================
// NO TRADE ZONE DETECTION
// EMA compression, range bound, low volume
// ==========================================
function detectNoTradeZone(data) {
  const { closes, highs, lows, volumes, ema20, ema50, atr } = data;
  
  if (!closes || closes.length < 20) {
    return { noTradeZone: false, reason: "Insufficient data" };
  }
  
  const reasons = [];
  
  // 1. EMA COMPRESSION CHECK
  // When EMA20 and EMA50 are very close (< 0.3% difference)
  if (ema20 && ema50) {
    const emaDiff = Math.abs(ema20 - ema50) / ema50;
    if (emaDiff < 0.003) {
      reasons.push("EMA_COMPRESSION");
    }
  }
  
  // 2. RANGE BOUND CHECK
  // Price oscillating within tight range (last 10 candles)
  if (highs && lows && highs.length >= 10 && lows.length >= 10) {
    const recentHighs = highs.slice(-10);
    const recentLows = lows.slice(-10);
    
    const rangeHigh = Math.max(...recentHighs);
    const rangeLow = Math.min(...recentLows);
    const rangePercent = ((rangeHigh - rangeLow) / rangeLow) * 100;
    
    // If range is less than 0.8%, consider it range bound
    if (rangePercent < 0.8) {
      reasons.push("RANGE_BOUND");
    }
  }
  
  // 3. LOW VOLUME TRAP
  // Volume declining over last 5 candles
  if (volumes && volumes.length >= 10) {
    const recentVolumes = volumes.slice(-5);
    const prevVolumes = volumes.slice(-10, -5);
    
    const recentAvg = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const prevAvg = prevVolumes.reduce((a, b) => a + b, 0) / prevVolumes.length;
    
    // If recent volume is 30% less than previous
    if (recentAvg < prevAvg * 0.7) {
      reasons.push("LOW_VOLUME_TRAP");
    }
  }
  
  // 4. ATR CONTRACTION
  // Very low ATR indicates low volatility / indecision
  if (atr && closes.length > 0) {
    const currentPrice = closes[closes.length - 1];
    const atrPercent = (atr / currentPrice) * 100;
    
    if (atrPercent < 0.4) {
      reasons.push("ATR_CONTRACTION");
    }
  }
  
  // NO TRADE ZONE if any 2 conditions met
  const isNoTradeZone = reasons.length >= 2;
  
  return {
    noTradeZone: isNoTradeZone,
    reasons: reasons,
    reason: reasons.length > 0 ? reasons.join(", ") : "Market conditions favorable"
  };
}

// ==========================================
// CONFIDENCE CALCULATOR
// Based on multiple confluence factors
// ==========================================
function calculateConfidence(data) {
  const { trend, trendStrength, htfAligned, volumeConfirmed, breakout, rsi } = data;
  
  let score = 0;
  
  // Trend strength
  if (trendStrength === "STRONG") {
    score += 3;
  } else if (trendStrength === "MODERATE") {
    score += 2;
  }
  
  // HTF alignment
  if (htfAligned) {
    score += 2;
  }
  
  // Volume confirmation
  if (volumeConfirmed) {
    score += 2;
  }
  
  // Breakout
  if (breakout) {
    score += 2;
  }
  
  // RSI in favorable zone
  if (trend === "UPTREND" && rsi >= 50 && rsi <= 70) {
    score += 1;
  } else if (trend === "DOWNTREND" && rsi <= 50 && rsi >= 30) {
    score += 1;
  }
  
  // Confidence level
  if (score >= 8) {
    return "HIGH";
  } else if (score >= 5) {
    return "MEDIUM";
  } else {
    return "LOW";
  }
}

// ==========================================
// VOLUME CONFIRMATION
// ==========================================
function checkVolumeConfirmation(volumes) {
  if (!volumes || volumes.length < 10) {
    return false;
  }
  
  const recentVolumes = volumes.slice(-5);
  const prevVolumes = volumes.slice(-20, -5);
  
  if (prevVolumes.length === 0) {
    return false;
  }
  
  const recentAvg = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
  const prevAvg = prevVolumes.reduce((a, b) => a + b, 0) / prevVolumes.length;
  
  // Volume should be at least 10% above average
  return recentAvg > prevAvg * 1.1;
}

// ==========================================
// BREAKOUT DETECTION
// ==========================================
function detectBreakout(closes, highs, lows) {
  if (!closes || !highs || !lows || closes.length < 20) {
    return { breakout: false, type: null };
  }
  
  const currentPrice = closes[closes.length - 1];
  
  // Calculate range from last 20 candles (excluding last 2)
  const rangeHighs = highs.slice(-22, -2);
  const rangeLows = lows.slice(-22, -2);
  
  if (rangeHighs.length === 0 || rangeLows.length === 0) {
    return { breakout: false, type: null };
  }
  
  const rangeHigh = Math.max(...rangeHighs);
  const rangeLow = Math.min(...rangeLows);
  
  // Bullish breakout
  if (currentPrice > rangeHigh) {
    return { breakout: true, type: "BULLISH" };
  }
  
  // Bearish breakdown
  if (currentPrice < rangeLow) {
    return { breakout: true, type: "BEARISH" };
  }
  
  return { breakout: false, type: null };
}

// ==========================================
// MAIN INDICATOR CALCULATION
// ==========================================
function calculateAllIndicators(ohlcv) {
  const { opens, highs, lows, closes, volumes } = ohlcv;
  
  if (!closes || closes.length < 50) {
    return {
      success: false,
      error: "Insufficient candle data",
      indicators: null
    };
  }
  
  // Calculate indicators
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const rsi = calculateRSI(closes, 14);
  const atr = calculateATR(highs, lows, closes, 14);
  
  // Get current price
  const currentPrice = closes[closes.length - 1];
  
  // Trend detection
  const trendResult = detectTrend(closes, ema20, ema50);
  
  // Volatility classification
  const volatility = classifyVolatility(atr, currentPrice);
  
  // HTF alignment
  const htfAligned = checkHTFAlignment(trendResult.trend, ema20, ema50, rsi);
  
  // Volume confirmation
  const volumeConfirmed = checkVolumeConfirmation(volumes);
  
  // Breakout detection
  const breakoutResult = detectBreakout(closes, highs, lows);
  
  // No trade zone detection
  const noTradeResult = detectNoTradeZone({
    closes,
    highs,
    lows,
    volumes,
    ema20,
    ema50,
    atr
  });
  
  // Confidence calculation
  const confidence = calculateConfidence({
    trend: trendResult.trend,
    trendStrength: trendResult.strength,
    htfAligned,
    volumeConfirmed,
    breakout: breakoutResult.breakout,
    rsi
  });
  
  return {
    success: true,
    indicators: {
      ema20,
      ema50,
      rsi,
      atr,
      currentPrice,
      trend: trendResult.trend,
      trendStrength: trendResult.strength,
      volatility,
      htfAligned,
      volumeConfirmed,
      breakout: breakoutResult.breakout,
      breakoutType: breakoutResult.type,
      noTradeZone: noTradeResult.noTradeZone,
      noTradeReasons: noTradeResult.reasons,
      confidence
    }
  };
}

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
  calculateEMA,
  calculateRSI,
  calculateATR,
  classifyVolatility,
  detectTrend,
  checkHTFAlignment,
  detectNoTradeZone,
  calculateConfidence,
  checkVolumeConfirmation,
  detectBreakout,
  calculateAllIndicators
};

