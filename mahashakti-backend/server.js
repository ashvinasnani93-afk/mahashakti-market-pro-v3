// ==========================================
// MAHASHAKTI MARKET PRO - MAIN SERVER
// INSTITUTIONAL SNIPER ENGINE V2
// Full Market Coverage + Explosion Detection
// ==========================================
require('dotenv').config();

const express = require("express");
const cors = require("cors");

// Angel One Services
const { loginWithPassword, generateToken } = require("./services/angel/angelAuth.service");
const { setGlobalTokens, getLtpData, loadStockMaster, loadCommodityMaster } = require("./services/angel/angelApi.service");
const { connectWebSocket, getWebSocketStatus, subscribeTokens, unsubscribeTokens, getSubscriptionCount } = require("./services/angel/angelWebSocket.service");

// Token & Symbol Services - Safe require
let initializeTokenService, setAllSymbols;
try {
  initializeTokenService = require("./services/token.service").initializeTokenService;
} catch (e) {
  initializeTokenService = async () => { console.log("[TOKEN] Token service not found, using Angel master"); };
}
try {
  setAllSymbols = require("./services/symbol.service").setAllSymbols;
} catch (e) {
  setAllSymbols = () => {};
}

// Signal Services
const { finalDecision, getFinalMarketSignal } = require("./services/signalDecision.service");

// Explosion Engine
let processExplosionScan, explosionToSignal;
try {
  const explosionEngine = require("./services/explosionEngine.service");
  processExplosionScan = explosionEngine.processExplosionScan;
  explosionToSignal = explosionEngine.explosionToSignal;
} catch (e) {
  processExplosionScan = () => [];
  explosionToSignal = () => null;
}

// Focus Manager
let startFocusManager, stopFocusManager, getFocusStatus;
try {
  const focusManager = require("./services/focusWsManager.service");
  startFocusManager = focusManager.startFocusManager;
  stopFocusManager = focusManager.stopFocusManager;
  getFocusStatus = focusManager.getFocusStatus;
} catch (e) {
  startFocusManager = () => ({ success: false, message: "Focus manager not available" });
  stopFocusManager = () => ({ success: false });
  getFocusStatus = () => ({ active: false });
}

// Market Scanner
let getTopCandidates, runMarketScan;
try {
  const marketScanner = require("./services/marketScanner.service");
  getTopCandidates = marketScanner.getTopCandidates;
  runMarketScan = marketScanner.runMarketScan;
} catch (e) {
  getTopCandidates = () => [];
  runMarketScan = async () => ({ signals: [] });
}

// API Routes - Safe require with fallbacks
const safeRequireRoute = (path) => {
  try {
    return require(path);
  } catch (e) {
    const router = express.Router();
    router.all("*", (req, res) => res.status(404).json({ error: "Route not available" }));
    return router;
  }
};

const optionChainRoutes = safeRequireRoute("./routes/optionChain.routes");
const signalRoutes = safeRequireRoute("./routes/signal.routes");
const ltpRoutes = safeRequireRoute("./routes/ltp.routes");
const signalIntelRoutes = safeRequireRoute("./routes/signal.intel.routes");
const searchRoutes = safeRequireRoute("./routes/search.routes");
const optionSignalRoutes = safeRequireRoute("./routes/optionSignal.routes");
const exitEngineRoutes = safeRequireRoute("./routes/exitEngine.routes");
const strikeExplosionRoutes = safeRequireRoute("./routes/strikeExplosion.routes");
const scannerRoutes = safeRequireRoute("./routes/scanner.routes");

// ==========================================
// APP INITIALIZATION
// ==========================================
const app = express();
app.use(cors());
app.use(express.json());

// Route Mounting
app.use("/api/search", searchRoutes);
app.use("/api/option-signal", optionSignalRoutes);
app.use("/api/exit-engine", exitEngineRoutes);
app.use("/api/strike/explosion", strikeExplosionRoutes);
app.use("/api/option-chain", optionChainRoutes);
app.use("/api/signal", signalRoutes);
app.use("/api/signal/intel", signalIntelRoutes);
app.use("/api/ltp", ltpRoutes);
app.use("/api/scanner", scannerRoutes);

