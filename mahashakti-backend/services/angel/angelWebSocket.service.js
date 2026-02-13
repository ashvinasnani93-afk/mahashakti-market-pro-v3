// =======================
// ANGEL ONE WEBSOCKET SERVICE
// PRODUCTION READY - MAX 50 SUBSCRIPTIONS
// EXPONENTIAL BACKOFF: 10 -> 20 -> 40 -> 80
// =======================

const WebSocket = require("ws");
const EventEmitter = require("events");

// =======================
// CONFIGURATION
// =======================
const MAX_SUBSCRIPTIONS = 50;
const INITIAL_RECONNECT_DELAY = 10000; // 10 seconds
const MAX_RECONNECT_DELAY = 80000; // 80 seconds
const MAX_RECONNECT_ATTEMPTS = 5;
const HEARTBEAT_INTERVAL = 25000;
const STALE_THRESHOLD = 60000; // 60 seconds

// =======================
// SINGLETON GUARDS
// =======================
let wsInstance = null;
let isConnecting = false;
let isConnected = false;
let reconnectAttempts = 0;
let currentReconnectDelay = INITIAL_RECONNECT_DELAY;
let reconnectTimer = null;
let heartbeatTimer = null;

// =======================
// SUBSCRIPTIONS
// =======================
const subscriptions = new Map();
const coreTokens = new Set(); // Core tokens that should always be subscribed

// =======================
// STATUS
// =======================
let wsStatus = {
  connected: false,
  lastTick: null,
  tickCount: 0,
  subscriptionCount: 0,
  ltpCacheSize: 0,
  errors429: 0,
  reconnectAttempts: 0
};

// =======================
// STABILITY LOG
// =======================
const stabilityLog = [];
const MAX_STABILITY_LOGS = 1000;

// =======================
// EVENT EMITTER
// =======================
const wsEmitter = new EventEmitter();

// =======================
// LOG STABILITY EVENT
// =======================
function logStabilityEvent(event, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ...details
  };
  
  stabilityLog.push(entry);
  
  // Keep only last 1000 entries
  if (stabilityLog.length > MAX_STABILITY_LOGS) {
    stabilityLog.shift();
  }
  
  console.log(`[WS] ${event}:`, JSON.stringify(details));
}

