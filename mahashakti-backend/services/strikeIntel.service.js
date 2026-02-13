// ==========================================
// STRIKE INTELLIGENCE SERVICE
// Internal service - NO HTTP self-calls
// Uses existing optionChain data
// ==========================================

const { buildOptionChainFromAngel } = require('../optionchain.service');

class StrikeIntelligenceService {
  constructor() {
    this.historicalOI = new Map();
    this.maxHistorySize = 100;
  }

  async getStrikeIntel(symbol, strike, optionType, expiry = null) {
    const startTime = Date.now();
    
    try {
      // Get option chain data (internal call)
      const chainData = await buildOptionChainFromAngel(symbol, expiry);
      
      if (!chainData || !chainData.status) {
        return { status: false, error: 'Option chain not available' };
      }
      
      const spot = chainData.spot || 0;
      const atmStrike = chainData.atmStrike ? chainData.atmStrike / 100 : spot;
      const chain = chainData.chain || {};
      
      // Find strike
      const strikeKey = strike * 100;
      const strikeData = chain[strikeKey];
      
      if (!strikeData) {
        return { status: false, error: `Strike ${strike} not found` };
      }
      
      const optionData = optionType === 'CE' ? strikeData.CE : strikeData.PE;
      if (!optionData) {
        return { status: false, error: `${optionType} data not found for strike ${strike}` };
      }
      
      const ltp = optionData.ltp || 0;
      const oi = optionData.oi || 0;
      const volume = optionData.volume || 0;
      const oiChange = optionData.oiChange || 0;
      
      // Moneyness
      const distanceFromATM = Math.abs(strike - atmStrike);
      const isITM = (optionType === 'CE' && strike < spot) || (optionType === 'PE' && strike > spot);
      const isATM = distanceFromATM <= 100;
      const moneyness = isATM ? 'ATM' : (isITM ? 'ITM' : 'OTM');
      
      // Intrinsic & Time Value
      const intrinsic = optionType === 'CE' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
      const timeValue = Math.max(0, ltp - intrinsic);
      const timeValuePct = ltp > 0 ? (timeValue / ltp * 100) : 0;
      
      // OI Analysis
      const oiChangePct = oi > 0 ? (oiChange / oi * 100) : 0;
      const oiSignal = oiChange > 0 ? 'BUILDING' : 'UNWINDING';
      
      // Explosion analysis
      const explosion = this.analyzeExplosion({
        symbol, strike, optionType, ltp, oi, volume, oiChange, oiChangePct,
        spot, atmStrike, moneyness, distanceFromATM, expiry: chainData.expiry,
      });
      
      // Signal generation
      const { signal, confidence, reasons } = this.generateSignal({
        optionType, spot, strike, atmStrike, oi, oiChange, oiChangePct,
        volume, isITM, isATM, explosion,
      });
      
      // Levels
      const entry = ltp;
      const sl = explosion.isExplosive ? Math.max(1, ltp * 0.5) : Math.max(1, ltp * 0.7);
      const target = explosion.isExplosive ? ltp * 3 : ltp * 1.5;
      const rr = entry > sl ? (target - entry) / (entry - sl) : 0;
      
      // Risk
      let riskLevel = 'MEDIUM';
      if (moneyness === 'OTM' && timeValuePct > 80) riskLevel = 'HIGH';
      if (moneyness === 'ITM' && oiChange > 0) riskLevel = 'LOW';
      
      const warnings = [];
      if (timeValuePct > 70) warnings.push('High time decay');
      if (moneyness === 'OTM' && distanceFromATM > 500) warnings.push('Deep OTM');
      if (volume < 10000) warnings.push('Low liquidity');
      
      return {
        status: true,
        symbol, strike, optionType, spot, atmStrike, expiry: chainData.expiry,
        optionData: { ltp, oi, volume, oiChange, oiChangePct: Math.round(oiChangePct * 100) / 100 },
        analysis: { moneyness, intrinsicValue: Math.round(intrinsic * 100) / 100, timeValue: Math.round(timeValue * 100) / 100, timeValuePct: Math.round(timeValuePct * 100) / 100, oiSignal, distanceFromATM },
        explosion,
        signal: { action: signal, confidence, reasons },
        levels: { entry: Math.round(entry * 100) / 100, sl: Math.round(sl * 100) / 100, target: Math.round(target * 100) / 100, rr: Math.round(rr * 100) / 100 },
        risk: { level: riskLevel, warnings },
        meta: { timestamp: new Date().toISOString(), execTime: (Date.now() - startTime) + 'ms', source: 'STRIKE_INTELLIGENCE' },
      };
      
    } catch (error) {
      console.error('[StrikeIntel] Error:', error.message);
      return { status: false, error: error.message };
    }
  }

