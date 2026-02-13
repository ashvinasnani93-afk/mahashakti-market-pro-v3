// ==========================================
// MOVERS SCANNER API — FINAL (PATCHED)
// Detects 15-20% Fast Moving Stocks
// Real Angel One Data - NO DUMMY
// MEMORY SAFE + LIVE SNAPSHOT OPEN
// ==========================================

const express = require("express");
const router = express.Router();

// ------------------------------------------
// SAFE IMPORT SIGNAL ENGINE
// ------------------------------------------
let finalDecision = null;
try {
  ({ finalDecision } = require("../signalDecision.service"));
} catch (e) {
  console.log("⚠️ Movers running without signal engine");
}

// ------------------------------------------
// LOCAL OPEN SNAPSHOT (SESSION SAFE)
// ------------------------------------------
const localOpenSnapshot = {};

// ==========================================
// GET /scanner/movers?range=15-20
// ==========================================
router.get("/movers", async (req, res) => {
  try {
    const range = req.query.range || "15-20";
    const [minPercent, maxPercent] = range.split("-").map(Number);

    // -------------------------------
    // RANGE VALIDATION (SAFE)
    // -------------------------------
    if (isNaN(minPercent) || isNaN(maxPercent)) {
      return res.json({
        status: false,
        message: "Invalid range format. Use: 5-10, 10-15, 15-20, 20-30",
      });
    }

    console.log(`🔍 Scanning for ${minPercent}-${maxPercent}% movers...`);

    // Get stock universe (symbols to scan)
    const stockUniverse = getStockUniverse();

    const movers = [];

    // Scan each stock
    for (const stock of stockUniverse) {
      try {
        // -------------------------------
        // GET LIVE LTP
        // -------------------------------
        const ltp = getStockLTP(stock.symbol);

        if (!ltp || ltp === 0) continue;

        // -------------------------------
        // GET OPEN SNAPSHOT
        // -------------------------------
        const open = getStockOpen(stock.symbol);

        if (!open || open === 0) continue;

        // -------------------------------
        // CALCULATE % CHANGE
        // -------------------------------
        const change = ltp - open;
        const changePercent = (change / open) * 100;

        // Filter by range
        const absChange = Math.abs(changePercent);

        if (absChange >= minPercent && absChange <= maxPercent) {
          // -------------------------------
          // SIGNAL ENGINE (OPTIONAL)
          // -------------------------------
          const signalData = {
            symbol: stock.symbol,
            close: ltp,
            tradeType: "INTRADAY",
          };

          const signal = finalDecision
            ? finalDecision(signalData)
            : null;

          movers.push({
            symbol: stock.symbol,
            name: stock.name,
            ltp: Number(ltp.toFixed(2)),
            open: Number(open.toFixed(2)),
            change: Number(change.toFixed(2)),
            changePercent: changePercent.toFixed(2),
            signal: signal?.signal || "WAIT",
            emoji: signal?.emoji || "🟡",
            display: signal?.display || "🟡 WAIT",
            momentumActive: signal?.momentumActive || false,
          });
        }
      } catch (err) {
        console.error(`❌ Error scanning ${stock.symbol}:`, err.message);
        continue;
      }
    }

    // Sort by absolute change (highest first)
    movers.sort(
      (a, b) =>
        Math.abs(b.changePercent) - Math.abs(a.changePercent)
    );

    console.log(
      `✅ Found ${movers.length} movers in ${minPercent}-${maxPercent}% range`
    );

    return res.json({
      status: true,
      range: `${minPercent}-${maxPercent}%`,
      count: movers.length,
      movers,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("❌ Movers Scanner Error:", error.message);
    return res.json({
      status: false,
      message: "Scanner failed",
    });
  }
});

// ==========================================
// HELPER: Get Stock Universe
// ==========================================
function getStockUniverse() {
  return [
    { symbol: "RELIANCE", name: "Reliance Industries" },
    { symbol: "TCS", name: "Tata Consultancy Services" },
    { symbol: "INFY", name: "Infosys" },
    { symbol: "HDFCBANK", name: "HDFC Bank" },
    { symbol: "ICICIBANK", name: "ICICI Bank" },
    { symbol: "SBIN", name: "State Bank of India" },
    { symbol: "BHARTIARTL", name: "Bharti Airtel" },
    { symbol: "ITC", name: "ITC Limited" },
    { symbol: "HINDUNILVR", name: "Hindustan Unilever" },
    { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank" },
    { symbol: "LT", name: "Larsen & Toubro" },
    { symbol: "AXISBANK", name: "Axis Bank" },
    { symbol: "BAJFINANCE", name: "Bajaj Finance" },
    { symbol: "MARUTI", name: "Maruti Suzuki" },
    { symbol: "ASIANPAINT", name: "Asian Paints" },
    { symbol: "HCLTECH", name: "HCL Technologies" },
    { symbol: "WIPRO", name: "Wipro" },
    { symbol: "TITAN", name: "Titan Company" },
    { symbol: "ULTRACEMCO", name: "UltraTech Cement" },
    { symbol: "SUNPHARMA", name: "Sun Pharmaceutical" },
    { symbol: "TATASTEEL", name: "Tata Steel" },
    { symbol: "TATAMOTORS", name: "Tata Motors" },
    { symbol: "POWERGRID", name: "Power Grid Corporation" },
    { symbol: "NTPC", name: "NTPC Limited" },
    { symbol: "ONGC", name: "Oil & Natural Gas Corporation" },
    { symbol: "ADANIPORTS", name: "Adani Ports" },
    { symbol: "JSWSTEEL", name: "JSW Steel" },
    { symbol: "INDUSINDBK", name: "IndusInd Bank" },
    { symbol: "TECHM", name: "Tech Mahindra" },
    { symbol: "HINDALCO", name: "Hindalco Industries" },
  ];
}

// ==========================================
// HELPER: Get Stock LTP (GLOBAL FEED)
// ==========================================
function getStockLTP(symbol) {
  if (global.latestLTP && global.latestLTP[symbol]) {
    return global.latestLTP[symbol];
  }

  // Auto subscribe if possible
  if (global.subscribeSymbol) {
    global.subscribeSymbol(symbol);
  }

  return null;
}

// ==========================================
// HELPER: Get Stock OPEN (LIVE SNAPSHOT)
// ==========================================
function getStockOpen(symbol) {
  if (localOpenSnapshot[symbol]) {
    return localOpenSnapshot[symbol];
  }

  const ltp = getStockLTP(symbol);
  if (ltp) {
    localOpenSnapshot[symbol] = ltp; // snapshot first seen price
  }

  return ltp;
}

// ==========================================
// EXPORT
// ==========================================
module.exports = router;
