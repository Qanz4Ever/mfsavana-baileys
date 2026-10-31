import { DEFAULT_CONNECTION_CONFIG } from '../Defaults'
import type {
	UserFacingSocketConfig,
	ReactionUpdateEvent,
	EditMessageEvent,
	DeleteMessageEvent,
	GroupUpdateEvent,
	GroupParticipantUpdateEvent,
	ChatUpdateEvent,
	PresenceUpdateEvent,
	ReceiptUpdateEvent,
	CallUpdateEvent,
	BlocklistUpdateEvent,
	GroupJoinRequestEvent,
	PollVoteEvent
} from '../Types'
import { makeCommunitiesSocket } from './communities'
import { serializeMessage, extractMessageText, type SerializedMessage } from '../Utils/serialize'
import { resolveBrowserConfig } from '../Utils/browser-utils'
import { createDynamicLogger } from '../Utils/dynamic-logger'
import { SessionHealthTracker, type RealtimeSessionState } from '../Utils/session-health'
import { MessageDatabase } from '../Utils/message-database'
import { lidCache } from '../Utils/lid-cache'
import { isLidUser } from '../WABinary'
import { createContext, type MessageContext, type ContextOptions } from '../Utils/context'
import { RateLimiter, AntiBanEngine, type RateLimitConfig, type AntiBanConfig } from '../Utils/rate-limiter'
import { inspectPhoneNumber, type InspectPhoneOptions } from '../Utils/phone-inspector'
import type { proto } from '../../WAProto/index.js'

