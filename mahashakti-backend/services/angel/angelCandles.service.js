// ==========================================
// ANGEL CANDLES SERVICE - DOCUMENTATION COMPLIANT
// Angel One SmartAPI Historical Candle API
// Strictly as per official documentation
// ==========================================

const axios = require("axios");

// ==========================================
// ANGEL API BASE URL
// ==========================================
const BASE_URL = "https://apiconnect.angelone.in";

// ==========================================
// VALID INTERVAL ENUM VALUES
// As per Angel One SmartAPI Documentation
// ==========================================
const VALID_INTERVALS = {
  "ONE_MINUTE": { maxDays: 30 },
  "THREE_MINUTE": { maxDays: 60 },
  "FIVE_MINUTE": { maxDays: 90 },
  "TEN_MINUTE": { maxDays: 90 },
  "FIFTEEN_MINUTE": { maxDays: 180 },
  "ONE_DAY": { maxDays: 365 }
};

// ==========================================
// INDEX SYMBOL TOKENS (From Angel Master)
// Format: { exchange, symboltoken, name }
// ==========================================
const INDEX_TOKENS = {
  "NIFTY": { 
    exchange: "NSE", 
    symboltoken: "99926000",
    name: "Nifty 50"
  },
  "BANKNIFTY": { 
    exchange: "NSE", 
    symboltoken: "99926009",
    name: "Nifty Bank"
  },
  "FINNIFTY": { 
    exchange: "NSE", 
    symboltoken: "99926037",
    name: "Nifty Fin Service"
  },
  "MIDCPNIFTY": { 
    exchange: "NSE", 
    symboltoken: "99926074",
    name: "NIFTY MID SELECT"
  },
  "SENSEX": {
    exchange: "BSE",
    symboltoken: "99919000",
    name: "SENSEX"
  }
};

