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
        optionChain: '/rest/secure/angelbroking/market/v1/optionChain',
        wsUrl: 'wss://smartapisocket.angelone.in/smart-stream'
    },
    
    exchanges: {
        NSE: 1,
        NFO: 2,
        BSE: 3,
        MCX: 5
    },
    
    exchangeNames: {
        1: 'NSE',
        2: 'NFO',
        3: 'BSE',
        5: 'MCX'
    },
    
    tokenModes: {
        LTP: 1,
        QUOTE: 2,
        SNAP_QUOTE: 3
    },
    
    intervals: {
        ONE_MINUTE: 'ONE_MINUTE',
        THREE_MINUTE: 'THREE_MINUTE',
        FIVE_MINUTE: 'FIVE_MINUTE',
        TEN_MINUTE: 'TEN_MINUTE',
        FIFTEEN_MINUTE: 'FIFTEEN_MINUTE',
        THIRTY_MINUTE: 'THIRTY_MINUTE',
        ONE_HOUR: 'ONE_HOUR',
        ONE_DAY: 'ONE_DAY'
    }
};
