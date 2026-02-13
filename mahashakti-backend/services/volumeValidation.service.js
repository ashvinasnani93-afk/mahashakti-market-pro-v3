// ==================================================
// VOLUME VALIDATION SERVICE (FINAL – LOCKED)
// Confirms real move vs fake move
// No BUY / SELL – only validation
// ==================================================

/**
 * validateVolume
 * @param {object} data
 * @returns {object}
 *
 * Required:
 * - currentVolume
 * - averageVolume
 * - priceDirection ("UP" | "DOWN")
 */
function validateVolume(data = {}) {
  const {
    currentVolume,
    averageVolume,
    priceDirection,
  } = data;

  // -----------------------------
  // HARD VALIDATION
  // -----------------------------
  if (
    typeof currentVolume !== "number" ||
    typeof averageVolume !== "number" ||
    !priceDirection
  ) {
    return {
      valid: false,
      strength: "UNKNOWN",
      reason: "Invalid volume input",
    };
  }

  if (averageVolume === 0) {
    return {
      valid: false,
      strength: "UNKNOWN",
      reason: "Average volume unavailable",
    };
  }

  // -----------------------------
  // VOLUME RATIO
  // -----------------------------
  const volumeRatio = currentVolume / averageVolume;

  // -----------------------------
  // STRONG CONFIRMATION
  // -----------------------------
  if (volumeRatio >= 1.5) {
    return {
      valid: true,
      strength: "STRONG",
      reason:
        priceDirection === "UP"
          ? "High volume confirms aggressive buying"
          : "High volume confirms aggressive selling",
      volumeRatio: Number(volumeRatio.toFixed(2)),
    };
  }

  // -----------------------------
  // MEDIUM CONFIRMATION
  // -----------------------------
  if (volumeRatio >= 1.1) {
    return {
      valid: true,
      strength: "MEDIUM",
      reason:
        priceDirection === "UP"
          ? "Moderate volume supports price move"
          : "Moderate selling pressure present",
      volumeRatio: Number(volumeRatio.toFixed(2)),
    };
  }

  // -----------------------------
  // WEAK / FAKE MOVE
  // -----------------------------
  return {
    valid: false,
    strength: "WEAK",
    reason:
      priceDirection === "UP"
        ? "Price up on low volume – fake breakout risk"
        : "Price down on low volume – selling not convincing",
    volumeRatio: Number(volumeRatio.toFixed(2)),
  };
}

// ==================================================
// EXPORT
// ==================================================
module.exports = {
  validateVolume,
};
