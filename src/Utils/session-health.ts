import type { AuthenticationState } from '../Types'

export interface RealtimeSessionState {
	connection: 'open' | 'connecting' | 'close'
	connectionStatus: 'open' | 'connecting' | 'close'
	uptime: number
	connectedAt: Date | null
	lastSeen: Date | null
	pingMs: number
	latencyMs: number
	reconnectCount: number
	user: { id: string; name?: string } | null
	registered: boolean
	qrPending: boolean
	isHealthy: boolean
	messagesSent: number
	messagesReceived: number
	messagesIn: number
	messagesOut: number
}

export interface SessionHealthReport {
	status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY'
	connection: 'open' | 'connecting' | 'close'
	connectionStatus: 'open' | 'connecting' | 'close'
	isHealthy: boolean
	score: number
	registered: boolean
	uptimeSeconds: number
	latencyMs: number
	state: RealtimeSessionState
	memoryUsage: {
		rssMb: number
		heapUsedMb: number
		heapTotalMb: number
	}
	stats: {
		messagesSent: number
		messagesReceived: number
		reconnectAttempts: number
	}
	messagesIn: number
	messagesOut: number
	diagnosticMessages: string[]
	timestamp: Date
}

export class SessionHealthTracker {
	private connection: 'open' | 'connecting' | 'close' = 'close'
	private connectedAt: Date | null = null
	private lastSeen: Date | null = null
	private pingMs = 0
	private reconnectCount = 0
	private messagesSent = 0
	private messagesReceived = 0
	private qrPending = false
	private authState?: AuthenticationState
	private queryFn?: (node: any, timeoutMs?: number) => Promise<any>
	private stateListeners: Set<(state: RealtimeSessionState) => void> = new Set()

	constructor(authState?: AuthenticationState, queryFn?: (node: any, timeoutMs?: number) => Promise<any>) {
		this.authState = authState
		this.queryFn = queryFn
	}

	setAuthState(authState: AuthenticationState) {
		this.authState = authState
		this.notifyUpdate()
	}

	setQueryFn(queryFn: (node: any, timeoutMs?: number) => Promise<any>) {
		this.queryFn = queryFn
	}

	updateConnection(conn: 'open' | 'connecting' | 'close') {
		if (conn === 'open' && this.connection !== 'open') {
			this.connectedAt = new Date()
			this.qrPending = false
		} else if (conn === 'close') {
			this.connectedAt = null
			this.reconnectCount++
		}
		this.connection = conn
		this.lastSeen = new Date()
		this.notifyUpdate()
	}

	setQrPending(pending: boolean) {
		this.qrPending = pending
		this.notifyUpdate()
	}

	recordMessageSent() {
		this.messagesSent++
		this.lastSeen = new Date()
	}

	recordMessageReceived() {
		this.messagesReceived++
		this.lastSeen = new Date()
	}

	recordActivity() {
		this.lastSeen = new Date()
	}

	recordPing(ms: number) {
		this.pingMs = Math.round(ms)
		this.notifyUpdate()
	}

	onStateUpdate(listener: (state: RealtimeSessionState) => void) {
		this.stateListeners.add(listener)
		return () => {
			this.stateListeners.delete(listener)
		}
	}

	private notifyUpdate() {
		const state = this.getState()
		for (const listener of this.stateListeners) {
			try {
				listener(state)
			} catch {}
		}
	}

	getState(): RealtimeSessionState {
		const now = Date.now()
		const uptime = this.connectedAt ? Math.floor((now - this.connectedAt.getTime()) / 1000) : 0
		const registered = Boolean(this.authState?.creds?.registered)
		const isHealthy = this.connection === 'open' && registered && this.pingMs < 3000

		return {
			connection: this.connection,
			connectionStatus: this.connection,
			uptime,
			connectedAt: this.connectedAt,
			lastSeen: this.lastSeen,
			pingMs: this.pingMs,
			latencyMs: this.pingMs,
			reconnectCount: this.reconnectCount,
			user: this.authState?.creds?.me ? { id: this.authState.creds.me.id, name: this.authState.creds.me.name } : null,
			registered,
			qrPending: this.qrPending,
			isHealthy,
			messagesSent: this.messagesSent,
			messagesReceived: this.messagesReceived,
			messagesIn: this.messagesReceived,
			messagesOut: this.messagesSent
		}
	}

	async checkHealth(): Promise<SessionHealthReport> {
		const startTime = Date.now()
		const diagnostics: string[] = []

		// 1. Measure ping latency if socket is open
		if (this.connection === 'open' && this.queryFn) {
			try {
				const pingStart = Date.now()
				// Ping WhatsApp server via lightweight IQ query
				await this.queryFn({
					tag: 'iq',
					attrs: {
						to: 's.whatsapp.net',
						type: 'get',
						xmlns: 'w:p'
					}
				}, 5000)
				this.pingMs = Date.now() - pingStart
				diagnostics.push(`WhatsApp WebSocket responsive (${this.pingMs}ms latency)`)
			} catch (err: any) {
				diagnostics.push(`Ping check warning: ${err.message || 'timeout'}`)
			}
		} else if (this.connection === 'connecting') {
			diagnostics.push('Session is currently connecting to WhatsApp...')
		} else {
			diagnostics.push('Session is disconnected')
		}

		// 2. Auth State Check
		const registered = Boolean(this.authState?.creds?.registered)
		if (registered) {
			diagnostics.push(`Session authenticated as ${this.authState?.creds?.me?.id || 'registered account'}`)
		} else {
			diagnostics.push('Session is not registered / waiting for pairing')
		}

		// 3. PreKey buffer diagnosis
		if (this.authState?.creds) {
			const firstUnuploaded = this.authState.creds.firstUnuploadedPreKeyId || 0
			const nextPreKey = this.authState.creds.nextPreKeyId || 0
			const pendingPreKeys = Math.max(0, nextPreKey - firstUnuploaded)
			diagnostics.push(`PreKeys buffer: ${pendingPreKeys} available`)
		}

		// 4. Memory Usage
		const mem = process.memoryUsage()
		const rssMb = Math.round((mem.rss / 1024 / 1024) * 100) / 100
		const heapUsedMb = Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100
		const heapTotalMb = Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100
		diagnostics.push(`Node memory: ${heapUsedMb} MB / ${heapTotalMb} MB (RSS: ${rssMb} MB)`)

		// 5. Determine Overall Status & Score
		let status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' = 'HEALTHY'
		let score = 100
		if (this.connection === 'close') {
			status = 'UNHEALTHY'
			score = 20
		} else if (this.connection === 'connecting' || this.pingMs > 2500 || !registered) {
			status = 'DEGRADED'
			score = this.pingMs > 2500 ? 70 : 60
		}

		const now = Date.now()
		const uptimeSeconds = this.connectedAt ? Math.floor((now - this.connectedAt.getTime()) / 1000) : 0
		const currentState = this.getState()

		return {
			status,
			connection: this.connection,
			connectionStatus: this.connection,
			isHealthy: status === 'HEALTHY',
			score,
			registered,
			uptimeSeconds,
			latencyMs: this.pingMs,
			state: currentState,
			memoryUsage: { rssMb, heapUsedMb, heapTotalMb },
			stats: {
				messagesSent: this.messagesSent,
				messagesReceived: this.messagesReceived,
				reconnectAttempts: this.reconnectCount
			},
			messagesIn: this.messagesReceived,
			messagesOut: this.messagesSent,
			diagnosticMessages: diagnostics,
			timestamp: new Date()
		}
	}
}

export default SessionHealthTracker
