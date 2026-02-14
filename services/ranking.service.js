const settings = require('../config/settings.config');

class RankingService {
    constructor() {
        this.rankings = new Map();
        this.rankHistory = [];
        this.weights = settings.ranking.weights;
    }

    rankInstruments(instrumentData) {
        const ranked = [];

        instrumentData.forEach(data => {
            if (!data.indicators || data.indicators.error) {
                return;
            }

            const scores = this.calculateScores(data);
            const totalScore = this.calculateTotalScore(scores);

            ranked.push({
                instrument: data.instrument,
                scores,
                totalScore,
                rank: 0,
                indicators: {
                    price: data.indicators.price,
                    rsi: data.indicators.rsi,
                    volumeRatio: data.indicators.volumeRatio,
                    emaTrend: data.indicators.emaTrend,
                    atrPercent: data.indicators.atrPercent
                },
                signal: data.signal,
                timestamp: Date.now()
            });
        });

        ranked.sort((a, b) => b.totalScore - a.totalScore);

        ranked.forEach((item, index) => {
            item.rank = index + 1;
            this.rankings.set(item.instrument.token, item);
        });

        this.rankHistory.push({
            rankings: ranked.slice(0, 20).map(r => ({
                symbol: r.instrument.symbol,
                rank: r.rank,
                score: r.totalScore
            })),
            timestamp: Date.now()
        });

        if (this.rankHistory.length > 100) {
            this.rankHistory.shift();
        }

        return ranked;
    }

    calculateScores(data) {
        const { indicators, breakout, volumeConfirm, higherTF, institutional, riskReward } = data;

        return {
            momentum: this.scoreMomentum(indicators),
            volume: this.scoreVolume(indicators, volumeConfirm),
            trend: this.scoreTrend(indicators, higherTF),
            breakout: this.scoreBreakout(breakout),
            institutional: this.scoreInstitutional(institutional),
            riskReward: this.scoreRiskReward(riskReward)
        };
    }

    scoreMomentum(indicators) {
        let score = 50;

        if (indicators.rsi) {
            if (indicators.rsi > 50 && indicators.rsi < 70) {
                score += 20;
            } else if (indicators.rsi >= 70 && indicators.rsi < 80) {
                score += 10;
            } else if (indicators.rsi > 30 && indicators.rsi <= 50) {
                score += 5;
            } else if (indicators.rsi <= 30) {
                score -= 10;
            } else if (indicators.rsi >= 80) {
                score -= 15;
            }
        }

        if (indicators.macdHistogram) {
            if (indicators.macdHistogram > 0) {
                score += 15;
                if (indicators.macdTrend === 'BULLISH') score += 5;
            } else {
                score -= 10;
            }
        }

        if (indicators.stochK && indicators.stochD) {
            if (indicators.stochK > indicators.stochD && indicators.stochK < 80) {
                score += 10;
            }
        }

        return Math.min(100, Math.max(0, score));
    }

    scoreVolume(indicators, volumeConfirm) {
        let score = 50;

        const volumeRatio = indicators.volumeRatio || (volumeConfirm?.ratio) || 0;

        if (volumeRatio >= 3) {
            score = 100;
        } else if (volumeRatio >= 2) {
            score = 85;
        } else if (volumeRatio >= 1.5) {
            score = 70;
        } else if (volumeRatio >= 1) {
            score = 55;
        } else if (volumeRatio >= 0.5) {
            score = 35;
        } else {
            score = 20;
        }

        if (indicators.avgVolume < settings.safety.minLiquidity) {
            score *= 0.7;
        }

        return Math.min(100, Math.max(0, score));
    }

    scoreTrend(indicators, higherTF) {
        let score = 50;

        switch (indicators.emaTrend) {
            case 'STRONG_BULLISH':
                score = 90;
                break;
            case 'BULLISH':
                score = 75;
                break;
            case 'NEUTRAL':
                score = 50;
                break;
            case 'BEARISH':
                score = 35;
                break;
            case 'STRONG_BEARISH':
                score = 20;
                break;
        }

        if (indicators.adxTrend === 'STRONG_UP') {
            score += 10;
        } else if (indicators.adxTrend === 'STRONG_DOWN') {
            score -= 10;
        }

        if (higherTF) {
            if (higherTF.fullAlignment) {
                score += 15;
            }
            score += (higherTF.score || 0) * 5;
        }

        return Math.min(100, Math.max(0, score));
    }

