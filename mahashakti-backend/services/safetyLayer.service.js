// ==========================================
// SAFETY LAYER - FINAL GATE
// Block signals on risky conditions
// ==========================================

// ==========================================
// SAFETY CONFIG
// ==========================================
const SAFETY_CONFIG = {
  maxTradesPerDay: 10,
  vixHighThreshold: 20,
  vixExtremeThreshold: 25,
  expiryDayRisk: true,
  resultDayRisk: true
};

// ==========================================
// CHECK IF EXPIRY DAY
// ==========================================
function isExpiryDay(date = new Date()) {
  const day = date.getDay();
  // Thursday is typical expiry (0=Sun, 4=Thu)
  return day === 4;
}

// ==========================================
// CHECK VIX RISK
// ==========================================
function checkVixRisk(vix) {
  if (!vix || typeof vix !== "number") {
    return { risk: "UNKNOWN", note: "VIX data unavailable" };
  }

  if (vix >= SAFETY_CONFIG.vixExtremeThreshold) {
    return { risk: "EXTREME", note: `VIX at ${vix} - Extreme volatility`, block: true };
  }

  if (vix >= SAFETY_CONFIG.vixHighThreshold) {
    return { risk: "HIGH", note: `VIX at ${vix} - High volatility`, block: false };
  }

  return { risk: "NORMAL", note: `VIX at ${vix} - Normal conditions`, block: false };
}

// ==========================================
// APPLY SAFETY RULES
// ==========================================
function applySafety(signalData, context = {}) {
  const {
    isResultDay = false,
    isExpiry = isExpiryDay(),
    tradeCountToday = 0,
    tradeType = "INTRADAY",
    vix = null
  } = context;

  const { signal } = signalData;
  const blockedReasons = [];

  // If no signal, pass through
  if (!signal || signal === "WAIT") {
    return { signal: "WAIT", blocked: false };
  }

  // 1. Result Day Block
  if (isResultDay && SAFETY_CONFIG.resultDayRisk) {
    blockedReasons.push("RESULT_DAY_RISK");
  }

  // 2. Expiry Day Block for options (if trade type is option)
  if (isExpiry && tradeType === "OPTIONS" && SAFETY_CONFIG.expiryDayRisk) {
    blockedReasons.push("EXPIRY_DAY_RISK");
  }

  // 3. Overtrade Guard
  if (tradeCountToday >= SAFETY_CONFIG.maxTradesPerDay) {
    blockedReasons.push("OVERTRADE_LIMIT");
  }

  // 4. VIX Risk
  const vixCheck = checkVixRisk(vix);
  if (vixCheck.block) {
    blockedReasons.push("VIX_EXTREME");
  }

  // 5. Intraday vs Equity mismatch (basic check)
  if (tradeType === "DELIVERY" && (signal === "STRONG_SELL" || signal === "SELL")) {
    // For delivery, sells are fine but flag it
  }

  // Final decision
  if (blockedReasons.length > 0) {
    return {
      signal: "WAIT",
      blocked: true,
      blockedReasons,
      originalSignal: signal,
      vixStatus: vixCheck
    };
  }

  return {
    signal: signal,
    blocked: false,
    vixStatus: vixCheck
  };
}

// ==========================================
// GET VIX SAFETY NOTE
// ==========================================
function getVixSafetyNote(vix) {
  if (!vix || typeof vix !== "number") {
    return "VIX data unavailable - trade with caution";
  }

  if (vix >= 25) {
    return `⚠️ EXTREME VIX (${vix}) - Avoid trading`;
  }

  if (vix >= 20) {
    return `⚡ HIGH VIX (${vix}) - Reduce position size`;
  }

  if (vix >= 15) {
    return `📊 ELEVATED VIX (${vix}) - Normal caution`;
  }

  return `✅ LOW VIX (${vix}) - Favorable conditions`;
}

// ==========================================
// CHECK SAFETY CONTEXT
// ==========================================
function checkSafetyContext(data) {
  const issues = [];

  if (data.isResultDay) issues.push("Result day - avoid");
  if (data.isExpiryDay) issues.push("Expiry day - be careful");
  if (data.vix >= 20) issues.push(`High VIX: ${data.vix}`);
  if (data.tradeCount >= 8) issues.push("Near trade limit");

  return {
    safe: issues.length === 0,
    issues,
    recommendation: issues.length > 0 ? "CAUTION" : "OK"
  };
}

module.exports = {
  applySafety,
  checkVixRisk,
  isExpiryDay,
  getVixSafetyNote,
  checkSafetyContext,
  SAFETY_CONFIG
};
