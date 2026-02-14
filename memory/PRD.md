# MAHASHAKTI V3 - Production Stock Market Analysis Backend

## Original Problem Statement
Build a high-performance, production-grade backend system for stock market analysis and signal generation. No frontend required.

## What's Been Implemented

### Date: Feb 14, 2026 - PRE-LIVE HARDENING COMPLETE

#### New Features Added:

**1. Intraday Cumulative % Tracker**
- Tracks Open → Current price movement
- Trigger tiers: **8%, 12%, 15%, 20%**
- Logs: `[RUNNER_ENGINE] 🔥 TIER 15% TRIGGERED | Token: xxx | Move: 15.23%`
- Endpoint: `GET /api/aggregator/intraday-tiers?minTier=8`

**2. Premium Growth Tracker (Options)**
- Tracks premium growth from entry
- Trigger tiers: **50%, 100%, 200%, 500%, 1000%**
- Logs: `[RUNNER_ENGINE] 💎 PREMIUM 100% TRIGGERED | Token: xxx | Gain: 102.5%`
- Endpoint: `GET /api/aggregator/premium-tiers?minTier=50`

**3. Memory Caps Enforced**
- Explosion history: **Max 50 records per token** (was 200)
- OI history: **Max 30 intervals per token** (was 50)
- Global explosion history: **Max 500** (auto-trims to 400)

**4. Scanner Confirmation - Dynamic Bucket Only**
- Confirmed: Scanner processes **only shortlisted dynamic bucket**
- Log confirmation: `Active scan bucket: 4 tokens (NOT all 7965)`
- Does NOT compute indicators for all instruments simultaneously

**5. System Load Endpoint**
- `GET /api/system/load`
- Returns: CPU %, RSS MB, Active scan count, WS status, Scanner mode

---

## Full Feature List

### Universe & Data Source
- Angel OpenAPI Master JSON (214K instruments)
- Auto-refresh daily 8:30 AM IST
- NSE Equity, F&O Stocks (225), Index Options (7,730)

### Signal Engine
- Signal Types: BUY, SELL, STRONG_BUY, STRONG_SELL (NO WAIT)
- Adaptive breakout filters
- Runner Engine (4/5 strict validation)
- 15-minute cooldown per symbol

### Tracking Systems
| Tracker | Tiers | Endpoint |
|---------|-------|----------|
| Intraday Equity | 8%, 12%, 15%, 20% | /api/aggregator/intraday-tiers |
| Premium Options | 50%, 100%, 200%, 500%, 1000% | /api/aggregator/premium-tiers |

### Intelligence Layers
- OI Intelligence (Long/Short buildup, PCR)
- Cross-Market Context (Index bias, Sector leadership)
- VIX Safety Layer (Premium band adjustment)

### Protection Systems
- CPU Protection: 75% warning, 90% critical
- Memory Caps: 50 snapshots/token, 30 OI intervals
- WebSocket: 50 max subscriptions, 120s auto-rotate

---

## Key API Endpoints

### System APIs
| Endpoint | Description |
|----------|-------------|
| GET /api/system/load | CPU, RSS, Active scan count |
| GET /api/system/health | Full health metrics |
| GET /api/system/universe | Universe stats |
| GET /api/system/vix | VIX data & premium bands |
| GET /api/system/context | Market bias & sectors |
| GET /api/system/oi/pcr | PCR data |

### Aggregator APIs
| Endpoint | Description |
|----------|-------------|
| GET /api/aggregator/intraday-tiers | Equity runners by tier |
| GET /api/aggregator/premium-tiers | Premium explosions by tier |
| GET /api/aggregator/top-runners | Top 10 runners |
| GET /api/aggregator/market-view | Full market view |

---

## Memory Limits
| Component | Limit |
|-----------|-------|
| RSS Total | < 200MB |
| Snapshots per token | 50 |
| OI intervals per token | 30 |
| Explosion history | 500 |
| WS subscriptions | 50 |

---

## Pre-Live Checklist
- [x] Intraday % tracker (8/12/15/20)
- [x] Premium % tracker (50/100/200/500/1000)
- [x] Memory caps enforced
- [x] Scanner dynamic bucket confirmation
- [x] /api/system/load endpoint
- [ ] Live shadow proof (1 full session)
- [ ] No WS disconnect test
- [ ] No memory creep test
- [ ] Telegram Bot (after live proof)

---

## Credentials (in .env)
- ANGEL_API_KEY: EU6E48uY
- ANGEL_CLIENT_ID: A819201
- ANGEL_PASSWORD: 2310
- ANGEL_TOTP_SECRET: IOS2NLBN2NORL3K6KQ26TXCINY

---

## Backlog
1. **P0:** Live shadow proof (1 full trading session)
2. **P1:** Railway deployment
3. **P1:** Memory creep monitoring
4. **P2:** Telegram Bot integration (after live proof)
5. **P2:** NSE Equity filter optimization
