/**
 * CONFIDENCE SCORING SERVICE - V6 UPGRADED
 * Computes 0-100 confidence score based on multiple factors
 * V6 additions: Execution safety, Regime alignment, Correlation risk, Crowd trap, Exit clarity
 * MINIMUM EMIT SCORE: 60
 */

class ConfidenceScoringService {
    constructor() {
        // V6: Updated weights with new factors
        this.weights = {
            mtf: 12,              // Multi-timeframe alignment
            breadth: 12,          // Market breadth
            rs: 10,               // Relative strength
            gamma: 8,             // Gamma cluster
            theta: 8,             // Theta conditions
            oiVelocity: 8,        // OI velocity
            regime: 8,            // Market regime
            liquidity: 6,         // Liquidity tier
            correlation: 5,       // Index correlation
            timeOfDay: 3,         // Time of day factor
            
            // V6 NEW FACTORS
            executionSafety: 8,   // Execution reality check
            regimeAlignment: 5,   // Signal-regime alignment
            correlationRisk: 3,   // Portfolio correlation risk
            crowdTrap: 4,         // Crowd trap probability
            exitClarity: 5        // Exit plan clarity
        };

        // V6: Minimum threshold adjusted to 52 (from 60)
        this.minimumThreshold = 52;  // HARD MINIMUM for emit
        this.strongSignalThreshold = 75;  // For STRONG_BUY/SELL

        this.scoreHistory = new Map();  // token -> score history

        console.log('[CONFIDENCE_SCORING] Initializing V6 confidence scoring...');
        console.log('[CONFIDENCE_SCORING] Minimum emit threshold: ' + this.minimumThreshold);
        console.log('[CONFIDENCE_SCORING] Initialized');
    }

