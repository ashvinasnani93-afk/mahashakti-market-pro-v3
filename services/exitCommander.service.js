/**
 * EXIT COMMANDER SERVICE - V6 CRITICAL ADDITION
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE: Active exit intelligence - NOT passive monitoring
 * Capital bachana entry se zyada important hai.
 * 
 * EXIT TYPES:
 * A. STRUCTURAL EXIT - Price structure breaks
 * B. TRAILING EXIT - Dynamic profit protection  
 * C. REGIME EXIT - Market condition shifts
 * D. OPTION EXIT - Greeks-based exits
 * 
 * OUTPUT:
 * - EXIT_SIGNAL: YES/NO
 * - EXIT_REASON: Detailed reason
 * - EXIT_PRIORITY: CRITICAL / HIGH / MEDIUM / LOW
 * - EXIT_TYPE: STRUCTURAL / TRAILING / REGIME / OPTION
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

class ExitCommanderService {
    constructor() {
        this.config = {
            // Structural Exit
            swingBreakBuffer: 0.002,      // 0.2% buffer for swing break
            vwapBreakBuffer: 0.003,       // 0.3% buffer for VWAP break
            
            // Trailing Exit
            atrTrailMultiplier: 1.5,      // 1.5x ATR for trailing
            minProfitToTrail: 1.5,        // Start trailing at 1.5% profit
            
            // Regime Exit
            regimeShiftSensitivity: 0.7,  // 70% sensitivity
            volatilityCollapseThreshold: 0.4, // 40% drop in volatility
            breadthCollapseThreshold: 30, // Below 30% breadth
            
            // Option Exit
            thetaAccelerationThreshold: 2.0, // 2x normal decay
            ivCrushThreshold: 15,         // 15% IV drop
            oiReversalThreshold: 10       // 10% OI reversal
        };

        // Active positions being monitored
        this.activePositions = new Map();  // token -> position data
        
        // Exit signals generated
        this.exitSignals = new Map();      // token -> exit signal
        
        // Historical exits for learning
        this.exitHistory = [];
        
        // State trackers
        this.swingLevels = new Map();      // token -> { lastSwingHigh, lastSwingLow }
        this.vwapLevels = new Map();       // token -> { vwap, entryVwap }
        this.trailingStops = new Map();    // token -> { stopPrice, highWaterMark }
        
        console.log('[EXIT_COMMANDER] Initializing exit commander...');
        console.log('[EXIT_COMMANDER] Exit types: STRUCTURAL | TRAILING | REGIME | OPTION');
        console.log('[EXIT_COMMANDER] Initialized');
    }

    /**
     * Register a new position for exit monitoring
     */
    registerPosition(token, positionData) {
        const position = {
            token,
            symbol: positionData.symbol,
            entryPrice: positionData.entryPrice,
            entryTime: positionData.entryTime || Date.now(),
            direction: positionData.direction, // 'LONG' or 'SHORT'
            isOption: positionData.isOption || false,
            quantity: positionData.quantity || 1,
            
            // Entry context
            entryVwap: positionData.vwap || positionData.entryPrice,
            entryRegime: positionData.regime || 'UNKNOWN',
            entryVolatility: positionData.volatility || 0,
            entryATR: positionData.atr || 0,
            
            // For options
            entryIV: positionData.iv || 0,
            entryTheta: positionData.theta || 0,
            entryOI: positionData.oi || 0,
            strikePrice: positionData.strikePrice || 0,
            optionType: positionData.optionType || null, // 'CE' or 'PE'
            
            // Tracking state
            highWaterMark: positionData.entryPrice,
            lowWaterMark: positionData.entryPrice,
            currentPnL: 0,
            maxPnL: 0,
            
            // Status
            status: 'ACTIVE',
            exitSignal: null
        };

        this.activePositions.set(token, position);
        
        // Initialize trailing stop
        this.initializeTrailingStop(token, position);
        
        console.log(`[EXIT_COMMANDER] 📍 Position registered: ${position.symbol} ${position.direction} @ ${position.entryPrice}`);
        
        return position;
    }

    /**
     * Initialize trailing stop for position
     */
    initializeTrailingStop(token, position) {
        const initialStop = position.direction === 'LONG'
            ? position.entryPrice * (1 - this.config.atrTrailMultiplier * (position.entryATR / position.entryPrice || 0.02))
            : position.entryPrice * (1 + this.config.atrTrailMultiplier * (position.entryATR / position.entryPrice || 0.02));
        
        this.trailingStops.set(token, {
            stopPrice: initialStop,
            highWaterMark: position.entryPrice,
            lowWaterMark: position.entryPrice,
            atrAtEntry: position.entryATR,
            trailingActive: false
        });
    }

    /**
     * MAIN: Check all exit conditions for a position
     * Returns comprehensive exit signal
     */
    checkExit(token, marketData) {
        const position = this.activePositions.get(token);
        if (!position || position.status !== 'ACTIVE') {
            return { exitSignal: false, reason: 'NO_ACTIVE_POSITION' };
        }

        const {
            ltp,
            vwap,
            candles,
            regime,
            volatility,
            breadth,
            iv,
            theta,
            oi
        } = marketData;

        // Update position tracking
        this.updatePositionTracking(token, ltp);

        const exitChecks = [];

        // ════════════════════════════════════════════════════════════════════════
        // A. STRUCTURAL EXITS
        // ════════════════════════════════════════════════════════════════════════
        
        // A1: Swing Break
        const swingExit = this.checkSwingBreak(token, position, candles, ltp);
        if (swingExit.exit) {
            exitChecks.push({ type: 'STRUCTURAL', subtype: 'SWING_BREAK', ...swingExit });
        }

        // A2: VWAP Break
        const vwapExit = this.checkVwapBreak(token, position, vwap, ltp);
        if (vwapExit.exit) {
            exitChecks.push({ type: 'STRUCTURAL', subtype: 'VWAP_BREAK', ...vwapExit });
        }

        // A3: Opposite Ignition
        const ignitionExit = this.checkOppositeIgnition(token, position, marketData);
        if (ignitionExit.exit) {
            exitChecks.push({ type: 'STRUCTURAL', subtype: 'OPPOSITE_IGNITION', ...ignitionExit });
        }

        // ════════════════════════════════════════════════════════════════════════
        // B. TRAILING EXITS
        // ════════════════════════════════════════════════════════════════════════
        
        // B1: ATR-based trailing
        const trailingExit = this.checkTrailingStop(token, position, ltp, marketData.atr);
        if (trailingExit.exit) {
            exitChecks.push({ type: 'TRAILING', subtype: 'ATR_TRAIL', ...trailingExit });
        }

        // B2: Higher Low Break (LONG) / Lower High Break (SHORT)
        const swingPatternExit = this.checkSwingPatternBreak(token, position, candles, ltp);
        if (swingPatternExit.exit) {
            exitChecks.push({ type: 'TRAILING', subtype: 'SWING_PATTERN', ...swingPatternExit });
        }

        // ════════════════════════════════════════════════════════════════════════
        // C. REGIME EXITS
        // ════════════════════════════════════════════════════════════════════════
        
        // C1: Regime Shift
        const regimeExit = this.checkRegimeShift(token, position, regime);
        if (regimeExit.exit) {
            exitChecks.push({ type: 'REGIME', subtype: 'REGIME_SHIFT', ...regimeExit });
        }

        // C2: Volatility Collapse
        const volExit = this.checkVolatilityCollapse(token, position, volatility);
        if (volExit.exit) {
            exitChecks.push({ type: 'REGIME', subtype: 'VOL_COLLAPSE', ...volExit });
        }

        // C3: Breadth Collapse
        const breadthExit = this.checkBreadthCollapse(token, position, breadth);
        if (breadthExit.exit) {
            exitChecks.push({ type: 'REGIME', subtype: 'BREADTH_COLLAPSE', ...breadthExit });
        }

        // ════════════════════════════════════════════════════════════════════════
        // D. OPTION EXITS (Only for options)
        // ════════════════════════════════════════════════════════════════════════
        
        if (position.isOption) {
            // D1: Theta Acceleration
            const thetaExit = this.checkThetaAcceleration(token, position, theta);
            if (thetaExit.exit) {
                exitChecks.push({ type: 'OPTION', subtype: 'THETA_ACCEL', ...thetaExit });
            }

            // D2: IV Crush
            const ivExit = this.checkIVCrush(token, position, iv);
            if (ivExit.exit) {
                exitChecks.push({ type: 'OPTION', subtype: 'IV_CRUSH', ...ivExit });
            }

            // D3: OI Reversal
            const oiExit = this.checkOIReversal(token, position, oi);
            if (oiExit.exit) {
                exitChecks.push({ type: 'OPTION', subtype: 'OI_REVERSAL', ...oiExit });
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // DETERMINE FINAL EXIT SIGNAL
        // ════════════════════════════════════════════════════════════════════════
        
        if (exitChecks.length === 0) {
            return {
                exitSignal: false,
                token,
                symbol: position.symbol,
                currentPnL: position.currentPnL,
                reason: 'NO_EXIT_CONDITION'
            };
        }

        // Prioritize exits by type
        const priorityOrder = ['STRUCTURAL', 'TRAILING', 'OPTION', 'REGIME'];
        exitChecks.sort((a, b) => {
            const aIdx = priorityOrder.indexOf(a.type);
            const bIdx = priorityOrder.indexOf(b.type);
            return aIdx - bIdx;
        });

        const primaryExit = exitChecks[0];
        
        const exitSignal = {
            exitSignal: true,
            token,
            symbol: position.symbol,
            direction: position.direction,
            entryPrice: position.entryPrice,
            currentPrice: ltp,
            currentPnL: position.currentPnL,
            maxPnL: position.maxPnL,
            exitType: primaryExit.type,
            exitSubtype: primaryExit.subtype,
            exitReason: primaryExit.reason,
            exitPriority: this.getExitPriority(primaryExit),
            allExitConditions: exitChecks.map(e => `${e.type}:${e.subtype}`),
            timestamp: Date.now()
        };

        // Store exit signal
        this.exitSignals.set(token, exitSignal);
        position.exitSignal = exitSignal;

        console.log(`[EXIT_COMMANDER] 🚪 EXIT_SIGNAL: ${position.symbol} | Type: ${exitSignal.exitType}:${exitSignal.exitSubtype} | PnL: ${position.currentPnL.toFixed(2)}%`);

        return exitSignal;
    }

    /**
     * Update position tracking with new price
     */
    updatePositionTracking(token, ltp) {
        const position = this.activePositions.get(token);
        if (!position) return;

        // Update water marks
        if (ltp > position.highWaterMark) {
            position.highWaterMark = ltp;
        }
        if (ltp < position.lowWaterMark) {
            position.lowWaterMark = ltp;
        }

        // Calculate PnL
        if (position.direction === 'LONG') {
            position.currentPnL = ((ltp - position.entryPrice) / position.entryPrice) * 100;
            position.maxPnL = ((position.highWaterMark - position.entryPrice) / position.entryPrice) * 100;
        } else {
            position.currentPnL = ((position.entryPrice - ltp) / position.entryPrice) * 100;
            position.maxPnL = ((position.entryPrice - position.lowWaterMark) / position.entryPrice) * 100;
        }

        // Update trailing stop
        this.updateTrailingStop(token, ltp);
    }

    /**
     * Update trailing stop based on price movement
     */
    updateTrailingStop(token, ltp) {
        const position = this.activePositions.get(token);
        const trailing = this.trailingStops.get(token);
        if (!position || !trailing) return;

        // Activate trailing once min profit reached
        if (position.currentPnL >= this.config.minProfitToTrail) {
            trailing.trailingActive = true;
        }

        if (!trailing.trailingActive) return;

        const atr = trailing.atrAtEntry || position.entryPrice * 0.02;
        const trailDistance = atr * this.config.atrTrailMultiplier;

        if (position.direction === 'LONG') {
            // For LONG: Trail up only
            if (ltp > trailing.highWaterMark) {
                trailing.highWaterMark = ltp;
                const newStop = ltp - trailDistance;
                if (newStop > trailing.stopPrice) {
                    trailing.stopPrice = newStop;
                }
            }
        } else {
            // For SHORT: Trail down only
            if (ltp < trailing.lowWaterMark) {
                trailing.lowWaterMark = ltp;
                const newStop = ltp + trailDistance;
                if (newStop < trailing.stopPrice) {
                    trailing.stopPrice = newStop;
                }
            }
        }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // A. STRUCTURAL EXIT CHECKS
    // ════════════════════════════════════════════════════════════════════════════

    /**
     * A1: Check swing break exit
     */
    checkSwingBreak(token, position, candles, ltp) {
        if (!candles || candles.length < 20) {
            return { exit: false };
        }

        const swings = this.findSwingLevels(candles);
        this.swingLevels.set(token, swings);

        const buffer = position.entryPrice * this.config.swingBreakBuffer;

        if (position.direction === 'LONG') {
            // Exit LONG if price breaks below last swing low
            if (ltp < swings.lastSwingLow - buffer) {
                return {
                    exit: true,
                    reason: `SWING_LOW_BREAK: Price ${ltp.toFixed(2)} < Swing Low ${swings.lastSwingLow.toFixed(2)}`,
                    level: swings.lastSwingLow,
                    priority: 'HIGH'
                };
            }
        } else {
            // Exit SHORT if price breaks above last swing high
            if (ltp > swings.lastSwingHigh + buffer) {
                return {
                    exit: true,
                    reason: `SWING_HIGH_BREAK: Price ${ltp.toFixed(2)} > Swing High ${swings.lastSwingHigh.toFixed(2)}`,
                    level: swings.lastSwingHigh,
                    priority: 'HIGH'
                };
            }
        }

        return { exit: false };
    }

    /**
     * A2: Check VWAP break exit
     */
    checkVwapBreak(token, position, vwap, ltp) {
        if (!vwap || vwap <= 0) {
            return { exit: false };
        }

        this.vwapLevels.set(token, { currentVwap: vwap, entryVwap: position.entryVwap });

        const buffer = vwap * this.config.vwapBreakBuffer;

        // Only check VWAP break if we're in profit (avoid early stop-out)
        if (position.currentPnL < 0.5) {
            return { exit: false };
        }

        if (position.direction === 'LONG') {
            if (ltp < vwap - buffer) {
                return {
                    exit: true,
                    reason: `VWAP_BREAK_DOWN: Price ${ltp.toFixed(2)} < VWAP ${vwap.toFixed(2)}`,
                    level: vwap,
                    priority: 'MEDIUM'
                };
            }
        } else {
            if (ltp > vwap + buffer) {
                return {
                    exit: true,
                    reason: `VWAP_BREAK_UP: Price ${ltp.toFixed(2)} > VWAP ${vwap.toFixed(2)}`,
                    level: vwap,
                    priority: 'MEDIUM'
                };
            }
        }

        return { exit: false };
    }

    /**
     * A3: Check opposite ignition exit
     */
    checkOppositeIgnition(token, position, marketData) {
        const { ignition } = marketData;
        
        if (!ignition || !ignition.detected) {
            return { exit: false };
        }

        // Check if ignition is opposite to position direction
        const ignitionDirection = ignition.type === 'BULLISH' ? 'LONG' : 'SHORT';
        
        if (position.direction !== ignitionDirection && ignition.strength >= 60) {
            return {
                exit: true,
                reason: `OPPOSITE_IGNITION: ${ignition.type} ignition detected (strength: ${ignition.strength})`,
                ignitionStrength: ignition.strength,
                priority: 'CRITICAL'
            };
        }

        return { exit: false };
    }

    // ════════════════════════════════════════════════════════════════════════════
    // B. TRAILING EXIT CHECKS
    // ════════════════════════════════════════════════════════════════════════════

    /**
     * B1: Check ATR-based trailing stop
     */
    checkTrailingStop(token, position, ltp, currentATR) {
        const trailing = this.trailingStops.get(token);
        if (!trailing || !trailing.trailingActive) {
            return { exit: false };
        }

        if (position.direction === 'LONG') {
            if (ltp <= trailing.stopPrice) {
                return {
                    exit: true,
                    reason: `TRAILING_STOP_HIT: Price ${ltp.toFixed(2)} <= Trail Stop ${trailing.stopPrice.toFixed(2)}`,
                    stopPrice: trailing.stopPrice,
                    maxPrice: trailing.highWaterMark,
                    priority: 'HIGH'
                };
            }
        } else {
            if (ltp >= trailing.stopPrice) {
                return {
                    exit: true,
                    reason: `TRAILING_STOP_HIT: Price ${ltp.toFixed(2)} >= Trail Stop ${trailing.stopPrice.toFixed(2)}`,
                    stopPrice: trailing.stopPrice,
                    minPrice: trailing.lowWaterMark,
                    priority: 'HIGH'
                };
            }
        }

        return { exit: false };
    }

    /**
     * B2: Check swing pattern break (Higher Low / Lower High)
     */
    checkSwingPatternBreak(token, position, candles, ltp) {
        if (!candles || candles.length < 30) {
            return { exit: false };
        }

        const recentSwings = this.findRecentSwings(candles.slice(-30));

        if (position.direction === 'LONG') {
            // Check for higher low break
            if (recentSwings.higherLows.length >= 2) {
                const lastHL = recentSwings.higherLows[recentSwings.higherLows.length - 1];
                if (ltp < lastHL * 0.998) {
                    return {
                        exit: true,
                        reason: `HIGHER_LOW_BREAK: Price ${ltp.toFixed(2)} broke HL ${lastHL.toFixed(2)}`,
                        level: lastHL,
                        priority: 'MEDIUM'
                    };
                }
            }
        } else {
            // Check for lower high break
            if (recentSwings.lowerHighs.length >= 2) {
                const lastLH = recentSwings.lowerHighs[recentSwings.lowerHighs.length - 1];
                if (ltp > lastLH * 1.002) {
                    return {
                        exit: true,
                        reason: `LOWER_HIGH_BREAK: Price ${ltp.toFixed(2)} broke LH ${lastLH.toFixed(2)}`,
                        level: lastLH,
                        priority: 'MEDIUM'
                    };
                }
            }
        }

        return { exit: false };
    }

    // ════════════════════════════════════════════════════════════════════════════
    // C. REGIME EXIT CHECKS
    // ════════════════════════════════════════════════════════════════════════════

    /**
     * C1: Check regime shift exit
     */
    checkRegimeShift(token, position, currentRegime) {
        if (!currentRegime || !position.entryRegime) {
            return { exit: false };
        }

        const adverseShifts = {
            'TREND_DAY': ['RANGE_DAY', 'COMPRESSION'],
            'EXPANSION': ['COMPRESSION', 'RANGE_DAY'],
            'BREAKOUT': ['RANGE_DAY', 'COMPRESSION']
        };

        const entryRegime = position.entryRegime;
        const badShifts = adverseShifts[entryRegime] || [];

        if (badShifts.includes(currentRegime)) {
            return {
                exit: true,
                reason: `REGIME_SHIFT: ${entryRegime} → ${currentRegime}`,
                entryRegime,
                currentRegime,
                priority: 'MEDIUM'
            };
        }

        // Panic day always triggers exit
        if (currentRegime === 'PANIC_DAY') {
            return {
                exit: true,
                reason: `PANIC_REGIME: Market entered PANIC_DAY`,
                currentRegime,
                priority: 'CRITICAL'
            };
        }

        return { exit: false };
    }

    /**
     * C2: Check volatility collapse exit
     */
    checkVolatilityCollapse(token, position, currentVolatility) {
        if (!currentVolatility || !position.entryVolatility || position.entryVolatility <= 0) {
            return { exit: false };
        }

        const volRatio = currentVolatility / position.entryVolatility;

        if (volRatio <= this.config.volatilityCollapseThreshold) {
            return {
                exit: true,
                reason: `VOLATILITY_COLLAPSE: Vol dropped ${((1 - volRatio) * 100).toFixed(1)}%`,
                entryVol: position.entryVolatility,
                currentVol: currentVolatility,
                volRatio,
                priority: 'MEDIUM'
            };
        }

        return { exit: false };
    }

    /**
     * C3: Check breadth collapse exit
     */
    checkBreadthCollapse(token, position, breadth) {
        if (breadth === undefined || breadth === null) {
            return { exit: false };
        }

        if (breadth < this.config.breadthCollapseThreshold) {
            // Only exit LONG on breadth collapse
            if (position.direction === 'LONG') {
                return {
                    exit: true,
                    reason: `BREADTH_COLLAPSE: Breadth ${breadth.toFixed(1)}% < ${this.config.breadthCollapseThreshold}%`,
                    breadth,
                    threshold: this.config.breadthCollapseThreshold,
                    priority: 'HIGH'
                };
            }
        }

        return { exit: false };
    }

    // ════════════════════════════════════════════════════════════════════════════
    // D. OPTION EXIT CHECKS
    // ════════════════════════════════════════════════════════════════════════════

    /**
     * D1: Check theta acceleration exit
     */
    checkThetaAcceleration(token, position, currentTheta) {
        if (!currentTheta || !position.entryTheta || position.entryTheta === 0) {
            return { exit: false };
        }

        const thetaRatio = Math.abs(currentTheta / position.entryTheta);

        if (thetaRatio >= this.config.thetaAccelerationThreshold) {
            return {
                exit: true,
                reason: `THETA_ACCELERATION: Decay ${thetaRatio.toFixed(2)}x normal`,
                entryTheta: position.entryTheta,
                currentTheta,
                thetaRatio,
                priority: 'HIGH'
            };
        }

        return { exit: false };
    }

    /**
     * D2: Check IV crush exit
     */
    checkIVCrush(token, position, currentIV) {
        if (!currentIV || !position.entryIV || position.entryIV <= 0) {
            return { exit: false };
        }

        const ivDrop = ((position.entryIV - currentIV) / position.entryIV) * 100;

        if (ivDrop >= this.config.ivCrushThreshold) {
            return {
                exit: true,
                reason: `IV_CRUSH: IV dropped ${ivDrop.toFixed(1)}%`,
                entryIV: position.entryIV,
                currentIV,
                ivDrop,
                priority: 'HIGH'
            };
        }

        return { exit: false };
    }

    /**
     * D3: Check OI reversal exit
     */
    checkOIReversal(token, position, currentOI) {
        if (!currentOI || !position.entryOI || position.entryOI <= 0) {
            return { exit: false };
        }

        const oiChange = ((currentOI - position.entryOI) / position.entryOI) * 100;

        // For LONG options, decreasing OI might indicate unwinding
        if (position.direction === 'LONG' && oiChange <= -this.config.oiReversalThreshold) {
            return {
                exit: true,
                reason: `OI_REVERSAL: OI dropped ${Math.abs(oiChange).toFixed(1)}%`,
                entryOI: position.entryOI,
                currentOI,
                oiChange,
                priority: 'MEDIUM'
            };
        }

        return { exit: false };
    }

    // ════════════════════════════════════════════════════════════════════════════
    // UTILITY METHODS
    // ════════════════════════════════════════════════════════════════════════════

    /**
     * Find swing levels from candles
     */
    findSwingLevels(candles) {
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);

        let lastSwingHigh = Math.max(...highs.slice(-10));
        let lastSwingLow = Math.min(...lows.slice(-10));

        // Find actual swing points
        for (let i = 2; i < candles.length - 2; i++) {
            const isSwingHigh = candles[i].high > candles[i-1].high && 
                               candles[i].high > candles[i-2].high &&
                               candles[i].high > candles[i+1].high &&
                               candles[i].high > candles[i+2].high;
            
            const isSwingLow = candles[i].low < candles[i-1].low && 
                              candles[i].low < candles[i-2].low &&
                              candles[i].low < candles[i+1].low &&
                              candles[i].low < candles[i+2].low;

            if (isSwingHigh) lastSwingHigh = candles[i].high;
            if (isSwingLow) lastSwingLow = candles[i].low;
        }

        return { lastSwingHigh, lastSwingLow };
    }

    /**
     * Find recent swing pattern (higher lows / lower highs)
     */
    findRecentSwings(candles) {
        const higherLows = [];
        const lowerHighs = [];
        let prevLow = Infinity;
        let prevHigh = 0;

        for (let i = 5; i < candles.length; i++) {
            const localLow = Math.min(...candles.slice(i-5, i).map(c => c.low));
            const localHigh = Math.max(...candles.slice(i-5, i).map(c => c.high));

            if (localLow > prevLow) {
                higherLows.push(localLow);
            }
            if (localHigh < prevHigh) {
                lowerHighs.push(localHigh);
            }

            prevLow = localLow;
            prevHigh = localHigh;
        }

        return { higherLows, lowerHighs };
    }

    /**
     * Get exit priority
     */
    getExitPriority(exitCheck) {
        if (exitCheck.priority) return exitCheck.priority;
        
        const priorityMap = {
            'STRUCTURAL': 'HIGH',
            'TRAILING': 'HIGH',
            'OPTION': 'MEDIUM',
            'REGIME': 'MEDIUM'
        };
        
        return priorityMap[exitCheck.type] || 'LOW';
    }

    /**
     * Close position and record exit
     */
    closePosition(token, exitPrice) {
        const position = this.activePositions.get(token);
        if (!position) return null;

        position.status = 'CLOSED';
        position.exitPrice = exitPrice;
        position.exitTime = Date.now();
        position.finalPnL = position.direction === 'LONG'
            ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
            : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;

        // Record for history
        this.exitHistory.push({
            ...position,
            exitSignal: this.exitSignals.get(token)
        });

        console.log(`[EXIT_COMMANDER] ✅ Position closed: ${position.symbol} | PnL: ${position.finalPnL.toFixed(2)}%`);

        // Cleanup
        this.activePositions.delete(token);
        this.exitSignals.delete(token);
        this.trailingStops.delete(token);
        this.swingLevels.delete(token);
        this.vwapLevels.delete(token);

        return position;
    }

    /**
     * Get active positions
     */
    getActivePositions() {
        return Array.from(this.activePositions.values());
    }

    /**
     * Get exit signals
     */
    getExitSignals() {
        return Array.from(this.exitSignals.values());
    }

    /**
     * Get exit history
     */
    getExitHistory(count = 50) {
        return this.exitHistory.slice(-count);
    }

    /**
     * Get stats
     */
    getStats() {
        const history = this.exitHistory;
        const wins = history.filter(h => h.finalPnL > 0).length;
        const losses = history.filter(h => h.finalPnL <= 0).length;
        const avgWin = history.filter(h => h.finalPnL > 0).reduce((sum, h) => sum + h.finalPnL, 0) / (wins || 1);
        const avgLoss = Math.abs(history.filter(h => h.finalPnL <= 0).reduce((sum, h) => sum + h.finalPnL, 0) / (losses || 1));

        return {
            activePositions: this.activePositions.size,
            pendingExitSignals: this.exitSignals.size,
            totalExits: this.exitHistory.length,
            winRate: history.length > 0 ? ((wins / history.length) * 100).toFixed(1) + '%' : 'N/A',
            avgWin: avgWin.toFixed(2) + '%',
            avgLoss: avgLoss.toFixed(2) + '%',
            profitFactor: avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : 'N/A',
            exitByType: this.countExitsByType(),
            config: this.config
        };
    }

    /**
     * Count exits by type
     */
    countExitsByType() {
        const counts = {
            STRUCTURAL: 0,
            TRAILING: 0,
            REGIME: 0,
            OPTION: 0
        };

        for (const exit of this.exitHistory) {
            if (exit.exitSignal?.exitType) {
                counts[exit.exitSignal.exitType]++;
            }
        }

        return counts;
    }

    /**
     * Reset daily
     */
    resetDaily() {
        // Keep history but clear active state
        this.activePositions.clear();
        this.exitSignals.clear();
        this.trailingStops.clear();
        this.swingLevels.clear();
        this.vwapLevels.clear();
        
        console.log('[EXIT_COMMANDER] Daily reset complete');
    }
}

module.exports = new ExitCommanderService();
