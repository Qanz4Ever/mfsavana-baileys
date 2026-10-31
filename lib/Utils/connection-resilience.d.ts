export interface DisconnectDecision {
    statusCode?: number;
    shouldReconnect: boolean;
    isFatal: boolean;
    isLoggedOut: boolean;
    reason: 'temporary_disconnect' | 'timeout' | 'forbidden' | 'logged_out' | 'bad_session' | 'connection_replaced' | 'unknown';
}
export interface ReconnectPolicyOptions {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    jitter?: boolean;
}
/**
 * Mengevaluasi error diskoneksi untuk menentukan apakah socket harus melakukan reconnect
 * atau menghentikan koneksi permanen guna menghindari loop tak berujung.
 */
export declare const evaluateDisconnect: (error: unknown) => DisconnectDecision;
/**
 * Menghitung interval jeda reconnect dengan exponential backoff dan jitter
 */
export declare const calculateReconnectBackoff: (attempt: number, options?: ReconnectPolicyOptions) => number;
/**
 * Supervisor pengelola koneksi dan reconnect loop untuk mencegah
 * concurrent reconnection, duplicate bursts, dan reconnection storms.
 */
export declare class ReconnectionSupervisor {
    private attempt;
    private isReconnecting;
    private reconnectTimer;
    private options;
    constructor(options?: ReconnectPolicyOptions);
    getAttempts(): number;
    getIsReconnecting(): boolean;
    hasPendingTimer(): boolean;
    onConnected(): void;
    handleDisconnect(error: unknown, onExecuteReconnect: () => Promise<void> | void): {
        decision: DisconnectDecision;
        scheduled: boolean;
        delayMs: number;
    };
    abort(): void;
    clear(): void;
}
//# sourceMappingURL=connection-resilience.d.ts.map