// ==========================================
// CHAT FORMATTER (TEXT + SYMBOLS ONLY)
// ROLE: Convert engine output to user-friendly chat
// ==========================================

function formatSignalMessage(data = {}) {
  const {
    symbol,
    signal,
    momentumActive,
    institutionalTag,
  } = data;

  const signalMap = {
    BUY: "🟢",
    SELL: "🔴",
    WAIT: "🟡",
    STRONG_BUY: "🟢🔥",
    STRONG_SELL: "🔴🔥",
  };

  const signalIcon = signalMap[signal] || "🟡";

  const momentumText = momentumActive
    ? "⚡ Momentum Active"
    : "⏳ No momentum";

  let institutionalText = "🏦 Institutions: Neutral";
  if (institutionalTag === "SUPPORTIVE") {
    institutionalText = "🏦 Institutions: Supportive";
  } else if (institutionalTag === "AGAINST") {
    institutionalText = "🏦 Institutions: Against";
  }

  return {
    symbol,
    signal,
    display: `${signalIcon} ${signal}`,
    lines: [
      momentumText,
      institutionalText,
    ],
  };
}

module.exports = {
  formatSignalMessage,
};
