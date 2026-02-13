// ==========================================
// MAHASHAKTI MARKET PRO - MAIN SERVER
// INSTITUTIONAL SNIPER ENGINE
// Live Angel One API + MongoDB Integration
// ==========================================

require('dotenv').config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

// Angel Services
const { loginWithPassword, generateToken } = require("./services/angel/angelAuth.service");
const { connectWebSocket, getWebSocketStatus, getStabilityLog } = require("./services/angel/angelWebSocket.service");
const { setGlobalTokens } = require("./services/angel/angelApi.service");

// Token & Scanner Services
const { initializeTokenService, getMasterStats } = require("./services/tokenMaster.service");
const { runFullScan, getScanResults, getUniversalSignals, getExplosionSignals, startAutoScanner, scanSymbol } = require("./services/scanner.service");

// API Routes
const signalRoutes = require("./routes/signal.routes");
const scannerRoutes = require("./routes/scanner.routes");
const statusRoutes = require("./routes/status.routes");

// ==========================================
// APP INITIALIZATION
// ==========================================
const app = express();
app.use(cors());
app.use(express.json());

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
global.SYMBOL_MASTER = {};

// ==========================================
// MONGODB CONNECTION
// ==========================================
async function connectMongoDB() {
  const mongoUrl = process.env.MONGO_URL;
  const dbName = process.env.DB_NAME || "mahashakti";

  if (!mongoUrl) {
    console.log("[DB] MONGO_URL not set - running without database");
    return false;
  }

  try {
    await mongoose.connect(mongoUrl, {
      dbName: dbName
    });
    console.log(`[DB] Connected to MongoDB: ${dbName}`);
    return true;
  } catch (err) {
    console.error("[DB] MongoDB connection error:", err.message);
    return false;
  }
}

// ==========================================
// BASIC ROUTES
// ==========================================
app.get("/", (req, res) => {
  res.json({
    status: "LIVE",
    service: "MAHASHAKTI Market Pro API",
    version: "2.0.0",
    description: "Institutional Sniper Engine",
    features: [
      "Full Market Scan",
      "Actionable Signals Only (BUY/SELL/STRONG_BUY/STRONG_SELL)",
      "Explosion Engine (Early Expansion, High Momentum, Option Acceleration)",
      "Real-time WebSocket (Max 50 subscriptions)",
      "Multi-timeframe Analysis"
    ],
    endpoints: {
      status: "/api/status",
      scannerResults: "/api/scanner/results",
      universalSignals: "/api/scanner/universal",
      explosionSignals: "/api/scanner/explosions",
      wsStability: "/api/status/ws-stability",
      runScan: "/api/scanner/run"
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
// ROUTE MOUNTING
// ==========================================
app.use("/api/signal", signalRoutes);
app.use("/api/scanner", scannerRoutes);
app.use("/api/status", statusRoutes);

// ==========================================
// LEGACY /api/status (for compatibility)
// ==========================================
app.get("/api/status", (req, res) => {
  const wsStatus = getWebSocketStatus();
  const masterStats = getMasterStats();
  
  res.json({
    status: true,
    service: "MAHASHAKTI Market Pro",
    version: "2.0.0",
    
    // Angel Session
    angelLogin: global.angelSession?.isLoggedIn || false,
    
    // WebSocket Status
    wsConnected: wsStatus.connected,
    wsConnecting: wsStatus.connecting,
    isStale: wsStatus.isStale,
    lastTickAge: wsStatus.lastTickAge,
    tickCount: wsStatus.tickCount,
    subscriptionCount: wsStatus.subscriptionCount,
    maxSubscriptions: wsStatus.maxSubscriptions,
    utilization: wsStatus.utilization,
    reconnectAttempts: wsStatus.reconnectAttempts,
    errors429: wsStatus.errors429,
    
    // LTP Cache
    ltpCacheSize: Object.keys(global.latestLTP || {}).length,
    
    // Token Master
    masterStats: masterStats,
    
    // Scan Status
    scanResults: {
      universalSignals: getScanResults().screen1?.length || 0,
      explosionSignals: getScanResults().screen2?.length || 0,
      lastScan: getScanResults().lastScanTime
    },
    
    timestamp: new Date().toISOString()
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
      console.log("[AUTH] Angel credentials missing in .env");
      return false;
    }

    console.log("[AUTH] Logging into Angel One...");

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

      console.log("[AUTH] Angel One Login SUCCESS");
      return true;
    } else {
      console.error("[AUTH] Angel Login Failed:", result.error);
      return false;
    }

  } catch (err) {
    console.error("[AUTH] Login Error:", err.message);
    return false;
  }
}

// ==========================================
// AUTO TOKEN REFRESH (Every 5 hours)
// ==========================================
async function autoRefreshToken() {
  try {
    if (!global.angelSession?.refreshToken) return;

    console.log("[AUTH] Refreshing token...");

    const result = await generateToken(
      global.angelSession.refreshToken,
      process.env.ANGEL_API_KEY
    );

    if (result.success) {
      global.angelSession.jwtToken = result.jwtToken;
      global.angelSession.refreshToken = result.refreshToken;
      global.angelSession.feedToken = result.feedToken;

      setGlobalTokens(result.jwtToken, process.env.ANGEL_API_KEY);

      console.log("[AUTH] Token Refreshed Successfully");

      // Restart WebSocket with new tokens
      await connectWebSocket(
        result.jwtToken,
        process.env.ANGEL_API_KEY,
        global.angelSession.clientCode,
        result.feedToken
      );

    } else {
      console.error("[AUTH] Token Refresh Failed - Re-login required");
      await performAngelLogin();
    }

  } catch (err) {
    console.error("[AUTH] Auto Refresh Error:", err.message);
  }
}

// Refresh every 5 hours
setInterval(autoRefreshToken, 5 * 60 * 60 * 1000);

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
    // Step 1: Connect to MongoDB
    await connectMongoDB();

    // Step 2: Login to Angel One
    const loginSuccess = await performAngelLogin();

    if (!loginSuccess) {
      console.log("[STARTUP] Angel login failed - Running in LIMITED MODE");
      return;
    }

    // Step 3: Load Symbol Master
    console.log("[STARTUP] Loading Symbol Master...");
    await initializeTokenService();
    console.log("[STARTUP] Symbol Master Loaded");

    // Step 4: Start WebSocket
    console.log("[STARTUP] Starting WebSocket...");
    await connectWebSocket(
      global.angelSession.jwtToken,
      process.env.ANGEL_API_KEY,
      global.angelSession.clientCode,
      global.angelSession.feedToken
    );

    // Step 5: Start Auto Scanner (every 5 minutes)
    console.log("[STARTUP] Starting Auto Scanner...");
    startAutoScanner(5 * 60 * 1000);

    console.log("=".repeat(60));
    console.log("  SYSTEM READY: Full Market Scan Active");
    console.log("=".repeat(60));

  } catch (err) {
    console.error("[STARTUP] Error:", err.message);
  }
});

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================
process.on("SIGTERM", () => {
  console.log("[SHUTDOWN] SIGTERM received...");
  mongoose.connection.close();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[SHUTDOWN] SIGINT received...");
  mongoose.connection.close();
  process.exit(0);
});
