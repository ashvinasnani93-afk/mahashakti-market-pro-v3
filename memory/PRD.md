# MAHASHAKTI V4 - Product Requirements Document

## Original Problem Statement
Build a high-performance, production-grade backend system named "MAHASHAKTI" for stock market analysis with institutional-grade signal generation, risk management, and options intelligence.

## Architecture
- **Backend:** Node.js, Express.js
- **Data Source:** Angel One SmartAPI (REST & WebSocket)
- **Architecture:** Service-Oriented Architecture (SOA) with in-memory state
- **Core Logic:** Centralized validation pipeline in `masterSignalGuard.service.js`

## Production Files (72 Total)
- Services: 54
- Routes: 9
- Config: 3
- Utils: 2
- Root: 4

## Implemented Features (as of Feb 2026)

### Phase 1 - Data Integrity Guards
1. ✅ Calendar/Trading Hours
2. ✅ Holiday Check
3. ✅ Clock Sync (IST drift detection)
4. ✅ Candle Integrity

### Phase 2 - Market Risk Guards (CRITICAL)
5. ✅ Panic Kill Switch (NIFTY -2%, VIX +15%, Breadth <20%)
6. ✅ Circuit Breaker (Upper/Lower circuit block)
7. ✅ Latency Monitor
8. ✅ Drawdown Guard (5 losses = daily lock)

### Phase 3 - Liquidity & Structure Guards
9. ✅ Liquidity Tier (T3 < 10Cr = HARD BLOCK)
10. ✅ Liquidity Shock
11. ✅ Relative Strength (Underperformer block)
12. ✅ **Structural Stoploss** (NEW - Swing + ATR + RR validation)

### Phase 4 - Options Intelligence Guards
13. ✅ **Expiry Rollover** (NEW - Expiry mismatch block)
14. ✅ Theta Engine (Expiry crush, Deep OTM suppression)
15. ✅ Spread Filter (>15% = BLOCK)
16. ✅ Gamma Cluster (Upgrade logic)

### Phase 5 - Market Context Guards
17. ✅ Volatility Regime (Compression block)
18. ✅ Time-of-Day (First 5 min strict, Lunch suppression)
19. ✅ Gap Day (Adjustment logic)
20. ✅ Market Breadth (Warning/Adjustment)
21. ✅ Crowding Detector (Warning)
22. ✅ Correlation Engine (Warning)
23. ✅ Confidence Scoring (Score < 45 = BLOCK)

## Signal Flow Path
```
orchestrator.generateSignal()
    → indicatorService
    → regimeService
    → riskRewardService
    → safetyService
    → adaptiveFilterService
    → masterSignalGuard.validateSignalSync() [23 GUARDS]
    → signalCooldown.canEmitSignal()
    → signalCooldown.recordSignal()
    → SIGNAL EMITTED
```

## Validation Status
- Sunday Validation Suite: PASSED
- 200 Signal Attempts: 180 Blocked, 20 Emitted (90% block rate)
- Memory Soak Test: STABLE (<20MB growth)
- WS Reconnect: VERIFIED
- Cooldown Persistence: WORKING

## Pending Tasks
1. 🔴 P0: Run proof package with new guards (structuralStoploss, expiryRollover)
2. 🔴 P0: Verify server restart with new changes
3. 🟡 P1: GitHub push after verification
4. 🟢 P2: Monday live shadow test
5. 🟢 P3: Telegram bot integration

## API Endpoints
- `GET /api/institutional/status` - Health check
- `GET /api/institutional/guards` - Guard stats
- `GET /api/system/load` - System health
- `GET /api/market/full-overview` - Unified dashboard

## Credentials (in .env)
- ANGEL_API_KEY
- ANGEL_CLIENT_ID
- ANGEL_PASSWORD
- ANGEL_TOTP_SECRET
- PORT=8080

## Last Updated
February 15, 2026 - structuralStoploss + expiryRollover integration
