/**
 * PORTFOLIO COMMANDER SERVICE - V6 RISK LAYER
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE: Portfolio-level risk management before final emit
 * 
 * RESPONSIBILITIES:
 * - Max simultaneous trades enforcement
 * - Correlation check between open signals
 * - Max capital exposure per regime
 * - Loss streak lock (X losses → freeze signals)
 * 
 * ACTIONS:
 * - Can HARD BLOCK signal
 * - Can DOWNGRADE signal confidence
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

class PortfolioCommanderService {
    constructor() {
        this.config = {
            // Position limits
            maxSimultaneousTrades: 5,
            maxTradesPerSector: 2,
            maxTradesPerUnderlying: 2,
            
            // Correlation
            highCorrelationThreshold: 0.7,
            maxHighCorrelationPairs: 2,
            
            // Capital exposure by regime
            exposureLimits: {
                COMPRESSION: 0.3,    // 30% max exposure
                EXPANSION: 0.6,      // 60% max exposure
                TREND_DAY: 0.7,      // 70% max exposure
                RANGE_DAY: 0.4,      // 40% max exposure
                PANIC_DAY: 0.1,      // 10% max - defensive
                UNKNOWN: 0.4
            },
            
            // Loss streak
            lossStreakLock: 3,        // Lock after 3 consecutive losses
            lockDurationMinutes: 60,   // Lock for 60 minutes
            dailyLossLimit: 5,         // Max 5% daily loss
            
            // Per-trade risk
            maxRiskPerTrade: 2,        // 2% max risk per trade
            totalCapital: 1000000      // Default 10L (configurable)
        };

        this.state = {
            activePositions: new Map(),  // token -> position data
            closedToday: [],             // Today's closed positions
            
            // Streak tracking
            consecutiveLosses: 0,
            consecutiveWins: 0,
            lastTradeResult: null,
            
            // Lock state
            isLocked: false,
            lockUntil: null,
            lockReason: null,
            
            // Daily tracking
            dailyPnL: 0,
            dailyPnLPercent: 0,
            totalExposure: 0,
            
            // Correlation matrix
            correlationMatrix: new Map()
        };

        // Sector correlations (hardcoded for speed)
        this.sectorCorrelations = {
            'BANKING': { 'FINANCIALS': 0.85, 'NBFC': 0.75 },
            'IT': { 'TECH': 0.9 },
            'AUTO': { 'METAL': 0.6 },
            'PHARMA': { 'HEALTHCARE': 0.8 }
        };

        console.log('[PORTFOLIO_COMMANDER] Initializing portfolio risk commander...');
        console.log('[PORTFOLIO_COMMANDER] Max trades: ' + this.config.maxSimultaneousTrades);
        console.log('[PORTFOLIO_COMMANDER] Loss streak lock: ' + this.config.lossStreakLock);
        console.log('[PORTFOLIO_COMMANDER] Initialized');
    }

    /**
     * MAIN: Check if signal should be allowed
     * Called BEFORE final emit
     */
    checkSignal(signal, regime = 'UNKNOWN') {
        const result = {
            allowed: true,
            action: 'EMIT',          // EMIT, BLOCK, DOWNGRADE
            blockReason: null,
            downgradeFactor: 1.0,    // 1.0 = no change, 0.8 = 20% downgrade
            warnings: [],
            checks: []
        };

        const token = signal.token || signal.instrument?.token;
        const symbol = signal.symbol || signal.instrument?.symbol;
        const sector = signal.sector || this.getSector(symbol);
        const underlying = signal.underlying || this.getUnderlying(symbol);
        const riskAmount = signal.riskAmount || this.calculateRiskAmount(signal);

        // ─────────────────────────────────────────────────────────────────────────
        // CHECK 1: Lock status
        // ─────────────────────────────────────────────────────────────────────────
        const lockCheck = this.checkLockStatus();
        result.checks.push({ name: 'LOCK_STATUS', ...lockCheck });
        
        if (!lockCheck.allowed) {
            result.allowed = false;
            result.action = 'BLOCK';
            result.blockReason = lockCheck.reason;
            return result;
        }

        // ─────────────────────────────────────────────────────────────────────────
        // CHECK 2: Max simultaneous trades
        // ─────────────────────────────────────────────────────────────────────────
        const positionCountCheck = this.checkPositionCount();
        result.checks.push({ name: 'POSITION_COUNT', ...positionCountCheck });
        
        if (!positionCountCheck.allowed) {
            result.allowed = false;
            result.action = 'BLOCK';
            result.blockReason = positionCountCheck.reason;
            return result;
        }

        // ─────────────────────────────────────────────────────────────────────────
        // CHECK 3: Sector concentration
        // ─────────────────────────────────────────────────────────────────────────
        const sectorCheck = this.checkSectorConcentration(sector);
        result.checks.push({ name: 'SECTOR_CONCENTRATION', ...sectorCheck });
        
        if (!sectorCheck.allowed) {
            result.allowed = false;
            result.action = 'BLOCK';
            result.blockReason = sectorCheck.reason;
            return result;
        }

        // ─────────────────────────────────────────────────────────────────────────
        // CHECK 4: Underlying concentration (for options)
        // ─────────────────────────────────────────────────────────────────────────
        if (signal.isOption) {
            const underlyingCheck = this.checkUnderlyingConcentration(underlying);
            result.checks.push({ name: 'UNDERLYING_CONCENTRATION', ...underlyingCheck });
            
            if (!underlyingCheck.allowed) {
                result.allowed = false;
                result.action = 'BLOCK';
                result.blockReason = underlyingCheck.reason;
                return result;
            }
        }

        // ─────────────────────────────────────────────────────────────────────────
        // CHECK 5: Correlation with existing positions
        // ─────────────────────────────────────────────────────────────────────────
        const correlationCheck = this.checkCorrelation(symbol, sector);
        result.checks.push({ name: 'CORRELATION', ...correlationCheck });
        
        if (correlationCheck.highCorrelation) {
            if (correlationCheck.blocked) {
                result.allowed = false;
                result.action = 'BLOCK';
                result.blockReason = correlationCheck.reason;
                return result;
            } else {
                result.downgradeFactor *= 0.85;  // 15% confidence downgrade
                result.warnings.push(correlationCheck.reason);
            }
        }

        // ─────────────────────────────────────────────────────────────────────────
        // CHECK 6: Capital exposure by regime
        // ─────────────────────────────────────────────────────────────────────────
        const exposureCheck = this.checkExposureLimit(riskAmount, regime);
        result.checks.push({ name: 'EXPOSURE_LIMIT', ...exposureCheck });
        
        if (!exposureCheck.allowed) {
            result.allowed = false;
            result.action = 'BLOCK';
            result.blockReason = exposureCheck.reason;
            return result;
        }

        // ─────────────────────────────────────────────────────────────────────────
        // CHECK 7: Daily loss limit
        // ─────────────────────────────────────────────────────────────────────────
        const dailyLossCheck = this.checkDailyLossLimit();
        result.checks.push({ name: 'DAILY_LOSS_LIMIT', ...dailyLossCheck });
        
        if (!dailyLossCheck.allowed) {
            result.allowed = false;
            result.action = 'BLOCK';
            result.blockReason = dailyLossCheck.reason;
            return result;
        }

        // ─────────────────────────────────────────────────────────────────────────
        // CHECK 8: Loss streak warning (downgrade but don't block)
        // ─────────────────────────────────────────────────────────────────────────
        if (this.state.consecutiveLosses >= 2) {
            result.downgradeFactor *= 0.9;  // 10% downgrade per 2 losses
            result.warnings.push(`LOSS_STREAK: ${this.state.consecutiveLosses} consecutive losses`);
        }

        // Final action determination
        if (result.downgradeFactor < 1.0) {
            result.action = 'DOWNGRADE';
        }

        return result;
    }

    /**
     * Check lock status
     */
    checkLockStatus() {
        if (!this.state.isLocked) {
            return { allowed: true };
        }

        if (this.state.lockUntil && Date.now() > this.state.lockUntil) {
            // Lock expired
            this.state.isLocked = false;
            this.state.lockUntil = null;
            this.state.lockReason = null;
            console.log('[PORTFOLIO_COMMANDER] Lock expired');
            return { allowed: true };
        }

        return {
            allowed: false,
            reason: `PORTFOLIO_LOCKED: ${this.state.lockReason}`,
            lockRemaining: Math.round((this.state.lockUntil - Date.now()) / 60000)
        };
    }

    /**
     * Check position count
     */
    checkPositionCount() {
        const activeCount = this.state.activePositions.size;
        
        if (activeCount >= this.config.maxSimultaneousTrades) {
            return {
                allowed: false,
                reason: `MAX_POSITIONS: ${activeCount}/${this.config.maxSimultaneousTrades} trades active`
            };
        }

        return {
            allowed: true,
            currentCount: activeCount,
            maxCount: this.config.maxSimultaneousTrades
        };
    }

    /**
     * Check sector concentration
     */
    checkSectorConcentration(sector) {
        if (!sector) {
            return { allowed: true };
        }

        let sectorCount = 0;
        for (const [_, position] of this.state.activePositions) {
            if (position.sector === sector) {
                sectorCount++;
            }
        }

        if (sectorCount >= this.config.maxTradesPerSector) {
            return {
                allowed: false,
                reason: `SECTOR_CONCENTRATION: ${sectorCount}/${this.config.maxTradesPerSector} trades in ${sector}`
            };
        }

        return {
            allowed: true,
            sectorCount,
            maxPerSector: this.config.maxTradesPerSector
        };
    }

    /**
     * Check underlying concentration (for options)
     */
    checkUnderlyingConcentration(underlying) {
        if (!underlying) {
            return { allowed: true };
        }

        let underlyingCount = 0;
        for (const [_, position] of this.state.activePositions) {
            if (position.underlying === underlying) {
                underlyingCount++;
            }
        }

        if (underlyingCount >= this.config.maxTradesPerUnderlying) {
            return {
                allowed: false,
                reason: `UNDERLYING_CONCENTRATION: ${underlyingCount}/${this.config.maxTradesPerUnderlying} trades on ${underlying}`
            };
        }

        return {
            allowed: true,
            underlyingCount,
            maxPerUnderlying: this.config.maxTradesPerUnderlying
        };
    }

    /**
     * Check correlation with existing positions
     */
    checkCorrelation(symbol, sector) {
        const result = {
            highCorrelation: false,
            blocked: false,
            correlatedWith: [],
            reason: null
        };

        let highCorrelationCount = 0;

        for (const [_, position] of this.state.activePositions) {
            const correlation = this.getCorrelation(sector, position.sector);
            
            if (correlation >= this.config.highCorrelationThreshold) {
                highCorrelationCount++;
                result.correlatedWith.push({
                    symbol: position.symbol,
                    correlation
                });
            }
        }

        if (highCorrelationCount > 0) {
            result.highCorrelation = true;
            result.reason = `HIGH_CORRELATION: ${highCorrelationCount} correlated positions`;

            if (highCorrelationCount >= this.config.maxHighCorrelationPairs) {
                result.blocked = true;
                result.reason = `CORRELATION_LIMIT: ${highCorrelationCount}/${this.config.maxHighCorrelationPairs} max correlated pairs`;
            }
        }

        return result;
    }

    /**
     * Check exposure limit by regime
     */
    checkExposureLimit(riskAmount, regime) {
        const maxExposure = this.config.exposureLimits[regime] || this.config.exposureLimits.UNKNOWN;
        const maxExposureAmount = this.config.totalCapital * maxExposure;
        
        const newTotalExposure = this.state.totalExposure + riskAmount;

        if (newTotalExposure > maxExposureAmount) {
            return {
                allowed: false,
                reason: `EXPOSURE_LIMIT: ${(newTotalExposure / this.config.totalCapital * 100).toFixed(1)}% > ${(maxExposure * 100).toFixed(1)}% (${regime})`
            };
        }

        return {
            allowed: true,
            currentExposure: this.state.totalExposure,
            newExposure: newTotalExposure,
            maxExposure: maxExposureAmount,
            regime
        };
    }

    /**
     * Check daily loss limit
     */
    checkDailyLossLimit() {
        if (this.state.dailyPnLPercent <= -this.config.dailyLossLimit) {
            return {
                allowed: false,
                reason: `DAILY_LOSS_LIMIT: ${this.state.dailyPnLPercent.toFixed(2)}% < -${this.config.dailyLossLimit}%`
            };
        }

        return {
            allowed: true,
            dailyPnL: this.state.dailyPnLPercent
        };
    }

    /**
     * Register a new position
     */
    registerPosition(token, positionData) {
        this.state.activePositions.set(token, {
            token,
            symbol: positionData.symbol,
            sector: positionData.sector || this.getSector(positionData.symbol),
            underlying: positionData.underlying,
            direction: positionData.direction,
            entryPrice: positionData.entryPrice,
            quantity: positionData.quantity,
            riskAmount: positionData.riskAmount || 0,
            entryTime: Date.now()
        });

        // Update total exposure
        this.state.totalExposure += positionData.riskAmount || 0;

        console.log(`[PORTFOLIO_COMMANDER] Position added: ${positionData.symbol} | Active: ${this.state.activePositions.size}`);
    }

    /**
     * Record position close
     */
    recordClose(token, pnl, pnlPercent) {
        const position = this.state.activePositions.get(token);
        if (!position) return;

        // Update exposure
        this.state.totalExposure -= position.riskAmount || 0;
        this.state.totalExposure = Math.max(0, this.state.totalExposure);

        // Update daily PnL
        this.state.dailyPnL += pnl;
        this.state.dailyPnLPercent = (this.state.dailyPnL / this.config.totalCapital) * 100;

        // Update streak
        if (pnl >= 0) {
            this.state.consecutiveWins++;
            this.state.consecutiveLosses = 0;
            this.state.lastTradeResult = 'WIN';
        } else {
            this.state.consecutiveLosses++;
            this.state.consecutiveWins = 0;
            this.state.lastTradeResult = 'LOSS';

            // Check for lock trigger
            if (this.state.consecutiveLosses >= this.config.lossStreakLock) {
                this.triggerLock(`${this.config.lossStreakLock} consecutive losses`);
            }
        }

        // Record to closed list
        this.state.closedToday.push({
            ...position,
            pnl,
            pnlPercent,
            closeTime: Date.now()
        });

        // Remove from active
        this.state.activePositions.delete(token);

        console.log(`[PORTFOLIO_COMMANDER] Position closed: ${position.symbol} | PnL: ${pnlPercent.toFixed(2)}% | Streak: ${this.state.consecutiveLosses > 0 ? -this.state.consecutiveLosses : this.state.consecutiveWins}`);
    }

    /**
     * Trigger portfolio lock
     */
    triggerLock(reason) {
        this.state.isLocked = true;
        this.state.lockUntil = Date.now() + (this.config.lockDurationMinutes * 60 * 1000);
        this.state.lockReason = reason;

        console.log(`[PORTFOLIO_COMMANDER] 🔒 PORTFOLIO_LOCKED: ${reason} | Until: ${new Date(this.state.lockUntil).toLocaleTimeString()}`);
    }

    /**
     * Manual unlock
     */
    unlock() {
        this.state.isLocked = false;
        this.state.lockUntil = null;
        this.state.lockReason = null;
        console.log('[PORTFOLIO_COMMANDER] Portfolio unlocked');
    }

    /**
     * Get correlation between sectors
     */
    getCorrelation(sector1, sector2) {
        if (!sector1 || !sector2) return 0;
        if (sector1 === sector2) return 1;

        const correlations = this.sectorCorrelations[sector1];
        if (correlations && correlations[sector2]) {
            return correlations[sector2];
        }

        // Check reverse
        const reverseCorrelations = this.sectorCorrelations[sector2];
        if (reverseCorrelations && reverseCorrelations[sector1]) {
            return reverseCorrelations[sector1];
        }

        return 0.3; // Default low correlation
    }

    /**
     * Get sector from symbol (simplified)
     */
    getSector(symbol) {
        if (!symbol) return null;
        
        const sectorMap = {
            'RELIANCE': 'OIL_GAS',
            'HDFCBANK': 'BANKING',
            'ICICIBANK': 'BANKING',
            'SBIN': 'BANKING',
            'INFY': 'IT',
            'TCS': 'IT',
            'WIPRO': 'IT',
            'TATAMOTORS': 'AUTO',
            'MARUTI': 'AUTO',
            'SUNPHARMA': 'PHARMA',
            'DRREDDY': 'PHARMA'
        };

        return sectorMap[symbol] || 'OTHER';
    }

    /**
     * Get underlying from option symbol
     */
    getUnderlying(symbol) {
        if (!symbol) return null;
        
        if (symbol.includes('NIFTY')) return 'NIFTY';
        if (symbol.includes('BANKNIFTY')) return 'BANKNIFTY';
        if (symbol.includes('FINNIFTY')) return 'FINNIFTY';
        
        return null;
    }

    /**
     * Calculate risk amount for signal
     */
    calculateRiskAmount(signal) {
        const price = signal.price || signal.entryPrice || 0;
        const quantity = signal.quantity || 1;
        const riskPercent = this.config.maxRiskPerTrade / 100;
        
        return price * quantity * riskPercent;
    }

    /**
     * Update capital
     */
    setCapital(capital) {
        this.config.totalCapital = capital;
        console.log(`[PORTFOLIO_COMMANDER] Capital updated: ${capital}`);
    }

    /**
     * Get status
     */
    getStatus() {
        return {
            activePositions: this.state.activePositions.size,
            totalExposure: this.state.totalExposure,
            exposurePercent: (this.state.totalExposure / this.config.totalCapital * 100).toFixed(2) + '%',
            dailyPnL: this.state.dailyPnL,
            dailyPnLPercent: this.state.dailyPnLPercent.toFixed(2) + '%',
            consecutiveWins: this.state.consecutiveWins,
            consecutiveLosses: this.state.consecutiveLosses,
            isLocked: this.state.isLocked,
            lockReason: this.state.lockReason,
            lockRemaining: this.state.lockUntil 
                ? Math.max(0, Math.round((this.state.lockUntil - Date.now()) / 60000)) + ' min'
                : null,
            closedToday: this.state.closedToday.length,
            config: {
                maxTrades: this.config.maxSimultaneousTrades,
                lossStreakLock: this.config.lossStreakLock,
                dailyLossLimit: this.config.dailyLossLimit + '%'
            }
        };
    }

    /**
     * Get stats
     */
    getStats() {
        const closed = this.state.closedToday;
        const wins = closed.filter(c => c.pnl > 0).length;
        const losses = closed.filter(c => c.pnl <= 0).length;

        return {
            ...this.getStatus(),
            tradesClosedToday: closed.length,
            winRate: closed.length > 0 ? ((wins / closed.length) * 100).toFixed(1) + '%' : 'N/A',
            avgWin: wins > 0 
                ? (closed.filter(c => c.pnl > 0).reduce((s, c) => s + c.pnlPercent, 0) / wins).toFixed(2) + '%'
                : 'N/A',
            avgLoss: losses > 0
                ? (closed.filter(c => c.pnl <= 0).reduce((s, c) => s + c.pnlPercent, 0) / losses).toFixed(2) + '%'
                : 'N/A'
        };
    }

    /**
     * Reset daily
     */
    resetDaily() {
        this.state.activePositions.clear();
        this.state.closedToday = [];
        this.state.consecutiveLosses = 0;
        this.state.consecutiveWins = 0;
        this.state.lastTradeResult = null;
        this.state.isLocked = false;
        this.state.lockUntil = null;
        this.state.lockReason = null;
        this.state.dailyPnL = 0;
        this.state.dailyPnLPercent = 0;
        this.state.totalExposure = 0;

        console.log('[PORTFOLIO_COMMANDER] Daily reset complete');
    }
}

module.exports = new PortfolioCommanderService();
