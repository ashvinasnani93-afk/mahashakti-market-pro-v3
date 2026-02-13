// ==========================================
// OPTION CHAIN SERVICE - FULL FIX
// FIXED: Stock LTP (-EQ suffix)
// FIXED: Commodity LTP (MCX exchange)
// ==========================================

const {
  subscribeToToken
} = require("./services/angel/angelWebSocket.service");
const { getAllOptionSymbols } = require("./services/optionsMaster.service");
const { getLtpData, getCommodityToken, loadCommodityMaster } = require("./services/angel/angelApi.service");

/**
 * Build Option Chain from Angel One Master
 * Supports: NIFTY, BANKNIFTY, FINNIFTY, Stocks, Commodities
 */
async function buildOptionChainFromAngel(symbol, expiryDate = null) {
  try {
    console.log(`📊 Building chain for ${symbol}`);

    // Safe global cache
    global.latestLTP = global.latestLTP || {};

    // Get all option symbols from Angel master
    const allOptions = await getAllOptionSymbols();

    if (!allOptions || allOptions.length === 0) {
      return {
        status: false,
        message: "Option master not loaded"
      };
    }

    // Filter options for this symbol
    const symbolOptions = allOptions.filter(opt =>
      opt.name && opt.name.toUpperCase() === symbol.toUpperCase()
    );

    if (symbolOptions.length === 0) {
      return {
        status: false,
        message: `No options found for ${symbol}. Supported: NIFTY, BANKNIFTY, FINNIFTY, Stocks, Commodities`
      };
    }

    // Get available expiries
    const expirySet = new Set();
    symbolOptions.forEach(opt => {
      if (opt.expiry) {
        const d = new Date(opt.expiry);
        if (!isNaN(d.getTime())) {
          expirySet.add(d.toISOString().slice(0, 10));
        }
      }
    });

    const availableExpiries = Array.from(expirySet).sort();

    if (availableExpiries.length === 0) {
      return {
        status: false,
        message: "No valid expiries found"
      };
    }

    // Select expiry
    const selectedExpiry = expiryDate || availableExpiries[0];
    const expiryDateObj = new Date(selectedExpiry);

    // Filter by expiry
    const expiryOptions = symbolOptions.filter(opt => {
      if (!opt.expiry) return false;
      const optExpiry = new Date(opt.expiry);
      return isSameDate(optExpiry, expiryDateObj);
    });

    if (expiryOptions.length === 0) {
      return {
        status: false,
        message: `No options for expiry ${selectedExpiry}`
      };
    }

    // Group by strike
    const strikeMap = {};
    expiryOptions.forEach(opt => {
      const strike = Number(opt.strike);
      if (!strike) return;

      if (!strikeMap[strike]) {
        strikeMap[strike] = { strike, CE: null, PE: null };
      }

      if (opt.type === "CE") {
        strikeMap[strike].CE = {
          token: opt.token,
          symbol: opt.symbol,
          strike: strike,
          ltp: null
        };
      } else if (opt.type === "PE") {
        strikeMap[strike].PE = {
          token: opt.token,
          symbol: opt.symbol,
          strike: strike,
          ltp: null
        };
      }
    });

    // Get strikes array
    const strikes = Object.keys(strikeMap)
      .map(Number)
      .sort((a, b) => a - b);

    // ==========================================
    // FIXED: Get spot price with proper type detection
    // ==========================================
    const symbolType = determineSymbolType(symbol);
    let spotPrice = null;

    // Check cache first
    if (global.latestLTP[symbol]) {
      spotPrice = global.latestLTP[symbol].ltp;
      console.log(`📊 [SPOT] From cache: ${symbol} = ${spotPrice}`);
    } else {
      spotPrice = await getLtpFromSymbol(symbol, symbolType);
      console.log(`📊 [SPOT] From API: ${symbol} = ${spotPrice}`);
    }

    // Calculate ATM
    let atmStrike = null;
    if (spotPrice && strikes.length > 0) {
      atmStrike = strikes.reduce((prev, curr) =>
        Math.abs(curr - spotPrice) < Math.abs(prev - spotPrice)
          ? curr
          : prev
      );
    }

    // ==========================================
    // REAL-TIME LTP SYNC (Tick Based)
    // ==========================================
    if (!global.subscribedTokens) {
      global.subscribedTokens = new Set();
    }

    // Determine exchange mode for subscription
    const subscribeMode = symbolType === "COMMODITY" ? 5 : 2; // 5 = MCX, 2 = NFO

    Object.keys(strikeMap).forEach(strike => {
      const row = strikeMap[strike];

      ["CE", "PE"].forEach(type => {
        if (!row[type] || !row[type].token) return;

        const token = row[type].token;

        // Subscribe only once per token
        if (!global.subscribedTokens.has(token)) {
          subscribeToToken(token, subscribeMode);
          global.subscribedTokens.add(token);
        }

        // Always read latest tick price
        const cached = global.latestLTP[token];
        if (cached && cached.ltp !== undefined) {
          row[type].ltp = cached.ltp;
        }
      });
    });

    return {
      status: true,
      type: symbolType,
      expiry: selectedExpiry,
      availableExpiries,
      spot: spotPrice,
      atmStrike,
      totalStrikes: strikes.length,
      chain: strikeMap
    };

  } catch (err) {
    console.error("❌ buildOptionChainFromAngel error:", err.message);
    return {
      status: false,
      message: "Option chain build failed",
      error: err.message
    };
  }
}

