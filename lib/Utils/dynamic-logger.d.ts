import type { ILogger } from './logger.js';
export interface DynamicLoggerOptions {
    level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';
    prefix?: string;
    colorize?: boolean;
    showTimestamp?: boolean;
}
export declare class DynamicLogger implements ILogger {
    level: string;
    private prefix;
    private bindings;
    private colorize;
    private showTimestamp;
    constructor(options?: DynamicLoggerOptions, bindings?: Record<string, unknown>);
    child(obj: Record<string, unknown>): ILogger;
    private shouldLog;
    private formatTimestamp;
    private getLevelBadge;
    private log;
    trace(obj: unknown, msg?: string): void;
    debug(obj: unknown, msg?: string): void;
    info(obj: unknown, msg?: string): void;
    warn(obj: unknown, msg?: string): void;
    error(obj: unknown, msg?: string): void;
    fatal(obj: unknown, msg?: string): void;
}
export declare const createDynamicLogger: (options?: DynamicLoggerOptions) => DynamicLogger;
export default createDynamicLogger;
//# sourceMappingURL=dynamic-logger.d.ts.map