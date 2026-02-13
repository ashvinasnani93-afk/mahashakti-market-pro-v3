// ==========================================
// INTRADAY FAST-MOVE ENGINE (PRACTICAL RULES)
// ==========================================

function detectFastMove(data = {}) {
  const {
    ltp,
    prevLtp,
    volume,
    avgVolume,
    trend,
    isExpiryDay = false,
    isResultDay = false,
  } = data;

  // Basic validation
  if (!ltp || !prevLtp || !volume || !avgVolume) {
    return { signal: "WAIT" };
  }

  // Trend validation
  if (trend !== "UPTREND" && trend !== "DOWNTREND") {
    return { signal: "WAIT" };
  }

  // -------------------------------
  // PRICE CHANGE % (Optimized to 0.20%)
  // -------------------------------
  const changePercent = ((ltp - prevLtp) / prevLtp) * 100;
  const absChange = Math.abs(changePercent);

  // Sudden Spike Protection (Still active but relaxed to 2.5%)
  if (absChange > 2.5) {
    return { signal: "WAIT" };
  }

  // -------------------------------
  // PRACTICAL MOMENTUM CONDITIONS
  // -------------------------------
  const priceBurst = absChange >= 0.20; // Corrected for practical intraday moves
  const volumeBurst = volume >= avgVolume * 1.2; // 20% spike is enough to confirm intent

  if (!priceBurst || !volumeBurst) {
    return { signal: "WAIT" };
  }

  // -------------------------------
  // DIRECTIONAL ALIGNMENT
  // -------------------------------
  if (changePercent > 0 && trend === "UPTREND") {
    return { signal: "BUY" };
  }

  if (changePercent < 0 && trend === "DOWNTREND") {
    return { signal: "SELL" };
  }

  return { signal: "WAIT" };
}

module.exports = {
  detectFastMove,
};
