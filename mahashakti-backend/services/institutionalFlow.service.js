// ==========================================
// INSTITUTIONAL FLOW SERVICE (FII / DII)
// ROLE: CONTEXT ONLY (HAWAA)
// NO BUY / SELL GENERATION
// NOTE: UI-SAFE (NO EXPLANATION LEAK)
// ==========================================

/**
 * analyzeInstitutionalFlow
 * @param {Object} data
 * @returns {Object}
 *
 * Required:
 * - fiiNet (number)  // +ve = buying, -ve = selling
 * - diiNet (number)  // +ve = buying, -ve = selling
 */
function analyzeInstitutionalFlow(data = {}) {
  const fiiNet = Number(data.fiiNet || 0);
  const diiNet = Number(data.diiNet || 0);

  // -----------------------------
  // DEFAULT RESPONSE (SAFE)
  // -----------------------------
  let flow = "MIXED";

  // NOTE is kept GENERIC & INTERNAL
  // ❌ No strategy explanation
  // ❌ No actionable wording
  let note = "Institutional flow context";

  // -----------------------------
  // BOTH SUPPORTIVE
  // -----------------------------
  if (fiiNet > 0 && diiNet > 0) {
    flow = "SUPPORTIVE";
    note = "Institutional support present";
  }

  // -----------------------------
  // BOTH AGAINST
  // -----------------------------
  else if (fiiNet < 0 && diiNet < 0) {
    flow = "AGAINST";
    note = "Institutional pressure present";
  }

  // -----------------------------
  // CONFLICT / MIXED
  // -----------------------------
  else if (fiiNet !== 0 || diiNet !== 0) {
    flow = "MIXED";
    note = "Institutional flow mixed";
  }

  return {
    flow,   // SUPPORTIVE | AGAINST | MIXED
    note,   // 🔒 INTERNAL / NON-STRATEGIC TEXT ONLY
  };
}

module.exports = {
  analyzeInstitutionalFlow,
};
