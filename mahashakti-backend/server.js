// ==========================================
// MAHASHAKTI MARKET PRO - MAIN SERVER
// INSTITUTIONAL SNIPER ENGINE V2 - FULL VERSION
// All Features + Explosion Engine + Full Market Scan
// ==========================================
require('dotenv').config();

const express = require("express");
const cors = require("cors");

// =======================
// ANGEL ONE SERVICES
// =======================
const { loginWithPassword, generateToken } = require("./services/angel/angelAuth.service");
const { setGlobalTokens, getLtpData, loadStockMaster, loadCommodityMaster, getFullQuote } = require("./services/angel/angelApi.service");
const { connectWebSocket, getWebSocketStatus, subscribeTokens, unsubscribeTokens, getSubscriptionCount, getStabilityLog, resetReconnect } = require("./services/angel/angelWebSocket.service");
const { fetchCandles, fetchMultiTimeframe } = require("./services/angel/angelCandles.service");

// =======================
// SIGNAL & DECISION SERVICES
// =======================
const { finalDecision, getFinalMarketSignal } = require("./services/signalDecision.service");

// Safe require for indicators
let calculateAllIndicators;
try {
  calculateAllIndicators = require("./services/indicators.service").calculateAllIndicators;
} catch (e) {
  calculateAllIndicators = () => ({ success: false });
}

// =======================
// EXPLOSION ENGINE
// =======================
let detectEarlyExpansion, detectHighMomentumRunner, detectOptionAcceleration, detectSwingContinuation, processExplosionScan, explosionToSignal;
try {
  const explosionEngine = require("./services/explosionEngine.service");
  detectEarlyExpansion = explosionEngine.detectEarlyExpansion;
  detectHighMomentumRunner = explosionEngine.detectHighMomentumRunner;
  detectOptionAcceleration = explosionEngine.detectOptionAcceleration;
  detectSwingContinuation = explosionEngine.detectSwingContinuation;
  processExplosionScan = explosionEngine.processExplosionScan;
  explosionToSignal = explosionEngine.explosionToSignal;
} catch (e) {
  console.log("[EXPLOSION] Engine not loaded:", e.message);
  processExplosionScan = () => [];
  explosionToSignal = () => null;
}

// =======================
// MARKET SCANNER
// =======================
let startScanner, stopScanner, runScan, getScanResults, getTopCandidates, getScannerStatus, NIFTY_500_SYMBOLS;
try {
  const marketScanner = require("./services/marketScanner.service");
  startScanner = marketScanner.startScanner;
  stopScanner = marketScanner.stopScanner;
  runScan = marketScanner.runScan;
  getScanResults = marketScanner.getScanResults;
  getTopCandidates = marketScanner.getTopCandidates;
  getScannerStatus = marketScanner.getScannerStatus;
  NIFTY_500_SYMBOLS = marketScanner.NIFTY_500_SYMBOLS;
} catch (e) {
  console.log("[SCANNER] Service not loaded:", e.message);
  startScanner = () => ({ success: false });
  stopScanner = () => ({ success: false });
  runScan = async () => {};
  getScanResults = () => ({ success: false, data: null });
  getTopCandidates = () => [];
  getScannerStatus = () => ({ active: false });
  NIFTY_500_SYMBOLS = [];
}

// =======================
// FOCUS MANAGER
// =======================
let startFocusManager, stopFocusManager, getFocusStatus;
try {
  const focusManager = require("./services/focusWsManager.service");
  startFocusManager = focusManager.startFocusManager;
  stopFocusManager = focusManager.stopFocusManager;
  getFocusStatus = focusManager.getFocusStatus;
} catch (e) {
  startFocusManager = () => ({ success: false });
  stopFocusManager = () => ({ success: false });
  getFocusStatus = () => ({ active: false, subscriptionCount: 0 });
}

// =======================
// TOKEN & SYMBOL SERVICES
// =======================
let initializeTokenService;
try {
  initializeTokenService = require("./services/token.service").initializeTokenService;
} catch (e) {
  initializeTokenService = async () => console.log("[TOKEN] Service not available");
}

