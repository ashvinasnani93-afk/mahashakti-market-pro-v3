// ==========================================
// ANGEL AUTH SERVICE - PRODUCTION GRADE
// Handles Angel One Login & Token Refresh
// ==========================================

const axios = require("axios");
const { authenticator } = require("otplib");
const { BASE_URL, ENDPOINTS, HEADERS, TIMEOUT } = require("../../config/angel.config");

// ==========================================
// LOGIN WITH PASSWORD + TOTP
// ==========================================
async function loginWithPassword({ clientCode, password, totpSecret, apiKey }) {
  try {
    console.log("[AUTH] Logging into Angel One...");
    console.log(`[AUTH] Client Code: ${clientCode}`);

    if (!clientCode || !password || !totpSecret || !apiKey) {
      return {
        success: false,
        error: "Missing login parameters"
      };
    }

    // Generate TOTP
    const totp = authenticator.generate(totpSecret);
    console.log(`[AUTH] TOTP generated: ${totp}`);

    const payload = {
      clientcode: clientCode,
      password: password,
      totp: totp
    };

    const headers = {
      "Content-Type": HEADERS.CONTENT_TYPE,
      "Accept": HEADERS.ACCEPT,
      "X-UserType": HEADERS.USER_TYPE,
      "X-SourceID": HEADERS.SOURCE_ID,
      "X-ClientLocalIP": HEADERS.CLIENT_LOCAL_IP,
      "X-ClientPublicIP": HEADERS.CLIENT_PUBLIC_IP,
      "X-MACAddress": HEADERS.MAC_ADDRESS,
      "X-PrivateKey": apiKey
    };

    const url = `${BASE_URL}${ENDPOINTS.LOGIN}`;

    const response = await axios.post(url, payload, {
      headers,
      timeout: TIMEOUT.API
    });

    const data = response.data;

    if (data.status === true && data.data) {
      const jwtToken = data.data.jwtToken;
      const refreshToken = data.data.refreshToken;
      const feedToken = data.data.feedToken;

      console.log("[AUTH] Angel One Login SUCCESS");
      console.log("[AUTH] JWT Token:", jwtToken ? "SET" : "MISSING");
      console.log("[AUTH] Feed Token:", feedToken ? "SET" : "MISSING");

      // Store in global session
      global.angelSession = {
        jwtToken,
        refreshToken,
        feedToken,
        apiKey,
        clientCode,
        isLoggedIn: true,
        wsConnected: false
      };

      return {
        success: true,
        jwtToken,
        refreshToken,
        feedToken,
        clientCode
      };
    }

    console.error("[AUTH] Login failed:", data.message);

    return {
      success: false,
      error: data.message || "Angel login failed"
    };

  } catch (err) {
    console.error("[AUTH] Login error:", err.message);
    
    return {
      success: false,
      error: err.response?.data?.message || err.message || "Angel login error"
    };
  }
}

// ==========================================
// GENERATE NEW TOKEN USING REFRESH TOKEN
// ==========================================
async function generateToken(refreshToken, apiKey) {
  try {
    console.log("[AUTH] Refreshing JWT token...");

    if (!refreshToken || !apiKey) {
      return {
        success: false,
        error: "Missing refresh token or API key"
      };
    }

    const payload = {
      refreshToken: refreshToken
    };

    const headers = {
      "Content-Type": HEADERS.CONTENT_TYPE,
      "Accept": HEADERS.ACCEPT,
      "X-UserType": HEADERS.USER_TYPE,
      "X-SourceID": HEADERS.SOURCE_ID,
      "X-ClientLocalIP": HEADERS.CLIENT_LOCAL_IP,
      "X-ClientPublicIP": HEADERS.CLIENT_PUBLIC_IP,
      "X-MACAddress": HEADERS.MAC_ADDRESS,
      "X-PrivateKey": apiKey
    };

    const url = `${BASE_URL}${ENDPOINTS.GENERATE_TOKEN}`;

    const response = await axios.post(url, payload, {
      headers,
      timeout: TIMEOUT.API
    });

    const data = response.data;

    if (data.status === true && data.data) {
      console.log("[AUTH] Token refreshed successfully");

      // Update global session
      if (global.angelSession) {
        global.angelSession.jwtToken = data.data.jwtToken;
        global.angelSession.refreshToken = data.data.refreshToken;
        global.angelSession.feedToken = data.data.feedToken;
      }

      return {
        success: true,
        jwtToken: data.data.jwtToken,
        refreshToken: data.data.refreshToken,
        feedToken: data.data.feedToken
      };
    }

    console.error("[AUTH] Token refresh failed:", data.message);

    return {
      success: false,
      error: data.message || "Token refresh failed"
    };

  } catch (err) {
    console.error("[AUTH] Token refresh error:", err.message);
    
    return {
      success: false,
      error: err.response?.data?.message || err.message || "Token refresh error"
    };
  }
}

module.exports = {
  loginWithPassword,
  generateToken
};
