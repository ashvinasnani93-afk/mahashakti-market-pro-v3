// ==========================================
// STATUS ROUTES
// System status and WebSocket monitoring
// ==========================================

const express = require("express");
const router = express.Router();

const { getWebSocketStatus, getStabilityLog, resetReconnect } = require("../services/angel/angelWebSocket.service");
const { getMasterStats, getFnOStocks } = require("../services/tokenMaster.service");
const { getScanResults } = require("../services/scanner.service");

// ==========================================
// GET /api/status - Full system status
// ==========================================
router.get("/", (req, res) => {
  const wsStatus = getWebSocketStatus();
  const masterStats = getMasterStats();
  const scanResults = getScanResults();

  res.json({
    status: true,
    service: "MAHASHAKTI Market Pro",
    version: "2.0.0",
    uptime: process.uptime(),

    // Angel Session
    angelSession: {
      loggedIn: global.angelSession?.isLoggedIn || false,
      clientCode: global.angelSession?.clientCode || null,
      jwtToken: global.angelSession?.jwtToken ? "SET" : "NOT_SET",
      feedToken: global.angelSession?.feedToken ? "SET" : "NOT_SET"
    },

    // WebSocket
    webSocket: {
      connected: wsStatus.connected,
      connecting: wsStatus.connecting,
      isStale: wsStatus.isStale,
      lastTickAge: wsStatus.lastTickAge,
      tickCount: wsStatus.tickCount,
      subscriptionCount: wsStatus.subscriptionCount,
      maxSubscriptions: wsStatus.maxSubscriptions,
      utilization: wsStatus.utilization,
      reconnectAttempts: wsStatus.reconnectAttempts,
      currentBackoff: wsStatus.currentBackoff,
      errors429: wsStatus.errors429
    },

    // Data Cache
    cache: {
      ltpCount: Object.keys(global.latestLTP || {}).length,
      ohlcCount: Object.keys(global.latestOHLC || {}).length
    },

    // Symbol Master
    symbolMaster: masterStats,

    // Scanner
    scanner: {
      universalSignals: scanResults.screen1?.length || 0,
      explosionSignals: scanResults.screen2?.length || 0,
      lastScan: scanResults.lastScanTime,
      scanDuration: scanResults.scanDuration
    },

    timestamp: new Date().toISOString()
  });
});

// ==========================================
// GET /api/status/ws - WebSocket status only
// ==========================================
router.get("/ws", (req, res) => {
  const wsStatus = getWebSocketStatus();

  res.json({
    status: true,
    webSocket: wsStatus
  });
});

// ==========================================
// GET /api/status/ws-stability - 1 hour WS log
// ==========================================
router.get("/ws-stability", (req, res) => {
  const hours = parseFloat(req.query.hours) || 1;
  const log = getStabilityLog(hours);

  // Summary
  const summary = {
    totalEvents: log.length,
    connections: log.filter(e => e.event === "CONNECTED").length,
    disconnections: log.filter(e => e.event === "DISCONNECTED").length,
    errors429: log.filter(e => e.event === "ERROR_429").length,
    reconnects: log.filter(e => e.event.includes("RECONNECT")).length,
    staleDetections: log.filter(e => e.event === "STALE_DETECTED").length
  };

  res.json({
    status: true,
    hours,
    summary,
    events: log,
    stable: summary.errors429 === 0 && summary.staleDetections < 3
  });
});

// ==========================================
// POST /api/status/ws-reset - Reset reconnect counter
// ==========================================
router.post("/ws-reset", (req, res) => {
  resetReconnect();

  res.json({
    status: true,
    message: "Reconnect counter reset"
  });
});

// ==========================================
// GET /api/status/ltp - LTP cache contents
// ==========================================
router.get("/ltp", (req, res) => {
  const ltp = global.latestLTP || {};

  res.json({
    status: true,
    count: Object.keys(ltp).length,
    data: ltp
  });
});

// ==========================================
// GET /api/status/master - Symbol master stats
// ==========================================
router.get("/master", (req, res) => {
  const stats = getMasterStats();
  const fnoStocks = getFnOStocks();

  res.json({
    status: true,
    stats,
    fnoStocks
  });
});

// ==========================================
// GET /api/status/health - Health check for Railway
// ==========================================
router.get("/health", (req, res) => {
  const wsStatus = getWebSocketStatus();

  res.json({
    status: "ok",
    healthy: wsStatus.connected && !wsStatus.isStale,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: Date.now()
  });
});

module.exports = router;