    scoreBreakout(breakout) {
        if (!breakout || !breakout.valid) {
            return 30;
        }

        let score = 60;

        if (breakout.priceAboveResistance || breakout.priceBelowSupport) {
            score += 25;
        }

        if (breakout.emaBreakout) {
            score += 15;
        }

        return Math.min(100, score);
    }

    scoreInstitutional(institutional) {
        if (!institutional) {
            return 50;
        }

        let score = 50;

        if (institutional.detected) {
            score += 20;
        }

        if (institutional.priceAboveVwap) {
            score += 10;
        }

        if (institutional.strongMomentum) {
            score += 10;
        }

        score += (institutional.score || 0) * 5;

        return Math.min(100, Math.max(0, score));
    }

    scoreRiskReward(riskReward) {
        if (!riskReward) {
            return 40;
        }

        const rr = riskReward.primaryRR || riskReward.rr2 || 0;

        if (rr >= 3) return 100;
        if (rr >= 2.5) return 90;
        if (rr >= 2) return 75;
        if (rr >= 1.5) return 60;
        if (rr >= 1) return 40;
        return 20;
    }

    calculateTotalScore(scores) {
        let total = 0;
        let totalWeight = 0;

        Object.entries(this.weights).forEach(([key, weight]) => {
            if (scores[key] !== undefined) {
                total += scores[key] * weight;
                totalWeight += weight;
            }
        });

        return totalWeight > 0 ? parseFloat((total / totalWeight).toFixed(2)) : 0;
    }

    getTopRanked(count = 10) {
        const all = Array.from(this.rankings.values());
        all.sort((a, b) => b.totalScore - a.totalScore);
        return all.slice(0, count);
    }

    getTopBullish(count = 10) {
        const bullish = Array.from(this.rankings.values())
            .filter(r => r.indicators.emaTrend === 'BULLISH' || r.indicators.emaTrend === 'STRONG_BULLISH');
        bullish.sort((a, b) => b.totalScore - a.totalScore);
        return bullish.slice(0, count);
    }

    getTopBearish(count = 10) {
        const bearish = Array.from(this.rankings.values())
            .filter(r => r.indicators.emaTrend === 'BEARISH' || r.indicators.emaTrend === 'STRONG_BEARISH');
        bearish.sort((a, b) => b.totalScore - a.totalScore);
        return bearish.slice(0, count);
    }

    getTopByCategory(category, count = 5) {
        const all = Array.from(this.rankings.values());
        
        switch (category) {
            case 'MOMENTUM':
                all.sort((a, b) => (b.scores.momentum || 0) - (a.scores.momentum || 0));
                break;
            case 'VOLUME':
                all.sort((a, b) => (b.scores.volume || 0) - (a.scores.volume || 0));
                break;
            case 'TREND':
                all.sort((a, b) => (b.scores.trend || 0) - (a.scores.trend || 0));
                break;
            case 'BREAKOUT':
                all.sort((a, b) => (b.scores.breakout || 0) - (a.scores.breakout || 0));
                break;
            default:
                all.sort((a, b) => b.totalScore - a.totalScore);
        }

        return all.slice(0, count);
    }

    getRanking(token) {
        return this.rankings.get(token) || null;
    }

    getRankHistory(count = 50) {
        return this.rankHistory.slice(-count);
    }

    getMoversSummary() {
        const current = this.rankHistory[this.rankHistory.length - 1];
        const previous = this.rankHistory[this.rankHistory.length - 2];

        if (!current || !previous) {
            return { moversUp: [], moversDown: [], newEntries: [] };
        }

        const moversUp = [];
        const moversDown = [];
        const newEntries = [];

        current.rankings.forEach(curr => {
            const prev = previous.rankings.find(p => p.symbol === curr.symbol);
            
            if (!prev) {
                newEntries.push(curr);
            } else if (curr.rank < prev.rank) {
                moversUp.push({ ...curr, rankChange: prev.rank - curr.rank });
            } else if (curr.rank > prev.rank) {
                moversDown.push({ ...curr, rankChange: curr.rank - prev.rank });
            }
        });

        moversUp.sort((a, b) => b.rankChange - a.rankChange);
        moversDown.sort((a, b) => b.rankChange - a.rankChange);

        return {
            moversUp: moversUp.slice(0, 5),
            moversDown: moversDown.slice(0, 5),
            newEntries: newEntries.slice(0, 5)
        };
    }

    clearRankings() {
        this.rankings.clear();
        this.rankHistory = [];
    }
}

module.exports = new RankingService();