// ==========================================
// GLOBAL STATE
// ==========================================
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

// Scanner cache
let scannerResults = {
  screen1: [],  // Universal signals (STRONG_BUY, BUY, STRONG_SELL, SELL)
  screen2: [],  // Explosion signals
  lastScan: null,
  scanDuration: 0
};

// ==========================================
// BASIC ROUTES
// ==========================================
app.get("/", (req, res) => {
  res.json({
    status: "LIVE",
    service: "MAHASHAKTI Market Pro API",
    version: "2.0.0",
    description: "Institutional Sniper Engine",
    realData: true,
    features: [
      "Full Market Coverage (NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX)",
      "All F&O Stocks + Cash Stocks + Commodities",
      "Actionable Signals Only (STRONG_BUY, BUY, STRONG_SELL, SELL)",
      "Explosion Engine (Early Expansion, High Momentum, Option Acceleration)",
      "WebSocket Max 50 Subscriptions with Exponential Backoff",
      "Real Indicators (EMA, RSI, ATR - No shortcuts)"
    ],
    endpoints: {
      status: "/api/status",
      scanner: {
        results: "/api/scanner/results",
        universal: "/api/scanner/universal",
        explosions: "/api/scanner/explosions",
        run: "/api/scanner/run"
      },
      signal: "/api/signal?symbol=NIFTY",
      optionChain: "/api/option-chain?symbol=NIFTY",
      ltp: "/api/ltp?symbol=NIFTY",
      wsStability: "/api/ws/stability"
    }
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now(),
    memory: process.memoryUsage()
  });
});

// ==========================================
// SYSTEM STATUS (ENHANCED)
// ==========================================
app.get("/api/status", (req, res) => {
  const wsStatus = getWebSocketStatus();
  const focusStatus = getFocusStatus();
  
  res.json({
    status: true,
    service: "MAHASHAKTI Market Pro",
    version: "2.0.0",
    
    // Angel Session
    angelLogin: global.angelSession.isLoggedIn,
    clientCode: global.angelSession.clientCode,
    jwtToken: global.angelSession.jwtToken ? "SET" : "NOT_SET",
    feedToken: global.angelSession.feedToken ? "SET" : "NOT_SET",
    
    // WebSocket Status (CRITICAL FOR LIVE PROOF)
    wsConnected: wsStatus.connected && !wsStatus.isStale,
    isStale: wsStatus.isStale,
    lastTickAge: wsStatus.lastTickAge,
    tickCount: wsStatus.tickCount,
    subscriptionCount: wsStatus.subscriptionCount,
    maxSubscriptions: wsStatus.maxSubscriptions || 50,
    utilization: wsStatus.utilization || "0%",
    reconnectAttempts: wsStatus.reconnectAttempts || 0,
    
    // LTP Cache
    ltpCacheSize: Object.keys(global.latestLTP || {}).length,
    ohlcCacheSize: Object.keys(global.latestOHLC || {}).length,
    
    // Focus Manager
    focusManager: focusStatus.active ? "ACTIVE" : "INACTIVE",
    focusTokens: focusStatus.subscriptionCount || 0,
    
    // Scanner Results
    scannerResults: {
      universalSignals: scannerResults.screen1?.length || 0,
      explosionSignals: scannerResults.screen2?.length || 0,
      lastScan: scannerResults.lastScan,
      scanDuration: scannerResults.scanDuration
    },
    
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// WEBSOCKET STABILITY LOG (REQUIRED FOR PROOF)
// ==========================================
app.get("/api/ws/stability", (req, res) => {
  const wsStatus = getWebSocketStatus();
  const hours = parseFloat(req.query.hours) || 1;
  
  // Build stability summary
  const summary = {
    connected: wsStatus.connected,
    subscriptionCount: wsStatus.subscriptionCount,
    maxSubscriptions: 50,
    tickCount: wsStatus.tickCount,
    lastTickAge: wsStatus.lastTickAge,
    isStale: wsStatus.isStale,
    reconnectAttempts: wsStatus.reconnectAttempts || 0,
    stable: wsStatus.connected && !wsStatus.isStale && (wsStatus.reconnectAttempts || 0) < 3
  };
  
  res.json({
    status: true,
    hours,
    summary,
    recommendation: summary.stable ? "SYSTEM_STABLE" : "NEEDS_ATTENTION"
  });
});

// ==========================================
// SCANNER ROUTES (SCREEN 1 & 2)
// ==========================================

// Get all scanner results
app.get("/api/scanner/results", (req, res) => {
  res.json({
    status: true,
    screen1: {
      name: "Universal Signals",
      description: "STRONG_BUY, BUY, STRONG_SELL, SELL only",
      signals: scannerResults.screen1,
      count: scannerResults.screen1?.length || 0
    },
    screen2: {
      name: "Explosion Signals", 
      description: "EARLY_EXPANSION, HIGH_MOMENTUM_RUNNER, OPTION_ACCELERATION, SWING_CONTINUATION",
      signals: scannerResults.screen2,
      count: scannerResults.screen2?.length || 0
    },
    meta: {
      lastScan: scannerResults.lastScan,
      scanDuration: scannerResults.scanDuration
    }
  });
});

// Screen 1: Universal Signals only
app.get("/api/scanner/universal", (req, res) => {
  const signals = scannerResults.screen1 || [];
  
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
    lastScan: scannerResults.lastScan
  });
});

// Screen 2: Explosion Signals only
app.get("/api/scanner/explosions", (req, res) => {
  const signals = scannerResults.screen2 || [];
  
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
    lastScan: scannerResults.lastScan
  });
});

