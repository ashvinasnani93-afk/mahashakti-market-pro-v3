// ==========================================
// WS FOCUS MANAGER - PRODUCTION GRADE
// WITH SINGLETON GUARD & RATE LIMIT PROTECTION
// ==========================================

const { subscribeTokens, unsubscribeTokens, getSubscriptionCount, MAX_SUBSCRIPTIONS_PER_CONNECTION } = require("./angel/angelWebSocket.service");
const { getTopCandidates } = require("./marketScanner.service");
const { getTopNForWebSocket } = require("./rankingEngine.service");

// ==========================================
// CONFIG
// ==========================================
const MAX_FOCUS_TOKENS = 50; // Stay well under Angel's 50 per connection limit
const ROTATION_INTERVAL = 120000; // 2 minutes (reduced from 60s for stability)
const PERFORMANCE_CHECK_INTERVAL = 60000; // 1 minute
const MIN_PERFORMANCE_SCORE = 0.5;

// ==========================================
// SINGLETON GUARD - PREVENT DOUBLE START
// ==========================================
let focusManagerActive = false;
let focusManagerStarting = false;
let rotationTimer = null;
let performanceCheckTimer = null;

// ==========================================
// ACTIVE SUBSCRIPTIONS TRACKING
// ==========================================
const activeSubscriptions = new Map(); // token -> { symbol, score, subscribedAt, lastUpdate, performance }

// ==========================================
// START FOCUS MANAGER (SINGLETON)
// ==========================================
function startFocusManager() {
  // SINGLETON GUARD
  if (focusManagerStarting) {
    console.log("[FOCUS_WS] ⚠️ Start already in progress");
    return { success: false, message: "Start already in progress" };
  }

  if (focusManagerActive) {
    console.log("[FOCUS_WS] ⚠️ Already running");
    return { success: false, message: "Focus manager already active" };
  }

  focusManagerStarting = true;

  try {
    focusManagerActive = true;
    console.log("[FOCUS_WS] 🎯 Starting Smart WebSocket Focus Manager");

    // Wait 5 seconds before first rotation (let scanner stabilize)
    setTimeout(() => {
      performRotation();
    }, 5000);

    // Schedule periodic rotation
    rotationTimer = setInterval(() => {
      performRotation();
    }, ROTATION_INTERVAL);

    // Schedule performance checks
    performanceCheckTimer = setInterval(() => {
      checkPerformance();
    }, PERFORMANCE_CHECK_INTERVAL);

    focusManagerStarting = false;

    return {
      success: true,
      message: "Focus manager started",
      maxTokens: MAX_FOCUS_TOKENS,
      rotationInterval: ROTATION_INTERVAL
    };

  } catch (error) {
    focusManagerStarting = false;
    focusManagerActive = false;
    
    console.error("[FOCUS_WS] ❌ Start error:", error.message);
    
    return {
      success: false,
      error: error.message
    };
  }
}

// ==========================================
// STOP FOCUS MANAGER
// ==========================================
function stopFocusManager() {
  if (!focusManagerActive) {
    return { success: false, message: "Focus manager not running" };
  }

  focusManagerActive = false;
  focusManagerStarting = false;

  if (rotationTimer) {
    clearInterval(rotationTimer);
    rotationTimer = null;
  }

  if (performanceCheckTimer) {
    clearInterval(performanceCheckTimer);
    performanceCheckTimer = null;
  }

  // Unsubscribe all focus tokens
  const tokensToUnsubscribe = Array.from(activeSubscriptions.keys()).map(token => ({
    token,
    exchangeType: 1
  }));

  if (tokensToUnsubscribe.length > 0) {
    unsubscribeTokens(tokensToUnsubscribe, "focus-shutdown");
  }

  activeSubscriptions.clear();

  console.log("[FOCUS_WS] 🛑 Focus manager stopped");

  return { success: true, message: "Focus manager stopped" };
}

