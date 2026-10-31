import type { AuthenticationState } from '../Types/index.js';
export interface RealtimeSessionState {
    connection: 'open' | 'connecting' | 'close';
    connectionStatus: 'open' | 'connecting' | 'close';
    uptime: number;
    connectedAt: Date | null;
    lastSeen: Date | null;
    pingMs: number;
    latencyMs: number;
    reconnectCount: number;
    user: {
        id: string;
        name?: string;
    } | null;
    registered: boolean;
    qrPending: boolean;
    isHealthy: boolean;
    messagesSent: number;
    messagesReceived: number;
    messagesIn: number;
    messagesOut: number;
}
export interface SessionHealthReport {
    status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
    connection: 'open' | 'connecting' | 'close';
    connectionStatus: 'open' | 'connecting' | 'close';
    isHealthy: boolean;
    score: number;
    registered: boolean;
    uptimeSeconds: number;
    latencyMs: number;
    state: RealtimeSessionState;
    memoryUsage: {
        rssMb: number;
        heapUsedMb: number;
        heapTotalMb: number;
    };
    stats: {
        messagesSent: number;
        messagesReceived: number;
        reconnectAttempts: number;
    };
    messagesIn: number;
    messagesOut: number;
    diagnosticMessages: string[];
    timestamp: Date;
}
export declare class SessionHealthTracker {
    private connection;
    private connectedAt;
    private lastSeen;
    private pingMs;
    private reconnectCount;
    private messagesSent;
    private messagesReceived;
    private qrPending;
    private authState?;
    private queryFn?;
    private stateListeners;
    constructor(authState?: AuthenticationState, queryFn?: (node: any, timeoutMs?: number) => Promise<any>);
    setAuthState(authState: AuthenticationState): void;
    setQueryFn(queryFn: (node: any, timeoutMs?: number) => Promise<any>): void;
    updateConnection(conn: 'open' | 'connecting' | 'close'): void;
    setQrPending(pending: boolean): void;
    recordMessageSent(): void;
    recordMessageReceived(): void;
    recordActivity(): void;
    recordPing(ms: number): void;
    onStateUpdate(listener: (state: RealtimeSessionState) => void): () => void;
    private notifyUpdate;
    getState(): RealtimeSessionState;
    checkHealth(): Promise<SessionHealthReport>;
}
export default SessionHealthTracker;
//# sourceMappingURL=session-health.d.ts.map