    /**
     * MAIN: Calculate confidence score for a signal
     * V6: Added new factor scoring
     * @param {object} factors - All factor inputs
     * @returns {object} { score: number, breakdown: object, grade: string }
     */
    calculateScore(factors) {
        const breakdown = {};
        let totalScore = 0;

        // MTF Score (0-12)
        if (factors.mtf) {
            const mtfScore = this.scoreMTF(factors.mtf);
            breakdown.mtf = mtfScore;
            totalScore += mtfScore;
        }

        // Breadth Score (0-12)
        if (factors.breadth !== undefined) {
            const breadthScore = this.scoreBreadth(factors.breadth);
            breakdown.breadth = breadthScore;
            totalScore += breadthScore;
        }

        // RS Score (0-10)
        if (factors.rs !== undefined) {
            const rsScore = this.scoreRS(factors.rs);
            breakdown.rs = rsScore;
            totalScore += rsScore;
        }

        // Gamma Score (0-8)
        if (factors.gamma) {
            const gammaScore = this.scoreGamma(factors.gamma);
            breakdown.gamma = gammaScore;
            totalScore += gammaScore;
        }

        // Theta Score (0-8)
        if (factors.theta) {
            const thetaScore = this.scoreTheta(factors.theta);
            breakdown.theta = thetaScore;
            totalScore += thetaScore;
        }

        // OI Velocity Score (0-8)
        if (factors.oiVelocity !== undefined) {
            const oiScore = this.scoreOIVelocity(factors.oiVelocity);
            breakdown.oiVelocity = oiScore;
            totalScore += oiScore;
        }

        // Regime Score (0-8)
        if (factors.regime) {
            const regimeScore = this.scoreRegime(factors.regime, factors.signalType);
            breakdown.regime = regimeScore;
            totalScore += regimeScore;
        }

        // Liquidity Score (0-6)
        if (factors.liquidityTier) {
            const liquidityScore = this.scoreLiquidity(factors.liquidityTier);
            breakdown.liquidity = liquidityScore;
            totalScore += liquidityScore;
        }

        // Correlation Score (0-5)
        if (factors.correlation !== undefined) {
            const corrScore = this.scoreCorrelation(factors.correlation, factors.divergence);
            breakdown.correlation = corrScore;
            totalScore += corrScore;
        }

        // Time of Day Score (0-3)
        if (factors.timeOfDay) {
            const todScore = this.scoreTimeOfDay(factors.timeOfDay);
            breakdown.timeOfDay = todScore;
            totalScore += todScore;
        }

        // ═══════════════════════════════════════════════════════════════════════
        // V6 NEW FACTORS
        // ═══════════════════════════════════════════════════════════════════════

        // Execution Safety Score (0-8)
        if (factors.executionSafety !== undefined) {
            const execScore = this.scoreExecutionSafety(factors.executionSafety);
            breakdown.executionSafety = execScore;
            totalScore += execScore;
        }

        // Regime Alignment Score (0-5)
        if (factors.regimeAlignment !== undefined) {
            const alignScore = this.scoreRegimeAlignment(factors.regimeAlignment);
            breakdown.regimeAlignment = alignScore;
            totalScore += alignScore;
        }

        // Correlation Risk Score (0-3)
        if (factors.correlationRisk !== undefined) {
            const corrRiskScore = this.scoreCorrelationRisk(factors.correlationRisk);
            breakdown.correlationRisk = corrRiskScore;
            totalScore += corrRiskScore;
        }

        // Crowd Trap Score (0-4)
        if (factors.crowdTrap !== undefined) {
            const trapScore = this.scoreCrowdTrap(factors.crowdTrap);
            breakdown.crowdTrap = trapScore;
            totalScore += trapScore;
        }

        // Exit Clarity Score (0-5)
        if (factors.exitClarity !== undefined) {
            const exitScore = this.scoreExitClarity(factors.exitClarity);
            breakdown.exitClarity = exitScore;
            totalScore += exitScore;
        }

        const result = {
            score: Math.round(totalScore),
            breakdown,
            grade: this.getGrade(totalScore),
            maxPossible: 100,
            meetsMinimum: totalScore >= this.minimumThreshold,
            minimumRequired: this.minimumThreshold,
            timestamp: Date.now()
        };

        // Store in history
        if (factors.token) {
            const history = this.scoreHistory.get(factors.token) || [];
            history.push({ timestamp: Date.now(), score: result.score });
            if (history.length > 20) history.shift();
            this.scoreHistory.set(factors.token, history);
        }

        return result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // V6 NEW SCORING FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * V6: Score execution safety (from executionReality.service)
     */
    scoreExecutionSafety(safety) {
        // safety: { slippageRiskScore: 0-100 }
        const risk = safety.slippageRiskScore || 0;
        
        if (risk <= 20) return this.weights.executionSafety;           // Very safe
        if (risk <= 40) return this.weights.executionSafety * 0.75;    // Safe
        if (risk <= 60) return this.weights.executionSafety * 0.5;     // Moderate risk
        if (risk <= 80) return this.weights.executionSafety * 0.25;    // High risk
        return 0;  // Critical risk
    }

    /**
     * V6: Score regime alignment
     */
    scoreRegimeAlignment(alignment) {
        // alignment: { compatible: boolean, adjustments: [], warnings: [] }
        if (alignment.compatible && alignment.warnings.length === 0) {
            return this.weights.regimeAlignment;
        }
        if (alignment.compatible && alignment.warnings.length === 1) {
            return this.weights.regimeAlignment * 0.7;
        }
        if (alignment.compatible) {
            return this.weights.regimeAlignment * 0.4;
        }
        return 0;  // Not compatible
    }

    /**
     * V6: Score correlation risk (portfolio level)
     */
    scoreCorrelationRisk(risk) {
        // risk: { highCorrelation: boolean, correlatedWith: [] }
        if (!risk.highCorrelation) {
            return this.weights.correlationRisk;
        }
        const correlatedCount = risk.correlatedWith?.length || 0;
        if (correlatedCount === 1) return this.weights.correlationRisk * 0.5;
        return 0;  // Too correlated
    }

    /**
     * V6: Score crowd trap probability
     */
    scoreCrowdTrap(trap) {
        // trap: { flagged: boolean, crowdingScore: 0-100 }
        if (!trap.flagged) {
            return this.weights.crowdTrap;
        }
        const crowdScore = trap.crowdingScore || 0;
        if (crowdScore <= 30) return this.weights.crowdTrap * 0.7;
        if (crowdScore <= 50) return this.weights.crowdTrap * 0.4;
        return 0;  // High trap risk
    }

    /**
     * V6: Score exit clarity
     */
    scoreExitClarity(clarity) {
        // clarity: { hasStructuralSL: boolean, hasTrailPlan: boolean, hasRegimeExit: boolean }
        let score = 0;
        if (clarity.hasStructuralSL) score += this.weights.exitClarity * 0.4;
        if (clarity.hasTrailPlan) score += this.weights.exitClarity * 0.3;
        if (clarity.hasRegimeExit) score += this.weights.exitClarity * 0.3;
        return score;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXISTING SCORING FUNCTIONS (unchanged)
    // ═══════════════════════════════════════════════════════════════════════

    scoreMTF(mtf) {
        let score = 0;
        if (mtf.aligned5m) score += 4;
        if (mtf.aligned15m) score += 4;
        if (mtf.alignedDaily) score += 4;
        return score;
    }

    scoreBreadth(breadthPercent) {
        if (breadthPercent >= 70) return this.weights.breadth;
        if (breadthPercent >= 55) return this.weights.breadth * 0.8;
        if (breadthPercent >= 45) return this.weights.breadth * 0.5;
        if (breadthPercent >= 35) return this.weights.breadth * 0.3;
        return 0;
    }

    scoreRS(rsPercent) {
        if (rsPercent >= 2) return this.weights.rs;
        if (rsPercent >= 1) return this.weights.rs * 0.8;
        if (rsPercent >= 0) return this.weights.rs * 0.5;
        if (rsPercent >= -1) return this.weights.rs * 0.3;
        return 0;
    }

    scoreGamma(gamma) {
        if (gamma.clusterDetected && gamma.clusterStrength >= 80) return this.weights.gamma;
        if (gamma.clusterDetected && gamma.clusterStrength >= 60) return this.weights.gamma * 0.7;
        if (gamma.clusterStrength >= 40) return this.weights.gamma * 0.4;
        return this.weights.gamma * 0.2;
    }

    scoreTheta(theta) {
        if (theta.moneynessType === 'DEEP_OTM') return 0;
        if (theta.trueMomentum >= 20) return this.weights.theta;
        if (theta.trueMomentum >= 10) return this.weights.theta * 0.7;
        if (theta.trueMomentum >= 0) return this.weights.theta * 0.4;
        return 0;
    }

    scoreOIVelocity(velocity) {
        if (velocity >= 10) return this.weights.oiVelocity;
        if (velocity >= 5) return this.weights.oiVelocity * 0.7;
        if (velocity >= 0) return this.weights.oiVelocity * 0.4;
        return this.weights.oiVelocity * 0.2;
    }

    scoreRegime(regime, signalType) {
        if (regime === 'TREND_DAY') return this.weights.regime;
        if (regime === 'EXPANSION') return this.weights.regime * 0.8;
        if (regime === 'NORMAL') return this.weights.regime * 0.6;
        if (regime === 'MEAN_REVERSION') return this.weights.regime * 0.4;
        if (regime === 'COMPRESSION') return this.weights.regime * 0.2;
        if (regime === 'PANIC_DAY') return 0;  // V6: No confidence in panic
        return this.weights.regime * 0.5;
    }

    scoreLiquidity(tier) {
        if (tier === 1) return this.weights.liquidity;
        if (tier === 2) return this.weights.liquidity * 0.5;
        return 0;
    }

    scoreCorrelation(correlation, divergence) {
        if (correlation >= 0.7 && Math.abs(divergence) >= 1) {
            return this.weights.correlation;
        }
        if (correlation >= 0.5) {
            return this.weights.correlation * 0.6;
        }
        if (correlation <= 0.3) {
            return 0;
        }
        return this.weights.correlation * 0.4;
    }

    scoreTimeOfDay(mode) {
        if (mode === 'NORMAL') return this.weights.timeOfDay;
        if (mode === 'CLOSING_CAUTIOUS') return this.weights.timeOfDay * 0.5;
        if (mode === 'LUNCH_DRIFT') return this.weights.timeOfDay * 0.4;
        if (mode === 'OPENING_STRICT') return this.weights.timeOfDay * 0.6;
        return this.weights.timeOfDay * 0.5;
    }

    /**
     * Get grade from score
     */
    getGrade(score) {
        if (score >= 85) return 'A+';
        if (score >= 75) return 'A';
        if (score >= 65) return 'B+';
        if (score >= 55) return 'B';
        if (score >= 45) return 'C';
        if (score >= 35) return 'D';
        return 'F';
    }

    /**
     * V6: Get minimum score for signal emission (INCREASED TO 60)
     */
    getMinimumScore(signalType) {
        if (signalType === 'STRONG_BUY' || signalType === 'STRONG_SELL') {
            return this.strongSignalThreshold; // 75 for strong signals
        }
        return this.minimumThreshold; // 60 for normal signals (V6: increased from 50)
    }

    /**
     * Check if score meets minimum threshold
     */
    meetsThreshold(score, signalType) {
        const minScore = this.getMinimumScore(signalType);
        return {
            meets: score >= minScore,
            score,
            minRequired: minScore,
            grade: this.getGrade(score),
            gap: score - minScore  // V6: Show how far from threshold
        };
    }

    /**
     * Get score history for a token
     */
    getHistory(token) {
        return this.scoreHistory.get(token) || [];
    }

    /**
     * Get stats
     */
    getStats() {
        const allHistory = Array.from(this.scoreHistory.values()).flat();
        const avgScore = allHistory.length > 0 
            ? allHistory.reduce((sum, h) => sum + h.score, 0) / allHistory.length 
            : 0;

        return {
            version: 'V6',
            minimumThreshold: this.minimumThreshold,
            strongSignalThreshold: this.strongSignalThreshold,
            weights: this.weights,
            tokensTracked: this.scoreHistory.size,
            avgScore: Math.round(avgScore),
            gradeDistribution: this.getGradeDistribution()
        };
    }

    /**
     * Get grade distribution from history
     */
    getGradeDistribution() {
        const allHistory = Array.from(this.scoreHistory.values()).flat();
        const distribution = { 'A+': 0, 'A': 0, 'B+': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };
        
        for (const entry of allHistory) {
            const grade = this.getGrade(entry.score);
            distribution[grade]++;
        }

        return distribution;
    }

    /**
     * Update weights
     */
    updateWeights(newWeights) {
        this.weights = { ...this.weights, ...newWeights };
        console.log('[CONFIDENCE_SCORING] V6 weights updated:', this.weights);
    }

    /**
     * V6: Update thresholds
     */
    updateThresholds(minimum, strong) {
        if (minimum) this.minimumThreshold = minimum;
        if (strong) this.strongSignalThreshold = strong;
        console.log(`[CONFIDENCE_SCORING] Thresholds updated: min=${this.minimumThreshold}, strong=${this.strongSignalThreshold}`);
    }
}

module.exports = new ConfidenceScoringService();
