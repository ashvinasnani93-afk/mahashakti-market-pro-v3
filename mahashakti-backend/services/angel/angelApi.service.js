// ==========================================
// ANGEL ONE API SERVICE - BATCH FULL QUOTE UPGRADE
// MAHASHAKTI MARKET PRO - INSTITUTIONAL GRADE
// ==========================================

const axios = require("axios");
const https = require("https");

// ==========================================
// BASE CONFIG
// ==========================================
const BASE_URL = "https://apiconnect.angelone.in";
const BATCH_LIMIT = 50; // Angel API limit per request

// ==========================================
// STOCK MASTER CACHE (NSE + BSE)
// ==========================================
let STOCK_MASTER_LOADED = false;

const STOCK_TOKEN_MAP = {
  NSE: {},
  BSE: {}
};

// ==========================================
// COMMODITY MASTER CACHE (MCX)
// ==========================================
let COMMODITY_MASTER_LOADED = false;

const COMMODITY_TOKEN_MAP = {};
const COMMODITY_NAME_TO_SYMBOL = {};

// Common MCX commodity mappings
const COMMODITY_FRIENDLY_NAMES = {
  GOLD: "GOLDCOM",
  GOLDM: "GOLDMCOM",
  SILVER: "SILVERCOM",
  SILVERM: "SILVERMCOM",
  SILVERMIC: "SILVERMICCOM",
  CRUDE: "CRUDEOILCOM",
  CRUDEOIL: "CRUDEOILCOM",
  CRUDEOILM: "CRUDEOILMCOM",
  NATURALGAS: "NATURALGASCOM",
  NATGAS: "NATURALGASCOM",
  COPPER: "COPPERCOM",
  ZINC: "ZINCCOM",
  LEAD: "LEADCOM",
  NICKEL: "NICKELCOM",
  ALUMINIUM: "ALUMINIUMCOM"
};

// ==========================================
// LOAD STOCK MASTER FROM ANGEL
// ==========================================
async function loadStockMaster() {
  if (STOCK_MASTER_LOADED) return;

  console.log("[STOCK] Loading Angel Stock Master (NSE + BSE)...");

  return new Promise((resolve, reject) => {
    https
      .get(
        "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json",
        { timeout: 20000 },
        (res) => {
          let data = "";

          res.on("data", (chunk) => {
            data += chunk;
          });

          res.on("end", () => {
            try {
              const json = JSON.parse(data);

              json.forEach((row) => {
                if (!row.symbol || !row.token || !row.exch_seg) return;

                const symbol = row.symbol.toUpperCase();

                if (row.exch_seg === "NSE") {
                  STOCK_TOKEN_MAP.NSE[symbol] = row.token;
                }

                if (row.exch_seg === "BSE") {
                  STOCK_TOKEN_MAP.BSE[symbol] = row.token;
                }
              });

              STOCK_MASTER_LOADED = true;

              console.log(
                `[STOCK] ✅ Master Loaded | NSE: ${Object.keys(
                  STOCK_TOKEN_MAP.NSE
                ).length} | BSE: ${Object.keys(
                  STOCK_TOKEN_MAP.BSE
                ).length}`
              );

              resolve();
            } catch (e) {
              console.error("[STOCK] ❌ Parse Error:", e.message);
              reject(e);
            }
          });
        }
      )
      .on("error", (err) => {
        console.error("[STOCK] ❌ Download Error:", err.message);
        reject(err);
      });
  });
}

