import type { proto } from '../../WAProto/index.js'
import type { MediaType } from '../Defaults'
import type { AnyMessageContent, ButtonMessageContent, DownloadableMessage, MiscMessageGenerationOptions, PollMessageOptions, WAMessage, AlbumMediaItem } from '../Types'
import { isJidGroup, isLidUser, isPnUser, jidDecode, jidNormalizedUser } from '../WABinary'
import { lidCache } from './lid-cache'
import { downloadContentFromMessage } from './messages-media'
import type { PhoneInspectionResult } from './phone-inspector'
import type { ListMenuContent } from './interactive'
import type { StoredMessageRecord } from './message-database'
import type { SessionHealthReport } from './session-health'

export type ViewOnceMediaType = 'image' | 'video' | 'audio' | 'document'

export interface ViewOnceInfo {
	isViewOnce: boolean
	type?: ViewOnceMediaType
	message?: proto.IMessage
	caption?: string
	isQuoted?: boolean
}

export interface SerializedQuoted {
	key: proto.IMessageKey
	message?: proto.IMessage | null
	type?: string
	text: string
	sender: string
	senderNumber: string
	senderLid?: string
	isFromMe: boolean
	fromMe: boolean
	isViewOnce?: boolean
	viewOnceType?: ViewOnceMediaType
	getViewOnce?: () => ViewOnceInfo
	downloadViewOnce?: () => Promise<Buffer>
	download: () => Promise<Buffer>
	reply: (content: string | AnyMessageContent, options?: MiscMessageGenerationOptions) => Promise<proto.WebMessageInfo | undefined>
	replyButton: (content: ButtonMessageContent, options?: MiscMessageGenerationOptions) => Promise<proto.WebMessageInfo | undefined>
	replyListMenu?: (content: ListMenuContent, options?: MiscMessageGenerationOptions) => Promise<proto.WebMessageInfo | undefined>
}

export interface SerializedMessage extends WAMessage {
	id: string
	chat: string
	sender: string
	senderNumber: string
	senderLid?: string
	isGroup: boolean
	fromMe: boolean
	pushName: string
	type?: string
	text: string
	body: string
	isViewOnce: boolean
	viewOnceType?: ViewOnceMediaType
	mentionedJid: string[]
	mentions: string[]
	selectedButtonId?: string
	selectedButtonText?: string
	isRevoke?: boolean
	revokedMessageKey?: proto.IMessageKey
	deletedMessage?: StoredMessageRecord
	quoted?: SerializedQuoted
	ctx?: any
	isOwner: (ownerList: string | string[]) => boolean
	getRevokedMessage: () => StoredMessageRecord | undefined
	getSessionHealth: () => Promise<SessionHealthReport | undefined>
	getViewOnce: () => ViewOnceInfo
	downloadViewOnce: () => Promise<Buffer>
	reply: (content: string | AnyMessageContent, options?: MiscMessageGenerationOptions & { typing?: boolean }) => Promise<proto.WebMessageInfo | undefined>
	react: (emoji: string) => Promise<proto.WebMessageInfo | undefined>
	download: () => Promise<Buffer>
	sendTyping: (durationMs?: number) => Promise<void>
	sendButton: (content: ButtonMessageContent, options?: MiscMessageGenerationOptions) => Promise<proto.WebMessageInfo | undefined>
	replyButton: (content: ButtonMessageContent, options?: MiscMessageGenerationOptions & { typing?: boolean }) => Promise<proto.WebMessageInfo | undefined>
	sendListMenu: (content: ListMenuContent, options?: MiscMessageGenerationOptions) => Promise<proto.WebMessageInfo | undefined>
	replyListMenu: (content: ListMenuContent, options?: MiscMessageGenerationOptions) => Promise<proto.WebMessageInfo | undefined>
	tag: (targets: string | string[], text: string, options?: { hidden?: boolean; quoted?: boolean }) => Promise<proto.WebMessageInfo | undefined>
	tagAll: (text?: string, options?: { hidden?: boolean; quoted?: boolean }) => Promise<proto.WebMessageInfo | undefined>
	hidetag: (text: string, options?: { quoted?: boolean }) => Promise<proto.WebMessageInfo | undefined>
	behavior: (
		behavior: 'online' | 'offline' | 'available' | 'unavailable' | 'typing' | 'composing' | 'recording' | 'paused' | 'stop',
		targetJid?: string
	) => Promise<any>
	profileUtils: (targetJid?: string) => any
	groupUtils: (groupJid?: string) => any
	getGroupMembers: (customJid?: string) => Promise<any[]>
	getGroupAdmins: (customJid?: string) => Promise<any[]>
	kick: (participants: string | string[], customJid?: string) => Promise<any>
	add: (participants: string | string[], customJid?: string) => Promise<any>
	promote: (participants: string | string[], customJid?: string) => Promise<any>
	demote: (participants: string | string[], customJid?: string) => Promise<any>
	leaveGroup: (customJid?: string) => Promise<any>
	getInviteCode: (customJid?: string) => Promise<string>
	getInviteUrl: (customJid?: string) => Promise<string>
	revokeInviteCode: (customJid?: string) => Promise<any>
	setGroupName: (name: string, customJid?: string) => Promise<any>
	setGroupDescription: (desc: string, customJid?: string) => Promise<any>
	setGroupPicture: (content: any, customJid?: string) => Promise<any>
	removeGroupPicture: (customJid?: string) => Promise<any>
	edit: (newContent: string | AnyMessageContent, targetKey?: proto.IMessageKey) => Promise<proto.WebMessageInfo | undefined>
	delete: (forEveryone?: boolean, targetKey?: proto.IMessageKey) => Promise<any>
	deleteForMe: (targetKey?: proto.IMessageKey) => Promise<any>
	deleteForEveryone: (targetKey?: proto.IMessageKey) => Promise<any>
	isAdmin: (userJid?: string) => Promise<boolean>
	isSenderAdmin: () => Promise<boolean>
	isBotAdmin: () => Promise<boolean>
	inspectPhone: <T extends keyof PhoneInspectionResult | 'all' = 'all'>(
		targetNumber?: string,
		field?: T
	) => Promise<T extends keyof PhoneInspectionResult ? PhoneInspectionResult[T] : PhoneInspectionResult>
	postGroupStory: (content: AnyMessageContent | string) => Promise<proto.WebMessageInfo | undefined>
	broadcastStory: (content: AnyMessageContent | string, additionalJids?: string[]) => Promise<proto.WebMessageInfo | undefined>
	pin: (durationSeconds?: number, targetKey?: proto.IMessageKey) => Promise<proto.WebMessageInfo | undefined>
	unpin: (targetKey?: proto.IMessageKey) => Promise<proto.WebMessageInfo | undefined>
	forward: (targetJid: string, options?: MiscMessageGenerationOptions) => Promise<proto.WebMessageInfo | undefined>
	copy: (targetJid?: string, options?: MiscMessageGenerationOptions) => Promise<proto.WebMessageInfo | undefined>
	sendPoll: (
		pollOrName: PollMessageOptions | string,
		values?: string[],
		selectableCountOrOptions?: number | MiscMessageGenerationOptions,
		options?: MiscMessageGenerationOptions
	) => Promise<proto.WebMessageInfo | undefined>
	replyPoll: (
		pollOrName: PollMessageOptions | string,
		values?: string[],
		selectableCountOrOptions?: number | MiscMessageGenerationOptions,
		options?: MiscMessageGenerationOptions
	) => Promise<proto.WebMessageInfo | undefined>
	sendContact: (name: string, number: string) => Promise<proto.WebMessageInfo | undefined>
	sendAlbum: (
		medias: AlbumMediaItem[],
		options?: MiscMessageGenerationOptions & { caption?: string; delayMs?: number }
	) => Promise<proto.WebMessageInfo | undefined>
	replyAlbum: (
		medias: AlbumMediaItem[],
		options?: MiscMessageGenerationOptions & { caption?: string; delayMs?: number }
	) => Promise<proto.WebMessageInfo | undefined>
}

