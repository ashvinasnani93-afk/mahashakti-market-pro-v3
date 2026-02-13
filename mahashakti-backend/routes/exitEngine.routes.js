// ==========================================
// EXIT ENGINE ROUTES
// MAHASHAKTI MARKET PRO
// Endpoint: POST /api/exit-engine
// Pure computation - no external calls
// ==========================================

const express = require('express');
const router = express.Router();

// POST /api/exit-engine
router.post('/', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { symbol, entryPrice, currentPrice, sl, target, quantity, entryTime, optionType, expiry } = req.body;
    
    if (!symbol || entryPrice === undefined || currentPrice === undefined || sl === undefined || target === undefined || quantity === undefined) {
      return res.json({ status: false, error: 'Required: symbol, entryPrice, currentPrice, sl, target, quantity' });
    }
    
    const entry = parseFloat(entryPrice);
    const current = parseFloat(currentPrice);
    const slPrice = parseFloat(sl);
    const targetPrice = parseFloat(target);
    const qty = parseInt(quantity);
    
    if (isNaN(entry) || isNaN(current) || isNaN(slPrice) || isNaN(targetPrice) || isNaN(qty)) {
      return res.json({ status: false, error: 'Invalid numeric values' });
    }
    
    // Core calculations
    const pnl = (current - entry) * qty;
    const pnlPct = ((current - entry) / entry) * 100;
    const totalRange = targetPrice - slPrice;
    const progressPct = totalRange > 0 ? ((current - slPrice) / totalRange) * 100 : 0;
    const distanceToSL = ((current - slPrice) / current) * 100;
    const distanceToTarget = ((targetPrice - current) / current) * 100;
    
    // Partial booking
    let partialBooking = { suggested: false, quantity: 0, reason: '', bookingLevel: null };
    if (progressPct >= 70) partialBooking = { suggested: true, quantity: Math.floor(qty * 0.75), reason: '🎯 Target 70% - Book 75%', bookingLevel: current };
    else if (progressPct >= 50) partialBooking = { suggested: true, quantity: Math.floor(qty * 0.5), reason: '🎯 Target 50% - Book 50%', bookingLevel: current };
    else if (progressPct >= 30 && pnl > 0) partialBooking = { suggested: true, quantity: Math.floor(qty * 0.25), reason: 'Target 30% - Consider 25%', bookingLevel: current };
    
    // SL shift
    let slShift = { suggested: false, newSL: slPrice, reason: '', type: null };
    if (pnlPct >= 5) slShift = { suggested: true, newSL: Math.round((entry + (current - entry) * 0.6) * 100) / 100, reason: '📈 Trail SL (60% profit locked)', type: 'TRAIL' };
    else if (pnlPct >= 3) slShift = { suggested: true, newSL: Math.round((entry + (current - entry) * 0.5) * 100) / 100, reason: '📈 Trail SL (50% profit locked)', type: 'TRAIL' };
    else if (pnlPct >= 1.5) slShift = { suggested: true, newSL: entry, reason: '🛡️ Move SL to cost', type: 'COST' };
    
    // Time warning
    let timeWarning = { hasWarning: false, message: '', severity: 'NONE', hoursInTrade: null };
    if (entryTime) {
      try {
        const hoursInTrade = (new Date() - new Date(entryTime)) / (1000 * 60 * 60);
        timeWarning.hoursInTrade = Math.round(hoursInTrade * 10) / 10;
        if (hoursInTrade > 8) timeWarning = { hasWarning: true, message: `⏰ Trade open ${hoursInTrade.toFixed(1)}h`, severity: 'HIGH', hoursInTrade: Math.round(hoursInTrade * 10) / 10 };
        else if (hoursInTrade > 4) timeWarning = { hasWarning: true, message: `Trade open ${hoursInTrade.toFixed(1)}h`, severity: 'MEDIUM', hoursInTrade: Math.round(hoursInTrade * 10) / 10 };
      } catch (e) {}
    }
    
    // Expiry warning
    let expiryWarning = { hasWarning: false, message: '', severity: 'NONE', daysToExpiry: null };
    if (expiry) {
      try {
        const daysToExpiry = Math.floor((new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24));
        expiryWarning.daysToExpiry = daysToExpiry;
        if (daysToExpiry <= 0) expiryWarning = { hasWarning: true, message: '🚨 EXPIRY DAY - Exit before 3:30 PM!', severity: 'CRITICAL', daysToExpiry: 0 };
        else if (daysToExpiry <= 1) expiryWarning = { hasWarning: true, message: '⚠️ Expiry tomorrow - High theta', severity: 'HIGH', daysToExpiry };
        else if (daysToExpiry <= 3) expiryWarning = { hasWarning: true, message: `${daysToExpiry} days to expiry`, severity: 'MEDIUM', daysToExpiry };
      } catch (e) {}
    }
    
    // Misuse warning
    let misuseWarning = { hasWarning: false, message: '', type: null, severity: 'NONE' };
    if (pnl < 0 && Math.abs(pnlPct) > 10) misuseWarning = { hasWarning: true, message: '🧠 Large loss - Avoid revenge trading', type: 'EMOTIONAL_RISK', severity: 'CRITICAL' };
    else if (pnl < 0 && Math.abs(pnlPct) > 5) misuseWarning = { hasWarning: true, message: 'Significant loss - Stay disciplined', type: 'EMOTIONAL_RISK', severity: 'HIGH' };
    
    // Capital alert
    let capitalAlert = { triggered: false, message: '', action: '', severity: 'NONE' };
    if (current <= slPrice) capitalAlert = { triggered: true, message: '🚨 SL BREACHED - Exit!', action: 'EXIT_NOW', severity: 'CRITICAL' };
    else if (distanceToSL < 0.5) capitalAlert = { triggered: true, message: '⚠️ Within 0.5% of SL', action: 'PREPARE_EXIT', severity: 'HIGH' };
    else if (distanceToSL < 1) capitalAlert = { triggered: true, message: 'Approaching SL', action: 'MONITOR', severity: 'MEDIUM' };
    
    // Exit recommendation
    let exitAction = 'HOLD', exitReason = 'Position OK', exitUrgency = 'LOW';
    if (capitalAlert.action === 'EXIT_NOW') { exitAction = 'EXIT_FULL'; exitReason = 'SL breached'; exitUrgency = 'CRITICAL'; }
    else if (progressPct >= 100) { exitAction = 'EXIT_FULL'; exitReason = '🎯 Target reached!'; exitUrgency = 'HIGH'; }
    else if (expiryWarning.severity === 'CRITICAL') { exitAction = 'EXIT_FULL'; exitReason = expiryWarning.message; exitUrgency = 'CRITICAL'; }
    else if (partialBooking.suggested && progressPct >= 50) { exitAction = 'EXIT_PARTIAL'; exitReason = partialBooking.reason; exitUrgency = 'MEDIUM'; }
    else if (partialBooking.suggested) { exitAction = 'CONSIDER_PARTIAL'; exitReason = partialBooking.reason; exitUrgency = 'LOW'; }
    
    res.json({
      status: true,
      symbol,
      position: { entry, current, sl: slPrice, target: targetPrice, quantity: qty, optionType: optionType || null, expiry: expiry || null },
      metrics: { pnl: Math.round(pnl * 100) / 100, pnlPct: Math.round(pnlPct * 100) / 100, progressToTarget: Math.round(progressPct * 100) / 100, distanceToSL: Math.round(distanceToSL * 100) / 100, distanceToTarget: Math.round(distanceToTarget * 100) / 100 },
      recommendation: { action: exitAction, reason: exitReason, urgency: exitUrgency },
      partialBooking,
      slShift,
      warnings: { time: timeWarning, expiry: expiryWarning, misuse: misuseWarning, capital: capitalAlert },
      meta: { timestamp: new Date().toISOString(), execTime: (Date.now() - startTime) + 'ms', source: 'EXIT_ENGINE' },
    });
    
  } catch (error) {
    console.error('[ExitEngine] Error:', error.message);
    res.status(500).json({ status: false, error: error.message });
  }
});

// GET /api/exit-engine/health
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Exit Engine' });
});

module.exports = router;
