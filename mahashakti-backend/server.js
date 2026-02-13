// ==========================================
// MAHASHAKTI MARKET PRO - MAIN SERVER
// REAL ANGEL ONE API INTEGRATION
// Complete Option Chains + Signals
// FIXED: WebSocket starts AFTER login
// ==========================================
// Load environment variables FIRST
require('dotenv').config();

const express = require("express");
const cors = require("cors");

// Angel One Services
const { loginWithPassword, generateToken } = require("./services/angel/angelAuth.service");
const { setGlobalTokens, getLtpData } = require("./services/angel/angelApi.service");
const { connectWebSocket, getWebSocketStatus, subscribeTokens, unsubscribeTokens, getSubscriptionCount } = require("./services/angel/angelWebSocket.service");

// Token & Symbol Services
const { initializeTokenService } = require("./token.service");
const { setAllSymbols } = require("./symbol.service");

// API Routes
const optionChainRoutes = require("./routes/optionChain.routes");
const signalRoutes = require("./routes/signal.routes");
const ltpRoutes = require("./routes/ltp.routes");
const signalIntelRoutes = require("./routes/signal.intel.routes");

const searchRoutes = require("./routes/search.routes");
const optionSignalRoutes = require("./routes/optionSignal.routes");
const exitEngineRoutes = require("./routes/exitEngine.routes");
const strikeExplosionRoutes = require("./routes/strikeExplosion.routes");

// ==========================================
// APP INITIALIZATION
// ==========================================
const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/search", searchRoutes);
app.use("/api/option-signal", optionSignalRoutes);
app.use("/api/exit-engine", exitEngineRoutes);
app.use("/api/strike/explosion", strikeExplosionRoutes);

// ==========================================
// GLOBAL STATE
// ==========================================
global.angelSession = {
  jwtToken: null,
  refreshToken: null,
  feedToken: null,
  clientCode: null,
  isLoggedIn: false,
  wsConnected: false
};

global.latestLTP = {};
global.symbolOpenPrice = {};