// export the last socket layer
const makeWASocket = (config: UserFacingSocketConfig) => {
	const resolvedBrowser = resolveBrowserConfig(config.browser || DEFAULT_CONNECTION_CONFIG.browser)
	const dynamicLog = config.dynamicLogger ?? DEFAULT_CONNECTION_CONFIG.dynamicLogger
	const loggerInstance = dynamicLog && !config.logger
		? createDynamicLogger({ level: 'info' })
		: (config.logger || DEFAULT_CONNECTION_CONFIG.logger)

	const newConfig = {
		...DEFAULT_CONNECTION_CONFIG,
		...config,
		browser: resolvedBrowser,
		logger: loggerInstance
	}

	const sock = makeCommunitiesSocket(newConfig)

	// Anti-Ban Engine & Outbound Rate Limiter
	const antiBanEngine = new AntiBanEngine(newConfig.antiBan)
	const rateLimiter = new RateLimiter(newConfig.rateLimit)

	// 3. Message Database Store (Anti-Delete & Message History)
	const messageDatabase = new MessageDatabase({
		scope: newConfig.saveIncomingMessages,
		maxAgeMs: newConfig.messageStoreMaxAgeMs,
		filePath: newConfig.messageStorePath
	})

	// 4. Session Health & Realtime State Tracker
	const healthTracker = new SessionHealthTracker(
		sock.authState,
		(node, timeout) => (sock as any).query(node, timeout)
	)

	// Track socket connection updates reactively
	sock.ev.on('connection.update', update => {
		if (update.connection) {
			healthTracker.updateConnection(update.connection)
		}
		if (update.qr) {
			healthTracker.setQrPending(true)
		}
	})

	const processedMessageIds = new Map<string, number>()
	const DEDUP_TTL = 5 * 60 * 1000 // 5 minutes deduplication window
	const MAX_DEDUP_SIZE = 5000

	const messageHandlers: ((ctx: MessageContext, msg: SerializedMessage) => Promise<void> | void)[] = []

	sock.ev.on('messages.upsert', async ({ messages }) => {
		if (!messages || messages.length === 0) return
		const now = Date.now()

		// Clean expired deduplication entries if map exceeds limit
		if (processedMessageIds.size > MAX_DEDUP_SIZE) {
			for (const [id, timestamp] of processedMessageIds) {
				if (now - timestamp > DEDUP_TTL) {
					processedMessageIds.delete(id)
				}
			}
		}

		for (const rawMsg of messages) {
			if (!rawMsg.message) continue

			const msgId = rawMsg.key?.id
			if (msgId) {
				const seenAt = processedMessageIds.get(msgId)
				if (seenAt && now - seenAt < DEDUP_TTL) {
					sock.logger?.debug({ msgId }, 'ignoring duplicate message in onMessage')
					continue
				}
				processedMessageIds.set(msgId, now)
			}

			// Automatically save incoming message for anti-delete and message retrieval
			messageDatabase.save(rawMsg)
			healthTracker.recordMessageReceived()

			const serialized = serializeMessage(rawMsg, finalSock)
			const ctx = createContext(serialized, finalSock)
			serialized.ctx = ctx

			for (const handler of messageHandlers) {
				try {
					await handler(ctx, serialized)
				} catch (error) {
					sock.logger?.error({ error, msgId: rawMsg.key?.id }, 'error in onMessage handler')
				}
			}
		}
	})

	/**
	 * High-level message event listener.
	 * Automatically filters empty messages, deduplicates retransmitted stanzas,
	 * persists incoming messages for anti-delete retrieval,
	 * hydrates/serializes the message object with helpers (msg.reply, msg.text, msg.isOwner),
	 * transparently resolves group sender LIDs into real phone numbers,
	 * and provides a full MessageContext (ctx) wrapper for command & event handling.
	 */
	const onMessage = (handler: (ctx: MessageContext, msg: SerializedMessage) => Promise<void> | void) => {
		messageHandlers.push(handler)
		return () => {
			const idx = messageHandlers.indexOf(handler)
			if (idx !== -1) messageHandlers.splice(idx, 1)
		}
	}

	/**
	 * Create a MessageContext (ctx) wrapper from any message
	 */
	const createMessageContext = (msg: any, options?: ContextOptions): MessageContext => {
		const serialized = msg?.reply ? (msg as SerializedMessage) : serializeMessage(msg, finalSock)
		return createContext(serialized, finalSock, options)
	}

	/**
	 * Register a declarative command handler triggered by command name(s) or RegExp
	 */
	const onCommand = (
		command: string | string[] | RegExp,
		handler: (ctx: MessageContext) => Promise<void> | void
	) => {
		const commands = Array.isArray(command)
			? command.map(c => c.toLowerCase())
			: typeof command === 'string'
			? [command.toLowerCase()]
			: null

		return onMessage(async (ctx) => {
			let isMatch = false
			if (command instanceof RegExp) {
				isMatch = command.test(ctx.text) || command.test(ctx.command)
			} else if (commands && commands.includes(ctx.command)) {
				isMatch = true
			}

			if (isMatch) {
				if (newConfig.rateLimit) {
					const limitResult = rateLimiter.consume(ctx.sender, newConfig.rateLimit)
					if (limitResult.limited) {
						const remainingSec = Math.ceil(limitResult.remainingMs / 1000)
						const notify = newConfig.rateLimit.notifyOnLimit
						if (typeof notify === 'function') {
							await notify(ctx, limitResult.remainingMs)
						} else if (typeof notify === 'string') {
							await ctx.reply(notify.replace('{remaining}', remainingSec.toString()))
						} else if (notify === true) {
							await ctx.reply(`⚠️ Terlalu banyak request. Tunggu ${remainingSec} detik sebelum mencoba lagi.`)
						}
						return
					}
				}

				await handler(ctx)
			}
		})
	}

	/**
	 * Listen for message reactions (emoji added or removed)
	 */
	const onReaction = (handler: (reaction: ReactionUpdateEvent) => Promise<void> | void) => {
		const listener = async (reactions: any[]) => {
			if (!reactions || !reactions.length) return
			for (const { key, reaction } of reactions) {
				const chat = key.remoteJid || ''
				const targetKey = reaction.key || key
				const rawSender = key.participant || (key.fromMe ? sock.user?.id : key.remoteJid) || ''
				const sender = lidCache.resolveToPN(rawSender)
				const senderNumber = lidCache.extractDigits(sender)
				const emoji = reaction.text || ''
				const isRemoved = !emoji
				const timestamp = Number(reaction.senderTimestampMs) || Date.now()

				try {
					await handler({
						key,
						targetKey,
						chat,
						sender,
						senderNumber,
						emoji,
						text: emoji,
						isRemoved,
						timestamp
					})
				} catch (err) {
					sock.logger?.error({ err, key }, 'error in onReaction handler')
				}
			}
		}
		sock.ev.on('messages.reaction', listener)
		return () => sock.ev.off('messages.reaction', listener)
	}

	/**
	 * Listen for edited messages
	 */
	const onEdit = (handler: (edit: EditMessageEvent) => Promise<void> | void) => {
		const listener = async (updates: any[]) => {
			if (!updates || !updates.length) return
			for (const u of updates) {
				const editedMsg = u.update?.message?.editedMessage?.message
				if (!editedMsg) continue
				const chat = u.key.remoteJid || ''
				const isGroup = chat.endsWith('@g.us')
				const rawSender = u.key.participant || (u.key.fromMe ? sock.user?.id : u.key.remoteJid) || ''
				const sender = lidCache.resolveToPN(rawSender)
				const senderNumber = lidCache.extractDigits(sender)
				const newText = extractMessageText(editedMsg)
				const previousMessage = messageDatabase.get(u.key.id || '')

				try {
					await handler({
						key: u.key,
						targetKey: u.key,
						chat,
						sender,
						senderNumber,
						isGroup,
						newContent: editedMsg,
						newText,
						editedMessage: { text: newText, message: editedMsg },
						previousMessage,
						timestamp: u.update.messageTimestamp ? Number(u.update.messageTimestamp) * 1000 : Date.now()
					})
				} catch (err) {
					sock.logger?.error({ err, key: u.key }, 'error in onEdit handler')
				}
			}
		}
		sock.ev.on('messages.update', listener)
		return () => sock.ev.off('messages.update', listener)
	}

	/**
	 * Listen for deleted / revoked messages (Anti-Delete event)
	 */
	const onDelete = (handler: (del: DeleteMessageEvent) => Promise<void> | void) => {
		const deletedHistory = new Set<string>()

		// Handle messages.delete event
		const deleteListener = async (item: any) => {
			if ('keys' in item && Array.isArray(item.keys)) {
				for (const key of item.keys) {
					const id = key.id || ''
					if (id && deletedHistory.has(id)) continue
					if (id) {
						deletedHistory.add(id)
						setTimeout(() => deletedHistory.delete(id), 10000)
					}
					const chat = key.remoteJid || ''
					const isGroup = chat.endsWith('@g.us')
					const rawSender = key.participant || (key.fromMe ? sock.user?.id : key.remoteJid) || ''
					const sender = lidCache.resolveToPN(rawSender)
					const senderNumber = lidCache.extractDigits(sender)
					const deletedMessage = messageDatabase.findDeleted(key)

					try {
						await handler({
							key,
							targetKey: key,
							chat,
							deletedBy: sender,
							deletedByNumber: senderNumber,
							isGroup,
							deletedMessage,
							timestamp: Date.now()
						})
					} catch (err) {
						sock.logger?.error({ err, key }, 'error in onDelete handler')
					}
				}
			} else if ('jid' in item && item.all) {
				try {
					await handler({
						chat: item.jid,
						all: true,
						isGroup: item.jid.endsWith('@g.us'),
						timestamp: Date.now()
					})
				} catch (err) {
					sock.logger?.error({ err, jid: item.jid }, 'error in onDelete (clear chat) handler')
				}
			}
		}

		// Handle revoke protocol messages in messages.upsert
		const upsertRevokeListener = async ({ messages }: any) => {
			if (!messages || !messages.length) return
			for (const msg of messages) {
				const protoMsg = msg.message?.protocolMessage
				if (protoMsg && (protoMsg.type === 0 || (protoMsg.type as any) === 'REVOKE')) {
					const targetKey = protoMsg.key
					const targetId = targetKey?.id || ''
					if (!targetId || deletedHistory.has(targetId)) continue
					deletedHistory.add(targetId)
					setTimeout(() => deletedHistory.delete(targetId), 10000)

					const chat = targetKey.remoteJid || msg.key?.remoteJid || ''
					const isGroup = chat.endsWith('@g.us')
					const rawSender = msg.key?.participant || (msg.key?.fromMe ? sock.user?.id : targetKey.participant || chat) || ''
					const sender = lidCache.resolveToPN(rawSender)
					const senderNumber = lidCache.extractDigits(sender)
					const deletedMessage = messageDatabase.findDeleted(targetKey)

					try {
						await handler({
							key: msg.key,
							targetKey,
							chat,
							deletedBy: sender,
							deletedByNumber: senderNumber,
							isGroup,
							deletedMessage,
							timestamp: Date.now()
						})
					} catch (err) {
						sock.logger?.error({ err, key: msg.key }, 'error in onDelete protocolMessage handler')
					}
				}
			}
		}

		sock.ev.on('messages.delete', deleteListener)
		sock.ev.on('messages.upsert', upsertRevokeListener)
		return () => {
			sock.ev.off('messages.delete', deleteListener)
			sock.ev.off('messages.upsert', upsertRevokeListener)
		}
	}

	/**
	 * Listen for group settings and metadata updates (subject, desc, announce, restrict, etc.)
	 */
	const onGroupUpdate = (handler: (update: GroupUpdateEvent) => Promise<void> | void) => {
		const listener = async (updates: any[]) => {
			if (!updates || !updates.length) return
			for (const u of updates) {
				try {
					await handler({
						...u,
						id: u.id || '',
						groupJid: u.id || '',
						subject: u.subject,
						desc: u.desc
					})
				} catch (err) {
					sock.logger?.error({ err, id: u.id }, 'error in onGroupUpdate handler')
				}
			}
		}
		sock.ev.on('groups.update', listener)
		return () => sock.ev.off('groups.update', listener)
	}

	/**
	 * Listen for group participant membership changes (add, remove/kick, promote, demote)
	 */
	const onParticipantUpdate = (handler: (update: GroupParticipantUpdateEvent) => Promise<void> | void) => {
		const listener = async (data: any) => {
			const { id, author, authorPn, authorUsername, participants, action } = data
			const rawList = Array.isArray(participants) ? participants : [participants]
			const participantJids = rawList.map((p: any) => (typeof p === 'string' ? p : p.id))
			const resolvedParticipants = participantJids.map(p => lidCache.resolveToPN(p))
			const participantNumbers = resolvedParticipants.map(p => lidCache.extractDigits(p))
			const resolvedAuthor = lidCache.resolveToPN(authorPn || author || '')
			const authorNumber = lidCache.extractDigits(resolvedAuthor)

			const eventObj: GroupParticipantUpdateEvent = {
				id,
				groupJid: id,
				author: resolvedAuthor,
				authorNumber,
				authorPn,
				authorUsername,
				participants: resolvedParticipants,
				participantNumbers,
				action,
				reply: async (text: string, options?: any) => {
					const textMentions = (text.match(/@(\d{5,16})/g) || []).map((t: string) => `${t.slice(1)}@s.whatsapp.net`)
					const allMentions = Array.from(new Set([...resolvedParticipants, ...participantJids, ...textMentions])).filter(Boolean)
					return sock.sendMessage(id, { text, mentions: allMentions, ...options })
				}
			}

			try {
				await handler(eventObj)
			} catch (err) {
				sock.logger?.error({ err, id }, 'error in onParticipantUpdate handler')
			}
		}
		sock.ev.on('group-participants.update', listener)
		return () => sock.ev.off('group-participants.update', listener)
	}

	/**
	 * Listen for chat updates (archive, unread count, mute, pinned, etc.)
	 */
	const onChatUpdate = (handler: (chat: ChatUpdateEvent) => Promise<void> | void) => {
		const listener = async (chats: any[]) => {
			if (!chats || !chats.length) return
			for (const c of chats) {
				try {
					await handler({
						...c,
						chat: c.id || ''
					})
				} catch (err) {
					sock.logger?.error({ err, id: c.id }, 'error in onChatUpdate handler')
				}
			}
		}
		sock.ev.on('chats.update', listener)
		return () => sock.ev.off('chats.update', listener)
	}

	/**
	 * Listen for contact presence updates (typing, recording, online, offline)
	 */
	const onPresence = (handler: (presence: PresenceUpdateEvent) => Promise<void> | void) => {
		const listener = async ({ id, presences }: any) => {
			if (!presences) return
			for (const [pJid, data] of Object.entries(presences as Record<string, any>)) {
				const resolvedParticipant = lidCache.resolveToPN(pJid)
				const participantNumber = lidCache.extractDigits(resolvedParticipant)
				try {
					await handler({
						id,
						chat: id,
						participant: resolvedParticipant,
						participantNumber,
						presence: data.lastKnownPresence,
						lastSeen: data.lastSeen
					})
				} catch (err) {
					sock.logger?.error({ err, id, participant: pJid }, 'error in onPresence handler')
				}
			}
		}
		sock.ev.on('presence.update', listener)
		return () => sock.ev.off('presence.update', listener)
	}

	/**
	 * Listen for message delivery and read receipts
	 */
	const onReceipt = (handler: (receipt: ReceiptUpdateEvent) => Promise<void> | void) => {
		const listener = async (receipts: any[]) => {
			if (!receipts || !receipts.length) return
			for (const r of receipts) {
				const chat = r.key?.remoteJid || ''
				const rawUser = r.receipt?.userJid
				const userJid = rawUser ? lidCache.resolveToPN(rawUser) : undefined
				const userNumber = userJid ? lidCache.extractDigits(userJid) : undefined
				const status = r.receipt?.readTimestamp ? 'read' : (r.receipt?.playedTimestamp ? 'played' : 'delivered')

				try {
					await handler({
						key: r.key,
						chat,
						fromMe: r.key?.fromMe,
						userJid,
						userNumber,
						status,
						readTimestamp: r.receipt?.readTimestamp ? Number(r.receipt.readTimestamp) : undefined,
						receiptTimestamp: r.receipt?.receiptTimestamp ? Number(r.receipt.receiptTimestamp) : undefined
					})
				} catch (err) {
					sock.logger?.error({ err, key: r.key }, 'error in onReceipt handler')
				}
			}
		}
		sock.ev.on('message-receipt.update', listener)
		return () => sock.ev.off('message-receipt.update', listener)
	}

	/**
	 * Listen for incoming and updated WhatsApp calls (with reject shortcut)
	 */
	const onCall = (handler: (call: CallUpdateEvent) => Promise<void> | void) => {
		const listener = async (calls: any[]) => {
			if (!calls || !calls.length) return
			for (const call of calls) {
				const fromPn = lidCache.resolveToPN(call.from || '')
				const fromNumber = lidCache.extractDigits(fromPn)
				const callEvent: CallUpdateEvent = {
					...call,
					fromNumber,
					reject: async () => {
						if (typeof (sock as any).rejectCall === 'function') {
							return (sock as any).rejectCall(call.id, call.from)
						}
					}
				}
				try {
					await handler(callEvent)
				} catch (err) {
					sock.logger?.error({ err, callId: call.id }, 'error in onCall handler')
				}
			}
		}
		sock.ev.on('call', listener)
		return () => sock.ev.off('call', listener)
	}

	/**
	 * Listen for contact blocklist changes
	 */
	const onBlockUpdate = (handler: (block: BlocklistUpdateEvent) => Promise<void> | void) => {
		const listener = async (update: any) => {
			try {
				await handler(update)
			} catch (err) {
				sock.logger?.error({ err }, 'error in onBlockUpdate handler')
			}
		}
		sock.ev.on('blocklist.update', listener)
		return () => sock.ev.off('blocklist.update', listener)
	}

	/**
	 * Listen for group join approval requests
	 */
	const onJoinRequest = (handler: (req: GroupJoinRequestEvent) => Promise<void> | void) => {
		const listener = async (req: any) => {
			const authorPn = lidCache.resolveToPN(req.authorPn || req.author || '')
			const participantPn = lidCache.resolveToPN(req.participantPn || req.participant || '')
			const eventObj: GroupJoinRequestEvent = {
				id: req.id,
				groupJid: req.id,
				author: authorPn,
				authorNumber: lidCache.extractDigits(authorPn),
				participant: participantPn,
				participantNumber: lidCache.extractDigits(participantPn),
				action: req.action,
				method: req.method,
				approve: async () => {
					if (typeof (sock as any).groupRequestParticipantsUpdate === 'function') {
						return (sock as any).groupRequestParticipantsUpdate(req.id, [req.participant], 'approve')
					}
				},
				reject: async () => {
					if (typeof (sock as any).groupRequestParticipantsUpdate === 'function') {
						return (sock as any).groupRequestParticipantsUpdate(req.id, [req.participant], 'reject')
					}
				}
			}
			try {
				await handler(eventObj)
			} catch (err) {
				sock.logger?.error({ err, id: req.id }, 'error in onJoinRequest handler')
			}
		}
		sock.ev.on('group.join-request', listener)
		return () => sock.ev.off('group.join-request', listener)
	}

	/**
	 * Listen for poll votes / updates
	 */
	const onPollUpdate = (handler: (event: PollVoteEvent) => Promise<void> | void) => {
		const listener = async ({ messages }: { messages: any[] }) => {
			for (const rawMsg of messages || []) {
				const pollUpdate = rawMsg.message?.pollUpdateMessage
				if (pollUpdate && pollUpdate.pollCreationMessageKey) {
					const chat = rawMsg.key?.remoteJid || ''
					const rawVoter = rawMsg.key?.participant || chat
					const voter = lidCache.resolveToPN(rawVoter)
					const voterNumber = lidCache.extractDigits(voter || rawVoter)
					const voterLid = isLidUser(rawVoter) ? rawVoter : lidCache.getLID(voter)
					const timestamp = typeof pollUpdate.senderTimestampMs === 'number'
						? pollUpdate.senderTimestampMs
						: (pollUpdate.senderTimestampMs as any)?.toNumber?.() || Date.now()

					const pollEvent: PollVoteEvent = {
						key: rawMsg.key,
						pollKey: pollUpdate.pollCreationMessageKey,
						chat,
						voter,
						voterNumber,
						voterLid,
						timestamp,
						raw: pollUpdate
					}

					try {
						await handler(pollEvent)
					} catch (err) {
						sock.logger?.error({ err, pollKey: pollUpdate.pollCreationMessageKey }, 'error in onPollUpdate handler')
					}
				}
			}
		}

		sock.ev.on('messages.upsert', listener)
		return () => sock.ev.off('messages.upsert', listener)
	}

	/**
	 * Download view-once media directly as Buffer from a message or message key
	 */
	const downloadViewOnce = async (msgOrKey: any): Promise<Buffer> => {
		if (msgOrKey && typeof msgOrKey.downloadViewOnce === 'function') {
			return msgOrKey.downloadViewOnce()
		}
		let targetMsg = msgOrKey
		if (msgOrKey?.id && !msgOrKey.message) {
			targetMsg = messageDatabase.get(msgOrKey)
		}
		if (!targetMsg) throw new Error('Message not found for downloadViewOnce')
		const serialized = serializeMessage(targetMsg, finalSock)
		return serialized.downloadViewOnce()
	}

	// Record outbound messages in healthTracker & throttle through AntiBanEngine
	const originalSendMessage = sock.sendMessage.bind(sock)
	sock.sendMessage = async (jid: string, content: any, options?: any) => {
		return antiBanEngine.schedule(
			async () => {
				healthTracker.recordMessageSent()
				return originalSendMessage(jid, content, options)
			},
			{ chat: jid, sock, skipDelay: options?.skipAntiBan }
		)
	}

	/**
	 * Enable or disable simulated typing mode dynamically
	 */
	const autoTyping = (enabled?: boolean): boolean => {
		if (typeof enabled === 'boolean') {
			newConfig.autoTyping = enabled
			if (antiBanEngine && typeof antiBanEngine.updateConfig === 'function') {
				antiBanEngine.updateConfig({ simulatePresence: enabled })
			}
		}
		return !!newConfig.autoTyping
	}

	/**
	 * Dynamically control presence / bot behavior in WhatsApp
	 * @param behavior 'online' | 'offline' | 'typing' | 'recording' | 'paused'
	 * @param targetJid Optional target chat JID
	 */
	const behaviorUpdate = async (
		behavior: 'online' | 'offline' | 'available' | 'unavailable' | 'typing' | 'composing' | 'recording' | 'paused' | 'stop',
		targetJid?: string
	) => {
		const b = behavior.toLowerCase()
		if (b === 'online' || b === 'available') {
			return (sock as any).sendPresenceUpdate('available')
		}
		if (b === 'offline' || b === 'unavailable') {
			return (sock as any).sendPresenceUpdate('unavailable')
		}
		if (b === 'typing' || b === 'composing') {
			return (sock as any).sendPresenceUpdate('composing', targetJid)
		}
		if (b === 'recording') {
			return (sock as any).sendPresenceUpdate('recording', targetJid)
		}
		if (b === 'paused' || b === 'stop') {
			return (sock as any).sendPresenceUpdate('paused', targetJid)
		}
		return (sock as any).sendPresenceUpdate(behavior, targetJid)
	}

	/**
	 * Profile utilities namespace to manage names, bios, profile pictures, and business details
	 */
	const profileUtils = (targetJid?: string) => {
		const meId = sock.authState.creds.me?.id
		const jid = targetJid || meId || ''
		return {
			target: jid,
			setName: async (name: string) => {
				return (sock as any).updateProfileName(name)
			},
			setAbout: async (status: string) => {
				return (sock as any).updateProfileStatus(status)
			},
			setStatus: async (status: string) => {
				return (sock as any).updateProfileStatus(status)
			},
			setPicture: async (content: any, customJid?: string) => {
				return (sock as any).updateProfilePicture(customJid || jid, content)
			},
			removePicture: async (customJid?: string) => {
				return (sock as any).removeProfilePicture(customJid || jid)
			},
			getPicture: async (type: 'image' | 'preview' = 'image', customJid?: string) => {
				return (sock as any).profilePictureUrl(customJid || jid, type)
			},
			getStatus: async (customJid?: string) => {
				return (sock as any).fetchStatus(customJid || jid)
			},
			getBusinessProfile: async (customJid?: string) => {
				return (sock as any).getBusinessProfile(customJid || jid)
			},
			block: async (contactJid?: string) => {
				return (sock as any).updateBlockStatus(contactJid || jid, 'block')
			},
			unblock: async (contactJid?: string) => {
				return (sock as any).updateBlockStatus(contactJid || jid, 'unblock')
			}
		}
	}

	/**
	 * Comprehensive group utilities namespace to manage group subjects, descriptions,
	 * pictures, invite codes, participant management, and group settings.
	 */
	const groupUtils = (groupJid?: string) => {
		const targetJid = groupJid || ''
		return {
			target: targetJid,
			getMetadata: async (customJid?: string) => {
				return (sock as any).groupMetadata(customJid || targetJid)
			},
			getMembers: async (customJid?: string) => {
				const meta = await (sock as any).groupMetadata(customJid || targetJid)
				return meta?.participants || []
			},
			getAdmins: async (customJid?: string) => {
				const meta = await (sock as any).groupMetadata(customJid || targetJid)
				return (meta?.participants || []).filter((p: any) => p.admin === 'admin' || p.admin === 'superadmin')
			},
			setName: async (name: string, customJid?: string) => {
				return (sock as any).groupUpdateSubject(customJid || targetJid, name)
			},
			setDescription: async (desc: string, customJid?: string) => {
				return (sock as any).groupUpdateDescription(customJid || targetJid, desc)
			},
			setPicture: async (content: any, customJid?: string) => {
				return (sock as any).updateProfilePicture(customJid || targetJid, content)
			},
			removePicture: async (customJid?: string) => {
				return (sock as any).removeProfilePicture(customJid || targetJid)
			},
			getPicture: async (type: 'image' | 'preview' = 'image', customJid?: string) => {
				return (sock as any).profilePictureUrl(customJid || targetJid, type)
			},
			getInviteCode: async (customJid?: string) => {
				return (sock as any).groupInviteCode(customJid || targetJid)
			},
			getInviteUrl: async (customJid?: string) => {
				const code = await (sock as any).groupInviteCode(customJid || targetJid)
				return `https://chat.whatsapp.com/${code}`
			},
			revokeInviteCode: async (customJid?: string) => {
				return (sock as any).groupRevokeInvite(customJid || targetJid)
			},
			add: async (participants: string | string[], customJid?: string) => {
				const list = Array.isArray(participants) ? participants : [participants]
				return (sock as any).groupParticipantsUpdate(customJid || targetJid, list, 'add')
			},
			kick: async (participants: string | string[], customJid?: string) => {
				const list = Array.isArray(participants) ? participants : [participants]
				return (sock as any).groupParticipantsUpdate(customJid || targetJid, list, 'remove')
			},
			promote: async (participants: string | string[], customJid?: string) => {
				const list = Array.isArray(participants) ? participants : [participants]
				return (sock as any).groupParticipantsUpdate(customJid || targetJid, list, 'promote')
			},
			demote: async (participants: string | string[], customJid?: string) => {
				const list = Array.isArray(participants) ? participants : [participants]
				return (sock as any).groupParticipantsUpdate(customJid || targetJid, list, 'demote')
			},
			lock: async (locked = true, customJid?: string) => {
				return (sock as any).groupSettingUpdate(customJid || targetJid, locked ? 'locked' : 'unlocked')
			},
			announce: async (announcement = true, customJid?: string) => {
				return (sock as any).groupSettingUpdate(customJid || targetJid, announcement ? 'announcement' : 'not_announcement')
			},
			setEphemeral: async (durationSeconds: number, customJid?: string) => {
				return (sock as any).groupToggleEphemeral(customJid || targetJid, durationSeconds)
			},
			setMemberAddMode: async (mode: 'admin_add' | 'all_member_add', customJid?: string) => {
				return (sock as any).groupMemberAddMode(customJid || targetJid, mode)
			},
			setJoinApprovalMode: async (mode: 'on' | 'off', customJid?: string) => {
				return (sock as any).groupJoinApprovalMode(customJid || targetJid, mode)
			},
			leave: async (customJid?: string) => {
				return (sock as any).groupLeave(customJid || targetJid)
			},
			create: async (subject: string, participants: string[]) => {
				return (sock as any).groupCreate(subject, participants)
			},
			acceptInvite: async (code: string) => {
				return (sock as any).groupAcceptInvite(code)
			},
			getInviteInfo: async (code: string) => {
				return (sock as any).groupGetInviteInfo(code)
			},
			fetchAll: async () => {
				return (sock as any).groupFetchAllParticipating()
			}
		}
	}

	const finalSock = {
		...sock,
		config: newConfig,
		onMessage,
		onCommand,
		createContext: createMessageContext,
		onReaction,
		onEdit,
		onDelete,
		onGroupUpdate,
		onParticipantUpdate,
		onChatUpdate,
		onPresence,
		onReceipt,
		onCall,
		onBlockUpdate,
		onJoinRequest,
		onPollUpdate,
		downloadViewOnce,
		autoTyping,
		// Anti-Ban & Rate Limiting API
		antiBan: antiBanEngine,
		rateLimiter,
		checkRateLimit: (key: string, customConfig?: RateLimitConfig, consume = false) =>
			consume ? rateLimiter.consume(key, customConfig) : rateLimiter.check(key, customConfig),
		resetRateLimit: (key: string) => rateLimiter.reset(key),
		blockUser: (key: string, durationMs?: number) => rateLimiter.block(key, durationMs),
		// Message Database API
		messageStore: messageDatabase,
		getMessageFromStore: (idOrKey: string | proto.IMessageKey) => messageDatabase.get(idOrKey),
		getDeletedMessage: (revokeKey: proto.IMessageKey) => messageDatabase.findDeleted(revokeKey),
		// Session Health & Realtime State API
		getSessionHealth: () => healthTracker.checkHealth(),
		get sessionState(): RealtimeSessionState {
			return healthTracker.getState()
		},
		onSessionStateUpdate: (listener: (state: RealtimeSessionState) => void) => {
			return healthTracker.onStateUpdate(listener)
		},
		// Presence & Behavior API
		behaviorUpdate,
		// Phone Inspector API
		inspectPhone: (target: string, options?: InspectPhoneOptions) => inspectPhoneNumber(sock, target, options),
		inspectPhoneNumber: (target: string, options?: InspectPhoneOptions) => inspectPhoneNumber(sock, target, options),
		// Management Utility Namespaces
		profileUtils,
		groupUtils
	}

	return finalSock
}

export default makeWASocket

