// ==========================================
// LTP ROUTES - COMPLETE WITH OHLC FOR MCX
// GOLD, SILVER, CRUDE with Open, High, Low!
// ==========================================

const express = require("express");
const router = express.Router();

const {
  getFullQuote,   // 👈 NEW
  loadStockMaster,
  loadCommodityMaster,
  getCommodityToken,
  STOCK_TOKEN_MAP,
  COMMODITY_TOKEN_MAP,
  COMMODITY_FRIENDLY_NAMES
} = require("../services/angel/angelApi.service");

// ==========================================
// SYMBOL TYPE DETECTION
// ==========================================
function determineSymbolType(symbol) {
  const s = symbol.toUpperCase();

  // Indices
  const indices = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"];
  if (indices.includes(s)) return "INDEX";

  // Commodities - check against known commodities
  if (COMMODITY_FRIENDLY_NAMES[s]) return "COMMODITY";

  // Common commodity patterns
  const commodityPatterns = [
    "GOLD",
    "SILVER",
    "CRUDE",
    "NATURAL",
    "COPPER",
    "ZINC",
    "LEAD",
    "NICKEL",
    "ALUMINIUM"
  ];

  if (commodityPatterns.some(pattern => s.includes(pattern))) {
    return "COMMODITY";
  }

  return "STOCK";
}

// ==========================================
// EXTRACT OHLC DATA - IMPROVED FOR MCX
// ==========================================
function extractOHLC(data) {
  if (!data) return {};

  // Angel API can return different field names
  // Try all possible fields
  return {
    ltp:
      data.ltp ||
      data.lasttradedprice ||
      data.last_traded_price ||
      null,

    open:
      data.open ||
      data.openprice ||
      data.open_price ||
      null,

    high:
      data.high ||
      data.highprice ||
      data.high_price ||
      null,

    low:
      data.low ||
      data.lowprice ||
      data.low_price ||
      null,

    close:
      data.close ||
      data.closeprice ||
      data.close_price ||
      data.ltp ||
      null,

    prevClose:
      data.prevclose ||
      data.previousclose ||
      data.prev_close ||
      data.close ||
      null,

    // Additional fields
   volume:
  data.volume ||
  data.tradedVolume ||
  data.tradeVolume ||
  data.totalTradedVolume ||
  data.tradedvolume ||
  0,

    exchFeedTime:
      data.exchFeedTime ||
      data.exchange_feed_time ||
      null,

    exchTradeTime:
      data.exchTradeTime ||
      data.exchange_trade_time ||
      null
  };
}

