/**
 * TIME OF DAY FILTER SERVICE
 * Implements time-based signal filtering
 * First 5 min strict mode, 12-1 PM drift suppression
 */

const calendarService = require('./calendar.service');

class TimeOfDayService {
    constructor() {
        this.config = {
            // First 5 minutes strict mode
            openingStrictMinutes: 5,
            openingVolumeMultiplier: 3,  // Require 3x volume in opening
            openingStrengthMinimum: 80,   // Higher strength threshold

            // Lunch hour drift suppression (12:00 - 13:00 IST)
            lunchHourStart: { hour: 12, minute: 0 },
            lunchHourEnd: { hour: 13, minute: 0 },
            lunchHourStrengthMultiplier: 1.5, // Require 1.5x strength

            // Last 15 minutes cautious mode
            closingCautiousMinutes: 15,
            closingRRMultiplier: 1.5  // Require better RR in closing
        };

        this.state = {
            currentMode: 'NORMAL',
            modeReason: null,
            lastUpdate: null
        };

        console.log('[TIME_OF_DAY] Initializing time-of-day filter...');
        console.log('[TIME_OF_DAY] Initialized');
    }

    /**
     * Get current market mode based on time
     */
    getCurrentMode() {
        const tradingCheck = calendarService.isValidTradingTime();
        if (!tradingCheck.valid) {
            return {
                mode: 'MARKET_CLOSED',
                reason: tradingCheck.reason,
                allowSignals: false
            };
        }

        const istNow = this.getISTTime();
        const hours = istNow.getHours();
        const minutes = istNow.getMinutes();
        const timeMinutes = hours * 60 + minutes;

        // Market timing
        const marketOpen = 9 * 60 + 15;  // 9:15
        const marketClose = 15 * 60 + 30; // 15:30

        // Check time periods
        const minutesSinceOpen = timeMinutes - marketOpen;
        const minutesUntilClose = marketClose - timeMinutes;

        // Opening strict mode (first 5 min)
        if (minutesSinceOpen >= 0 && minutesSinceOpen < this.config.openingStrictMinutes) {
            this.state.currentMode = 'OPENING_STRICT';
            this.state.modeReason = `First ${this.config.openingStrictMinutes} minutes - Strict mode`;
            return {
                mode: 'OPENING_STRICT',
                reason: this.state.modeReason,
                allowSignals: true,
                adjustments: {
                    volumeMultiplier: this.config.openingVolumeMultiplier,
                    minStrength: this.config.openingStrengthMinimum
                }
            };
        }

        // Lunch hour drift suppression (12:00 - 13:00)
        const lunchStart = this.config.lunchHourStart.hour * 60 + this.config.lunchHourStart.minute;
        const lunchEnd = this.config.lunchHourEnd.hour * 60 + this.config.lunchHourEnd.minute;
        
        if (timeMinutes >= lunchStart && timeMinutes < lunchEnd) {
            this.state.currentMode = 'LUNCH_DRIFT';
            this.state.modeReason = 'Lunch hour drift suppression active';
            return {
                mode: 'LUNCH_DRIFT',
                reason: this.state.modeReason,
                allowSignals: true,
                adjustments: {
                    strengthMultiplier: this.config.lunchHourStrengthMultiplier
                }
            };
        }

        // Closing cautious mode (last 15 min)
        if (minutesUntilClose >= 0 && minutesUntilClose < this.config.closingCautiousMinutes) {
            this.state.currentMode = 'CLOSING_CAUTIOUS';
            this.state.modeReason = `Last ${this.config.closingCautiousMinutes} minutes - Cautious mode`;
            return {
                mode: 'CLOSING_CAUTIOUS',
                reason: this.state.modeReason,
                allowSignals: true,
                adjustments: {
                    rrMultiplier: this.config.closingRRMultiplier
                }
            };
        }

        // Normal mode
        this.state.currentMode = 'NORMAL';
        this.state.modeReason = 'Normal trading hours';
        return {
            mode: 'NORMAL',
            reason: this.state.modeReason,
            allowSignals: true,
            adjustments: null
        };
    }

    /**
     * MAIN: Check if signal should be allowed with adjustments
     * @param {object} signal - Signal data with strength, volume, rr
     * @returns {object} { allowed: boolean, adjustedSignal: object }
     */
    checkSignal(signal) {
        const mode = this.getCurrentMode();
        
        if (!mode.allowSignals) {
            return {
                allowed: false,
                reason: mode.reason,
                mode: mode.mode
            };
        }

        if (mode.mode === 'NORMAL') {
            return {
                allowed: true,
                reason: mode.reason,
                mode: mode.mode,
                adjustments: null
            };
        }

        // Apply adjustments based on mode
        const adjustments = mode.adjustments;
        const failures = [];

        if (mode.mode === 'OPENING_STRICT') {
            // Check volume requirement
            if (signal.volumeMultiple && signal.volumeMultiple < adjustments.volumeMultiplier) {
                failures.push(`Volume ${signal.volumeMultiple}x < required ${adjustments.volumeMultiplier}x for opening`);
            }
            // Check strength requirement
            if (signal.strength && signal.strength < adjustments.minStrength) {
                failures.push(`Strength ${signal.strength} < required ${adjustments.minStrength} for opening`);
            }
        }

        if (mode.mode === 'LUNCH_DRIFT') {
            // Adjust strength threshold
            const requiredStrength = (signal.baseStrengthThreshold || 60) * adjustments.strengthMultiplier;
            if (signal.strength && signal.strength < requiredStrength) {
                failures.push(`Strength ${signal.strength} < required ${requiredStrength.toFixed(0)} for lunch hour`);
            }
        }

        if (mode.mode === 'CLOSING_CAUTIOUS') {
            // Check RR requirement
            const requiredRR = (signal.minRR || 1.5) * adjustments.rrMultiplier;
            if (signal.rr && signal.rr < requiredRR) {
                failures.push(`RR ${signal.rr.toFixed(2)} < required ${requiredRR.toFixed(2)} for closing`);
            }
        }

        if (failures.length > 0) {
            return {
                allowed: false,
                reason: `TIME_FILTER_BLOCK: ${failures.join('; ')}`,
                mode: mode.mode,
                failures
            };
        }

        return {
            allowed: true,
            reason: mode.reason,
            mode: mode.mode,
            adjustments: mode.adjustments
        };
    }

    /**
     * Get IST time
     */
    getISTTime() {
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        return new Date(utc + (5.5 * 60 * 60 * 1000));
    }

    /**
     * Get minutes since market open
     */
    getMinutesSinceOpen() {
        const istNow = this.getISTTime();
        const hours = istNow.getHours();
        const minutes = istNow.getMinutes();
        const timeMinutes = hours * 60 + minutes;
        const marketOpen = 9 * 60 + 15;
        return timeMinutes - marketOpen;
    }

    /**
     * Get minutes until market close
     */
    getMinutesUntilClose() {
        const istNow = this.getISTTime();
        const hours = istNow.getHours();
        const minutes = istNow.getMinutes();
        const timeMinutes = hours * 60 + minutes;
        const marketClose = 15 * 60 + 30;
        return marketClose - timeMinutes;
    }

    /**
     * Get stats
     */
    getStats() {
        const mode = this.getCurrentMode();
        return {
            currentMode: mode.mode,
            modeReason: mode.reason,
            adjustments: mode.adjustments,
            minutesSinceOpen: this.getMinutesSinceOpen(),
            minutesUntilClose: this.getMinutesUntilClose(),
            istTime: this.getISTTime().toISOString(),
            config: this.config
        };
    }
}

module.exports = new TimeOfDayService();
