// =======================
// ANGEL ONE WEBSOCKET SERVICE
// PRODUCTION READY WITH SINGLETON GUARD
// =======================

const SmartAPI = require("smartapi-javascript");
const EventEmitter = require("events");

// =======================
// CONFIGURATION
// =======================
const MAX_SUBSCRIPTIONS = 50;
const RECONNECT_DELAY = 10000; // 10 seconds
const MAX_RECONNECT_ATTEMPTS = 5;

// =======================
// SINGLETON GUARDS
// =======================
let wsInstance = null;
let isConnecting = false;
let isConnected = false;
let reconnectAttempts = 0;
let reconnectTimer = null;

// =======================
// SUBSCRIPTIONS
// =======================
const subscriptions = new Map();
let subscriptionCount = 0;

// =======================
// STATUS
// =======================
let wsStatus = {
  connected: false,
  lastTick: null,
  tickCount: 0,
  subscriptionCount: 0,
  ltpCacheSize: 0
};

// =======================
// EVENT EMITTER
// =======================
const wsEmitter = new EventEmitter();

// =======================
// CONNECT WEBSOCKET (SINGLETON)
// =======================
async function connectWebSocket(jwtToken, apiKey, clientCode, feedToken) {
  // Singleton guard
  if (isConnecting) {
    console.log("[WS] Already connecting");
    return { success: false, message: "Connection in progress" };
  }

  if (isConnected && wsInstance) {
    console.log("[WS] Already connected");
    return { success: true, message: "Already connected" };
  }

  // Max reconnect guard
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log(`[WS] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached`);
    return { success: false, message: "Max reconnect attempts reached" };
  }

  isConnecting = true;
  reconnectAttempts++;

  try {
    console.log(`[WS] 🔌 Connecting to Angel WebSocket (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

    // Initialize SmartAPI instance
    wsInstance = new SmartAPI({
      api_key: apiKey,
      access_token: jwtToken
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        isConnecting = false;
        reject(new Error("WebSocket connection timeout"));
      }, 30000);

      // Connect WebSocket
      wsInstance.connectWebSocket({
        token: feedToken,
        clientCode: clientCode
      }, (data) => {
        // Message handler
        handleTick(data);
      });

      // Connection event
      wsInstance.on("connect", () => {
        clearTimeout(timeout);
        isConnecting = false;
        isConnected = true;
        reconnectAttempts = 0;
        
        wsStatus.connected = true;
        
        if (global.angelSession) {
          global.angelSession.wsConnected = true;
        }

        console.log("[WS] ✅ CONNECTED");

        // Subscribe to core indices
        subscribeCoreIndices();

        resolve({ success: true, message: "Connected" });
      });

      // Error event
      wsInstance.on("error", (error) => {
        clearTimeout(timeout);
        isConnecting = false;
        isConnected = false;
        
        wsStatus.connected = false;

        console.error("[WS] ❌ Error:", error.message || error);

        // Schedule reconnect
        scheduleReconnect();

        reject(error);
      });

      // Close event
      wsInstance.on("close", () => {
        clearTimeout(timeout);
        isConnecting = false;
        isConnected = false;
        
        wsStatus.connected = false;

        if (global.angelSession) {
          global.angelSession.wsConnected = false;
        }

        console.log("[WS] ❌ DISCONNECTED");

        // Schedule reconnect
        scheduleReconnect();
      });
    });

  } catch (error) {
    isConnecting = false;
    isConnected = false;
    
    console.error("[WS] ❌ Connection failed:", error.message);
    
    return { success: false, error: error.message };
  }
}

// =======================
// SUBSCRIBE CORE INDICES
// =======================
function subscribeCoreIndices() {
  try {
    const coreIndices = [
      { token: "26000", symbol: "NIFTY", exchangeType: 2 },      // NIFTY 50
      { token: "26009", symbol: "BANKNIFTY", exchangeType: 2 },  // BANKNIFTY
      { token: "26037", symbol: "FINNIFTY", exchangeType: 2 }    // FINNIFTY
    ];

    subscribeTokens(coreIndices, "core");
    
  } catch (error) {
    console.error("[WS] Core subscription error:", error.message);
  }
}

// =======================
// SCHEDULE RECONNECT
// =======================
function scheduleReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log("[WS] Not scheduling reconnect - max attempts reached");
    return;
  }

  console.log(`[WS] 🔄 Scheduling reconnect in ${RECONNECT_DELAY/1000}s`);

  reconnectTimer = setTimeout(() => {
    if (global.angelSession && global.angelSession.jwtToken) {
      console.log("[WS] Attempting reconnect...");
      connectWebSocket(
        global.angelSession.jwtToken,
        global.angelSession.apiKey,
        global.angelSession.clientCode,
        global.angelSession.feedToken
      ).catch(err => {
        console.error("[WS] Reconnect failed:", err.message);
      });
    }
  }, RECONNECT_DELAY);
}

// =======================
// HANDLE TICK DATA
// =======================
function handleTick(data) {
  try {
    wsStatus.lastTick = new Date().toISOString();
    wsStatus.tickCount++;

    // Store in global cache
    if (!global.latestOHLC) {
      global.latestOHLC = {};
    }

    if (!global.latestLTP) {
      global.latestLTP = {};
    }

    if (data && data.token) {
      const sub = subscriptions.get(data.token);
      
      if (sub) {
        const ohlcData = {
          ltp: data.last_traded_price || data.ltp,
          open: data.open_price_day || data.open,
          high: data.high_price_day || data.high,
          low: data.low_price_day || data.low,
          close: data.close_price || data.close,
          volume: data.volume_trade_for_day || data.volume,
          timestamp: new Date().toISOString()
        };

        global.latestOHLC[sub.symbol] = ohlcData;
        global.latestLTP[sub.symbol] = ohlcData.ltp;
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
// SUBSCRIBE TOKENS
// =======================
function subscribeTokens(tokens, source = "manual") {
  if (!isConnected || !wsInstance) {
    console.log(`[WS] ⚠️ Not connected, cannot subscribe (source: ${source})`);
    return false;
  }

  // Check limit
  const newCount = subscriptionCount + tokens.length;
  if (newCount > MAX_SUBSCRIPTIONS) {
    console.log(`[WS] ❌ Subscription limit exceeded: ${newCount}/${MAX_SUBSCRIPTIONS}`);
    return false;
  }

  try {
    console.log(`[WS] 📥 Subscribing ${tokens.length} tokens (source: ${source})`);

    // Format for SmartAPI
    const subscriptionData = tokens.map(t => ({
      exchangeType: t.exchangeType || 1,
      tokens: [t.token],
      mode: 3 // FULL mode
    }));

    wsInstance.subscribe(subscriptionData);

    // Track subscriptions
    tokens.forEach(t => {
      subscriptions.set(t.token, {
        symbol: t.symbol,
        exchangeType: t.exchangeType || 1,
        subscribedAt: Date.now(),
        source
      });
      subscriptionCount++;
    });

    wsStatus.subscriptionCount = subscriptionCount;

    console.log(`[WS] ✅ Subscribed. Total: ${subscriptionCount}/${MAX_SUBSCRIPTIONS}`);

    return true;

  } catch (error) {
    console.error(`[WS] ❌ Subscribe error (source: ${source}):`, error.message);
    return false;
  }
}

// =======================
// UNSUBSCRIBE TOKENS
// =======================
function unsubscribeTokens(tokens, source = "manual") {
  if (!isConnected || !wsInstance) {
    console.log(`[WS] ⚠️ Not connected, cannot unsubscribe (source: ${source})`);
    return false;
  }

  try {
    console.log(`[WS] 📤 Unsubscribing ${tokens.length} tokens (source: ${source})`);

    const unsubscriptionData = tokens.map(t => ({
      exchangeType: t.exchangeType || 1,
      tokens: [typeof t === "string" ? t : t.token]
    }));

    wsInstance.unsubscribe(unsubscriptionData);

    // Remove from tracking
    tokens.forEach(t => {
      const token = typeof t === "string" ? t : t.token;
      subscriptions.delete(token);
      subscriptionCount--;
    });

    wsStatus.subscriptionCount = subscriptionCount;

    console.log(`[WS] ✅ Unsubscribed. Total: ${subscriptionCount}/${MAX_SUBSCRIPTIONS}`);

    return true;

  } catch (error) {
    console.error(`[WS] ❌ Unsubscribe error (source: ${source}):`, error.message);
    return false;
  }
}

// =======================
// DISCONNECT
// =======================
function disconnectWebSocket() {
  console.log("[WS] 🛑 Disconnecting...");

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (wsInstance) {
    try {
      wsInstance.disconnect();
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

  console.log("[WS] Disconnected");
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
    subscriptionCount,
    maxSubscriptions: MAX_SUBSCRIPTIONS,
    utilization: ((subscriptionCount / MAX_SUBSCRIPTIONS) * 100).toFixed(1),
    reconnectAttempts,
    maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
    isStale: lastTickAge > 60 && wsStatus.tickCount > 0,
    ltpCacheSize: wsStatus.ltpCacheSize
  };
}

// =======================
// GET SUBSCRIPTION COUNT
// =======================
function getSubscriptionCount() {
  return subscriptionCount;
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
  wsEmitter,
  MAX_SUBSCRIPTIONS
};
