import { Boom } from '@hapi/boom'
import { jest } from '@jest/globals'
import { DisconnectReason } from '../../Types/State'
import {
	calculateReconnectBackoff,
	evaluateDisconnect,
	ReconnectionSupervisor
} from '../../Utils/connection-resilience'

describe('Connection Resilience & Reconnection Scenarios', () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	describe('Skenario 1: Koneksi terputus sementara', () => {
		it('harus mengizinkan reconnect untuk DisconnectReason.connectionClosed (428)', () => {
			const error = new Boom('Connection Closed', { statusCode: DisconnectReason.connectionClosed })
			const decision = evaluateDisconnect(error)

			expect(decision.shouldReconnect).toBe(true)
			expect(decision.isFatal).toBe(false)
			expect(decision.isLoggedOut).toBe(false)
			expect(decision.reason).toBe('temporary_disconnect')
		})

		it('harus mengizinkan reconnect untuk DisconnectReason.connectionLost (408)', () => {
			const error = new Boom('Connection was lost', { statusCode: DisconnectReason.connectionLost })
			const decision = evaluateDisconnect(error)

			expect(decision.shouldReconnect).toBe(true)
			expect(decision.isFatal).toBe(false)
			expect(decision.isLoggedOut).toBe(false)
			expect(decision.reason).toBe('temporary_disconnect')
		})

		it('harus mendeteksi raw network error seperti ECONNRESET sebagai terputus sementara', () => {
			const rawError = new Error('read ECONNRESET')
			const decision = evaluateDisconnect(rawError)

			expect(decision.shouldReconnect).toBe(true)
			expect(decision.isFatal).toBe(false)
			expect(decision.reason).toBe('temporary_disconnect')
		})

		it('harus menjadwalkan reconnect ketika supervisor menangani koneksi putus sementara', () => {
			const supervisor = new ReconnectionSupervisor({ baseDelayMs: 10, jitter: false })
			const reconnectFn = jest.fn()

			const result = supervisor.handleDisconnect(
				new Boom('Connection Terminated', { statusCode: DisconnectReason.connectionClosed }),
				reconnectFn
			)

			expect(result.scheduled).toBe(true)
			expect(result.decision.shouldReconnect).toBe(true)
			expect(supervisor.getIsReconnecting()).toBe(true)
			expect(supervisor.getAttempts()).toBe(1)
		})
	})

	describe('Skenario 2: Koneksi timeout', () => {
		it('harus mendeteksi DisconnectReason.timedOut (408) dan menjadwalkan reconnect', () => {
			const error = new Boom('Timed Out', { statusCode: DisconnectReason.timedOut })
			const decision = evaluateDisconnect(error)

			expect(decision.shouldReconnect).toBe(true)
			expect(decision.isFatal).toBe(false)
			expect(decision.reason).toBe('timeout')
		})

		it('harus mendeteksi pesan ETIMEDOUT dari WebSocket client', () => {
			const error = new Error('connect ETIMEDOUT 157.240.241.60:443')
			const decision = evaluateDisconnect(error)

			expect(decision.shouldReconnect).toBe(true)
			expect(decision.isFatal).toBe(false)
			expect(decision.reason).toBe('timeout')
		})

		it('harus menjadwalkan reconnect dengan delay positif pada event timeout', () => {
			const supervisor = new ReconnectionSupervisor({ baseDelayMs: 50, jitter: false })
			const reconnectFn = jest.fn()

			const result = supervisor.handleDisconnect(
				new Boom('QR refs attempts ended', { statusCode: DisconnectReason.timedOut }),
				reconnectFn
			)

			expect(result.scheduled).toBe(true)
			expect(result.delayMs).toBeGreaterThanOrEqual(50)
			expect(supervisor.getAttempts()).toBe(1)
		})
	})

	describe('Skenario 3: Server menolak koneksi (Fatal / Banned / Forbidden / Bad Session)', () => {
		it('harus menolak reconnect pada DisconnectReason.forbidden (403)', () => {
			const error = new Boom('Connection Forbidden by Server', { statusCode: DisconnectReason.forbidden })
			const decision = evaluateDisconnect(error)

			expect(decision.shouldReconnect).toBe(false)
			expect(decision.isFatal).toBe(true)
			expect(decision.isLoggedOut).toBe(false)
			expect(decision.reason).toBe('forbidden')
		})

		it('harus menolak reconnect jika pesan error mengindikasikan akun dibanned atau forbidden', () => {
			const error = new Error('not-authorized: account is banned')
			const decision = evaluateDisconnect(error)

			expect(decision.shouldReconnect).toBe(false)
			expect(decision.isFatal).toBe(true)
			expect(decision.reason).toBe('forbidden')
		})

		it('harus menolak reconnect pada DisconnectReason.badSession (500)', () => {
			const error = new Boom('Bad MAC or corrupted keys', { statusCode: DisconnectReason.badSession })
			const decision = evaluateDisconnect(error)

			expect(decision.shouldReconnect).toBe(false)
			expect(decision.isFatal).toBe(true)
			expect(decision.reason).toBe('bad_session')
		})

		it('harus menolak reconnect pada DisconnectReason.connectionReplaced (440)', () => {
			const error = new Boom('Connection Replaced by another active session', {
				statusCode: DisconnectReason.connectionReplaced
			})
			const decision = evaluateDisconnect(error)

			expect(decision.shouldReconnect).toBe(false)
			expect(decision.isFatal).toBe(true)
			expect(decision.reason).toBe('connection_replaced')
		})

		it('supervisor TIDAK boleh menjadwalkan timer reconnect pada status fatal', () => {
			const supervisor = new ReconnectionSupervisor({ baseDelayMs: 10, jitter: false })
			const reconnectFn = jest.fn()

			const result = supervisor.handleDisconnect(
				new Boom('Forbidden', { statusCode: DisconnectReason.forbidden }),
				reconnectFn
			)

			expect(result.scheduled).toBe(false)
			expect(result.decision.shouldReconnect).toBe(false)
			expect(supervisor.getIsReconnecting()).toBe(false)
			expect(supervisor.getAttempts()).toBe(0)
			expect(reconnectFn).not.toHaveBeenCalled()
		})
	})

	describe('Skenario 4: Akun logout (Permanent Logout)', () => {
		it('harus mendeteksi DisconnectReason.loggedOut (401) dan memutus reconnect', () => {
			const error = new Boom('Intentional Logout', { statusCode: DisconnectReason.loggedOut })
			const decision = evaluateDisconnect(error)

			expect(decision.shouldReconnect).toBe(false)
			expect(decision.isFatal).toBe(true)
			expect(decision.isLoggedOut).toBe(true)
			expect(decision.reason).toBe('logged_out')
		})

		it('harus mendeteksi pesan error string logged out', () => {
			const error = new Error('Session was logged out from companion app')
			const decision = evaluateDisconnect(error)

			expect(decision.shouldReconnect).toBe(false)
			expect(decision.isLoggedOut).toBe(true)
			expect(decision.isFatal).toBe(true)
			expect(decision.reason).toBe('logged_out')
		})

		it('supervisor TIDAK boleh memicu reconnect pada status logout', () => {
			const supervisor = new ReconnectionSupervisor({ baseDelayMs: 10, jitter: false })
			const reconnectFn = jest.fn()

			const result = supervisor.handleDisconnect(
				new Boom('Logged Out', { statusCode: DisconnectReason.loggedOut }),
				reconnectFn
			)

			expect(result.scheduled).toBe(false)
			expect(result.decision.isLoggedOut).toBe(true)
			expect(supervisor.getIsReconnecting()).toBe(false)
			expect(reconnectFn).not.toHaveBeenCalled()
		})
	})

	describe('Skenario 5: Reconnect berhasil setelah beberapa kegagalan', () => {
		it('harus menaikkan jeda backoff secara eksponensial di setiap kegagalan berturut-turut', () => {
			const delay1 = calculateReconnectBackoff(1, { baseDelayMs: 1000, jitter: false })
			const delay2 = calculateReconnectBackoff(2, { baseDelayMs: 1000, jitter: false })
			const delay3 = calculateReconnectBackoff(3, { baseDelayMs: 1000, jitter: false })

			expect(delay1).toBe(1000)
			expect(delay2).toBe(1500)
			expect(delay3).toBe(2250)
			expect(delay3).toBeGreaterThan(delay2)
			expect(delay2).toBeGreaterThan(delay1)
		})

		it('harus mereset counter percobaan dan status reconnect saat koneksi pulih (onConnected)', async () => {
			const supervisor = new ReconnectionSupervisor({ baseDelayMs: 10, jitter: false })
			let executionCount = 0

			const mockReconnect = () => {
				executionCount++
			}

			// Kegagalan 1
			const fail1 = supervisor.handleDisconnect(
				new Boom('Failure 1', { statusCode: DisconnectReason.connectionClosed }),
				mockReconnect
			)
			expect(fail1.scheduled).toBe(true)
			expect(supervisor.getAttempts()).toBe(1)
			expect(supervisor.getIsReconnecting()).toBe(true)

			// Tunggu timer pertama dieksekusi
			await new Promise(resolve => setTimeout(resolve, fail1.delayMs + 10))
			expect(executionCount).toBe(1)

			// Kegagalan 2
			const fail2 = supervisor.handleDisconnect(
				new Boom('Failure 2', { statusCode: DisconnectReason.timedOut }),
				mockReconnect
			)
			expect(fail2.scheduled).toBe(true)
			expect(supervisor.getAttempts()).toBe(2)
			expect(fail2.delayMs).toBeGreaterThan(fail1.delayMs)

			// Tunggu timer kedua dieksekusi
			await new Promise(resolve => setTimeout(resolve, fail2.delayMs + 10))
			expect(executionCount).toBe(2)

			// Simulasi koneksi berhasil pulih
			supervisor.onConnected()

			expect(supervisor.getAttempts()).toBe(0)
			expect(supervisor.getIsReconnecting()).toBe(false)

			// Setelah pulih, diskoneksi baru harus mulai kembali dari attempt 1
			const nextDisconnect = supervisor.handleDisconnect(
				new Boom('Subsequent drop', { statusCode: DisconnectReason.connectionClosed }),
				mockReconnect
			)
			expect(nextDisconnect.scheduled).toBe(true)
			expect(supervisor.getAttempts()).toBe(1)

			supervisor.abort()
		})

				it('harus berhenti mencoba dan memutus loop ketika mencapai maxRetries', async () => {
			const maxRetries = 3
			const supervisor = new ReconnectionSupervisor({ maxRetries, baseDelayMs: 5, jitter: false })
			const mockReconnect = jest.fn()

			// Attempt 1
			const r1 = supervisor.handleDisconnect(new Boom('Err', { statusCode: 428 }), mockReconnect)
			expect(r1.scheduled).toBe(true)
			await new Promise(resolve => setTimeout(resolve, r1.delayMs + 5))

			// Attempt 2 (koneksi ulang gagal lagi)
			const r2 = supervisor.handleDisconnect(new Boom('Err', { statusCode: 428 }), mockReconnect)
			expect(r2.scheduled).toBe(true)
			await new Promise(resolve => setTimeout(resolve, r2.delayMs + 5))

			// Attempt 3 (koneksi ulang gagal ketiga kali)
			const r3 = supervisor.handleDisconnect(new Boom('Err', { statusCode: 428 }), mockReconnect)
			expect(r3.scheduled).toBe(true)
			expect(supervisor.getAttempts()).toBe(3)
			await new Promise(resolve => setTimeout(resolve, r3.delayMs + 5))

			// Attempt 4 (melebihi maxRetries)
			const r4 = supervisor.handleDisconnect(new Boom('Err', { statusCode: 428 }), mockReconnect)
			expect(r4.scheduled).toBe(false)
			expect(r4.decision.shouldReconnect).toBe(false)
			expect(r4.decision.isFatal).toBe(true)

			supervisor.abort()
		})
	})
})