/**
 * Unwrap nested / wrapper messages such as ephemeral, view once, etc.
 */
export const unwrapMessage = (message?: proto.IMessage | null): proto.IMessage | undefined => {
	if (!message) return undefined

	let unwrapped: any = message

	while (
		unwrapped?.ephemeralMessage ||
		unwrapped?.viewOnceMessage ||
		unwrapped?.viewOnceMessageV2 ||
		unwrapped?.viewOnceMessageV2Extension ||
		unwrapped?.viewOnceMessageV3 ||
		unwrapped?.documentWithCaptionMessage
	) {
		unwrapped =
			unwrapped.ephemeralMessage?.message ||
			unwrapped.viewOnceMessage?.message ||
			unwrapped.viewOnceMessageV2?.message ||
			unwrapped.viewOnceMessageV2Extension?.message ||
			unwrapped.viewOnceMessageV3?.message ||
			unwrapped.documentWithCaptionMessage?.message
	}

	return unwrapped as proto.IMessage
}

/**
 * Check if a message structure contains a View-Once wrapper or flag (v1, v2, v2Extension, v3)
 */
export const isViewOnceMessage = (message?: proto.IMessage | null): boolean => {
	if (!message) return false
	const raw: any = message
	const unwrapped = unwrapMessage(message) as any
	return Boolean(
		raw.viewOnceMessage ||
		raw.viewOnceMessageV2 ||
		raw.viewOnceMessageV2Extension ||
		raw.viewOnceMessageV3 ||
		raw.ephemeralMessage?.message?.viewOnceMessage ||
		raw.ephemeralMessage?.message?.viewOnceMessageV2 ||
		raw.ephemeralMessage?.message?.viewOnceMessageV2Extension ||
		raw.ephemeralMessage?.message?.viewOnceMessageV3 ||
		raw.imageMessage?.viewOnce ||
		raw.videoMessage?.viewOnce ||
		raw.audioMessage?.viewOnce ||
		unwrapped?.imageMessage?.viewOnce ||
		unwrapped?.videoMessage?.viewOnce ||
		unwrapped?.audioMessage?.viewOnce
	)
}

/**
 * Extract inner message from View-Once wrapper
 */
export const extractViewOnceMessage = (message?: proto.IMessage | null): proto.IMessage | undefined => {
	if (!message) return undefined
	let curr: any = message
	if (curr.ephemeralMessage?.message) {
		curr = curr.ephemeralMessage.message
	}
	const inner =
		curr.viewOnceMessage?.message ||
		curr.viewOnceMessageV2?.message ||
		curr.viewOnceMessageV2Extension?.message ||
		curr.viewOnceMessageV3?.message
	if (inner) return inner
	if (
		curr.imageMessage?.viewOnce ||
		curr.videoMessage?.viewOnce ||
		curr.audioMessage?.viewOnce
	) {
		return curr
	}
	const unwrapped = unwrapMessage(message)
	if (
		(unwrapped as any)?.imageMessage?.viewOnce ||
		(unwrapped as any)?.videoMessage?.viewOnce ||
		(unwrapped as any)?.audioMessage?.viewOnce
	) {
		return unwrapped
	}
	return undefined
}

