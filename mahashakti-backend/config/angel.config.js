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
    CLIENT_PUBLIC_IP: "127.0.0.1",
    MAC_ADDRESS: "00:00:00:00:00:00"
  },

  // Angel Master URLs
  MASTER_URL:
    "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json",

  // Indices Token Mapping
  INDEX_TOKENS: {
    NIFTY: "99926000",
    BANKNIFTY: "99926009",
    FINNIFTY: "99926037",
    MIDCPNIFTY: "99926074"
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

  // Order Types
  ORDER_TYPE: {
    MARKET: "MARKET",
    LIMIT: "LIMIT",
    STOPLOSS_LIMIT: "STOPLOSS_LIMIT",
    STOPLOSS_MARKET: "STOPLOSS_MARKET"
  },

  // Product Types
  PRODUCT_TYPE: {
    DELIVERY: "DELIVERY",
    CARRYFORWARD: "CARRYFORWARD",
    MARGIN: "MARGIN",
    INTRADAY: "INTRADAY",
    BO: "BO"
  },

  // Transaction Types
  TRANSACTION_TYPE: {
    BUY: "BUY",
    SELL: "SELL"
  },

  // Timeouts
  TIMEOUT: {
    API: 15000,
    WS_HEARTBEAT: 25000,
    WS_RECONNECT: 5000
  }
};
