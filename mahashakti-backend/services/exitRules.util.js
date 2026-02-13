// ==========================================
// EXIT RULES UTILITY (PRO-VERSION)
// ==========================================

function checkExitRules(data = {}) {
  const {
    entryPrice,
    currentPrice,
    durationInTrade, // Minutes
    isOptionBuyer = true,
    structureBroken = false
  } = data;

  if (!entryPrice || !currentPrice) return { exit: false };

  // 1. Time-Decay Exit (For Option Buyers)
  if (isOptionBuyer && durationInTrade > 30 && currentPrice === entryPrice) {
    return { exit: true, reason: "Time Decay: Price not moving, saving premium" };
  }

  // 2. Trailing Profit Protection
  const profitPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
  if (profitPercent > 1.5 && structureBroken) {
    return { exit: true, reason: "Profit Protection: Structure weakening" };
  }

  return { exit: false };
}

module.exports = { checkExitRules };
