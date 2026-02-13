const express = require('express');
const router = express.Router();
const authService = require('../services/auth.service');
const wsService = require('../services/websocket.service');
const scannerService = require('../services/scanner.service');
const { isMarketHours, getMarketSession } = require('../utils/helpers');

router.get('/', (req, res) => {
    const authStatus = authService.getStatus();
    const wsStatus = wsService.getStatus();
    const scannerStatus = scannerService.getStatus();
    const marketStatus = {
        isOpen: isMarketHours(),
        session: getMarketSession()
    };

    res.json({
        status: 'online',
        version: '3.0.0',
        name: 'MAHASHAKTI V3',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        auth: authStatus,
        websocket: wsStatus,
        scanner: scannerStatus,
        market: marketStatus
    });
});

router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
