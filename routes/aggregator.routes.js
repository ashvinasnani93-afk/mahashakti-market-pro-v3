const express = require('express');
const router = express.Router();
const marketAggregatorService = require('../services/marketAggregator.service');
const premiumMomentumService = require('../services/premiumMomentum.service');
const explosionService = require('../services/explosion.service');
const marketScannerLoopService = require('../services/marketScannerLoop.service');

router.get('/screen1', (req, res) => {
    const data = marketAggregatorService.getScreen1Data();
    res.json({
        success: true,
        data,
        timestamp: new Date().toISOString()
    });
});

router.get('/screen2', (req, res) => {
    const data = marketAggregatorService.getScreen2Data();
    res.json({
        success: true,
        data,
        timestamp: new Date().toISOString()
    });
});

router.get('/combined', (req, res) => {
    const data = marketAggregatorService.getCombinedData();
    res.json({
        success: true,
        data,
        timestamp: new Date().toISOString()
    });
});

router.get('/top-signals', (req, res) => {
    const count = parseInt(req.query.count) || 10;
    const signals = marketAggregatorService.getTopSignals(count);
    res.json({
        success: true,
        count: signals.length,
        signals,
        timestamp: new Date().toISOString()
    });
});

router.get('/top-explosions', (req, res) => {
    const count = parseInt(req.query.count) || 10;
    const explosions = marketAggregatorService.getTopExplosions(count);
    res.json({
        success: true,
        count: explosions.length,
        explosions,
        timestamp: new Date().toISOString()
    });
});

router.get('/summary', (req, res) => {
    const summary = marketAggregatorService.getSummary();
    res.json({
        success: true,
        summary,
        timestamp: new Date().toISOString()
    });
});

router.get('/premium-runners', (req, res) => {
    const minMove = parseFloat(req.query.minMove) || 15;
    const runners = premiumMomentumService.getBigMovers(minMove);
    res.json({
        success: true,
        count: runners.length,
        runners,
        timestamp: new Date().toISOString()
    });
});

router.get('/premium-explosions', (req, res) => {
    const candidates = premiumMomentumService.getExplosionCandidates();
    res.json({
        success: true,
        count: candidates.length,
        candidates,
        timestamp: new Date().toISOString()
    });
});

router.get('/gamma-accelerators', (req, res) => {
    const count = parseInt(req.query.count) || 10;
    const accelerators = explosionService.getGammaAccelerators(count);
    res.json({
        success: true,
        count: accelerators.length,
        accelerators,
        timestamp: new Date().toISOString()
    });
});

router.get('/stock-runners', (req, res) => {
    const bigRunners = marketScannerLoopService.getBigRunners();
    const runners = marketScannerLoopService.getRunners();
    res.json({
        success: true,
        bigRunners: {
            count: bigRunners.length,
            data: bigRunners.slice(0, 20)
        },
        runners: {
            count: runners.length,
            data: runners.slice(0, 20)
        },
        timestamp: new Date().toISOString()
    });
});

router.get('/15-20-movers', (req, res) => {
    const movers = explosionService.get15to20PercentMovers();
    res.json({
        success: true,
        count: movers.length,
        movers,
        timestamp: new Date().toISOString()
    });
});

router.get('/top-runners', (req, res) => {
    const count = parseInt(req.query.count) || 20;
    const runners = explosionService.getTopRunners(count);
    res.json({
        success: true,
        count: runners.length,
        runners,
        timestamp: new Date().toISOString()
    });
});

router.get('/momentum', (req, res) => {
    const count = parseInt(req.query.count) || 20;
    const momentum = marketScannerLoopService.getTopMomentumStocks(count);
    res.json({
        success: true,
        count: momentum.length,
        momentum,
        timestamp: new Date().toISOString()
    });
});

router.get('/volume-spikes', (req, res) => {
    const count = parseInt(req.query.count) || 20;
    const spikes = marketScannerLoopService.getVolumeSpikes(count);
    res.json({
        success: true,
        count: spikes.length,
        spikes,
        timestamp: new Date().toISOString()
    });
});

router.get('/priority-buckets', (req, res) => {
    const buckets = marketScannerLoopService.getPriorityBuckets();
    const wsStatus = require('../services/websocket.service').getStatus();
    res.json({
        success: true,
        buckets,
        wsStatus,
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
