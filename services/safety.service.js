const settings = require('../config/settings.config');

class SafetyService {
    constructor() {
        this.config = settings.safety;
        this.rsiConfig = settings.indicators.rsi;
    }

    runSafetyChecks(instrument, indicators, breakout, volumeConfirm, riskReward, regime) {
        const checks = [];
        const warnings = [];
        let overallPass = true;

        const rsiCheck = this.checkRSI(indicators);
        checks.push(rsiCheck);
        if (!rsiCheck.pass) {
            if (rsiCheck.critical) overallPass = false;
            else warnings.push(rsiCheck.message);
        }

        const breakoutCheck = this.checkBreakout(breakout);
        checks.push(breakoutCheck);
        if (!breakoutCheck.pass) {
            overallPass = false;
        }

        const volumeCheck = this.checkVolume(volumeConfirm, indicators);
        checks.push(volumeCheck);
        if (!volumeCheck.pass) {
            if (volumeCheck.critical) overallPass = false;
            else warnings.push(volumeCheck.message);
        }

        const volatilityCheck = this.checkVolatility(indicators);
        checks.push(volatilityCheck);
        if (!volatilityCheck.pass) {
            if (volatilityCheck.critical) overallPass = false;
            else warnings.push(volatilityCheck.message);
        }

        const trendCheck = this.checkTrendAlignment(indicators, breakout);
        checks.push(trendCheck);
        if (!trendCheck.pass) {
            warnings.push(trendCheck.message);
        }

        const rrCheck = this.checkRiskReward(riskReward);
        checks.push(rrCheck);
        if (!rrCheck.pass) {
            overallPass = false;
        }

        const liquidityCheck = this.checkLiquidity(indicators);
        checks.push(liquidityCheck);
        if (!liquidityCheck.pass) {
            if (liquidityCheck.critical) overallPass = false;
            else warnings.push(liquidityCheck.message);
        }

        if (regime) {
            const regimeCheck = this.checkRegime(regime);
            checks.push(regimeCheck);
            if (!regimeCheck.pass) {
                warnings.push(regimeCheck.message);
            }
        }

        const marketHoursCheck = this.checkMarketHours();
        checks.push(marketHoursCheck);
        if (!marketHoursCheck.pass) {
            warnings.push(marketHoursCheck.message);
        }

        const passedCount = checks.filter(c => c.pass).length;
        const score = (passedCount / checks.length) * 100;

        return {
            pass: overallPass,
            score: parseFloat(score.toFixed(1)),
            passedChecks: passedCount,
            totalChecks: checks.length,
            checks,
            warnings,
            criticalFails: checks.filter(c => !c.pass && c.critical).map(c => c.name),
            recommendation: this.getRecommendation(overallPass, score, warnings)
        };
    }

    checkRSI(indicators) {
        const rsi = indicators.rsi;
        
        if (!rsi) {
            return { name: 'RSI', pass: true, message: 'RSI not available', critical: false };
        }

        if (rsi > this.rsiConfig.extremeOverbought) {
            return { 
                name: 'RSI', 
                pass: false, 
                message: `RSI extreme overbought (${rsi.toFixed(1)})`,
                critical: true,
                value: rsi
            };
        }

        if (rsi < this.rsiConfig.extremeOversold) {
            return { 
                name: 'RSI', 
                pass: false, 
                message: `RSI extreme oversold (${rsi.toFixed(1)})`,
                critical: true,
                value: rsi
            };
        }

        if (rsi > this.rsiConfig.overbought) {
            return { 
                name: 'RSI', 
                pass: false, 
                message: `RSI overbought (${rsi.toFixed(1)})`,
                critical: false,
                value: rsi
            };
        }

        if (rsi < this.rsiConfig.oversold) {
            return { 
                name: 'RSI', 
                pass: false, 
                message: `RSI oversold (${rsi.toFixed(1)})`,
                critical: false,
                value: rsi
            };
        }

        return { name: 'RSI', pass: true, message: 'RSI in normal range', value: rsi };
    }

