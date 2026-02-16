/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MAHASHAKTI V7.3 – SHADOW OBSERVATION MODE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * 🔴 FREEZE ORDER: NO THRESHOLD MODIFICATIONS
 * 
 * PURPOSE:
 * - Track every emitted signal over 3 days
 * - Generate daily 4 PM IST reports
 * - Evaluate ELITE LOCKED criteria
 * 
 * TRACKS:
 * - Entry time
 * - +1% hit time
 * - +2% hit time  
 * - MFE (Max Favorable Excursion)
 * - MAE (Max Adverse Excursion)
 * - Exit trigger reason
 * 
 * ELITE LOCKED CRITERIA:
 * - +1% ≥ 75%
 * - Fake break ≤ 20%
 * - MAE ≤ 1%
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

class ShadowObservationMode {
    constructor() {
        this.version = 'V7.3';
        this.mode = 'SHADOW_OBSERVATION';
        this.startDate = new Date();
        this.observationDays = 3;
        
        // Data storage paths
        this.dataDir = '/app/shadow_logs';
        this.signalLogFile = path.join(this.dataDir, 'signal_log.json');
        this.dailyReportDir = path.join(this.dataDir, 'daily_reports');
        
        // In-memory tracking
        this.todaySignals = {
            EARLY: [],
            STRONG: [],
            EXTENDED: [],
            LATE: []
        };
        
        // Cumulative stats
        this.cumulativeStats = {
            totalEmitted: 0,
            totalPlusOneHit: 0,
            totalPlusTwoHit: 0,
            totalFakeBreaks: 0,
            totalMAE: 0,
            totalMFE: 0,
            byZone: {
                EARLY: { count: 0, plusOne: 0, plusTwo: 0, fakeBreak: 0 },
                STRONG: { count: 0, plusOne: 0, plusTwo: 0, fakeBreak: 0 },
                EXTENDED: { count: 0, plusOne: 0, plusTwo: 0, fakeBreak: 0 },
                LATE: { count: 0, plusOne: 0, plusTwo: 0, fakeBreak: 0 }
            }
        };

        // ELITE LOCKED criteria
        this.eliteCriteria = {
            minPlusOneHitRate: 75,      // ≥75%
            maxFakeBreakRate: 20,       // ≤20%
            maxAvgMAE: 1.0              // ≤1%
        };

        this.isEliteLocked = false;
        
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('     🔴 MAHASHAKTI V7.3 – SHADOW OBSERVATION MODE ACTIVE');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`     Start Date: ${this.startDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
        console.log(`     Observation Period: ${this.observationDays} days`);
        console.log('     ⚠️  THRESHOLDS FROZEN - NO MODIFICATIONS ALLOWED');
        console.log('═══════════════════════════════════════════════════════════════');
        
        this.initialize();
    }

    initialize() {
        // Create directories
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
        if (!fs.existsSync(this.dailyReportDir)) {
            fs.mkdirSync(this.dailyReportDir, { recursive: true });
        }
        
        // Load existing data if available
        this.loadExistingData();
    }

    loadExistingData() {
        try {
            if (fs.existsSync(this.signalLogFile)) {
                const data = JSON.parse(fs.readFileSync(this.signalLogFile, 'utf8'));
                this.cumulativeStats = data.cumulativeStats || this.cumulativeStats;
                this.startDate = new Date(data.startDate) || this.startDate;
                this.isEliteLocked = data.isEliteLocked || false;
                console.log('[SHADOW] Loaded existing observation data');
            }
        } catch (err) {
            console.log('[SHADOW] Starting fresh observation');
        }
    }

    saveData() {
        const data = {
            version: this.version,
            mode: this.mode,
            startDate: this.startDate,
            lastUpdated: new Date(),
            cumulativeStats: this.cumulativeStats,
            isEliteLocked: this.isEliteLocked,
            todaySignals: this.todaySignals
        };
        
        fs.writeFileSync(this.signalLogFile, JSON.stringify(data, null, 2));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SIGNAL TRACKING
    // ═══════════════════════════════════════════════════════════════════════
    
    logSignalEntry(signalData) {
        const timestamp = new Date();
        const zone = signalData.zone || 'UNKNOWN';
        
        const signalRecord = {
            id: `${signalData.symbol}_${timestamp.getTime()}`,
            symbol: signalData.symbol,
            token: signalData.token,
            zone: zone,
            score: signalData.score,
            entryTime: timestamp.toISOString(),
            entryTimeIST: timestamp.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
            entryPrice: signalData.entryPrice,
            confidence: signalData.confidence,
            spread: signalData.spread,
            
            // To be filled post-entry
            plusOneHitTime: null,
            plusTwoHitTime: null,
            mfe: 0,
            mae: 0,
            exitTrigger: null,
            outcome: 'PENDING',  // CLEAN_RUNNER, SMALL_SCALP, FAKE_BREAK
            
            // Tracking flags
            hitPlusOne: false,
            hitPlusTwo: false,
            hitMinusOne: false
        };
        
        if (this.todaySignals[zone]) {
            this.todaySignals[zone].push(signalRecord);
        }
        
        this.cumulativeStats.totalEmitted++;
        this.cumulativeStats.byZone[zone].count++;
        
        this.saveData();
        
        console.log(`[SHADOW] 📝 Signal logged: ${signalData.symbol} | Zone: ${zone} | Score: ${signalData.score}`);
        
        return signalRecord.id;
    }

    updateSignalOutcome(signalId, outcomeData) {
        // Find and update signal
        for (const zone of Object.keys(this.todaySignals)) {
            const signal = this.todaySignals[zone].find(s => s.id === signalId);
            if (signal) {
                signal.plusOneHitTime = outcomeData.plusOneHitTime;
                signal.plusTwoHitTime = outcomeData.plusTwoHitTime;
                signal.mfe = outcomeData.mfe;
                signal.mae = outcomeData.mae;
                signal.exitTrigger = outcomeData.exitTrigger;
                signal.outcome = this.classifyOutcome(outcomeData);
                signal.hitPlusOne = outcomeData.mfe >= 1.0;
                signal.hitPlusTwo = outcomeData.mfe >= 2.0;
                signal.hitMinusOne = outcomeData.mae >= 1.0;
                
                // Update cumulative stats
                if (signal.hitPlusOne) {
                    this.cumulativeStats.totalPlusOneHit++;
                    this.cumulativeStats.byZone[zone].plusOne++;
                }
                if (signal.hitPlusTwo) {
                    this.cumulativeStats.totalPlusTwoHit++;
                    this.cumulativeStats.byZone[zone].plusTwo++;
                }
                if (signal.outcome === 'FAKE_BREAK') {
                    this.cumulativeStats.totalFakeBreaks++;
                    this.cumulativeStats.byZone[zone].fakeBreak++;
                }
                this.cumulativeStats.totalMAE += outcomeData.mae;
                this.cumulativeStats.totalMFE += outcomeData.mfe;
                
                this.saveData();
                
                console.log(`[SHADOW] 📊 Outcome updated: ${signal.symbol} | ${signal.outcome} | MFE: ${signal.mfe}%`);
                break;
            }
        }
    }

    classifyOutcome(outcomeData) {
        if (outcomeData.mfe >= 2.0 && outcomeData.mae < 1.0) {
            return 'CLEAN_RUNNER';
        } else if (outcomeData.mfe >= 1.0 && outcomeData.mae < 1.5) {
            return 'SMALL_SCALP';
        } else {
            return 'FAKE_BREAK';
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DAILY 4 PM IST REPORT
    // ═══════════════════════════════════════════════════════════════════════
    
    generateDailyReport() {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const reportTime = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        
        const stats = this.cumulativeStats;
        const total = stats.totalEmitted || 1;
        
        // Calculate rates
        const plusOneRate = ((stats.totalPlusOneHit / total) * 100).toFixed(1);
        const plusTwoRate = ((stats.totalPlusTwoHit / total) * 100).toFixed(1);
        const fakeBreakRate = ((stats.totalFakeBreaks / total) * 100).toFixed(1);
        const avgMAE = (stats.totalMAE / total).toFixed(2);
        const avgMFE = (stats.totalMFE / total).toFixed(2);
        
        // Classification counts
        let cleanCount = 0, scalpCount = 0, fakeCount = 0;
        for (const zone of Object.keys(this.todaySignals)) {
            for (const sig of this.todaySignals[zone]) {
                if (sig.outcome === 'CLEAN_RUNNER') cleanCount++;
                else if (sig.outcome === 'SMALL_SCALP') scalpCount++;
                else if (sig.outcome === 'FAKE_BREAK') fakeCount++;
            }
        }

        const report = [];
        report.push('═══════════════════════════════════════════════════════════════');
        report.push('     MAHASHAKTI V7.3 – DAILY SHADOW OBSERVATION REPORT');
        report.push('═══════════════════════════════════════════════════════════════');
        report.push(`     Report Time: ${reportTime}`);
        report.push(`     Date: ${dateStr}`);
        report.push(`     Observation Day: ${this.getObservationDay()} of ${this.observationDays}`);
        report.push('═══════════════════════════════════════════════════════════════');
        report.push('');
        
        report.push('📊 DAILY METRICS:');
        report.push('─'.repeat(50));
        report.push(`     Emit Rate:        ${stats.totalEmitted} signals`);
        report.push(`     +1% Hit Rate:     ${plusOneRate}% (${stats.totalPlusOneHit}/${total})`);
        report.push(`     +2% Hit Rate:     ${plusTwoRate}% (${stats.totalPlusTwoHit}/${total})`);
        report.push(`     Fake Break %:     ${fakeBreakRate}%`);
        report.push(`     Avg MAE:          ${avgMAE}%`);
        report.push(`     Avg MFE:          ${avgMFE}%`);
        report.push('');
        
        report.push('📊 SIGNAL CLASSIFICATION:');
        report.push('─'.repeat(50));
        report.push(`     🟢 CLEAN_RUNNER:  ${cleanCount}`);
        report.push(`     🟡 SMALL_SCALP:   ${scalpCount}`);
        report.push(`     🔴 FAKE_BREAK:    ${fakeCount}`);
        report.push('');
        
        report.push('📊 ZONE-WISE BREAKDOWN:');
        report.push('─'.repeat(50));
        for (const zone of ['EARLY', 'STRONG', 'EXTENDED', 'LATE']) {
            const zs = stats.byZone[zone];
            if (zs.count > 0) {
                const zonePlusOne = ((zs.plusOne / zs.count) * 100).toFixed(1);
                report.push(`     ${zone}: ${zs.count} signals | +1%: ${zonePlusOne}% | Fake: ${zs.fakeBreak}`);
            }
        }
        report.push('');
        
        // ELITE LOCKED check
        report.push('═══════════════════════════════════════════════════════════════');
        report.push('     🎯 ELITE LOCKED CRITERIA CHECK');
        report.push('═══════════════════════════════════════════════════════════════');
        
        const plusOneMet = parseFloat(plusOneRate) >= this.eliteCriteria.minPlusOneHitRate;
        const fakeBreakMet = parseFloat(fakeBreakRate) <= this.eliteCriteria.maxFakeBreakRate;
        const maeMet = parseFloat(avgMAE) <= this.eliteCriteria.maxAvgMAE;
        
        report.push(`     +1% ≥ 75%:        ${plusOneRate}% ${plusOneMet ? '✅' : '❌'}`);
        report.push(`     Fake ≤ 20%:       ${fakeBreakRate}% ${fakeBreakMet ? '✅' : '❌'}`);
        report.push(`     MAE ≤ 1%:         ${avgMAE}% ${maeMet ? '✅' : '❌'}`);
        report.push('');
        
        if (plusOneMet && fakeBreakMet && maeMet) {
            this.isEliteLocked = true;
            report.push('     🏆 STATUS: ELITE LOCKED ✅');
            report.push('     System has proven institutional-grade performance.');
        } else {
            report.push('     ⏳ STATUS: OBSERVATION IN PROGRESS');
            report.push('     Continue monitoring without threshold changes.');
        }
        report.push('');
        
        report.push('═══════════════════════════════════════════════════════════════');
        report.push('     ⚠️  REMINDER: NO THRESHOLD MODIFICATIONS ALLOWED');
        report.push('     If performance drops, REPORT FIRST, do not auto-adjust.');
        report.push('═══════════════════════════════════════════════════════════════');
        
        // Save report
        const reportContent = report.join('\n');
        const reportFile = path.join(this.dailyReportDir, `report_${dateStr}.txt`);
        fs.writeFileSync(reportFile, reportContent);
        
        // Also save to main logs
        fs.writeFileSync('/app/logs/shadow_daily_report.txt', reportContent);
        
        console.log(reportContent);
        
        return {
            date: dateStr,
            plusOneRate: parseFloat(plusOneRate),
            plusTwoRate: parseFloat(plusTwoRate),
            fakeBreakRate: parseFloat(fakeBreakRate),
            avgMAE: parseFloat(avgMAE),
            avgMFE: parseFloat(avgMFE),
            isEliteLocked: this.isEliteLocked
        };
    }

    getObservationDay() {
        const now = new Date();
        const diffTime = Math.abs(now - this.startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return Math.min(diffDays, this.observationDays);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STATUS CHECK
    // ═══════════════════════════════════════════════════════════════════════
    
    getStatus() {
        return {
            version: this.version,
            mode: this.mode,
            observationDay: this.getObservationDay(),
            totalObservationDays: this.observationDays,
            isEliteLocked: this.isEliteLocked,
            totalSignals: this.cumulativeStats.totalEmitted,
            thresholdsFrozen: true
        };
    }

    printStatus() {
        const status = this.getStatus();
        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('     MAHASHAKTI V7.3 – SHADOW MODE STATUS');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`     Version:          ${status.version}`);
        console.log(`     Mode:             ${status.mode}`);
        console.log(`     Observation Day:  ${status.observationDay}/${status.totalObservationDays}`);
        console.log(`     Total Signals:    ${status.totalSignals}`);
        console.log(`     Elite Locked:     ${status.isEliteLocked ? '✅ YES' : '⏳ PENDING'}`);
        console.log(`     Thresholds:       🔒 FROZEN`);
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('');
    }
}

// Export singleton
const shadowMode = new ShadowObservationMode();
module.exports = shadowMode;
