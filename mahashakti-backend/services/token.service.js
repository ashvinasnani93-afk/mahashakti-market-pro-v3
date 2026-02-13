// ==========================================  
// TOKEN SERVICE — DEBUGGED & IMPROVED (T2.7) - FIXED  
// ANGEL SOURCE OF TRUTH – NFO OPTIONS MASTER  
// MEMORY SAFE + AUTO REFRESH + BETTER ERROR HANDLING  
// ==========================================  
  
const https = require("https");  
  
// ==========================================  
// GLOBAL CACHE (consider moving to class later)  
// ==========================================  
let optionSymbolMap = {};  
let lastLoadCount = 0;  
let lastLoadTime = 0;  
let isLoading = false; // prevent concurrent loads  
  
// ==========================================  
// CONFIG  
// ==========================================  
const MASTER_URL =  
  "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json";  
  
const RELOAD_INTERVAL = 30 * 60 * 1000; // 30 min  
const REQUEST_TIMEOUT = 15000; // 15 seconds  
  
// ==========================================  
// IMPROVED EXPIRY CHECK  
// Handles more Angel symbol formats robustly  
// ==========================================  
function isExpiredOption(symbol) {  
  if (!symbol || typeof symbol !== "string") return true;  
  
  // Common Angel formats: NIFTY03FEB2524500CE, BANKNIFTY2740325400PE, etc.  
  const regex = /(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})(\d{2})?/i;  
  const match = symbol.match(regex);  
  
  if (!match) {  
    console.warn(`Invalid expiry format in symbol: ${symbol}`);  
    return true; // treat unknown as expired  
  }  
  
  const day = parseInt(match[1], 10);  
  const monthStr = match[2].toUpperCase();  
  const yearShort = match[3];  
  // Some symbols have full year or extra digits – take first two as YY  
  const year = 2000 + parseInt(yearShort, 10);  
  
  const MONTH_MAP = {  
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,  
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,  
  };  
  
  const month = MONTH_MAP[monthStr];  
  if (month === undefined) return true;  
  
  try {  
    const expiryDate = new Date(year, month, day);  
    expiryDate.setHours(0, 0, 0, 0);  
  
    const today = new Date();  
    today.setHours(0, 0, 0, 0);  
  
    return expiryDate < today;  
  } catch (err) {  
    console.warn(`Expiry parse error for ${symbol}:`, err.message);  
    return true;  
  }  
}  
  
// ==========================================  
// LOAD MASTER WITH TIMEOUT + RETRY  
// ==========================================  
async function loadOptionSymbolMaster(force = false, retryCount = 0) {  
  const MAX_RETRIES = 2;  
  
  if (isLoading) {  
    console.log("Master load already in progress – waiting...");  
    return new Promise((r) => setTimeout(() => r(), 1500));  
  }  
  
  const now = Date.now();  
  
  if (!force && now - lastLoadTime < RELOAD_INTERVAL && lastLoadCount > 0) {  
    return;  
  }  
  
  isLoading = true;  
  console.log(`[TOKEN] Loading Angel NFO Master (force: ${force}, attempt ${retryCount + 1})...`);  
  
  return new Promise((resolve, reject) => {  
    const req = https.get(MASTER_URL, { timeout: REQUEST_TIMEOUT }, (res) => {  
      if (res.statusCode !== 200) {  
        const err = new Error(`HTTP ${res.statusCode} from Angel master`);  
        console.error("[TOKEN] Load failed:", err.message);  
        res.resume();  
        if (retryCount < MAX_RETRIES) {  
          setTimeout(() => loadOptionSymbolMaster(force, retryCount + 1).then(resolve).catch(reject), 3000);  
        } else {  
          reject(err);  
        }  
        return;  
      }  
  
      let data = "";  
      res.on("data", (chunk) => (data += chunk));  
      res.on("end", () => {  
        try {  
          const json = JSON.parse(data);  
          optionSymbolMap = {};  
          let added = 0;  
          let skippedExpired = 0;  
          let skippedInvalid = 0;  
  
          json.forEach((item) => {  
            if (  
              item.exch_seg === "NFO" &&  
              (item.instrumenttype === "OPTIDX" || item.instrumenttype === "OPTSTK")  
            ) {  
              const symbol = item.symbol?.toUpperCase()?.trim();  
              const token = item.token;  
  
              if (!symbol || !token) {  
                skippedInvalid++;  
                return;  
              }  
  
              if (isExpiredOption(symbol)) {  
                skippedExpired++;  
                return;  
              }  
  
              optionSymbolMap[symbol] = {  
                token,  
                exchangeType: 2, // NFO  
                instrumentType: item.instrumenttype,  
                name: item.name,  
                strike: item.strike,  
                expiry: item.expiry,  
              };  
  
              added++;  
            }  
          });  
  
          console.log(  
            `[TOKEN] OPTION Master loaded: ${added} symbols | expired skipped: ${skippedExpired} | invalid: ${skippedInvalid}`  
          );  
  
          if (added === 0) {  
            console.warn("[TOKEN] WARNING: Zero valid NFO options loaded – check master URL or network");  
          }  
  
          // 🔥 EXPORT TO ENGINE  
          global.OPTION_SYMBOLS = Object.keys(optionSymbolMap);  
          console.log("🧠 OPTION SYMBOLS REGISTERED:", global.OPTION_SYMBOLS.length);  
  
          lastLoadCount = added;  
          lastLoadTime = Date.now();  
          isLoading = false;  
          resolve();  
        } catch (e) {  
          console.error("[TOKEN] JSON parse error:", e.message);  
          isLoading = false;  
          reject(e);  
        }  
      });  
    });  
  
    req.on("timeout", () => {  
      req.destroy();  
      console.error("[TOKEN] Master request timeout");  
      if (retryCount < MAX_RETRIES) {  
        setTimeout(() => loadOptionSymbolMaster(force, retryCount + 1).then(resolve).catch(reject), 3000);  
      } else {  
        reject(new Error("Master load timeout after retries"));  
      }  
    });  
  
    req.on("error", (err) => {  
      console.error("[TOKEN] Network error:", err.message);  
      isLoading = false;  
      reject(err);  
    });  
  });  
}  
  
