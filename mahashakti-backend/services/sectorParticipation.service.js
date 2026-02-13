// ==========================================
// SECTOR PARTICIPATION SERVICE
// ROLE: Measure how many sectors are participating
// NOTE: Context only (NO BUY / SELL decision)
// ==========================================

/**
 * analyzeSectorParticipation
 * @param {Array} sectors
 * @returns {Object}
 *
 * Each sector item:
 * - sector (string)
 * - changePercent (number)
 * - volumeRatio (number)
 */
function analyzeSectorParticipation(sectors = []) {
  if (!Array.isArray(sectors) || sectors.length === 0) {
    return {
      participation: "UNKNOWN",
      activeSectors: 0,
      totalSectors: 0,
    };
  }

  const totalSectors = sectors.length;

  // -----------------------------
  // ACTIVE SECTOR RULE (LOCKED)
  // -----------------------------
  const activeSectors = sectors.filter((s) => {
    const change = Number(s.changePercent || 0);
    const volumeRatio = Number(s.volumeRatio || 0);

    const priceActive = Math.abs(change) >= 0.3;   // ±0.3%
    const volumeActive = volumeRatio >= 1.2;

    return priceActive && volumeActive;
  }).length;

  const participationRatio = activeSectors / totalSectors;

  // -----------------------------
  // PARTICIPATION VERDICT
  // -----------------------------
  let participation = "WEAK";
  if (participationRatio >= 0.6) {
    participation = "STRONG";
  } else if (participationRatio >= 0.3) {
    participation = "PARTIAL";
  }

  return {
    participation,
    activeSectors,
    totalSectors,
  };
}

module.exports = {
  analyzeSectorParticipation,
};
