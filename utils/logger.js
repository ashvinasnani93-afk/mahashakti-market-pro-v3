class Logger {
    constructor(module) {
        this.module = module;
        this.levels = {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3,
            SIGNAL: 4
        };
        this.currentLevel = this.levels.INFO;
        this.signalLog = [];
        this.errorLog = [];
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
            
            this.errorLog.push({
                timestamp: new Date().toISOString(),
                module: this.module,
                message,
                data
            });
            
            if (this.errorLog.length > 100) {
                this.errorLog.shift();
            }
        }
    }

    signal(type, instrument, details) {
        const signalEntry = {
            type,
            symbol: instrument.symbol,
            timestamp: new Date().toISOString(),
            ...details
        };
        
        console.log(`[SIGNAL] ${type} | ${instrument.symbol} | Strength: ${details.strength || 'N/A'} | Price: ${details.price || 'N/A'}`);
        
        this.signalLog.push(signalEntry);
        if (this.signalLog.length > 500) {
            this.signalLog.shift();
        }
        
        return signalEntry;
    }

    explosion(instrument, explosionData) {
        const msg = `[EXPLOSION] ${explosionData.severity} | ${instrument.symbol} | Types: ${explosionData.types.map(t => t.type).join(', ')}`;
        console.log(msg);
        
        return {
            timestamp: new Date().toISOString(),
            instrument: instrument.symbol,
            ...explosionData
        };
    }

    trade(action, instrument, details) {
        const tradeEntry = {
            action,
            symbol: instrument.symbol,
            timestamp: new Date().toISOString(),
            ...details
        };
        
        console.log(`[TRADE] ${action} | ${instrument.symbol} | Entry: ${details.entry} | SL: ${details.stopLoss} | Target: ${details.target}`);
        
        return tradeEntry;
    }

    performance(operation, durationMs, details) {
        console.log(`[PERF] ${operation} completed in ${durationMs}ms`, details || '');
    }

    getSignalLog(count = 100) {
        return this.signalLog.slice(-count);
    }

    getErrorLog(count = 50) {
        return this.errorLog.slice(-count);
    }

    clearLogs() {
        this.signalLog = [];
        this.errorLog = [];
    }
}

function createLogger(module) {
    return new Logger(module);
}

const loggers = {};

function getLogger(module) {
    if (!loggers[module]) {
        loggers[module] = new Logger(module);
    }
    return loggers[module];
}

module.exports = {
    Logger,
    createLogger,
    getLogger
};