// =======================
// SAFE ROUTE REQUIRE
// =======================
const safeRequireRoute = (path) => {
  try {
    return require(path);
  } catch (e) {
    const router = express.Router();
    router.all("*", (req, res) => res.status(404).json({ error: `Route ${path} not available` }));
    return router;
  }
};

// =======================
// APP INITIALIZATION
// =======================
const app = express();
app.use(cors());
app.use(express.json());

// =======================
// GLOBAL STATE
// =======================
global.angelSession = {
  jwtToken: null,
  refreshToken: null,
  feedToken: null,
  clientCode: null,
  apiKey: null,
  isLoggedIn: false,
  wsConnected: false
};

global.latestLTP = {};
global.latestOHLC = {};
global.symbolOpenPrice = {};

// Scanner cache for Screen 1 & 2
let screenResults = {
  screen1: [],  // Universal signals (STRONG_BUY, BUY, STRONG_SELL, SELL)
  screen2: [],  // Explosion signals
  lastScan: null,
  scanDuration: 0
};

// =======================
// ROUTE MOUNTING
// =======================
app.use("/api/option-chain", safeRequireRoute("./routes/optionChain.routes"));
app.use("/api/signal", safeRequireRoute("./routes/signal.routes"));
app.use("/api/signal/intel", safeRequireRoute("./routes/signal.intel.routes"));
app.use("/api/ltp", safeRequireRoute("./routes/ltp.routes"));
app.use("/api/search", safeRequireRoute("./routes/search.routes"));
app.use("/api/option-signal", safeRequireRoute("./routes/optionSignal.routes"));
app.use("/api/exit-engine", safeRequireRoute("./routes/exitEngine.routes"));
app.use("/api/strike/explosion", safeRequireRoute("./routes/strikeExplosion.routes"));

// =======================
// ROOT ENDPOINT
// =======================
app.get("/", (req, res) => {
  res.json({
    status: "LIVE",
    service: "MAHASHAKTI Market Pro API",
    version: "2.0.0",
    description: "Institutional Sniper Engine - Full Market Domination",
    realData: true,
    features: [
      "Full Market Coverage: NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX",
      "All F&O Stocks + High Liquidity Cash Stocks",
      "Commodities: Gold, Silver, Crude, NG",
      "Index Options + Stock Options",
      "Screen 1: Universal Signals (STRONG_BUY, BUY, STRONG_SELL, SELL)",
      "Screen 2: Explosion Engine (EARLY_EXPANSION, HIGH_MOMENTUM, OPTION_ACCELERATION, SWING_CONTINUATION)",
      "WebSocket: Max 50 Subscriptions, Exponential Backoff",
      "Real Indicators: EMA 20/50, RSI 14, ATR 14 (No shortcuts)"
    ],
    endpoints: {
      status: "/api/status",
      wsStability: "/api/status/ws-stability",
      scanner: {
        results: "/api/scanner/results",
        universal: "/api/scanner/universal",
        explosions: "/api/scanner/explosions",
        run: "POST /api/scanner/run"
      },
      signal: "/api/signal?symbol=NIFTY",
      optionChain: "/api/option-chain?symbol=NIFTY"
    }
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now(),
    memory: process.memoryUsage()
  });
});

