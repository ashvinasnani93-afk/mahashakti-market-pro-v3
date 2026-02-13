// ==========================================
// RANKING ENGINE - INSTITUTIONAL GRADE SCORING
// MAHASHAKTI MARKET PRO
// Scores: Momentum, Reversal, Explosion, Liquidity, RR
// ==========================================

// ==========================================
// SCORING WEIGHTS
// ==========================================
const WEIGHTS = {
  momentum: {
    trend: 30,
    priceAction: 25,
    volume: 25,
    rsi: 20
  },
  reversal: {
    rsiDivergence: 35,
    supportResistance: 30,
    volumeConfirmation: 20,
    pricePattern: 15
  },
  explosion: {
    compression: 40,
    volumeBuildup: 30,
    breakoutProximity: 20,
    institutionalFlow: 10
  }
};

// Thresholds
const MIN_LIQUIDITY_VOLUME = 100000;
const MIN_RR_RATIO = 1.2; // Minimum 1:2 reward-risk

// ==========================================
// RANK STOCKS - MAIN FUNCTION
// ==========================================
function rankStocks(scanResults) {
  if (!scanResults || !scanResults.data) {
    return {
      success: false,
      message: \"Invalid scan results\"
    };
  }

  console.log(\"[RANKING] 🎯 Starting ranking engine...\");

  const startTime = Date.now();
  
  // Extract all stocks from scan categories
  const allStocks = extractAllStocks(scanResults);

  console.log(`[RANKING] Processing ${allStocks.length} stocks`);

  // Score each stock
  const scoredStocks = allStocks.map(stock => {
    const scores = {
      momentum: calculateMomentumScore(stock),
      reversal: calculateReversalScore(stock),
      explosion: calculateExplosionScore(stock),
      liquidity: calculateLiquidityScore(stock),
      riskReward: calculateRiskRewardScore(stock)
    };

    const totalScore = (
      scores.momentum.total +
      scores.reversal.total +
      scores.explosion.total +
      scores.liquidity.score +
      scores.riskReward.score
    );

    return {
      ...stock,
      scores,
      totalScore: parseFloat(totalScore.toFixed(2)),
      rank: 0 // Will be assigned after sorting
    };
  });

  // Sort by total score
  scoredStocks.sort((a, b) => b.totalScore - a.totalScore);

  // Assign ranks
  scoredStocks.forEach((stock, index) => {
    stock.rank = index + 1;
  });

  // Apply filters
  const filtered = applyFilters(scoredStocks);

  const duration = Date.now() - startTime;

  console.log(`[RANKING] ✅ Ranking complete in ${duration}ms`);
  console.log(`[RANKING] Top Score: ${filtered.topRanked[0]?.totalScore || 0}`);

  return {
    success: true,
    timestamp: new Date().toISOString(),
    totalProcessed: allStocks.length,
    totalRanked: scoredStocks.length,
    topRanked: filtered.topRanked,
    momentumLeaders: filtered.momentumLeaders,
    reversalCandidates: filtered.reversalCandidates,
    explosionSetups: filtered.explosionSetups,
    liquidFiltered: filtered.liquidFiltered.length,
    rrFiltered: filtered.rrFiltered.length,
    duration
  };
}

// ==========================================
// EXTRACT ALL STOCKS FROM SCAN RESULTS
// ==========================================
function extractAllStocks(scanResults) {
  const stockMap = new Map();
  const data = scanResults.data;

  // Collect from all categories
  const categories = [
    data.topMovers,
    data.volumeSpikes,
    data.breakouts,
    data.preBreakouts,
    data.rangeExpansions,
    data.vwapDeviations
  ];

  categories.forEach(category => {
    if (Array.isArray(category)) {
      category.forEach(stock => {
        if (!stockMap.has(stock.symbol)) {
          stockMap.set(stock.symbol, stock);
        }
      });
    }
  });

  return Array.from(stockMap.values());
}

// ==========================================
// CALCULATE MOMENTUM SCORE
// ==========================================
function calculateMomentumScore(stock) {
  const { quote, metrics, patterns } = stock;
  
  let trendScore = 0;
  let priceActionScore = 0;
  let volumeScore = 0;
  let rsiScore = 0;

  // Trend Score (based on % change and position in range)
  const absChange = Math.abs(metrics.changePercent);
  if (absChange > 3) trendScore = 30;
  else if (absChange > 2) trendScore = 25;
  else if (absChange > 1) trendScore = 15;
  else if (absChange > 0.5) trendScore = 5;

  // Price Action Score (candle strength and position)
  if (metrics.positionInRange >= 0.9) priceActionScore += 15;
  else if (metrics.positionInRange >= 0.7) priceActionScore += 10;
  else if (metrics.positionInRange >= 0.5) priceActionScore += 5;

  if (metrics.bodyPercent > 70) priceActionScore += 10;
  else if (metrics.bodyPercent > 50) priceActionScore += 5;

  // Volume Score
  if (patterns.volumeSpike) volumeScore += 25;
  else if (metrics.volumeRatio >= 1.2) volumeScore += 15;
  else if (metrics.volumeRatio >= 1.0) volumeScore += 10;
  else if (metrics.volumeRatio >= 0.8) volumeScore += 5;

  // RSI Score (estimate based on price action)
  const estimatedRSI = estimateRSI(metrics);
  if (estimatedRSI >= 50 && estimatedRSI <= 70) rsiScore = 20;
  else if (estimatedRSI > 70 && estimatedRSI <= 75) rsiScore = 15;
  else if (estimatedRSI >= 40 && estimatedRSI < 50) rsiScore = 10;
  else if (estimatedRSI < 40 || estimatedRSI > 75) rsiScore = 5;

  const total = trendScore + priceActionScore + volumeScore + rsiScore;

  return {
    total: parseFloat(total.toFixed(2)),
    breakdown: {
      trend: trendScore,
      priceAction: priceActionScore,
      volume: volumeScore,
      rsi: rsiScore
    }
  };
}

// ==========================================
// CALCULATE REVERSAL SCORE
// ==========================================
function calculateReversalScore(stock) {
  const { quote, metrics, patterns } = stock;
  
  let divergenceScore = 0;
  let supportResistanceScore = 0;
  let volumeConfirmationScore = 0;
  let patternScore = 0;

  // RSI Divergence (estimated)
  const estimatedRSI = estimateRSI(metrics);
  if (estimatedRSI <= 30) divergenceScore = 35; // Oversold
  else if (estimatedRSI >= 70) divergenceScore = 35; // Overbought
  else if (estimatedRSI <= 40) divergenceScore = 20;
  else if (estimatedRSI >= 60) divergenceScore = 20;

  // Support/Resistance (based on position in range)
  if (metrics.positionInRange <= 0.1) supportResistanceScore = 30; // Near support
  else if (metrics.positionInRange >= 0.9) supportResistanceScore = 30; // Near resistance
  else if (metrics.positionInRange <= 0.3) supportResistanceScore = 15;
  else if (metrics.positionInRange >= 0.7) supportResistanceScore = 15;

  // Volume Confirmation
  if (patterns.volumeSpike) volumeConfirmationScore = 20;
  else if (metrics.volumeRatio >= 1.2) volumeConfirmationScore = 15;
  else if (metrics.volumeRatio >= 1.0) volumeConfirmationScore = 10;

  // Pattern Score (compression, VWAP bounce)
  if (patterns.compression) patternScore += 8;
  if (patterns.vwapBounce) patternScore += 7;

  const total = divergenceScore + supportResistanceScore + volumeConfirmationScore + patternScore;

  return {
    total: parseFloat(total.toFixed(2)),
    breakdown: {
      divergence: divergenceScore,
      supportResistance: supportResistanceScore,
      volume: volumeConfirmationScore,
      pattern: patternScore
    }
  };
}

// ==========================================
// CALCULATE EXPLOSION SCORE
// ==========================================
function calculateExplosionScore(stock) {
  const { quote, metrics, patterns } = stock;
  
  let compressionScore = 0;
  let volumeBuildupScore = 0;
  let breakoutProximityScore = 0;
  let institutionalScore = 0;

  // Compression Score
  if (patterns.compression && patterns.volumeSpike) compressionScore = 40;
  else if (patterns.compression) compressionScore = 30;
  else if (metrics.rangePercent < 1.5) compressionScore = 15;

  // Volume Buildup Score
  if (metrics.volumeRatio >= 2.0) volumeBuildupScore = 30;
  else if (metrics.volumeRatio >= 1.5) volumeBuildupScore = 25;
  else if (metrics.volumeRatio >= 1.2) volumeBuildupScore = 15;
  else if (metrics.volumeRatio >= 1.0) volumeBuildupScore = 10;

  // Breakout Proximity Score
  if (patterns.breakout) breakoutProximityScore = 20;
  else if (patterns.preBreakout) breakoutProximityScore = 15;
  else if (metrics.positionInRange >= 0.85) breakoutProximityScore = 10;

  // Institutional Flow (based on buy/sell ratio)
  if (metrics.buyingPressure >= 0.65) institutionalScore = 10;
  else if (metrics.buyingPressure >= 0.55) institutionalScore = 7;
  else if (metrics.buyingPressure <= 0.35) institutionalScore = 10; // Selling pressure
  else if (metrics.buyingPressure <= 0.45) institutionalScore = 7;

  const total = compressionScore + volumeBuildupScore + breakoutProximityScore + institutionalScore;

  return {
    total: parseFloat(total.toFixed(2)),
    breakdown: {
      compression: compressionScore,
      volumeBuildup: volumeBuildupScore,
      breakoutProximity: breakoutProximityScore,
      institutional: institutionalScore
    }
  };
}

// ==========================================
// CALCULATE LIQUIDITY SCORE
// ==========================================
function calculateLiquidityScore(stock) {
  const { quote } = stock;
  const volume = quote.volume || 0;

  let score = 0;

  if (volume >= 10000000) score = 20; // 1 crore+
  else if (volume >= 5000000) score = 18;
  else if (volume >= 2000000) score = 15;
  else if (volume >= 1000000) score = 12;
  else if (volume >= 500000) score = 10;
  else if (volume >= MIN_LIQUIDITY_VOLUME) score = 5;
  else score = 0; // Reject

  return {
    score,
    volume,
    isLiquid: score > 0
  };
}

// ==========================================
// CALCULATE RISK-REWARD SCORE
// ==========================================
function calculateRiskRewardScore(stock) {
  const { quote, metrics } = stock;
  const { high, low, close } = quote;

  // Estimate support and resistance
  const estimatedSupport = low;
  const estimatedResistance = high;

  // Calculate risk (distance to support)
  const risk = close - estimatedSupport;
  
  // Calculate reward (distance to resistance)
  const reward = estimatedResistance - close;

  // Calculate RR ratio
  const rrRatio = risk > 0 ? reward / risk : 0;

  let score = 0;

  if (rrRatio >= 3) score = 20; // 1:3 or better
  else if (rrRatio >= 2) score = 15; // 1:2
  else if (rrRatio >= 1.5) score = 10; // 1:1.5
  else if (rrRatio >= MIN_RR_RATIO) score = 5;
  else score = 0; // Reject

  return {
    score,
    rrRatio: parseFloat(rrRatio.toFixed(2)),
    risk: parseFloat(risk.toFixed(2)),
    reward: parseFloat(reward.toFixed(2)),
    isGoodRR: rrRatio >= MIN_RR_RATIO
  };
}

// ==========================================
// ESTIMATE RSI (SIMPLE HEURISTIC)
// ==========================================
function estimateRSI(metrics) {
  // Rough RSI estimate based on price action
  const { changePercent, positionInRange } = metrics;

  // Base RSI on position and momentum
  let rsi = 50 + (changePercent * 5);

  // Adjust based on position in range
  rsi += (positionInRange - 0.5) * 20;

  // Clamp to 0-100
  rsi = Math.max(0, Math.min(100, rsi));

  return parseFloat(rsi.toFixed(2));
}

// ==========================================
// APPLY FILTERS
// ==========================================
function applyFilters(scoredStocks) {
  // Top 50 overall
  const topRanked = scoredStocks.slice(0, 50);

  // Top momentum (momentum score > 50)
  const momentumLeaders = scoredStocks
    .filter(s => s.scores.momentum.total >= 50)
    .sort((a, b) => b.scores.momentum.total - a.scores.momentum.total)
    .slice(0, 30);

  // Top reversal (reversal score > 40)
  const reversalCandidates = scoredStocks
    .filter(s => s.scores.reversal.total >= 40)
    .sort((a, b) => b.scores.reversal.total - a.scores.reversal.total)
    .slice(0, 30);

  // Top explosion (explosion score > 50)
  const explosionSetups = scoredStocks
    .filter(s => s.scores.explosion.total >= 50)
    .sort((a, b) => b.scores.explosion.total - a.scores.explosion.total)
    .slice(0, 30);

  // Liquidity filtered
  const liquidFiltered = scoredStocks.filter(s => s.scores.liquidity.isLiquid);

  // RR filtered
  const rrFiltered = scoredStocks.filter(s => s.scores.riskReward.isGoodRR);

  // Combined filter (liquid + good RR)
  const qualityStocks = scoredStocks.filter(s => 
    s.scores.liquidity.isLiquid && s.scores.riskReward.isGoodRR
  );

  return {
    topRanked,
    momentumLeaders,
    reversalCandidates,
    explosionSetups,
    liquidFiltered,
    rrFiltered,
    qualityStocks
  };
}

// ==========================================
// GET TOP N CANDIDATES (FOR WS FOCUS)
// ==========================================
function getTopNForWebSocket(rankedResults, n = 100) {
  if (!rankedResults || !rankedResults.success) {
    return [];
  }

  const candidates = new Set();

  // Top 50 overall
  rankedResults.topRanked?.slice(0, 50).forEach(stock => {
    candidates.add({
      symbol: stock.symbol,
      exchange: stock.exchange,
      token: stock.token,
      score: stock.totalScore,
      reason: `Rank #${stock.rank}`
    });
  });

  // Top 30 momentum
  rankedResults.momentumLeaders?.slice(0, 30).forEach(stock => {
    candidates.add({
      symbol: stock.symbol,
      exchange: stock.exchange,
      token: stock.token,
      score: stock.totalScore,
      reason: `Momentum: ${stock.scores.momentum.total}`
    });
  });

  // Top 20 explosion
  rankedResults.explosionSetups?.slice(0, 20).forEach(stock => {
    candidates.add({
      symbol: stock.symbol,
      exchange: stock.exchange,
      token: stock.token,
      score: stock.totalScore,
      reason: `Explosion: ${stock.scores.explosion.total}`
    });
  });

  const candidateArray = Array.from(candidates);
  
  // Sort by score
  candidateArray.sort((a, b) => b.score - a.score);

  return candidateArray.slice(0, n);
}

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
  rankStocks,
  getTopNForWebSocket,
  calculateMomentumScore,
  calculateReversalScore,
  calculateExplosionScore,
  calculateLiquidityScore,
  calculateRiskRewardScore,
  WEIGHTS,
  MIN_LIQUIDITY_VOLUME,
  MIN_RR_RATIO
};
