// ==================================================
// INDEX & STOCK MASTER (FINAL – SIGNAL SAFE)
// MAHASHAKTI MARKET PRO
// ==================================================

// ------------------------------------------
// INDEX CONFIG MAP (CORE FOR SIGNAL ENGINE)
// ------------------------------------------
const INDEX_CONFIG_MAP = {
  NIFTY: {
    exchange: "NSE",
    instrumentType: "INDEX",
    name: "NIFTY 50",
  },
  BANKNIFTY: {
    exchange: "NSE",
    instrumentType: "INDEX",
    name: "BANK NIFTY",
  },
  FINNIFTY: {
    exchange: "NSE",
    instrumentType: "INDEX",
    name: "FIN NIFTY",
  },
  MIDCPNIFTY: {
    exchange: "NSE",
    instrumentType: "INDEX",
    name: "MIDCAP NIFTY",
  },
};

// ------------------------------------------
// 🔑 CRITICAL FUNCTION (MISSING EARLIER)
// ------------------------------------------
function getIndexConfig(symbol) {
  if (!symbol || typeof symbol !== "string") {
    return null;
  }

  const key = symbol.toUpperCase().replace(/\s+/g, "");
  return INDEX_CONFIG_MAP[key] || null;
}

// ------------------------------------------
// STOCK SCANNER (UNCHANGED – SAFE)
// ------------------------------------------
function identifyTradeableStocks(liveMarketData = []) {
  if (!Array.isArray(liveMarketData) || liveMarketData.length === 0) {
    return [];
  }

  const highPotentialStocks = liveMarketData.filter((stock) => {
    const {
      lastPrice,
      prevClose,
      currentVolume,
      avgVolume20Day,
    } = stock;

    if (
      typeof lastPrice !== "number" ||
      typeof prevClose !== "number" ||
      typeof currentVolume !== "number" ||
      typeof avgVolume20Day !== "number"
    ) {
      return false;
    }

    const priceChangePct = ((lastPrice - prevClose) / prevClose) * 100;
    const isGaining = priceChangePct >= 2 && priceChangePct <= 15;
    const hasVolumeBurst = currentVolume >= avgVolume20Day * 2.5;
    const isNotPenny = lastPrice > 20;

    return isGaining && hasVolumeBurst && isNotPenny;
  });

  return highPotentialStocks.sort((a, b) => {
    const ca = (a.lastPrice - a.prevClose) / a.prevClose;
    const cb = (b.lastPrice - b.prevClose) / b.prevClose;
    return cb - ca;
  });
}


// 🔥 THIS FUNCTION WAS MISSING
function getIndexConfig(symbol = "") {
  if (!symbol) return null;

  const key = symbol.toUpperCase().replace(/\s+/g, "");
  return INDEX_CONFIG_MAP[key] || null;
}
// ------------------------------------------
// MARKET CONTEXT (OPTIONAL)
// ------------------------------------------
function getMarketContext(allData = []) {
  const movers = identifyTradeableStocks(allData);

  return {
    indices: Object.keys(INDEX_CONFIG_MAP),
    activeMovers: movers,
    totalFound: movers.length,
    timestamp: new Date().toISOString(),
  };
}

// ------------------------------------------
// EXPORTS (VERY IMPORTANT)
// ------------------------------------------
module.exports = {
  getIndexConfig,          // 🔥 REQUIRED BY signal.api.js
  identifyTradeableStocks,
  getMarketContext,
};
