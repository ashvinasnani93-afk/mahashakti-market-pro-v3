// ==========================================
// MASTER TOKEN SERVICE
// Loads Angel One Scrip Master for all symbols
// NFO options, F&O stocks, Cash stocks, Commodities
// ==========================================

const https = require("https");

// ==========================================
// GLOBAL CACHE
// ==========================================
let symbolMaster = {
  nfoOptions: {},      // Option symbols
  fnoStocks: {},       // F&O equity
  cashStocks: {},      // Cash segment
  indices: {},         // Index tokens
  commodities: {}      // MCX commodities
};

let lastLoadTime = 0;
let isLoading = false;
let loadedCount = 0;

// ==========================================
// CONFIG
// ==========================================
const MASTER_URL = "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json";
const RELOAD_INTERVAL = 30 * 60 * 1000; // 30 minutes
const REQUEST_TIMEOUT = 30000;

// ==========================================
// F&O STOCK LIST (All F&O approved stocks)
// ==========================================
const FNO_STOCKS = [
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "HINDUNILVR",
  "SBIN", "BHARTIARTL", "KOTAKBANK", "ITC", "LT", "AXISBANK",
  "ASIANPAINT", "MARUTI", "BAJFINANCE", "HCLTECH", "SUNPHARMA",
  "TITAN", "WIPRO", "ULTRACEMCO", "NESTLEIND", "TATAMOTORS",
  "POWERGRID", "NTPC", "ONGC", "M&M", "TATASTEEL", "JSWSTEEL",
  "ADANIPORTS", "TECHM", "DRREDDY", "INDUSINDBK", "BAJAJFINSV",
  "COALINDIA", "GRASIM", "DIVISLAB", "BRITANNIA", "CIPLA",
  "EICHERMOT", "APOLLOHOSP", "HEROMOTOCO", "BPCL", "HINDALCO",
  "SBILIFE", "HDFCLIFE", "TATACONSUM", "SHREECEM", "UPL"
];

// ==========================================
// CHECK IF OPTION EXPIRED
// ==========================================
function isExpiredOption(symbol) {
  if (!symbol || typeof symbol !== "string") return true;

  const regex = /(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})/i;
  const match = symbol.match(regex);

  if (!match) return true;

  const day = parseInt(match[1], 10);
  const monthStr = match[2].toUpperCase();
  const yearShort = match[3];
  const year = 2000 + parseInt(yearShort, 10);

  const MONTH_MAP = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
  };

  const month = MONTH_MAP[monthStr];
  if (month === undefined) return true;

  try {
    const expiryDate = new Date(year, month, day);
    expiryDate.setHours(23, 59, 59);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return expiryDate < today;
  } catch (err) {
    return true;
  }
}

