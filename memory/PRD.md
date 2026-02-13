# MAHASHAKTI Market Pro - Product Requirements Document

## Original Problem Statement
Build an institutional-grade market scanning backend for Indian markets with:
- Full market coverage (NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX, F&O stocks, commodities)
- Actionable signals only (STRONG_BUY, BUY, STRONG_SELL, SELL - no WAIT to UI)
- Explosion Engine for early detection (₹3 → ₹650 type moves)
- WebSocket stability (max 50 subscriptions, no 429 errors)
- MongoDB for historical tracking

## User Personas
1. **Day Traders** - Need quick, actionable signals with proper entry/exit
2. **Swing Traders** - Need multi-timeframe analysis and continuation patterns
3. **Options Traders** - Need option acceleration and gamma-like move detection

## Core Requirements (Static)
- Angel One API integration for live market data
- Real indicator calculations (EMA, RSI, ATR - no shortcuts)
- Multi-timeframe alignment (1m, 5m, 15m, 1h, Daily)
- Risk:Reward validation (minimum 1.2, upgrade at 2.0)
- Safety layer (VIX, expiry day, result day, overtrade guard)
- WebSocket with exponential backoff (10→20→40→80)

## What's Been Implemented (Feb 13, 2026)
### Backend Services
1. ✅ Angel Auth Service - Login, token refresh, TOTP
2. ✅ Angel WebSocket - Max 50 subs, no duplicate, backoff
3. ✅ Angel Candles - Multi-timeframe historical data
4. ✅ Indicators Service - EMA, RSI, ATR (real math)
5. ✅ Signal Decision Service - All original features preserved + enhanced
6. ✅ Explosion Engine - Early expansion, high momentum, option acceleration, swing
7. ✅ Pre-Breakout Scanner - Compression detection
8. ✅ Volume Buildup Detector - Accumulation patterns
9. ✅ Range Compression Scanner - Explosive potential
10. ✅ Momentum Scanner - Context evaluation
11. ✅ Market Regime Service - Trend detection
12. ✅ Risk Reward Service - R:R validation
13. ✅ Safety Layer - All safety checks
14. ✅ Token Master - Symbol master loading
15. ✅ Scanner Service - Full market orchestration

### API Endpoints
- GET / - Service info
- GET /health - Health check
- GET /api/status - Full system status
- GET /api/scanner/results - All scan results
- GET /api/scanner/universal - Screen 1 signals
- GET /api/scanner/explosions - Screen 2 signals
- POST /api/scanner/run - Manual scan trigger
- GET /api/signal?symbol=X - Single symbol signal
- GET /api/status/ws-stability - WS stability log

## Prioritized Backlog
### P0 (Done)
- ✅ All core services implemented
- ✅ WebSocket stability
- ✅ Signal generation
- ✅ Explosion detection

### P1 (Next Phase)
- [ ] MongoDB models for signal history
- [ ] Historical signal tracking
- [ ] OI tracking service
- [ ] PCR integration

### P2 (Future)
- [ ] Sector strength analysis
- [ ] FII/DII data integration
- [ ] Breadth analysis
- [ ] Custom watchlist support

## Next Tasks
1. Deploy to Railway with MongoDB Atlas
2. Test live market signals
3. Implement MongoDB models for tracking
4. Add OI delta tracking service