// ==========================================
// BASIC ROUTES
// ==========================================
app.get("/", (req, res) => {
  res.json({
    status: "LIVE",
    service: "Mahashakti Market Pro API",
    version: "2.0.0",
    realData: true,
    endpoints: {
      optionChain: "/api/option-chain?symbol=NIFTY",
      signal: "/api/signal",
      ltp: "/api/ltp?symbol=NIFTY",
      status: "/api/status"
    }
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

// ==========================================
// SYSTEM STATUS (ENHANCED WITH WS STATUS)
// ==========================================
app.get("/api/status", (req, res) => {
  // Get real WebSocket status
  const wsStatus = getWebSocketStatus();
  
  res.json({
    status: true,
    angelLogin: global.angelSession.isLoggedIn,
    wsConnected: wsStatus.connected && !wsStatus.isStale,
    isStale: wsStatus.isStale,
    lastTickAge: wsStatus.lastTickAge,
    tickCount: wsStatus.tickCount,
    subscriptionCount: wsStatus.subscriptionCount,
    ltpCacheSize: wsStatus.ltpCacheSize,
    jwtToken: global.angelSession.jwtToken ? "SET" : "NOT_SET",
    feedToken: global.angelSession.feedToken ? "SET" : "NOT_SET",
    ltpCount: Object.keys(global.latestLTP).length,
    service: "Mahashakti Market Pro",
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// ROUTE MOUNTING
// ==========================================
app.use("/api/option-chain", optionChainRoutes);
app.use("/api/signal", signalRoutes);
app.use("/api/signal/intel", signalIntelRoutes);
app.use("/api/ltp", ltpRoutes);

// ==========================================
// DYNAMIC SUBSCRIPTION ENDPOINTS
// ==========================================

// Subscribe tokens (for option chain, scanner)
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

// Unsubscribe tokens (when leaving screen)
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

// Get subscription status
app.get("/api/ws/subscriptions", (req, res) => {
  const wsStatus = getWebSocketStatus();
  res.json({
    status: true,
    count: wsStatus.subscriptionCount,
    ltpCacheSize: wsStatus.ltpCacheSize,
    connected: wsStatus.connected,
    tickCount: wsStatus.tickCount
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
      console.log("⚠️ Angel credentials missing in .env");
      return false;
    }

    console.log("🔐 Logging into Angel One...");

    const result = await loginWithPassword({
      clientCode: ANGEL_CLIENT_ID,
      password: ANGEL_PASSWORD,
      totpSecret: ANGEL_TOTP_SECRET,
      apiKey: ANGEL_API_KEY
    });

    if (result.success) {
      global.angelSession.jwtToken = result.jwtToken;
      global.angelSession.refreshToken = result.refreshToken;
      global.angelSession.feedToken = result.feedToken;
      global.angelSession.clientCode = result.clientCode;
      global.angelSession.isLoggedIn = true;

      // Set tokens for API service
      setGlobalTokens(
        result.jwtToken,
        ANGEL_API_KEY,
        result.clientCode
      );

      console.log("✅ Angel One Login SUCCESS");
      console.log("📡 JWT Token:", result.jwtToken.substring(0, 20) + "...");
      console.log("📡 Feed Token:", result.feedToken.substring(0, 20) + "...");

      return true;
    } else {
      console.error("❌ Angel Login Failed:", result.error);
      return false;
    }

  } catch (err) {
    console.error("❌ Login Error:", err.message);
    return false;
  }
}

// ==========================================
// AUTO TOKEN REFRESH (Every 5 hours)
// ==========================================
async function autoRefreshToken() {
  try {
    if (!global.angelSession.refreshToken) return;

    console.log("🔄 Refreshing Angel Token...");

    const result = await generateToken(
      global.angelSession.refreshToken,
      process.env.ANGEL_API_KEY
    );

    if (result.success) {
      global.angelSession.jwtToken = result.jwtToken;
      global.angelSession.refreshToken = result.refreshToken;
      global.angelSession.feedToken = result.feedToken;

      setGlobalTokens(result.jwtToken, process.env.ANGEL_API_KEY);

      console.log("✅ Token Refreshed");
      
      // ✅ FIX: Restart WebSocket with new tokens
      console.log("🔄 Restarting WebSocket with new tokens...");
      await connectWebSocket(
        result.jwtToken,
        process.env.ANGEL_API_KEY,
        global.angelSession.clientCode,
       result.feedToken
      );
      
    } else {
      console.error("❌ Token Refresh Failed");
      // Re-login
      performAngelLogin();
    }

  } catch (err) {
    console.error("❌ Auto Refresh Error:", err.message);
  }
}

// Refresh every 5 hours
setInterval(autoRefreshToken, 5 * 60 * 60 * 1000);

// ==========================================
// SERVER STARTUP
// ==========================================
const PORT = process.env.PORT || 8080

app.listen(PORT, async () => {
  console.log("=".repeat(50));
  console.log("🚀 MAHASHAKTI MARKET PRO - SERVER STARTED");
  console.log("=".repeat(50));
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log("=".repeat(50));

  try {
    // Step 1: Login to Angel One FIRST
    const loginSuccess = await performAngelLogin();

    if (!loginSuccess) {
      console.log("⚠️ Angel login failed — server running in LIMITED MODE");
      return;
    }

    // Step 2: Load Option Master AFTER successful login
    console.log("📥 Loading Option Master...");
    await initializeTokenService();
    console.log("✅ Option Master Loaded");

    // ==========================================
    // ✅ FIX: START WEBSOCKET AFTER LOGIN SUCCESS
    // ==========================================
    console.log("🔌 Starting WebSocket connection...");
    await connectWebSocket(
      global.angelSession.jwtToken,
      process.env.ANGEL_API_KEY,
      global.angelSession.clientCode,
      global.angelSession.feedToken
    );

    // Step 3: System ready
    console.log("🟢 SYSTEM READY: Live LTP + Option Chain + Signals");

  } catch (err) {
    console.error("❌ Startup Error:", err.message);
  }
});

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received, shutting down...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 SIGINT received, shutting down...");
  process.exit(0);
});
