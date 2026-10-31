import { isLidUser, isPnUser, jidDecode, jidNormalizedUser } from '../WABinary'
import type { LIDMapping } from '../Types'

export interface ILidCache {
	store(mappings: LIDMapping[]): void
	getPN(lid: string): string | undefined
	getLID(pn: string): string | undefined
	resolveToPN(jid: string): string
	extractDigits(jid: string): string
	readonly size: number
	clear(): void
}

/**
 * In-memory high speed bidirectional LID <-> Phone Number (PN) cache.
 * Avoids repeated network queries and enables instant, transparent JID resolution.
 */
export class LidCacheManager implements ILidCache {
	#lidToPn = new Map<string, string>()
	#pnToLid = new Map<string, string>()

	/**
	 * Store multiple LID-PN mappings in memory
	 */
	store(mappings: LIDMapping[]): void {
		for (const { lid, pn } of mappings) {
			if (!lid || !pn) continue

			const cleanLid = jidNormalizedUser(lid)
			const cleanPn = jidNormalizedUser(pn)

			this.#lidToPn.set(cleanLid, cleanPn)
			this.#pnToLid.set(cleanPn, cleanLid)

			// Also index with bare user IDs (without @lid or @s.whatsapp.net) for fast digit lookup
			const lidUser = jidDecode(cleanLid)?.user
			const pnUser = jidDecode(cleanPn)?.user
			if (lidUser && pnUser) {
				this.#lidToPn.set(lidUser, cleanPn)
				this.#pnToLid.set(pnUser, cleanLid)
			}
		}
	}

	/**
	 * Get phone number JID for a given LID
	 */
	getPN(lid: string): string | undefined {
		if (!lid) return undefined
		const clean = jidNormalizedUser(lid)
		const user = jidDecode(clean)?.user
		return this.#lidToPn.get(clean) || (user ? this.#lidToPn.get(user) : undefined)
	}

	/**
	 * Get LID for a given phone number JID
	 */
	getLID(pn: string): string | undefined {
		if (!pn) return undefined
		const clean = jidNormalizedUser(pn)
		const user = jidDecode(clean)?.user
		return this.#pnToLid.get(clean) || (user ? this.#pnToLid.get(user) : undefined)
	}

	/**
	 * Resolves any JID (whether LID or PN) to standard Phone Number JID (@s.whatsapp.net)
	 */
	resolveToPN(jid: string): string {
		if (!jid) return jid
		if (isPnUser(jid)) return jidNormalizedUser(jid)
		if (isLidUser(jid)) {
			const pn = this.getPN(jid)
			if (pn) return pn
		}
		return jidNormalizedUser(jid)
	}

	/**
	 * Extract pure digits from any JID
	 */
	extractDigits(jid: string): string {
		if (!jid) return ''
		const resolved = this.resolveToPN(jid)
		const user = jidDecode(resolved)?.user || resolved
		return user.replace(/\D/g, '')
	}

	/**
	 * Total cached mappings
	 */
	get size(): number {
		return this.#lidToPn.size
	}

	/**
	 * Clear cache
	 */
	clear(): void {
		this.#lidToPn.clear()
		this.#pnToLid.clear()
	}
}

export const lidCache: ILidCache = new LidCacheManager()
