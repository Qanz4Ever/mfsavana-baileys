export class RateLimiter {
    constructor(config) {
        this.records = new Map();
        this.defaultConfig = {
            max: config?.max ?? 5,
            windowMs: config?.windowMs ?? 10000,
            cooldownMs: config?.cooldownMs ?? 15000
        };
        // Periodic cleanup every 60 seconds
        if (typeof setInterval !== 'undefined') {
            this.cleanupTimer = setInterval(() => this.cleanup(), 60000);
            if (this.cleanupTimer && typeof this.cleanupTimer.unref === 'function') {
                this.cleanupTimer.unref();
            }
        }
    }
    /**
     * Check if a key is rate limited without consuming/incrementing quota
     */
    check(key, customConfig) {
        const now = Date.now();
        const cfg = this.resolveConfig(customConfig);
        const record = this.records.get(key);
        if (!record) {
            return {
                limited: false,
                remainingMs: 0,
                count: 0,
                max: cfg.max,
                resetAt: now + cfg.windowMs
            };
        }
        // Check if actively blocked / cooling down
        if (record.blockedUntil > now) {
            return {
                limited: true,
                remainingMs: record.blockedUntil - now,
                count: record.count,
                max: cfg.max,
                resetAt: record.blockedUntil
            };
        }
        // Check if window has expired
        if (now - record.windowStart > cfg.windowMs) {
            return {
                limited: false,
                remainingMs: 0,
                count: 0,
                max: cfg.max,
                resetAt: now + cfg.windowMs
            };
        }
        const limited = record.count >= cfg.max;
        const remainingMs = limited ? Math.max(0, record.windowStart + cfg.windowMs - now) : 0;
        return {
            limited,
            remainingMs,
            count: record.count,
            max: cfg.max,
            resetAt: record.windowStart + cfg.windowMs
        };
    }
    /**
     * Consume 1 quota for key and evaluate rate limit status.
     * If quota exceeded, activates cooldown blocking.
     */
    consume(key, customConfig) {
        const now = Date.now();
        const cfg = this.resolveConfig(customConfig);
        let record = this.records.get(key);
        // Actively blocked
        if (record && record.blockedUntil > now) {
            return {
                limited: true,
                remainingMs: record.blockedUntil - now,
                count: record.count,
                max: cfg.max,
                resetAt: record.blockedUntil
            };
        }
        // Init or reset expired window
        if (!record || now - record.windowStart > cfg.windowMs) {
            record = {
                count: 1,
                windowStart: now,
                blockedUntil: 0
            };
            this.records.set(key, record);
            return {
                limited: false,
                remainingMs: 0,
                count: 1,
                max: cfg.max,
                resetAt: now + cfg.windowMs
            };
        }
        // Inside active window
        record.count++;
        if (record.count > cfg.max) {
            // Trigger cooldown penalty
            record.blockedUntil = now + cfg.cooldownMs;
            return {
                limited: true,
                remainingMs: cfg.cooldownMs,
                count: record.count,
                max: cfg.max,
                resetAt: record.blockedUntil
            };
        }
        return {
            limited: false,
            remainingMs: 0,
            count: record.count,
            max: cfg.max,
            resetAt: record.windowStart + cfg.windowMs
        };
    }
    /**
     * Force block key for a specific duration
     */
    block(key, durationMs) {
        const now = Date.now();
        const duration = durationMs ?? this.defaultConfig.cooldownMs;
        const record = this.records.get(key) || { count: 0, windowStart: now, blockedUntil: 0 };
        record.blockedUntil = now + duration;
        this.records.set(key, record);
    }
    /**
     * Reset rate limits for specific key
     */
    reset(key) {
        this.records.delete(key);
    }
    /**
     * Clear all stored rate limit records
     */
    clear() {
        this.records.clear();
    }
    cleanup() {
        const now = Date.now();
        for (const [key, record] of this.records.entries()) {
            if (record.blockedUntil <= now && now - record.windowStart > this.defaultConfig.windowMs) {
                this.records.delete(key);
            }
        }
    }
    resolveConfig(customConfig) {
        if (!customConfig)
            return this.defaultConfig;
        return {
            max: customConfig.max ?? this.defaultConfig.max,
            windowMs: customConfig.windowMs ?? this.defaultConfig.windowMs,
            cooldownMs: customConfig.cooldownMs ?? this.defaultConfig.cooldownMs
        };
    }
}
export class AntiBanEngine {
    constructor(config) {
        this.queue = [];
        this.isProcessing = false;
        this.config = {
            enabled: config?.enabled ?? false,
            minDelayMs: Math.max(100, config?.minDelayMs ?? 400),
            maxDelayMs: Math.max(config?.minDelayMs ?? 400, config?.maxDelayMs ?? 1200),
            simulatePresence: config?.simulatePresence ?? true
        };
    }
    get isEnabled() {
        return this.config.enabled;
    }
    enable() {
        this.config.enabled = true;
    }
    disable() {
        this.config.enabled = false;
    }
    updateConfig(config) {
        if (config.enabled !== undefined)
            this.config.enabled = config.enabled;
        if (config.minDelayMs !== undefined)
            this.config.minDelayMs = config.minDelayMs;
        if (config.maxDelayMs !== undefined)
            this.config.maxDelayMs = config.maxDelayMs;
        if (config.simulatePresence !== undefined)
            this.config.simulatePresence = config.simulatePresence;
    }
    getQueueSize() {
        return this.queue.length;
    }
    /**
     * Schedule an outbound send action through the anti-ban queue with humanized jitter
     */
    async schedule(action, metadata) {
        if (!this.config.enabled || metadata?.skipDelay) {
            return action();
        }
        return new Promise((resolve, reject) => {
            const task = async () => {
                const { chat, sock } = metadata || {};
                const jitter = Math.floor(Math.random() * (this.config.maxDelayMs - this.config.minDelayMs + 1)) + this.config.minDelayMs;
                try {
                    if (this.config.simulatePresence && chat && sock?.sendPresenceUpdate) {
                        try {
                            await sock.sendPresenceUpdate('composing', chat);
                        }
                        catch { }
                    }
                    await new Promise(r => setTimeout(r, jitter));
                    const result = await action();
                    resolve(result);
                }
                catch (err) {
                    reject(err);
                }
                finally {
                    if (this.config.simulatePresence && chat && sock?.sendPresenceUpdate) {
                        try {
                            await sock.sendPresenceUpdate('paused', chat);
                        }
                        catch { }
                    }
                }
            };
            this.queue.push(task);
            this.processQueue();
        });
    }
    async processQueue() {
        if (this.isProcessing || this.queue.length === 0)
            return;
        this.isProcessing = true;
        while (this.queue.length > 0) {
            const nextTask = this.queue.shift();
            if (nextTask) {
                try {
                    await nextTask();
                }
                catch { }
            }
        }
        this.isProcessing = false;
    }
}
//# sourceMappingURL=rate-limiter.js.map