// =======================
// /api/status - FULL SYSTEM STATUS
// =======================
app.get("/api/status", (req, res) => {
  const wsStatus = getWebSocketStatus();
  const focusStatus = getFocusStatus();
  const scannerStatus = getScannerStatus();
  
  res.json({
    status: true,
    service: "MAHASHAKTI Market Pro",
    version: "2.0.0",
    
    // Angel Session
    angelLogin: global.angelSession?.isLoggedIn || false,
    clientCode: global.angelSession?.clientCode || null,
    jwtToken: global.angelSession?.jwtToken ? "SET" : "NOT_SET",
    feedToken: global.angelSession?.feedToken ? "SET" : "NOT_SET",
    
    // WebSocket Status (CRITICAL)
    wsConnected: wsStatus.connected && !wsStatus.isStale,
    isStale: wsStatus.isStale,
    lastTickAge: wsStatus.lastTickAge,
    tickCount: wsStatus.tickCount,
    subscriptionCount: wsStatus.subscriptionCount,
    maxSubscriptions: wsStatus.maxSubscriptions || 50,
    utilization: wsStatus.utilization || "0%",
    reconnectAttempts: wsStatus.reconnectAttempts || 0,
    errors429: wsStatus.errors429 || 0,
    
    // LTP Cache
    ltpCacheSize: Object.keys(global.latestLTP || {}).length,
    ohlcCacheSize: Object.keys(global.latestOHLC || {}).length,
    
    // Focus Manager
    focusManager: focusStatus.active ? "ACTIVE" : "INACTIVE",
    focusTokens: focusStatus.subscriptionCount || 0,
    
    // Scanner
    scannerActive: scannerStatus.active,
    scannerLastRun: scannerStatus.lastScanTime,
    
    // Screen Results
    scannerResults: {
      universalSignals: screenResults.screen1?.length || 0,
      explosionSignals: screenResults.screen2?.length || 0,
      lastScan: screenResults.lastScan,
      scanDuration: screenResults.scanDuration
    },
    
    timestamp: new Date().toISOString()
  });
});

// =======================
// /api/status/ws-stability - 1 HOUR LOG
// =======================
app.get("/api/status/ws-stability", (req, res) => {
  const hours = parseFloat(req.query.hours) || 1;
  const wsStatus = getWebSocketStatus();
  const log = getStabilityLog(hours);
  
  const summary = {
    totalEvents: log.length,
    connections: log.filter(e => e.event === "CONNECTED").length,
    disconnections: log.filter(e => e.event === "DISCONNECTED").length,
    errors429: log.filter(e => e.event === "ERROR_429").length,
    reconnects: log.filter(e => e.event?.includes("RECONNECT")).length,
    staleDetections: log.filter(e => e.event === "STALE_DETECTED").length
  };
  
  res.json({
    status: true,
    hours,
    wsStatus: {
      connected: wsStatus.connected,
      subscriptionCount: wsStatus.subscriptionCount,
      maxSubscriptions: 50,
      tickCount: wsStatus.tickCount,
      reconnectAttempts: wsStatus.reconnectAttempts,
      errors429: wsStatus.errors429
    },
    summary,
    stable: summary.errors429 === 0 && summary.staleDetections < 3,
    events: log.slice(-100) // Last 100 events
  });
});

// =======================
// SCANNER ROUTES (SCREEN 1 & 2)
// =======================

// Get all scanner results
app.get("/api/scanner/results", (req, res) => {
  res.json({
    status: true,
    screen1: {
      name: "Universal Signals",
      description: "STRONG_BUY, BUY, STRONG_SELL, SELL only - No WAIT",
      signals: screenResults.screen1,
      count: screenResults.screen1?.length || 0
    },
    screen2: {
      name: "Explosion Signals", 
      description: "EARLY_EXPANSION, HIGH_MOMENTUM_RUNNER, OPTION_ACCELERATION, SWING_CONTINUATION",
      signals: screenResults.screen2,
      count: screenResults.screen2?.length || 0
    },
    meta: {
      lastScan: screenResults.lastScan,
      scanDuration: screenResults.scanDuration
    }
  });
});

// Screen 1: Universal Signals only
app.get("/api/scanner/universal", (req, res) => {
  const signals = screenResults.screen1 || [];
  
  res.json({
    status: true,
    screenType: "SCREEN_1_UNIVERSAL",
    signals,
    count: signals.length,
    types: {
      strongBuy: signals.filter(s => s.signal === "STRONG_BUY").length,
      buy: signals.filter(s => s.signal === "BUY").length,
      strongSell: signals.filter(s => s.signal === "STRONG_SELL").length,
      sell: signals.filter(s => s.signal === "SELL").length
    },
    lastScan: screenResults.lastScan
  });
});

