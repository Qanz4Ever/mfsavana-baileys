import type { proto } from '../../WAProto'
import type { SerializedMessage } from './serialize'
import type { AnyMessageContent } from '../Types'

export interface MessageContext extends SerializedMessage {
	/** Active socket connection */
	sock: any
	/** Reference to original serialized message */
	msg: SerializedMessage
	/** Extracted command prefix (e.g. '!', '/', '.' or '') */
	prefix: string
	/** Parsed command name in lowercase (without prefix) */
	command: string
	/** Command arguments array */
	args: string[]
	/** Full arguments text string */
	query: string
	/** Short alias for query */
	q: string
	/** Scoped group utilities for current chat (if in group) */
	group: any
	/** Scoped profile utilities */
	profile: any
	/** Check if current message matches given command name(s) */
	isCommand: (nameOrNames: string | string[]) => boolean
	/** Reply with explicit typing status */
	replyTyping: (content: string | AnyMessageContent) => Promise<proto.WebMessageInfo | undefined>
	/** Check if sender is currently rate limited */
	isRateLimited: (customConfig?: import('./rate-limiter').RateLimitConfig) => boolean
	/** Check rate limit details without consuming quota */
	checkRateLimit: (customConfig?: import('./rate-limiter').RateLimitConfig) => import('./rate-limiter').RateLimitCheckResult
	/** Consume rate limit quota for sender and evaluate status */
	consumeRateLimit: (customConfig?: import('./rate-limiter').RateLimitConfig) => import('./rate-limiter').RateLimitCheckResult
	/** Reset rate limit for current sender */
	resetRateLimit: () => void
}

export interface ContextOptions {
	prefixes?: string[]
}

const DEFAULT_PREFIXES = ['.', '/', '!', '#', '$', '%', '^', '&', '*', '+', '-', '~', '?']

/**
 * Creates a rich, unified Context (ctx) wrapper for messages, commands, and events.
 */
export const createContext = (msg: SerializedMessage, sock: any, options?: ContextOptions): MessageContext => {
	const rawText = (msg.text || msg.body || '').trim()
	const prefixes = options?.prefixes || DEFAULT_PREFIXES

	let prefix = ''
	let withoutPrefix = rawText

	for (const pfx of prefixes) {
		if (rawText.startsWith(pfx)) {
			prefix = pfx
			withoutPrefix = rawText.slice(pfx.length).trim()
			break
		}
	}

	const parts = withoutPrefix.length ? withoutPrefix.split(/\s+/) : []
	const command = parts[0] ? parts[0].toLowerCase() : ''
	const args = parts.slice(1)
	const query = parts[0] ? withoutPrefix.slice(parts[0].length).trim() : ''

	const group = typeof sock.groupUtils === 'function' ? sock.groupUtils(msg.chat) : undefined
	const profile = typeof sock.profileUtils === 'function' ? sock.profileUtils(msg.sender) : undefined

	const ctx: MessageContext = {
		...msg,
		sock,
		msg,
		prefix,
		command,
		args,
		query,
		q: query,
		group,
		profile,
		isCommand: (nameOrNames: string | string[]) => {
			const list = Array.isArray(nameOrNames) ? nameOrNames.map(n => n.toLowerCase()) : [nameOrNames.toLowerCase()]
			return list.includes(command)
		},
		replyTyping: async (content: string | AnyMessageContent) => {
			return msg.reply(content, { typing: true })
		},
		isRateLimited: (customConfig?: import('./rate-limiter').RateLimitConfig) => {
			if (typeof sock.checkRateLimit === 'function') {
				const res = sock.checkRateLimit(msg.sender, customConfig, false)
				return res?.limited ?? false
			}
			return false
		},
		checkRateLimit: (customConfig?: import('./rate-limiter').RateLimitConfig) => {
			if (typeof sock.checkRateLimit === 'function') {
				return sock.checkRateLimit(msg.sender, customConfig, false)
			}
			return { limited: false, remainingMs: 0, count: 0, max: 5, resetAt: Date.now() }
		},
		consumeRateLimit: (customConfig?: import('./rate-limiter').RateLimitConfig) => {
			if (typeof sock.checkRateLimit === 'function') {
				return sock.checkRateLimit(msg.sender, customConfig, true)
			}
			return { limited: false, remainingMs: 0, count: 1, max: 5, resetAt: Date.now() }
		},
		resetRateLimit: () => {
			if (typeof sock.resetRateLimit === 'function') {
				sock.resetRateLimit(msg.sender)
			}
		},
		inspectPhone: (async (targetNumber?: string, fieldOrOptions?: any) => {
			const target = targetNumber || msg.sender
			if (typeof msg.inspectPhone === 'function') {
				return msg.inspectPhone(target, fieldOrOptions)
			}
			if (typeof sock.inspectPhone === 'function') {
				return sock.inspectPhone(target, fieldOrOptions)
			}
			throw new Error('inspectPhone is not available on this socket instance')
		}) as any
	}

	return ctx
}
