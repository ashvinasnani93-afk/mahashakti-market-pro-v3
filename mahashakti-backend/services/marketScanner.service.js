// ==========================================
// MARKET SCANNER ENGINE - PRODUCTION GRADE
// WITH SINGLETON GUARD & RATE LIMIT PROTECTION
// ==========================================

const { getFullQuote } = require("./angel/angelApi.service");

// ==========================================
// SCANNER CONFIG
// ==========================================
const SCAN_INTERVAL = 60000; // 60 seconds (safe for production)
const VOLUME_SPIKE_THRESHOLD = 1.5;
const BREAKOUT_PROXIMITY = 0.98;
const MIN_LIQUIDITY = 100000;

// ==========================================
// SINGLETON GUARD - PREVENT DOUBLE START
// ==========================================
let scannerActive = false;
let scannerStarting = false;
let scannerInterval = null;
let lastScanResults = null;
let lastScanTime = null;

// ==========================================
// NIFTY 500 STOCKS (TOP LIQUID STOCKS)
// ==========================================
const NIFTY_500_SYMBOLS = [
  // NIFTY 50
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "HINDUNILVR", "ICICIBANK", "KOTAKBANK",
  "SBIN", "BHARTIARTL", "BAJ FINANCE", "ITC", "ASIANPAINT", "LT", "AXISBANK",
  "MARUTI", "TITAN", "SUNPHARMA", "ULTRACEMCO", "NESTLEIND", "WIPRO", "HCLTECH",
  "TECHM", "POWERGRID", "NTPC", "BAJAJFINSV", "ONGC", "ADANIPORTS",
  "COALINDIA", "M&M", "TATASTEEL", "JSWSTEEL", "INDUSINDBK", "HINDALCO", "DRREDDY",
  "CIPLA", "DIVISLAB", "EICHERMOT", "GRASIM", "BPCL", "TATACONSUM", "HEROMOTOCO",
  "SHREECEM", "UPL", "SBILIFE", "APOLLOHOSP", "BRITANNIA", "ADANIENT",
  
  // ADDITIONAL F&O STOCKS
  "VEDL", "TATAPOWER", "SAIL", "CANBK", "PNB", "BANKBARODA", "UNIONBANK",
  "IDFCFIRSTB", "RECLTD", "PFC", "LICHSGFIN", "CHOLAFIN", "MUTHOOTFIN",
  "IDFC", "FEDERALBNK", "AUBANK", "BANDHANBNK", "RBLBANK",
  "IDEA", "ZEEL", "NMDC", "NATIONALUM", "GMRINFRA", "ADANIPOWER",
  "TORNTPOWER", "ADANIGREEN", "IRCTC", "DIXON", "PAYTM", "NYKAA",
  "POLICYBZR", "DMART", "JUBLFOOD", "BERGEPAINT", "PIDILITIND",
  "NAVINFLUOR", "SRF", "DEEPAKNTR", "ATUL", "BALRAMCHIN", "ALKYLAMINE",
  "CHAMBLFERT", "COROMANDEL", "GNFC", "GSFC", "TATACHEM",
  "FACT", "NFL", "RAIN", "NOCIL", "FINEORG", "TEJASNET", "ROUTE", "TANLA",
  "PERSISTENT", "COFORGE", "MPHASIS", "LTTS", "OFSS",
  "MFSL", "CDSL", "CAMS", "MAZDOCK", "CONCOR", "BHARATFORG", "EXIDEIND",
  "AMBUJACEM", "ACC", "RAMCOCEM", "JKCEMENT", "INDIACEM", "ORIENTCEM"
];

// ==========================================
// INDEX SYMBOLS
// ==========================================
const INDEX_SYMBOLS = [
  "NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"
];

// ==========================================
// GET UNIVERSAL WATCHLIST
// ==========================================
function getUniversalWatchlist() {
  return [...NIFTY_500_SYMBOLS, ...INDEX_SYMBOLS];
}

// ==========================================
// START SCANNER (SINGLETON)
// ==========================================
function startScanner() {
  // SINGLETON GUARD
  if (scannerStarting) {
    console.log("[SCANNER] ⚠️ Start already in progress");
    return { success: false, message: "Start already in progress" };
  }

  if (scannerActive) {
    console.log("[SCANNER] ⚠️ Already running");
    return { success: false, message: "Scanner already active" };
  }

  scannerStarting = true;

  try {
    scannerActive = true;
    console.log("[SCANNER] 🚀 Starting Market Scanner Engine");

    // Run first scan after 10 seconds (let WS stabilize)
    setTimeout(() => {
      runScan();
    }, 10000);

    // Schedule periodic scans
    scannerInterval = setInterval(() => {
      runScan();
    }, SCAN_INTERVAL);

    scannerStarting = false;

    return {
      success: true,
      message: "Scanner started",
      interval: SCAN_INTERVAL,
      watchlistSize: getUniversalWatchlist().length
    };

  } catch (error) {
    scannerStarting = false;
    scannerActive = false;
    
    console.error("[SCANNER] ❌ Start error:", error.message);
    
    return {
      success: false,
      error: error.message
    };
  }
}

