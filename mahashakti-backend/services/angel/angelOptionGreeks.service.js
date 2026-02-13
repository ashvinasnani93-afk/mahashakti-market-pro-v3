// ==========================================
// ANGEL ONE OPTION GREEKS API SERVICE
// Fetch complete option chain with LTP data
// ENTERPRISE SAFE VERSION
// ==========================================

const axios = require("axios");

// Use environment variable (Enterprise Safe)
const BASE_URL =
  process.env.ANGEL_BASE_URL || "https://apiconnect.angelone.in";

// ==========================================
// GET OPTION GREEKS (Complete Option Chain)
// ==========================================
async function getOptionGreeks(name, expiryDate) {
  try {
    // Get tokens from global session
    const jwtToken = global.angelSession?.jwtToken;
    const apiKey =
      global.angelSession?.apiKey || process.env.ANGEL_API_KEY;

    if (!jwtToken || !apiKey) {
      return {
        success: false,
        error: "Angel authentication not available",
      };
    }

    // Format expiry date: DDMMMYYYY (e.g., "10FEB2026")
    const formattedExpiry = formatExpiryDate(expiryDate);

    if (!formattedExpiry) {
      return {
        success: false,
        error: "Invalid expiry date",
      };
    }

    const payload = {
      name: name.toUpperCase(),
      expirydate: formattedExpiry,
    };

    console.log(
      `[GREEKS] Fetching option chain: ${name} expiry=${formattedExpiry}`
    );

    // Enterprise Clean Headers (No Hardcoded IP / MAC)
    const headers = {
      Authorization: `Bearer ${jwtToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-UserType": "USER",
      "X-SourceID": "WEB",
      "X-PrivateKey": apiKey,
    };

    const response = await axios.post(
      `${BASE_URL}/rest/secure/angelbroking/marketData/v1/optionGreek`,
      payload,
      {
        headers,
        timeout: 20000,
      }
    );

    if (response.data && response.data.status === true) {
      console.log(`[GREEKS] ✅ Success! Received option chain data`);

      return {
        success: true,
        data: response.data.data,
      };
    }

    console.log(`[GREEKS] ❌ Failed:`, response.data?.message);

    return {
      success: false,
      error: response.data?.message || "Option Greeks fetch failed",
    };
  } catch (err) {
    console.error("[GREEKS] ❌ Error:", err.message);

    return {
      success: false,
      error: err.response?.data?.message || err.message,
    };
  }
}

// ==========================================
// FORMAT EXPIRY DATE TO DDMMMYYYY
// Input: "2026-02-10" or Date object
// Output: "10FEB2026"
// ==========================================
function formatExpiryDate(dateInput) {
  try {
    const date =
      typeof dateInput === "string"
        ? new Date(dateInput)
        : dateInput;

    if (!date || isNaN(date.getTime())) {
      return null;
    }

    const day = String(date.getDate()).padStart(2, "0");
    const monthNames = [
      "JAN",
      "FEB",
      "MAR",
      "APR",
      "MAY",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OCT",
      "NOV",
      "DEC",
    ];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();

    return `${day}${month}${year}`;
  } catch (err) {
    console.error("[GREEKS] Date format error:", err.message);
    return null;
  }
}

module.exports = {
  getOptionGreeks,
  formatExpiryDate,
};
