# MAHASHAKTI V3 - Production Sniper Backend

Institutional-grade backend system for stock market analysis and signal generation.

## Modules

1. **Market Scanner Engine** - Full market scanning with multi-timeframe analysis
2. **Ranking Engine** - Weighted scoring system for instrument prioritization
3. **Focus WebSocket Manager** - 50 subscription limit with singleton guard
4. **Institutional Layer** - OI tracking, PCR analysis, breadth, sector rotation
5. **Market Regime Engine** - Trend, volatility, and momentum regime detection
6. **Multi Timeframe Indicator Engine** - EMA, RSI, ATR, MACD, Bollinger, ADX, Stochastic
7. **Explosion Engine** - Early move detection, volume acceleration, OI+Price combos
8. **Risk-Reward Engine** - Dynamic stop-loss and target calculation
9. **Safety Layer** - 10+ safety checks before signal generation
10. **Signal Orchestrator** - Final signal generation and management

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

### Status
- `GET /api/status` - System status
- `GET /api/status/health` - Health check

### Scanner
- `GET /api/scanner/results` - Active signals
- `GET /api/scanner/explosions` - Explosion events
- `GET /api/scanner/rankings` - Top ranked instruments
- `GET /api/scanner/rankings/bullish` - Top bullish
- `GET /api/scanner/rankings/bearish` - Top bearish
- `GET /api/scanner/instrument/:token` - Specific instrument
- `GET /api/scanner/institutional` - Institutional data
- `POST /api/scanner/start` - Start scanner
- `POST /api/scanner/stop` - Stop scanner

### Signal
- `GET /api/signal/active` - Active signals
- `GET /api/signal/history` - Signal history
- `GET /api/signal/analyze/:symbol` - Analyze symbol
- `GET /api/signal/indicators/:symbol` - Get indicators

### Regime
- `GET /api/regime/current` - Current regime
- `GET /api/regime/history` - Regime history
- `GET /api/regime/analyze/:symbol` - Analyze regime

## Signal Types

- **STRONG_BUY** - High confidence long entry (strength >= 8)
- **BUY** - Standard long entry
- **SELL** - Standard short entry
- **STRONG_SELL** - High confidence short entry (strength >= 8)

## Explosion Types

- **EARLY_INTRADAY_EXPANSION** - 1.5%+ move within 60 mins of open
- **PRICE_ACCELERATION** - 2x+ acceleration in price movement
- **VOLUME_EXPLOSION** - 3x+ average volume
- **HIGH_MOMENTUM_RUNNER** - Sustained directional movement
- **OI_PRICE_COMBO** - OI delta with price confirmation
- **OPTION_STRIKE_ACCELERATION** - Option premium expansion

## WebSocket Rules

- Maximum 50 subscriptions (hard cap)
- Singleton guard prevents multiple connections
- Exponential backoff on disconnect
- Rate limit (429) protection with cooldown
- Priority-based subscription management

## Safety Checks

1. RSI extreme levels
2. Breakout confirmation
3. Volume confirmation
4. Volatility (ATR) threshold
5. Trend alignment
6. Risk-reward ratio
7. Liquidity check
8. Regime favorability
9. Market hours
10. Overall score threshold

## Railway Deployment

```bash
railway login
railway init
railway up
```

## Architecture

```
/
├── server.js
├── package.json
├── config/
│   ├── angel.config.js
│   ├── instruments.config.js
│   └── settings.config.js
├── services/
│   ├── auth.service.js
│   ├── candle.service.js
│   ├── websocket.service.js
│   ├── indicator.service.js
│   ├── institutional.service.js
│   ├── regime.service.js
│   ├── explosion.service.js
│   ├── riskReward.service.js
│   ├── safety.service.js
│   ├── ranking.service.js
│   ├── orchestrator.service.js
│   └── scanner.service.js
├── routes/
│   ├── index.js
│   ├── status.routes.js
│   ├── scanner.routes.js
│   ├── signal.routes.js
│   └── regime.routes.js
└── utils/
    ├── helpers.js
    └── logger.js
```

## License

ISC
