// ==================================================
// OPTIONS vs EQUITY CONFLICT RESOLVER (PHASE-4D)
// Equity Priority | Panic Protection | Text Resolution
// NO EXECUTION | RULE-LOCKED
// ==================================================

/**
 * resolveOptionEquityConflict
 * @param {object} data
 * @returns {object}
 *
 * Inputs:
 * - equityDecision  (HOLD / PARTIAL_EXIT / FULL_EXIT)
 * - optionsDecision (OPTION_BUY_ALLOWED / OPTION_SELL_ALLOWED / NO_TRADE)
 *
 * This engine:
 * - Resolves conflict between Equity & Options
 * - Gives user-facing clear guidance
 */
function resolveOptionEquityConflict(data = {}) {
  const {
    equityDecision,
    optionsDecision,
  } = data;

  // -------------------------------
  // HARD INPUT CHECK
  // -------------------------------
  if (!equityDecision || !optionsDecision) {
    return {
      status: "OK",
      finalView: "NO_CONFLICT",
      note: "Insufficient data for conflict resolution",
    };
  }

  // -------------------------------
  // EQUITY FULL EXIT → OPTIONS BLOCK
  // -------------------------------
  if (equityDecision === "FULL_EXIT") {
    return {
      status: "OK",
      finalView: "EQUITY_PRIORITY",
      allowOptions: false,
      note:
        "Equity exit advised. Options trades avoided to protect capital.",
    };
  }

  // -------------------------------
  // EQUITY PARTIAL EXIT
  // -------------------------------
  if (equityDecision === "PARTIAL_EXIT") {
    return {
      status: "OK",
      finalView: "CONTROLLED_OPTIONS",
      allowOptions: optionsDecision === "OPTION_SELL_ALLOWED",
      note:
        "Equity partially booked. Options selling allowed cautiously for income.",
    };
  }

  // -------------------------------
  // EQUITY HOLD + OPTIONS SELL
  // -------------------------------
  if (
    equityDecision === "HOLD" &&
    optionsDecision === "OPTION_SELL_ALLOWED"
  ) {
    return {
      status: "OK",
      finalView: "INCOME_MODE",
      allowOptions: true,
      note:
        "Equity holding intact. Options selling allowed as short-term income only.",
    };
  }

  // -------------------------------
  // EQUITY HOLD + OPTIONS BUY
  // -------------------------------
  if (
    equityDecision === "HOLD" &&
    optionsDecision === "OPTION_BUY_ALLOWED"
  ) {
    return {
      status: "OK",
      finalView: "AGGRESSIVE_ALLOWED",
      allowOptions: true,
      note:
        "Equity trend strong. Options buying allowed with strict risk control.",
    };
  }

  // -------------------------------
  // DEFAULT SAFE FALLBACK
  // -------------------------------
  return {
    status: "OK",
    finalView: "NO_ACTION",
    allowOptions: false,
    note:
      "No clear alignment between equity and options. Best to wait.",
  };
}

// ==================================================
// EXPORT
// ==================================================
module.exports = {
  resolveOptionEquityConflict,
};