    checkBreakout(breakout) {
        if (!breakout || !breakout.valid) {
            return { 
                name: 'BREAKOUT', 
                pass: false, 
                message: 'No valid breakout detected',
                critical: true
            };
        }

        return { 
            name: 'BREAKOUT', 
            pass: true, 
            message: `${breakout.type} breakout confirmed`,
            type: breakout.type
        };
    }

    checkVolume(volumeConfirm, indicators) {
        if (!volumeConfirm) {
            return { 
                name: 'VOLUME', 
                pass: false, 
                message: 'Volume data not available',
                critical: false
            };
        }

        if (!volumeConfirm.confirmed) {
            return { 
                name: 'VOLUME', 
                pass: false, 
                message: `Low volume (${volumeConfirm.ratio?.toFixed(2)}x avg)`,
                critical: false,
                ratio: volumeConfirm.ratio
            };
        }

        return { 
            name: 'VOLUME', 
            pass: true, 
            message: `Volume confirmed (${volumeConfirm.ratio?.toFixed(2)}x avg)`,
            ratio: volumeConfirm.ratio,
            strength: volumeConfirm.strength
        };
    }

    checkVolatility(indicators) {
        const atrPercent = indicators.atrPercent;

        if (!atrPercent) {
            return { name: 'VOLATILITY', pass: true, message: 'ATR not available', critical: false };
        }

        if (atrPercent > this.config.maxAtrPercent) {
            return { 
                name: 'VOLATILITY', 
                pass: false, 
                message: `High volatility (ATR ${atrPercent.toFixed(2)}%)`,
                critical: true,
                atrPercent
            };
        }

        if (atrPercent > this.config.maxAtrPercent * 0.7) {
            return { 
                name: 'VOLATILITY', 
                pass: false, 
                message: `Elevated volatility (ATR ${atrPercent.toFixed(2)}%)`,
                critical: false,
                atrPercent
            };
        }

        return { 
            name: 'VOLATILITY', 
            pass: true, 
            message: `Normal volatility (ATR ${atrPercent.toFixed(2)}%)`,
            atrPercent
        };
    }

    checkTrendAlignment(indicators, breakout) {
        if (!indicators.emaTrend || !breakout?.type) {
            return { name: 'TREND_ALIGNMENT', pass: true, message: 'Trend data incomplete' };
        }

        const emaBullish = indicators.emaTrend === 'BULLISH' || indicators.emaTrend === 'STRONG_BULLISH';
        const emaBearish = indicators.emaTrend === 'BEARISH' || indicators.emaTrend === 'STRONG_BEARISH';
        const breakoutBullish = breakout.type === 'BULLISH';
        const breakoutBearish = breakout.type === 'BEARISH';

        if ((emaBullish && breakoutBullish) || (emaBearish && breakoutBearish)) {
            return { 
                name: 'TREND_ALIGNMENT', 
                pass: true, 
                message: 'Trend and breakout aligned'
            };
        }

        return { 
            name: 'TREND_ALIGNMENT', 
            pass: false, 
            message: `Trend (${indicators.emaTrend}) misaligned with breakout (${breakout.type})`,
            critical: false
        };
    }

    checkRiskReward(riskReward) {
        if (!riskReward) {
            return { name: 'RISK_REWARD', pass: false, message: 'RR not calculated', critical: true };
        }

        if (!riskReward.valid) {
            return { 
                name: 'RISK_REWARD', 
                pass: false, 
                message: `Poor R:R ratio (${riskReward.primaryRR})`,
                critical: true,
                rr: riskReward.primaryRR
            };
        }

        return { 
            name: 'RISK_REWARD', 
            pass: true, 
            message: `Good R:R ratio (${riskReward.primaryRR})`,
            rr: riskReward.primaryRR
        };
    }

    checkLiquidity(indicators) {
        const avgVolume = indicators.avgVolume;

        if (!avgVolume) {
            return { name: 'LIQUIDITY', pass: true, message: 'Volume data not available' };
        }

        if (avgVolume < this.config.minLiquidity) {
            return { 
                name: 'LIQUIDITY', 
                pass: false, 
                message: `Low liquidity (avg vol: ${avgVolume.toLocaleString()})`,
                critical: true,
                avgVolume
            };
        }

        if (avgVolume < this.config.minLiquidity * 2) {
            return { 
                name: 'LIQUIDITY', 
                pass: false, 
                message: `Moderate liquidity (avg vol: ${avgVolume.toLocaleString()})`,
                critical: false,
                avgVolume
            };
        }

        return { 
            name: 'LIQUIDITY', 
            pass: true, 
            message: `Good liquidity (avg vol: ${avgVolume.toLocaleString()})`,
            avgVolume
        };
    }

