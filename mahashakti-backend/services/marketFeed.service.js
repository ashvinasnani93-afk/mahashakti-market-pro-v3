// ==========================================
// MARKET FEED SERVICE (REAL DATA PIPELINE)
// MAHASHAKTI MARKET PRO
// Role: Collect live market data and normalize for signal engine
// ==========================================

const { calculateAllIndicators } = require("./indicators.service");

// This service prepares REAL market data
// and sends clean input to signalDecision.service.js

function buildEngineData(raw = {}) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const normalize = (v) => {
    if (typeof v === "number") return v;
    if (Array.isArray(v) && v.length > 0) return v[v.length - 1];
    return null;
  };

  const normalizeArray = (v) => {
    if (Array.isArray(v)) return v;
    return [];
  };

  // =========================
  // EXTRACT HISTORY ARRAYS
  // =========================
  const closes = normalizeArray(raw.closes);
  const highs = normalizeArray(raw.highs);
  const lows = normalizeArray(raw.lows);
  const volumes = normalizeArray(raw.volumes);

  let indicatorData = {};

  // ==========================================
  // AUTO CALCULATE INDICATORS IF NOT PROVIDED
  // ==========================================
  if (closes.length >= 50) {
    const indicatorResult = calculateAllIndicators({
      closes,
      highs,
      lows,
      volumes,
    });

    if (indicatorResult.success) {
      indicatorData = indicatorResult.indicators;
    }
  }

  return {
    // =====================
    // BASIC IDENTITY
    // =====================
    symbol: raw.symbol || raw.indexName || "UNKNOWN",
    segment: raw.segment || "EQUITY",
    tradeType: raw.tradeType || "INTRADAY",

    // =====================
    // PRICE DATA
    // =====================
    open: normalize(raw.open),
    high: normalize(raw.high),
    low: normalize(raw.low),
    close: normalize(raw.close || raw.spotPrice),
    prevClose: normalize(raw.prevClose),

    // =====================
    // INDICATORS (AUTO FILLED)
    // =====================
   ema20: indicatorData.ema20 ?? normalize(raw.ema20),
ema50: indicatorData.ema50 ?? normalize(raw.ema50),
rsi: indicatorData.rsi ?? normalize(raw.rsi),
atr: indicatorData.atr ?? null,
trend: indicatorData.trend ?? null,
trendStrength: indicatorData.trendStrength ?? null,
volatility: indicatorData.volatility ?? null,
htfAligned: indicatorData.htfAligned ?? false,
volumeConfirmed: indicatorData.volumeConfirmed ?? false,
breakout: indicatorData.breakout ?? false,
breakoutType: indicatorData.breakoutType ?? null,
noTradeZone: indicatorData.noTradeZone ?? false,
confidence: indicatorData.confidence ?? "LOW",
    
    // =====================
    // VOLUME
    // =====================
    volume: normalize(raw.volume),
    avgVolume: normalize(raw.avgVolume),

    // =====================
    // RANGE LEVELS
    // =====================
    rangeHigh: normalize(raw.rangeHigh || raw.high),
    rangeLow: normalize(raw.rangeLow || raw.low),

    // =====================
    // ARRAYS (HISTORY)
    // =====================
    closes,
    highs,
    lows,
    volumes,

    // =====================
    // CONTEXT FLAGS
    // =====================
    isResultDay: raw.isResultDay === true,
    isExpiryDay: raw.isExpiryDay === true,
    tradeCountToday: Number(raw.tradeCountToday || 0),

    // =====================
    // VOLATILITY CONTEXT
    // =====================
    vix: normalize(raw.vix),

    // =====================
    // OPTIONAL INSTITUTIONAL DATA
    // =====================
    fiiNet: normalize(raw.fiiNet),
    diiNet: normalize(raw.diiNet),
    pcrValue: normalize(raw.pcrValue),
  };
}

module.exports = {
  buildEngineData,
};
