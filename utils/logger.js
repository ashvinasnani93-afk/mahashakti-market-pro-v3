class Logger {
    constructor(module) {
        this.module = module;
        this.levels = {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3
        };
        this.currentLevel = this.levels.INFO;
    }

    setLevel(level) {
        if (this.levels[level] !== undefined) {
            this.currentLevel = this.levels[level];
        }
    }

    formatMessage(level, message, data) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level}] [${this.module}]`;
        
        if (data) {
            return `${prefix} ${message} ${JSON.stringify(data)}`;
        }
        return `${prefix} ${message}`;
    }

    debug(message, data) {
        if (this.currentLevel <= this.levels.DEBUG) {
            console.log(this.formatMessage('DEBUG', message, data));
        }
    }

    info(message, data) {
        if (this.currentLevel <= this.levels.INFO) {
            console.log(this.formatMessage('INFO', message, data));
        }
    }

    warn(message, data) {
        if (this.currentLevel <= this.levels.WARN) {
            console.warn(this.formatMessage('WARN', message, data));
        }
    }

    error(message, data) {
        if (this.currentLevel <= this.levels.ERROR) {
            console.error(this.formatMessage('ERROR', message, data));
        }
    }

    signal(type, instrument, details) {
        const signalLog = {
            type,
            symbol: instrument.symbol,
            timestamp: new Date().toISOString(),
            ...details
        };
        console.log(`[SIGNAL] ${type} | ${instrument.symbol} | ${JSON.stringify(details)}`);
        return signalLog;
    }

    explosion(instrument, explosionData) {
        console.log(`[EXPLOSION] ${explosionData.severity} | ${instrument.symbol} | Types: ${explosionData.types.map(t => t.type).join(', ')}`);
    }
}

function createLogger(module) {
    return new Logger(module);
}

module.exports = {
    Logger,
    createLogger
};