// Screen 2: Explosion Signals only
app.get("/api/scanner/explosions", (req, res) => {
  const signals = screenResults.screen2 || [];
  
  res.json({
    status: true,
    screenType: "SCREEN_2_EXPLOSION",
    signals,
    count: signals.length,
    types: {
      earlyExpansion: signals.filter(s => s.type === "EARLY_EXPANSION").length,
      highMomentum: signals.filter(s => s.type?.includes("MOMENTUM")).length,
      optionAcceleration: signals.filter(s => s.type?.includes("OPTION") || s.type?.includes("GAMMA")).length,
      swingContinuation: signals.filter(s => s.type === "SWING_CONTINUATION").length
    },
    lastScan: screenResults.lastScan
  });
});

// Manual scan trigger
app.post("/api/scanner/run", async (req, res) => {
  try {
    console.log("[SCANNER] Manual scan triggered...");
    const startTime = Date.now();
    
    // Run market scan
    await runScan();
    
    // Get scan results
    const scanResult = getScanResults();
    
    // Process for Screen 1 (Universal Signals)
    const screen1 = [];
    
    if (scanResult.success && scanResult.data) {
      const { topMovers = [], volumeSpikes = [], breakouts = [] } = scanResult.data;
      
      // Process top movers through signal decision
      for (const stock of [...topMovers, ...volumeSpikes, ...breakouts].slice(0, 50)) {
        try {
          const signalData = {
            symbol: stock.symbol,
            close: stock.quote?.close || stock.quote?.ltp,
            open: stock.quote?.open,
            high: stock.quote?.high,
            low: stock.quote?.low,
            prevClose: stock.quote?.prevClose,
            volume: stock.quote?.volume,
            avgVolume: stock.metrics?.volumeRatio ? stock.quote?.volume / stock.metrics.volumeRatio : stock.quote?.volume
          };
          
          // Add EMA/RSI if available from LTP cache
          const ohlc = global.latestOHLC[stock.symbol];
          if (ohlc) {
            signalData.ema20 = ohlc.ema20;
            signalData.ema50 = ohlc.ema50;
            signalData.rsi = ohlc.rsi;
            signalData.atr = ohlc.atr;
          }
          
          const decision = finalDecision(signalData);
          
          // Only add actionable signals (no WAIT)
          if (decision.signal && decision.signal !== "WAIT") {
            screen1.push({
              signal: decision.signal,
              symbol: stock.symbol,
              exchange: stock.exchange,
              confidence: decision.confidence,
              reason: decision.reason,
              price: signalData.close,
              change: stock.metrics?.changePercent,
              volumeRatio: stock.metrics?.volumeRatio,
              timestamp: new Date().toISOString()
            });
          }
        } catch (e) {
          // Skip failed signals
        }
      }
    }
    
    // Get explosion signals for Screen 2
    const screen2 = [];
    const candidates = getTopCandidates(30);
    
    for (const candidate of candidates) {
      try {
        const explosionData = {
          symbol: candidate.symbol,
          ltp: global.latestLTP[candidate.symbol] || candidate.quote?.close,
          prevClose: candidate.quote?.prevClose,
          open: candidate.quote?.open,
          high: candidate.quote?.high,
          low: candidate.quote?.low,
          volume: candidate.quote?.volume,
          avgVolume: candidate.metrics?.volumeRatio ? candidate.quote?.volume / candidate.metrics.volumeRatio : candidate.quote?.volume,
          atr: global.latestOHLC[candidate.symbol]?.atr,
          ema20: global.latestOHLC[candidate.symbol]?.ema20,
          ema50: global.latestOHLC[candidate.symbol]?.ema50
        };
        
        const explosions = processExplosionScan(explosionData);
        if (explosions && explosions.length > 0) {
          screen2.push(...explosions.map(e => ({
            ...e,
            symbol: candidate.symbol
          })));
        }
      } catch (e) {
        // Skip
      }
    }
    
    // Update cache
    screenResults = {
      screen1: screen1.slice(0, 50),
      screen2: screen2.slice(0, 50),
      lastScan: new Date().toISOString(),
      scanDuration: Date.now() - startTime
    };
    
    console.log(`[SCANNER] ✅ Scan complete: ${screen1.length} signals, ${screen2.length} explosions`);
    
    res.json({
      status: true,
      message: "Scan completed",
      results: {
        universalSignals: screen1.length,
        explosionSignals: screen2.length,
        duration: screenResults.scanDuration
      }
    });
    
  } catch (err) {
    console.error("[SCANNER] Error:", err.message);
    res.status(500).json({
      status: false,
      error: err.message
    });
  }
});

