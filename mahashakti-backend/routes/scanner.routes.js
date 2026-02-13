// ==========================================
// MAHASHAKTI MARKET PRO - SCANNER & ORCHESTRATOR ROUTES
// Institutional-Grade Market Intelligence API
// ==========================================

const express = require("express");
const router = express.Router();

// Scanner Services
const {
  startScanner,
  stopScanner,
  manualScan,
  getScanResults,
  getTopCandidates,
  getScannerStatus
} = require("../services/marketScanner.service");

// Ranking Engine
const {
  rankStocks,
  getTopNForWebSocket
} = require("../services/rankingEngine.service");

// Focus WS Manager
const {
  startFocusManager,
  stopFocusManager,
  getFocusStatus,
  manualSubscribe,
  manualUnsubscribe
} = require("../services/focusWsManager.service");

// Signal Orchestrator
const {
  processSignalRequest,
  processBatchSignals,
  getTopSignals,
  getMarketContext
} = require("../services/signalOrchestrator.service");

// ==========================================
// SCANNER ROUTES
// ==========================================

// Start market scanner
router.post("/scanner/start", (req, res) => {
  try {
    const result = startScanner();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Stop market scanner
router.post("/scanner/stop", (req, res) => {
  try {
    const result = stopScanner();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get scanner status
router.get("/scanner/status", (req, res) => {
  try {
    const status = getScannerStatus();
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Trigger manual scan
router.post("/scanner/scan", async (req, res) => {
  try {
    const result = await manualScan();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get scan results
router.get("/scanner/results", (req, res) => {
  try {
    const results = getScanResults();
    res.json(results);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get top candidates for WS focus
router.get("/scanner/candidates", (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const candidates = getTopCandidates(limit);
    
    res.json({
      success: true,
      count: candidates.length,
      candidates
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// RANKING ROUTES
// ==========================================

// Rank latest scan results
router.get("/ranking/rank", (req, res) => {
  try {
    const scanResults = getScanResults();
    
    if (!scanResults.success) {
      return res.status(400).json({
        success: false,
        message: "No scan results available"
      });
    }

    const ranked = rankStocks(scanResults);
    res.json(ranked);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get top N for WebSocket
router.get("/ranking/top-for-ws", (req, res) => {
  try {
    const n = parseInt(req.query.n) || 100;
    const scanResults = getScanResults();
    
    if (!scanResults.success) {
      return res.status(400).json({
        success: false,
        message: "No scan results available"
      });
    }

    const ranked = rankStocks(scanResults);
    const topN = getTopNForWebSocket(ranked, n);
    
    res.json({
      success: true,
      count: topN.length,
      candidates: topN
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// FOCUS WS MANAGER ROUTES
// ==========================================

// Start focus manager
router.post("/focus/start", (req, res) => {
  try {
    const result = startFocusManager();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Stop focus manager
router.post("/focus/stop", (req, res) => {
  try {
    const result = stopFocusManager();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get focus status
router.get("/focus/status", (req, res) => {
  try {
    const status = getFocusStatus();
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Manual subscribe
router.post("/focus/subscribe", (req, res) => {
  try {
    const { tokens } = req.body;
    
    if (!tokens || !Array.isArray(tokens)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tokens array"
      });
    }

    const result = manualSubscribe(tokens);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Manual unsubscribe
router.post("/focus/unsubscribe", (req, res) => {
  try {
    const { tokens } = req.body;
    
    if (!tokens || !Array.isArray(tokens)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tokens array"
      });
    }

    const result = manualUnsubscribe(tokens);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// SIGNAL ORCHESTRATOR ROUTES
// ==========================================

// Get signal for single symbol
router.get("/signal/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const options = req.query || {};
    
    const signal = await processSignalRequest(symbol, options);
    res.json(signal);
  } catch (error) {
    res.status(500).json({
      signal: "WAIT",
      error: error.message
    });
  }
});

// Get signals for multiple symbols (batch)
router.post("/signal/batch", async (req, res) => {
  try {
    const { symbols, options } = req.body;
    
    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({
        success: false,
        message: "Invalid symbols array"
      });
    }

    const result = await processBatchSignals(symbols, options || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get top signals (best opportunities)
router.get("/signal/top", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const result = await getTopSignals(limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get market context
router.get("/market/context", async (req, res) => {
  try {
    const context = await getMarketContext();
    res.json({
      success: true,
      ...context
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// SYSTEM CONTROL - Start All Services
// ==========================================
router.post("/system/start", async (req, res) => {
  try {
    console.log("[SYSTEM] 🚀 Starting all services...");
    
    const results = {
      scanner: startScanner(),
      focusManager: startFocusManager()
    };

    res.json({
      success: true,
      message: "All services started",
      results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Stop all services
router.post("/system/stop", (req, res) => {
  try {
    console.log("[SYSTEM] 🛑 Stopping all services...");
    
    const results = {
      scanner: stopScanner(),
      focusManager: stopFocusManager()
    };

    res.json({
      success: true,
      message: "All services stopped",
      results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get system status
router.get("/system/status", (req, res) => {
  try {
    const scannerStatus = getScannerStatus();
    const focusStatus = getFocusStatus();

    res.json({
      success: true,
      system: "Mahashakti Market Pro - Institutional Grade",
      version: "2.0",
      scanner: scannerStatus,
      focus: {
        active: focusStatus.active,
        subscriptions: focusStatus.subscriptionCount,
        maxTokens: focusStatus.maxTokens,
        utilization: focusStatus.utilization
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// EXPORTS
// ==========================================
module.exports = router;
