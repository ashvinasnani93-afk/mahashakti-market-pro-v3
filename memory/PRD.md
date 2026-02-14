# MAHASHAKTI V3 - Production Stock Market Analysis Backend

## Original Problem Statement
Build a high-performance, production-grade backend system for stock market analysis and signal generation. No frontend required.

## Core Requirements
- Production-stable, institutional-grade, modular architecture
- Scan entire market (NSE EQ stocks, F&O contracts) dynamically from Angel One instrument master
- Generate only actionable signals (STRONG BUY, BUY, SELL, STRONG SELL) - NO "WAIT" signals
- Strict and configurable signal logic with dynamic tightening
- Sophisticated Runner Engine for 15-20% stock detection
- Adaptive Strike Range Engine based on market volatility (VIX/ATR)
- Robust WebSocket management with priority buckets (max 50 subscriptions)
- CPU load protection (75% warning, 90% critical)
- All data in-memory - No database
- Detailed logging for debugging

## Architecture

### Tech Stack
- **Runtime:** Node.js
- **Framework:** Express.js
- **Data Source:** Angel One SmartAPI (REST + WebSocket) + OpenAPI Master JSON
- **Data Storage:** In-memory caching only
- **Deployment Target:** Railway

### File Structure (39 Files)
```
/app/
├── server.js
├── package.json, .env, railway.toml
├── config/
│   ├── angel.config.js
│   ├── instruments.config.js
│   └── settings.config.js
├── routes/
│   ├── index.js
│   ├── aggregator.routes.js
│   ├── regime.routes.js
│   ├── scanner.routes.js
│   ├── signal.routes.js
│   ├── status.routes.js
│   └── system.routes.js
├── services/
│   ├── adaptiveFilter.service.js
│   ├── auth.service.js
│   ├── candle.service.js
│   ├── crossMarketContext.service.js [NEW]
│   ├── explosion.service.js
│   ├── indicator.service.js
│   ├── institutional.service.js
│   ├── marketAggregator.service.js
│   ├── marketScannerLoop.service.js
│   ├── oiIntelligence.service.js [NEW]
│   ├── orchestrator.service.js
│   ├── premiumMomentum.service.js
│   ├── ranking.service.js
│   ├── regime.service.js
│   ├── riskReward.service.js
│   ├── runnerEngine.service.js
│   ├── safety.service.js (VIX integrated)
│   ├── scanner.service.js
│   ├── signalCooldown.service.js
│   ├── strikeSelector.service.js
│   ├── strikeSweep.service.js
│   ├── systemMonitor.service.js
│   ├── universeLoader.service.js (Full market)
│   └── websocket.service.js
└── utils/
    ├── helpers.js
    └── logger.js
```

## What's Been Implemented

### Date: Feb 14, 2026 - FULL MARKET EXPANSION COMPLETE

#### 1. Universe Loader (Full Market)
- **Angel OpenAPI Master JSON** integration (214,079 instruments parsed)
- Daily refresh at 8:30 AM IST
- Memory-optimized storage
- Filter: NSE Equity, F&O Stocks, Index Options
- **Stats:**
  - NSE Equity: Dynamic
  - F&O Stocks: 225
  - Index Options: 7,730
    - NIFTY: 1,638
    - BANKNIFTY: 882
    - FINNIFTY: 484
    - MIDCPNIFTY: 702
    - SENSEX: 4,024
  - Total: ~8,000 instruments

#### 2. OI Intelligence Layer (oiIntelligence.service.js)
- Real OI delta acceleration tracking
- Long/Short buildup detection:
  - LONG_BUILDUP: Price ↑ + OI ↑
  - SHORT_BUILDUP: Price ↓ + OI ↑
  - SHORT_COVERING: Price ↑ + OI ↓
  - LONG_UNWINDING: Price ↓ + OI ↓
- PCR (Put-Call Ratio) monitoring:
  - Index level (NIFTY/BANKNIFTY/FINNIFTY)
  - Expiry-wise tracking
  - Trend shift detection
