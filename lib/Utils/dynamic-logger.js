import util from 'util';
const LEVEL_WEIGHTS = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
    silent: 100
};
const COLORS = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
    gray: '\x1b[90m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    brightRed: '\x1b[91;1m',
    magenta: '\x1b[35m',
    bgRed: '\x1b[41;97;1m'
};
export class DynamicLogger {
    constructor(options = {}, bindings = {}) {
        this.level = options.level || 'info';
        this.prefix = options.prefix || 'MFSAVANA';
        this.bindings = bindings;
        this.colorize = options.colorize !== false;
        this.showTimestamp = options.showTimestamp !== false;
    }
    child(obj) {
        return new DynamicLogger({
            level: this.level,
            prefix: this.prefix,
            colorize: this.colorize,
            showTimestamp: this.showTimestamp
        }, { ...this.bindings, ...obj });
    }
    shouldLog(level) {
        const targetWeight = LEVEL_WEIGHTS[this.level.toLowerCase()] ?? 30;
        const currentWeight = LEVEL_WEIGHTS[level.toLowerCase()] ?? 30;
        return currentWeight >= targetWeight;
    }
    formatTimestamp() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        const ms = String(now.getMilliseconds()).padStart(3, '0');
        return `${h}:${m}:${s}.${ms}`;
    }
    getLevelBadge(level) {
        if (!this.colorize) {
            return `[${level.toUpperCase()}]`;
        }
        switch (level) {
            case 'trace':
                return `${COLORS.gray}[TRACE]${COLORS.reset}`;
            case 'debug':
                return `${COLORS.magenta}[DEBUG]${COLORS.reset}`;
            case 'info':
                return `${COLORS.green}${COLORS.bold}[INFO]${COLORS.reset}`;
            case 'warn':
                return `${COLORS.yellow}${COLORS.bold}[WARN]${COLORS.reset}`;
            case 'error':
                return `${COLORS.brightRed}[ERROR]${COLORS.reset}`;
            case 'fatal':
                return `${COLORS.bgRed}[FATAL]${COLORS.reset}`;
            default:
                return `[${level.toUpperCase()}]`;
        }
    }
    log(level, obj, msg) {
        if (!this.shouldLog(level))
            return;
        const parts = [];
        // 1. Timestamp
        if (this.showTimestamp) {
            const timeStr = this.formatTimestamp();
            parts.push(this.colorize ? `${COLORS.gray}${timeStr}${COLORS.reset}` : timeStr);
        }
        // 2. Badge
        parts.push(this.getLevelBadge(level));
        // 3. Prefix & Context Tag
        const tagParts = [this.prefix];
        const className = this.bindings.class || this.bindings.module;
        if (className && typeof className === 'string') {
            tagParts.push(className);
        }
        const tag = `[${tagParts.join(':')}]`;
        parts.push(this.colorize ? `${COLORS.cyan}${tag}${COLORS.reset}` : tag);
        // 4. Message text
        let textMsg = msg;
        let dataObj = obj;
        if (typeof obj === 'string' && typeof msg === 'undefined') {
            textMsg = obj;
            dataObj = undefined;
        }
        else if (dataObj && typeof dataObj === 'object' && 'msg' in dataObj && !textMsg) {
            textMsg = dataObj.msg;
            const { msg: _, ...rest } = dataObj;
            dataObj = Object.keys(rest).length ? rest : undefined;
        }
        if (textMsg) {
            parts.push(textMsg);
        }
        // 5. Data Object / Error Stack
        if (dataObj !== undefined) {
            if (dataObj instanceof Error) {
                parts.push('\n' + (this.colorize ? `${COLORS.red}${dataObj.stack || dataObj.message}${COLORS.reset}` : (dataObj.stack || dataObj.message)));
            }
            else {
                const mergedData = { ...this.bindings, ...(typeof dataObj === 'object' ? dataObj : { data: dataObj }) };
                // Remove noise keys from output if trivial
                delete mergedData.class;
                delete mergedData.module;
                if (Object.keys(mergedData).length > 0) {
                    const formatted = util.inspect(mergedData, {
                        colors: this.colorize,
                        depth: 3,
                        compact: true,
                        breakLength: 100
                    });
                    parts.push(formatted);
                }
            }
        }
        const line = parts.join(' ');
        if (level === 'error' || level === 'fatal') {
            console.error(line);
        }
        else if (level === 'warn') {
            console.warn(line);
        }
        else {
            console.log(line);
        }
    }
    trace(obj, msg) {
        this.log('trace', obj, msg);
    }
    debug(obj, msg) {
        this.log('debug', obj, msg);
    }
    info(obj, msg) {
        this.log('info', obj, msg);
    }
    warn(obj, msg) {
        this.log('warn', obj, msg);
    }
    error(obj, msg) {
        this.log('error', obj, msg);
    }
    fatal(obj, msg) {
        this.log('fatal', obj, msg);
    }
}
export const createDynamicLogger = (options) => {
    return new DynamicLogger(options);
};
export default createDynamicLogger;
//# sourceMappingURL=dynamic-logger.js.map