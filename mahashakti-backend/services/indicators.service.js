// ==========================================
// INDICATORS SERVICE - REAL MATH CALCULATIONS
// EMA 20, EMA 50, RSI 14, ATR 14
// NO APPROXIMATIONS - PROPER FORMULAS
// ==========================================

// ==========================================
// EMA (Exponential Moving Average)
// Real formula: EMA = (Close - Previous EMA) * Multiplier + Previous EMA
// Multiplier = 2 / (Period + 1)
// ==========================================
function calculateEMA(closes, period) {
  if (!closes || !Array.isArray(closes) || closes.length < period) {
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
// EMA SERIES (For charting/analysis)
// ==========================================
function calculateEMASeries(closes, period) {
  if (!closes || !Array.isArray(closes) || closes.length < period) {
    return [];
  }
  
  const multiplier = 2 / (period + 1);
  const series = [];
  
  // First value is SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += closes[i];
  }
  let ema = sum / period;
  series.push(ema);
  
  // Calculate rest
  for (let i = period; i < closes.length; i++) {
    ema = (closes[i] - ema) * multiplier + ema;
    series.push(ema);
  }
  
  return series;
}

// ==========================================
// RSI (Relative Strength Index) - WILDER'S FORMULA
// Real calculation with proper smoothing
// ==========================================
function calculateRSI(closes, period = 14) {
  if (!closes || !Array.isArray(closes) || closes.length < period + 1) {
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
  
  // Calculate initial average gain and loss (first period)
  let avgGain = 0;
  let avgLoss = 0;
  
  for (let i = 0; i < period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  
  avgGain = avgGain / period;
  avgLoss = avgLoss / period;
  
  // Calculate smoothed averages (Wilder's smoothing)
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
// ATR (Average True Range) - REAL CALCULATION
// True Range = Max(H-L, |H-PC|, |L-PC|)
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
  
  // Calculate smoothed ATR (Wilder's smoothing)
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }
  
  return parseFloat(atr.toFixed(2));
}

// ==========================================
// VOLUME AVERAGE (20 candle basis)
// ==========================================
function calculateVolumeAverage(volumes, period = 20) {
  if (!volumes || !Array.isArray(volumes) || volumes.length < period) {
    return null;
  }
  
  const recentVolumes = volumes.slice(-period);
  const sum = recentVolumes.reduce((a, b) => a + b, 0);
  
  return Math.round(sum / period);
}

// ==========================================
// CANDLE BODY PERCENTAGE
// Body% = |Close - Open| / (High - Low) * 100
// ==========================================
function calculateBodyPercent(open, high, low, close) {
  if (high === low) return 0;
  
  const body = Math.abs(close - open);
  const range = high - low;
  
  return parseFloat(((body / range) * 100).toFixed(2));
}

// ==========================================
// CLOSE LOCATION VALUE
// Where close is within the range (0-100)
// ==========================================
function calculateCloseLocation(high, low, close) {
  if (high === low) return 50;
  
  const location = ((close - low) / (high - low)) * 100;
  
  return parseFloat(location.toFixed(2));
}

// ==========================================
// TREND DETECTION
// ==========================================
function detectTrend(closes, ema20, ema50) {
  if (!closes || closes.length === 0 || !ema20 || !ema50) {
    return { trend: "UNKNOWN", strength: "WEAK" };
  }
  
  const currentPrice = closes[closes.length - 1];
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
  
  return { trend: "SIDEWAYS", strength: "WEAK" };
}

// ==========================================
// HIGHER TIMEFRAME ALIGNMENT
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
// ==========================================
function detectNoTradeZone(data) {
  const { closes, highs, lows, volumes, ema20, ema50, atr } = data;
  
  if (!closes || closes.length < 20) {
    return { noTradeZone: false, reason: "Insufficient data" };
  }
  
  const reasons = [];
  
  // 1. EMA COMPRESSION (< 0.3% difference)
  if (ema20 && ema50) {
    const emaDiff = Math.abs(ema20 - ema50) / ema50;
    if (emaDiff < 0.003) {
      reasons.push("EMA_COMPRESSION");
    }
  }
  
  // 2. RANGE BOUND (last 10 candles range < 0.8%)
  if (highs && lows && highs.length >= 10 && lows.length >= 10) {
    const recentHighs = highs.slice(-10);
    const recentLows = lows.slice(-10);
    
    const rangeHigh = Math.max(...recentHighs);
    const rangeLow = Math.min(...recentLows);
    const rangePercent = ((rangeHigh - rangeLow) / rangeLow) * 100;
    
    if (rangePercent < 0.8) {
      reasons.push("RANGE_BOUND");
    }
  }
  
  // 3. LOW VOLUME TRAP
  if (volumes && volumes.length >= 10) {
    const recentVolumes = volumes.slice(-5);
    const prevVolumes = volumes.slice(-10, -5);
    
    const recentAvg = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const prevAvg = prevVolumes.reduce((a, b) => a + b, 0) / prevVolumes.length;
    
    if (recentAvg < prevAvg * 0.7) {
      reasons.push("LOW_VOLUME_TRAP");
    }
  }
  
  // 4. ATR CONTRACTION
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
// VOLATILITY CLASSIFICATION
// ==========================================
function classifyVolatility(atr, currentPrice) {
  if (!atr || !currentPrice || currentPrice === 0) {
    return "NORMAL";
  }
  
  const atrPercent = (atr / currentPrice) * 100;
  
  if (atrPercent >= 2.0) {
    return "EXTREME";
  } else if (atrPercent >= 1.2) {
    return "HIGH";
  }
  
  return "NORMAL";
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
    return { breakout: true, type: "BULLISH", level: rangeHigh };
  }
  
  // Bearish breakdown
  if (currentPrice < rangeLow) {
    return { breakout: true, type: "BEARISH", level: rangeLow };
  }
  
  return { breakout: false, type: null };
}

// ==========================================
// CALCULATE ALL INDICATORS
// ==========================================
function calculateAllIndicators(ohlcv) {
  const { opens, highs, lows, closes, volumes } = ohlcv;
  
  if (!closes || closes.length < 50) {
    return {
      success: false,
      error: "Insufficient candle data (need 50+)",
      indicators: null
    };
  }
  
  // Calculate core indicators
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const rsi = calculateRSI(closes, 14);
  const atr = calculateATR(highs, lows, closes, 14);
  const avgVolume = calculateVolumeAverage(volumes, 20);
  
  // Current values
  const currentPrice = closes[closes.length - 1];
  const currentVolume = volumes[volumes.length - 1];
  const latestCandle = {
    open: opens[opens.length - 1],
    high: highs[highs.length - 1],
    low: lows[lows.length - 1],
    close: closes[closes.length - 1]
  };
  
  // Candle analysis
  const bodyPercent = calculateBodyPercent(
    latestCandle.open,
    latestCandle.high,
    latestCandle.low,
    latestCandle.close
  );
  const closeLocation = calculateCloseLocation(
    latestCandle.high,
    latestCandle.low,
    latestCandle.close
  );
  
  // Trend detection
  const trendResult = detectTrend(closes, ema20, ema50);
  
  // HTF alignment
  const htfAligned = checkHTFAlignment(trendResult.trend, ema20, ema50, rsi);
  
  // Volume confirmation
  const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 0;
  const volumeConfirmed = volumeRatio >= 1.5;
  
  // Breakout detection
  const breakoutResult = detectBreakout(closes, highs, lows);
  
  // No trade zone
  const noTradeResult = detectNoTradeZone({
    closes, highs, lows, volumes, ema20, ema50, atr
  });
  
  // Volatility
  const volatility = classifyVolatility(atr, currentPrice);
  
  return {
    success: true,
    indicators: {
      ema20,
      ema50,
      rsi,
      atr,
      avgVolume,
      currentPrice,
      currentVolume,
      volumeRatio: parseFloat(volumeRatio.toFixed(2)),
      bodyPercent,
      closeLocation,
      trend: trendResult.trend,
      trendStrength: trendResult.strength,
      htfAligned,
      volumeConfirmed,
      breakout: breakoutResult.breakout,
      breakoutType: breakoutResult.type,
      breakoutLevel: breakoutResult.level,
      noTradeZone: noTradeResult.noTradeZone,
      noTradeReasons: noTradeResult.reasons,
      volatility
    }
  };
}

module.exports = {
  calculateEMA,
  calculateEMASeries,
  calculateRSI,
  calculateATR,
  calculateVolumeAverage,
  calculateBodyPercent,
  calculateCloseLocation,
  detectTrend,
  checkHTFAlignment,
  detectNoTradeZone,
  classifyVolatility,
  detectBreakout,
  calculateAllIndicators
};