// ==========================================
// PERFORM ROTATION - CORE LOGIC
// ==========================================
async function performRotation() {
  // Check if manager still active
  if (!focusManagerActive) {
    console.log("[FOCUS_WS] ⚠️ Manager not active, skipping rotation");
    return;
  }

  try {
    console.log("[FOCUS_WS] 🔄 Performing rotation...");

    // Get current WS subscription count
    const currentWSCount = getSubscriptionCount();
    
    // Reserve slots for core subscriptions (3 indices)
    const availableSlots = MAX_FOCUS_TOKENS - 3;

    console.log(`[FOCUS_WS] Current WS total: ${currentWSCount}, Available for focus: ${availableSlots}`);

    // Get top candidates from scanner
    const scannerCandidates = getTopCandidates(availableSlots * 2); // Get 2x for selection

    if (!scannerCandidates || scannerCandidates.length === 0) {
      console.log("[FOCUS_WS] ⚠️ No candidates from scanner");
      return;
    }

    console.log(`[FOCUS_WS] Scanner provided ${scannerCandidates.length} candidates`);

    // Build priority list
    const priorityList = buildPriorityList(scannerCandidates, availableSlots);

    console.log(`[FOCUS_WS] Priority list built: ${priorityList.length} stocks`);

    // Determine which tokens to subscribe/unsubscribe
    const { toSubscribe, toUnsubscribe } = determineRotation(priorityList);

    // Unsubscribe low-performing tokens first
    if (toUnsubscribe.length > 0) {
      console.log(`[FOCUS_WS] Unsubscribing ${toUnsubscribe.length} tokens`);
      const success = unsubscribeTokens(toUnsubscribe, "focus-rotation");
      
      if (success) {
        toUnsubscribe.forEach(t => {
          activeSubscriptions.delete(t.token);
        });
      }
    }

    // Wait a bit before subscribing (rate limit protection)
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Subscribe to new high-priority tokens
    if (toSubscribe.length > 0) {
      console.log(`[FOCUS_WS] Subscribing ${toSubscribe.length} new tokens`);
      const success = subscribeTokens(toSubscribe, "focus-rotation");
      
      if (success) {
        toSubscribe.forEach(t => {
          activeSubscriptions.set(t.token, {
            symbol: t.symbol,
            exchange: t.exchange,
            score: t.score || 0,
            subscribedAt: Date.now(),
            lastUpdate: Date.now(),
            performance: 1.0,
            reason: t.reason || "scanner"
          });
        });
      }
    }

    console.log(`[FOCUS_WS] ✅ Rotation complete. Active: ${activeSubscriptions.size}/${availableSlots}`);

  } catch (error) {
    console.error("[FOCUS_WS] ❌ Rotation error:", error.message);
  }
}

// ==========================================
// BUILD PRIORITY LIST
// ==========================================
function buildPriorityList(candidates, maxCount) {
  // Score each candidate
  const scored = candidates.map(candidate => {
    let priorityScore = 0;

    // Base score from scanner/ranking
    if (candidate.score) {
      priorityScore += candidate.score;
    }

    // Boost based on reason
    if (candidate.reason) {
      if (candidate.reason.includes("Breakout")) priorityScore += 20;
      if (candidate.reason.includes("Volume")) priorityScore += 15;
      if (candidate.reason.includes("Explosion")) priorityScore += 18;
      if (candidate.reason.includes("Momentum")) priorityScore += 12;
      if (candidate.reason.includes("Rank")) priorityScore += 10;
    }

    // Boost if already subscribed (continuity)
    if (activeSubscriptions.has(candidate.token)) {
      const existing = activeSubscriptions.get(candidate.token);
      priorityScore += existing.performance * 5;
    }

    return {
      ...candidate,
      priorityScore
    };
  });

  // Sort by priority score (descending)
  scored.sort((a, b) => b.priorityScore - a.priorityScore);

  // Take top N
  return scored.slice(0, maxCount);
}