/**
 * Determine symbol type
 */
function determineSymbolType(symbol) {
  const upperSymbol = symbol.toUpperCase();

  // Index symbols
  const indices = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"];
  if (indices.includes(upperSymbol)) {
    return "INDEX";
  }

  // Commodity symbols (MCX)
  const commodities = [
    "GOLD", "GOLDM", "GOLDPETAL", "GOLDGUINEA",
    "SILVER", "SILVERM", "SILVERMICRO", "SILVERMIC",
    "CRUDE", "CRUDEOIL", "CRUDEOILM",
    "NATURALGAS", "NATGAS", "NATURALG",
    "COPPER", "ZINC", "LEAD", "NICKEL", "ALUMINIUM",
    "COTTON", "MENTHAOIL"
  ];

  if (commodities.includes(upperSymbol) || upperSymbol.includes("MCX")) {
    return "COMMODITY";
  }

  return "STOCK";
}

/**
 * Check if two dates are same
 */
function isSameDate(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * Get LTP for symbol from Angel API
 * FIXED: Handles INDEX, STOCK (-EQ), and COMMODITY (MCX)
 */
async function getLtpFromSymbol(symbol, symbolType = null) {
  try {
    const upperSymbol = symbol.toUpperCase();
    const type = symbolType || determineSymbolType(upperSymbol);

    console.log(`📊 [LTP] Fetching for: ${upperSymbol} (type: ${type})`);

    // ==========================================
    // INDEX TOKENS (Hardcoded - Always work)
    // ==========================================
    if (type === "INDEX") {
      const indexMap = {
        NIFTY: { exchange: "NSE", token: "99926000" },
        BANKNIFTY: { exchange: "NSE", token: "99926009" },
        FINNIFTY: { exchange: "NSE", token: "99926037" },
        MIDCPNIFTY: { exchange: "NSE", token: "99926074" }
      };

      if (indexMap[upperSymbol]) {
        console.log(`📊 [LTP] Index detected: ${upperSymbol}`);
        const result = await getLtpData(
          indexMap[upperSymbol].exchange,
          upperSymbol,
          indexMap[upperSymbol].token
        );

        if (result.success && result.data) {
          const ltp = result.data.ltp || result.data.close;
          console.log(`📊 [LTP] Index ${upperSymbol} = ${ltp}`);
          return ltp;
        }
      }
    }

    // ==========================================
    // COMMODITY LTP FETCH (MCX)
    // FIXED: Now properly loads commodity master
    // ==========================================
    if (type === "COMMODITY") {
      console.log(`📊 [LTP] Commodity detected: ${upperSymbol}`);
      
      // Ensure commodity master is loaded
      await loadCommodityMaster();
      
      // Get resolved commodity symbol and token
      const commodityInfo = getCommodityToken(upperSymbol);
      
      if (commodityInfo && commodityInfo.token) {
        console.log(`📊 [LTP] MCX resolved: ${upperSymbol} → ${commodityInfo.symbol} (token: ${commodityInfo.token})`);
        
        const mcxResult = await getLtpData("MCX", commodityInfo.symbol, commodityInfo.token);
        
        if (mcxResult && mcxResult.success && mcxResult.data) {
          const ltp = mcxResult.data.ltp || mcxResult.data.close;
          console.log(`📊 [LTP] MCX ${upperSymbol} = ${ltp}`);
          return ltp;
        }
      } else {
        console.log(`📊 [LTP] ⚠️ Commodity token not found for: ${upperSymbol}`);
      }
      
      // Fallback: Try direct MCX call
      const directResult = await getLtpData("MCX", upperSymbol);
      if (directResult && directResult.success && directResult.data) {
        const ltp = directResult.data.ltp || directResult.data.close;
        console.log(`📊 [LTP] MCX direct ${upperSymbol} = ${ltp}`);
        return ltp;
      }
    }

    // ==========================================
    // STOCK LTP FETCH (NSE with -EQ fallback)
    // ==========================================
    if (type === "STOCK") {
      console.log(`📊 [LTP] Stock detected: ${upperSymbol}`);
      
      // getLtpData now handles -EQ suffix internally
      const ltpResult = await getLtpData("NSE", upperSymbol);

      if (ltpResult && ltpResult.success && ltpResult.data) {
        const ltp = ltpResult.data.ltp || ltpResult.data.close;
        console.log(`📊 [LTP] Stock ${upperSymbol} = ${ltp}`);
        return ltp;
      }
    }

    // ==========================================
    // CACHE FALLBACK
    // ==========================================
    if (global.latestLTP[upperSymbol]) {
      console.log(`📊 [LTP] From cache: ${upperSymbol}`);
      return global.latestLTP[upperSymbol].ltp;
    }

    console.log(`📊 [LTP] ❌ Failed to get LTP for: ${upperSymbol}`);
    return null;

  } catch (err) {
    console.error("❌ getLtpFromSymbol error:", err.message);
    return null;
  }
}

module.exports = {
  buildOptionChainFromAngel
};
