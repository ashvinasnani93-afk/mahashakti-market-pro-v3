// ==========================================
// SCANNER SERVICE - ORCHESTRATES FULL MARKET SCAN
// Coordinates between all engines
// Outputs ONLY actionable signals
// ==========================================

const { finalDecision, processMultipleStocks } = require("./signalDecision.service");
const { processExplosionScan, explosionToSignal } = require("./explosionEngine.service");
const { fetchCandles, fetchMultiTimeframe, extractOHLCV } = require("./angel/angelCandles.service");
const { calculateAllIndicators } = require("./indicators.service");
const { getFnOStocks, getMasterStats } = require("./tokenMaster.service");

// ==========================================
// SCAN RESULTS CACHE
// ==========================================
let lastScanResults = {
  screen1: [],  // Universal signals
  screen2: [],  // Explosion signals
  lastScanTime: null,
  scanDuration: 0
};

// ==========================================
// SCAN SINGLE SYMBOL
// ==========================================
async function scanSymbol(symbol) {
  try {
    // Fetch multi-timeframe candles
    const mtfData = await fetchMultiTimeframe(symbol);
    
    if (!mtfData["5m"]?.success) {
      return { success: false, error: "Failed to fetch candles" };
    }

    // Extract OHLCV from 5m timeframe (primary)
    const ohlcv5m = extractOHLCV(mtfData["5m"].candles);
    
    // Calculate indicators
    const indicators = calculateAllIndicators(ohlcv5m);
    
    if (!indicators.success) {
      return { success: false, error: indicators.error };
    }

    // Get current LTP from WebSocket cache
    const wsLtp = global.latestLTP?.[symbol];
    const currentPrice = wsLtp || indicators.indicators.currentPrice;

    // Prepare data for signal decision
    const signalData = {
      symbol,
      close: currentPrice,
      open: ohlcv5m.opens[ohlcv5m.opens.length - 1],
      high: ohlcv5m.highs[ohlcv5m.highs.length - 1],
      low: ohlcv5m.lows[ohlcv5m.lows.length - 1],
      prevClose: ohlcv5m.closes[ohlcv5m.closes.length - 2],
      ema20: indicators.indicators.ema20,
      ema50: indicators.indicators.ema50,
      rsi: indicators.indicators.rsi,
      atr: indicators.indicators.atr,
      volume: indicators.indicators.currentVolume,
      avgVolume: indicators.indicators.avgVolume,
      rangeHigh: Math.max(...ohlcv5m.highs.slice(-20)),
      rangeLow: Math.min(...ohlcv5m.lows.slice(-20)),
      htfAligned: indicators.indicators.htfAligned,
      vix: global.latestLTP?.["INDIAVIX"] || null
    };

    // Get signal decision
    const decision = finalDecision(signalData);

    // Check for explosions
    const explosionData = {
      symbol,
      ltp: currentPrice,
      prevClose: signalData.prevClose,
      open: signalData.open,
      high: signalData.high,
      low: signalData.low,
      volume: signalData.volume,
      avgVolume: signalData.avgVolume,
      atr: signalData.atr,
      ema20: signalData.ema20,
      ema50: signalData.ema50
    };

    const explosions = processExplosionScan(explosionData);

    return {
      success: true,
      symbol,
      signal: decision.actionable ? decision : null,
      explosions: explosions,
      indicators: indicators.indicators,
      timestamp: new Date().toISOString()
    };

  } catch (err) {
    console.error(`[SCANNER] Error scanning ${symbol}:`, err.message);
    return { success: false, symbol, error: err.message };
  }
}

// ==========================================
// SCAN INDICES
// ==========================================
async function scanIndices() {
  const indices = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX"];
  const results = [];

  for (const index of indices) {
    const result = await scanSymbol(index);
    if (result.success && (result.signal || result.explosions.length > 0)) {
      results.push(result);
    }
    // Small delay
    await new Promise(r => setTimeout(r, 300));
  }

  return results;
}

