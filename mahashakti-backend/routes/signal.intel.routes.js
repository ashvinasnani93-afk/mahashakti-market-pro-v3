// ==========================================
// SIGNAL INTEL ROUTES - NEW FILE
// MAHASHAKTI MARKET PRO
// Endpoint: POST /api/signal/intel
// 
// This is a NEW route file - does NOT modify existing signal logic
// Uses existing finalDecision + applySafety + VIX (unchanged)
// ==========================================

const express = require("express");
const router = express.Router();

// NEW: Candle & Indicator Services (new files)
const { fetchCandles, extractOHLCV, getLatestFromCandles } = require("../services/angel/angelCandles.service");
const { calculateAllIndicators } = require("../services/indicators.service");

// EXISTING: Use unchanged services
const { buildEngineData } = require("../services/marketFeed.service");
const { finalDecision } = require("../signalDecision.service");
const { applySafety } = require("../signalSafety.service");
const { getVixSafetyNote } = require("../signalVix.service");

// ==========================================
// CANDLE CACHE (10 second TTL)
// ==========================================
const candleCache = new Map();
const CACHE_TTL = 10 * 1000;

function getCachedCandles(key) {
  const cached = candleCache.get(key);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedCandles(key, data) {
  candleCache.set(key, { data, ts: Date.now() });
  if (candleCache.size > 50) {
    const oldest = candleCache.keys().next().value;
    candleCache.delete(oldest);
  }
}

// TIMEFRAME MAP
const TF_MAP = {
  "1m": "ONE_MINUTE",
  "3m": "THREE_MINUTE", 
  "5m": "FIVE_MINUTE",
  "15m": "FIFTEEN_MINUTE",
  "1h": "ONE_HOUR"
};

// ===============================
// POST /api/signal/intel
// Intelligence Mode - Full Candle Analysis
// ===============================
router.post("/", async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { symbol, timeframe = "5m" } = req.body;

    if (!symbol) {
      return res.status(400).json({
        status: false,
        signal: "WAIT",
        confidence: "NONE",
        reason: "Symbol required",
        mode: "INTELLIGENCE"
      });
    }

    const upperSymbol = symbol.toUpperCase();
    const interval = TF_MAP[timeframe] || "FIVE_MINUTE";
    const cacheKey = `${upperSymbol}_${interval}`;

    console.log(`[INTEL] Processing: ${upperSymbol} @ ${timeframe}`);

    // =====================================
    // STEP 1: FETCH CANDLES (with cache)
    // =====================================
    let candleResult = getCachedCandles(cacheKey);
    
    if (!candleResult) {
      candleResult = await fetchCandles(upperSymbol, interval, 100);
      if (candleResult?.success) {
        setCachedCandles(cacheKey, candleResult);
      }
    }

    // Fallback on failure
    if (!candleResult?.success || candleResult.candles.length < 50) {
      return res.json({
        status: false,
        signal: "WAIT",
        confidence: "NONE",
        reason: candleResult?.error || "Candle fetch failed",
        mode: "INTELLIGENCE"
      });
    }

    // =====================================
    // STEP 2: CALCULATE INDICATORS
    // =====================================
    const ohlcv = extractOHLCV(candleResult.candles);
    const latest = getLatestFromCandles(candleResult.candles);
    const indicators = calculateAllIndicators(ohlcv);

    if (!indicators?.success) {
      return res.json({
        status: false,
        signal: "WAIT", 
        confidence: "NONE",
        reason: "Indicator calculation failed",
        mode: "INTELLIGENCE"
      });
    }

    const ind = indicators.indicators;

    // =====================================
    // STEP 3: BUILD ENGINE DATA
    // Feed to EXISTING finalDecision (unchanged)
    // =====================================
    const engineData = buildEngineData({
      symbol: upperSymbol,
      open: latest.open,
      high: latest.high,
      low: latest.low,
      close: latest.close,
      prevClose: ohlcv.closes[ohlcv.closes.length - 2] || null,
      ema20: ind.ema20,
      ema50: ind.ema50,
      rsi: ind.rsi,
      volume: latest.volume,
      avgVolume: ohlcv.volumes.reduce((a, b) => a + b, 0) / ohlcv.volumes.length,
      rangeHigh: Math.max(...ohlcv.highs.slice(-20)),
      rangeLow: Math.min(...ohlcv.lows.slice(-20)),
      closes: ohlcv.closes,
      highs: ohlcv.highs,
      lows: ohlcv.lows,
      volumes: ohlcv.volumes,
      isResultDay: req.body.isResultDay || false,
      isExpiryDay: req.body.isExpiryDay || false,
      tradeCountToday: req.body.tradeCountToday || 0,
      tradeType: req.body.tradeType || "INTRADAY",
      vix: req.body.vix || null
    });

    // =====================================
    // STEP 4: RUN EXISTING DECISION ENGINE
    // NO CHANGES to finalDecision
    // =====================================
    const result = finalDecision(engineData);

    // =====================================
    // STEP 5: APPLY EXISTING SAFETY LAYER
    // NO CHANGES to applySafety
    // =====================================
    const safetyCtx = {
      isResultDay: req.body.isResultDay || false,
      isExpiryDay: req.body.isExpiryDay || false,
      tradeCountToday: req.body.tradeCountToday || 0,
      tradeType: req.body.tradeType || "INTRADAY",
      vix: req.body.vix || null
    };
    const safeResult = applySafety(result, safetyCtx);

    // =====================================
    // STEP 6: EXISTING VIX LAYER
    // NO CHANGES to getVixSafetyNote
    // =====================================
    const vixNote = getVixSafetyNote(req.body.vix);

    const execTime = Date.now() - startTime;
    console.log(`[INTEL] ✅ ${upperSymbol}: ${safeResult.signal} in ${execTime}ms`);

    // =====================================
    // STEP 7: RESPONSE (same structure as simple)
    // =====================================
    return res.json({
      status: true,
      symbol: upperSymbol,
      signal: safeResult.signal,
      confidence: result.confidence,
      reason: result.reason,
      analysis: {
        ...result.analysis,
        intel: {
          ema20: ind.ema20,
          ema50: ind.ema50,
          rsi: ind.rsi,
          atr: ind.atr,
          trend: ind.trend,
          volatility: ind.volatility,
          htfAligned: ind.htfAligned,
          noTradeZone: ind.noTradeZone
        }
      },
      notes: {
        ...result.notes,
        vix: vixNote,
        safety: safeResult.warnings || [],
        timeframe,
        candleCount: candleResult.candleCount,
        execTime: `${execTime}ms`
      },
      timestamp: new Date().toISOString(),
      mode: "INTELLIGENCE"
    });

  } catch (err) {
    console.error(`[INTEL] Error: ${err.message}`);
    return res.status(500).json({
      status: false,
      signal: "WAIT",
      confidence: "NONE", 
      reason: "Intel engine error",
      mode: "INTELLIGENCE"
    });
  }
});

// Health check
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Signal Intelligence",
    cacheSize: candleCache.size
  });
});

module.exports = router;