// =======================
// CONNECT WEBSOCKET (SINGLETON)
// =======================
async function connectWebSocket(jwtToken, apiKey, clientCode, feedToken) {
  // Singleton guard - prevent multiple connections
  if (isConnecting) {
    logStabilityEvent("CONNECTION_BLOCKED", { reason: "Already connecting" });
    return { success: false, message: "Connection in progress" };
  }

  if (isConnected && wsInstance && wsInstance.readyState === WebSocket.OPEN) {
    logStabilityEvent("CONNECTION_BLOCKED", { reason: "Already connected" });
    return { success: true, message: "Already connected" };
  }

  // Max reconnect guard with exponential backoff
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    logStabilityEvent("MAX_RECONNECT_REACHED", { attempts: reconnectAttempts });
    return { success: false, message: "Max reconnect attempts reached" };
  }

  isConnecting = true;
  reconnectAttempts++;
  wsStatus.reconnectAttempts = reconnectAttempts;

  try {
    logStabilityEvent("CONNECTING", { 
      attempt: reconnectAttempts, 
      maxAttempts: MAX_RECONNECT_ATTEMPTS,
      delay: currentReconnectDelay 
    });

    // Build WebSocket URL with auth
    const wsUrl = `wss://smartapisocket.angelone.in/smart-stream?clientCode=${clientCode}&feedToken=${feedToken}&apiKey=${apiKey}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        isConnecting = false;
        logStabilityEvent("CONNECTION_TIMEOUT", { timeout: 30000 });
        reject(new Error("WebSocket connection timeout"));
      }, 30000);

      wsInstance = new WebSocket(wsUrl);

      wsInstance.on("open", () => {
        clearTimeout(timeout);
        isConnecting = false;
        isConnected = true;
        reconnectAttempts = 0;
        currentReconnectDelay = INITIAL_RECONNECT_DELAY; // Reset backoff
        
        wsStatus.connected = true;
        
        if (global.angelSession) {
          global.angelSession.wsConnected = true;
        }

        logStabilityEvent("CONNECTED", { subscriptionCount: subscriptions.size });

        // Start heartbeat
        startHeartbeat();

        // Subscribe to core indices
        subscribeCoreIndices();

        resolve({ success: true, message: "Connected" });
      });

      wsInstance.on("message", (data) => {
        try {
          handleTick(data);
        } catch (err) {
          console.error("[WS] Message parse error:", err.message);
        }
      });

      wsInstance.on("error", (error) => {
        clearTimeout(timeout);
        isConnecting = false;
        isConnected = false;
        
        wsStatus.connected = false;

        // Check for 429 error
        if (error.message && error.message.includes("429")) {
          wsStatus.errors429++;
          logStabilityEvent("ERROR_429", { count: wsStatus.errors429 });
        } else {
          logStabilityEvent("WS_ERROR", { error: error.message });
        }

        // Schedule reconnect with exponential backoff
        scheduleReconnect();

        reject(error);
      });

      wsInstance.on("close", (code, reason) => {
        clearTimeout(timeout);
        isConnecting = false;
        isConnected = false;
        
        wsStatus.connected = false;
        stopHeartbeat();

        if (global.angelSession) {
          global.angelSession.wsConnected = false;
        }

        logStabilityEvent("DISCONNECTED", { code, reason: reason.toString() });

        // Schedule reconnect
        scheduleReconnect();
      });
    });

  } catch (error) {
    isConnecting = false;
    isConnected = false;
    
    logStabilityEvent("CONNECTION_FAILED", { error: error.message });
    
    return { success: false, error: error.message };
  }
}

// =======================
// SUBSCRIBE CORE INDICES
// =======================
function subscribeCoreIndices() {
  const { INDEX_TOKENS, COMMODITY_TOKENS } = require("../../config/angel.config");
  
  const coreSubscriptions = [
    { token: INDEX_TOKENS.NIFTY.token, symbol: "NIFTY", exchangeType: INDEX_TOKENS.NIFTY.exchangeType },
    { token: INDEX_TOKENS.BANKNIFTY.token, symbol: "BANKNIFTY", exchangeType: INDEX_TOKENS.BANKNIFTY.exchangeType },
    { token: INDEX_TOKENS.FINNIFTY.token, symbol: "FINNIFTY", exchangeType: INDEX_TOKENS.FINNIFTY.exchangeType }
  ];

  // Mark as core tokens
  coreSubscriptions.forEach(sub => coreTokens.add(sub.token));

  subscribeTokens(coreSubscriptions, "core");
  
  logStabilityEvent("CORE_SUBSCRIBED", { count: coreSubscriptions.length });
}

// =======================
// START HEARTBEAT
// =======================
function startHeartbeat() {
  stopHeartbeat();
  
  heartbeatTimer = setInterval(() => {
    if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
      // Check for stale connection
      const now = Date.now();
      const lastTickTime = wsStatus.lastTick ? new Date(wsStatus.lastTick).getTime() : 0;
      const age = now - lastTickTime;
      
      if (age > STALE_THRESHOLD && wsStatus.tickCount > 0) {
        logStabilityEvent("STALE_DETECTED", { age, threshold: STALE_THRESHOLD });
        // Force reconnect
        disconnectWebSocket();
        scheduleReconnect();
      }
    }
  }, HEARTBEAT_INTERVAL);
}

// =======================
// STOP HEARTBEAT
// =======================
function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// =======================
// SCHEDULE RECONNECT (EXPONENTIAL BACKOFF)
// =======================
function scheduleReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    logStabilityEvent("RECONNECT_ABORTED", { reason: "Max attempts reached" });
    return;
  }

  // Exponential backoff: 10 -> 20 -> 40 -> 80
  const delay = Math.min(currentReconnectDelay, MAX_RECONNECT_DELAY);
  currentReconnectDelay = currentReconnectDelay * 2;

  logStabilityEvent("RECONNECT_SCHEDULED", { delay, attempt: reconnectAttempts + 1 });

  reconnectTimer = setTimeout(() => {
    if (global.angelSession && global.angelSession.jwtToken) {
      connectWebSocket(
        global.angelSession.jwtToken,
        global.angelSession.apiKey,
        global.angelSession.clientCode,
        global.angelSession.feedToken
      ).catch(err => {
        logStabilityEvent("RECONNECT_FAILED", { error: err.message });
      });
    }
  }, delay);
}

// =======================
// HANDLE TICK DATA
// =======================
function handleTick(rawData) {
  try {
    wsStatus.lastTick = new Date().toISOString();
    wsStatus.tickCount++;

    // Initialize global caches
    if (!global.latestOHLC) global.latestOHLC = {};
    if (!global.latestLTP) global.latestLTP = {};

    // Parse binary/JSON data
    let data;
    if (Buffer.isBuffer(rawData)) {
      // Binary data from Angel WebSocket
      data = parseBinaryTick(rawData);
    } else {
      data = JSON.parse(rawData.toString());
    }

    if (data && data.token) {
      const sub = subscriptions.get(data.token);
      
      if (sub) {
        const ltp = data.last_traded_price || data.ltp || data.lastTradedPrice;
        
        const ohlcData = {
          ltp: ltp / 100, // Angel sends prices * 100
          open: (data.open_price_day || data.open || 0) / 100,
          high: (data.high_price_day || data.high || 0) / 100,
          low: (data.low_price_day || data.low || 0) / 100,
          close: (data.close_price || data.close || 0) / 100,
          volume: data.volume_trade_for_day || data.volume || 0,
          oi: data.open_interest || 0,
          oiChange: data.open_interest_change_percent || 0,
          timestamp: new Date().toISOString()
        };

        global.latestOHLC[sub.symbol] = ohlcData;
        global.latestLTP[sub.symbol] = ohlcData.ltp;
        global.latestLTP[data.token] = ohlcData.ltp;
      }
    }

    wsStatus.ltpCacheSize = Object.keys(global.latestOHLC || {}).length;

    // Emit event
    wsEmitter.emit("tick", data);

  } catch (error) {
    console.error("[WS] Tick handler error:", error.message);
  }
}

// =======================
// PARSE BINARY TICK (Angel SmartAPI format)
// =======================
function parseBinaryTick(buffer) {
  try {
    // Angel SmartAPI binary format - convert BigInt to Number
    const data = {
      subscription_mode: buffer.readUInt8(0),
      exchange_type: buffer.readUInt8(1),
      token: buffer.slice(2, 27).toString().replace(/\0/g, '').trim(),
      sequence_number: Number(buffer.readBigInt64LE(27)),
      exchange_timestamp: Number(buffer.readBigInt64LE(35)),
      last_traded_price: Number(buffer.readBigInt64LE(43)),
      last_traded_quantity: Number(buffer.readBigInt64LE(51)),
      average_traded_price: Number(buffer.readBigInt64LE(59)),
      volume_trade_for_day: Number(buffer.readBigInt64LE(67)),
      total_buy_quantity: Number(buffer.readBigInt64LE(75)),
      total_sell_quantity: Number(buffer.readBigInt64LE(83)),
      open_price_day: Number(buffer.readBigInt64LE(91)),
      high_price_day: Number(buffer.readBigInt64LE(99)),
      low_price_day: Number(buffer.readBigInt64LE(107)),
      close_price: Number(buffer.readBigInt64LE(115))
    };
    
    return data;
  } catch (err) {
    // Fallback to JSON parse if binary fails
    try {
      return JSON.parse(buffer.toString());
    } catch (e) {
      console.error("[WS] Parse error:", e.message);
      return null;
    }
  }
}

// =======================
// SUBSCRIBE TOKENS
// =======================
function subscribeTokens(tokens, source = "manual") {
  if (!isConnected || !wsInstance || wsInstance.readyState !== WebSocket.OPEN) {
    logStabilityEvent("SUBSCRIBE_BLOCKED", { reason: "Not connected", source });
    return false;
  }

  // Filter out already subscribed tokens
  const newTokens = tokens.filter(t => !subscriptions.has(t.token));
  
  // Check limit (excluding duplicates)
  const currentCount = subscriptions.size;
  const newCount = currentCount + newTokens.length;
  
  if (newCount > MAX_SUBSCRIPTIONS) {
    logStabilityEvent("SUBSCRIPTION_LIMIT", { 
      current: currentCount, 
      requested: newTokens.length, 
      max: MAX_SUBSCRIPTIONS 
    });
    
    // Only subscribe up to limit
    const allowedCount = MAX_SUBSCRIPTIONS - currentCount;
    if (allowedCount <= 0) return false;
    
    newTokens.splice(allowedCount);
  }

  if (newTokens.length === 0) {
    return true; // Already subscribed
  }

  try {
    // Format for Angel SmartAPI WebSocket
    const subscriptionPayload = {
      correlationID: `sub_${Date.now()}`,
      action: 1, // Subscribe
      params: {
        mode: 3, // Full mode (LTP + OHLC + OI)
        tokenList: newTokens.map(t => ({
          exchangeType: t.exchangeType || 1,
          tokens: [t.token]
        }))
      }
    };

    wsInstance.send(JSON.stringify(subscriptionPayload));

    // Track subscriptions
    newTokens.forEach(t => {
      subscriptions.set(t.token, {
        symbol: t.symbol,
        exchangeType: t.exchangeType || 1,
        subscribedAt: Date.now(),
        source
      });
    });

    wsStatus.subscriptionCount = subscriptions.size;

    logStabilityEvent("SUBSCRIBED", { 
      count: newTokens.length, 
      total: subscriptions.size,
      source 
    });

    return true;

  } catch (error) {
    logStabilityEvent("SUBSCRIBE_ERROR", { error: error.message, source });
    return false;
  }
}

// =======================
// UNSUBSCRIBE TOKENS
// =======================
function unsubscribeTokens(tokens, source = "manual") {
  if (!isConnected || !wsInstance || wsInstance.readyState !== WebSocket.OPEN) {
    return false;
  }

  // Don't unsubscribe core tokens
  const tokensToRemove = tokens.filter(t => {
    const token = typeof t === "string" ? t : t.token;
    return !coreTokens.has(token) && subscriptions.has(token);
  });

  if (tokensToRemove.length === 0) return true;

  try {
    const unsubscriptionPayload = {
      correlationID: `unsub_${Date.now()}`,
      action: 0, // Unsubscribe
      params: {
        mode: 3,
        tokenList: tokensToRemove.map(t => ({
          exchangeType: typeof t === "string" ? 1 : (t.exchangeType || 1),
          tokens: [typeof t === "string" ? t : t.token]
        }))
      }
    };

    wsInstance.send(JSON.stringify(unsubscriptionPayload));

    // Remove from tracking
    tokensToRemove.forEach(t => {
      const token = typeof t === "string" ? t : t.token;
      subscriptions.delete(token);
    });

    wsStatus.subscriptionCount = subscriptions.size;

    logStabilityEvent("UNSUBSCRIBED", { count: tokensToRemove.length, total: subscriptions.size });

    return true;

  } catch (error) {
    logStabilityEvent("UNSUBSCRIBE_ERROR", { error: error.message });
    return false;
  }
}

// =======================
// DISCONNECT
// =======================
function disconnectWebSocket() {
  logStabilityEvent("DISCONNECTING", { subscriptionCount: subscriptions.size });

  stopHeartbeat();

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (wsInstance) {
    try {
      wsInstance.close();
    } catch (error) {
      console.error("[WS] Disconnect error:", error.message);
    }
    wsInstance = null;
  }

  isConnecting = false;
  isConnected = false;
  wsStatus.connected = false;

  if (global.angelSession) {
    global.angelSession.wsConnected = false;
  }
}

// =======================
// GET STATUS
// =======================
function getWebSocketStatus() {
  const now = Date.now();
  const lastTickTime = wsStatus.lastTick ? new Date(wsStatus.lastTick).getTime() : 0;
  const lastTickAge = Math.floor((now - lastTickTime) / 1000);

  return {
    connected: isConnected,
    connecting: isConnecting,
    lastTick: wsStatus.lastTick,
    lastTickAge,
    tickCount: wsStatus.tickCount,
    subscriptionCount: subscriptions.size,
    maxSubscriptions: MAX_SUBSCRIPTIONS,
    utilization: ((subscriptions.size / MAX_SUBSCRIPTIONS) * 100).toFixed(1) + "%",
    reconnectAttempts: reconnectAttempts,
    maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
    currentBackoff: currentReconnectDelay,
    isStale: lastTickAge > 60 && wsStatus.tickCount > 0,
    errors429: wsStatus.errors429,
    ltpCacheSize: wsStatus.ltpCacheSize
  };
}

// =======================
// GET SUBSCRIPTION COUNT
// =======================
function getSubscriptionCount() {
  return subscriptions.size;
}

// =======================
// GET STABILITY LOG
// =======================
function getStabilityLog(hours = 1) {
  const cutoff = Date.now() - (hours * 60 * 60 * 1000);
  return stabilityLog.filter(entry => new Date(entry.timestamp).getTime() > cutoff);
}

// =======================
// RESET RECONNECT COUNTER (Manual recovery)
// =======================
function resetReconnect() {
  reconnectAttempts = 0;
  currentReconnectDelay = INITIAL_RECONNECT_DELAY;
  logStabilityEvent("RECONNECT_RESET", {});
}

// =======================
// EXPORTS
// =======================
module.exports = {
  connectWebSocket,
  disconnectWebSocket,
  subscribeTokens,
  unsubscribeTokens,
  getWebSocketStatus,
  getSubscriptionCount,
  getStabilityLog,
  resetReconnect,
  wsEmitter,
  MAX_SUBSCRIPTIONS
};
