/**
 * NSE CALENDAR SERVICE
 * Handles holidays, special sessions, trading hours validation
 * HARD BLOCK - No signals outside valid trading windows
 */

class CalendarService {
    constructor() {
        // NSE Official Holidays 2024-2025
        this.holidays = new Set([
            // 2024 Holidays
            '2024-01-26', // Republic Day
            '2024-03-08', // Maha Shivaratri
            '2024-03-25', // Holi
            '2024-03-29', // Good Friday
            '2024-04-11', // Id-Ul-Fitr
            '2024-04-14', // Dr. Ambedkar Jayanti
            '2024-04-17', // Ram Navami
            '2024-04-21', // Mahavir Jayanti
            '2024-05-01', // Maharashtra Day
            '2024-05-23', // Buddha Purnima
            '2024-06-17', // Bakri Id
            '2024-07-17', // Muharram
            '2024-08-15', // Independence Day
            '2024-10-02', // Gandhi Jayanti
            '2024-11-01', // Diwali Laxmi Pujan
            '2024-11-15', // Guru Nanak Jayanti
            '2024-12-25', // Christmas
            // 2025 Holidays (projected)
            '2025-01-26', // Republic Day
            '2025-02-26', // Maha Shivaratri
            '2025-03-14', // Holi
            '2025-03-31', // Id-Ul-Fitr (tentative)
            '2025-04-10', // Mahavir Jayanti
            '2025-04-14', // Dr. Ambedkar Jayanti
            '2025-04-18', // Good Friday
            '2025-05-01', // Maharashtra Day
            '2025-05-12', // Buddha Purnima
            '2025-08-15', // Independence Day
            '2025-08-27', // Janmashtami
            '2025-10-02', // Gandhi Jayanti
            '2025-10-21', // Diwali Laxmi Pujan
            '2025-11-05', // Guru Nanak Jayanti
            '2025-12-25'  // Christmas
        ]);

        // Half-day sessions (close at 12:30 or 3:30 with different timing)
        this.halfDays = new Map([
            // Muhurat trading sessions (special timing)
        ]);

        // Special sessions (Muhurat trading, special expiry)
        this.specialSessions = new Map();

        // Trading hours config
        this.tradingHours = {
            normalOpen: { hour: 9, minute: 15 },
            normalClose: { hour: 15, minute: 30 },
            preOpenStart: { hour: 9, minute: 0 },
            preOpenEnd: { hour: 9, minute: 8 },
            postCloseEnd: { hour: 15, minute: 40 }
        };

        console.log('[CALENDAR] Initializing NSE calendar service...');
        console.log(`[CALENDAR] Loaded ${this.holidays.size} holidays`);
        console.log('[CALENDAR] Initialized');
    }

    /**
     * MAIN: Check if current time is valid for trading
     * @returns {object} { valid: boolean, reason: string }
     */
    isValidTradingTime(timestamp = Date.now()) {
        const date = new Date(timestamp);
        const dateStr = this.formatDate(date);

        // Check 1: Weekend
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            return {
                valid: false,
                reason: 'MARKET_HOLIDAY_BLOCKED',
                detail: 'Weekend - Market Closed'
            };
        }

        // Check 2: Holiday
        if (this.holidays.has(dateStr)) {
            return {
                valid: false,
                reason: 'MARKET_HOLIDAY_BLOCKED',
                detail: `NSE Holiday: ${dateStr}`
            };
        }

        // Check 3: Trading hours (IST)
        const istDate = this.toIST(date);
        const hours = istDate.getHours();
        const minutes = istDate.getMinutes();
        const timeMinutes = hours * 60 + minutes;

        const openMinutes = this.tradingHours.normalOpen.hour * 60 + this.tradingHours.normalOpen.minute;
        const closeMinutes = this.tradingHours.normalClose.hour * 60 + this.tradingHours.normalClose.minute;

        // Check for pre-open block
        const preOpenStart = this.tradingHours.preOpenStart.hour * 60 + this.tradingHours.preOpenStart.minute;
        const preOpenEnd = this.tradingHours.preOpenEnd.hour * 60 + this.tradingHours.preOpenEnd.minute;

        if (timeMinutes >= preOpenStart && timeMinutes < openMinutes) {
            return {
                valid: false,
                reason: 'TRADING_HOURS_BLOCKED',
                detail: 'Pre-Open Session - Signals Blocked'
            };
        }

        // Check normal hours
        if (timeMinutes < openMinutes) {
            return {
                valid: false,
                reason: 'TRADING_HOURS_BLOCKED',
                detail: `Market not open yet. Opens at 9:15 IST. Current: ${hours}:${minutes.toString().padStart(2, '0')}`
            };
        }

        if (timeMinutes > closeMinutes) {
            return {
                valid: false,
                reason: 'TRADING_HOURS_BLOCKED',
                detail: `Market closed. Closed at 3:30 IST. Current: ${hours}:${minutes.toString().padStart(2, '0')}`
            };
        }

