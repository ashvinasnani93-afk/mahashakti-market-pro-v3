require('dotenv').config();

module.exports = {
    apiKey: process.env.ANGEL_API_KEY,
    clientId: process.env.ANGEL_CLIENT_ID,
    password: process.env.ANGEL_PASSWORD,
    totpSecret: process.env.ANGEL_TOTP_SECRET,
    
    endpoints: {
        base: 'https://apiconnect.angelone.in',
        login: '/rest/auth/angelbroking/user/v1/loginByPassword',
        profile: '/rest/secure/angelbroking/user/v1/getProfile',
        candle: '/rest/secure/angelbroking/historical/v1/getCandleData',
        ltp: '/rest/secure/angelbroking/market/v1/getLTPData',
        wsUrl: 'wss://smartapisocket.angelone.in/smart-stream'
    },
    
    exchanges: {
        NSE: 1,
        NFO: 2,
        BSE: 3,
        MCX: 5
    },
    
    tokenModes: {
        LTP: 1,
        QUOTE: 2,
        SNAP_QUOTE: 3
    }
};
