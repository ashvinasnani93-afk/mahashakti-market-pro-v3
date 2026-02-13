// ==========================================
// ANGEL ONE CONFIGURATION
// Official Angel One API endpoints and constants
// ==========================================

module.exports = {
  // Base URLs
  BASE_URL: "https://apiconnect.angelone.in",
  WS_URL: "wss://smartapisocket.angelone.in/smart-stream",

  // API Endpoints
  ENDPOINTS: {
    LOGIN: "/rest/auth/angelbroking/user/v1/loginByPassword",
    GENERATE_TOKEN: "/rest/auth/angelbroking/jwt/v1/generateTokens",
    PROFILE: "/rest/secure/angelbroking/user/v1/getProfile",
    LOGOUT: "/rest/secure/angelbroking/user/v1/logout",
    RMS: "/rest/secure/angelbroking/user/v1/getRMS",
    LTP: "/rest/secure/angelbroking/order/v1/getLtpData",
    HISTORICAL: "/rest/secure/angelbroking/historical/v1/getCandleData",
    ORDER_BOOK: "/rest/secure/angelbroking/order/v1/getOrderBook",
    TRADE_BOOK: "/rest/secure/angelbroking/order/v1/getTradeBook",
    PLACE_ORDER: "/rest/secure/angelbroking/order/v1/placeOrder"
  },

  // Headers (Angel Mandatory Headers)
  HEADERS: {
    CONTENT_TYPE: "application/json",
    ACCEPT: "application/json",
    USER_TYPE: "USER",
    SOURCE_ID: "WEB",
    CLIENT_LOCAL_IP: "127.0.0.1",
    CLIENT_PUBLIC_IP: "106.51.71.158",
    MAC_ADDRESS: "00:00:00:00:00:00"
  },

  // Angel Master URLs
  MASTER_URL: "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json",

  // Indices Token Mapping (for WebSocket)
  INDEX_TOKENS: {
    NIFTY: { token: "26000", exchangeType: 1, symbol: "NIFTY 50" },
    BANKNIFTY: { token: "26009", exchangeType: 1, symbol: "NIFTY BANK" },
    FINNIFTY: { token: "26037", exchangeType: 1, symbol: "NIFTY FIN SERVICE" },
    MIDCPNIFTY: { token: "26074", exchangeType: 1, symbol: "NIFTY MID SELECT" },
    SENSEX: { token: "1", exchangeType: 3, symbol: "SENSEX" }
  },

  // Historical candle tokens (different from WS)
  HISTORICAL_TOKENS: {
    NIFTY: { exchange: "NSE", symboltoken: "99926000", name: "Nifty 50" },
    BANKNIFTY: { exchange: "NSE", symboltoken: "99926009", name: "Nifty Bank" },
    FINNIFTY: { exchange: "NSE", symboltoken: "99926037", name: "Nifty Fin Service" },
    MIDCPNIFTY: { exchange: "NSE", symboltoken: "99926074", name: "NIFTY MID SELECT" },
    SENSEX: { exchange: "BSE", symboltoken: "99919000", name: "SENSEX" }
  },

  // Commodity Tokens
  COMMODITY_TOKENS: {
    GOLD: { token: "424629", exchangeType: 5, symbol: "GOLD" },
    GOLDM: { token: "424630", exchangeType: 5, symbol: "GOLDM" },
    SILVER: { token: "424631", exchangeType: 5, symbol: "SILVER" },
    SILVERM: { token: "424632", exchangeType: 5, symbol: "SILVERM" },
    CRUDEOIL: { token: "424633", exchangeType: 5, symbol: "CRUDEOIL" },
    NATURALGAS: { token: "424634", exchangeType: 5, symbol: "NATURALGAS" }
  },

  // Exchange Types
  EXCHANGE_TYPE: {
    NSE: 1,
    NFO: 2,
    BSE: 3,
    BFO: 4,
    MCX: 5,
    CDS: 7
  },

  // Valid Intervals for Historical API
  VALID_INTERVALS: {
    "ONE_MINUTE": { maxDays: 30 },
    "THREE_MINUTE": { maxDays: 60 },
    "FIVE_MINUTE": { maxDays: 90 },
    "TEN_MINUTE": { maxDays: 90 },
    "FIFTEEN_MINUTE": { maxDays: 180 },
    "THIRTY_MINUTE": { maxDays: 180 },
    "ONE_HOUR": { maxDays: 365 },
    "ONE_DAY": { maxDays: 2000 }
  },

  // Timeouts
  TIMEOUT: {
    API: 15000,
    WS_HEARTBEAT: 25000,
    WS_RECONNECT: 10000
  }
};