        // Check for special session
        const specialSession = this.specialSessions.get(dateStr);
        if (specialSession) {
            const specialOpen = specialSession.open.hour * 60 + specialSession.open.minute;
            const specialClose = specialSession.close.hour * 60 + specialSession.close.minute;
            
            if (timeMinutes < specialOpen || timeMinutes > specialClose) {
                return {
                    valid: false,
                    reason: 'TRADING_HOURS_BLOCKED',
                    detail: `Special session timing: ${specialSession.name}`
                };
            }
        }

        // Check half-day
        const halfDay = this.halfDays.get(dateStr);
        if (halfDay) {
            const halfClose = halfDay.close.hour * 60 + halfDay.close.minute;
            if (timeMinutes > halfClose) {
                return {
                    valid: false,
                    reason: 'TRADING_HOURS_BLOCKED',
                    detail: `Half-day session. Closed at ${halfDay.close.hour}:${halfDay.close.minute.toString().padStart(2, '0')}`
                };
            }
        }

        return {
            valid: true,
            reason: 'TRADING_HOURS_OK',
            detail: `Market open: ${hours}:${minutes.toString().padStart(2, '0')} IST`
        };
    }

    /**
     * Check if a date is a holiday
     */
    isHoliday(date = new Date()) {
        const dateStr = this.formatDate(date);
        return this.holidays.has(dateStr);
    }

    /**
     * Check if today is expiry day
     */
    isExpiryDay(date = new Date()) {
        const dayOfWeek = date.getDay();
        // Thursday is weekly expiry
        return dayOfWeek === 4;
    }

    /**
     * Check if it's monthly expiry
     */
    isMonthlyExpiry(date = new Date()) {
        if (!this.isExpiryDay(date)) return false;
        
        // Last Thursday of month
        const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        let lastThursday = lastDay;
        
        while (lastThursday.getDay() !== 4) {
            lastThursday.setDate(lastThursday.getDate() - 1);
        }

        return date.getDate() === lastThursday.getDate();
    }

    /**
     * Get next trading day
     */
    getNextTradingDay(date = new Date()) {
        const next = new Date(date);
        next.setDate(next.getDate() + 1);

        while (this.holidays.has(this.formatDate(next)) || next.getDay() === 0 || next.getDay() === 6) {
            next.setDate(next.getDate() + 1);
        }

        return next;
    }

    /**
     * Get minutes until market open
     */
    getMinutesUntilOpen(date = new Date()) {
        const istDate = this.toIST(date);
        const openMinutes = this.tradingHours.normalOpen.hour * 60 + this.tradingHours.normalOpen.minute;
        const currentMinutes = istDate.getHours() * 60 + istDate.getMinutes();

        if (currentMinutes >= openMinutes) {
            return 0;
        }

        return openMinutes - currentMinutes;
    }

    /**
     * Get minutes until market close
     */
    getMinutesUntilClose(date = new Date()) {
        const istDate = this.toIST(date);
        const closeMinutes = this.tradingHours.normalClose.hour * 60 + this.tradingHours.normalClose.minute;
        const currentMinutes = istDate.getHours() * 60 + istDate.getMinutes();

        if (currentMinutes >= closeMinutes) {
            return 0;
        }

        return closeMinutes - currentMinutes;
    }

    /**
     * Add a special session (e.g., Muhurat)
     */
    addSpecialSession(dateStr, session) {
        this.specialSessions.set(dateStr, session);
        console.log(`[CALENDAR] Added special session: ${dateStr} - ${session.name}`);
    }

    /**
     * Add a holiday
     */
    addHoliday(dateStr, reason = 'Custom Holiday') {
        this.holidays.add(dateStr);
        console.log(`[CALENDAR] Added holiday: ${dateStr} - ${reason}`);
    }

    /**
     * Add half-day
     */
    addHalfDay(dateStr, closeHour, closeMinute) {
        this.halfDays.set(dateStr, {
            close: { hour: closeHour, minute: closeMinute }
        });
        console.log(`[CALENDAR] Added half-day: ${dateStr} - Close at ${closeHour}:${closeMinute}`);
    }

    /**
     * Convert to IST
     */
    toIST(date) {
        // IST is UTC+5:30
        const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
        return new Date(utc + (5.5 * 60 * 60 * 1000));
    }

    /**
     * Format date as YYYY-MM-DD
     */
    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Get service stats
     */
    getStats() {
        const now = new Date();
        const tradingStatus = this.isValidTradingTime();

        return {
            currentTime: now.toISOString(),
            istTime: this.toIST(now).toISOString(),
            tradingStatus,
            isExpiryDay: this.isExpiryDay(),
            isMonthlyExpiry: this.isMonthlyExpiry(),
            minutesUntilClose: this.getMinutesUntilClose(),
            totalHolidays: this.holidays.size,
            specialSessions: this.specialSessions.size,
            halfDays: this.halfDays.size,
            nextTradingDay: this.formatDate(this.getNextTradingDay())
        };
    }
}

module.exports = new CalendarService();
