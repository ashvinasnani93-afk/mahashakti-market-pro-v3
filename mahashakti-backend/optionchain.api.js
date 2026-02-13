// ==========================================  
// MAHASHAKTI MARKET PRO  
// LIVE OPTION CHAIN API - FIXED  
// Angel One Auto Expiry + LTP + Context Logic  
// ==========================================  
  
const express = require("express");  
const router = express.Router();  
  
// -----------------------------  
// ANGEL ENGINE  
// -----------------------------  
const { getLtp, isSystemReady } = require("./src.angelEngine");  
  
// -----------------------------  
// OPTION MASTER (ANGEL SOURCE OF TRUTH)  
// -----------------------------  
const {  
  getAllOptionSymbols,  // 🔥 FIXED: This function now exists  
} = require("./services/optionsMaster.service");  
  
// -----------------------------  
// HELPERS  
// -----------------------------  
function isSameDate(d1, d2) {  
  return (  
    d1.getFullYear() === d2.getFullYear() &&  
    d1.getMonth() === d2.getMonth() &&  
    d1.getDate() === d2.getDate()  
  );  
}  
  
function getATMStrike(strikes, spot) {  
  let closest = strikes[0];  
  let diff = Math.abs(spot - closest);  
  
  for (let s of strikes) {  
    const d = Math.abs(spot - s);  
    if (d < diff) {  
      diff = d;  
      closest = s;  
    }  
  }  
  
  return closest;  
}  
  
// -----------------------------  
// AUTO EXPIRY FROM ANGEL  
// -----------------------------  
function getAvailableExpiries(master, symbol) {  
  const expirySet = new Set();  
  
  master.forEach((opt) => {  
    if (!opt || !opt.name || !opt.expiry) return;  
  
    if (opt.name.toUpperCase() === symbol.toUpperCase()) {  
      const d = new Date(opt.expiry);  
      if (!isNaN(d.getTime())) {  
        expirySet.add(d.toISOString().slice(0, 10));  
      }  
    }  
  });  
  
  return Array.from(expirySet).sort();  
}  
  
// -----------------------------  
// STRIKE BUILDER  
// -----------------------------  
function buildOptionChain({ symbol, expiryDate, master, spotPrice }) {  
  const strikeMap = {};  
  
  const filtered = master.filter((opt) => {  
    if (!opt || !opt.name || !opt.expiry || !opt.strike || !opt.token)  
      return false;  
  
    const optExpiry = new Date(opt.expiry);  
  
    return (  
      opt.name.toUpperCase() === symbol.toUpperCase() &&  
      isSameDate(optExpiry, expiryDate)  
    );  
  });  
  
  filtered.forEach((opt) => {  
    const strike = Number(opt.strike);  
  
    if (!strikeMap[strike]) {  
      strikeMap[strike] = { strike, CE: null, PE: null };  
    }  
  
    if (opt.type === "CE") {  
      strikeMap[strike].CE = opt;  
    } else if (opt.type === "PE") {  
      strikeMap[strike].PE = opt;  
    }  
  });  
  
  const strikes = Object.keys(strikeMap)  
    .map(Number)  
    .sort((a, b) => a - b);  
  
  const atmStrike = getATMStrike(strikes, spotPrice);  
  const chain = {};  
  
  strikes.forEach((strike) => {  
    const row = strikeMap[strike];  
  
    let ceLtp = null;  
    let peLtp = null;  
  
   if (row.CE) {

  // 🔥 AUTO SUBSCRIBE TO CE TOKEN
  const { subscribeToToken } = require("./services/angel/angelWebSocket.service");
  subscribeToToken(row.CE.token, 2); // 2 = NFO

  const ceData = getLtp(row.CE.token);
  ceLtp = ceData ? ceData.ltp : null;
}
  
   if (row.PE) {

  const { subscribeToToken } = require("./services/angel/angelWebSocket.service");
  subscribeToToken(row.PE.token, 2); // 2 = NFO

  const peData = getLtp(row.PE.token);
  peLtp = peData ? peData.ltp : null;
}
  
    const ceBuyerBias = ceLtp && peLtp ? ceLtp > peLtp : false;  
    const peBuyerBias = ceLtp && peLtp ? peLtp > ceLtp : false;  
  
    chain[strike] = {  
      strike,  
      CE: row.CE  
        ? {  
            token: row.CE.token,  
            symbol: row.CE.symbol,  
            ltp: ceLtp,  
            buyerBias: ceBuyerBias,  
            sellerBias: !ceBuyerBias && ceLtp !== null,  
            contextSymbol: ceBuyerBias  
              ? "🟢"  
              : ceLtp !== null  
              ? "🔴"  
              : "🟡",  
          }  
        : null,  
      PE: row.PE  
        ? {  
            token: row.PE.token,  
            symbol: row.PE.symbol,  
            ltp: peLtp,  
            buyerBias: peBuyerBias,  
            sellerBias: !peBuyerBias && peLtp !== null,  
            contextSymbol: peBuyerBias  
              ? "🟢"  
              : peLtp !== null  
              ? "🔴"  
              : "🟡",  
          }  
        : null,  
      atm: strike === atmStrike,  
    };  
  });  
  
  return { chain, atmStrike, totalStrikes: strikes.length };  
}  
  