// ==========================================
// FORMAT DATE - IST Timezone Required
// Angel API expects dates in Indian Standard Time
// Format: "YYYY-MM-DD HH:MM"
// ==========================================
function formatDate(date) {
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds
  const istDate = new Date(date.getTime() + istOffset);
  
  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(istDate.getUTCDate()).padStart(2, "0");
  const hours = String(istDate.getUTCHours()).padStart(2, "0");
  const minutes = String(istDate.getUTCMinutes()).padStart(2, "0");
  
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// ==========================================
// GET HEADERS - As per SmartAPI Spec
// ==========================================
function getHeaders() {
  const session = global.angelSession || {};
  
  if (!session.jwtToken || !session.apiKey) {
    console.error("[CANDLES] ❌ Missing session tokens");
    return null;
  }
  
  return {
    "Authorization": `Bearer ${session.jwtToken}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-UserType": "USER",
    "X-SourceID": "WEB",
    "X-ClientLocalIP": "127.0.0.1",
    "X-ClientPublicIP": "106.51.71.158",
    "X-MACAddress": "00:00:00:00:00:00",
    "X-PrivateKey": session.apiKey
  };
}

// ==========================================
// GET INDEX INFO
// ==========================================
function getIndexInfo(symbol) {
  const upperSymbol = symbol.toUpperCase().replace(/\s+/g, "");
  
  // Direct match
  if (INDEX_TOKENS[upperSymbol]) {
    return INDEX_TOKENS[upperSymbol];
  }
  
  // Partial match for variations
  for (const [key, value] of Object.entries(INDEX_TOKENS)) {
    if (upperSymbol.includes(key) || key.includes(upperSymbol)) {
      return value;
    }
  }
  
  console.error(`[CANDLES] ❌ Unknown index symbol: ${symbol}`);
  return null;
}

// ==========================================
// FETCH HISTORICAL CANDLES
// Strictly as per Angel One SmartAPI Documentation
// ==========================================
async function fetchCandles(symbol, interval = "FIVE_MINUTE", count = 100) {
  const startTime = Date.now();
  
  console.log(`[CANDLES] ========================================`);
  console.log(`[CANDLES] Fetching candles for: ${symbol}`);
  console.log(`[CANDLES] Interval: ${interval}`);
  console.log(`[CANDLES] Count requested: ${count}`);
  
  try {
    // =====================================
    // STEP 1: Validate Session
    // =====================================
    const headers = getHeaders();
    if (!headers) {
      return {
        success: false,
        error: "Angel session missing or expired",
        candles: []
      };
    }
    
    // =====================================
    // STEP 2: Validate Interval
    // =====================================
    if (!VALID_INTERVALS[interval]) {
      console.error(`[CANDLES] ❌ Invalid interval: ${interval}`);
      console.log(`[CANDLES] Valid intervals: ${Object.keys(VALID_INTERVALS).join(", ")}`);
      return {
        success: false,
        error: `Invalid interval: ${interval}. Valid values: ${Object.keys(VALID_INTERVALS).join(", ")}`,
        candles: []
      };
    }
    
    // =====================================
    // STEP 3: Get Symbol Token
    // =====================================
    const indexInfo = getIndexInfo(symbol);
    if (!indexInfo) {
      return {
        success: false,
        error: `Unknown symbol: ${symbol}`,
        candles: []
      };
    }
    
    console.log(`[CANDLES] Exchange: ${indexInfo.exchange}`);
    console.log(`[CANDLES] Symbol Token: ${indexInfo.symboltoken}`);
    console.log(`[CANDLES] Name: ${indexInfo.name}`);
    
    // =====================================
    // STEP 4: Calculate Date Range
    // As per Angel limits for interval
    // =====================================
    const maxDays = VALID_INTERVALS[interval].maxDays;
    const toDate = new Date();
    const fromDate = new Date();
    
    // Go back appropriate number of days
    const daysBack = Math.min(7, maxDays); // 7 days is enough for 100 candles
    fromDate.setDate(fromDate.getDate() - daysBack);
    
    // Set to market hours (9:15 AM - 3:30 PM IST)
    fromDate.setHours(9, 15, 0, 0);
    
    const formattedFromDate = formatDate(fromDate);
    const formattedToDate = formatDate(toDate);
    
    console.log(`[CANDLES] From Date: ${formattedFromDate}`);
    console.log(`[CANDLES] To Date: ${formattedToDate}`);
    
    // =====================================
    // STEP 5: Build Payload
    // Strictly as per Angel Documentation
    // =====================================
    const payload = {
      exchange: indexInfo.exchange,
      symboltoken: indexInfo.symboltoken,
      interval: interval,
      fromdate: formattedFromDate,
      todate: formattedToDate
    };
    
    console.log(`[CANDLES] Request Payload:`, JSON.stringify(payload, null, 2));
    
    // =====================================
    // STEP 6: Make API Request
    // =====================================
    const url = `${BASE_URL}/rest/secure/angelbroking/historical/v1/getCandleData`;
    console.log(`[CANDLES] API URL: ${url}`);
    
    const response = await axios.post(url, payload, {
      headers: headers,
      timeout: 15000
    });
    
    console.log(`[CANDLES] Response Status: ${response.status}`);
    console.log(`[CANDLES] Response Message: ${response.data?.message}`);
    
    // =====================================
    // STEP 7: Parse Response
    // =====================================
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
      
      const executionTime = Date.now() - startTime;
      
      console.log(`[CANDLES] ✅ SUCCESS`);
      console.log(`[CANDLES] Total candles received: ${rawCandles.length}`);
      console.log(`[CANDLES] Candles returned: ${candles.length}`);
      console.log(`[CANDLES] Execution time: ${executionTime}ms`);
      console.log(`[CANDLES] ========================================`);
      
      return {
        success: true,
        symbol: symbol,
        exchange: indexInfo.exchange,
        token: indexInfo.symboltoken,
        interval: interval,
        candleCount: candles.length,
        candles: candles,
        executionTime: executionTime
      };
    }
    
    // =====================================
    // STEP 8: Handle API Error Response
    // =====================================
    console.error(`[CANDLES] ❌ API returned failure`);
    console.error(`[CANDLES] Status: ${response.data?.status}`);
    console.error(`[CANDLES] Message: ${response.data?.message}`);
    console.error(`[CANDLES] Error Code: ${response.data?.errorcode}`);
    console.error(`[CANDLES] Full Response:`, JSON.stringify(response.data));
    
    return {
      success: false,
      error: response.data?.message || "Angel API returned failure",
      errorCode: response.data?.errorcode,
      candles: []
    };
    
  } catch (err) {
    const executionTime = Date.now() - startTime;
    
    console.error(`[CANDLES] ❌ EXCEPTION`);
    console.error(`[CANDLES] Error Type: ${err.name}`);
    console.error(`[CANDLES] Error Message: ${err.message}`);
    
    if (err.response) {
      console.error(`[CANDLES] HTTP Status: ${err.response.status}`);
      console.error(`[CANDLES] Response Data:`, JSON.stringify(err.response.data));
    }
    
    console.error(`[CANDLES] Execution time: ${executionTime}ms`);
    console.error(`[CANDLES] ========================================`);
    
    return {
      success: false,
      error: err.response?.data?.message || err.message,
      errorCode: err.response?.data?.errorcode,
      httpStatus: err.response?.status,
      candles: []
    };
  }
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
  if (!candles || candles.length === 0) {
    return null;
  }
  
  return candles[candles.length - 1];
}

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
  fetchCandles,
  extractOHLCV,
  getLatestFromCandles,
  getIndexInfo,
  INDEX_TOKENS,
  VALID_INTERVALS
};
