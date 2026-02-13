// ==========================================
// ANGEL CANDLES SERVICE - HISTORICAL DATA
// Multi-timeframe candle fetching
// 1m, 5m, 15m, 1h, Daily
// ==========================================

const axios = require("axios");
const { BASE_URL, ENDPOINTS, HEADERS, TIMEOUT, VALID_INTERVALS, HISTORICAL_TOKENS } = require("../../config/angel.config");

// ==========================================
// GET HEADERS
// ==========================================
function getHeaders() {
  const session = global.angelSession || {};
  
  if (!session.jwtToken || !session.apiKey) {
    console.error("[CANDLES] Missing session tokens");
    return null;
  }
  
  return {
    "Authorization": `Bearer ${session.jwtToken}`,
    "Content-Type": HEADERS.CONTENT_TYPE,
    "Accept": HEADERS.ACCEPT,
    "X-UserType": HEADERS.USER_TYPE,
    "X-SourceID": HEADERS.SOURCE_ID,
    "X-ClientLocalIP": HEADERS.CLIENT_LOCAL_IP,
    "X-ClientPublicIP": HEADERS.CLIENT_PUBLIC_IP,
    "X-MACAddress": HEADERS.MAC_ADDRESS,
    "X-PrivateKey": session.apiKey
  };
}

// ==========================================
// FORMAT DATE - IST Timezone
// ==========================================
function formatDate(date) {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(date.getTime() + istOffset);
  
  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(istDate.getUTCDate()).padStart(2, "0");
  const hours = String(istDate.getUTCHours()).padStart(2, "0");
  const minutes = String(istDate.getUTCMinutes()).padStart(2, "0");
  
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// ==========================================
// GET INDEX INFO
// ==========================================
function getIndexInfo(symbol) {
  const upperSymbol = symbol.toUpperCase().replace(/\s+/g, "");
  
  if (HISTORICAL_TOKENS[upperSymbol]) {
    return HISTORICAL_TOKENS[upperSymbol];
  }
  
  // Partial match
  for (const [key, value] of Object.entries(HISTORICAL_TOKENS)) {
    if (upperSymbol.includes(key) || key.includes(upperSymbol)) {
      return value;
    }
  }
  
  return null;
}

// ==========================================
// FETCH CANDLES
// ==========================================
async function fetchCandles(symbol, interval = "FIVE_MINUTE", count = 100) {
  const startTime = Date.now();
  
  try {
    const headers = getHeaders();
    if (!headers) {
      return { success: false, error: "Session not available", candles: [] };
    }
    
    // Validate interval
    if (!VALID_INTERVALS[interval]) {
      return {
        success: false,
        error: `Invalid interval: ${interval}. Valid: ${Object.keys(VALID_INTERVALS).join(", ")}`,
        candles: []
      };
    }
    
    // Get symbol token
    const indexInfo = getIndexInfo(symbol);
    if (!indexInfo) {
      return { success: false, error: `Unknown symbol: ${symbol}`, candles: [] };
    }
    
    // Calculate date range
    const maxDays = VALID_INTERVALS[interval].maxDays;
    const toDate = new Date();
    const fromDate = new Date();
    
    // Go back appropriate days based on candle count needed
    let daysBack = 7;
    if (interval === "ONE_DAY") daysBack = 100;
    else if (interval === "ONE_HOUR") daysBack = 30;
    else if (interval === "FIFTEEN_MINUTE") daysBack = 14;
    
    daysBack = Math.min(daysBack, maxDays);
    fromDate.setDate(fromDate.getDate() - daysBack);
    fromDate.setHours(9, 15, 0, 0);
    
    const payload = {
      exchange: indexInfo.exchange,
      symboltoken: indexInfo.symboltoken,
      interval: interval,
      fromdate: formatDate(fromDate),
      todate: formatDate(toDate)
    };
    
    const url = `${BASE_URL}${ENDPOINTS.HISTORICAL}`;
    
    const response = await axios.post(url, payload, {
      headers,
      timeout: TIMEOUT.API
    });
    
    if (response.data && response.data.status === true && response.data.data) {
      const rawCandles = response.data.data;
      
      // Take last 'count' candles
      const candles = rawCandles.slice(-count).map(candle => ({
        timestamp: candle[0],
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseInt(candle[5], 10) || 0
      }));
      
      return {
        success: true,
        symbol,
        exchange: indexInfo.exchange,
        token: indexInfo.symboltoken,
        interval,
        candleCount: candles.length,
        candles,
        executionTime: Date.now() - startTime
      };
    }
    
    return {
      success: false,
      error: response.data?.message || "Candle fetch failed",
      candles: []
    };
    
  } catch (err) {
    console.error("[CANDLES] Error:", err.message);
    return {
      success: false,
      error: err.message,
      candles: []
    };
  }
}

// ==========================================
// FETCH MULTI-TIMEFRAME CANDLES
// ==========================================
async function fetchMultiTimeframe(symbol) {
  const results = {};
  
  const timeframes = [
    { key: "1m", interval: "ONE_MINUTE", count: 50 },
    { key: "5m", interval: "FIVE_MINUTE", count: 50 },
    { key: "15m", interval: "FIFTEEN_MINUTE", count: 50 },
    { key: "1h", interval: "ONE_HOUR", count: 50 },
    { key: "daily", interval: "ONE_DAY", count: 100 }
  ];
  
  for (const tf of timeframes) {
    const result = await fetchCandles(symbol, tf.interval, tf.count);
    results[tf.key] = result;
    
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 200));
  }
  
  return results;
}

// ==========================================
// EXTRACT OHLCV ARRAYS
// ==========================================
function extractOHLCV(candles) {
  if (!candles || !Array.isArray(candles) || candles.length === 0) {
    return {
      opens: [],
      highs: [],
      lows: [],
      closes: [],
      volumes: [],
      timestamps: []
    };
  }
  
  return {
    opens: candles.map(c => c.open),
    highs: candles.map(c => c.high),
    lows: candles.map(c => c.low),
    closes: candles.map(c => c.close),
    volumes: candles.map(c => c.volume),
    timestamps: candles.map(c => c.timestamp)
  };
}

// ==========================================
// GET LATEST CANDLE
// ==========================================
function getLatestFromCandles(candles) {
  if (!candles || candles.length === 0) return null;
  return candles[candles.length - 1];
}

module.exports = {
  fetchCandles,
  fetchMultiTimeframe,
  extractOHLCV,
  getLatestFromCandles,
  getIndexInfo,
  VALID_INTERVALS,
  HISTORICAL_TOKENS
};