// -----------------------------  
// ROUTE  
// Mounted at: /angel/option-chain  
// -----------------------------  
router.get("/", async (req, res) => {  
  try {  
    if (!isSystemReady()) {  
      return res.json({  
        status: false,  
        message: "LIVE DATA NOT READY",  
      });  
    }  
  
    const { index, stock, expiry, spot } = req.query;  
  
    if (!index && !stock) {  
      return res.json({  
        status: false,  
        message: "index or stock required",  
      });  
    }  
  
    const symbol = (index || stock).toUpperCase();  
    const isIndex = ["NIFTY", "BANKNIFTY", "FINNIFTY"].includes(symbol);  
  
    // -----------------------------  
    // LOAD ANGEL MASTER (ASYNC SAFE)  
    // -----------------------------  
    const master = await getAllOptionSymbols();  
  
    if (!Array.isArray(master) || !master.length) {  
      return res.json({  
        status: false,  
        message: "Option master not ready",  
      });  
    }  
  
    // -----------------------------  
    // AUTO EXPIRY  
    // -----------------------------  
    const availableExpiries = getAvailableExpiries(master, symbol);  
  
    if (!availableExpiries.length) {  
      return res.json({  
        status: false,  
        message: `No expiries found for ${symbol}`,  
      });  
    }  
  
    const selectedExpiry = expiry || availableExpiries[0];  
    const expiryDate = new Date(selectedExpiry);  
  
    // -----------------------------  
    // AUTO SPOT  
    // -----------------------------  
    let spotPrice = Number(spot);  
  
    if (!spotPrice || isNaN(spotPrice)) {  
      const ltpData = getLtp(symbol);  
      spotPrice = ltpData ? ltpData.ltp : null;  
    }  
  
    if (!spotPrice) {  
      return res.json({  
        status: false,  
        message: "Spot price not available",  
      });  
    }  
  
    // -----------------------------  
    // BUILD CHAIN  
    // -----------------------------  
    const { chain, atmStrike, totalStrikes } = buildOptionChain({  
      symbol,  
      expiryDate,  
      master,  
      spotPrice,  
    });  
  
    // -----------------------------  
    // RESPONSE  
    // -----------------------------  
    return res.json({  
      status: true,  
      symbol,  
      type: isIndex ? "INDEX" : "STOCK",  
      expiry: selectedExpiry,  
      availableExpiries,  
      spot: spotPrice,  
      atmStrike,  
      totalStrikes,  
      legend: {  
        "🟢": "Buyer-favourable zone",  
        "🔴": "Seller-favourable zone",  
        "🟡": "No-trade / wait zone",  
      },  
      chain,  
      note:  
        "Context-only option chain. Symbols indicate buyer/seller pressure. No execution or recommendation.",  
    });  
  } catch (err) {  
    console.error("❌ OPTION CHAIN ERROR:", err.message);  
    return res.json({  
      status: false,  
      message: "Option chain internal error",  
      error: err.message  
    });  
  }  
});  
  
module.exports = router;