// ==========================================
// SCAN F&O STOCKS
// ==========================================
async function scanFnOStocks(limit = 20) {
  const fnoStocks = getFnOStocks().slice(0, limit);
  const results = [];

  for (const stock of fnoStocks) {
    const result = await scanSymbol(stock);
    if (result.success && (result.signal || result.explosions.length > 0)) {
      results.push(result);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  return results;
}

// ==========================================
// FULL MARKET SCAN
// ==========================================
async function runFullScan() {
  const startTime = Date.now();
  console.log("[SCANNER] Starting full market scan...");

  const screen1Results = [];  // Actionable signals
  const screen2Results = [];  // Explosion detections

  try {
    // 1. Scan Indices
    console.log("[SCANNER] Scanning indices...");
    const indexResults = await scanIndices();
    
    for (const result of indexResults) {
      if (result.signal?.actionable) {
        screen1Results.push({
          source: "INDEX",
          ...result.signal
        });
      }
      
      for (const explosion of result.explosions) {
        screen2Results.push({
          source: "INDEX",
          symbol: result.symbol,
          ...explosion
        });
      }
    }

    // 2. Scan F&O Stocks
    console.log("[SCANNER] Scanning F&O stocks...");
    const stockResults = await scanFnOStocks(30);
    
    for (const result of stockResults) {
      if (result.signal?.actionable) {
        screen1Results.push({
          source: "FNO_STOCK",
          ...result.signal
        });
      }
      
      for (const explosion of result.explosions) {
        screen2Results.push({
          source: "FNO_STOCK",
          symbol: result.symbol,
          ...explosion
        });
      }
    }

    // Sort by confidence
    screen1Results.sort((a, b) => {
      const order = { VERY_HIGH: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      return (order[b.confidence] || 0) - (order[a.confidence] || 0);
    });

    // Sort explosions by score
    screen2Results.sort((a, b) => (b.score || 0) - (a.score || 0));

    // Update cache
    lastScanResults = {
      screen1: screen1Results,
      screen2: screen2Results,
      lastScanTime: new Date().toISOString(),
      scanDuration: Date.now() - startTime,
      indicesScanned: indexResults.length,
      stocksScanned: stockResults.length
    };

    console.log(`[SCANNER] Scan complete: ${screen1Results.length} signals, ${screen2Results.length} explosions`);

    return lastScanResults;

  } catch (err) {
    console.error("[SCANNER] Scan error:", err.message);
    return {
      screen1: [],
      screen2: [],
      error: err.message,
      lastScanTime: new Date().toISOString()
    };
  }
}

// ==========================================
// GET CACHED RESULTS
// ==========================================
function getScanResults() {
  return lastScanResults;
}

// ==========================================
// GET SCREEN 1 (Universal Signals)
// ==========================================
function getUniversalSignals() {
  return {
    signals: lastScanResults.screen1,
    count: lastScanResults.screen1.length,
    lastScan: lastScanResults.lastScanTime,
    types: {
      strongBuy: lastScanResults.screen1.filter(s => s.signal === "STRONG_BUY").length,
      buy: lastScanResults.screen1.filter(s => s.signal === "BUY").length,
      strongSell: lastScanResults.screen1.filter(s => s.signal === "STRONG_SELL").length,
      sell: lastScanResults.screen1.filter(s => s.signal === "SELL").length
    }
  };
}

// ==========================================
// GET SCREEN 2 (Explosion Signals)
// ==========================================
function getExplosionSignals() {
  return {
    signals: lastScanResults.screen2,
    count: lastScanResults.screen2.length,
    lastScan: lastScanResults.lastScanTime,
    types: {
      earlyExpansion: lastScanResults.screen2.filter(s => s.type === "EARLY_EXPANSION").length,
      highMomentum: lastScanResults.screen2.filter(s => s.type?.includes("MOMENTUM")).length,
      optionAcceleration: lastScanResults.screen2.filter(s => s.type?.includes("OPTION") || s.type?.includes("GAMMA")).length,
      swingContinuation: lastScanResults.screen2.filter(s => s.type === "SWING_CONTINUATION").length
    }
  };
}

// ==========================================
// AUTO SCANNER (Background job)
// ==========================================
let scannerInterval = null;

function startAutoScanner(intervalMs = 5 * 60 * 1000) {
  if (scannerInterval) {
    clearInterval(scannerInterval);
  }

  console.log(`[SCANNER] Auto-scanner started (interval: ${intervalMs / 1000}s)`);

  // Run immediately
  runFullScan();

  // Then run on interval
  scannerInterval = setInterval(() => {
    runFullScan();
  }, intervalMs);
}

function stopAutoScanner() {
  if (scannerInterval) {
    clearInterval(scannerInterval);
    scannerInterval = null;
    console.log("[SCANNER] Auto-scanner stopped");
  }
}

module.exports = {
  scanSymbol,
  scanIndices,
  scanFnOStocks,
  runFullScan,
  getScanResults,
  getUniversalSignals,
  getExplosionSignals,
  startAutoScanner,
  stopAutoScanner
};