// =======================
// SIGNAL ENDPOINTS
// =======================
app.get("/api/signal/decide", async (req, res) => {
  try {
    const { symbol } = req.query;
    
    if (!symbol) {
      return res.status(400).json({
        status: false,
        error: "Symbol required. Example: /api/signal/decide?symbol=NIFTY"
      });
    }
    
    // Fetch candles
    const candleResult = await fetchCandles(symbol.toUpperCase(), "FIVE_MINUTE", 100);
    
    if (!candleResult.success || !candleResult.candles || candleResult.candles.length < 50) {
      return res.status(400).json({
        status: false,
        error: "Failed to fetch candle data",
        details: candleResult.error
      });
    }
    
    // Calculate indicators
    const ohlcv = {
      opens: candleResult.candles.map(c => c.open),
      highs: candleResult.candles.map(c => c.high),
      lows: candleResult.candles.map(c => c.low),
      closes: candleResult.candles.map(c => c.close),
      volumes: candleResult.candles.map(c => c.volume)
    };
    
    const indicators = calculateAllIndicators(ohlcv);
    
    if (!indicators.success) {
      return res.status(400).json({
        status: false,
        error: "Failed to calculate indicators"
      });
    }
    
    // Prepare signal data
    const signalData = {
      symbol: symbol.toUpperCase(),
      close: indicators.indicators.currentPrice,
      open: ohlcv.opens[ohlcv.opens.length - 1],
      high: ohlcv.highs[ohlcv.highs.length - 1],
      low: ohlcv.lows[ohlcv.lows.length - 1],
      prevClose: ohlcv.closes[ohlcv.closes.length - 2],
      ema20: indicators.indicators.ema20,
      ema50: indicators.indicators.ema50,
      rsi: indicators.indicators.rsi,
      atr: indicators.indicators.atr,
      volume: indicators.indicators.currentVolume,
      avgVolume: indicators.indicators.avgVolume,
      rangeHigh: Math.max(...ohlcv.highs.slice(-20)),
      rangeLow: Math.min(...ohlcv.lows.slice(-20))
    };
    
    // Get decision
    const decision = finalDecision(signalData);
    
    res.json({
      status: true,
      symbol: symbol.toUpperCase(),
      ...decision,
      indicators: indicators.indicators
    });
    
  } catch (err) {
    res.status(500).json({
      status: false,
      error: err.message
    });
  }
});

// Test signal endpoint
app.get("/api/signal/test", (req, res) => {
  const testData = {
    symbol: "TEST",
    close: 100,
    open: 99,
    high: 101,
    low: 98,
    prevClose: 98.5,
    ema20: 99.5,
    ema50: 98,
    rsi: 62,
    atr: 1.5,
    volume: 150000,
    avgVolume: 100000
  };
  
  const decision = finalDecision(testData);
  
  res.json({
    status: true,
    testData,
    decision
  });
});

// =======================
// WEBSOCKET MANAGEMENT
// =======================
app.post("/api/ws/subscribe", (req, res) => {
  try {
    const { tokens, source } = req.body;
    if (!tokens || !Array.isArray(tokens)) {
      return res.status(400).json({ status: false, error: "tokens array required" });
    }
    const success = subscribeTokens(tokens, source || "api");
    res.json({ status: success, subscribed: tokens.length, total: getSubscriptionCount() });
  } catch (err) {
    res.status(500).json({ status: false, error: err.message });
  }
});

