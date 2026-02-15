# MAHASHAKTI V5 - Product Requirements Document

## Original Problem Statement
Build a high-performance, production-grade backend system named "MAHASHAKTI" for stock market analysis with institutional-grade signal generation, risk management, options intelligence, and **early move detection**.

## Architecture
- **Backend:** Node.js, Express.js
- **Data Source:** Angel One SmartAPI (REST & WebSocket)
- **Architecture:** Service-Oriented Architecture (SOA) with in-memory state
- **Core Logic:** Centralized validation pipeline in `masterSignalGuard.service.js`

## Production Files (72 Total)
- Services: 54 (including 2 new V5 Ignition engines)
- Routes: 9
- Config: 3
- Utils: 2
- Root: 4

## V5 Features (February 2026)

### Early Ignition Detection
1. **microIgnitionStock.service.js** - Stock early move detection at 1-1.5%
   - Conditions: Strong body >60%, Volume ≥1.8x, VWAP reclaim, ATR rising
   - Output: IGNITION_STRENGTH: 0-100

2. **microIgnitionOption.service.js** - Premium burst detection at 4-6%
   - Conditions: Premium ≥4%, OI rising, Spread ≤12%, Direction aligned
   - Velocity scoring: Fast moves get higher priority

3. **WebSocket CORE Promotion** - Ignition-triggered bucket upgrade
   - High ignition → ACTIVE bucket (immediate)
   - Medium ignition → HIGH_RS/HIGH_OI
   - Low ignition → Front of ROTATION

4. **Confidence Boost** - Ignition adds up to 15 points to final score

## Signal Flow (V5)
```
IGNITION_CHECK → TRADING_HOURS → HOLIDAY → CLOCK_SYNC →
PANIC_KILL_SWITCH → CIRCUIT_BREAKER → LIQUIDITY_TIER →
LATENCY_MONITOR → DRAWDOWN_GUARD → LIQUIDITY_SHOCK →
RELATIVE_STRENGTH → VOLATILITY_REGIME → TIME_OF_DAY → GAP_DAY →
CANDLE_INTEGRITY → STRUCTURAL_STOPLOSS →
[OPTIONS: EXPIRY_ROLLOVER → THETA → SPREAD → GAMMA] →
BREADTH → CROWDING → CORRELATION → CONFIDENCE_SCORE → EMIT
```

## Validation Results (Feb 15, 2026)

### Real Data Backtest
- Symbols Processed: 23
- Candles Processed: 8,600+
- Ignitions Detected: 10
- Early Entry %: 100% (before 3% move)
- Late Detection: 0
- False Ignitions: 1

### Performance
- Memory Growth: <2MB (10-min idle)
- WebSocket: 800 instruments stable
- All guards: ACTIVE in signal flow

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
February 15, 2026 - V5 Early Ignition Engine Production Freeze