- Buildup strength scoring (1-10)

#### 3. Cross-Market Context Engine (crossMarketContext.service.js)
- Index bias weight calculation
- Sector leadership scoring
- Signal upgrade/downgrade logic:
  - Index trend opposite → DOWNGRADE
  - Strong sector leadership → UPGRADE
- Context weight: Max 20% influence (never overrides breakout)
- Real-time index tracking: NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY

#### 4. VIX Safety Integration (safety.service.js)
- India VIX monitoring (NSE Token: 99926004)
- VIX Levels:
  - LOW (<12): Tight premium ₹3-₹400
  - NORMAL (12-18): Standard ₹3-₹650
  - ELEVATED (18-25): Wider ₹5-₹800
  - HIGH (25-35): Wide ₹10-₹1,200
  - EXTREME (>35): Very wide ₹15-₹1,500
- Safety layer only - Does NOT influence breakout logic
- High VIX → Reduce STRONG signals frequency

#### 5. Previous Features (Still Active)
- 7-Point Enhancement (Complete)
- Adaptive Strike Range Engine
- Runner Engine (4/5 Strict Mode)
- WebSocket Priority Buckets (50 max)
- CPU Protection System
- Signal Cooldown

## Key API Endpoints

### System APIs
| Endpoint | Description |
|----------|-------------|
| GET /api/system/universe | Universe stats |
| GET /api/system/health | CPU/Memory/Status |
| GET /api/system/vix | VIX data & premium bands |
| GET /api/system/context | Market bias & sector leadership |
| GET /api/system/oi/stats | OI Intelligence stats |
| GET /api/system/oi/pcr | All PCR data |
| GET /api/system/oi/pcr/:index | PCR for specific index |
| GET /api/system/oi/buildups | Top buildup signals |
| GET /api/system/options/:index | ATM options for index |
| GET /api/system/expiries | Expiry information |
| GET /api/system/context/sectors | Sector ranking |

### Scanner APIs
| Endpoint | Description |
|----------|-------------|
| GET /api/scanner/results | Scan results |
| GET /api/scanner/explosions | Explosion events |
| GET /api/signal/active | Active signals |
| GET /api/aggregator/market-view | Market view |
| GET /api/aggregator/top-runners | Top 10 runners |

## Test Results

### Scale Simulation (Feb 14, 2026)
- ✅ AUTH: Login successful
- ✅ UNIVERSE: 7,965 instruments (Target: 800+)
- ✅ ATM_OPTIONS: NIFTY 30, BANKNIFTY 4
- ✅ OI_INTELLIGENCE: Working
- ✅ CROSS_MARKET: Working
- ✅ VIX_SAFETY: All levels handled
- ✅ WS_LIMIT: 50/50 enforced
- ✅ MEMORY: 133MB RSS

## Signal Types
- **STRONG_BUY**: Volume ≥2x + R:R ≥1.8 + 2/3 optional
- **BUY**: Basic breakout + volume ≥1.5x + 2/3 optional
- **SELL**: Bearish breakout + volume ≥1.5x
- **STRONG_SELL**: Volume ≥2x + R:R ≥1.8 + 2/3 optional
- **NO WAIT SIGNALS**

## Hard Constraints
- No WAIT signals
- No more than 50 WS subscriptions
- Memory under 200MB RSS
- No MongoDB
- No hardcoded strike ranges
- No blocking sync loops

## Credentials (in .env)
- ANGEL_API_KEY: EU6E48uY
- ANGEL_CLIENT_ID: A819201
- ANGEL_PASSWORD: 2310
- ANGEL_TOTP_SECRET: IOS2NLBN2NORL3K6KQ26TXCINY

## Backlog / Future Tasks
1. **P1:** Live market proof test during trading hours
2. **P1:** Railway deployment
3. **P2:** GitHub push
4. **P2:** NSE Equity filter optimization (currently low count)
5. **P3:** Stock-level OI tracking (if needed)