    checkRegime(regime) {
        if (!regime || !regime.shouldTrade) {
            return { name: 'REGIME', pass: true, message: 'Regime check skipped' };
        }

        if (!regime.shouldTrade.trade) {
            return { 
                name: 'REGIME', 
                pass: false, 
                message: regime.shouldTrade.reason,
                critical: false
            };
        }

        if (regime.shouldTrade.caution) {
            return { 
                name: 'REGIME', 
                pass: false, 
                message: regime.shouldTrade.reason + ' (caution)',
                critical: false
            };
        }

        return { 
            name: 'REGIME', 
            pass: true, 
            message: `Regime favorable: ${regime.regime}`
        };
    }

    checkMarketHours() {
        const now = new Date();
        const day = now.getDay();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const time = hours * 60 + minutes;

        const marketConfig = settings.market;
        const marketOpen = marketConfig.openHour * 60 + marketConfig.openMinute;
        const marketClose = marketConfig.closeHour * 60 + marketConfig.closeMinute;

        if (day === 0 || day === 6) {
            return { 
                name: 'MARKET_HOURS', 
                pass: false, 
                message: 'Market closed (weekend)',
                critical: false
            };
        }

        if (time < marketOpen) {
            return { 
                name: 'MARKET_HOURS', 
                pass: false, 
                message: 'Pre-market hours',
                critical: false
            };
        }

        if (time > marketClose) {
            return { 
                name: 'MARKET_HOURS', 
                pass: false, 
                message: 'After-market hours',
                critical: false
            };
        }

        if (time < marketOpen + 15) {
            return { 
                name: 'MARKET_HOURS', 
                pass: false, 
                message: 'Opening volatility period',
                critical: false
            };
        }

        if (time > marketClose - 15) {
            return { 
                name: 'MARKET_HOURS', 
                pass: false, 
                message: 'Closing period - avoid new positions',
                critical: false
            };
        }

        return { 
            name: 'MARKET_HOURS', 
            pass: true, 
            message: 'Normal trading hours'
        };
    }

    getRecommendation(pass, score, warnings) {
        if (!pass) {
            return {
                action: 'SKIP',
                message: 'Critical safety checks failed - do not trade',
                confidence: 'LOW'
            };
        }

        if (score >= 90 && warnings.length === 0) {
            return {
                action: 'STRONG_ENTRY',
                message: 'All checks passed - optimal entry conditions',
                confidence: 'HIGH'
            };
        }

        if (score >= 75) {
            return {
                action: 'ENTRY',
                message: 'Good conditions with minor cautions',
                confidence: 'MEDIUM_HIGH'
            };
        }

        if (score >= 60) {
            return {
                action: 'CAUTIOUS_ENTRY',
                message: 'Consider reduced position size',
                confidence: 'MEDIUM'
            };
        }

        return {
            action: 'WEAK_ENTRY',
            message: 'Multiple warnings - trade with caution or skip',
            confidence: 'LOW'
        };
    }

    quickCheck(indicators) {
        const issues = [];

        if (indicators.rsi > this.rsiConfig.overbought) {
            issues.push('RSI_OVERBOUGHT');
        }
        if (indicators.rsi < this.rsiConfig.oversold) {
            issues.push('RSI_OVERSOLD');
        }
        if (indicators.atrPercent > this.config.maxAtrPercent) {
            issues.push('HIGH_VOLATILITY');
        }
        if (indicators.volumeRatio < 1) {
            issues.push('LOW_VOLUME');
        }
        if (indicators.avgVolume < this.config.minLiquidity) {
            issues.push('LOW_LIQUIDITY');
        }

        return {
            pass: issues.length === 0,
            issues
        };
    }
}

module.exports = new SafetyService();
