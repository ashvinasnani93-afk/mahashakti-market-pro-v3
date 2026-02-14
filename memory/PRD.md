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
- **Data Source:** Angel One SmartAPI (REST + WebSocket)
- **Data Storage:** In-memory caching only
- **Deployment Target:** Railway

### File Structure (36 Files)
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
│   └── system.routes.js [NEW]
├── services/
│   ├── adaptiveFilter.service.js [NEW]
│   ├── auth.service.js
│   ├── candle.service.js
│   ├── explosion.service.js
│   ├── indicator.service.js
│   ├── institutional.service.js
│   ├── marketAggregator.service.js
│   ├── marketScannerLoop.service.js
│   ├── orchestrator.service.js
│   ├── premiumMomentum.service.js
│   ├── ranking.service.js
│   ├── regime.service.js
│   ├── riskReward.service.js
│   ├── runnerEngine.service.js
│   ├── safety.service.js
│   ├── scanner.service.js
│   ├── signalCooldown.service.js
│   ├── strikeSelector.service.js
│   ├── strikeSweep.service.js
│   ├── systemMonitor.service.js [NEW]
│   ├── universeLoader.service.js [NEW]
│   └── websocket.service.js
└── utils/
    ├── helpers.js
    └── logger.js
```

## What's Been Implemented

### Date: Feb 14, 2026 - 7-Point Enhancement COMPLETED

#### 1. Universe Loader (universeLoader.service.js)
- Dynamic NSE EQ + F&O instrument loading
- Fallback to 96 NSE + 50 F&O stocks when API unavailable
- Auto-refresh scheduled at 8:45 AM
- Sector classification included

#### 2. Adaptive Strike Range Engine (strikeSweep.service.js)
- `getDynamicPremiumRange()` replaces hardcoded values
- Premium bands: LOW (₹3-₹400), MEDIUM (₹3-₹650), HIGH (₹3-₹1200)
- Volatility detection via ATR% and India VIX
- `filterByPremium()` now uses dynamic range

#### 3. Adaptive Breakout Filter (adaptiveFilter.service.js)
- Dynamic volume/RSI/ATR thresholds
- Auto-tighten when candidates >20%
- Auto-reset after 5 consecutive low-candidate scans
- Integrated into orchestrator.service.js

#### 4. Runner Engine STRICT MODE (runnerEngine.service.js)
- 4/5 validation rule:
  - Price move ≥1.5% in 15 mins
  - Volume ≥3x
  - Sector ≥60 percentile
  - ATR expanding
  - Liquidity ≥50k avg volume
- `runnerScore` calculation and exposure
- Top 10 runners only exposed

#### 5. WebSocket Priority Structure (websocket.service.js)
- CORE: Indices only (never unsubscribed)
- ACTIVE: Top 20 momentum stocks
- EXPLOSION: Top 10 explosion strikes
- ROTATION: Remaining stocks
- Hard limit: 50 max subscriptions
- Auto-rotate every 120 seconds
- `enableCoreOnlyMode()` / `disableCoreOnlyMode()` for CPU protection

#### 6. CPU Protection System (systemMonitor.service.js)
- CPU monitoring every 5 seconds
- Log status every 60 seconds
- CPU >75%: Reduced scan mode (15s interval)
- CPU >90%: Core-only mode
- Memory threshold: 120MB warning, 150MB critical
- Event loop lag monitoring

#### 7. System Routes (system.routes.js)
- GET /api/system/health - System health with CPU/Memory
- GET /api/system/universe - Universe stats
- POST /api/system/refresh-universe - Manual refresh
- GET /api/system/instruments - List all instruments

## Key API Endpoints
| Endpoint | Description |
|----------|-------------|
| GET /api/status | Full system status |
| GET /api/system/health | CPU/Memory/Status |
| GET /api/system/universe | Universe stats |
| GET /api/system/instruments | Instrument list |
| GET /api/scanner/results | Scan results |
| GET /api/scanner/explosions | Explosion events |
| GET /api/signal/active | Active signals |
| GET /api/aggregator/market-view | Market view |
| GET /api/aggregator/top-runners | Top 10 runners |

## Signal Types
- **STRONG_BUY**: Volume ≥2x + R:R ≥1.8 + 2/3 optional (RSI 58-72, ADX ≥20, Trend aligned)
- **BUY**: Basic breakout + volume ≥1.5x + 2/3 optional conditions
- **SELL**: Bearish breakout + volume ≥1.5x
- **STRONG_SELL**: Volume ≥2x + R:R ≥1.8 + 2/3 optional (RSI 28-42, ADX ≥20, Trend aligned)
- **NO WAIT SIGNALS**

## Test Results
### Sanity Check (Feb 14, 2026)
- ✅ Boot: Clean, no crash
- ✅ 2-min runtime: Stable
- ✅ Memory: 73MB < 150MB limit
- ✅ WebSocket: 4/50 subscriptions
- ✅ CPU: 4-5% (NORMAL)
- ✅ Universe: 150 instruments loaded
- ✅ No undefined errors
- ✅ No memory leak

## Credentials (in .env)
- ANGEL_API_KEY: EU6E48uY
- ANGEL_CLIENT_ID: A819201
- ANGEL_PASSWORD: 2310
- ANGEL_TOTP_SECRET: IOS2NLBN2NORL3K6KQ26TXCINY

## Backlog / Future Tasks
1. **P1:** Railway deployment
2. **P1:** Live market proof test
3. **P2:** GitHub push
4. **P2:** Index options loading from API
5. **P3:** More sector classifications
