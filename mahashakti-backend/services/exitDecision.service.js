// ==========================================
// EXIT DECISION SERVICE
// ROLE: Decide EXIT or HOLD (NO ENTRY SIGNAL)
// Uses centralized exit rules
// ==========================================

const { checkExitRules } = require("./exitRules.util");

/**
 * decideExit
 * @param {Object} data
 * @returns {Object}
 *
 * Required:
 * - entryPrice
 * - currentPrice
 * - volume
 * - avgVolume
 *
 * Optional:
 * - oppositeStrongCandle (boolean)
 * - structureBroken (boolean)
 * - signal (BUY / SELL / STRONG BUY / STRONG SELL)
 */
function decideExit(data = {}) {
  const {
    entryPrice,
    currentPrice,
    volume,
    avgVolume,
    oppositeStrongCandle = false,
    structureBroken = false,
    signal = "",
  } = data;

  // Safety: invalid data
  if (!entryPrice || !currentPrice) {
    return { status: "HOLD" };
  }

  // ------------------------------
  // CENTRALIZED EXIT RULE CHECK
  // ------------------------------
  const exitCheck = checkExitRules({
    entryPrice,
    currentPrice,
    volume,
    avgVolume,
    oppositeStrongCandle,
    structureBroken,
    signal,
  });

  if (exitCheck.exit) {
    return { status: "EXIT" };
  }

  return { status: "HOLD" };
}

module.exports = {
  decideExit,
};
