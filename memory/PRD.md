# MAHASHAKTI - Production Requirements Document

## Project Overview
**Name:** MAHASHAKTI V4  
**Type:** High-Performance Stock Market Analysis Backend  
**Stack:** Node.js, Express.js, Angel One SmartAPI  
**Database:** In-Memory Only (No Database)

---

## What's Been Implemented

### Phase 1-3 (Previous Builds) - COMPLETE ✅
- Full Market Universe Loading (~8000 instruments from Angel Master JSON)
- OI Intelligence Layer for PCR Analysis
- Cross-Market Context Engine
- VIX-based Safety Protocols
- Intraday % Gain Trackers (8% to 20%)
- Premium Growth Trackers (50% to 1000%)
- Centralized Market State Service
- Global Ranking Engine
- Capital Protection Service
- Advanced Regime Detection

### Phase 4 - INSTITUTIONAL GRADE IMPLEMENTATION (Feb 14, 2026) ✅

#### DATA INTEGRITY FOUNDATION (6 features)
- ✅ PrevClose FULL MODE verification
- ✅ Candle Integrity Engine (7 validation checks)
- ✅ Corporate Action Adjustment (Split/Bonus/Dividend)
- ✅ Strict Trading Hours Block (9:15-3:30 IST only)
- ✅ NSE Holiday + Special Session Engine (32+ holidays)
- ✅ IST Clock Sync Validator (2 sec drift threshold)

#### STRUCTURAL SIGNAL UPGRADE (6 features)
- ✅ Candle Close Confirmation Structure
- ✅ Multi-Timeframe Alignment (5m/15m/Daily)
- ✅ Advance-Decline Breadth Engine
- ✅ Relative Strength vs Index
- ✅ Liquidity Tier Engine (T1 >50Cr, T2 10-50Cr, T3 <10Cr blocked)
- ✅ Structural Stoploss Engine (Swing + ATR buffer)

#### OPTIONS MICROSTRUCTURE INTELLIGENCE (8 features)
- ✅ Real-Time OI Delta Engine
- ✅ Bid-Ask Spread Hard Filter (>15% block)
- ✅ Orderbook Depth Imbalance
- ✅ Gamma Cluster Detection
- ✅ Theta DK Engine (True Momentum calculation)
- ✅ Expiry Auto Rollover
- ✅ Expiry-Day Special Guard
- ✅ Acceleration Velocity Tracking

#### MARKET RISK & CRASH CONTROL (5 features)
- ✅ Global Panic Kill Switch (NIFTY -2%/15min, VIX +15%, Breadth <20%)
- ✅ Circuit Breaker Detection (UC/LC + near-freeze)
- ✅ Time-of-Day Filters (Opening strict, Lunch drift, Closing cautious)
- ✅ Gap Day Override Logic (>1.5% gap adjustments)
- ✅ Result-Day Special Filter

#### EXECUTION & STABILITY HARDENING (4 features)
- ✅ API 429 Retry with Exponential Backoff + Jitter
- ✅ WebSocket Reconnect + Restore
- ✅ Cooldown Persistence
- ✅ Latency Monitor

#### ULTRA-ADVANCED LAYER (10 features)
- ✅ Intraday Volatility Regime Classifier (Compression/Expansion/Trend/Mean-Reversion)
- ✅ Crowding Detection Engine (Trap risk identification)
- ✅ Institutional Block Order Detector (5x volume, narrow spread, no wick)
- ✅ Rolling Correlation Engine (Stock vs Index)
- ✅ Liquidity Shock Filter (40% volume drop detection)
- ✅ Daily Drawdown Guard (Signal lock after losses)
- ✅ IV Skew Curve Engine (Call/Put skew tracking)
- ✅ Underlying-Option Divergence Engine (IV/Gamma/Theta trap detection)
- ✅ Signal Confidence Scoring (0-100 with grade)
- ✅ Master Signal Guard (Unified 39+ layer validation)

---

## File Structure