/**
 * Identify the media type of a View-Once message
 */
export const getViewOnceType = (message?: proto.IMessage | null): ViewOnceMediaType | undefined => {
	const vo = extractViewOnceMessage(message) || unwrapMessage(message)
	if (!vo) return undefined
	if (vo.imageMessage) return 'image'
	if (vo.videoMessage) return 'video'
	if (vo.audioMessage) return 'audio'
	if (vo.documentMessage) return 'document'
	return undefined
}

/**
 * Extract clean text or caption from any message payload
 */
export const extractMessageText = (message?: proto.IMessage | null): string => {
	const unwrapped = unwrapMessage(message)
	if (!unwrapped) return ''

	if (unwrapped.conversation) return unwrapped.conversation
	if (unwrapped.extendedTextMessage?.text) return unwrapped.extendedTextMessage.text
	if (unwrapped.imageMessage?.caption) return unwrapped.imageMessage.caption
	if (unwrapped.videoMessage?.caption) return unwrapped.videoMessage.caption
	if (unwrapped.documentMessage?.caption) return unwrapped.documentMessage.caption

	// Interactive & Buttons
	if (unwrapped.buttonsResponseMessage?.selectedButtonId) {
		return unwrapped.buttonsResponseMessage.selectedButtonId
	}
	if (unwrapped.buttonsResponseMessage?.selectedDisplayText) {
		return unwrapped.buttonsResponseMessage.selectedDisplayText
	}
	if (unwrapped.templateButtonReplyMessage?.selectedId) {
		return unwrapped.templateButtonReplyMessage.selectedId
	}
	if (unwrapped.templateButtonReplyMessage?.selectedDisplayText) {
		return unwrapped.templateButtonReplyMessage.selectedDisplayText
	}
	if (unwrapped.listResponseMessage?.singleSelectReply?.selectedRowId) {
		return unwrapped.listResponseMessage.singleSelectReply.selectedRowId
	}
	if (unwrapped.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
		try {
			const parsed = JSON.parse(unwrapped.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson)
			if (parsed.id) return String(parsed.id)
		} catch {}
	}
	if (unwrapped.pollCreationMessage?.name) {
		return unwrapped.pollCreationMessage.name
	}

	return ''
}

/**
 * Extract button response metadata (id and display text) from response messages
 */
export const extractButtonResponse = (message?: proto.IMessage | null): { id?: string; text?: string } => {
	const unwrapped = unwrapMessage(message)
	if (!unwrapped) return {}

	if (unwrapped.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
		try {
			const parsed = JSON.parse(unwrapped.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson)
			return {
				id: parsed.id ? String(parsed.id) : undefined,
				text: unwrapped.interactiveResponseMessage?.body?.text || undefined
			}
		} catch {}
	}

	if (unwrapped.buttonsResponseMessage) {
		return {
			id: unwrapped.buttonsResponseMessage.selectedButtonId || undefined,
			text: unwrapped.buttonsResponseMessage.selectedDisplayText || undefined
		}
	}

	if (unwrapped.templateButtonReplyMessage) {
		return {
			id: unwrapped.templateButtonReplyMessage.selectedId || undefined,
			text: unwrapped.templateButtonReplyMessage.selectedDisplayText || undefined
		}
	}

	if (unwrapped.listResponseMessage?.singleSelectReply) {
		return {
			id: unwrapped.listResponseMessage.singleSelectReply.selectedRowId || undefined,
			text: unwrapped.listResponseMessage.title || undefined
		}
	}

	return {}
}

/**
 * Determine the primary message type name
 */
export const getMessageType = (message?: proto.IMessage | null): string | undefined => {
	const unwrapped = unwrapMessage(message)
	if (!unwrapped) return undefined
	const keys = Object.keys(unwrapped).filter(k => k !== 'messageContextInfo' && unwrapped[k as keyof proto.IMessage] != null)
	return keys[0]
}

/**
 * Download media from message or quoted message as Buffer
 */
export const downloadMedia = async (message?: proto.IMessage | null): Promise<Buffer> => {
	const unwrapped = unwrapMessage(message)
	if (!unwrapped) throw new Error('No message content to download media from')

	const mediaType = (
		unwrapped.imageMessage ? 'image' :
		unwrapped.videoMessage ? 'video' :
		unwrapped.audioMessage ? 'audio' :
		unwrapped.stickerMessage ? 'sticker' :
		unwrapped.documentMessage ? 'document' : undefined
	) as MediaType | undefined

	if (!mediaType) throw new Error('Message does not contain downloadable media')

	const mediaMessage = (
		unwrapped.imageMessage ||
		unwrapped.videoMessage ||
		unwrapped.audioMessage ||
		unwrapped.stickerMessage ||
		unwrapped.documentMessage
	) as DownloadableMessage

	const maxRetries = 2
	let lastErr: any

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const stream = await downloadContentFromMessage(mediaMessage, mediaType)
			const chunks: Buffer[] = []
			for await (const chunk of stream) {
				chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
			}
			return Buffer.concat(chunks)
		} catch (err: any) {
			lastErr = err
			if (attempt < maxRetries) {
				await new Promise(r => setTimeout(r, 600 * (attempt + 1)))
			}
		}
	}

	throw lastErr
}

