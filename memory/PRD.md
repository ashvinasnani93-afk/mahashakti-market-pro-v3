# MAHASHAKTI V6 - Product Requirements Document

## Original Problem Statement
Build a high-performance, production-grade backend system named "MAHASHAKTI" for stock market analysis with institutional-grade signal generation, risk management, options intelligence, **early move detection (V5)**, and **adaptive intelligence + exit commander (V6)**.

## Architecture
- **Backend:** Node.js, Express.js
- **Data Source:** Angel One SmartAPI (REST & WebSocket)
- **Architecture:** Service-Oriented Architecture (SOA) with in-memory state
- **Core Logic:** Centralized validation pipeline in `masterSignalGuard.service.js`

## Production Files (59 Services)
- Services: 59 (V5: 54 + V6: 5 new services)
- Routes: 9
- Config: 3
- Utils: 2
- Root: 4

---

## V6 Features (February 2026) - ADAPTIVE INTELLIGENCE + EXIT COMMANDER

### New Services Created (5)

1. **exitCommander.service.js** - Active Exit Intelligence
   - STRUCTURAL EXIT: Swing break, VWAP break, Opposite ignition
   - TRAILING EXIT: ATR-based trailing, Higher low/Lower high break
   - REGIME EXIT: Regime shift, Volatility collapse, Breadth collapse
   - OPTION EXIT: Theta acceleration, IV crush, OI reversal
   - Output: EXIT_SIGNAL, EXIT_REASON, EXIT_PRIORITY

2. **adaptiveRegime.service.js** - Intraday Volatility Segmentation
   - Regimes: COMPRESSION, EXPANSION, TREND_DAY, RANGE_DAY, PANIC_DAY
   - Logic: ATR slope, Opening range %, VWAP distance, Range expansion
   - Dynamic thresholds for ignition & RR based on regime
   - Output: REGIME_TYPE, VOLATILITY_SCORE (0-100)

3. **portfolioCommander.service.js** - Portfolio-Level Risk Management
   - Max simultaneous trades: 5
   - Correlation check between positions
   - Capital exposure limits by regime
   - Loss streak lock (3 consecutive losses → 60 min freeze)
   - Can BLOCK or DOWNGRADE signals

4. **executionReality.service.js** - Execution Safety Guard
   - Spread widening detection (>50% widening = block)
   - Orderbook depth collapse detection
   - Parabolic spike detection (>4x avg range = block)
   - Slippage risk scoring (0-100)
   - Output: EXECUTION_BLOCK_REASON, SLIPPAGE_RISK_SCORE

5. **signalLifecycle.service.js** - Signal Tracking & Learning
   - Tracks: Entry context, regime, volatility, exit reason, performance
   - Performance by regime, time, signal type
   - Adaptive insights for strategy refinement

### Services Upgraded (3)

1. **crowdingDetector.service.js** - V6 Upgrade
   - Late breakout detection (parabolic + volume spike)
   - OI extreme concentration check
   - PCR extreme condition check
   - Full crowd psychology filter

2. **confidenceScoring.service.js** - V6 Confidence 2.0
   - Minimum threshold: 60 (increased from 45)
   - Strong signal threshold: 75
   - New weights: Execution safety, Regime alignment, Correlation risk, Crowd trap, Exit clarity
   - Total weight factors: 15

3. **masterSignalGuard.service.js** - V6 Pipeline Integration
   - New pipeline order with V6 guards
   - Adaptive regime integration
   - Execution reality hard block
   - Portfolio commander hard block
   - V6 crowd psychology check

---

## V6 Signal Flow (29 Guards)
```
ADAPTIVE_REGIME → IGNITION_CHECK → TRADING_HOURS → HOLIDAY → CLOCK_SYNC →
PANIC_KILL_SWITCH → CIRCUIT_BREAKER → LIQUIDITY_TIER →
LATENCY_MONITOR → EXECUTION_REALITY → PORTFOLIO_COMMANDER →
DRAWDOWN_GUARD → LIQUIDITY_SHOCK → RELATIVE_STRENGTH → VOLATILITY_REGIME →
TIME_OF_DAY → GAP_DAY → CANDLE_INTEGRITY → STRUCTURAL_STOPLOSS →
[OPTIONS: EXPIRY_ROLLOVER → THETA → SPREAD → GAMMA] →
BREADTH → V6_CROWD_PSYCHOLOGY → CROWDING → CORRELATION → CONFIDENCE_SCORE → EMIT
```

**ExitCommander runs continuously post-entry.**

---

## V6 Validation Results (Feb 16, 2026)

### All Tests Passed (11/11)
- ✅ V6 Services Loaded (5/5)
- ✅ Guard Count: 19+ in pipeline
- ✅ Regime Classification: EXPANSION detected
- ✅ Execution Block Proof: High spread blocked
- ✅ Portfolio Block Proof: Max positions enforced
- ✅ Exit Trigger: Structural swing break detected
- ✅ Trailing Exit: Trail activated at 4% profit
- ✅ Option Exit: Theta acceleration detected
- ✅ Lifecycle Tracking: Signal ID generated
- ✅ Confidence 2.0: Min 60, Strong 75, V6 weights
- ✅ Memory: 10MB heap (well under 500MB limit)

---

## V5 Features (Preserved from Previous Version)

### Early Ignition Detection
1. **microIgnitionStock.service.js** - Stock early move detection at 1-1.5%
2. **microIgnitionOption.service.js** - Premium burst detection at 4-6%
3. **WebSocket CORE Promotion** - Ignition-triggered bucket upgrade
4. **Confidence Boost** - Ignition adds up to 15 points to final score

---

## Technical Details

### Guard Counts
- V5 Guards: 24 (20 equity + 4 options)
- V6 New Guards: 5 (Regime, Execution, Portfolio, V6 Crowd, Lifecycle)
- Total System Guards: ~29

### Thresholds (V6)
- Minimum Confidence: 60 (was 45)
- Strong Signal Confidence: 75 (was 70)
- Max Simultaneous Trades: 5
- Loss Streak Lock: 3 losses → 60 min freeze
- Max Spread Equity: 0.5%
- Max Spread Options: 15%
- Parabolic Block: 4x avg range

### Exit Types
1. STRUCTURAL: Swing break, VWAP break, Opposite ignition
2. TRAILING: ATR-based, Higher low/Lower high break
3. REGIME: Regime shift, Vol collapse, Breadth collapse
4. OPTION: Theta accel, IV crush, OI reversal

---

## Remaining/Backlog Tasks

### Immediate
- [ ] Push V6 to GitHub (awaiting user command)

### Future
- [ ] Live Shadow Testing
- [ ] Telegram Bot Integration
- [ ] Real-time dashboard

---

## Git Status
- Branch: main
- Tracked Files: 78
- Status: Clean (only package-lock.json untracked)

## Commit Message Ready
```
MAHASHAKTI V6 – Adaptive Intelligence + Exit Commander | 29 Guards | Production Freeze
```
