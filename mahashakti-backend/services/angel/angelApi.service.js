// ==========================================
// ANGEL API SERVICE - REST API CALLS
// LTP, Profile, Orders, etc.
// ==========================================

const axios = require("axios");
const { BASE_URL, ENDPOINTS, HEADERS, TIMEOUT } = require("../../config/angel.config");

// ==========================================
// GET HEADERS
// ==========================================
function getHeaders() {
  const session = global.angelSession || {};
  
  if (!session.jwtToken || !session.apiKey) {
    console.error("[API] Missing session tokens");
    return null;
  }
  
  return {
    "Authorization": `Bearer ${session.jwtToken}`,
    "Content-Type": HEADERS.CONTENT_TYPE,
    "Accept": HEADERS.ACCEPT,
    "X-UserType": HEADERS.USER_TYPE,
    "X-SourceID": HEADERS.SOURCE_ID,
    "X-ClientLocalIP": HEADERS.CLIENT_LOCAL_IP,
    "X-ClientPublicIP": HEADERS.CLIENT_PUBLIC_IP,
    "X-MACAddress": HEADERS.MAC_ADDRESS,
    "X-PrivateKey": session.apiKey
  };
}

// ==========================================
// GET LTP DATA
// ==========================================
async function getLtpData(exchange, tradingSymbol, symbolToken) {
  try {
    const headers = getHeaders();
    if (!headers) {
      return { success: false, error: "Session not available" };
    }

    const payload = {
      exchange: exchange,
      tradingsymbol: tradingSymbol,
      symboltoken: symbolToken
    };

    const url = `${BASE_URL}${ENDPOINTS.LTP}`;
    
    const response = await axios.post(url, payload, {
      headers,
      timeout: TIMEOUT.API
    });

    if (response.data && response.data.status === true && response.data.data) {
      return {
        success: true,
        ltp: parseFloat(response.data.data.ltp),
        open: parseFloat(response.data.data.open || 0),
        high: parseFloat(response.data.data.high || 0),
        low: parseFloat(response.data.data.low || 0),
        close: parseFloat(response.data.data.close || 0),
        volume: parseInt(response.data.data.volume || 0)
      };
    }

    return {
      success: false,
      error: response.data?.message || "LTP fetch failed"
    };

  } catch (err) {
    console.error("[API] LTP Error:", err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

// ==========================================
// GET PROFILE
// ==========================================
async function getProfile() {
  try {
    const headers = getHeaders();
    if (!headers) {
      return { success: false, error: "Session not available" };
    }

    const url = `${BASE_URL}${ENDPOINTS.PROFILE}`;
    
    const response = await axios.get(url, {
      headers,
      timeout: TIMEOUT.API
    });

    if (response.data && response.data.status === true && response.data.data) {
      return {
        success: true,
        profile: response.data.data
      };
    }

    return {
      success: false,
      error: response.data?.message || "Profile fetch failed"
    };

  } catch (err) {
    console.error("[API] Profile Error:", err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

// ==========================================
// GET RMS (RISK MANAGEMENT)
// ==========================================
async function getRMS() {
  try {
    const headers = getHeaders();
    if (!headers) {
      return { success: false, error: "Session not available" };
    }

    const url = `${BASE_URL}${ENDPOINTS.RMS}`;
    
    const response = await axios.get(url, {
      headers,
      timeout: TIMEOUT.API
    });

    if (response.data && response.data.status === true && response.data.data) {
      return {
        success: true,
        rms: response.data.data
      };
    }

    return {
      success: false,
      error: response.data?.message || "RMS fetch failed"
    };

  } catch (err) {
    console.error("[API] RMS Error:", err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

// ==========================================
// SET GLOBAL TOKENS (For other services)
// ==========================================
function setGlobalTokens(jwtToken, apiKey, clientCode) {
  if (global.angelSession) {
    global.angelSession.jwtToken = jwtToken;
    global.angelSession.apiKey = apiKey;
    if (clientCode) global.angelSession.clientCode = clientCode;
  }
}

module.exports = {
  getLtpData,
  getProfile,
  getRMS,
  getHeaders,
  setGlobalTokens
};
