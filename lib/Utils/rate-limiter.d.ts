export interface RateLimitConfig {
    /** Maximum actions/commands allowed within windowMs (default: 5) */
    max?: number;
    /** Time window in milliseconds (default: 10000ms / 10s) */
    windowMs?: number;
    /** Cooldown/blocking duration when limit is exceeded (default: 15000ms / 15s) */
    cooldownMs?: number;
}
export interface RateLimitCheckResult {
    limited: boolean;
    remainingMs: number;
    count: number;
    max: number;
    resetAt: number;
}
export declare class RateLimiter {
    private records;
    private defaultConfig;
    private cleanupTimer?;
    constructor(config?: RateLimitConfig);
    /**
     * Check if a key is rate limited without consuming/incrementing quota
     */
    check(key: string, customConfig?: RateLimitConfig): RateLimitCheckResult;
    /**
     * Consume 1 quota for key and evaluate rate limit status.
     * If quota exceeded, activates cooldown blocking.
     */
    consume(key: string, customConfig?: RateLimitConfig): RateLimitCheckResult;
    /**
     * Force block key for a specific duration
     */
    block(key: string, durationMs?: number): void;
    /**
     * Reset rate limits for specific key
     */
    reset(key: string): void;
    /**
     * Clear all stored rate limit records
     */
    clear(): void;
    private cleanup;
    private resolveConfig;
}
export interface AntiBanConfig {
    /** Enable intelligent anti-ban humanized sending and flood regulation */
    enabled?: boolean;
    /** Minimum interval delay in milliseconds before dispatching message (default: 400ms) */
    minDelayMs?: number;
    /** Maximum interval delay in milliseconds before dispatching message (default: 1200ms) */
    maxDelayMs?: number;
    /** Automatically simulate realistic composing/typing presence during delay (default: true) */
    simulatePresence?: boolean;
}
export declare class AntiBanEngine {
    private queue;
    private isProcessing;
    private config;
    constructor(config?: AntiBanConfig);
    get isEnabled(): boolean;
    enable(): void;
    disable(): void;
    updateConfig(config: Partial<AntiBanConfig>): void;
    getQueueSize(): number;
    /**
     * Schedule an outbound send action through the anti-ban queue with humanized jitter
     */
    schedule<T>(action: () => Promise<T>, metadata?: {
        chat?: string;
        sock?: any;
        skipDelay?: boolean;
    }): Promise<T>;
    private processQueue;
}
//# sourceMappingURL=rate-limiter.d.ts.map