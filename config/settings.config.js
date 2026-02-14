module.exports = {
    scanner: {
        scanIntervalMs: 60000,
        batchSize: 20,
        batchIntervalMs: 5000,
        batchDelayMs: 500,
        apiDelayMs: 100,
        maxConcurrentScans: 5,
        volumeSpikeThreshold: 2,
        wsRotationIntervalMs: 30000
    },
    
    websocket: {
        maxSubscriptions: 50,
        maxReconnectAttempts: 10,
        baseReconnectDelay: 1000,
        maxReconnectDelay: 60000,
        minConnectInterval: 5000,
        pingInterval: 30000,
        rateLimitCooldown: 30000
    },
    
    candles: {
        cacheExpiryMs: 60000,
        maxCacheSize: 1000,
        defaultPeriods: {
            FIVE_MINUTE: 100,
            FIFTEEN_MINUTE: 50,
            ONE_HOUR: 30,
            ONE_DAY: 60
        }
    },
    
    indicators: {
        ema: {
            fast: 9,
            medium: 20,
            slow: 50,
            verySlow: 200
        },
        rsi: {
            period: 14,
            overbought: 70,
            oversold: 30,
            extremeOverbought: 80,
            extremeOversold: 20
        },
        atr: {
            period: 14
        },
        volume: {
            avgPeriod: 20,
            minRatio: 1.5,
            highRatio: 2.0,
            explosionRatio: 3.0
        },
        macd: {
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9
        },
        bollinger: {
            period: 20,
            stdDev: 2
        }
    },
    
    signals: {
        minRiskReward: 1.5,
        strongSignalThreshold: 8,
        minStrengthForAlert: 5
    },
    
    explosion: {
        earlyMovePercent: 1.5,
        accelerationMultiplier: 2,
        volumeAccelerationRatio: 3,
        oiDeltaThreshold: 5,
        optionRangeExpansion: 2,
        detectionWindowMinutes: 60,
        bigMoverThreshold: 15,
        topRunnerThreshold: 20
    },
    
    premiumMomentum: {
        delta5mThreshold: 5,
        delta15mThreshold: 12,
        volumeThreshold: 200,
        oiThreshold: 10,
        accelerationScoreThreshold: 60
    },
    
    strikes: {
        minPremium: 3,
        maxPremium: 650,
        minVolume: 1000,
        strikesAroundATM: 5,
        optimalPremiumMin: 50,
        optimalPremiumMax: 200
    },
    
    institutional: {
        pcrBullish: 0.7,
        pcrBearish: 1.3,
        oiChangeThreshold: 5,
        breadthBullish: 60,
        breadthBearish: 40
    },
    
    regime: {
        trendStrengthThreshold: 0.6,
        volatilityHighThreshold: 2.5,
        volatilityLowThreshold: 1.0,
        lookbackPeriod: 20
    },
    
    ranking: {
        weights: {
            momentum: 0.25,
            volume: 0.20,
            trend: 0.20,
            breakout: 0.15,
            institutional: 0.10,
            riskReward: 0.10
        },
        topCount: 10
    },
    
    safety: {
        maxAtrPercent: 5,
        minLiquidity: 50000,
        maxSpreadPercent: 0.5
    },
    
    market: {
        openHour: 9,
        openMinute: 15,
        closeHour: 15,
        closeMinute: 30,
        preOpenMinutes: 15
    },
    
    aggregator: {
        cacheExpiryMs: 5000,
        maxSignalsPerCategory: 20,
        maxExplosionsDisplay: 20
    }
};