// ==========================================
// STOP SCANNER
// ==========================================
function stopScanner() {
  if (!scannerActive) {
    return { success: false, message: "Scanner not running" };
  }

  scannerActive = false;
  scannerStarting = false;

  if (scannerInterval) {
    clearInterval(scannerInterval);
    scannerInterval = null;
  }

  console.log("[SCANNER] 🛑 Scanner stopped");

  return { success: true, message: "Scanner stopped" };
}

// ==========================================
// RUN SCAN - CORE LOGIC
// ==========================================
async function runScan() {
  // Check if scanner still active
  if (!scannerActive) {
    console.log("[SCANNER] ⚠️ Scanner not active, skipping scan");
    return;
  }

  try {
    console.log("[SCANNER] 📊 Running market scan...");

    const startTime = Date.now();
    const watchlist = getUniversalWatchlist();

    // Fetch full quotes for all symbols (batch mode)
    const quotesResult = await getFullQuote(watchlist);

    if (!quotesResult.success || !quotesResult.data) {
      console.error("[SCANNER] ❌ Failed to fetch quotes");
      return;
    }

    const duration = Date.now() - startTime;
    console.log(`[SCANNER] ✅ Fetched ${quotesResult.successful} quotes in ${duration}ms`);

    // Process each quote
    const scannedStocks = [];

    for (const quoteData of quotesResult.data) {
      if (!quoteData.success || !quoteData.data) continue;

      const quote = quoteData.data;
      const symbol = quoteData.originalSymbol || quoteData.symbol;

      // Liquidity filter
      if (quote.volume < MIN_LIQUIDITY) {
        continue;
      }

      // Calculate derived metrics
      const metrics = calculateDerivedMetrics(quote);

      // Detect patterns
      const patterns = detectPatterns(quote, metrics);

      scannedStocks.push({
        symbol,
        exchange: quoteData.exchange,
        token: quoteData.token,
        quote,
        metrics,
        patterns,
        timestamp: new Date().toISOString()
      });
    }

    // Sort by relevance
    const sortedResults = sortByRelevance(scannedStocks);

    // Store results
    lastScanResults = {
      timestamp: new Date().toISOString(),
      totalScanned: watchlist.length,
      successful: quotesResult.successful,
      filtered: scannedStocks.length,
      topMovers: sortedResults.topMovers,
      volumeSpikes: sortedResults.volumeSpikes,
      breakouts: sortedResults.breakouts,
      preBreakouts: sortedResults.preBreakouts,
      rangeExpansions: sortedResults.rangeExpansions,
      vwapDeviations: sortedResults.vwapDeviations,
      scanDuration: Date.now() - startTime
    };

    lastScanTime = Date.now();

    console.log(`[SCANNER] ✅ Scan complete: ${scannedStocks.length} stocks processed`);
    console.log(`[SCANNER] 📈 Top Movers: ${sortedResults.topMovers.length}`);
    console.log(`[SCANNER] 🔊 Volume Spikes: ${sortedResults.volumeSpikes.length}`);
    console.log(`[SCANNER] 💥 Breakouts: ${sortedResults.breakouts.length}`);

  } catch (error) {
    console.error("[SCANNER] ❌ Scan error:", error.message);
  }
}

// ==========================================
// CALCULATE DERIVED METRICS
// ==========================================
function calculateDerivedMetrics(quote) {
  const { open, high, low, close, prevClose, volume, vwap } = quote;

  const changePercent = prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : 0;
  const range = high - low;
  const rangePercent = low > 0 ? (range / low) * 100 : 0;
  const positionInRange = range > 0 ? (close - low) / range : 0.5;
  const vwapDeviation = vwap > 0 ? ((close - vwap) / vwap) * 100 : 0;
  const buyingPressure = quote.totalBuyQty > 0 ? 
    quote.totalBuyQty / (quote.totalBuyQty + quote.totalSellQty) : 0.5;
  const estimatedAvgVolume = volume * 0.8;
  const volumeRatio = volume / estimatedAvgVolume;
  const atrEstimate = rangePercent;

  return {
    changePercent: parseFloat(changePercent.toFixed(2)),
    range,
    rangePercent: parseFloat(rangePercent.toFixed(2)),
    positionInRange: parseFloat(positionInRange.toFixed(2)),
    vwapDeviation: parseFloat(vwapDeviation.toFixed(2)),
    buyingPressure: parseFloat(buyingPressure.toFixed(2)),
    volumeRatio: parseFloat(volumeRatio.toFixed(2)),
    atrEstimate: parseFloat(atrEstimate.toFixed(2)),
    isAboveVWAP: close > vwap,
    isBullishCandle: close > open,
    bodyPercent: range > 0 ? Math.abs(close - open) / range * 100 : 0
  };
}

