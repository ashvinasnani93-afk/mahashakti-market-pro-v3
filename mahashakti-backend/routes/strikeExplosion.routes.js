// ==========================================
// STRIKE EXPLOSION ROUTES
// MAHASHAKTI MARKET PRO
// Endpoint: POST /api/strike/explosion
// Uses cached chain, ATM ±5 strikes, lightweight
// ==========================================

const express = require('express');
const router = express.Router();

// POST /api/strike/explosion
router.post('/', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { symbol, strike, optionType, ltp, oi, oiChange, volume, avgVolume3Candle, spot, atmStrike, expiry, prevDayOI, iv } = req.body;
    
    if (!symbol || !strike || !optionType || ltp === undefined) {
      return res.json({ status: false, error: 'Required: symbol, strike, optionType, ltp' });
    }
    
    const ltpVal = parseFloat(ltp);
    const oiVal = parseInt(oi) || 0;
    const oiChangeVal = parseInt(oiChange) || 0;
    const volumeVal = parseInt(volume) || 0;
    const avgVol = parseInt(avgVolume3Candle) || 0;
    const spotVal = parseFloat(spot) || 0;
    const atmVal = parseFloat(atmStrike) || strike;
    const prevOI = parseInt(prevDayOI) || 0;
    const ivVal = parseFloat(iv) || null;
    
    let score = 0;
    const factors = [];
    let explosionType = 'NONE';
    
    // Premium compression (25 pts)
    if (ltpVal <= 5) { score += 25; factors.push({ factor: 'ULTRA_LOW_PREMIUM', score: 25, note: `₹${ltpVal}` }); explosionType = 'Gamma'; }
    else if (ltpVal <= 15) { score += 20; factors.push({ factor: 'LOW_PREMIUM', score: 20, note: `₹${ltpVal}` }); }
    else if (ltpVal <= 30) { score += 12; factors.push({ factor: 'MODERATE_PREMIUM', score: 12 }); }
    else if (ltpVal <= 50) { score += 5; factors.push({ factor: 'ACCEPTABLE_PREMIUM', score: 5 }); }
    
    // Volume spike vs 3 candle avg (20 pts)
    const volumeMultiple = avgVol > 0 ? volumeVal / avgVol : 1;
    if (volumeMultiple >= 5) { score += 20; factors.push({ factor: 'VOLUME_EXPLOSION', score: 20, note: `${volumeMultiple.toFixed(1)}x avg` }); explosionType = explosionType || 'Breakout'; }
    else if (volumeMultiple >= 3) { score += 15; factors.push({ factor: 'VOLUME_SURGE', score: 15, note: `${volumeMultiple.toFixed(1)}x avg` }); }
    else if (volumeMultiple >= 2) { score += 8; factors.push({ factor: 'VOLUME_INCREASE', score: 8 }); }
    else if (volumeVal > 100000) { score += 5; factors.push({ factor: 'HIGH_VOLUME', score: 5 }); }
    
    // OI buildup % (20 pts)
    const oiChangePct = oiVal > 0 ? (oiChangeVal / oiVal * 100) : 0;
    const prevDayPct = prevOI > 0 ? ((oiVal - prevOI) / prevOI * 100) : 0;
    if (oiChangePct > 20 && oiChangeVal > 0) { score += 15; factors.push({ factor: 'MASSIVE_OI_BUILDUP', score: 15, note: `+${oiChangePct.toFixed(1)}%` }); if (explosionType === 'NONE') explosionType = 'ShortCover'; }
    else if (oiChangePct > 10 && oiChangeVal > 0) { score += 10; factors.push({ factor: 'STRONG_OI_BUILDUP', score: 10 }); }
    else if (oiChangePct > 5 && oiChangeVal > 0) { score += 5; factors.push({ factor: 'OI_BUILDUP', score: 5 }); }
    if (prevDayPct > 50) { score += 5; factors.push({ factor: 'MULTI_DAY_OI_SURGE', score: 5 }); }
    if (oiChangePct < -15) { score -= 10; factors.push({ factor: 'OI_UNWINDING', score: -10 }); }
    
    // ATM proximity (15 pts)
    const distanceFromATM = Math.abs(strike - atmVal);
    const distancePct = spotVal > 0 ? (distanceFromATM / spotVal) * 100 : 0;
    if (distancePct <= 0.5) { score += 15; factors.push({ factor: 'ATM_STRIKE', score: 15 }); }
    else if (distancePct <= 1) { score += 12; factors.push({ factor: 'NEAR_ATM', score: 12 }); }
    else if (distancePct <= 2) { score += 8; factors.push({ factor: 'CLOSE_TO_ATM', score: 8 }); }
    else if (distancePct > 5) { score -= 5; factors.push({ factor: 'DEEP_OTM_RISK', score: -5 }); }
    
    // Expiry gamma (15 pts)
    let daysToExpiry = 30;
    if (expiry) {
      try { daysToExpiry = Math.max(0, Math.floor((new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24))); } catch (e) {}
    }
    if (daysToExpiry === 0) { score += 15; factors.push({ factor: 'EXPIRY_DAY_GAMMA', score: 15 }); explosionType = 'Gamma'; }
    else if (daysToExpiry === 1) { score += 12; factors.push({ factor: 'NEAR_EXPIRY_GAMMA', score: 12 }); }
    else if (daysToExpiry === 2) { score += 8; factors.push({ factor: 'T2_GAMMA_BOOST', score: 8 }); }
    else if (daysToExpiry <= 5) { score += 4; factors.push({ factor: 'WEEKLY_EXPIRY', score: 4 }); }
    
    // Theta trap penalty
    if (daysToExpiry > 15 && ltpVal <= 20 && distancePct > 3) {
      score -= 10; factors.push({ factor: 'THETA_TRAP', score: -10 });
    }
    
    // IV bonus
    if (ivVal !== null && ivVal > 50) { score += 3; factors.push({ factor: 'HIGH_IV', score: 3 }); }
    
    const normalizedScore = Math.max(0, Math.min(100, score));
    const isExplosive = normalizedScore >= 50;
    const confidenceTag = normalizedScore >= 70 ? 'HIGH' : (normalizedScore >= 50 ? 'MEDIUM' : 'LOW');
    
    res.json({
      status: true,
      symbol, strike, optionType,
      explosionScore: normalizedScore,
      isExplosive,
      explosionType: isExplosive ? explosionType : 'NONE',
      confidenceTag,
      factors,
      daysToExpiry,
      volumeMultiple: volumeMultiple > 1 ? Math.round(volumeMultiple * 10) / 10 : null,
      oiChangePct: Math.round(oiChangePct * 100) / 100,
      meta: { timestamp: new Date().toISOString(), execTime: (Date.now() - startTime) + 'ms', source: 'STRIKE_EXPLOSION_ENGINE' },
    });
    
  } catch (error) {
    console.error('[Explosion] Error:', error.message);
    res.status(500).json({ status: false, error: error.message });
  }
});

// GET /api/strike/explosion/health
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Strike Explosion Engine' });
});

module.exports = router;
