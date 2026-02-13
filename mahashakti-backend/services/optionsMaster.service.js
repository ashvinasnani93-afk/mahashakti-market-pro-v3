// ==========================================
// OPTIONS MASTER SERVICE - FIXED & IMPROVED
// Central controller for Options logic
// NIFTY / BANKNIFTY / STOCK OPTIONS / COMMODITY OPTIONS
// ==========================================

const https = require("https");

// ==========================================
// GLOBAL CACHE
// ==========================================
let optionMasterCache = [];
let lastLoadTime = 0;
const RELOAD_INTERVAL = 30 * 60 * 1000; // 30 minutes

// ==========================================
// LOAD OPTION MASTER FROM ANGEL
// FIXED: Better filtering for commodities
// ==========================================
async function loadOptionMaster() {
  const now = Date.now();

  // Return cache if fresh
  if (optionMasterCache.length > 0 && (now - lastLoadTime) < RELOAD_INTERVAL) {
    return optionMasterCache;
  }

  return new Promise((resolve, reject) => {
    const url =
      "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json";

    console.log("📥 Loading Option Master from Angel...");

    https
      .get(url, { timeout: 15000 }, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            const options = [];

            json.forEach((item) => {
              // FIXED: Support NFO (equity options) and MCX (commodity options)
              const isNFO =
                item.exch_seg === "NFO" &&
                (item.instrumenttype === "OPTIDX" ||
                  item.instrumenttype === "OPTSTK");

              const isMCXOption =
                item.exch_seg === "MCX" &&
                item.instrumenttype &&
                item.instrumenttype.includes("OPT");

              if ((isNFO || isMCXOption) && item.symbol && item.token) {
                // Parse option details from symbol
                const symbol = item.symbol.toUpperCase();
                let optionType = null;

                if (symbol.endsWith("CE")) {
                  optionType = "CE";
                } else if (symbol.endsWith("PE")) {
                  optionType = "PE";
                }

                if (optionType) {
                  options.push({
                    symbol: symbol,
                    token: item.token,
                    name: item.name,
                    expiry: item.expiry,
                    strike: item.strike,
                    lotsize: item.lotsize,
                    type: optionType,
                    instrumentType: item.instrumenttype,
                    exchange: item.exch_seg
                  });
                }
              }
            });

            optionMasterCache = options;
            lastLoadTime = Date.now();

            // Count by exchange
            const nfoCount = options.filter(
              (o) => o.exchange === "NFO"
            ).length;
            const mcxCount = options.filter(
              (o) => o.exchange === "MCX"
            ).length;

            console.log(`✅ Option Master Loaded: ${options.length} symbols`);
            console.log(`   NFO (Equity/Index): ${nfoCount}`);
            console.log(`   MCX (Commodity): ${mcxCount}`);

            resolve(options);
          } catch (err) {
            reject(err);
          }
        });
      })
      .on("error", reject);
  });
}

// ==========================================
// GET ALL OPTION SYMBOLS (ASYNC)
// ==========================================
async function getAllOptionSymbols() {
  try {
    return await loadOptionMaster();
  } catch (err) {
    console.error("❌ Failed to load option symbols:", err.message);
    return [];
  }
}

// ==========================================
// GET OPTIONS BY UNDERLYING
// FIXED: Better filtering
// ==========================================
function getOptionsByUnderlying(underlying) {
  return optionMasterCache.filter(
    (opt) =>
      opt.name &&
      opt.name.toUpperCase() === underlying.toUpperCase()
  );
}

// ==========================================
// GET OPTIONS BY EXCHANGE
// NEW: Filter by exchange type
// ==========================================
function getOptionsByExchange(exchange) {
  return optionMasterCache.filter(
    (opt) =>
      opt.exchange &&
      opt.exchange.toUpperCase() === exchange.toUpperCase()
  );
}

// ==========================================
// GET COMMODITY OPTIONS
// NEW: Specific function for commodity options
// ==========================================
function getCommodityOptions(commodity) {
  return optionMasterCache.filter(
    (opt) =>
      opt.exchange === "MCX" &&
      opt.name &&
      opt.name.toUpperCase().includes(commodity.toUpperCase())
  );
}

// ==========================================
// GET OPTIONS CONTEXT (EXISTING FUNCTION)
// ==========================================
function getOptionsContext(data = {}) {
  const { symbol, spotPrice, expiry, tradeType } = data;

  if (!symbol || !spotPrice || !expiry || !tradeType) {
    return {
      status: "WAIT",
      reason: "Insufficient options input data"
    };
  }

  const expiryType =
    expiry === "WEEKLY"
      ? "WEEKLY_EXPIRY"
      : expiry === "MONTHLY"
      ? "MONTHLY_EXPIRY"
      : "UNKNOWN_EXPIRY";

  const tradeContext =
    tradeType === "INTRADAY"
      ? "INTRADAY_OPTIONS"
      : "POSITIONAL_OPTIONS";

  return {
    status: "READY",
    symbol,
    spotPrice,
    expiryType,
    tradeContext,
    note: "Options master + safety context ready"
  };
}

// ==========================================
// GET AVAILABLE UNDERLYINGS
// NEW: Get list of all symbols that have options
// ==========================================
function getAvailableUnderlyings() {
  const underlyingSet = new Set();

  optionMasterCache.forEach((opt) => {
    if (opt.name) {
      underlyingSet.add(opt.name.toUpperCase());
    }
  });

  return Array.from(underlyingSet).sort();
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  getAllOptionSymbols,
  getOptionsByUnderlying,
  getOptionsByExchange,
  getCommodityOptions,
  getOptionsContext,
  loadOptionMaster,
  getAvailableUnderlyings
};
