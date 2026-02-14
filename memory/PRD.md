# MAHASHAKTI V3 - Full Institutional Grade Backend

## Build Status: INSTITUTIONAL HARDENING COMPLETE ✅

## Architecture (55 Files)

### Services (28)
- `adaptiveFilter.service.js` - Adaptive breakout filters
- `auth.service.js` - Angel One authentication
- `candle.service.js` - Historical candle data
- `capitalGuard.service.js` **[NEW]** - Capital protection core
- `crossMarketContext.service.js` - Index bias + sector leadership
- `explosion.service.js` - Explosion detection
- `globalRanking.service.js` **[NEW]** - Real-time rankings (5sec update)
- `indicator.service.js` - Technical indicators
- `institutional.service.js` - Institutional activity
- `marketAggregator.service.js` - Market aggregation
- `marketScannerLoop.service.js` - Scanner loop engine
- `marketState.service.js` **[NEW]** - Centralized state store
- `oiIntelligence.service.js` - OI delta/PCR/buildup
- `orchestrator.service.js` - Signal orchestration
- `premiumMomentum.service.js` - Premium momentum
- `ranking.service.js` - Basic ranking
- `regime.service.js` **[ENHANCED]** - Day type detection
- `riskReward.service.js` - Risk/reward calculation
- `runnerEngine.service.js` **[ENHANCED]** - 4/6 validation + tier tracking
- `safety.service.js` - VIX safety layer
- `scanner.service.js` - Core scanner
- `signalCooldown.service.js` - Signal cooldown
- `strikeSelector.service.js` - Strike selection
- `strikeSweep.service.js` - Strike sweep
- `systemMonitor.service.js` - CPU/memory monitoring
- `universeLoader.service.js` - Full market universe
- `websocket.service.js` **[ENHANCED]** - 6-bucket intelligent rotation

### Routes (8)
- `aggregator.routes.js`
- `index.js`
- `market.routes.js` **[NEW]** - Unified market API
- `regime.routes.js`
- `scanner.routes.js`
- `signal.routes.js`
- `status.routes.js`
- `system.routes.js`

## Key Features

### 1. Market State Foundation
- Centralized real-time state for ALL active instruments
- VWAP, Relative Strength, Intraday Range
- Updated on every WebSocket tick
- Reset daily at 9:15 AM

### 2. Global Ranking Engine
- Sorted arrays updated every 5 seconds
- Rankings: Gainers, Losers, Range, Volume, RS, Momentum, Premium
- NO full market rescan - reads from memory

### 3. Capital Protection (capitalGuard)
- VIX Guard: Auto-downgrade STRONG signals when VIX > 25
- Crash Guard: Suspend BUY when index drops > 2%
- Spike Guard: Wait for confirmation after sudden 1.5% spike
- Liquidity Guard: Reject low liquidity signals
- Streak Guard: Reduce strength after 3 weak signals

### 4. Advanced Regime Detection
- TREND_UP_DAY / TREND_DOWN_DAY
- RANGE_DAY
- GAP_UP_DAY / GAP_DOWN_DAY
- EXPIRY_DAY
- HIGH_VIX_DAY
- CRASH_DAY
- Signal adjustment based on day type

### 5. Runner Engine (4/6 Validation)
- Move ≥ 1.5% in 15 min
- Volume ≥ 3x avg
- Relative Strength ≥ 60 percentile
- VWAP deviation sustained
- Liquidity > threshold
- ATR expanding
- Tier tracking: 8%, 12%, 15%, 20%

### 6. WebSocket Intelligent Rotation 2.0
Buckets (Priority order):
1. CORE - Indices (never removed)
2. ACTIVE_EQUITY - Explosive equity runners
3. ACTIVE_OPTIONS - Explosive option strikes
4. HIGH_RS - High relative strength stocks
5. HIGH_OI - High OI acceleration strikes
6. ROTATION - Remaining (rotates every 60 sec)

Max 50 subscriptions always enforced.

## Primary API Endpoints

### Dashboard Feed
| Endpoint | Description |
|----------|-------------|
| GET /api/market/full-overview | Complete dashboard data |
| GET /api/market/rankings | All ranking categories |
| GET /api/market/regime | Day type + regime |
| GET /api/market/protection | Capital guard state |

### System
| Endpoint | Description |
|----------|-------------|
| GET /api/system/load | CPU, RSS, Active scan count |
| GET /api/system/health | Full health metrics |
| GET /api/system/vix | VIX data |

## Hard Rules (ENFORCED)
- ✅ Only BUY / SELL / STRONG_BUY / STRONG_SELL
- ✅ NO WAIT signals
- ✅ NO MongoDB
- ✅ NO full market rescans (memory-based)
- ✅ WS ≤ 50 always
- ✅ Memory caps: 50 snapshots/token, 30 OI intervals

## Current Stats
- **Files:** 55
- **Services:** 28
- **Routes:** 8
- **Universe:** 7,965 instruments
- **RSS:** ~125MB
- **WS:** 4/50

## Pending
- [ ] Live session proof
- [ ] Memory creep monitoring (1 full session)
- [ ] No WS disconnect test
- [ ] Telegram Bot (after live proof)