app.post("/api/ws/unsubscribe", (req, res) => {
  try {
    const { tokens, source } = req.body;
    if (!tokens || !Array.isArray(tokens)) {
      return res.status(400).json({ status: false, error: "tokens array required" });
    }
    const success = unsubscribeTokens(tokens, source || "api");
    res.json({ status: success, remaining: getSubscriptionCount() });
  } catch (err) {
    res.status(500).json({ status: false, error: err.message });
  }
});

app.get("/api/ws/subscriptions", (req, res) => {
  const wsStatus = getWebSocketStatus();
  res.json({
    status: true,
    count: wsStatus.subscriptionCount,
    max: 50,
    ltpCacheSize: wsStatus.ltpCacheSize,
    connected: wsStatus.connected
  });
});

app.post("/api/ws/reset", (req, res) => {
  resetReconnect();
  res.json({ status: true, message: "Reconnect counter reset" });
});

// =======================
// FOCUS MANAGER
// =======================
app.post("/api/focus/start", (req, res) => {
  res.json(startFocusManager());
});

app.post("/api/focus/stop", (req, res) => {
  res.json(stopFocusManager());
});

app.get("/api/focus/status", (req, res) => {
  res.json({ status: true, ...getFocusStatus() });
});

// =======================
// ERROR HANDLER
// =======================
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({ status: false, error: err.message || "Internal server error" });
});

// =======================
// ANGEL LOGIN
// =======================
async function performAngelLogin() {
  try {
    const { ANGEL_API_KEY, ANGEL_CLIENT_ID, ANGEL_PASSWORD, ANGEL_TOTP_SECRET } = process.env;

    if (!ANGEL_API_KEY || !ANGEL_CLIENT_ID || !ANGEL_PASSWORD || !ANGEL_TOTP_SECRET) {
      console.log("[AUTH] ⚠️ Angel credentials missing in .env");
      return false;
    }

    console.log("[AUTH] 🔐 Logging into Angel One...");

    const result = await loginWithPassword({
      clientCode: ANGEL_CLIENT_ID,
      password: ANGEL_PASSWORD,
      totpSecret: ANGEL_TOTP_SECRET,
      apiKey: ANGEL_API_KEY
    });

    if (result.success) {
      global.angelSession = {
        jwtToken: result.jwtToken,
        refreshToken: result.refreshToken,
        feedToken: result.feedToken,
        clientCode: result.clientCode,
        apiKey: ANGEL_API_KEY,
        isLoggedIn: true,
        wsConnected: false
      };

      setGlobalTokens(result.jwtToken, ANGEL_API_KEY, result.clientCode);

      console.log("[AUTH] ✅ Angel One Login SUCCESS");
      return true;
    } else {
      console.error("[AUTH] ❌ Angel Login Failed:", result.error);
      return false;
    }

  } catch (err) {
    console.error("[AUTH] ❌ Login Error:", err.message);
    return false;
  }
}

// Auto token refresh
async function autoRefreshToken() {
  try {
    if (!global.angelSession?.refreshToken) return;

    console.log("[AUTH] 🔄 Refreshing token...");

    const result = await generateToken(
      global.angelSession.refreshToken,
      process.env.ANGEL_API_KEY
    );

    if (result.success) {
      global.angelSession.jwtToken = result.jwtToken;
      global.angelSession.refreshToken = result.refreshToken;
      global.angelSession.feedToken = result.feedToken;
      setGlobalTokens(result.jwtToken, process.env.ANGEL_API_KEY);
      console.log("[AUTH] ✅ Token Refreshed");
      
      // Restart WS
      await connectWebSocket(
        result.jwtToken,
        process.env.ANGEL_API_KEY,
        global.angelSession.clientCode,
        result.feedToken
      );
    } else {
      console.error("[AUTH] ❌ Token Refresh Failed");
      await performAngelLogin();
    }
  } catch (err) {
    console.error("[AUTH] ❌ Auto Refresh Error:", err.message);
  }
}

