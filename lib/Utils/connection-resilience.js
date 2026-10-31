import { Boom } from '@hapi/boom';
import { DisconnectReason } from '../Types/State.js';
import { getCodeFromWSError } from './generics.js';
const FATAL_STATUS_CODES = new Set([
    DisconnectReason.loggedOut, // 401
    DisconnectReason.forbidden, // 403
    DisconnectReason.badSession, // 500
    DisconnectReason.connectionReplaced, // 440
    DisconnectReason.multideviceMismatch // 411
]);
/**
 * Mengevaluasi error diskoneksi untuk menentukan apakah socket harus melakukan reconnect
 * atau menghentikan koneksi permanen guna menghindari loop tak berujung.
 */
export const evaluateDisconnect = (error) => {
    const errorMsg = String(error?.message || error?.toString?.() || '').toLowerCase();
    // 1. Akun Logout Permanen (401 atau pesan logout eksplisit)
    if (errorMsg.includes('logged out') || errorMsg.includes('intentional logout')) {
        return {
            statusCode: DisconnectReason.loggedOut,
            shouldReconnect: false,
            isFatal: true,
            isLoggedOut: true,
            reason: 'logged_out'
        };
    }
    // 2. Server Menolak Akses / Akun Banned / Not Authorized
    if (errorMsg.includes('forbidden') || errorMsg.includes('banned') || errorMsg.includes('not-authorized')) {
        return {
            statusCode: DisconnectReason.forbidden,
            shouldReconnect: false,
            isFatal: true,
            isLoggedOut: false,
            reason: 'forbidden'
        };
    }
    // 3. Sesi Rusak / Invalid Keys (Bad Session / bad-mac)
    if (errorMsg.includes('bad-mac') || errorMsg.includes('bad session')) {
        return {
            statusCode: DisconnectReason.badSession,
            shouldReconnect: false,
            isFatal: true,
            isLoggedOut: false,
            reason: 'bad_session'
        };
    }
    // 4. Sesi Digantikan oleh Perangkat Lain (Connection Replaced / Conflict)
    if (errorMsg.includes('conflict') || errorMsg.includes('replaced') || errorMsg.includes('connection replaced')) {
        return {
            statusCode: DisconnectReason.connectionReplaced,
            shouldReconnect: false,
            isFatal: true,
            isLoggedOut: false,
            reason: 'connection_replaced'
        };
    }
    // 5. Raw Socket / Network Error Khusus (ECONNRESET, ENOTFOUND, dll)
    if (errorMsg.includes('econnreset') ||
        errorMsg.includes('enotfound') ||
        errorMsg.includes('connection terminated') ||
        errorMsg.includes('connection closed') ||
        errorMsg.includes('connection was lost') ||
        errorMsg.includes('connection lost') ||
        error?.code === 'ECONNRESET' ||
        error?.code === 'ENOTFOUND') {
        return {
            statusCode: DisconnectReason.connectionClosed,
            shouldReconnect: true,
            isFatal: false,
            isLoggedOut: false,
            reason: 'temporary_disconnect'
        };
    }
    // 6. Network Timeout Khusus (ETIMEDOUT / timed out)
    if (errorMsg.includes('etimedout') ||
        errorMsg.includes('timed out') ||
        error?.code === 'ETIMEDOUT') {
        return {
            statusCode: DisconnectReason.timedOut,
            shouldReconnect: true,
            isFatal: false,
            isLoggedOut: false,
            reason: 'timeout'
        };
    }
    // 7. Ekstraksi status code dari Boom atau object error
    let statusCode;
    if (error instanceof Boom) {
        statusCode = error.output?.statusCode;
    }
    else if (typeof error === 'object' && error !== null) {
        const anyErr = error;
        statusCode = anyErr.output?.statusCode || anyErr.statusCode || anyErr.status;
        if (typeof statusCode !== 'number' && anyErr instanceof Error) {
            const wsCode = getCodeFromWSError(anyErr);
            if (wsCode && wsCode !== 500) {
                statusCode = wsCode;
            }
        }
    }
    // Evaluasi berdasarkan status code numerik
    if (typeof statusCode === 'number') {
        if (statusCode === DisconnectReason.loggedOut) {
            return {
                statusCode,
                shouldReconnect: false,
                isFatal: true,
                isLoggedOut: true,
                reason: 'logged_out'
            };
        }
        if (statusCode === DisconnectReason.forbidden) {
            return {
                statusCode,
                shouldReconnect: false,
                isFatal: true,
                isLoggedOut: false,
                reason: 'forbidden'
            };
        }
        if (statusCode === DisconnectReason.badSession) {
            return {
                statusCode,
                shouldReconnect: false,
                isFatal: true,
                isLoggedOut: false,
                reason: 'bad_session'
            };
        }
        if (statusCode === DisconnectReason.connectionReplaced) {
            return {
                statusCode,
                shouldReconnect: false,
                isFatal: true,
                isLoggedOut: false,
                reason: 'connection_replaced'
            };
        }
        if (statusCode === DisconnectReason.multideviceMismatch) {
            return {
                statusCode,
                shouldReconnect: false,
                isFatal: true,
                isLoggedOut: false,
                reason: 'bad_session'
            };
        }
        if (statusCode === DisconnectReason.connectionClosed ||
            statusCode === DisconnectReason.restartRequired ||
            statusCode === DisconnectReason.unavailableService) {
            return {
                statusCode,
                shouldReconnect: true,
                isFatal: false,
                isLoggedOut: false,
                reason: 'temporary_disconnect'
            };
        }
        if (statusCode === DisconnectReason.timedOut) {
            return {
                statusCode,
                shouldReconnect: true,
                isFatal: false,
                isLoggedOut: false,
                reason: 'timeout'
            };
        }
    }
    // 8. Fallback umum
    const isFatal = typeof statusCode === 'number' ? FATAL_STATUS_CODES.has(statusCode) : false;
    return {
        statusCode,
        shouldReconnect: !isFatal,
        isFatal,
        isLoggedOut: false,
        reason: isFatal ? 'forbidden' : 'unknown'
    };
};
/**
 * Menghitung interval jeda reconnect dengan exponential backoff dan jitter
 */