// ==========================================
// LOAD COMMODITY MASTER FROM ANGEL (MCX)
// ==========================================
async function loadCommodityMaster() {
  if (COMMODITY_MASTER_LOADED) return;

  console.log("[MCX] 📥 Loading Angel Commodity Master...");

  return new Promise((resolve, reject) => {
    https
      .get(
        "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json",
        { timeout: 20000 },
        (res) => {
          let data = "";

          res.on("data", (chunk) => {
            data += chunk;
          });

          res.on("end", () => {
            try {
              const json = JSON.parse(data);

              json.forEach((row) => {
                if (!row.symbol || !row.token || !row.exch_seg) return;

                if (row.exch_seg === "MCX") {
                  const symbol = row.symbol.toUpperCase();
                  const name = row.name ? row.name.toUpperCase() : "";

                  COMMODITY_TOKEN_MAP[symbol] = row.token;

                  if (name) {
                    COMMODITY_NAME_TO_SYMBOL[name] = symbol;
                  }
                }
              });

              COMMODITY_MASTER_LOADED = true;

              console.log(
                `[MCX] ✅ Master Loaded | Total Symbols: ${
                  Object.keys(COMMODITY_TOKEN_MAP).length
                }`
              );

              resolve();
            } catch (e) {
              console.error("[MCX] ❌ Parse Error:", e.message);
              reject(e);
            }
          });
        }
      )
      .on("error", (err) => {
        console.error("[MCX] ❌ Download Error:", err.message);
        reject(err);
      });
  });
}

// ==========================================
// GET COMMODITY SYMBOL & TOKEN
// ==========================================
function getCommodityToken(inputSymbol) {
  const upperInput = inputSymbol.toUpperCase();

  console.log(`[MCX] 🔍 Looking for: ${upperInput}`);

  // STEP 1: Friendly name mapping
  const friendlyMapping = COMMODITY_FRIENDLY_NAMES[upperInput];

  if (friendlyMapping && COMMODITY_TOKEN_MAP[friendlyMapping]) {
    console.log(
      `[MCX] ✅ Friendly mapping: ${upperInput} → ${friendlyMapping} (token: ${COMMODITY_TOKEN_MAP[friendlyMapping]})`
    );

    return {
      symbol: friendlyMapping,
      token: COMMODITY_TOKEN_MAP[friendlyMapping]
    };
  }

  // STEP 2: Exact symbol match
  if (COMMODITY_TOKEN_MAP[upperInput]) {
    console.log(
      `[MCX] ✅ Exact match: ${upperInput} (token: ${COMMODITY_TOKEN_MAP[upperInput]})`
    );

    return {
      symbol: upperInput,
      token: COMMODITY_TOKEN_MAP[upperInput]
    };
  }

  // STEP 3: Name-based lookup
  if (COMMODITY_NAME_TO_SYMBOL[upperInput]) {
    const exactSymbol = COMMODITY_NAME_TO_SYMBOL[upperInput];

    console.log(
      `[MCX] ✅ Name lookup: ${upperInput} → ${exactSymbol} (token: ${COMMODITY_TOKEN_MAP[exactSymbol]})`
    );

    return {
      symbol: exactSymbol,
      token: COMMODITY_TOKEN_MAP[exactSymbol]
    };
  }

  // STEP 4: Auto-add COM suffix
  if (!upperInput.endsWith("COM")) {
    const withCom = upperInput + "COM";

    if (COMMODITY_TOKEN_MAP[withCom]) {
      console.log(
        `[MCX] ✅ Added COM suffix: ${upperInput} → ${withCom} (token: ${COMMODITY_TOKEN_MAP[withCom]})`
      );

      return {
        symbol: withCom,
        token: COMMODITY_TOKEN_MAP[withCom]
      };
    }
  }

  // STEP 5: Partial match
  const partialMatch = Object.keys(COMMODITY_TOKEN_MAP).find(
    (sym) =>
      sym.includes(upperInput) ||
      upperInput.includes(sym.replace("COM", ""))
  );

  if (partialMatch) {
    console.log(
      `[MCX] ⚠️ Partial match: ${upperInput} → ${partialMatch} (token: ${COMMODITY_TOKEN_MAP[partialMatch]})`
    );

    return {
      symbol: partialMatch,
      token: COMMODITY_TOKEN_MAP[partialMatch]
    };
  }

  console.log(`[MCX] ❌ Not found: ${upperInput}`);

  return null;
}

// ==========================================
// GLOBAL SESSION
// ==========================================
let globalJwtToken = null;
let globalApiKey = null;
let globalClientCode = null;

