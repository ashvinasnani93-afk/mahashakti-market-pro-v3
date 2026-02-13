// ==========================================
// SIGNAL ROUTING ORCHESTRATOR - INSTITUTIONAL GRADE
// MAHASHAKTI MARKET PRO
// Scanner → Ranking → Institutional → signalDecision → Safety
// ==========================================

const { getScanResults } = require("./marketScanner.service");
const { rankStocks } = require("./rankingEngine.service");
const { finalDecision } = require("../signalDecision.service");
const { calculateIndicators } = require("./indicators.service");

// Optional institutional services (safe import)
let getOIGainers, getPCRData, getMarketBreadth, detectMarketRegime;

try {
  ({ getOIGainers } = require("./oiGainers.service"));
} catch (e) {
  getOIGainers = () => ({ success: false });
}

try {
  ({ getPCRData } = require("./institutional_pcr.service"));
} catch (e) {
  getPCRData = () => ({ pcr: null });
}

try {
  ({ getMarketBreadth } = require("./marketBreadth.service"));
} catch (e) {
  getMarketBreadth = () => ({
    advanceDeclineRatio: 1,
    aboveEMA20Percent: 50,
    aboveEMA50Percent: 50
  });
}

try {
  ({ detectMarketRegime } = require("./marketRegime.service"));
} catch (e) {
  detectMarketRegime = () => ({
    regime: "UNKNOWN",
    confidence: "LOW"
  });
}

// ==========================================
// PROCESS SIGNAL REQUEST - SINGLE SYMBOL
// ==========================================
async function processSignalRequest(symbol, options = {}) {
  try {
    console.log(`[ORCHESTRATOR] 📊 Processing signal for ${symbol}`);

    // Step 1: Get market context
    const marketContext = await getMarketContext();

    // Step 2: Get scan results
    const scanResults = getScanResults();
    
    if (!scanResults.success) {
      console.log("[ORCHESTRATOR] ⚠️ No scan results, using direct quote");
      return processDirectSignal(symbol, marketContext, options);
    }

    // Step 3: Find symbol in scan results
    const stockData = findStockInScan(symbol, scanResults.data);

    if (!stockData) {
      console.log(`[ORCHESTRATOR] ⚠️ ${symbol} not in scan, using direct quote`);
      return processDirectSignal(symbol, marketContext, options);
    }

    // Step 4: Enrich with indicators
    const enrichedData = await enrichWithIndicators(stockData, marketContext);

    // Step 5: Get institutional context
    const institutionalContext = await getInstitutionalContext(symbol);

    // Step 6: Merge all data
    const completeData = {
      ...enrichedData,
      ...institutionalContext,
      regime: marketContext.regime,
      breadth: marketContext.breadth,
      vix: marketContext.vix,
      ...options // User overrides
    };

    // Step 7: Run signal decision engine
    const signal = finalDecision(completeData);

    // Step 8: Add orchestrator metadata
    signal.orchestrator = {
      dataSource: "scanner",
      marketRegime: marketContext.regime,
      breadth: marketContext.breadth,
      institutional: institutionalContext,
      timestamp: new Date().toISOString()
    };

    console.log(`[ORCHESTRATOR] ✅ Signal generated: ${signal.signal} (${signal.confidence})`);

    return signal;

  } catch (error) {
    console.error("[ORCHESTRATOR] ❌ Error:", error.message);
    return {
      signal: "WAIT",
      reason: "Orchestrator error",
      error: error.message
    };
  }
}

// ==========================================
// PROCESS BATCH SIGNALS - MULTIPLE SYMBOLS
// ==========================================
async function processBatchSignals(symbols, options = {}) {
  console.log(`[ORCHESTRATOR] 📊 Processing batch: ${symbols.length} symbols`);

  const results = [];
  const marketContext = await getMarketContext();

  for (const symbol of symbols) {
    try {
      const signal = await processSignalRequest(symbol, options);
      results.push({
        symbol,
        ...signal
      });
    } catch (error) {
      results.push({
        symbol,
        signal: "WAIT",
        error: error.message
      });
    }
  }

  return {
    success: true,
    total: symbols.length,
    signals: results,
    marketContext,
    timestamp: new Date().toISOString()
  };
}

