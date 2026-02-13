// ==========================================
// ANGEL TOKEN SERVICE — CARRY-2 FIX
// MAHASHAKTI MARKET PRO
// Provides LOGIN BUNDLE + OPTION MASTER
// ==========================================

"use strict";

const https = require("https");

const MASTER_URL =
  "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json";

let optionSymbolMap = {};
let lastLoadTime = 0;

// =============================
// SESSION BUNDLE (ENGINE USES)
// =============================
let SESSION_BUNDLE = {
  feedToken: null,
  clientCode: null
};

// =============================
// SERVER CALLS THIS AFTER LOGIN
// =============================
function setAngelSession(feedToken, clientCode) {
  SESSION_BUNDLE.feedToken = feedToken;
  SESSION_BUNDLE.clientCode = clientCode;

  console.log("🔗 [TOKENS] Angel session linked");
}

// =============================
// ENGINE CALLS THIS
// =============================
function fetchOptionTokens() {
  return SESSION_BUNDLE;
}

// =============================
// OPTION MASTER LOADER
// =============================
async function loadOptionTokens(force = false) {
  const now = Date.now();

  if (
    !force &&
    now - lastLoadTime < 30 * 60 * 1000 &&
    Object.keys(optionSymbolMap).length > 0
  ) {
    return;
  }

  console.log("📥 [TOKENS] Loading NFO option master...");

  return new Promise((resolve, reject) => {
    https.get(MASTER_URL, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try {
          const json = JSON.parse(raw);
          optionSymbolMap = {};
          let added = 0;

          json.forEach((item) => {
            if (item.exch_seg !== "NFO") return;
            if (!["OPTIDX", "OPTSTK"].includes(item.instrumenttype)) return;
            if (!item.symbol || !item.token) return;

            const sym = item.symbol.toUpperCase();

            optionSymbolMap[sym] = {
              token: String(item.token),
              exchangeType: 2,
              symbol: sym
            };

            added++;
          });

          lastLoadTime = now;
          console.log(`✅ [TOKENS] Loaded ${added} option symbols`);
          resolve();
        } catch (e) {
          console.error("❌ [TOKENS] Parse error:", e.message);
          reject();
        }
      });
    }).on("error", reject);
  });
}

// =============================
// LOOKUP
// =============================
function getOptionToken(symbol) {
  if (!symbol) return null;
  return optionSymbolMap[symbol.toUpperCase()] || null;
}

// =============================
module.exports = {
  loadOptionTokens,
  getOptionToken,
  fetchOptionTokens,
  setAngelSession
};