// ==========================================
// DETERMINE ROTATION
// ==========================================
function determineRotation(priorityList) {
  const toSubscribe = [];
  const toUnsubscribe = [];

  const currentTokens = new Set(activeSubscriptions.keys());
  const newTokens = new Set(priorityList.map(c => c.token));

  // Find tokens to unsubscribe (in current but not in new priority list)
  currentTokens.forEach(token => {
    if (!newTokens.has(token)) {
      const sub = activeSubscriptions.get(token);
      toUnsubscribe.push({
        token,
        symbol: sub.symbol,
        exchangeType: sub.exchange === "NSE" ? 1 : sub.exchange === "BSE" ? 2 : 5
      });
    }
  });

  // Find tokens to subscribe (in new priority but not currently subscribed)
  priorityList.forEach(candidate => {
    if (!currentTokens.has(candidate.token)) {
      toSubscribe.push({
        token: candidate.token,
        symbol: candidate.symbol,
        exchange: candidate.exchange,
        exchangeType: candidate.exchange === "NSE" ? 1 : candidate.exchange === "BSE" ? 2 : 5,
        mode: 3, // Full mode
        score: candidate.priorityScore,
        reason: candidate.reason
      });
    }
  });

  // Limit subscriptions to avoid exceeding max
  const availableSlots = MAX_FOCUS_TOKENS - (activeSubscriptions.size - toUnsubscribe.length);
  if (toSubscribe.length > availableSlots) {
    console.log(`[FOCUS_WS] ⚠️ Limiting subscriptions to ${availableSlots} slots`);
    toSubscribe.splice(availableSlots);
  }

  return { toSubscribe, toUnsubscribe };
}

// ==========================================
// CHECK PERFORMANCE
// ==========================================
function checkPerformance() {
  if (!focusManagerActive) return;

  console.log("[FOCUS_WS] 📊 Checking performance...");

  const now = Date.now();
  const lowPerformers = [];

  activeSubscriptions.forEach((data, token) => {
    const timeSubscribed = now - data.subscribedAt;
    const timeSinceUpdate = now - data.lastUpdate;

    let performance = data.performance || 1.0;

    // Degrade performance if no updates
    if (timeSinceUpdate > 60000) {
      performance *= 0.9;
    }

    // Update performance
    data.performance = performance;
    activeSubscriptions.set(token, data);

    // Mark for removal if performance too low
    if (performance < MIN_PERFORMANCE_SCORE && timeSubscribed > 120000) {
      lowPerformers.push({
        token,
        symbol: data.symbol,
        performance,
        exchangeType: data.exchange === "NSE" ? 1 : data.exchange === "BSE" ? 2 : 5
      });
    }
  });

  // Remove low performers
  if (lowPerformers.length > 0) {
    console.log(`[FOCUS_WS] Removing ${lowPerformers.length} low performers`);
    const success = unsubscribeTokens(lowPerformers, "performance-cleanup");
    
    if (success) {
      lowPerformers.forEach(p => {
        activeSubscriptions.delete(p.token);
      });
    }
  }
}

// ==========================================
// GET FOCUS STATUS
// ==========================================
function getFocusStatus() {
  const subscriptions = Array.from(activeSubscriptions.entries()).map(([token, data]) => ({
    token,
    symbol: data.symbol,
    score: data.score,
    performance: data.performance,
    age: Math.floor((Date.now() - data.subscribedAt) / 1000),
    reason: data.reason
  }));

  subscriptions.sort((a, b) => b.score - a.score);

  return {
    active: focusManagerActive,
    starting: focusManagerStarting,
    subscriptionCount: activeSubscriptions.size,
    maxTokens: MAX_FOCUS_TOKENS,
    utilization: ((activeSubscriptions.size / MAX_FOCUS_TOKENS) * 100).toFixed(1),
    subscriptions: subscriptions.slice(0, 50),
    rotationInterval: ROTATION_INTERVAL,
    nextRotation: rotationTimer ? "Active" : "Inactive"
  };
}

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
  startFocusManager,
  stopFocusManager,
  getFocusStatus,
  MAX_FOCUS_TOKENS
};
