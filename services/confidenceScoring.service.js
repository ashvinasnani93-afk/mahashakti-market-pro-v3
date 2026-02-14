/**
 * CONFIDENCE SCORING SERVICE
 * Computes 0-100 confidence score based on multiple factors
 * Used internally for signal ranking
 */

class ConfidenceScoringService {
    constructor() {
        this.weights = {
            mtf: 15,              // Multi-timeframe alignment
            breadth: 15,          // Market breadth
            rs: 12,               // Relative strength
            gamma: 10,            // Gamma cluster
            theta: 10,            // Theta conditions
            oiVelocity: 10,       // OI velocity
            regime: 10,           // Market regime
            liquidity: 8,         // Liquidity tier
            correlation: 5,       // Index correlation
            timeOfDay: 5          // Time of day factor
        };

        this.scoreHistory = new Map();  // token -> score history

        console.log('[CONFIDENCE_SCORING] Initializing confidence scoring...');
        console.log('[CONFIDENCE_SCORING] Weights:', this.weights);
        console.log('[CONFIDENCE_SCORING] Initialized');
    }

    /**
     * MAIN: Calculate confidence score for a signal
     * @param {object} factors - All factor inputs
     * @returns {object} { score: number, breakdown: object, grade: string }
     */
    calculateScore(factors) {
        const breakdown = {};
        let totalScore = 0;

        // MTF Score (0-15)
        if (factors.mtf) {
            const mtfScore = this.scoreMTF(factors.mtf);
            breakdown.mtf = mtfScore;
            totalScore += mtfScore;
        }

        // Breadth Score (0-15)
        if (factors.breadth !== undefined) {
            const breadthScore = this.scoreBreadth(factors.breadth);
            breakdown.breadth = breadthScore;
            totalScore += breadthScore;
        }

        // RS Score (0-12)
        if (factors.rs !== undefined) {
            const rsScore = this.scoreRS(factors.rs);
            breakdown.rs = rsScore;
            totalScore += rsScore;
        }

        // Gamma Score (0-10)
        if (factors.gamma) {
            const gammaScore = this.scoreGamma(factors.gamma);
            breakdown.gamma = gammaScore;
            totalScore += gammaScore;
        }

        // Theta Score (0-10)
        if (factors.theta) {
            const thetaScore = this.scoreTheta(factors.theta);
            breakdown.theta = thetaScore;
            totalScore += thetaScore;
        }

        // OI Velocity Score (0-10)
        if (factors.oiVelocity !== undefined) {
            const oiScore = this.scoreOIVelocity(factors.oiVelocity);
            breakdown.oiVelocity = oiScore;
            totalScore += oiScore;
        }

        // Regime Score (0-10)
        if (factors.regime) {
            const regimeScore = this.scoreRegime(factors.regime, factors.signalType);
            breakdown.regime = regimeScore;
            totalScore += regimeScore;
        }

        // Liquidity Score (0-8)
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

        // Time of Day Score (0-5)
        if (factors.timeOfDay) {
            const todScore = this.scoreTimeOfDay(factors.timeOfDay);
            breakdown.timeOfDay = todScore;
            totalScore += todScore;
        }

        const result = {
            score: Math.round(totalScore),
            breakdown,
            grade: this.getGrade(totalScore),
            maxPossible: 100,
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

    // Individual scoring functions
    scoreMTF(mtf) {
        // mtf: { aligned5m, aligned15m, alignedDaily }
        let score = 0;
        if (mtf.aligned5m) score += 5;
        if (mtf.aligned15m) score += 5;
        if (mtf.alignedDaily) score += 5;
        return score;
    }

    scoreBreadth(breadthPercent) {
        // 50% = neutral, higher = better for longs
        if (breadthPercent >= 70) return this.weights.breadth;
        if (breadthPercent >= 55) return this.weights.breadth * 0.8;
        if (breadthPercent >= 45) return this.weights.breadth * 0.5;
        if (breadthPercent >= 35) return this.weights.breadth * 0.3;
        return 0;
    }

    scoreRS(rsPercent) {
        // Relative strength vs index
        if (rsPercent >= 2) return this.weights.rs;
        if (rsPercent >= 1) return this.weights.rs * 0.8;
        if (rsPercent >= 0) return this.weights.rs * 0.5;
        if (rsPercent >= -1) return this.weights.rs * 0.3;
        return 0;
    }

    scoreGamma(gamma) {
        // gamma: { clusterDetected, clusterStrength }
        if (gamma.clusterDetected && gamma.clusterStrength >= 80) return this.weights.gamma;
        if (gamma.clusterDetected && gamma.clusterStrength >= 60) return this.weights.gamma * 0.7;
        if (gamma.clusterStrength >= 40) return this.weights.gamma * 0.4;
        return this.weights.gamma * 0.2;
    }

    scoreTheta(theta) {
        // theta: { trueMomentum, moneynessType }
        if (theta.moneynessType === 'DEEP_OTM') return 0;
        if (theta.trueMomentum >= 20) return this.weights.theta;
        if (theta.trueMomentum >= 10) return this.weights.theta * 0.7;
        if (theta.trueMomentum >= 0) return this.weights.theta * 0.4;
        return 0;
    }

    scoreOIVelocity(velocity) {
        // OI velocity (positive = building)
        if (velocity >= 10) return this.weights.oiVelocity;
        if (velocity >= 5) return this.weights.oiVelocity * 0.7;
        if (velocity >= 0) return this.weights.oiVelocity * 0.4;
        return this.weights.oiVelocity * 0.2;
    }

    scoreRegime(regime, signalType) {
        // regime: TREND_DAY, EXPANSION, COMPRESSION, MEAN_REVERSION, NORMAL
        if (regime === 'TREND_DAY') return this.weights.regime;
        if (regime === 'EXPANSION') return this.weights.regime * 0.8;
        if (regime === 'NORMAL') return this.weights.regime * 0.6;
        if (regime === 'MEAN_REVERSION') return this.weights.regime * 0.4;
        if (regime === 'COMPRESSION') return this.weights.regime * 0.2;
        return this.weights.regime * 0.5;
    }

    scoreLiquidity(tier) {
        if (tier === 1) return this.weights.liquidity;
        if (tier === 2) return this.weights.liquidity * 0.5;
        return 0;
    }

    scoreCorrelation(correlation, divergence) {
        // High correlation + divergence = good signal
        if (correlation >= 0.7 && Math.abs(divergence) >= 1) {
            return this.weights.correlation;
        }
        if (correlation >= 0.5) {
            return this.weights.correlation * 0.6;
        }
        if (correlation <= 0.3) {
            return 0; // Low correlation = ignore
        }
        return this.weights.correlation * 0.4;
    }

    scoreTimeOfDay(mode) {
        // mode: NORMAL, OPENING_STRICT, LUNCH_DRIFT, CLOSING_CAUTIOUS
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
     * Get minimum score for signal emission
     */
    getMinimumScore(signalType) {
        if (signalType === 'STRONG_BUY' || signalType === 'STRONG_SELL') {
            return 70; // High threshold for strong signals
        }
        return 50; // Normal threshold for regular signals
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
            grade: this.getGrade(score)
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
        console.log('[CONFIDENCE_SCORING] Weights updated:', this.weights);
    }
}

module.exports = new ConfidenceScoringService();