// ==========================================  
// GET TOKEN (with auto-load)  
// ==========================================  
async function getOptionToken(optionSymbol) {  
  if (!optionSymbol) return null;  
  
  const key = optionSymbol.toUpperCase().trim();  
  
  if (lastLoadCount === 0 || Date.now() - lastLoadTime > RELOAD_INTERVAL) {  
    try {  
      await loadOptionSymbolMaster();  
    } catch (e) {  
      console.error("[TOKEN] Auto-load failed:", e.message);  
      return null;  
    }  
  }  
  
  const entry = optionSymbolMap[key];  
  if (!entry) {  
    console.debug(`[TOKEN] No token found for: ${key}`);  
  }  
  
  return entry || null;  
}  
  
// ==========================================  
// GET SPOT LTP – AVOID SELF-HTTP IF POSSIBLE  
// For now kept, but consider injecting LTP cache later  
// ==========================================  
async function getSpotLTP(index) {  
  return new Promise((resolve, reject) => {  
    // 🔥 FIXED: Use environment variable or fallback  
    const baseUrl = process.env.BASE_URL || "http://localhost:3000";  
    const url = `${baseUrl}/angel/ltp?symbol=${encodeURIComponent(index)}`;  
  
    https.get(url, { timeout: REQUEST_TIMEOUT }, (res) => {  
      let data = "";  
      res.on("data", (chunk) => (data += chunk));  
      res.on("end", () => {  
        try {  
          const json = JSON.parse(data);  
          if (json?.status === true && json.ltp) {  
            resolve(Number(json.ltp));  
          } else {  
            reject(new Error(`Invalid LTP response: ${JSON.stringify(json)}`));  
          }  
        } catch (e) {  
          reject(e);  
        }  
      });  
    }).on("error", (err) => {  
      console.error(`[TOKEN] Spot LTP fetch failed for ${index}:`, err.message);  
      reject(err);  
    });  
  });  
}  
  
// ==========================================  
// INIT – Call this once on server startup!  
// ==========================================  
async function initializeTokenService() {  
  try {  
    await loadOptionSymbolMaster(true); // force first load  
    console.log("[TOKEN] Initialization complete");  
  } catch (err) {  
    console.error("[TOKEN] Initialization failed – option chain will be unavailable:", err);  
  }  
}  
  
// ==========================================  
// GET ALL OPTION SYMBOLS  
// ==========================================  
function getAllOptionMaster() {  
  return Object.values(optionSymbolMap);  
}  
  
// ==========================================  
// EXPORTS  
// ==========================================  
module.exports = {  
  initializeTokenService,       // ← Call in server.js on boot  
  loadOptionSymbolMaster,  
  getOptionToken,  
  getSpotLTP,  
  getAllOptionMaster,  // 🔥 ADDED: For angelTokens.js  
  // Optional: expose for debugging  
  getLoadedCount: () => lastLoadCount,  
  isCacheFresh: () => Date.now() - lastLoadTime < RELOAD_INTERVAL,  
};