  analyzeExplosion(data) {
    const { ltp, oi, volume, oiChange, oiChangePct, spot, atmStrike, moneyness, distanceFromATM, expiry } = data;
    
    let score = 0;
    const factors = [];
    let explosionType = 'NONE';
    
    // Premium compression (25 pts max)
    if (ltp <= 5) { score += 25; factors.push({ factor: 'ULTRA_LOW_PREMIUM', score: 25 }); explosionType = 'Gamma'; }
    else if (ltp <= 15) { score += 20; factors.push({ factor: 'LOW_PREMIUM', score: 20 }); }
    else if (ltp <= 30) { score += 12; factors.push({ factor: 'MODERATE_PREMIUM', score: 12 }); }
    else if (ltp <= 50) { score += 5; factors.push({ factor: 'ACCEPTABLE_PREMIUM', score: 5 }); }
    
    // Volume spike (20 pts max)
    if (volume >= 500000) { score += 20; factors.push({ factor: 'VOLUME_EXPLOSION', score: 20 }); explosionType = explosionType || 'Breakout'; }
    else if (volume >= 200000) { score += 15; factors.push({ factor: 'VOLUME_SURGE', score: 15 }); }
    else if (volume >= 100000) { score += 8; factors.push({ factor: 'VOLUME_INCREASE', score: 8 }); }
    
    // OI buildup (20 pts max)
    if (oiChangePct > 20 && oiChange > 0) { score += 20; factors.push({ factor: 'MASSIVE_OI_BUILDUP', score: 20 }); if (explosionType === 'NONE') explosionType = 'ShortCover'; }
    else if (oiChangePct > 10 && oiChange > 0) { score += 15; factors.push({ factor: 'STRONG_OI_BUILDUP', score: 15 }); }
    else if (oiChangePct > 5 && oiChange > 0) { score += 8; factors.push({ factor: 'OI_BUILDUP', score: 8 }); }
    if (oiChangePct < -15) { score -= 10; factors.push({ factor: 'OI_UNWINDING', score: -10 }); }
    
    // ATM proximity (15 pts max)
    const distancePct = spot > 0 ? (distanceFromATM / spot) * 100 : 0;
    if (distancePct <= 0.5) { score += 15; factors.push({ factor: 'ATM_STRIKE', score: 15 }); }
    else if (distancePct <= 1) { score += 12; factors.push({ factor: 'NEAR_ATM', score: 12 }); }
    else if (distancePct <= 2) { score += 8; factors.push({ factor: 'CLOSE_TO_ATM', score: 8 }); }
    else if (distancePct > 5) { score -= 5; factors.push({ factor: 'DEEP_OTM_RISK', score: -5 }); }
    
    // Expiry gamma (15 pts max)
    let daysToExpiry = 30;
    if (expiry) {
      try {
        daysToExpiry = Math.max(0, Math.floor((new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24)));
      } catch (e) {}
    }
    if (daysToExpiry === 0) { score += 15; factors.push({ factor: 'EXPIRY_DAY_GAMMA', score: 15 }); explosionType = 'Gamma'; }
    else if (daysToExpiry === 1) { score += 12; factors.push({ factor: 'NEAR_EXPIRY_GAMMA', score: 12 }); }
    else if (daysToExpiry === 2) { score += 8; factors.push({ factor: 'T2_GAMMA_BOOST', score: 8 }); }
    
    // Theta trap penalty
    if (daysToExpiry > 15 && ltp <= 20 && moneyness === 'OTM') {
      score -= 10; factors.push({ factor: 'THETA_TRAP', score: -10 });
    }
    
    const normalizedScore = Math.max(0, Math.min(100, score));
    const isExplosive = normalizedScore >= 50;
    const confidenceTag = normalizedScore >= 70 ? 'HIGH' : (normalizedScore >= 50 ? 'MEDIUM' : 'LOW');
    
    return {
      explosionScore: normalizedScore,
      isExplosive,
      explosionType: isExplosive ? explosionType : 'NONE',
      confidenceTag,
      factors,
      daysToExpiry,
    };
  }

  generateSignal(data) {
    const { optionType, spot, strike, atmStrike, oi, oiChange, oiChangePct, volume, isITM, isATM, explosion } = data;
    
    let signal = 'WAIT';
    let confidence = 'LOW';
    const reasons = [];
    
    if (optionType === 'CE') {
      if (oiChange > 0 && spot > atmStrike) { signal = 'BUY'; confidence = 'MEDIUM'; reasons.push('OI building with bullish bias'); }
      else if (oiChange < 0 && spot < atmStrike) { signal = 'SELL'; confidence = 'MEDIUM'; reasons.push('OI unwinding with bearish bias'); }
    } else {
      if (oiChange > 0 && spot < atmStrike) { signal = 'BUY'; confidence = 'MEDIUM'; reasons.push('OI building with bearish bias'); }
      else if (oiChange < 0 && spot > atmStrike) { signal = 'SELL'; confidence = 'MEDIUM'; reasons.push('OI unwinding with bullish bias'); }
    }
    
    if (explosion.isExplosive) {
      if (signal === 'BUY') { signal = 'STRONG_BUY'; reasons.push(`⚡ Explosive (Score: ${explosion.explosionScore})`); }
      else if (signal === 'WAIT' && explosion.explosionScore >= 60) { signal = 'BUY'; confidence = 'MEDIUM'; reasons.push(`⚡ High explosion score`); }
    }
    
    if (isITM && oiChange > 0 && signal === 'BUY') { confidence = 'HIGH'; reasons.push('ITM with OI support'); }
    if (volume > 100000 && signal !== 'WAIT') reasons.push('High volume');
    
    return { signal, confidence, reasons };
  }
}

module.exports = { StrikeIntelligenceService };
