// ==================================================
// OPTIONS SIGNAL ENGINE (MAHASHAKTI - STRONG WIRED)
// ==================================================

const { evaluateBuyerContext } = require("./optionsBuyer.engine");
const { getOptionsSellerContext } = require("./optionsSellerContext.service");
const { generateStrongSignal } = require("./strongBuy.engine"); // 🔥 WIRING

// ---------- NO TRADE ZONE ----------
function isNoTradeZone({ spotPrice, ema20, ema50 }) {
  if (!spotPrice || !ema20 || !ema50) return false;
  const emaDiffPercent = (Math.abs(ema20 - ema50) / spotPrice) * 100;
  const priceNearEMA = (Math.abs(spotPrice - ema20) / spotPrice) * 100 < 0.1;
  return emaDiffPercent < 0.1 && priceNearEMA;
}

// ---------- UI SIGNAL ----------
function mapUISignal(type) {
  if (type === "STRONG_BUY")
    return { uiSignal: "STRONG_BUY", uiColor: "DARK_GREEN", uiIcon: "🟢🔥" };

  if (type === "STRONG_SELL")
    return { uiSignal: "STRONG_SELL", uiColor: "DARK_RED", uiIcon: "🔴🔥" };

  if (type === "BUY")
    return { uiSignal: "BUY", uiColor: "GREEN", uiIcon: "🟢" };

  if (type === "SELL")
    return { uiSignal: "SELL", uiColor: "RED", uiIcon: "🔴" };

  return { uiSignal: "WAIT", uiColor: "YELLOW", uiIcon: "🟡" };
}

// ---------- MAIN ENGINE ----------
function generateOptionsSignal(context = {}) {
  const {
    symbol,
    spotPrice,
    ema20,
    ema50,
    rsi,
    vix,
    safety = { allowTrade: true },
    volumeConfirm = true,
    breakoutQuality = "REAL",
    marketBreadth = "BULLISH",
    isResultDay = false,
    isExpiryDay = false
  } = context;

  // BASIC CHECK
  if (!symbol || !spotPrice || !ema20 || !ema50 || !rsi) {
    return { status: "WAIT", ...mapUISignal("WAIT") };
  }

  // SAFETY
  if (safety.allowTrade === false) {
    return { status: "WAIT", regime: "HIGH_RISK", ...mapUISignal("WAIT") };
  }

  // TREND
  let trend = "SIDEWAYS";
  if (ema20 > ema50) trend = "UPTREND";
  else if (ema20 < ema50) trend = "DOWNTREND";

  let regime = trend === "SIDEWAYS" ? "SIDEWAYS" : "TRENDING";
  if (isNoTradeZone({ spotPrice, ema20, ema50 })) {
    regime = "NO_TRADE_ZONE";
  }

  // RSI FILTER
  if (rsi > 75 || rsi < 25) {
    return { status: "WAIT", regime: "OVERBOUGHT", ...mapUISignal("WAIT") };
  }

  // 🔥 STRONG SIGNAL PRIORITY
  const strongResult = generateStrongSignal({
    structure: trend === "UPTREND" ? "UP" : "DOWN",
    trend,
    emaAlignment: trend === "UPTREND" ? "BULLISH" : "BEARISH",
    priceAction: rsi > 60 || rsi < 40 ? "STRONG" : "WEAK",
    volumeConfirm,
    breakoutQuality,
    marketBreadth,
    vixLevel: vix < 20 ? "NORMAL" : "HIGH",
    isResultDay,
    isExpiryDay
  });

  if (strongResult.status === "READY") {
    return {
      status: "READY",
      trend,
      regime: "TRENDING",
      ...mapUISignal(strongResult.signal),
      note: strongResult.note
    };
  }

  // STANDARD BUY
  const buyerContext = evaluateBuyerContext({ trend, rsi, vix, safety });
  if (buyerContext?.buyerAllowed) {
    return { status: "READY", trend, regime, ...mapUISignal("BUY") };
  }

  // STANDARD SELL
  const sellerContext = getOptionsSellerContext({ trend, regime, safety });
  if (sellerContext?.sellerAllowed) {
    return { status: "READY", trend, regime, ...mapUISignal("SELL") };
  }

  return { status: "WAIT", trend, regime, ...mapUISignal("WAIT") };
}

module.exports = {
  generateOptionsSignal
};
