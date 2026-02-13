// ==================================================
// MAHASHAKTI RATE LIMIT ENGINE
// COMPATIBLE WITH signal.api.js
// OBJECT BASED + SYMBOL + TRADETYPE + DEV MODE
// ==================================================

const requestMap = new Map();

// CONFIG
const LIMIT = 20;
const WINDOW_MS = 60 * 1000; // 1 minute

function checkRateLimit({ ip = "unknown", symbol = "UNKNOWN", tradeType = "INTRADAY" }) {
  const DEV_MODE = process.env.DEV_MODE === "true";
  const FOUNDER_IP = process.env.FOUNDER_IP || "";

  const key = `${ip}:${symbol}:${tradeType}`;
  const now = Date.now();

  // 👑 FOUNDER BYPASS
  if (FOUNDER_IP && ip === FOUNDER_IP) {
    return {
      allowed: true,
      reason: "Founder bypass"
    };
  }

  // 👨‍💻 DEV MODE BYPASS
  if (DEV_MODE) {
    return {
      allowed: true,
      reason: "Dev mode"
    };
  }

  // INIT
  if (!requestMap.has(key)) {
    requestMap.set(key, []);
  }

  // FILTER WINDOW
  const timestamps = requestMap
    .get(key)
    .filter(ts => now - ts < WINDOW_MS);

  timestamps.push(now);
  requestMap.set(key, timestamps);

  // LIMIT HIT
  if (timestamps.length > LIMIT) {
    return {
      allowed: false,
      reason: `Rate limit hit (${LIMIT}/min per symbol)`
    };
  }

  return {
    allowed: true
  };
}

module.exports = {
  checkRateLimit
};
