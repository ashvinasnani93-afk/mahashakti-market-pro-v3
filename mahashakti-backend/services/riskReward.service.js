// ==========================================
// RISK REWARD ENGINE
// Strict R:R calculation
// REJECT if < 1.2
// BUY/SELL if 1.2-2
// STRONG if >= 2
// ==========================================

// ==========================================
// CALCULATE RISK REWARD RATIO
// Formula: (Target - Entry) / (Entry - SL)
// ==========================================
function calculateRiskReward(entry, target, stopLoss) {
  if (!entry || !target || !stopLoss) {
    return { valid: false, ratio: 0, grade: "INVALID" };
  }

  // Validate order
  const isBuy = target > entry && entry > stopLoss;
  const isSell = target < entry && entry < stopLoss;

  if (!isBuy && !isSell) {
    return { valid: false, ratio: 0, grade: "INVALID" };
  }

  const reward = Math.abs(target - entry);
  const risk = Math.abs(entry - stopLoss);

  if (risk === 0) {
    return { valid: false, ratio: 0, grade: "INVALID" };
  }

  const ratio = reward / risk;

  // Grade the R:R
  let grade;
  let acceptable;

  if (ratio >= 2) {
    grade = "EXCELLENT";
    acceptable = true;
  } else if (ratio >= 1.5) {
    grade = "GOOD";
    acceptable = true;
  } else if (ratio >= 1.2) {
    grade = "ACCEPTABLE";
    acceptable = true;
  } else {
    grade = "REJECTED";
    acceptable = false;
  }

  return {
    valid: true,
    ratio: parseFloat(ratio.toFixed(2)),
    grade,
    acceptable,
    direction: isBuy ? "BUY" : "SELL",
    entry,
    target,
    stopLoss,
    reward: parseFloat(reward.toFixed(2)),
    risk: parseFloat(risk.toFixed(2))
  };
}

// ==========================================
// CALCULATE AUTO TARGETS
// Based on ATR for intraday
// ==========================================
function calculateAutoTargets(entry, atr, trend, multiplier = 1.5) {
  if (!entry || !atr || !trend) {
    return null;
  }

  let target, stopLoss;

  if (trend === "UPTREND" || trend === "BUY") {
    target = entry + (atr * multiplier);
    stopLoss = entry - (atr * 0.75);
  } else if (trend === "DOWNTREND" || trend === "SELL") {
    target = entry - (atr * multiplier);
    stopLoss = entry + (atr * 0.75);
  } else {
    return null;
  }

  const rrResult = calculateRiskReward(entry, target, stopLoss);

  return {
    entry: parseFloat(entry.toFixed(2)),
    target: parseFloat(target.toFixed(2)),
    stopLoss: parseFloat(stopLoss.toFixed(2)),
    atrUsed: atr,
    multiplier,
    riskReward: rrResult
  };
}

// ==========================================
// VALIDATE SIGNAL WITH R:R
// Returns modified signal if R:R fails
// ==========================================
function validateSignalRR(signal, entry, atr, trend) {
  if (signal === "WAIT") {
    return { signal: "WAIT", reason: "No trade signal" };
  }

  const targets = calculateAutoTargets(entry, atr, trend);

  if (!targets || !targets.riskReward.acceptable) {
    return {
      signal: "WAIT",
      reason: `R:R ratio ${targets?.riskReward?.ratio || 0} below minimum 1.2`,
      originalSignal: signal,
      riskReward: targets?.riskReward
    };
  }

  // Upgrade to STRONG if R:R >= 2
  let finalSignal = signal;
  if (targets.riskReward.ratio >= 2) {
    if (signal === "BUY") finalSignal = "STRONG_BUY";
    if (signal === "SELL") finalSignal = "STRONG_SELL";
  }

  return {
    signal: finalSignal,
    targets,
    riskReward: targets.riskReward
  };
}

// ==========================================
// GET SIGNAL GRADE FROM R:R
// ==========================================
function getSignalGrade(ratio) {
  if (ratio >= 2) return "STRONG";
  if (ratio >= 1.5) return "GOOD";
  if (ratio >= 1.2) return "NORMAL";
  return "REJECT";
}

module.exports = {
  calculateRiskReward,
  calculateAutoTargets,
  validateSignalRR,
  getSignalGrade
};