// ==========================================
// GET /api/ltp?symbol=GOLD
// COMPLETE WITH OHLC DATA
// ==========================================
router.get("/", async (req, res) => {
  try {
    const { symbol, force } = req.query;

    if (!symbol) {
      return res.json({
        status: false,
        message: "symbol parameter required",
        examples: [
          "/api/ltp?symbol=NIFTY - Index with OHLC",
          "/api/ltp?symbol=RELIANCE - Stock with OHLC",
          "/api/ltp?symbol=GOLD - Commodity with OHLC",
          "/api/ltp?symbol=SILVER - Commodity with OHLC"
        ]
      });
    }

    const upperSymbol = symbol.toUpperCase();
    const symbolType = determineSymbolType(upperSymbol);

    console.log("\n[LTP] ====== NEW REQUEST ======");
    console.log(`[LTP] 🔍 Symbol: ${upperSymbol}, Type: ${symbolType}`);

    // Safe global cache init
    global.latestLTP = global.latestLTP || {};

    // Check cache - return ONLY if fresh (< 10 seconds old)
    if (!force && global.latestLTP[upperSymbol]) {
      const cached = global.latestLTP[upperSymbol];
      const cacheAge = Date.now() - (cached.timestamp || 0);
      
      // Cache must be:
      // 1. Valid LTP
      // 2. Fresh (< 10 seconds old)
      if (
        cached.ltp !== null &&
        cached.ltp !== undefined &&
        !isNaN(cached.ltp) &&
        cached.ltp > 0 &&
        cacheAge < 10000  // ✅ FIX: Only use cache if < 10 seconds old
      ) {
        console.log(`[LTP] ✅ Fresh cache hit: ${upperSymbol} = ${cached.ltp} (${Math.round(cacheAge/1000)}s old)`);
        return res.json({
          status: true,
          symbol: upperSymbol,
          type: symbolType,
          ...cached,
          source: cacheAge < 3000 ? "WEBSOCKET" : "CACHE",  // Label based on freshness
          timestamp: cached.timestamp || Date.now()
        });
      } else if (cacheAge >= 10000) {
        console.log(`[LTP] ⚠️ Cache stale (${Math.round(cacheAge/1000)}s old), fetching fresh...`);
      } else {
        console.log("[LTP] ⚠️ Cache invalid (null/0), deleting...");
        delete global.latestLTP[upperSymbol];
      }
    }

    // Common index tokens
    const indexTokenMap = {
      NIFTY: { exchange: "NSE", token: "99926000" },
      BANKNIFTY: { exchange: "NSE", token: "99926009" },
      FINNIFTY: { exchange: "NSE", token: "99926037" },
      MIDCPNIFTY: { exchange: "NSE", token: "99926074" }
    };

    let tokenToUse = null;
    let exchangeToUse = "NSE";
    let exactSymbol = upperSymbol;

    // ========================================
    // 1️⃣ INDEX CHECK
    // ========================================
    if (indexTokenMap[upperSymbol]) {
      tokenToUse = indexTokenMap[upperSymbol].token;
      exchangeToUse = indexTokenMap[upperSymbol].exchange;
      console.log(`[LTP] 📊 Index detected: ${upperSymbol}`);
    }

    // ========================================
    // 2️⃣ COMMODITY CHECK (MCX)
    // ========================================
    if (!tokenToUse && symbolType === "COMMODITY") {
      console.log(`[LTP] 🛢️ Commodity detected: ${upperSymbol}`);
      console.log("[LTP] 📥 Loading MCX master...");

      await loadCommodityMaster();

      const commodityInfo = getCommodityToken(upperSymbol);

      if (commodityInfo) {
        tokenToUse = commodityInfo.token;
        exactSymbol = commodityInfo.symbol;
        exchangeToUse = "MCX";

        console.log("[LTP] ✅ MCX resolved:");
        console.log(`     Input: ${upperSymbol}`);
        console.log(`     Exact Symbol: ${exactSymbol}`);
        console.log(`     Token: ${tokenToUse}`);
        console.log(`     Exchange: ${exchangeToUse}`);
      } else {
        console.log(`[LTP] ❌ MCX symbol not found: ${upperSymbol}`);

        return res.json({
          status: false,
          message: `Commodity ${upperSymbol} not found in MCX master`,
          symbol: upperSymbol,
          type: symbolType,
          hint: "Try: /api/ltp/commodities to see available symbols"
        });
      }
    }

    // ========================================
    // 3️⃣ STOCK CHECK (NSE → BSE)
    // ========================================
    if (!tokenToUse && symbolType === "STOCK") {
      console.log(`[LTP] 📈 Stock detected: ${upperSymbol}`);
      await loadStockMaster();

      if (STOCK_TOKEN_MAP.NSE && STOCK_TOKEN_MAP.NSE[upperSymbol]) {
        tokenToUse = STOCK_TOKEN_MAP.NSE[upperSymbol];
        exchangeToUse = "NSE";
        console.log(`[LTP] ✅ NSE stock found: token=${tokenToUse}`);
      } else if (
        STOCK_TOKEN_MAP.BSE &&
        STOCK_TOKEN_MAP.BSE[upperSymbol]
      ) {
        tokenToUse = STOCK_TOKEN_MAP.BSE[upperSymbol];
        exchangeToUse = "BSE";
        console.log(`[LTP] ✅ BSE stock found: token=${tokenToUse}`);
      }
    }

    // ========================================
    // TOKEN MUST EXIST
    // ========================================
    if (!tokenToUse) {
      console.log(`[LTP] ❌ Token not found for: ${upperSymbol}`);
      return res.json({
        status: false,
        message: `Token not found for ${upperSymbol}`,
        symbol: upperSymbol,
        type: symbolType,
        hint: "Check symbol spelling or try /api/ltp/commodities"
      });
    }

    // ========================================
    // FETCH FROM ANGEL API
    // ========================================
    console.log("[LTP] 🌐 Calling Angel API...");
    console.log(`     Exchange: ${exchangeToUse}`);
    console.log(`     Symbol: ${exactSymbol}`);
    console.log(`     Token: ${tokenToUse}`);

  const result = await getFullQuote({
      symbol: exactSymbol,
      exchange: exchangeToUse
    });

    if (result.success && result.data) {
      // Extract OHLC data using improved function
      const ohlcData = extractOHLC(result.data);

      console.log("[LTP] ✅ SUCCESS! Data received:");
      console.log(`     LTP: ${ohlcData.ltp}`);
      console.log(`     Open: ${ohlcData.open}`);
      console.log(`     High: ${ohlcData.high}`);
      console.log(`     Low: ${ohlcData.low}`);
      console.log(`     Close: ${ohlcData.close}`);
      console.log(`     PrevClose: ${ohlcData.prevClose}`);

      const responseData = {
        status: true,
        symbol: upperSymbol,
        type: symbolType,
        exchange: exchangeToUse,
        exactSymbol: exactSymbol,
        ltp: ohlcData.ltp !== null ? Number(ohlcData.ltp) : null,
        open: ohlcData.open !== null ? Number(ohlcData.open) : null,
        high: ohlcData.high !== null ? Number(ohlcData.high) : null,
        low: ohlcData.low !== null ? Number(ohlcData.low) : null,
        close: ohlcData.close !== null ? Number(ohlcData.close) : null,
        prevClose:
          ohlcData.prevClose !== null
            ? Number(ohlcData.prevClose)
            : null,
        volume:
          ohlcData.volume !== null
            ? Number(ohlcData.volume)
            : null,
        source: "ANGEL_API",
        timestamp: Date.now()
      };

      // Cache with all OHLC data
      if (
        ohlcData.ltp !== null &&
        ohlcData.ltp !== undefined &&
        !isNaN(ohlcData.ltp) &&
        ohlcData.ltp > 0
      ) {
       global.latestLTP[upperSymbol] = {
  ltp: Number(ohlcData.ltp),
  open: ohlcData.open !== null ? Number(ohlcData.open) : null,
  high: ohlcData.high !== null ? Number(ohlcData.high) : null,
  low: ohlcData.low !== null ? Number(ohlcData.low) : null,
  close: ohlcData.close !== null ? Number(ohlcData.close) : null,
  prevClose: ohlcData.prevClose !== null ? Number(ohlcData.prevClose) : null,
  volume: ohlcData.volume !== null ? Number(ohlcData.volume) : 0,
  timestamp: Date.now()
};
      }

      return res.json(responseData);
    } else {
      console.log(
        "[LTP] ❌ API call failed:",
        result.error || result.message
      );
    }

    return res.json({
      status: false,
      message: `LTP fetch failed for ${upperSymbol}`,
      symbol: upperSymbol,
      type: symbolType,
      exchange: exchangeToUse,
      error: result.error || result.message || "Unknown error",
      hint: "Check Angel One login and market hours"
    });

  } catch (err) {
    console.error("[LTP] ❌ EXCEPTION:", err.message);
    console.error(err.stack);
    return res.status(500).json({
      status: false,
      error: err.message
    });
  }
});

