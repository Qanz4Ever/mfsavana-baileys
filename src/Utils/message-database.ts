import fs from 'fs'
import { isJidGroup, jidNormalizedUser } from '../WABinary'
import type { WAMessage, WAMessageKey } from '../Types'
import { getContentType } from './messages'

export type MessageStoreScope = 'all' | 'group' | 'direct' | 'none' | boolean

export interface StoredMessageRecord {
	id: string
	key: WAMessageKey
	chat: string
	sender: string
	senderNumber: string
	isGroup: boolean
	pushName?: string
	text?: string
	mediaType?: string
	message?: any
	isViewOnce?: boolean
	viewOnceType?: string
	raw: any
	timestamp: number
}

export class MessageDatabase {
	private records: Map<string, StoredMessageRecord> = new Map()
	private scope: MessageStoreScope
	private maxAgeMs: number
	private filePath?: string
	private lastPrunedAt: number = Date.now()

	constructor(options: {
		scope?: MessageStoreScope
		maxAgeMs?: number
		filePath?: string
	} = {}) {
		this.scope = options.scope ?? 'all'
		this.maxAgeMs = options.maxAgeMs ?? 24 * 60 * 60 * 1000 // 24 hours
		this.filePath = options.filePath

		if (this.filePath && fs.existsSync(this.filePath)) {
			try {
				const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'))
				if (Array.isArray(data)) {
					for (const item of data) {
						if (item?.id) {
							this.records.set(item.id, item)
						}
					}
				}
			} catch {}
		}
	}

	setScope(scope: MessageStoreScope) {
		this.scope = scope
	}

	private shouldStore(chatJid: string): boolean {
		if (this.scope === false || this.scope === 'none') return false
		const inGroup = Boolean(isJidGroup(chatJid))
		if (this.scope === 'group') return inGroup
		if (this.scope === 'direct') return !inGroup
		return true // 'all' or true
	}

	private extractText(message: any): string | undefined {
		if (!message) return undefined
		return (
			message.conversation ||
			message.extendedTextMessage?.text ||
			message.imageMessage?.caption ||
			message.videoMessage?.caption ||
			message.documentMessage?.caption ||
			message.buttonsResponseMessage?.selectedDisplayText ||
			message.templateButtonReplyMessage?.selectedDisplayText ||
			message.listResponseMessage?.title ||
			undefined
		)
	}

	save(rawMsg: WAMessage): StoredMessageRecord | undefined {
		const key = rawMsg.key
		if (!key || !key.id || !key.remoteJid) return undefined
		if (!rawMsg.message) return undefined

		// Do not store protocol messages (revokes, ephemeral toggles) as content
		if (rawMsg.message.protocolMessage) return undefined

		const chat = key.remoteJid
		if (!this.shouldStore(chat)) return undefined

		const senderJid = key.participant || key.remoteJid || ''
		const sender: string = (jidNormalizedUser(senderJid) || '') as string
		const senderNumber: string = (sender ? sender.split('@')[0] : '') || ''
		const isGroup = Boolean(isJidGroup(chat))
		const mediaType = getContentType(rawMsg.message as any)
		const text = this.extractText(rawMsg.message)

		const raw: any = rawMsg.message
		const isVo = Boolean(
			raw.viewOnceMessage ||
			raw.viewOnceMessageV2 ||
			raw.viewOnceMessageV2Extension ||
			raw.viewOnceMessageV3 ||
			raw.ephemeralMessage?.message?.viewOnceMessage ||
			raw.ephemeralMessage?.message?.viewOnceMessageV2 ||
			raw.ephemeralMessage?.message?.viewOnceMessageV3 ||
			raw.imageMessage?.viewOnce ||
			raw.videoMessage?.viewOnce ||
			raw.audioMessage?.viewOnce
		)
		const voType = raw.imageMessage || raw.viewOnceMessage?.message?.imageMessage || raw.viewOnceMessageV2?.message?.imageMessage || raw.viewOnceMessageV3?.message?.imageMessage ? 'image'
			: raw.videoMessage || raw.viewOnceMessage?.message?.videoMessage || raw.viewOnceMessageV2?.message?.videoMessage || raw.viewOnceMessageV3?.message?.videoMessage ? 'video'
			: raw.audioMessage || raw.viewOnceMessage?.message?.audioMessage || raw.viewOnceMessageV2?.message?.audioMessage || raw.viewOnceMessageV3?.message?.audioMessage ? 'audio'
			: undefined

		const record: StoredMessageRecord = {
			id: key.id,
			key: {
				id: key.id,
				remoteJid: key.remoteJid,
				fromMe: Boolean(key.fromMe),
				participant: key.participant
			},
			chat: String(chat || ''),
			sender,
			senderNumber,
			isGroup,
			pushName: rawMsg.pushName || undefined,
			text,
			mediaType,
			message: rawMsg.message,
			isViewOnce: isVo,
			viewOnceType: voType,
			raw: rawMsg,
			timestamp: Date.now()
		}

		this.records.set(key.id, record)

		// Periodically prune expired entries
		if (Date.now() - this.lastPrunedAt > 5 * 60 * 1000) {
			this.prune()
		}

		return record
	}

	get(idOrKey: string | WAMessageKey): StoredMessageRecord | undefined {
		const id = typeof idOrKey === 'string' ? idOrKey : idOrKey?.id
		if (!id) return undefined
		return this.records.get(id)
	}

	findDeleted(revokeKey: WAMessageKey): StoredMessageRecord | undefined {
		if (!revokeKey || !revokeKey.id) return undefined
		return this.records.get(revokeKey.id)
	}

	prune() {
		this.lastPrunedAt = Date.now()
		const cutoff = Date.now() - this.maxAgeMs
		for (const [id, record] of this.records) {
			if (record.timestamp < cutoff) {
				this.records.delete(id)
			}
		}

		if (this.filePath) {
			this.persist()
		}
	}

	private persist() {
		if (!this.filePath) return
		try {
			const arr = Array.from(this.records.values())
			fs.writeFileSync(this.filePath, JSON.stringify(arr), 'utf-8')
		} catch {}
	}

	clear() {
		this.records.clear()
		if (this.filePath && fs.existsSync(this.filePath)) {
			try {
				fs.unlinkSync(this.filePath)
			} catch {}
		}
	}

	get size(): number {
		return this.records.size
	}
}

export default MessageDatabase