function setGlobalTokens(jwtToken, apiKey, clientCode) {
  globalJwtToken = jwtToken;
  globalApiKey = apiKey;
  globalClientCode = clientCode;

  console.log("🔗 API SESSION SET");
  console.log("🔗 ClientCode:", clientCode);

  global.angelSession = global.angelSession || {};
  global.angelSession.jwtToken = jwtToken;
  global.angelSession.apiKey = apiKey;
  global.angelSession.clientCode = clientCode;
}

// ==========================================
// COMMON HEADERS
// ==========================================
function getHeaders(jwtToken = null) {
  return {
    Authorization: `Bearer ${jwtToken || globalJwtToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-UserType": "USER",
    "X-SourceID": "WEB",
    "X-ClientLocalIP": "127.0.0.1",
    "X-ClientPublicIP": "106.51.71.158",
    "X-MACAddress": "00:00:00:00:00:00",
    "X-PrivateKey": globalApiKey
  };
}

// ==========================================
// RESOLVE SYMBOL TO TOKEN & EXCHANGE
// ==========================================
async function resolveSymbolToken(tradingSymbol, preferredExchange = "NSE") {
  await loadStockMaster();
  
  const upperSymbol = tradingSymbol.toUpperCase();
  let exchange = preferredExchange;
  let symbolToken = null;
  let resolvedSymbol = upperSymbol;

  // TRY 1: Direct match in preferred exchange
  symbolToken = STOCK_TOKEN_MAP[exchange]?.[upperSymbol];
  
  if (symbolToken) {
    console.log(`[RESOLVE] ✅ Direct match: ${upperSymbol} → ${symbolToken} (${exchange})`);
    return { exchange, symbol: upperSymbol, token: symbolToken };
  }

  // TRY 2: With -EQ suffix (for stocks)
  if (!upperSymbol.endsWith("-EQ")) {
    const eqSymbol = upperSymbol + "-EQ";
    symbolToken = STOCK_TOKEN_MAP[exchange]?.[eqSymbol];
    
    if (symbolToken) {
      resolvedSymbol = eqSymbol;
      console.log(`[RESOLVE] ✅ Resolved with -EQ: ${eqSymbol} → ${symbolToken} (${exchange})`);
      return { exchange, symbol: resolvedSymbol, token: symbolToken };
    }
  }

  // TRY 3: Remove -EQ if already present
  if (upperSymbol.endsWith("-EQ")) {
    const baseSymbol = upperSymbol.replace("-EQ", "");
    symbolToken = STOCK_TOKEN_MAP[exchange]?.[baseSymbol];
    
    if (symbolToken) {
      resolvedSymbol = baseSymbol;
      console.log(`[RESOLVE] ✅ Resolved without -EQ: ${baseSymbol} → ${symbolToken} (${exchange})`);
      return { exchange, symbol: resolvedSymbol, token: symbolToken };
    }
  }

  // TRY 4: Fallback to alternate exchange
  const alternateExchange = exchange === "NSE" ? "BSE" : "NSE";
  
  symbolToken = STOCK_TOKEN_MAP[alternateExchange]?.[upperSymbol];
  if (!symbolToken) {
    symbolToken = STOCK_TOKEN_MAP[alternateExchange]?.[upperSymbol + "-EQ"];
    if (symbolToken) {
      resolvedSymbol = upperSymbol + "-EQ";
    }
  }
  
  if (symbolToken) {
    exchange = alternateExchange;
    console.log(`[RESOLVE] ✅ Found in ${alternateExchange}: ${resolvedSymbol} → ${symbolToken}`);
    return { exchange, symbol: resolvedSymbol, token: symbolToken };
  }

  console.log(`[RESOLVE] ❌ Token not found: ${upperSymbol}`);
  return null;
}

// ==========================================
// LTP DATA - LEGACY SINGLE SYMBOL
// ==========================================
async function getLtpData(exchange, tradingSymbol, symbolToken) {
  try {
    console.log(
      `[API] 📞 getLtpData: exchange=${exchange}, symbol=${tradingSymbol}, token=${symbolToken}`
    );

    // Auto-resolve token if not provided
    if (!symbolToken && (exchange === "NSE" || exchange === "BSE")) {
      const resolved = await resolveSymbolToken(tradingSymbol, exchange);
      
      if (!resolved) {
        return {
          success: false,
          message: `Symbol token not found for ${tradingSymbol}`
        };
      }
      
      exchange = resolved.exchange;
      tradingSymbol = resolved.symbol;
      symbolToken = resolved.token;
    }

    // Auto-load token for MCX
    if (!symbolToken && exchange === "MCX") {
      await loadCommodityMaster();
      const commodityInfo = getCommodityToken(tradingSymbol);

      if (commodityInfo) {
        symbolToken = commodityInfo.token;
        tradingSymbol = commodityInfo.symbol;

        console.log(
          `[API] ✅ MCX resolved: symbol=${tradingSymbol}, token=${symbolToken}`
        );
      }
    }

    if (!symbolToken) {
      console.log(
        `[API] ❌ Token not found for: ${tradingSymbol} in ${exchange}`
      );

      return {
        success: false,
        message: `Symbol token not found for ${tradingSymbol} in ${exchange}`
      };
    }

    const payload = {
      exchange,
      tradingsymbol: tradingSymbol,
      symboltoken: symbolToken
    };

    console.log("[API] 🌐 Calling Angel API:", JSON.stringify(payload));

    const response = await axios.post(
      `${BASE_URL}/rest/secure/angelbroking/order/v1/getLtpData`,
      payload,
      {
        headers: getHeaders(),
        timeout: 15000
      }
    );

    console.log("[API] 📥 Response status:", response.data?.status);

    if (response.data && response.data.status === true) {
      console.log(
        "[API] 📊 Complete Response Data:",
        JSON.stringify(response.data.data, null, 2)
      );

      return {
        success: true,
        data: response.data.data
      };
    }

    console.log(
      "[API] ❌ API returned false status:",
      response.data?.message
    );

    throw new Error(response.data?.message || "LTP fetch failed");
  } catch (err) {
    console.error("[API] ❌ Error:", err.message);

    if (err.response?.data) {
      console.error(
        "[API] ❌ Response data:",
        JSON.stringify(err.response.data)
      );
    }

    return {
      success: false,
      error: err.response?.data?.message || err.message
    };
  }
}

// ==========================================
// GET FULL QUOTE - BATCH MODE (UPGRADED)
// INSTITUTIONAL GRADE - 50 SYMBOLS PER CALL
// ==========================================
async function getFullQuote(symbols) {
  try {
    // Handle single symbol (backward compatibility)
    if (typeof symbols === "string" || (typeof symbols === "object" && !Array.isArray(symbols))) {
      const singleSymbol = typeof symbols === "string" ? symbols : symbols.symbol;
      const exchange = typeof symbols === "object" ? symbols.exchange : "NSE";
      
      return getFullQuoteSingle(exchange, singleSymbol);
    }

    // Handle batch mode (array of symbols)
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return {
        success: false,
        error: "Invalid input: Expected array of symbols or single symbol string"
      };
    }

    console.log(`[FULL_QUOTE] 📊 Batch request: ${symbols.length} symbols`);

    // Split into chunks of 50 (Angel API limit)
    const chunks = [];
    for (let i = 0; i < symbols.length; i += BATCH_LIMIT) {
      chunks.push(symbols.slice(i, i + BATCH_LIMIT));
    }

    console.log(`[FULL_QUOTE] 📦 Split into ${chunks.length} batches`);

    const allResults = [];

    // Process each chunk
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      
      console.log(`[FULL_QUOTE] Processing batch ${chunkIndex + 1}/${chunks.length} (${chunk.length} symbols)`);

      const batchResults = await processBatch(chunk);
      allResults.push(...batchResults);
    }

    const successful = allResults.filter(r => r.success);
    const failed = allResults.filter(r => !r.success);

    console.log(`[FULL_QUOTE] ✅ Success: ${successful.length} | ❌ Failed: ${failed.length}`);

    return {
      success: true,
      total: symbols.length,
      successful: successful.length,
      failed: failed.length,
      data: successful,
      errors: failed
    };

  } catch (err) {
    console.error("[FULL_QUOTE] ❌ Fatal Error:", err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

// ==========================================
// PROCESS BATCH - 50 SYMBOLS MAX
// ==========================================
async function processBatch(symbolsChunk) {
  const results = [];
  const exchangeTokens = { NSE: [], BSE: [], MCX: [] };
  const symbolMap = {}; // token -> symbol mapping

  await loadStockMaster();
  await loadCommodityMaster();

  // Resolve all symbols to tokens
  for (const symbolInput of symbolsChunk) {
    let symbol, exchange;

    if (typeof symbolInput === "string") {
      symbol = symbolInput;
      exchange = "NSE";
    } else {
      symbol = symbolInput.symbol;
      exchange = symbolInput.exchange || "NSE";
    }

    // NSE/BSE resolution
    if (exchange === "NSE" || exchange === "BSE") {
      const resolved = await resolveSymbolToken(symbol, exchange);
      
      if (resolved) {
        exchangeTokens[resolved.exchange].push(resolved.token);
        symbolMap[resolved.token] = {
          symbol: resolved.symbol,
          exchange: resolved.exchange,
          originalSymbol: symbol
        };
      } else {
        // Volume integrity: Try BSE if NSE failed
        if (exchange === "NSE") {
          const bseResolved = await resolveSymbolToken(symbol, "BSE");
          
          if (bseResolved) {
            exchangeTokens.BSE.push(bseResolved.token);
            symbolMap[bseResolved.token] = {
              symbol: bseResolved.symbol,
              exchange: "BSE",
              originalSymbol: symbol
            };
            console.log(`[VOLUME_INTEGRITY] NSE dead, using BSE: ${symbol}`);
          } else {
            results.push({
              success: false,
              symbol,
              error: "Token not found in NSE or BSE"
            });
          }
        } else {
          results.push({
            success: false,
            symbol,
            error: `Token not found in ${exchange}`
          });
        }
      }
    }

    // MCX resolution
    if (exchange === "MCX") {
      const commodityInfo = getCommodityToken(symbol);
      
      if (commodityInfo) {
        exchangeTokens.MCX.push(commodityInfo.token);
        symbolMap[commodityInfo.token] = {
          symbol: commodityInfo.symbol,
          exchange: "MCX",
          originalSymbol: symbol
        };
      } else {
        results.push({
          success: false,
          symbol,
          error: "Commodity token not found"
        });
      }
    }
  }

  // Build payload for Angel API
  const payload = {
    mode: "FULL",
    exchangeTokens: {}
  };

  // Only include exchanges that have tokens
  for (const [exchange, tokens] of Object.entries(exchangeTokens)) {
    if (tokens.length > 0) {
      payload.exchangeTokens[exchange] = tokens;
    }
  }

  if (Object.keys(payload.exchangeTokens).length === 0) {
    console.log("[BATCH] ❌ No valid tokens to fetch");
    return results;
  }

  console.log(`[BATCH] 🌐 API Call:`, JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(
      `${BASE_URL}/rest/secure/angelbroking/market/v1/quote`,
      payload,
      {
        headers: getHeaders(),
        timeout: 20000
      }
    );

    if (!response.data || response.data.status !== true) {
      throw new Error(response.data?.message || "Batch quote fetch failed");
    }

    const fetched = response.data.data?.fetched || [];

    console.log(`[BATCH] ✅ Received ${fetched.length} quotes`);

    // Process each quote
    for (const quote of fetched) {
      const token = quote.symbolToken;
      const symbolInfo = symbolMap[token];

      if (!symbolInfo) {
        console.warn(`[BATCH] ⚠️ Unknown token: ${token}`);
        continue;
      }

      // Volume integrity check
      const volume = quote.tradeVolume || quote.totalTradedVolume || quote.volume || 0;
      
      if (volume === 0) {
        console.warn(`[VOLUME_INTEGRITY] ⚠️ Zero volume detected: ${symbolInfo.symbol} (${symbolInfo.exchange})`);
        
        // If NSE has zero volume, try BSE
        if (symbolInfo.exchange === "NSE") {
          const bseResolved = await resolveSymbolToken(symbolInfo.originalSymbol, "BSE");
          
          if (bseResolved) {
            console.log(`[VOLUME_INTEGRITY] Retrying with BSE: ${symbolInfo.originalSymbol}`);
            const bseQuote = await getFullQuoteSingle("BSE", bseResolved.symbol, bseResolved.token);
            
            if (bseQuote.success && bseQuote.data.volume > 0) {
              results.push(bseQuote);
              continue;
            }
          }
        }

        // Both NSE and BSE dead - reject symbol
        results.push({
          success: false,
          symbol: symbolInfo.originalSymbol,
          error: "Zero volume in both NSE and BSE - illiquid symbol rejected"
        });
        continue;
      }

      // Build structured response
      const structuredData = {
        success: true,
        symbol: symbolInfo.symbol,
        originalSymbol: symbolInfo.originalSymbol,
        exchange: symbolInfo.exchange,
        token: token,
        data: {
          ltp: parseFloat(quote.ltp) || 0,
          open: parseFloat(quote.open) || 0,
          high: parseFloat(quote.high) || 0,
          low: parseFloat(quote.low) || 0,
          close: parseFloat(quote.close) || parseFloat(quote.ltp) || 0,
          prevClose: parseFloat(quote.close) || 0,
          volume: parseInt(volume) || 0,
          totalTradedVolume: parseInt(quote.totalTradedVolume || quote.tradeVolume || volume) || 0,
          totalBuyQty: parseInt(quote.totBuyQuan || quote.totalBuyQty || 0),
          totalSellQty: parseInt(quote.totSellQuan || quote.totalSellQty || 0),
          vwap: parseFloat(quote.averagePrice || quote.vwap || 0),
          lowerCircuit: parseFloat(quote.lowerCircuit || 0),
          upperCircuit: parseFloat(quote.upperCircuit || 0),
          openInterest: parseInt(quote.openInterest || 0),
          lastTradeTime: quote.exchFeedTime || quote.lastTradedTime || null
        }
      };

      results.push(structuredData);
    }

  } catch (err) {
    console.error("[BATCH] ❌ API Error:", err.message);
    
    // Mark all symbols in this batch as failed
    for (const token of Object.keys(symbolMap)) {
      const symbolInfo = symbolMap[token];
      results.push({
        success: false,
        symbol: symbolInfo.originalSymbol,
        error: err.message
      });
    }
  }

  return results;
}

// ==========================================
// GET FULL QUOTE SINGLE - BACKWARD COMPATIBLE
// ==========================================
async function getFullQuoteSingle(exchange, tradingSymbol, symbolToken = null) {
  try {
    if (!symbolToken) {
      const resolved = await resolveSymbolToken(tradingSymbol, exchange);
      
      if (!resolved) {
        return {
          success: false,
          error: `Token not found for ${tradingSymbol} in ${exchange}`
        };
      }
      
      exchange = resolved.exchange;
      tradingSymbol = resolved.symbol;
      symbolToken = resolved.token;
    }

    const payload = {
      mode: "FULL",
      exchangeTokens: {
        [exchange]: [symbolToken]
      }
    };

    const response = await axios.post(
      `${BASE_URL}/rest/secure/angelbroking/market/v1/quote`,
      payload,
      {
        headers: getHeaders(),
        timeout: 15000
      }
    );

    if (response.data && response.data.status === true) {
      const quote = response.data.data.fetched[0];
      
      // Volume integrity check
      const volume = quote.tradeVolume || quote.totalTradedVolume || quote.volume || 0;
      
      if (volume === 0 && exchange === "NSE") {
        console.warn(`[VOLUME_INTEGRITY] NSE volume zero, trying BSE: ${tradingSymbol}`);
        
        const bseResolved = await resolveSymbolToken(tradingSymbol, "BSE");
        if (bseResolved) {
          return getFullQuoteSingle("BSE", bseResolved.symbol, bseResolved.token);
        }
      }

      return {
        success: true,
        symbol: tradingSymbol,
        exchange,
        token: symbolToken,
        data: {
          ltp: parseFloat(quote.ltp) || 0,
          open: parseFloat(quote.open) || 0,
          high: parseFloat(quote.high) || 0,
          low: parseFloat(quote.low) || 0,
          close: parseFloat(quote.close) || parseFloat(quote.ltp) || 0,
          prevClose: parseFloat(quote.close) || 0,
          volume: parseInt(volume) || 0,
          totalTradedVolume: parseInt(quote.totalTradedVolume || quote.tradeVolume || volume) || 0,
          totalBuyQty: parseInt(quote.totBuyQuan || quote.totalBuyQty || 0),
          totalSellQty: parseInt(quote.totSellQuan || quote.totalSellQty || 0),
          vwap: parseFloat(quote.averagePrice || quote.vwap || 0),
          lowerCircuit: parseFloat(quote.lowerCircuit || 0),
          upperCircuit: parseFloat(quote.upperCircuit || 0),
          openInterest: parseInt(quote.openInterest || 0),
          lastTradeTime: quote.exchFeedTime || quote.lastTradedTime || null
        }
      };
    }

    throw new Error("Full quote fetch failed");

  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

// ==========================================
// RMS, ORDER BOOK, TRADE BOOK, PLACE ORDER
// ==========================================
async function getRMS() {
  try {
    const response = await axios.get(
      `${BASE_URL}/rest/secure/angelbroking/user/v1/getRMS`,
      { headers: getHeaders() }
    );

    if (response.data && response.data.status === true) {
      return { success: true, data: response.data.data };
    }

    throw new Error("RMS fetch failed");
  } catch (err) {
    console.error("❌ RMS Error:", err.message);
    return { success: false, error: err.message };
  }
}

async function getOrderBook() {
  try {
    const response = await axios.get(
      `${BASE_URL}/rest/secure/angelbroking/order/v1/getOrderBook`,
      { headers: getHeaders() }
    );

    if (response.data && response.data.status === true) {
      return { success: true, orders: response.data.data };
    }

    throw new Error("Order book fetch failed");
  } catch (err) {
    console.error("❌ Order Book Error:", err.message);
    return { success: false, error: err.message };
  }
}

async function getTradeBook() {
  try {
    const response = await axios.get(
      `${BASE_URL}/rest/secure/angelbroking/order/v1/getTradeBook`,
      { headers: getHeaders() }
    );

    if (response.data && response.data.status === true) {
      return { success: true, trades: response.data.data };
    }

    throw new Error("Trade book fetch failed");
  } catch (err) {
    console.error("❌ Trade Book Error:", err.message);
    return { success: false, error: err.message };
  }
}

async function placeOrder(orderParams) {
  try {
    const response = await axios.post(
      `${BASE_URL}/rest/secure/angelbroking/order/v1/placeOrder`,
      orderParams,
      { headers: getHeaders() }
    );

    if (response.data && response.data.status === true) {
      console.log("✅ Order Placed:", response.data.data.orderid);

      return {
        success: true,
        orderId: response.data.data.orderid
      };
    }

    throw new Error(response.data?.message || "Order placement failed");
  } catch (err) {
    console.error("❌ Place Order Error:", err.response?.data || err.message);

    return {
      success: false,
      error: err.response?.data?.message || err.message,
      errorCode: err.response?.data?.errorcode
    };
  }
}

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
  setGlobalTokens,
  getLtpData,
  getFullQuote,           // UPGRADED - NOW SUPPORTS BATCH MODE
  getFullQuoteSingle,     // NEW - EXPLICIT SINGLE SYMBOL
  resolveSymbolToken,     // NEW - UTILITY EXPORT
  getRMS,
  getOrderBook,
  getTradeBook,
  placeOrder,
  loadStockMaster,
  loadCommodityMaster,
  getCommodityToken,
  STOCK_TOKEN_MAP,
  COMMODITY_TOKEN_MAP,
  COMMODITY_NAME_TO_SYMBOL,
  COMMODITY_FRIENDLY_NAMES,
  BATCH_LIMIT              // NEW - EXPORT LIMIT CONSTANT
};
