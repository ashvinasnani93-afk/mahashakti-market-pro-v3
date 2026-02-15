/**
 * SIGNAL LIFECYCLE SERVICE - V6 TRACKING LAYER
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE: Track complete signal lifecycle for adaptive learning
 * 
 * TRACKS:
 * - Entry timestamp & context
 * - Regime at entry
 * - Volatility at entry
 * - Exit reason & performance
 * 
 * USED FOR:
 * - Adaptive learning
 * - Regime tightening
 * - Performance analysis
 * - Strategy refinement
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

class SignalLifecycleService {
    constructor() {
        this.state = {
            // Active signals
            activeSignals: new Map(),     // signalId -> signal data
            
            // Completed signals
            completedSignals: [],         // Array of completed signals
            
            // Performance by regime
            regimePerformance: new Map(),  // regime -> { wins, losses, avgPnL }
            
            // Performance by time
            timePerformance: new Map(),    // hour -> { wins, losses, avgPnL }
            
            // Performance by signal type
            typePerformance: new Map(),    // signalType -> { wins, losses, avgPnL }
            
            // Daily stats
            dailyStats: {
                signalsGenerated: 0,
                signalsBlocked: 0,
                signalsEmitted: 0,
                signalsExited: 0,
                totalPnL: 0,
                winCount: 0,
                lossCount: 0
            }
        };

        this.signalIdCounter = 0;

        console.log('[SIGNAL_LIFECYCLE] Initializing signal lifecycle tracker...');
        console.log('[SIGNAL_LIFECYCLE] Initialized');
    }

    /**
     * Generate unique signal ID
     */
    generateSignalId() {
        this.signalIdCounter++;
        return `SIG_${Date.now()}_${this.signalIdCounter}`;
    }

    /**
     * Register signal generation (before guards)
     */
    registerGeneration(signalData) {
        const signalId = this.generateSignalId();
        
        const lifecycle = {
            signalId,
            token: signalData.token,
            symbol: signalData.symbol,
            type: signalData.type,           // BUY/SELL
            direction: signalData.direction, // LONG/SHORT
            isOption: signalData.isOption || false,
            
            // Entry context
            entryPrice: signalData.price,
            entryTime: Date.now(),
            entryHour: new Date().getHours(),
            
            // Market context at entry
            regime: signalData.regime || 'UNKNOWN',
            volatility: signalData.volatility || 0,
            volatilityScore: signalData.volatilityScore || 50,
            breadth: signalData.breadth || 50,
            vwap: signalData.vwap || signalData.price,
            atr: signalData.atr || 0,
            
            // Signal strength
            ignitionStrength: signalData.ignitionStrength || 0,
            confidenceScore: signalData.confidenceScore || 0,
            
            // Guard results (populated during validation)
            guardsExecuted: [],
            guardsPassed: 0,
            guardsFailed: 0,
            blockReason: null,
            
            // Status
            status: 'GENERATED',  // GENERATED -> VALIDATED -> EMITTED/BLOCKED -> ACTIVE -> EXITED
            
            // Exit data (populated on exit)
            exitPrice: null,
            exitTime: null,
            exitReason: null,
            exitType: null,
            pnl: null,
            pnlPercent: null,
            holdingTime: null,
            
            // Tracking
            maxPrice: signalData.price,
            minPrice: signalData.price,
            maxPnL: 0,
            maxDrawdown: 0
        };

        this.state.activeSignals.set(signalId, lifecycle);
        this.state.dailyStats.signalsGenerated++;

        return signalId;
    }

    /**
     * Record guard validation results
     */
    recordValidation(signalId, validationResult) {
        const lifecycle = this.state.activeSignals.get(signalId);
        if (!lifecycle) return;

        lifecycle.guardsExecuted = validationResult.checks || [];
        lifecycle.guardsPassed = validationResult.checks?.filter(c => 
            c.valid !== false && c.allowed !== false && !c.blocked
        ).length || 0;
        lifecycle.guardsFailed = validationResult.checks?.filter(c =>
            c.valid === false || c.allowed === false || c.blocked
        ).length || 0;

        if (validationResult.allowed) {
            lifecycle.status = 'VALIDATED';
        } else {
            lifecycle.status = 'BLOCKED';
            lifecycle.blockReason = validationResult.blockReasons?.[0] || 'UNKNOWN';
            this.state.dailyStats.signalsBlocked++;
            
            // Move to completed immediately
            this.completeSignal(signalId, 'BLOCKED');
        }

        lifecycle.confidenceScore = validationResult.finalConfidence || lifecycle.confidenceScore;
    }

    /**
     * Record signal emission
     */
    recordEmission(signalId) {
        const lifecycle = this.state.activeSignals.get(signalId);
        if (!lifecycle) return;

        lifecycle.status = 'EMITTED';
        lifecycle.emissionTime = Date.now();
        this.state.dailyStats.signalsEmitted++;

        console.log(`[SIGNAL_LIFECYCLE] 📤 Signal emitted: ${lifecycle.symbol} ${lifecycle.type} | ID: ${signalId}`);
    }

    /**
     * Record signal becoming active (position taken)
     */
    recordActive(signalId, actualEntryPrice) {
        const lifecycle = this.state.activeSignals.get(signalId);
        if (!lifecycle) return;

        lifecycle.status = 'ACTIVE';
        lifecycle.actualEntryPrice = actualEntryPrice || lifecycle.entryPrice;
        lifecycle.activeTime = Date.now();

        console.log(`[SIGNAL_LIFECYCLE] ✅ Position active: ${lifecycle.symbol} @ ${lifecycle.actualEntryPrice}`);
    }

    /**
     * Update price tracking for active signal
     */
    updatePrice(signalId, currentPrice) {
        const lifecycle = this.state.activeSignals.get(signalId);
        if (!lifecycle || lifecycle.status !== 'ACTIVE') return;

        // Update price extremes
        lifecycle.maxPrice = Math.max(lifecycle.maxPrice, currentPrice);
        lifecycle.minPrice = Math.min(lifecycle.minPrice, currentPrice);

        // Calculate running PnL
        const entryPrice = lifecycle.actualEntryPrice || lifecycle.entryPrice;
        let currentPnL;
        
        if (lifecycle.direction === 'LONG' || lifecycle.type === 'BUY') {
            currentPnL = ((currentPrice - entryPrice) / entryPrice) * 100;
        } else {
            currentPnL = ((entryPrice - currentPrice) / entryPrice) * 100;
        }

        lifecycle.maxPnL = Math.max(lifecycle.maxPnL, currentPnL);
        lifecycle.maxDrawdown = Math.max(lifecycle.maxDrawdown, lifecycle.maxPnL - currentPnL);
    }

    /**
     * Record signal exit
     */
    recordExit(signalId, exitData) {
        const lifecycle = this.state.activeSignals.get(signalId);
        if (!lifecycle) return;

        lifecycle.status = 'EXITED';
        lifecycle.exitPrice = exitData.price;
        lifecycle.exitTime = Date.now();
        lifecycle.exitReason = exitData.reason;
        lifecycle.exitType = exitData.type;

        // Calculate final PnL
        const entryPrice = lifecycle.actualEntryPrice || lifecycle.entryPrice;
        
        if (lifecycle.direction === 'LONG' || lifecycle.type === 'BUY') {
            lifecycle.pnlPercent = ((lifecycle.exitPrice - entryPrice) / entryPrice) * 100;
        } else {
            lifecycle.pnlPercent = ((entryPrice - lifecycle.exitPrice) / entryPrice) * 100;
        }

        lifecycle.pnl = lifecycle.pnlPercent;
        lifecycle.holdingTime = lifecycle.exitTime - (lifecycle.activeTime || lifecycle.emissionTime || lifecycle.entryTime);

        // Update daily stats
        this.state.dailyStats.signalsExited++;
        this.state.dailyStats.totalPnL += lifecycle.pnlPercent;
        
        if (lifecycle.pnlPercent >= 0) {
            this.state.dailyStats.winCount++;
        } else {
            this.state.dailyStats.lossCount++;
        }

        // Update performance tracking
        this.updatePerformanceTracking(lifecycle);

        // Complete signal
        this.completeSignal(signalId, 'EXITED');

        console.log(`[SIGNAL_LIFECYCLE] 🚪 Signal exited: ${lifecycle.symbol} | PnL: ${lifecycle.pnlPercent.toFixed(2)}% | Reason: ${lifecycle.exitReason}`);
    }

    /**
     * Complete signal and move to history
     */
    completeSignal(signalId, finalStatus) {
        const lifecycle = this.state.activeSignals.get(signalId);
        if (!lifecycle) return;

        lifecycle.finalStatus = finalStatus;
        lifecycle.completedTime = Date.now();

        // Add to completed list
        this.state.completedSignals.push({ ...lifecycle });

        // Keep only last 500 completed signals
        if (this.state.completedSignals.length > 500) {
            this.state.completedSignals.shift();
        }

        // Remove from active
        this.state.activeSignals.delete(signalId);
    }

    /**
     * Update performance tracking by regime, time, type
     */
    updatePerformanceTracking(lifecycle) {
        // By regime
        const regime = lifecycle.regime;
        if (!this.state.regimePerformance.has(regime)) {
            this.state.regimePerformance.set(regime, { wins: 0, losses: 0, totalPnL: 0, count: 0 });
        }
        const regimeStats = this.state.regimePerformance.get(regime);
        regimeStats.count++;
        regimeStats.totalPnL += lifecycle.pnlPercent;
        if (lifecycle.pnlPercent >= 0) regimeStats.wins++;
        else regimeStats.losses++;

        // By entry hour
        const hour = lifecycle.entryHour;
        if (!this.state.timePerformance.has(hour)) {
            this.state.timePerformance.set(hour, { wins: 0, losses: 0, totalPnL: 0, count: 0 });
        }
        const timeStats = this.state.timePerformance.get(hour);
        timeStats.count++;
        timeStats.totalPnL += lifecycle.pnlPercent;
        if (lifecycle.pnlPercent >= 0) timeStats.wins++;
        else timeStats.losses++;

        // By signal type
        const type = lifecycle.type;
        if (!this.state.typePerformance.has(type)) {
            this.state.typePerformance.set(type, { wins: 0, losses: 0, totalPnL: 0, count: 0 });
        }
        const typeStats = this.state.typePerformance.get(type);
        typeStats.count++;
        typeStats.totalPnL += lifecycle.pnlPercent;
        if (lifecycle.pnlPercent >= 0) typeStats.wins++;
        else typeStats.losses++;
    }

    /**
     * Get active signals
     */
    getActiveSignals() {
        return Array.from(this.state.activeSignals.values());
    }

    /**
     * Get completed signals
     */
    getCompletedSignals(count = 50) {
        return this.state.completedSignals.slice(-count);
    }

    /**
     * Get signal by ID
     */
    getSignal(signalId) {
        return this.state.activeSignals.get(signalId) || 
               this.state.completedSignals.find(s => s.signalId === signalId);
    }

    /**
     * Get regime performance analysis
     */
    getRegimePerformance() {
        const result = {};
        
        for (const [regime, stats] of this.state.regimePerformance) {
            result[regime] = {
                ...stats,
                avgPnL: stats.count > 0 ? (stats.totalPnL / stats.count).toFixed(2) + '%' : 'N/A',
                winRate: stats.count > 0 ? ((stats.wins / stats.count) * 100).toFixed(1) + '%' : 'N/A'
            };
        }

        return result;
    }

    /**
     * Get time-based performance analysis
     */
    getTimePerformance() {
        const result = {};
        
        for (const [hour, stats] of this.state.timePerformance) {
            result[`${hour}:00`] = {
                ...stats,
                avgPnL: stats.count > 0 ? (stats.totalPnL / stats.count).toFixed(2) + '%' : 'N/A',
                winRate: stats.count > 0 ? ((stats.wins / stats.count) * 100).toFixed(1) + '%' : 'N/A'
            };
        }

        return result;
    }

    /**
     * Get performance insights for adaptive learning
     */
    getAdaptiveInsights() {
        const insights = {
            bestRegime: null,
            worstRegime: null,
            bestHour: null,
            worstHour: null,
            recommendations: []
        };

        // Find best/worst regime
        let bestRegimeWR = 0;
        let worstRegimeWR = 100;
        
        for (const [regime, stats] of this.state.regimePerformance) {
            if (stats.count < 5) continue;
            const winRate = (stats.wins / stats.count) * 100;
            
            if (winRate > bestRegimeWR) {
                bestRegimeWR = winRate;
                insights.bestRegime = { regime, winRate: winRate.toFixed(1) + '%', count: stats.count };
            }
            if (winRate < worstRegimeWR) {
                worstRegimeWR = winRate;
                insights.worstRegime = { regime, winRate: winRate.toFixed(1) + '%', count: stats.count };
            }
        }

        // Find best/worst hour
        let bestHourWR = 0;
        let worstHourWR = 100;
        
        for (const [hour, stats] of this.state.timePerformance) {
            if (stats.count < 5) continue;
            const winRate = (stats.wins / stats.count) * 100;
            
            if (winRate > bestHourWR) {
                bestHourWR = winRate;
                insights.bestHour = { hour: `${hour}:00`, winRate: winRate.toFixed(1) + '%', count: stats.count };
            }
            if (winRate < worstHourWR) {
                worstHourWR = winRate;
                insights.worstHour = { hour: `${hour}:00`, winRate: winRate.toFixed(1) + '%', count: stats.count };
            }
        }

        // Generate recommendations
        if (insights.worstRegime && worstRegimeWR < 40) {
            insights.recommendations.push(`Avoid trading in ${insights.worstRegime.regime} regime (${insights.worstRegime.winRate} win rate)`);
        }
        if (insights.worstHour && worstHourWR < 40) {
            insights.recommendations.push(`Reduce position size at ${insights.worstHour.hour} (${insights.worstHour.winRate} win rate)`);
        }
        if (insights.bestRegime && bestRegimeWR > 60) {
            insights.recommendations.push(`Increase exposure in ${insights.bestRegime.regime} regime (${insights.bestRegime.winRate} win rate)`);
        }

        return insights;
    }

    /**
     * Get daily stats
     */
    getDailyStats() {
        const stats = this.state.dailyStats;
        const totalTrades = stats.winCount + stats.lossCount;
        
        return {
            ...stats,
            avgPnL: totalTrades > 0 ? (stats.totalPnL / totalTrades).toFixed(2) + '%' : 'N/A',
            winRate: totalTrades > 0 ? ((stats.winCount / totalTrades) * 100).toFixed(1) + '%' : 'N/A',
            blockRate: stats.signalsGenerated > 0 
                ? ((stats.signalsBlocked / stats.signalsGenerated) * 100).toFixed(1) + '%' 
                : 'N/A'
        };
    }

    /**
     * Get full stats
     */
    getStats() {
        return {
            activeSignals: this.state.activeSignals.size,
            completedSignals: this.state.completedSignals.length,
            dailyStats: this.getDailyStats(),
            regimePerformance: this.getRegimePerformance(),
            timePerformance: this.getTimePerformance(),
            insights: this.getAdaptiveInsights()
        };
    }

    /**
     * Reset daily stats
     */
    resetDaily() {
        this.state.dailyStats = {
            signalsGenerated: 0,
            signalsBlocked: 0,
            signalsEmitted: 0,
            signalsExited: 0,
            totalPnL: 0,
            winCount: 0,
            lossCount: 0
        };

        // Clear active signals
        this.state.activeSignals.clear();
        
        console.log('[SIGNAL_LIFECYCLE] Daily reset complete');
    }

    /**
     * Full reset (keep historical performance data)
     */
    fullReset() {
        this.resetDaily();
        this.state.completedSignals = [];
        console.log('[SIGNAL_LIFECYCLE] Full reset complete');
    }
}

module.exports = new SignalLifecycleService();
