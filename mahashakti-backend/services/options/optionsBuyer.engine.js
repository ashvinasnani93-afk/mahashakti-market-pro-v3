// ==================================================
// OPTIONS BUYER ENGINE (PRO-PROFIT VERSION)
// ==================================================

function evaluateBuyerContext(data = {}) {
  const {
    trend,        
    rsi,          
    vix,          
    mismatch = false, // To detect if 15min and 5min are opposite
    volumeSpike = false
  } = data;

  // 1. RULE: Higher Timeframe Alignment
  if (mismatch) {
    return { buyerAllowed: false, reason: "Bade trend ke khilaaf trade risky hai" };
  }

  // 2. RULE: Momentum Confirmation
  if (rsi > 60 && trend === "UPTREND" && volumeSpike) {
     return { buyerAllowed: true, reason: "Strong Momentum: Smart money is buying" };
  }

  if (rsi < 40 && trend === "DOWNTREND" && volumeSpike) {
     return { buyerAllowed: true, reason: "Strong Panic: Short side momentum" };
  }

  return { buyerAllowed: false, reason: "Low conviction move" };
}

module.exports = { evaluateBuyerContext };