// ==========================================
// DETECT PATTERNS
// ==========================================
function detectPatterns(quote, metrics) {
  const patterns = {
    volumeSpike: false,
    breakout: false,
    preBreakout: false,
    rangeExpansion: false,
    vwapBounce: false,
    strongMomentum: false,
    compression: false
  };

  if (metrics.volumeRatio >= VOLUME_SPIKE_THRESHOLD) {
    patterns.volumeSpike = true;
  }

  if (metrics.positionInRange >= 0.95 && metrics.isBullishCandle) {
    patterns.breakout = true;
  }

  if (metrics.positionInRange >= BREAKOUT_PROXIMITY && metrics.positionInRange < 0.95) {
    patterns.preBreakout = true;
  }

  if (metrics.rangePercent > 2) {
    patterns.rangeExpansion = true;
  }

  if (metrics.isAboveVWAP && Math.abs(metrics.vwapDeviation) < 0.5) {
    patterns.vwapBounce = true;
  }

  if (Math.abs(metrics.changePercent) > 2 && metrics.volumeRatio > 1.2) {
    patterns.strongMomentum = true;
  }

  if (metrics.rangePercent < 1 && metrics.volumeRatio > 1) {
    patterns.compression = true;
  }

  return patterns;
}

// ==========================================
// SORT BY RELEVANCE
// ==========================================
function sortByRelevance(stocks) {
  const topMovers = stocks
    .filter(s => Math.abs(s.metrics.changePercent) > 1)
    .sort((a, b) => Math.abs(b.metrics.changePercent) - Math.abs(a.metrics.changePercent))
    .slice(0, 50);

  const volumeSpikes = stocks
    .filter(s => s.patterns.volumeSpike)
    .sort((a, b) => b.metrics.volumeRatio - a.metrics.volumeRatio)
    .slice(0, 30);

  const breakouts = stocks
    .filter(s => s.patterns.breakout)
    .sort((a, b) => b.metrics.volumeRatio - a.metrics.volumeRatio)
    .slice(0, 20);

  const preBreakouts = stocks
    .filter(s => s.patterns.preBreakout)
    .sort((a, b) => b.metrics.positionInRange - a.metrics.positionInRange)
    .slice(0, 20);

  const rangeExpansions = stocks
    .filter(s => s.patterns.rangeExpansion)
    .sort((a, b) => b.metrics.rangePercent - a.metrics.rangePercent)
    .slice(0, 20);

  const vwapDeviations = stocks
    .filter(s => Math.abs(s.metrics.vwapDeviation) > 1)
    .sort((a, b) => Math.abs(b.metrics.vwapDeviation) - Math.abs(a.metrics.vwapDeviation))
    .slice(0, 20);

  return {
    topMovers,
    volumeSpikes,
    breakouts,
    preBreakouts,
    rangeExpansions,
    vwapDeviations
  };
}

// ==========================================
// GET SCAN RESULTS
// ==========================================
function getScanResults() {
  if (!lastScanResults) {
    return {
      success: false,
      message: "No scan results available. Start scanner first."
    };
  }

  const age = Date.now() - lastScanTime;
  const ageSeconds = Math.floor(age / 1000);

  return {
    success: true,
    age: ageSeconds,
    data: lastScanResults
  };
}

// ==========================================
// GET TOP CANDIDATES (FOR WS FOCUS)
// ==========================================
function getTopCandidates(limit = 100) {
  if (!lastScanResults) {
    return [];
  }

  const candidates = new Set();

  lastScanResults.topMovers?.slice(0, 50).forEach(stock => {
    candidates.add({
      symbol: stock.symbol,
      exchange: stock.exchange,
      token: stock.token,
      reason: `Mover: ${stock.metrics.changePercent}%`
    });
  });

  lastScanResults.volumeSpikes?.slice(0, 30).forEach(stock => {
    candidates.add({
      symbol: stock.symbol,
      exchange: stock.exchange,
      token: stock.token,
      reason: `Volume: ${stock.metrics.volumeRatio}x`
    });
  });

  lastScanResults.breakouts?.slice(0, 20).forEach(stock => {
    candidates.add({
      symbol: stock.symbol,
      exchange: stock.exchange,
      token: stock.token,
      reason: "Breakout"
    });
  });

  const candidateArray = Array.from(candidates);

  return candidateArray.slice(0, limit);
}

// ==========================================
// MANUAL SCAN (ON-DEMAND)
// ==========================================
async function manualScan() {
  console.log("[SCANNER] 🔍 Manual scan triggered");
  await runScan();
  return getScanResults();
}

// ==========================================
// GET SCANNER STATUS
// ==========================================
function getScannerStatus() {
  return {
    active: scannerActive,
    starting: scannerStarting,
    lastScanTime: lastScanTime ? new Date(lastScanTime).toISOString() : null,
    lastScanAge: lastScanTime ? Math.floor((Date.now() - lastScanTime) / 1000) : null,
    interval: SCAN_INTERVAL,
    watchlistSize: getUniversalWatchlist().length
  };
}

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
  startScanner,
  stopScanner,
  runScan,
  manualScan,
  getScanResults,
  getTopCandidates,
  getScannerStatus,
  getUniversalWatchlist,
  NIFTY_500_SYMBOLS,
  INDEX_SYMBOLS
};