/**
 * Transparently serialize a raw Baileys WAMessage into a developer-friendly SerializedMessage.
 * Resolves all group participant LIDs to real phone numbers in the background.
 */
export const serializeMessage = (msg: WAMessage, sock: any): SerializedMessage => {
	const m = msg as SerializedMessage

	m.id = msg.key?.id || ''
	m.chat = msg.key?.remoteJid || ''
	m.isGroup = Boolean(isJidGroup(m.chat))
	m.fromMe = !!msg.key?.fromMe
	m.pushName = msg.pushName || ''

	// Normalize unwrapped message content
	const content = unwrapMessage(msg.message)

	// Determine sender
	const rawSender = m.fromMe
		? (sock.user?.id || sock.authState?.creds?.me?.id || '')
		: (msg.key?.participant || m.chat)

	// Resolve LID to Phone Number JID
	m.sender = lidCache.resolveToPN(rawSender)
	m.senderNumber = lidCache.extractDigits(m.sender || rawSender)
	m.senderLid = isLidUser(rawSender) ? rawSender : lidCache.getLID(m.sender)

	// Extract message type and text
	m.type = getMessageType(content)
	m.text = extractMessageText(content)
	m.body = m.text

	// View-Once detection and extraction
	const rawMessage = msg.message
	m.isViewOnce = isViewOnceMessage(rawMessage) || Boolean(msg.key?.isViewOnce)
	m.viewOnceType = getViewOnceType(rawMessage)

	m.getViewOnce = (): ViewOnceInfo => {
		const voInner = extractViewOnceMessage(rawMessage)
		return {
			isViewOnce: m.isViewOnce,
			type: m.viewOnceType,
			message: voInner || (m.isViewOnce ? content : undefined),
			caption: extractMessageText(voInner || content),
			isQuoted: false
		}
	}

	m.downloadViewOnce = async (): Promise<Buffer> => {
		if (m.isViewOnce) {
			const voInner = extractViewOnceMessage(rawMessage) || content
			return downloadMedia(voInner)
		}
		if (m.quoted && typeof m.quoted.downloadViewOnce === 'function') {
			return m.quoted.downloadViewOnce()
		}
		throw new Error('Neither this message nor quoted message contains a view-once payload')
	}

	// Revoke / Anti-delete message detection
	const protocolMsg = (content as any)?.protocolMessage
	m.isRevoke = Boolean(protocolMsg && (protocolMsg.type === 0 || (protocolMsg.type as any) === 'REVOKE'))
	m.revokedMessageKey = m.isRevoke ? protocolMsg?.key || undefined : undefined
	if (m.isRevoke && m.revokedMessageKey && typeof (sock as any).getDeletedMessage === 'function') {
		m.deletedMessage = (sock as any).getDeletedMessage(m.revokedMessageKey)
	}
	m.getRevokedMessage = () => {
		if (m.revokedMessageKey && typeof (sock as any).getDeletedMessage === 'function') {
			return (sock as any).getDeletedMessage(m.revokedMessageKey)
		}
		return m.deletedMessage
	}

	// Mentioned JIDs & Mentions
	const findContextInfo = (obj: any): proto.IContextInfo | undefined => {
		if (!obj || typeof obj !== 'object') return undefined
		if (obj.contextInfo) return obj.contextInfo
		for (const k of Object.keys(obj)) {
			if (obj[k] && typeof obj[k] === 'object' && obj[k].contextInfo) {
				return obj[k].contextInfo
			}
		}
		return undefined
	}
	const contextInfo = findContextInfo(content) || findContextInfo(rawMessage)
	m.mentionedJid = (contextInfo?.mentionedJid || []).map((jid: string) => lidCache.resolveToPN(jid))
	const textMentions = (m.text?.match(/@(\d{5,16})/g) || []).map((t: string) => `${t.slice(1)}@s.whatsapp.net`)
	m.mentions = Array.from(new Set([...m.mentionedJid, ...textMentions]))

	// Quoted message handling
	if (contextInfo?.quotedMessage) {
		const rawQuoted = contextInfo.quotedMessage
		const qContent = unwrapMessage(rawQuoted)
		const stanzaId = contextInfo.stanzaId
		const storedMsg = stanzaId && typeof (sock as any)?.getMessageFromStore === 'function'
			? (sock as any).getMessageFromStore(stanzaId)
			: undefined

		const isQuotedVo = isViewOnceMessage(rawQuoted) || Boolean(storedMsg?.isViewOnce)
		const quotedVoType = getViewOnceType(rawQuoted) || storedMsg?.viewOnceType || (
			qContent?.imageMessage ? 'image' :
			qContent?.videoMessage ? 'video' :
			qContent?.audioMessage ? 'audio' :
			qContent?.documentMessage ? 'document' : undefined
		)
		const qParticipant = contextInfo.participant || ''
		const qSender = lidCache.resolveToPN(qParticipant)
		const qSenderNumber = lidCache.extractDigits(qSender || qParticipant)
		const qSenderLid = isLidUser(qParticipant) ? qParticipant : lidCache.getLID(qSender)

		m.quoted = {
			key: {
				remoteJid: m.chat,
				id: contextInfo.stanzaId,
				participant: qParticipant || undefined,
				fromMe: Boolean(qSenderNumber && qSenderNumber === lidCache.extractDigits(sock.user?.id || ''))
			},
			message: qContent,
			type: getMessageType(qContent),
			text: extractMessageText(qContent),
			sender: qSender,
			senderNumber: qSenderNumber,
			senderLid: qSenderLid,
			isFromMe: Boolean(qSenderNumber && qSenderNumber === lidCache.extractDigits(sock.user?.id || '')),
			fromMe: Boolean(qSenderNumber && qSenderNumber === lidCache.extractDigits(sock.user?.id || '')),
			isViewOnce: isQuotedVo,
			viewOnceType: quotedVoType,
			getViewOnce: (): ViewOnceInfo => {
				const voInner = extractViewOnceMessage(rawQuoted) || storedMsg?.message || (isQuotedVo ? qContent : undefined)
				return {
					isViewOnce: isQuotedVo,
					type: quotedVoType,
					message: voInner || (isQuotedVo ? qContent : undefined),
					caption: extractMessageText(voInner || qContent),
					isQuoted: true
				}
			},
			downloadViewOnce: async (): Promise<Buffer> => {
				const stored = storedMsg?.message ? (extractViewOnceMessage(storedMsg.message) || storedMsg.message) : undefined
				const rawExtract = extractViewOnceMessage(rawQuoted)
				const target = stored || rawExtract || qContent
				if (!target) {
					throw new Error('Pesan media sekali lihat tidak ditemukan di cache lokal bot.')
				}
				const media = (unwrapMessage(target) as any)?.imageMessage ||
					(unwrapMessage(target) as any)?.videoMessage ||
					(unwrapMessage(target) as any)?.audioMessage ||
					(unwrapMessage(target) as any)?.documentMessage
				if (!media?.mediaKey && !media?.url && !media?.directPath) {
					throw new Error('Media key View-Once telah dihapus oleh WhatsApp klien saat di-reply dan bot tidak sempat menyimpannya saat pesan pertama kali masuk.')
				}
				return downloadMedia(target)
			},
			download: async () => {
				const stored = storedMsg?.message ? (extractViewOnceMessage(storedMsg.message) || storedMsg.message) : undefined
				const rawExtract = extractViewOnceMessage(rawQuoted)
				const target = stored || rawExtract || qContent
				return downloadMedia(target)
			},
			reply: async (replyContent: string | AnyMessageContent, options?: MiscMessageGenerationOptions) => {
				const payload: AnyMessageContent = typeof replyContent === 'string' ? { text: replyContent } : replyContent
				return sock.sendMessage(m.chat, payload, { quoted: { key: m.quoted!.key, message: m.quoted!.message }, ...options })
			},
			replyButton: async (btnContent: ButtonMessageContent, options?: MiscMessageGenerationOptions) => {
				const quotedMsg = { key: m.quoted!.key, message: m.quoted!.message }
				if (typeof (sock as any).sendButton === 'function') {
					return (sock as any).sendButton(m.chat, btnContent, { quoted: quotedMsg, ...options })
				}
				return sock.sendMessage(m.chat, btnContent as any, { quoted: quotedMsg, ...options })
			},
			replyListMenu: async (listContent: ListMenuContent, options?: MiscMessageGenerationOptions) => {
				const quotedMsg = { key: m.quoted!.key, message: m.quoted!.message }
				if (typeof (sock as any).sendListMenu === 'function') {
					return (sock as any).sendListMenu(m.chat, listContent, { quoted: quotedMsg, ...options })
				}
			}
		}
	}

	/**
	 * Check if message sender is inside the provided owner list.
	 * Handles phone numbers ('628xxx'), prefixed JIDs, or raw numbers transparently.
	 */
	m.isOwner = (ownerList: string | string[]): boolean => {
		const list = Array.isArray(ownerList) ? ownerList : [ownerList]
		const senderDigits = m.senderNumber

		for (const item of list) {
			if (!item) continue
			const cleanItem = String(item).trim()
			const itemDigits = cleanItem.replace(/\D/g, '')

			if (itemDigits && senderDigits === itemDigits) {
				return true
			}
			if (cleanItem === m.sender || (m.senderLid && cleanItem === m.senderLid)) {
				return true
			}
		}
		return false
	}

	/**
	 * Send simulated typing (composing) presence indicator for a duration
	 */
	m.sendTyping = async (durationMs = 1200) => {
		try {
			await sock.sendPresenceUpdate?.('composing', m.chat)
			await new Promise(r => setTimeout(r, durationMs))
			await sock.sendPresenceUpdate?.('paused', m.chat)
		} catch {}
	}

	/**
	 * Reply directly to this message
	 */
	m.reply = async (replyContent: string | AnyMessageContent, options?: MiscMessageGenerationOptions & { typing?: boolean }) => {
		const payload: AnyMessageContent = typeof replyContent === 'string' ? { text: replyContent } : replyContent
		const shouldType = options?.typing ?? Boolean(sock.config?.autoTyping)
		if (shouldType) {
			try {
				await sock.sendPresenceUpdate?.('composing', m.chat)
				const textLen = typeof replyContent === 'string' ? replyContent.length : (replyContent as any).text?.length || 20
				const typeDelay = Math.min(Math.max(textLen * 15, 500), 2000)
				await new Promise(r => setTimeout(r, typeDelay))
			} catch {}
		}

		try {
			return await sock.sendMessage(m.chat, payload, { quoted: msg, ...options })
		} finally {
			if (shouldType) {
				try {
					await sock.sendPresenceUpdate?.('paused', m.chat)
				} catch {}
			}
		}
	}

	/**
	 * Send emoji reaction to this message
	 */
	m.react = async (emoji: string) => {
		return sock.sendMessage(m.chat, {
			react: {
				text: emoji,
				key: msg.key
			}
		})
	}

	/**
	 * Download attached media as Buffer
	 */
	m.download = async () => {
		return downloadMedia(content)
	}

	// Extract button response details if present
	const btnResp = extractButtonResponse(content)
	m.selectedButtonId = btnResp.id
	m.selectedButtonText = btnResp.text

	/**
	 * Send an interactive button message to this chat
	 */
	m.sendButton = async (btnContent: ButtonMessageContent, options?: MiscMessageGenerationOptions) => {
		if (typeof (sock as any).sendButton === 'function') {
			return (sock as any).sendButton(m.chat, btnContent, options)
		}
		return sock.sendMessage(m.chat, btnContent as any, options)
	}

	/**
	 * Reply with an interactive button message (quoted to this message)
	 */
	m.replyButton = async (btnContent: ButtonMessageContent, options?: MiscMessageGenerationOptions & { typing?: boolean }) => {
		const shouldType = options?.typing ?? Boolean(sock.config?.autoTyping)
		if (shouldType) {
			try {
				await sock.sendPresenceUpdate?.('composing', m.chat)
				await new Promise(r => setTimeout(r, 600))
			} catch {}
		}

		try {
			if (typeof (sock as any).sendButton === 'function') {
				return await (sock as any).sendButton(m.chat, btnContent, { quoted: msg, ...options })
			}
			return await sock.sendMessage(m.chat, btnContent as any, { quoted: msg, ...options })
		} finally {
			if (shouldType) {
				try {
					await sock.sendPresenceUpdate?.('paused', m.chat)
				} catch {}
			}
		}
	}

	/**
	 * Edit an existing message
	 */
	m.edit = async (newContent: string | AnyMessageContent, targetKey?: proto.IMessageKey) => {
		if (typeof (sock as any).editMessage === 'function') {
			return (sock as any).editMessage(m.chat, targetKey || msg.key, newContent)
		}
		const payload = typeof newContent === 'string' ? { text: newContent } : newContent
		return sock.sendMessage(m.chat, { ...payload, edit: targetKey || msg.key })
	}

	/**
	 * Delete a message (defaults to deleting this message)
	 */
	m.delete = async (forEveryone = true, targetKey?: proto.IMessageKey) => {
		if (typeof (sock as any).deleteMessage === 'function') {
			return (sock as any).deleteMessage(m.chat, targetKey || msg.key, forEveryone)
		}
		if (forEveryone) {
			const k = targetKey || msg.key
			return sock.sendMessage(m.chat, {
				delete: {
					remoteJid: m.chat,
					id: k.id,
					fromMe: k.fromMe,
					participant: k.participant
				}
			})
		}
	}

	m.deleteForMe = async (targetKey?: proto.IMessageKey) => {
		return m.delete(false, targetKey)
	}

	m.deleteForEveryone = async (targetKey?: proto.IMessageKey) => {
		return m.delete(true, targetKey)
	}

	/**
	 * Check if a user is admin in this group
	 */
	m.isAdmin = async (userJid?: string) => {
		if (!m.isGroup) return false
		if (typeof (sock as any).isGroupAdmin === 'function') {
			return (sock as any).isGroupAdmin(m.chat, userJid || m.sender)
		}
		try {
			const target = userJid || m.sender
			const targetDigits = lidCache.extractDigits(target)
			const admins = await m.getGroupAdmins()
			return admins.some((p: any) => {
				const pPn = lidCache.resolveToPN(p.id)
				return pPn === target || (targetDigits && lidCache.extractDigits(pPn) === targetDigits)
			})
		} catch {
			return false
		}
	}

	/**
	 * Check if the sender of this message is admin
	 */
	m.isSenderAdmin = async () => {
		return m.isAdmin(m.sender)
	}

	/**
	 * Check if the bot itself is admin in this group
	 */
	m.isBotAdmin = async () => {
		if (!m.isGroup) return false
		const botJid = sock.user?.id || sock.authState?.creds?.me?.id || ''
		return m.isAdmin(botJid)
	}

	/**
	 * Inspect phone number in detail (registered, bio, banned, appeal, business)
	 */
	m.inspectPhone = async (targetNumber?: string, field?: any) => {
		const target = targetNumber || m.senderNumber || m.sender
		let res: any
		if (typeof (sock as any).inspectPhoneNumber === 'function') {
			res = await (sock as any).inspectPhoneNumber(target)
		} else {
			const { inspectPhoneNumber } = await import('./phone-inspector')
			res = await inspectPhoneNumber(sock, target)
		}
		if (field && field !== 'all' && res && field in res) {
			return res[field]
		}
		return res
	}

	/**
	 * Broadcast WhatsApp status/story mentioning this group
	 */
	m.postGroupStory = async (storyContent: AnyMessageContent | string) => {
		const payload = typeof storyContent === 'string' ? { text: storyContent } : storyContent
		if (typeof (sock as any).broadcastGroupStory === 'function') {
			return (sock as any).broadcastGroupStory(payload, [m.chat])
		}
	}

	/**
	 * Broadcast WhatsApp status/story mentioning this group and any extra targets
	 */
	m.broadcastStory = async (storyContent: AnyMessageContent | string, additionalJids: string[] = []) => {
		const payload = typeof storyContent === 'string' ? { text: storyContent } : storyContent
		const allJids = Array.from(new Set([m.chat, ...additionalJids]))
		if (typeof (sock as any).broadcastGroupStory === 'function') {
			return (sock as any).broadcastGroupStory(payload, allJids)
		}
	}

	/**
	 * Pin message in chat
	 */
	m.pin = async (durationSeconds = 86400, targetKey?: proto.IMessageKey) => {
		if (typeof (sock as any).pinMessage === 'function') {
			return (sock as any).pinMessage(m.chat, targetKey || msg.key, durationSeconds)
		}
	}

	/**
	 * Unpin message in chat
	 */
	m.unpin = async (targetKey?: proto.IMessageKey) => {
		if (typeof (sock as any).unpinMessage === 'function') {
			return (sock as any).unpinMessage(m.chat, targetKey || msg.key)
		}
	}

	/**
	 * Forward this message to another chat
	 */
	m.forward = async (targetJid: string, options?: MiscMessageGenerationOptions) => {
		return sock.sendMessage(targetJid, { forward: msg }, options)
	}

	/**
	 * Copy/duplicate this message content to a chat
	 */
	m.copy = async (targetJid?: string, options?: MiscMessageGenerationOptions) => {
		return sock.sendMessage(targetJid || m.chat, content as any, options)
	}

	/**
	 * Send poll easily with comprehensive configuration
	 */
	m.sendPoll = async (
		pollOrName: PollMessageOptions | string,
		values?: string[],
		selectableCountOrOptions?: number | MiscMessageGenerationOptions,
		options?: MiscMessageGenerationOptions
	) => {
		if (typeof (sock as any).sendPoll === 'function') {
			return (sock as any).sendPoll(m.chat, pollOrName, values, selectableCountOrOptions, options)
		}
	}

	/**
	 * Reply with a poll directly to this message
	 */
	m.replyPoll = async (
		pollOrName: PollMessageOptions | string,
		values?: string[],
		selectableCountOrOptions?: number | MiscMessageGenerationOptions,
		options?: MiscMessageGenerationOptions
	) => {
		const quotedOption: MiscMessageGenerationOptions = { quoted: msg }
		if (typeof pollOrName === 'string') {
			let mergedOpt = quotedOption
			if (typeof selectableCountOrOptions === 'object' && selectableCountOrOptions !== null) {
				mergedOpt = { ...quotedOption, ...(selectableCountOrOptions as object) }
			} else if (typeof options === 'object' && options !== null) {
				mergedOpt = { ...quotedOption, ...(options as object) }
			}
			return m.sendPoll(pollOrName, values, selectableCountOrOptions, mergedOpt)
		}

		let mergedOpt = quotedOption
		if (typeof values === 'object' && values !== null && !Array.isArray(values)) {
			mergedOpt = { ...quotedOption, ...(values as object) }
		} else if (typeof selectableCountOrOptions === 'object' && selectableCountOrOptions !== null) {
			mergedOpt = { ...quotedOption, ...(selectableCountOrOptions as object) }
		}
		return m.sendPoll(pollOrName, mergedOpt as any)
	}

	/**
	 * Send contact card easily
	 */
	m.sendContact = async (name: string, number: string) => {
		if (typeof (sock as any).sendContact === 'function') {
			return (sock as any).sendContact(m.chat, { name, number })
		}
	}

	/**
	 * Send a multi-media album to this chat
	 */
	m.sendAlbum = async (
		medias: AlbumMediaItem[],
		options?: MiscMessageGenerationOptions & { caption?: string; delayMs?: number }
	) => {
		if (typeof (sock as any).sendAlbum === 'function') {
			return (sock as any).sendAlbum(m.chat, medias, options)
		}
		const { caption, delayMs, ...restOptions } = options || {}
		return sock.sendMessage(m.chat, { album: medias, caption, delayMs }, restOptions)
	}

	/**
	 * Reply with a multi-media album quoting this message
	 */
	m.replyAlbum = async (
		medias: AlbumMediaItem[],
		options?: MiscMessageGenerationOptions & { caption?: string; delayMs?: number }
	) => {
		const quotedOption: MiscMessageGenerationOptions = { quoted: msg, ...(options || {}) }
		return m.sendAlbum(medias, quotedOption)
	}

	/**
	 * Get Realtime Session Health Report
	 */
	m.getSessionHealth = async () => {
		if (typeof (sock as any).getSessionHealth === 'function') {
			return (sock as any).getSessionHealth()
		}
		return undefined
	}

	/**
	 * Send an interactive List Menu
	 */
	m.sendListMenu = async (listContent: ListMenuContent, options?: MiscMessageGenerationOptions) => {
		if (typeof (sock as any).sendListMenu === 'function') {
			return (sock as any).sendListMenu(m.chat, listContent, options)
		}
	}

	/**
	 * Reply with an interactive List Menu quoting this message
	 */
	m.replyListMenu = async (listContent: ListMenuContent, options?: MiscMessageGenerationOptions) => {
		const quotedMsg = { key: msg.key, message: msg.message }
		if (typeof (sock as any).sendListMenu === 'function') {
			return (sock as any).sendListMenu(m.chat, listContent, { quoted: quotedMsg, ...options })
		}
	}

	/**
	 * Tag specific users with either visible mention text or hidden tags
	 */
	m.tag = async (targets: string | string[], text: string, options?: { hidden?: boolean; quoted?: boolean }) => {
		const list = Array.isArray(targets) ? targets : [targets]
		const jids = list.map(t => (t.includes('@') ? t : `${t.replace(/\D/g, '')}@s.whatsapp.net`))
		const isHidden = options?.hidden ?? false
		let finalText = text
		if (!isHidden) {
			const tagString = jids.map(j => `@${j.split('@')[0]}`).join(' ')
			finalText = text.includes('@') ? text : `${tagString}\n${text}`
		}
		return sock.sendMessage(m.chat, {
			text: finalText,
			mentions: jids
		}, {
			quoted: options?.quoted ? { key: msg.key, message: msg.message } : undefined
		})
	}

	/**
	 * Tag all group members (visible list or hidden tag)
	 */
	m.tagAll = async (text: string = '', options?: { hidden?: boolean; quoted?: boolean }) => {
		if (!m.isGroup) {
			throw new Error('tagAll can only be used in group chats')
		}
		const metadata = await sock.groupMetadata(m.chat)
		const participants = (metadata?.participants || []).map((p: any) => p.id)
		const isHidden = options?.hidden ?? false
		let finalText = text
		if (!isHidden) {
			const tagList = participants.map((p: any) => `@${p.split('@')[0]}`).join(' ')
			finalText = text ? `${text}\n\n${tagList}` : tagList
		}
		return sock.sendMessage(m.chat, {
			text: finalText,
			mentions: participants
		}, {
			quoted: options?.quoted ? { key: msg.key, message: msg.message } : undefined
		})
	}

	/**
	 * Tag all group members invisibly without listing @ numbers in text
	 */
	m.hidetag = async (text: string, options?: { quoted?: boolean }) => {
		return m.tagAll(text, { hidden: true, quoted: options?.quoted })
	}

	/**
	 * Update bot behavior/presence directly from message context
	 */
	m.behavior = async (
		behavior: 'online' | 'offline' | 'available' | 'unavailable' | 'typing' | 'composing' | 'recording' | 'paused' | 'stop',
		targetJid?: string
	) => {
		if (typeof (sock as any).behaviorUpdate === 'function') {
			return (sock as any).behaviorUpdate(behavior, targetJid || m.chat)
		}
	}

	/**
	 * Shortcut to sock.profileUtils scoped to sender or specified JID
	 */
	m.profileUtils = (targetJid?: string) => {
		if (typeof (sock as any).profileUtils === 'function') {
			return (sock as any).profileUtils(targetJid || m.sender)
		}
		throw new Error('sock.profileUtils is not available on this socket')
	}

	/**
	 * Shortcut to sock.groupUtils scoped to current group or specified JID
	 */
	m.groupUtils = (groupJid?: string) => {
		if (typeof (sock as any).groupUtils === 'function') {
			return (sock as any).groupUtils(groupJid || m.chat)
		}
		throw new Error('sock.groupUtils is not available on this socket')
	}

	/**
	 * Group shortcut actions directly on msg
	 */
	m.getGroupMembers = async (customJid?: string) => {
		const target = customJid || m.chat
		const meta = await sock.groupMetadata(target)
		return meta?.participants || []
	}

	m.getGroupAdmins = async (customJid?: string) => {
		const members = await m.getGroupMembers(customJid)
		return members.filter((p: any) => p.admin === 'admin' || p.admin === 'superadmin')
	}

	m.kick = async (participants: string | string[], customJid?: string) => {
		const list = Array.isArray(participants) ? participants : [participants]
		return sock.groupParticipantsUpdate(customJid || m.chat, list, 'remove')
	}

	m.add = async (participants: string | string[], customJid?: string) => {
		const list = Array.isArray(participants) ? participants : [participants]
		return sock.groupParticipantsUpdate(customJid || m.chat, list, 'add')
	}

	m.promote = async (participants: string | string[], customJid?: string) => {
		const list = Array.isArray(participants) ? participants : [participants]
		return sock.groupParticipantsUpdate(customJid || m.chat, list, 'promote')
	}

	m.demote = async (participants: string | string[], customJid?: string) => {
		const list = Array.isArray(participants) ? participants : [participants]
		return sock.groupParticipantsUpdate(customJid || m.chat, list, 'demote')
	}

	m.leaveGroup = async (customJid?: string) => {
		return sock.groupLeave(customJid || m.chat)
	}

	m.getInviteCode = async (customJid?: string) => {
		return sock.groupInviteCode(customJid || m.chat)
	}

	m.getInviteUrl = async (customJid?: string) => {
		const code = await sock.groupInviteCode(customJid || m.chat)
		return `https://chat.whatsapp.com/${code}`
	}

	m.revokeInviteCode = async (customJid?: string) => {
		return sock.groupRevokeInvite(customJid || m.chat)
	}

	m.setGroupName = async (name: string, customJid?: string) => {
		return sock.groupUpdateSubject(customJid || m.chat, name)
	}

	m.setGroupDescription = async (desc: string, customJid?: string) => {
		return sock.groupUpdateDescription(customJid || m.chat, desc)
	}

	m.setGroupPicture = async (content: any, customJid?: string) => {
		return sock.updateProfilePicture(customJid || m.chat, content)
	}

	m.removeGroupPicture = async (customJid?: string) => {
		return sock.removeProfilePicture(customJid || m.chat)
	}

	return m
}

