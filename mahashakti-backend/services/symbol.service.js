// ==========================================
// SYMBOL MASTER SERVICE — ENTERPRISE FIX
// MAHASHAKTI MARKET PRO
// SINGLE SOURCE OF TRUTH (STOCKS + OPTIONS + COMMODITIES)
// ------------------------------------------
// Fixes:
// 1) REMOVES "OPTION-ONLY PRIORITY BUG"
// 2) SUPPORTS ALL SEGMENTS (NSE/BSE/FO/MCX/CDE)
// 3) RETURNS COMBINED TOKEN SET TO ENGINE/WS
// 4) DEDUP + MEMORY-SAFE MAP
// ==========================================

"use strict";

// Internal stores
// Stock/FO/Commodity tokens (array of { token, exchangeType })
let stockTokenStore = [];

// Option master tokens (map or array accepted)
let optionTokenStore = [];

// Combined cache (for fast getAllSymbols)
let combinedCache = [];
let dirty = true;

// ==========================================
// HELPERS
// ==========================================
function normalizeTokenEntry(entry) {
  if (!entry) return null;

  // If already in token format
  if (
    typeof entry === "object" &&
    entry.token &&
    (entry.exchangeType || entry.exchangeType === 0)
  ) {
    return {
      token: String(entry.token),
      exchangeType: Number(entry.exchangeType)
    };
  }

  // If string token only (fallback → NSE CM)
  if (typeof entry === "string" || typeof entry === "number") {
    return {
      token: String(entry),
      exchangeType: 1
    };
  }

  return null;
}

function dedup(list) {
  const seen = new Set();
  const out = [];

  for (const item of list) {
    const key = `${item.exchangeType}:${item.token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function rebuildCombined() {
  const merged = [];

  for (const s of stockTokenStore) {
    const n = normalizeTokenEntry(s);
    if (n) merged.push(n);
  }

  for (const o of optionTokenStore) {
    const n = normalizeTokenEntry(o);
    if (n) merged.push(n);
  }

  combinedCache = dedup(merged);
  dirty = false;

  console.log("📊 SYMBOL SERVICE SUMMARY");
  console.log("  Stocks/FO/Commodities:", stockTokenStore.length);
  console.log("  Options:", optionTokenStore.length);
  console.log("  TOTAL TOKENS (DEDUP):", combinedCache.length);
}

// ==========================================
// SET SYMBOLS (SERVER USE)
// Accepts:
// 1) Array of symbol strings
// 2) Array of { token, exchangeType }
// ==========================================
function setAllSymbols(symbols) {
  try {
    if (!Array.isArray(symbols)) {
      console.log("⚠️ SYMBOL SERVICE: setAllSymbols invalid input");
      return;
    }

    const normalized = [];

    for (const s of symbols) {
      const n = normalizeTokenEntry(s);
      if (n) normalized.push(n);
    }

    stockTokenStore = normalized;
    dirty = true;

    console.log(
      "🧠 SYMBOL SERVICE: Stock/FO/Commodity tokens registered:",
      stockTokenStore.length
    );
  } catch (e) {
    console.error("❌ SYMBOL SERVICE: setAllSymbols failed:", e.message);
  }
}

// ==========================================
// SET OPTION SYMBOL MASTER
// Accepts:
// 1) Map: { key: { token, exchangeType } }
// 2) Array: [ { token, exchangeType }, ... ]
// ==========================================
function setOptionSymbolMaster(master) {
  try {
    const out = [];

    if (Array.isArray(master)) {
      for (const m of master) {
        const n = normalizeTokenEntry(m);
        if (n) out.push(n);
      }
    } else if (master && typeof master === "object") {
      for (const key of Object.keys(master)) {
        const n = normalizeTokenEntry(master[key]);
        if (n) out.push(n);
      }
    } else {
      console.log("⚠️ SYMBOL SERVICE: Option master invalid");
      return;
    }

    optionTokenStore = out;
    dirty = true;

    console.log(
      "📦 SYMBOL SERVICE: Option tokens registered:",
      optionTokenStore.length
    );
  } catch (e) {
    console.error(
      "❌ SYMBOL SERVICE: setOptionSymbolMaster failed:",
      e.message
    );
  }
}

// ==========================================
// GET ALL TOKENS (ENGINE / WS POOL USE)
// RETURNS: [ { token, exchangeType }, ... ]
// ==========================================
function getAllSymbols() {
  try {
    if (dirty) rebuildCombined();

    if (!combinedCache.length) {
      console.log("⚠️ SYMBOL SERVICE: No tokens ready yet");
      return [];
    }

    console.log(
      "📤 SYMBOL SERVICE: Returning TOTAL TOKENS:",
      combinedCache.length
    );

    return combinedCache;
  } catch (e) {
    console.error("❌ SYMBOL SERVICE: getAllSymbols failed:", e.message);
    return [];
  }
}

// ==========================================
// FORMAT OPTION SYMBOL (ANGEL FORMAT)
// ==========================================
function formatOptionSymbol({
  index,
  stock,
  expiryDate,
  strike,
  type
}) {
  try {
    const underlying = index || stock;
    if (!underlying || !expiryDate || !strike || !type) {
      return null;
    }

    const date = new Date(expiryDate);
    const day = String(date.getDate()).padStart(2, "0");
    const monthNames = [
      "JAN",
      "FEB",
      "MAR",
      "APR",
      "MAY",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OCT",
      "NOV",
      "DEC"
    ];
    const month = monthNames[date.getMonth()];
    const year = String(date.getFullYear()).slice(-2);

    // Example: NIFTY03FEB2625200CE
    return `${underlying.toUpperCase()}${day}${month}${year}${strike}${type.toUpperCase()}`;
  } catch (err) {
    console.error("❌ formatOptionSymbol error:", err.message);
    return null;
  }
}

// ==========================================
// EXPIRY HELPERS
// ==========================================
function isMonthlyExpiry(date) {
  try {
    if (!(date instanceof Date)) date = new Date(date);

    // Last Thursday heuristic (>= 20th)
    return date.getDate() >= 20;
  } catch (err) {
    console.error("❌ isMonthlyExpiry error:", err.message);
    return false;
  }
}

function getExpiryType(expiryDate) {
  return isMonthlyExpiry(expiryDate) ? "MONTHLY" : "WEEKLY";
}

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
  setAllSymbols,
  setOptionSymbolMaster,
  getAllSymbols,
  formatOptionSymbol,
  isMonthlyExpiry,
  getExpiryType
};
