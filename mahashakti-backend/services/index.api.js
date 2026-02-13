// ==========================================
// INDEX API (FOUNDATION)
// Frontend Entry for Index / Instrument config
// NO SIGNAL | NO INDICATORS | RULE-LOCKED
// ==========================================

const { getIndexConfig } = require("./indexMaster.service");

// ==========================================
// POST /index/config
// ==========================================
function getIndexConfigAPI(req, res) {
  try {
    const body = req.body;

    // -----------------------------
    // BASIC INPUT CHECK
    // -----------------------------
    if (!body || typeof body !== "object") {
      return res.json({
        status: false,
        message: "Invalid index input",
      });
    }

    if (!body.symbol) {
      return res.json({
        status: false,
        message: "symbol required",
      });
    }

    // -----------------------------
    // INDEX MASTER LOOKUP
    // -----------------------------
    const config = getIndexConfig(body.symbol);

    if (!config) {
      return res.json({
        status: true,
        allowed: false,
        reason: "Symbol not supported in app",
      });
    }

    // -----------------------------
    // FINAL RESPONSE (CONFIG ONLY)
    // -----------------------------
    return res.json({
      status: true,
      allowed: true,
      symbol: body.symbol.toUpperCase(),
      instrumentType: config.instrumentType,
      exchange: config.exchange,
      segments: config.segments,
      allowedTradeTypes: config.allowedTradeTypes,
      optionChain: config.optionChain === true,
      note: config.note || "Index configuration loaded",
    });
  } catch (e) {
    console.error("❌ Index API Error:", e.message);

    return res.json({
      status: false,
      message: "Index processing error",
    });
  }
}

// ==========================================
// EXPORT
// ==========================================
module.exports = {
  getIndexConfigAPI,
};