export const calculateReconnectBackoff = (attempt, options = {}) => {
    const baseDelayMs = options.baseDelayMs ?? 2000;
    const maxDelayMs = options.maxDelayMs ?? 30000;
    const withJitter = options.jitter ?? true;
    const exponential = Math.min(maxDelayMs, baseDelayMs * Math.pow(1.5, Math.max(0, attempt - 1)));
    const jitter = withJitter ? Math.floor(Math.random() * 1000) : 0;
    return Math.min(maxDelayMs, Math.round(exponential + jitter));
};
/**
 * Supervisor pengelola koneksi dan reconnect loop untuk mencegah
 * concurrent reconnection, duplicate bursts, dan reconnection storms.
 */
export class ReconnectionSupervisor {
    constructor(options = {}) {
        this.attempt = 0;
        this.isReconnecting = false;
        this.reconnectTimer = null;
        this.options = {
            maxRetries: options.maxRetries ?? 10,
            baseDelayMs: options.baseDelayMs ?? 2000,
            maxDelayMs: options.maxDelayMs ?? 30000,
            jitter: options.jitter ?? true
        };
    }
    getAttempts() {
        return this.attempt;
    }
    getIsReconnecting() {
        return this.isReconnecting;
    }
    hasPendingTimer() {
        return this.reconnectTimer !== null;
    }
    onConnected() {
        this.attempt = 0;
        this.isReconnecting = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
    handleDisconnect(error, onExecuteReconnect) {
        const decision = evaluateDisconnect(error);
        if (!decision.shouldReconnect) {
            this.isReconnecting = false;
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            return { decision, scheduled: false, delayMs: 0 };
        }
        if (this.attempt >= this.options.maxRetries) {
            this.isReconnecting = false;
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            return {
                decision: { ...decision, shouldReconnect: false, isFatal: true },
                scheduled: false,
                delayMs: 0
            };
        }
        // KUNCI KESTABILAN: Jika reconnect sudah dijadwalkan dan sedang menunggu delay,
        // abaikan burst event disconnect ganda (misal WS error disusul WS close)
        // agar tidak menjadwalkan timer ganda dan tidak menaikkan attempt counter semu.
        if (this.reconnectTimer !== null) {
            return { decision, scheduled: false, delayMs: 0 };
        }
        this.attempt++;
        this.isReconnecting = true;
        const delayMs = calculateReconnectBackoff(this.attempt, this.options);
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            try {
                await onExecuteReconnect();
            }
            finally {
                // State dibersihkan saat onConnected atau handleDisconnect berikutnya
            }
        }, delayMs);
        return { decision, scheduled: true, delayMs };
    }
    abort() {
        this.isReconnecting = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
    clear() {
        this.abort();
    }
}
//# sourceMappingURL=connection-resilience.js.map