```
/app/
├── server.js                    # Main application entry
├── package.json                 # Dependencies
├── config/                      # 3 files
│   ├── angel.config.js
│   ├── instruments.config.js
│   └── settings.config.js
├── routes/                      # 9 files
│   ├── index.js
│   ├── institutional.routes.js  # NEW: All institutional APIs
│   ├── market.routes.js
│   └── ...
├── services/                    # 54 files
│   ├── masterSignalGuard.service.js    # Unified validation
│   ├── candleIntegrity.service.js
│   ├── calendar.service.js
│   ├── clockSync.service.js
│   ├── breadth.service.js
│   ├── relativeStrength.service.js
│   ├── liquidityTier.service.js
│   ├── structuralStoploss.service.js
│   ├── gammaCluster.service.js
│   ├── thetaEngine.service.js
│   ├── expiryRollover.service.js
│   ├── orderbookDepth.service.js
│   ├── panicKillSwitch.service.js
│   ├── circuitBreaker.service.js
│   ├── timeOfDay.service.js
│   ├── gapDay.service.js
│   ├── latencyMonitor.service.js
│   ├── drawdownGuard.service.js
│   ├── volatilityRegime.service.js
│   ├── crowdingDetector.service.js
│   ├── correlationEngine.service.js
│   ├── confidenceScoring.service.js
│   ├── blockOrderDetector.service.js
│   ├── liquidityShock.service.js
│   ├── ivSkew.service.js
│   ├── divergenceEngine.service.js
│   └── ... (27 existing services)
└── utils/                       # 2 files
```

**Total: 79 production files**

---

## Key API Endpoints

### Institutional APIs (`/api/institutional/`)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/dashboard` | GET | Full institutional overview |
| `/guard/stats` | GET | Master guard statistics |
| `/guard/validate` | POST | Validate signal through all 39+ layers |
| `/breadth` | GET | Market breadth (A/D ratio, VWAP, sectors) |
| `/rs` | GET | Relative strength snapshot |
| `/liquidity` | GET | Liquidity tier breakdown |
| `/gamma` | GET | Gamma cluster status |
| `/theta` | GET | Theta engine metrics |
| `/panic` | GET | Panic kill switch status |
| `/circuit` | GET | Circuit breaker alerts |
| `/regime` | GET | Volatility regime classification |
| `/crowding` | GET | Crowding/trap detection |
| `/correlation` | GET | Stock-index correlation |
| `/confidence` | GET | Confidence scoring stats |
| `/drawdown` | GET | Drawdown guard status |

### Existing APIs
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/market/full-overview` | GET | Unified market dashboard |
| `/api/system/load` | GET | System health metrics |
| `/api/system/universe` | GET | Loaded instruments count |

---

## Non-Negotiable Rules
1. **NO WAIT SIGNALS** - Only BUY/SELL/STRONG_BUY/STRONG_SELL
2. **Max 50 WebSocket subscriptions**
3. **In-memory operations only** (no database)
4. **RSS memory < 200MB**
5. **Trading hours only** (9:15-3:30 IST)

---

## Production Verification

| Check | Status |
|-------|--------|
| No WAIT signals | ✅ PASS |
| Signal types correct | ✅ PASS |
| WebSocket max 50 | ✅ PASS |
| Memory < 200MB | ✅ PASS (125MB) |
| All APIs responding | ✅ PASS |
| Boot successful | ✅ PASS |
| 39+ features | ✅ COMPLETE |

---

## Next Steps
1. **Live Market Testing** - Run during market hours for validation
2. **6-Hour Memory Soak Test** - Verify no memory creep
3. **Telegram Bot Integration** - Real-time notifications

---

## Changelog

### Feb 14, 2026 - V4 Institutional Release
- Added 28 new services (54 total)
- Implemented all 39+ institutional features
- Created Master Signal Guard for unified validation
- Added comprehensive institutional API routes
- Updated server.js with 24-step boot sequence

### Previous Releases
- V3: Full Institutional Hardening (marketState, globalRanking, capitalGuard)
- V2: Pre-Live Hardening (tier trackers, memory caps)
- V1: Full Market Expansion (8000+ instruments, OI intelligence)
