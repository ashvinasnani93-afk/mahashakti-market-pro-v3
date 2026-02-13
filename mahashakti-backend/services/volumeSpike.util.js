// ==========================================
// VOLUME SPIKE UTILITY
// ROLE: Detect real participation (NO SIGNAL)
// ==========================================

/**
 * detectVolumeSpike
 * @param {Object} data
 * @returns {Object}
 *
 * Required:
 * - currentVolume
 * - avgVolume
 */
function detectVolumeSpike(data = {}) {
  const currentVolume = Number(data.currentVolume || 0);
  const avgVolume = Number(data.avgVolume || 0);

  if (avgVolume <= 0) {
    return { spike: false, ratio: 0 };
  }

  const ratio = currentVolume / avgVolume;

  if (ratio >= 2) {
    return {
      spike: true,
      ratio,
    };
  }

  return {
    spike: false,
    ratio,
  };
}

module.exports = {
  detectVolumeSpike,
};
