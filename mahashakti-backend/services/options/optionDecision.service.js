// ==================================================
// OPTION DECISION SERVICE (FINAL – STRONG SIGNAL SAFE)
// MAHASHAKTI MARKET PRO
// BUY / SELL / STRONG BUY / STRONG SELL / WAIT
// UI SYMBOL ONLY (API OUTPUT LAYER)
// ==================================================

const { generateOptionsSignal } = require("./optionsSignal.engine");

/**
 * decideOptionTrade
 * @param {object} data
 * @returns {object}
 *
 * FINAL OUTPUT LAYER:
 * - 🟢🔥 STRONG BUY
 * - 🔴🔥 STRONG SELL
 * - 🟢 BUY
 * - 🔴 SELL
 * - 🟡 WAIT
 */
function decideOptionTrade(data = {}) {
  // ------------------------
  // HARD SAFETY
  // ------------------------
  if (!data || typeof data !== "object") {
    return {
      status: "WAIT",
      signal: "🟡",
    };
  }

  const result = generateOptionsSignal(data);

  if (!result || typeof result !== "object") {
    return {
      status: "WAIT",
      signal: "🟡",
    };
  }

  // ------------------------
  // STRONG SIGNALS (PRIORITY)
  // ------------------------
  if (result.uiIcon === "🟢🔥") {
    return {
      status: "OK",
      signal: "🟢🔥",
      note: result.note || "Strong bullish signal",
    };
  }

  if (result.uiIcon === "🔴🔥") {
    return {
      status: "OK",
      signal: "🔴🔥",
      note: result.note || "Strong bearish signal",
    };
  }

  // ------------------------
  // STANDARD SIGNALS
  // ------------------------
  if (result.uiIcon === "🟢") {
    return {
      status: "OK",
      signal: "🟢",
    };
  }

  if (result.uiIcon === "🔴") {
    return {
      status: "OK",
      signal: "🔴",
    };
  }

  // ------------------------
  // FALLBACK
  // ------------------------
  return {
    status: "WAIT",
    signal: "🟡",
  };
}

// ==================================================
// EXPORT
// ==================================================
module.exports = {
  decideOptionTrade,
};