// ==========================================
// GET MARKET CONTEXT
// ==========================================
async function getMarketContext() {
  try {
    // Market regime
    const regimeData = detectMarketRegime();
    
    // Market breadth
    const breadthData = getMarketBreadth();

    // PCR data
    const pcrData = getPCRData();

    // VIX (estimate from NIFTY volatility)
    const vix = estimateVIX();

    return {
      regime: regimeData.regime || "UNKNOWN",
      regimeConfidence: regimeData.confidence || "LOW",
      breadth: {
        advanceDeclineRatio: breadthData.advanceDeclineRatio || 1,
        aboveEMA20Percent: breadthData.aboveEMA20Percent || 50,
        aboveEMA50Percent: breadthData.aboveEMA50Percent || 50
      },
      pcr: pcrData.pcr || null,
      vix: vix,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("[ORCHESTRATOR] Market context error:", error.message);
    return {
      regime: "UNKNOWN",
      breadth: {},
      vix: null
    };
  }
}

// ==========================================
// GET INSTITUTIONAL CONTEXT
// ==========================================
async function getInstitutionalContext(symbol) {
  try {
    const oiData = getOIGainers ? getOIGainers() : null;
    
    let oiContext = {
      isOIGainer: false,
      isOILoser: false,
      oiChange: null
    };

    if (oiData && oiData.gainers) {
      const foundInGainers = oiData.gainers.find(g => g.symbol === symbol);
      if (foundInGainers) {
        oiContext.isOIGainer = true;
        oiContext.oiChange = foundInGainers.oiChange;
      }
    }

    if (oiData && oiData.losers) {
      const foundInLosers = oiData.losers.find(l => l.symbol === symbol);
      if (foundInLosers) {
        oiContext.isOILoser = true;
        oiContext.oiChange = foundInLosers.oiChange;
      }
    }

    return oiContext;
  } catch (error) {
    return {
      isOIGainer: false,
      isOILoser: false,
      oiChange: null
    };
  }
}

// ==========================================
// FIND STOCK IN SCAN RESULTS
// ==========================================
function findStockInScan(symbol, scanData) {
  if (!scanData) return null;

  const upperSymbol = symbol.toUpperCase();

  // Search in all categories
  const categories = [
    scanData.topMovers,
    scanData.volumeSpikes,
    scanData.breakouts,
    scanData.preBreakouts,
    scanData.rangeExpansions,
    scanData.vwapDeviations
  ];

  for (const category of categories) {
    if (Array.isArray(category)) {
      const found = category.find(stock => 
        stock.symbol.toUpperCase() === upperSymbol ||
        stock.originalSymbol?.toUpperCase() === upperSymbol
      );
      
      if (found) return found;
    }
  }

  return null;
}

// ==========================================
// ENRICH WITH INDICATORS
// ==========================================
async function enrichWithIndicators(stockData, marketContext) {
  const { quote, metrics } = stockData;

  // Calculate EMA20, EMA50 (simplified - need historical data for accurate calculation)
  const ema20 = estimateEMA(quote.close, 20);
  const ema50 = estimateEMA(quote.close, 50);

  // Estimate RSI from price action
  const rsi = estimateRSI(metrics);

  // Estimate support and resistance
  const support = quote.low;
  const resistance = quote.high;

  return {
    symbol: stockData.symbol,
    exchange: stockData.exchange,
    
    // OHLC
    open: quote.open,
    high: quote.high,
    low: quote.low,
    close: quote.close,
    prevClose: quote.prevClose,
    
    // Volume
    volume: quote.volume,
    avgVolume: quote.volume * 0.8, // Rough estimate
    
    // Indicators
    ema20,
    ema50,
    rsi,
    
    // Support/Resistance
    support,
    resistance,
    rangeHigh: quote.high,
    rangeLow: quote.low,
    
    // Arrays (simplified - need historical data for full implementation)
    closes: [quote.close],
    highs: [quote.high],
    lows: [quote.low],
    volumes: [quote.volume],
    
    // Metrics from scanner
    ...metrics
  };
}

// ==========================================
// PROCESS DIRECT SIGNAL (Fallback when not in scan)
// ==========================================
async function processDirectSignal(symbol, marketContext, options) {
  console.log(`[ORCHESTRATOR] Using direct signal processing for ${symbol}`);

  // This would need to fetch fresh quote data
  // For now, return WAIT with reason
  return {
    signal: "WAIT",
    reason: "Symbol not in active scan - start scanner for full analysis",
    confidence: "LOW",
    symbol,
    orchestrator: {
      dataSource: "direct",
      marketRegime: marketContext.regime,
      timestamp: new Date().toISOString()
    }
  };
}

// ==========================================
// ESTIMATE EMA (SIMPLIFIED)
// ==========================================
function estimateEMA(price, period) {
  // Rough estimate: EMA ≈ current price with slight bias
  const multiplier = 2 / (period + 1);
  return price * (1 - multiplier * 0.5); // Simplified
}

// ==========================================
// ESTIMATE RSI (FROM METRICS)
// ==========================================
function estimateRSI(metrics) {
  if (!metrics) return 50;

  const { changePercent, positionInRange } = metrics;

  // Base RSI on position and momentum
  let rsi = 50 + (changePercent * 5);

  // Adjust based on position in range
  rsi += (positionInRange - 0.5) * 20;

  // Clamp to 0-100
  return Math.max(0, Math.min(100, rsi));
}

// ==========================================
// ESTIMATE VIX (FROM NIFTY VOLATILITY)
// ==========================================
function estimateVIX() {
  // Check if NIFTY data available
  if (global.latestOHLC && global.latestOHLC["NIFTY"]) {
    const niftyData = global.latestOHLC["NIFTY"];
    
    if (niftyData.high && niftyData.low && niftyData.close) {
      const range = niftyData.high - niftyData.low;
      const rangePercent = (range / niftyData.close) * 100;
      
      // Rough VIX estimate (actual VIX calculation is more complex)
      const vix = rangePercent * 10;
      return parseFloat(vix.toFixed(2));
    }
  }

  return 15; // Default moderate volatility
}

// ==========================================
// GET TOP SIGNALS (FROM RANKED RESULTS)
// ==========================================
async function getTopSignals(limit = 10) {
  try {
    console.log("[ORCHESTRATOR] 🎯 Getting top signals...");

    // Get scan results
    const scanResults = getScanResults();
    
    if (!scanResults.success) {
      return {
        success: false,
        message: "No scan results available"
      };
    }

    // Rank stocks
    const ranked = rankStocks(scanResults);

    if (!ranked.success) {
      return {
        success: false,
        message: "Ranking failed"
      };
    }

    // Get market context
    const marketContext = await getMarketContext();

    // Process top N stocks
    const topStocks = ranked.topRanked.slice(0, limit);
    const signals = [];

    for (const stock of topStocks) {
      const enriched = await enrichWithIndicators(stock, marketContext);
      const institutional = await getInstitutionalContext(stock.symbol);
      
      const completeData = {
        ...enriched,
        ...institutional,
        regime: marketContext.regime,
        breadth: marketContext.breadth,
        vix: marketContext.vix
      };

      const signal = finalDecision(completeData);
      
      signals.push({
        symbol: stock.symbol,
        rank: stock.rank,
        totalScore: stock.totalScore,
        ...signal
      });
    }

    return {
      success: true,
      count: signals.length,
      signals,
      marketContext,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error("[ORCHESTRATOR] ❌ Error:", error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
  processSignalRequest,
  processBatchSignals,
  getTopSignals,
  getMarketContext,
  getInstitutionalContext
};