setInterval(autoRefreshToken, 5 * 60 * 60 * 1000);

// =======================
// AUTO SCANNER
// =======================
let autoScannerInterval = null;

function startAutoScanner(intervalMs = 5 * 60 * 1000) {
  if (autoScannerInterval) clearInterval(autoScannerInterval);

  console.log(`[SCANNER] 📊 Auto-scanner started (interval: ${intervalMs / 1000}s)`);

  // Initial scan after 15 seconds
  setTimeout(async () => {
    try {
      await runScan();
      const result = getScanResults();
      console.log(`[SCANNER] ✅ Initial scan complete`);
    } catch (err) {
      console.log("[SCANNER] Initial scan skipped:", err.message);
    }
  }, 15000);

  // Periodic scans
  autoScannerInterval = setInterval(async () => {
    try {
      const startTime = Date.now();
      await runScan();
      console.log(`[SCANNER] ✅ Periodic scan complete (${Date.now() - startTime}ms)`);
    } catch (err) {
      console.error("[SCANNER] Scan error:", err.message);
    }
  }, intervalMs);
}

// =======================
// SERVER STARTUP
// =======================
const PORT = process.env.PORT || 8080;

app.listen(PORT, async () => {
  console.log("=".repeat(60));
  console.log("  MAHASHAKTI MARKET PRO - INSTITUTIONAL SNIPER ENGINE");
  console.log("=".repeat(60));
  console.log(`  Port: ${PORT}`);
  console.log(`  URL: http://localhost:${PORT}`);
  console.log("=".repeat(60));

  try {
    // Step 1: Login
    const loginSuccess = await performAngelLogin();
    if (!loginSuccess) {
      console.log("[STARTUP] ⚠️ Angel login failed — running in LIMITED MODE");
      return;
    }

    // Step 2: Load Masters
    console.log("[STARTUP] 📥 Loading Stock & Commodity Masters...");
    await loadStockMaster();
    await loadCommodityMaster();

    // Step 3: Load Option Master
    console.log("[STARTUP] 📥 Loading Option Master...");
    await initializeTokenService();
    console.log("[STARTUP] ✅ All Masters Loaded");

    // Step 4: Start WebSocket
    console.log("[STARTUP] 🔌 Starting WebSocket...");
    await connectWebSocket(
      global.angelSession.jwtToken,
      process.env.ANGEL_API_KEY,
      global.angelSession.clientCode,
      global.angelSession.feedToken
    );

    // Step 5: Start Focus Manager
    console.log("[STARTUP] 🎯 Starting Focus Manager...");
    startFocusManager();

    // Step 6: Start Market Scanner
    console.log("[STARTUP] 📊 Starting Market Scanner...");
    startScanner();
    
    // Step 7: Start Auto Scanner for Screen Results
    startAutoScanner(5 * 60 * 1000);

    console.log("=".repeat(60));
    console.log("  🟢 SYSTEM READY: Full Market Scan Active");
    console.log("  📊 Screen 1: Universal Signals (STRONG_BUY/BUY/SELL/STRONG_SELL)");
    console.log("  💣 Screen 2: Explosion Engine Active");
    console.log("=".repeat(60));

  } catch (err) {
    console.error("[STARTUP] ❌ Error:", err.message);
  }
});

// =======================
// GRACEFUL SHUTDOWN
// =======================
process.on("SIGTERM", () => {
  console.log("[SHUTDOWN] 🛑 SIGTERM received...");
  if (autoScannerInterval) clearInterval(autoScannerInterval);
  stopScanner();
  stopFocusManager();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[SHUTDOWN] 🛑 SIGINT received...");
  if (autoScannerInterval) clearInterval(autoScannerInterval);
  stopScanner();
  stopFocusManager();
  process.exit(0);
});