// ==========================================
// DEBUG ENDPOINT - List MCX Commodities
// GET /api/ltp/commodities
// ==========================================
router.get("/commodities", async (req, res) => {
  try {
    await loadCommodityMaster();

    const allSymbols = Object.keys(COMMODITY_TOKEN_MAP).sort();

    const grouped = {};
    allSymbols.forEach(sym => {
      const base = sym
        .replace("COM", "")
        .replace(/\d+/g, "")
        .toUpperCase();

      if (!grouped[base]) grouped[base] = [];
      grouped[base].push({
        symbol: sym,
        token: COMMODITY_TOKEN_MAP[sym]
      });
    });

    const friendlyMap = {};
    Object.keys(COMMODITY_FRIENDLY_NAMES).forEach(friendly => {
      const exact = COMMODITY_FRIENDLY_NAMES[friendly];
      if (COMMODITY_TOKEN_MAP[exact]) {
        friendlyMap[friendly] = {
          exactSymbol: exact,
          token: COMMODITY_TOKEN_MAP[exact]
        };
      }
    });

    return res.json({
      status: true,
      totalSymbols: allSymbols.length,
      friendlyNames: friendlyMap,
      allSymbols: allSymbols.slice(0, 100),
      grouped: Object.keys(grouped)
        .slice(0, 20)
        .reduce((acc, key) => {
          acc[key] = grouped[key].slice(0, 5);
          return acc;
        }, {}),
      note: "Use friendly names (GOLD, SILVER, CRUDE) or exact symbols"
    });
  } catch (err) {
    return res.json({
      status: false,
      error: err.message
    });
  }
});

module.exports = router;
