// services/momentumAdapter.service.js
// CONTEXT-AWARE MOMENTUM (SAFE ADAPTER)

function evaluateMomentumContext({
  trend,
  rsi,
  volume,
  avgVolume,
  breakoutAction,
  forceMomentum = false,
}) {
  // Hard safety
  if (!trend || !breakoutAction) {
    return { active: false, reason: "INSUFFICIENT_CONTEXT" };
  }

  // Force mode (testing / operator only)
  if (forceMomentum === true) {
    return { active: true, reason: "FORCED" };
  }

  // Base momentum checks (soft)
  const rsiOk =
    breakoutAction === "BUY"
      ? rsi >= 55 && rsi <= 70
      : rsi <= 45 && rsi >= 30;

  const volumeOk =
    typeof volume === "number" &&
    typeof avgVolume === "number" &&
    volume >= avgVolume * 1.2;

  if (rsiOk && volumeOk) {
    return { active: true, reason: "RSI+VOLUME" };
  }

  return { active: false, reason: "WEAK_MOMENTUM" };
}

module.exports = {
  evaluateMomentumContext,
};
