# Mahashakti Market Pro Backend

## Institutional Sniper Engine for Indian Markets

### Features

1. **Full Market Coverage**
   - NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX
   - All F&O stocks
   - High liquidity cash stocks
   - Commodities (Gold, Silver, Crude, NG)
   - Index & Stock Options

2. **Screen 1 - Universal Signals**
   - STRONG_BUY
   - BUY
   - STRONG_SELL
   - SELL
   - NO WAIT signals - only actionable

3. **Screen 2 - Explosion Engine**
   - EARLY_EXPANSION (1.5-2% moves)
   - HIGH_MOMENTUM_RUNNER (15-20% runners)
   - OPTION_ACCELERATION (Premium/OI spikes)
   - SWING_CONTINUATION (Daily breakouts)

4. **WebSocket Management**
   - Max 50 subscriptions
   - Exponential backoff (10→20→40→80)
   - No 429 errors
   - Core indices always subscribed
   - Stability logging

5. **Real Indicators (No shortcuts)**
   - EMA 20/50 (proper formula)
   - RSI 14 (Wilder's smoothing)
   - ATR 14 (True Range)
   - Volume average (20 candle)

### API Endpoints

```
GET /                       - Service info
GET /health                 - Health check
GET /api/status             - Full system status

# Scanner
GET /api/scanner/results    - All scan results
GET /api/scanner/universal  - Screen 1 signals
GET /api/scanner/explosions - Screen 2 signals
POST /api/scanner/run       - Trigger manual scan
GET /api/scanner/symbol/:s  - Scan single symbol

# Signal
GET /api/signal?symbol=NIFTY - Get signal for symbol
POST /api/signal            - Get signal from data

# Status
GET /api/status/ws          - WebSocket status
GET /api/status/ws-stability - 1hr stability log
GET /api/status/ltp         - LTP cache
GET /api/status/master      - Symbol master stats
```

### Environment Variables

```
PORT=8080
MONGO_URL=mongodb://...
DB_NAME=mahashakti

ANGEL_API_KEY=your_key
ANGEL_CLIENT_ID=your_id
ANGEL_PASSWORD=your_password
ANGEL_TOTP_SECRET=your_totp_secret
```

### Railway Deployment

1. Push to GitHub
2. Connect Railway to repo
3. Set environment variables
4. Deploy

### Live Proof Requirements

1. `/api/status` - wsConnected: true, subscriptionCount <= 50
2. `/api/scanner/results` - Actionable signals only
3. 3 live signals (1 STRONG_BUY, 1 BUY, 1 SELL)
4. 1 explosion proof
5. 1 hour WS stability log (no 429, no reconnect storm)
