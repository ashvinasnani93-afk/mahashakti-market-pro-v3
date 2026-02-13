# MAHASHAKTI V3 - Production Sniper Backend

High-performance backend system for stock market analysis and signal generation.

## Features

### Signal Engine
- EMA 20/50 (closed candles only)
- RSI 14
- Volume confirmation (>1.5x avg)
- Breakout close confirmation
- Risk-Reward calculation
- Higher timeframe filter
- Institutional layer detection
- Safety layer final gate
- Outputs: STRONG_BUY, BUY, SELL, STRONG_SELL

### Explosion Engine
- Early 1.5% intraday move detection
- Price acceleration logic
- Volume acceleration (>3x)
- Option strike acceleration
- OI + Price delta combo
- Liquidity filter

### WebSocket
- Max 50 subscriptions
- Singleton guard
- 429 rate limit protection
- Exponential backoff
- No reconnect storms

## Setup

1. Create `.env` file:
```
ANGEL_API_KEY=your_api_key
ANGEL_CLIENT_ID=your_client_id
ANGEL_PASSWORD=your_password
ANGEL_TOTP_SECRET=your_totp_secret
PORT=8080
```

2. Install dependencies:
```bash
npm install
```

3. Start server:
```bash
npm start
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api` | GET | API info |
| `/api/status` | GET | System status |
| `/api/status/health` | GET | Health check |
| `/api/scanner/results` | GET | Active signals |
| `/api/scanner/explosions` | GET | Explosion events |
| `/api/scanner/watchlist` | GET | Watchlist instruments |
| `/api/scanner/start` | POST | Start scanner |
| `/api/scanner/stop` | POST | Stop scanner |
| `/api/signal/history` | GET | Signal history |
| `/api/signal/analyze/:symbol` | GET | Analyze specific symbol |

## Query Parameters

### Scanner Results
- `type`: Filter by signal type (STRONG_BUY, BUY, SELL, STRONG_SELL)
- `minStrength`: Minimum signal strength

### Explosions
- `minutes`: Time window in minutes (default: 30)

### Signal History
- `token`: Filter by instrument token
- `limit`: Maximum results

## Railway Deployment

```bash
railway login
railway init
railway up
```

## Architecture

```
/
├── server.js           # Entry point
├── package.json        # Dependencies
├── config/
│   ├── angel.config.js     # Angel API config
│   └── instruments.config.js # Watchlist
├── services/
│   ├── auth.service.js      # Authentication
│   ├── candle.service.js    # Historical data
│   ├── websocket.service.js # Live data
│   ├── indicator.service.js # Technical indicators
│   ├── signal.service.js    # Signal generation
│   ├── explosion.service.js # Explosion detection
│   └── scanner.service.js   # Market scanner
├── routes/
│   ├── index.js           # Route aggregator
│   ├── status.routes.js   # Status endpoints
│   ├── scanner.routes.js  # Scanner endpoints
│   └── signal.routes.js   # Signal endpoints
└── utils/
    ├── helpers.js         # Utility functions
    └── logger.js          # Logging utility
```

## License

ISC
