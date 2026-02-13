const express = require('express');
const router = express.Router();
const authService = require('../services/auth.service');
const wsService = require('../services/websocket.service');
const scannerService = require('../services/scanner.service');
const candleService = require('../services/candle.service');
const regimeService = require('../services/regime.service');

function isMarketHours() {
    const now = new Date();
    const day = now.getDay();
    if (day === 0 || day === 6) return false;
    
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const time = hours * 60 + minutes;
    
    return time >= 555 && time <= 930;
}

function getMarketSession() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const time = hours * 60 + minutes;
    
    if (time < 540) return 'PRE_MARKET';
    if (time < 555) return 'PRE_OPEN';
    if (time < 720) return 'MORNING_SESSION';
    if (time < 840) return 'MID_DAY';
    if (time < 930) return 'AFTERNOON_SESSION';
    return 'AFTER_HOURS';
}

router.get('/', (req, res) => {
    const authStatus = authService.getStatus();
    const wsStatus = wsService.getStatus();
    const scannerStatus = scannerService.getStatus();
    const regime = regimeService.getCurrentRegime();

    res.json({
        status: 'online',
        version: '3.0.0',
        name: 'MAHASHAKTI V3',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        auth: authStatus,
        websocket: wsStatus,
        scanner: scannerStatus,
        regime: regime ? {
            current: regime.regime,
            confidence: regime.confidence,
            tradingApproach: regime.tradingApproach
        } : null,
        market: {
            isOpen: isMarketHours(),
            session: getMarketSession()
        },
        cache: candleService.getCacheStats()
    });
});

router.get('/health', (req, res) => {
    const wsConnected = wsService.getStatus().connected;
    const authValid = authService.getStatus().isAuthenticated;
    
    res.json({
        status: wsConnected && authValid ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        checks: {
            auth: authValid,
            websocket: wsConnected
        }
    });
});

module.exports = router;
