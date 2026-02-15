/**
 * EXECUTION REALITY SERVICE - V6 SLIPPAGE GUARD
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE: Block signals when execution risk is too high
 * 
 * BLOCK CONDITIONS:
 * - Spread widening > threshold during entry
 * - Orderbook depth collapses suddenly
 * - 1-min parabolic spike > 4x avg range
 * - Slippage probability high
 * 
 * OUTPUT:
 * - EXECUTION_BLOCK_REASON
 * - SLIPPAGE_RISK_SCORE (0-100)
 * 
 * MUST be HARD BLOCK inside masterSignalGuard BEFORE EMIT
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

class ExecutionRealityService {
    constructor() {
        this.config = {
            // Spread thresholds - V6 ADJUSTED
            spreadWideningThreshold: 80,     // 80% spread widening = block (extreme only)
            maxSpreadEquity: 0.8,            // 0.8% max spread for equity (was 0.5%)
            maxSpreadOption: 18,             // 18% max spread for options (was 15%)
            
            // Orderbook depth
            depthCollapseThreshold: 40,      // 40% depth reduction = block
            minBidDepth: 50,                 // Minimum bid depth (lots)
            minAskDepth: 50,                 // Minimum ask depth (lots)
            
            // Parabolic spike
            parabolicMultiplier: 4,          // 4x avg range = parabolic
            avgRangePeriod: 20,              // 20 candles for avg range
            
            // Slippage estimation
            highSlippageThreshold: 60,       // Slippage score > 60 = risky
            criticalSlippageThreshold: 80    // Slippage score > 80 = block
        };

        this.state = {
            // Spread tracking
            spreadHistory: new Map(),         // token -> [spreads]
            baselineSpreads: new Map(),       // token -> baseline spread
            
            // Depth tracking
            depthHistory: new Map(),          // token -> [depths]
            baselineDepths: new Map(),        // token -> baseline depth
            
            // Range tracking
            rangeHistory: new Map(),          // token -> [candle ranges]
            avgRanges: new Map(),             // token -> avg range
            
            // Block log
            blockLog: []
        };

        console.log('[EXECUTION_REALITY] Initializing execution reality guard...');
        console.log('[EXECUTION_REALITY] Spread threshold: ' + this.config.spreadWideningThreshold + '%');
        console.log('[EXECUTION_REALITY] Parabolic multiplier: ' + this.config.parabolicMultiplier + 'x');
        console.log('[EXECUTION_REALITY] Initialized');
    }

    /**
     * MAIN: Check execution feasibility
     * Called BEFORE final emit in masterSignalGuard
     */
    checkExecution(signal) {
        const result = {
            allowed: true,
            blockReason: null,
            slippageRiskScore: 0,
            checks: [],
            warnings: []
        };

        const token = signal.token || signal.instrument?.token;
        const isOption = signal.isOption || false;

        // ─────────────────────────────────────────────────────────────────────────
        // CHECK 1: Spread widening
        // ─────────────────────────────────────────────────────────────────────────
        const spreadCheck = this.checkSpreadWidening(token, signal.spreadPercent, isOption);
        result.checks.push({ name: 'SPREAD_CHECK', ...spreadCheck });
        
        if (spreadCheck.blocked) {
            result.allowed = false;
            result.blockReason = spreadCheck.reason;
            this.logBlock(token, 'SPREAD_WIDENING', spreadCheck.reason);
            return result;
        }
        
        if (spreadCheck.warning) {
            result.warnings.push(spreadCheck.warning);
        }
        result.slippageRiskScore += spreadCheck.riskContribution || 0;

        // ─────────────────────────────────────────────────────────────────────────
        // CHECK 2: Orderbook depth
        // ─────────────────────────────────────────────────────────────────────────
        const depthCheck = this.checkOrderbookDepth(token, signal.bidDepth, signal.askDepth);
        result.checks.push({ name: 'DEPTH_CHECK', ...depthCheck });
        
        if (depthCheck.blocked) {
            result.allowed = false;
            result.blockReason = depthCheck.reason;
            this.logBlock(token, 'DEPTH_COLLAPSE', depthCheck.reason);
            return result;
        }
        
        if (depthCheck.warning) {
            result.warnings.push(depthCheck.warning);
        }
        result.slippageRiskScore += depthCheck.riskContribution || 0;

        // ─────────────────────────────────────────────────────────────────────────
        // CHECK 3: Parabolic spike detection
        // ─────────────────────────────────────────────────────────────────────────
        const parabolicCheck = this.checkParabolicSpike(token, signal.lastCandle);
        result.checks.push({ name: 'PARABOLIC_CHECK', ...parabolicCheck });
        
        if (parabolicCheck.blocked) {
            result.allowed = false;
            result.blockReason = parabolicCheck.reason;
            this.logBlock(token, 'PARABOLIC_SPIKE', parabolicCheck.reason);
            return result;
        }
        
        if (parabolicCheck.warning) {
            result.warnings.push(parabolicCheck.warning);
        }
        result.slippageRiskScore += parabolicCheck.riskContribution || 0;

        // ─────────────────────────────────────────────────────────────────────────
        // CHECK 4: Overall slippage risk
        // ─────────────────────────────────────────────────────────────────────────
        const slippageCheck = this.calculateSlippageRisk(signal);
        result.checks.push({ name: 'SLIPPAGE_RISK', ...slippageCheck });
        result.slippageRiskScore += slippageCheck.score || 0;
        
        // Cap at 100
        result.slippageRiskScore = Math.min(100, result.slippageRiskScore);

        // Final slippage threshold check
        if (result.slippageRiskScore >= this.config.criticalSlippageThreshold) {
            result.allowed = false;
            result.blockReason = `SLIPPAGE_CRITICAL: Risk score ${result.slippageRiskScore}/100`;
            this.logBlock(token, 'SLIPPAGE_CRITICAL', result.blockReason);
            return result;
        }

        if (result.slippageRiskScore >= this.config.highSlippageThreshold) {
            result.warnings.push(`HIGH_SLIPPAGE_RISK: Score ${result.slippageRiskScore}/100`);
        }

        return result;
    }

    /**
     * Check spread widening
     */
    checkSpreadWidening(token, currentSpread, isOption) {
        const result = {
            blocked: false,
            warning: null,
            riskContribution: 0,
            reason: null
        };

        // Get baseline spread
        let baseline = this.state.baselineSpreads.get(token);
        
        // Update spread history
        if (!this.state.spreadHistory.has(token)) {
            this.state.spreadHistory.set(token, []);
        }
        const history = this.state.spreadHistory.get(token);
        
        if (currentSpread !== undefined && currentSpread !== null) {
            history.push({ spread: currentSpread, timestamp: Date.now() });
            
            // Keep last 100
            if (history.length > 100) history.shift();
            
            // Calculate baseline from historical average
            if (!baseline && history.length >= 10) {
                baseline = history.slice(-20).reduce((s, h) => s + h.spread, 0) / Math.min(20, history.length);
                this.state.baselineSpreads.set(token, baseline);
            }
        }

        // Check absolute spread limits
        const maxSpread = isOption ? this.config.maxSpreadOption : this.config.maxSpreadEquity;
        
        if (currentSpread > maxSpread) {
            result.blocked = true;
            result.reason = `SPREAD_TOO_WIDE: ${currentSpread.toFixed(2)}% > ${maxSpread}% max`;
            return result;
        }

        // Check spread widening
        if (baseline && currentSpread > 0) {
            const wideningPercent = ((currentSpread - baseline) / baseline) * 100;
            
            if (wideningPercent >= this.config.spreadWideningThreshold) {
                result.blocked = true;
                result.reason = `SPREAD_WIDENING: ${wideningPercent.toFixed(1)}% widening (${baseline.toFixed(2)}% → ${currentSpread.toFixed(2)}%)`;
                return result;
            }

            if (wideningPercent >= 25) {
                result.warning = `SPREAD_WARNING: ${wideningPercent.toFixed(1)}% wider than usual`;
            }

            result.riskContribution = Math.min(30, wideningPercent * 0.5);
        }

        return result;
    }

    /**
     * Check orderbook depth
     */
    checkOrderbookDepth(token, bidDepth, askDepth) {
        const result = {
            blocked: false,
            warning: null,
            riskContribution: 0,
            reason: null
        };

        // Get baseline depth
        let baseline = this.state.baselineDepths.get(token);
        
        const currentDepth = (bidDepth || 0) + (askDepth || 0);
        
        // Update depth history
        if (!this.state.depthHistory.has(token)) {
            this.state.depthHistory.set(token, []);
        }
        const history = this.state.depthHistory.get(token);
        
        if (currentDepth > 0) {
            history.push({ depth: currentDepth, timestamp: Date.now() });
            
            // Keep last 100
            if (history.length > 100) history.shift();
            
            // Calculate baseline
            if (!baseline && history.length >= 10) {
                baseline = history.slice(-20).reduce((s, h) => s + h.depth, 0) / Math.min(20, history.length);
                this.state.baselineDepths.set(token, baseline);
            }
        }

        // Check minimum depth
        if (bidDepth !== undefined && bidDepth < this.config.minBidDepth) {
            result.warning = `LOW_BID_DEPTH: ${bidDepth} lots`;
            result.riskContribution += 10;
        }

        if (askDepth !== undefined && askDepth < this.config.minAskDepth) {
            result.warning = `LOW_ASK_DEPTH: ${askDepth} lots`;
            result.riskContribution += 10;
        }

        // Check depth collapse
        if (baseline && currentDepth > 0) {
            const collapsePercent = ((baseline - currentDepth) / baseline) * 100;
            
            if (collapsePercent >= this.config.depthCollapseThreshold) {
                result.blocked = true;
                result.reason = `DEPTH_COLLAPSE: ${collapsePercent.toFixed(1)}% reduction (${baseline.toFixed(0)} → ${currentDepth.toFixed(0)})`;
                return result;
            }

            if (collapsePercent >= 20) {
                result.warning = `DEPTH_WARNING: ${collapsePercent.toFixed(1)}% depth reduction`;
            }

            result.riskContribution += Math.min(20, collapsePercent * 0.3);
        }

        return result;
    }

    /**
     * Check for parabolic spike
     */
    checkParabolicSpike(token, lastCandle) {
        const result = {
            blocked: false,
            warning: null,
            riskContribution: 0,
            reason: null
        };

        if (!lastCandle) return result;

        const currentRange = (lastCandle.high || 0) - (lastCandle.low || 0);
        
        // Update range history
        if (!this.state.rangeHistory.has(token)) {
            this.state.rangeHistory.set(token, []);
        }
        const history = this.state.rangeHistory.get(token);
        
        if (currentRange > 0) {
            history.push({ range: currentRange, timestamp: Date.now() });
            
            // Keep last 100
            if (history.length > 100) history.shift();
            
            // Calculate avg range
            if (history.length >= this.config.avgRangePeriod) {
                const avgRange = history.slice(-this.config.avgRangePeriod)
                    .reduce((s, h) => s + h.range, 0) / this.config.avgRangePeriod;
                this.state.avgRanges.set(token, avgRange);
            }
        }

        // Check parabolic condition
        const avgRange = this.state.avgRanges.get(token);
        
        if (avgRange && currentRange > 0) {
            const rangeMultiple = currentRange / avgRange;
            
            if (rangeMultiple >= this.config.parabolicMultiplier) {
                result.blocked = true;
                result.reason = `PARABOLIC_SPIKE: ${rangeMultiple.toFixed(1)}x avg range (Entry risky)`;
                return result;
            }

            if (rangeMultiple >= 2.5) {
                result.warning = `ELEVATED_VOLATILITY: ${rangeMultiple.toFixed(1)}x avg range`;
            }

            result.riskContribution = Math.min(25, (rangeMultiple - 1) * 10);
        }

        return result;
    }

    /**
     * Calculate overall slippage risk
     */
    calculateSlippageRisk(signal) {
        let score = 0;

        // Price-based slippage estimation
        const price = signal.price || signal.ltp || 0;
        const avgVolume = signal.avgVolume || 0;
        const orderSize = signal.quantity || 1;
        
        // Impact estimation
        if (avgVolume > 0 && orderSize > 0) {
            const volumeRatio = orderSize / avgVolume;
            if (volumeRatio > 0.1) {
                score += Math.min(25, volumeRatio * 100);
            }
        }

        // Volatility contribution
        if (signal.volatility) {
            score += Math.min(15, signal.volatility * 3);
        }

        // Time of day (end of day = higher risk)
        const hour = new Date().getHours();
        if (hour >= 14) {
            score += 10;
        }

        return {
            score: Math.round(score),
            factors: ['volume_impact', 'volatility', 'time_of_day']
        };
    }

    /**
     * Register spread data for a token
     */
    registerSpread(token, spreadPercent) {
        if (!this.state.spreadHistory.has(token)) {
            this.state.spreadHistory.set(token, []);
        }
        
        const history = this.state.spreadHistory.get(token);
        history.push({ spread: spreadPercent, timestamp: Date.now() });
        
        if (history.length > 100) history.shift();
        
        // Update baseline
        if (history.length >= 10) {
            const baseline = history.slice(-20).reduce((s, h) => s + h.spread, 0) / Math.min(20, history.length);
            this.state.baselineSpreads.set(token, baseline);
        }
    }

    /**
     * Register depth data for a token
     */
    registerDepth(token, bidDepth, askDepth) {
        if (!this.state.depthHistory.has(token)) {
            this.state.depthHistory.set(token, []);
        }
        
        const depth = bidDepth + askDepth;
        const history = this.state.depthHistory.get(token);
        history.push({ depth, timestamp: Date.now() });
        
        if (history.length > 100) history.shift();
        
        // Update baseline
        if (history.length >= 10) {
            const baseline = history.slice(-20).reduce((s, h) => s + h.depth, 0) / Math.min(20, history.length);
            this.state.baselineDepths.set(token, baseline);
        }
    }

    /**
     * Register candle for range tracking
     */
    registerCandle(token, candle) {
        if (!this.state.rangeHistory.has(token)) {
            this.state.rangeHistory.set(token, []);
        }
        
        const range = candle.high - candle.low;
        const history = this.state.rangeHistory.get(token);
        history.push({ range, timestamp: Date.now() });
        
        if (history.length > 100) history.shift();
        
        // Update avg range
        if (history.length >= this.config.avgRangePeriod) {
            const avgRange = history.slice(-this.config.avgRangePeriod)
                .reduce((s, h) => s + h.range, 0) / this.config.avgRangePeriod;
            this.state.avgRanges.set(token, avgRange);
        }
    }

    /**
     * Log block event
     */
    logBlock(token, type, reason) {
        this.state.blockLog.push({
            token,
            type,
            reason,
            timestamp: Date.now()
        });

        // Keep last 100 blocks
        if (this.state.blockLog.length > 100) {
            this.state.blockLog.shift();
        }

        console.log(`[EXECUTION_REALITY] 🚫 EXECUTION_BLOCKED: ${type} | ${reason}`);
    }

    /**
     * Get block log
     */
    getBlockLog(count = 20) {
        return this.state.blockLog.slice(-count);
    }

    /**
     * Get stats
     */
    getStats() {
        const blocks = this.state.blockLog;
        const blocksByType = {};
        
        for (const block of blocks) {
            blocksByType[block.type] = (blocksByType[block.type] || 0) + 1;
        }

        return {
            tokensTracked: {
                spread: this.state.spreadHistory.size,
                depth: this.state.depthHistory.size,
                range: this.state.rangeHistory.size
            },
            totalBlocks: blocks.length,
            blocksByType,
            recentBlocks: blocks.slice(-5),
            config: this.config
        };
    }

    /**
     * Reset daily
     */
    resetDaily() {
        // Keep baseline data, clear daily logs
        this.state.blockLog = [];
        console.log('[EXECUTION_REALITY] Daily reset complete');
    }
}

module.exports = new ExecutionRealityService();
