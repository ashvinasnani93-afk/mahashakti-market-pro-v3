// ==================================================
// TRADE MONITOR SERVICE
// ROLE: Monitor active trade and suggest EXIT / HOLD
// Uses centralized exit rules
// ==================================================

const { checkExitRules } = require("./exitRules.util");

/**
 * monitorTrade
 * @param {object} trade
 * @param {object} market
 * @returns {object}
 *
 * trade:
 * - entryPrice
 * - signal
 * - tradeState
 *
 * market:
 * - currentPrice
 * - volume
 * - avgVolume
 * - oppositeStrongCandle (boolean)
 * - structureBroken (boolean)
 */
function monitorTrade(trade = {}, market = {}) {
  if (trade.tradeState !== "ACTIVE") {
    return { status: "NO_ACTION" };
  }

  const {
    entryPrice,
    signal,
  } = trade;

  const {
    currentPrice,
    volume,
    avgVolume,
    oppositeStrongCandle = false,
    structureBroken = false,
  } = market;

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
  monitorTrade,
};