// ==========================================
// LOAD MASTER FROM ANGEL
// ==========================================
async function loadSymbolMaster(force = false) {
  if (isLoading) {
    console.log("[MASTER] Already loading...");
    return new Promise(r => setTimeout(r, 2000));
  }

  const now = Date.now();
  if (!force && now - lastLoadTime < RELOAD_INTERVAL && loadedCount > 0) {
    return;
  }

  isLoading = true;
  console.log("[MASTER] Loading Angel Scrip Master...");

  return new Promise((resolve, reject) => {
    const req = https.get(MASTER_URL, { timeout: REQUEST_TIMEOUT }, (res) => {
      if (res.statusCode !== 200) {
        isLoading = false;
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          
          // Reset caches
          symbolMaster = {
            nfoOptions: {},
            fnoStocks: {},
            cashStocks: {},
            indices: {},
            commodities: {}
          };

          let nfoCount = 0;
          let equityCount = 0;
          let mcxCount = 0;

          json.forEach(item => {
            const symbol = item.symbol?.toUpperCase()?.trim();
            const token = item.token;
            const exchange = item.exch_seg;

            if (!symbol || !token) return;

            // NFO OPTIONS (Index + Stock)
            if (exchange === "NFO" && (item.instrumenttype === "OPTIDX" || item.instrumenttype === "OPTSTK")) {
              if (!isExpiredOption(symbol)) {
                symbolMaster.nfoOptions[symbol] = {
                  token,
                  exchangeType: 2,
                  instrumentType: item.instrumenttype,
                  name: item.name,
                  strike: item.strike,
                  expiry: item.expiry,
                  lotSize: item.lotsize
                };
                nfoCount++;
              }
            }

            // NFO FUTURES
            if (exchange === "NFO" && (item.instrumenttype === "FUTIDX" || item.instrumenttype === "FUTSTK")) {
              if (!isExpiredOption(symbol)) {
                symbolMaster.fnoStocks[symbol] = {
                  token,
                  exchangeType: 2,
                  instrumentType: item.instrumenttype,
                  name: item.name,
                  expiry: item.expiry,
                  lotSize: item.lotsize
                };
              }
            }

            // NSE CASH (check multiple segment names)
            if ((exchange === "NSE" || exchange === "nse") && 
                (item.instrumenttype === "EQ" || item.instrumenttype === "" || !item.instrumenttype)) {
              // Only add if it has a valid token and looks like equity
              if (item.symbol && !item.symbol.includes("NIFTY") && !item.symbol.includes("INDEX")) {
                symbolMaster.cashStocks[symbol] = {
                  token,
                  exchangeType: 1,
                  name: item.name,
                  isFnO: FNO_STOCKS.includes(symbol.replace("-EQ", "").replace("-BE", ""))
                };
                equityCount++;
              }
            }

            // MCX COMMODITIES
            if (exchange === "MCX") {
              symbolMaster.commodities[symbol] = {
                token,
                exchangeType: 5,
                name: item.name,
                lotSize: item.lotsize,
                expiry: item.expiry
              };
              mcxCount++;
            }

            // INDICES
            if (exchange === "NSE" && item.instrumenttype === "INDEX") {
              symbolMaster.indices[symbol] = {
                token,
                exchangeType: 1,
                name: item.name
              };
            }
          });

          loadedCount = nfoCount + equityCount + mcxCount;
          lastLoadTime = Date.now();
          isLoading = false;

          console.log(`[MASTER] Loaded: NFO=${nfoCount}, Equity=${equityCount}, MCX=${mcxCount}`);

          // Export to global
          global.SYMBOL_MASTER = symbolMaster;
          global.FNO_STOCKS = FNO_STOCKS;

          resolve();
        } catch (e) {
          isLoading = false;
          reject(e);
        }
      });
    });

    req.on("timeout", () => {
      req.destroy();
      isLoading = false;
      reject(new Error("Timeout"));
    });

    req.on("error", err => {
      isLoading = false;
      reject(err);
    });
  });
}

// ==========================================
// GETTERS
// ==========================================
function getOptionToken(symbol) {
  return symbolMaster.nfoOptions[symbol?.toUpperCase()] || null;
}

function getStockToken(symbol) {
  const key = symbol?.toUpperCase();
  return symbolMaster.cashStocks[key] || symbolMaster.cashStocks[`${key}-EQ`] || null;
}

function getCommodityToken(symbol) {
  return symbolMaster.commodities[symbol?.toUpperCase()] || null;
}

function getFnOStocks() {
  return FNO_STOCKS;
}

function getAllOptions() {
  return Object.keys(symbolMaster.nfoOptions);
}

function getAllCashStocks() {
  return Object.keys(symbolMaster.cashStocks);
}

function getMasterStats() {
  return {
    nfoOptions: Object.keys(symbolMaster.nfoOptions).length,
    fnoStocks: Object.keys(symbolMaster.fnoStocks).length,
    cashStocks: Object.keys(symbolMaster.cashStocks).length,
    commodities: Object.keys(symbolMaster.commodities).length,
    indices: Object.keys(symbolMaster.indices).length,
    lastLoad: new Date(lastLoadTime).toISOString(),
    isStale: Date.now() - lastLoadTime > RELOAD_INTERVAL
  };
}

// ==========================================
// INITIALIZE
// ==========================================
async function initializeTokenService() {
  try {
    await loadSymbolMaster(true);
    console.log("[MASTER] Initialization complete");
  } catch (err) {
    console.error("[MASTER] Initialization failed:", err.message);
  }
}

module.exports = {
  initializeTokenService,
  loadSymbolMaster,
  getOptionToken,
  getStockToken,
  getCommodityToken,
  getFnOStocks,
  getAllOptions,
  getAllCashStocks,
  getMasterStats,
  FNO_STOCKS
};