// Manual scan trigger
app.post("/api/scanner/run", async (req, res) => {
  try {
    console.log("[SCANNER] Manual scan triggered...");
    const startTime = Date.now();
    
    // Run market scan
    const scanResult = await runMarketScan();
    
    // Process for Screen 1 (Universal Signals)
    const screen1 = [];
    if (scanResult && scanResult.signals) {
      for (const sig of scanResult.signals) {
        if (sig.signal && sig.signal !== "WAIT") {
          screen1.push({
            signal: sig.signal,
            symbol: sig.symbol,
            confidence: sig.confidence,
            reason: sig.reason,
            timestamp: sig.timestamp
          });
        }
      }
    }
    
    // Get explosion signals for Screen 2
    const screen2 = [];
    const candidates = getTopCandidates(50);
    for (const candidate of candidates) {
      const explosions = processExplosionScan(candidate);
      screen2.push(...explosions);
    }
    
    // Update cache
    scannerResults = {
      screen1: screen1.slice(0, 50),
      screen2: screen2.slice(0, 50),
      lastScan: new Date().toISOString(),
      scanDuration: Date.now() - startTime
    };
    
    res.json({
      status: true,
      message: "Scan completed",
      results: {
        universalSignals: screen1.length,
        explosionSignals: screen2.length,
        duration: scannerResults.scanDuration
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

// ==========================================
// DYNAMIC SUBSCRIPTION ENDPOINTS
// ==========================================
app.post("/api/ws/subscribe", (req, res) => {
  try {
    const { tokens, source } = req.body;
    
    if (!tokens || !Array.isArray(tokens)) {
      return res.status(400).json({
        status: false,
        error: "tokens array required"
      });
    }

    const success = subscribeTokens(tokens, source || "api");
    
    res.json({
      status: success,
      subscribed: tokens.length,
      totalSubscriptions: getSubscriptionCount()
    });
  } catch (err) {
    res.status(500).json({
      status: false,
      error: err.message
    });
  }
});

app.post("/api/ws/unsubscribe", (req, res) => {
  try {
    const { tokens, source } = req.body;
    
    if (!tokens || !Array.isArray(tokens)) {
      return res.status(400).json({
        status: false,
        error: "tokens array required"
      });
    }

    const success = unsubscribeTokens(tokens, source || "api");
    
    res.json({
      status: success,
      unsubscribed: tokens.length,
      remainingSubscriptions: getSubscriptionCount()
    });
  } catch (err) {
    res.status(500).json({
      status: false,
      error: err.message
    });
  }
});

app.get("/api/ws/subscriptions", (req, res) => {
  const wsStatus = getWebSocketStatus();
  res.json({
    status: true,
    count: wsStatus.subscriptionCount,
    maxSubscriptions: 50,
    ltpCacheSize: wsStatus.ltpCacheSize,
    connected: wsStatus.connected,
    tickCount: wsStatus.tickCount
  });
});

// ==========================================
// FOCUS MANAGER ENDPOINTS
// ==========================================
app.post("/api/focus/start", (req, res) => {
  const result = startFocusManager();
  res.json(result);
});

app.post("/api/focus/stop", (req, res) => {
  const result = stopFocusManager();
  res.json(result);
});

app.get("/api/focus/status", (req, res) => {
  const status = getFocusStatus();
  res.json({ status: true, ...status });
});

// ==========================================
// SIGNAL ENDPOINT (Direct)
// ==========================================
app.get("/api/signal/decide", (req, res) => {
  try {
    const data = req.query;
    
    // Convert query params to numbers
    const signalData = {
      symbol: data.symbol || "UNKNOWN",
      close: parseFloat(data.close) || null,
      open: parseFloat(data.open) || null,
      high: parseFloat(data.high) || null,
      low: parseFloat(data.low) || null,
      prevClose: parseFloat(data.prevClose) || null,
      ema20: parseFloat(data.ema20) || null,
      ema50: parseFloat(data.ema50) || null,
      rsi: parseFloat(data.rsi) || null,
      atr: parseFloat(data.atr) || null,
      volume: parseFloat(data.volume) || null,
      avgVolume: parseFloat(data.avgVolume) || null
    };
    
    const decision = finalDecision(signalData);
    
    res.json({
      status: true,
      ...decision
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

// ==========================================
// ERROR HANDLER
// ==========================================
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    status: false,
    error: err.message || "Internal server error"
  });
});

// ==========================================
// ANGEL ONE LOGIN
// ==========================================
async function performAngelLogin() {
  try {
    const {
      ANGEL_API_KEY,
      ANGEL_CLIENT_ID,
      ANGEL_PASSWORD,
      ANGEL_TOTP_SECRET
    } = process.env;

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
      console.log("[AUTH] 📡 JWT Token:", result.jwtToken.substring(0, 20) + "...");
      console.log("[AUTH] 📡 Feed Token:", result.feedToken.substring(0, 20) + "...");

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

// ==========================================
// AUTO TOKEN REFRESH (Every 5 hours)
// ==========================================
async function autoRefreshToken() {
  try {
    if (!global.angelSession.refreshToken) return;

    console.log("[AUTH] 🔄 Refreshing Angel Token...");

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
      
      // Restart WebSocket with new tokens
      console.log("[AUTH] 🔄 Restarting WebSocket with new tokens...");
      await connectWebSocket(
        result.jwtToken,
        process.env.ANGEL_API_KEY,
        global.angelSession.clientCode,
        result.feedToken
      );
      
    } else {
      console.error("[AUTH] ❌ Token Refresh Failed - Re-login required");
      await performAngelLogin();
    }

  } catch (err) {
    console.error("[AUTH] ❌ Auto Refresh Error:", err.message);
  }
}

// Refresh every 5 hours
setInterval(autoRefreshToken, 5 * 60 * 60 * 1000);

// ==========================================
// AUTO SCANNER (Background job)
// ==========================================
let autoScannerInterval = null;

function startAutoScanner(intervalMs = 5 * 60 * 1000) {
  if (autoScannerInterval) {
    clearInterval(autoScannerInterval);
  }

  console.log(`[SCANNER] 📊 Auto-scanner started (interval: ${intervalMs / 1000}s)`);

  // Run immediately
  setTimeout(async () => {
    try {
      const scanResult = await runMarketScan();
      if (scanResult && scanResult.signals) {
        const screen1 = scanResult.signals.filter(s => s.signal && s.signal !== "WAIT");
        scannerResults.screen1 = screen1.slice(0, 50);
        scannerResults.lastScan = new Date().toISOString();
        console.log(`[SCANNER] ✅ Initial scan: ${screen1.length} signals`);
      }
    } catch (err) {
      console.log("[SCANNER] Initial scan skipped:", err.message);
    }
  }, 10000);

  // Then run on interval
  autoScannerInterval = setInterval(async () => {
    try {
      const startTime = Date.now();
      const scanResult = await runMarketScan();
      
      if (scanResult && scanResult.signals) {
        const screen1 = scanResult.signals.filter(s => s.signal && s.signal !== "WAIT");
        scannerResults.screen1 = screen1.slice(0, 50);
        scannerResults.scanDuration = Date.now() - startTime;
        scannerResults.lastScan = new Date().toISOString();
        
        console.log(`[SCANNER] ✅ Scan complete: ${screen1.length} signals (${scannerResults.scanDuration}ms)`);
      }
    } catch (err) {
      console.error("[SCANNER] Auto-scan error:", err.message);
    }
  }, intervalMs);
}

// ==========================================
// SERVER STARTUP
// ==========================================
const PORT = process.env.PORT || 8080;

app.listen(PORT, async () => {
  console.log("=".repeat(60));
  console.log("  MAHASHAKTI MARKET PRO - INSTITUTIONAL SNIPER ENGINE");
  console.log("=".repeat(60));
  console.log(`  Port: ${PORT}`);
  console.log(`  URL: http://localhost:${PORT}`);
  console.log("=".repeat(60));

  try {
    // Step 1: Login to Angel One FIRST
    const loginSuccess = await performAngelLogin();

    if (!loginSuccess) {
      console.log("[STARTUP] ⚠️ Angel login failed — running in LIMITED MODE");
      return;
    }

    // Step 2: Load Stock & Commodity Master
    console.log("[STARTUP] 📥 Loading Stock Master...");
    await loadStockMaster();
    await loadCommodityMaster();

    // Step 3: Load Option Master
    console.log("[STARTUP] 📥 Loading Option Master...");
    await initializeTokenService();
    console.log("[STARTUP] ✅ Masters Loaded");

    // Step 4: Start WebSocket
    console.log("[STARTUP] 🔌 Starting WebSocket connection...");
    await connectWebSocket(
      global.angelSession.jwtToken,
      process.env.ANGEL_API_KEY,
      global.angelSession.clientCode,
      global.angelSession.feedToken
    );

    // Step 5: Start Focus Manager (Optional)
    console.log("[STARTUP] 🎯 Starting Focus Manager...");
    startFocusManager();

    // Step 6: Start Auto Scanner
    console.log("[STARTUP] 📊 Starting Auto Scanner...");
    startAutoScanner(5 * 60 * 1000); // Every 5 minutes

    console.log("=".repeat(60));
    console.log("  🟢 SYSTEM READY: Full Market Scan Active");
    console.log("  📊 Screen 1: Universal Signals");
    console.log("  💣 Screen 2: Explosion Engine");
    console.log("=".repeat(60));

  } catch (err) {
    console.error("[STARTUP] ❌ Error:", err.message);
  }
});

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================
process.on("SIGTERM", () => {
  console.log("[SHUTDOWN] 🛑 SIGTERM received, shutting down...");
  if (autoScannerInterval) clearInterval(autoScannerInterval);
  stopFocusManager();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[SHUTDOWN] 🛑 SIGINT received, shutting down...");
  if (autoScannerInterval) clearInterval(autoScannerInterval);
  stopFocusManager();
  process.exit(0);
});
