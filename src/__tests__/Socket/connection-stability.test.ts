import { Boom } from '@hapi/boom'
import { jest } from '@jest/globals'
import { DisconnectReason } from '../../Types/State'
import { ReconnectionSupervisor } from '../../Utils/connection-resilience'
import { makeEventBuffer } from '../../Utils/event-buffer'
import type { ILogger } from '../../Utils/logger'

const makeTestLogger = (): ILogger =>
	({
		level: 'silent',
		child: () => makeTestLogger(),
		trace: () => {},
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
		fatal: () => {}
	}) as unknown as ILogger

describe('Tahap 2 - Langkah 5: Uji Kestabilan Koneksi & Siklus Hidup', () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	describe('1. Uji Pencegahan Reconnect Ganda (Burst/Rapid Multiple Close Events)', () => {
		it('harus mendebounce event disconnect bertubi-tubi dan hanya menjadwalkan 1 reconnect', async () => {
			const supervisor = new ReconnectionSupervisor({ baseDelayMs: 30, jitter: false })
			let reconnectCallCount = 0

			const mockReconnect = jest.fn(() => {
				reconnectCallCount++
			})

			// Simulasi 5 event close yang terpicu hampir bersamaan (burst network drop)
			const error = new Boom('Connection Closed', { statusCode: DisconnectReason.connectionClosed })
			const r1 = supervisor.handleDisconnect(error, mockReconnect)
			const r2 = supervisor.handleDisconnect(error, mockReconnect)
			const r3 = supervisor.handleDisconnect(error, mockReconnect)
			const r4 = supervisor.handleDisconnect(error, mockReconnect)
			const r5 = supervisor.handleDisconnect(error, mockReconnect)

			// Hanya pemanggilan pertama yang boleh dijadwalkan
			expect(r1.scheduled).toBe(true)
			expect(r2.scheduled).toBe(false)
			expect(r3.scheduled).toBe(false)
			expect(r4.scheduled).toBe(false)
			expect(r5.scheduled).toBe(false)

			// Attempt counter hanya boleh 1 (bukan 5)
			expect(supervisor.getAttempts()).toBe(1)
			expect(supervisor.hasPendingTimer()).toBe(true)

			// Tunggu hingga timer reconnect pertama dieksekusi
			await new Promise(resolve => setTimeout(resolve, r1.delayMs + 20))

			// Callback harus terpanggil TEPAT 1 KALI, bukan 5 kali
			expect(reconnectCallCount).toBe(1)
			expect(mockReconnect).toHaveBeenCalledTimes(1)
			expect(supervisor.hasPendingTimer()).toBe(false)

			supervisor.abort()
		})
	})

	describe('2. Uji Pembersihan Timer Tertinggal (No Orphaned Timers)', () => {
		it('harus membatalkan timer yang tertunda saat abort() dipanggil', async () => {
			const supervisor = new ReconnectionSupervisor({ baseDelayMs: 50, jitter: false })
			const mockReconnect = jest.fn()

			const r = supervisor.handleDisconnect(
				new Boom('Connection Closed', { statusCode: DisconnectReason.connectionClosed }),
				mockReconnect
			)

			expect(r.scheduled).toBe(true)
			expect(supervisor.hasPendingTimer()).toBe(true)
			expect(supervisor.getIsReconnecting()).toBe(true)

			// Batalkan koneksi (simulasi aplikasi ditutup atau dihentikan)
			supervisor.abort()

			expect(supervisor.hasPendingTimer()).toBe(false)
			expect(supervisor.getIsReconnecting()).toBe(false)

			// Tunggu melewati waktu delay
			await new Promise(resolve => setTimeout(resolve, r.delayMs + 20))

			// Callback TIDAK boleh terpanggil sama sekali karena timer sudah dibatalkan
			expect(mockReconnect).not.toHaveBeenCalled()
		})

		it('harus membatalkan timer pending jika event fatal (logout) tiba saat timer sedang menunggu', async () => {
			const supervisor = new ReconnectionSupervisor({ baseDelayMs: 50, jitter: false })
			const mockReconnect = jest.fn()

			// Jadwalkan reconnect sementara
			supervisor.handleDisconnect(
				new Boom('Connection Closed', { statusCode: DisconnectReason.connectionClosed }),
				mockReconnect
			)
			expect(supervisor.hasPendingTimer()).toBe(true)

			// Tiba-tiba server mengembalikan event logout (401)
			const fatalResult = supervisor.handleDisconnect(
				new Boom('Logged Out', { statusCode: DisconnectReason.loggedOut }),
				mockReconnect
			)

			expect(fatalResult.scheduled).toBe(false)
			expect(fatalResult.decision.isLoggedOut).toBe(true)
			// Timer sebelumnya harus langsung dimatikan
			expect(supervisor.hasPendingTimer()).toBe(false)
			expect(supervisor.getIsReconnecting()).toBe(false)

			await new Promise(resolve => setTimeout(resolve, 70))
			expect(mockReconnect).not.toHaveBeenCalled()
		})
	})

	describe('3. Uji Pembersihan Event Buffer & Listener Lifecycle (No Dangling Background Tasks)', () => {
		it('harus membersihkan seluruh timer dan listeners pada event-buffer destroy()', () => {
			const logger = makeTestLogger()
			const ev = makeEventBuffer(logger)

			let listenerTriggered = false
			ev.on('chats.update', () => {
				listenerTriggered = true
			})

			// Aktifkan buffer
			ev.buffer()
			expect(ev.isBuffering()).toBe(true)

			// Destroy buffer
			ev.destroy()

			expect(ev.isBuffering()).toBe(false)

			// Coba emit event setelah destroy - listener tidak boleh terpanggil
			ev.emit('chats.update', [{ id: '123@s.whatsapp.net' }])
			expect(listenerTriggered).toBe(false)
		})

		it('harus mem-flush data yang tersisa di memory saat destroy() dipanggil', () => {
			const logger = makeTestLogger()
			const ev = makeEventBuffer(logger)

			const receivedUpserts: any[] = []
			ev.on('messages.upsert', data => {
				receivedUpserts.push(data)
			})

			ev.buffer()
			ev.emit('messages.upsert', {
				messages: [{ key: { id: 'MSG_PENDING_FLUSH' } } as any],
				type: 'notify'
			})

			// Sebelum destroy, pesan masih di buffer
			expect(receivedUpserts).toHaveLength(0)

			// Destroy buffer harus mem-flush sisa pesan sebelum membersihkan listener
			ev.destroy()

			expect(receivedUpserts).toHaveLength(1)
			expect(receivedUpserts[0].messages[0].key.id).toBe('MSG_PENDING_FLUSH')
		})
	})

	describe('4. Uji Siklus Hidup Selesai (Full Lifecycle Recovery)', () => {
		it('harus membersihkan state dan mengembalikan supervisor ke status netral setelah onConnected()', () => {
			const supervisor = new ReconnectionSupervisor({ baseDelayMs: 20, jitter: false })
			const mockReconnect = jest.fn()

			supervisor.handleDisconnect(
				new Boom('Dropped', { statusCode: DisconnectReason.connectionClosed }),
				mockReconnect
			)
			expect(supervisor.getAttempts()).toBe(1)
			expect(supervisor.getIsReconnecting()).toBe(true)

			// Koneksi berhasil pulih
			supervisor.onConnected()

			expect(supervisor.getAttempts()).toBe(0)
			expect(supervisor.getIsReconnecting()).toBe(false)
			expect(supervisor.hasPendingTimer()).toBe(false)
		})
	})
})
