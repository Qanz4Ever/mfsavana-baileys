import type { LIDMapping } from '../Types/index.js';
export interface ILidCache {
    store(mappings: LIDMapping[]): void;
    getPN(lid: string): string | undefined;
    getLID(pn: string): string | undefined;
    resolveToPN(jid: string): string;
    extractDigits(jid: string): string;
    readonly size: number;
    clear(): void;
}
/**
 * In-memory high speed bidirectional LID <-> Phone Number (PN) cache.
 * Avoids repeated network queries and enables instant, transparent JID resolution.
 */
export declare class LidCacheManager implements ILidCache {
    #private;
    /**
     * Store multiple LID-PN mappings in memory
     */
    store(mappings: LIDMapping[]): void;
    /**
     * Get phone number JID for a given LID
     */
    getPN(lid: string): string | undefined;
    /**
     * Get LID for a given phone number JID
     */
    getLID(pn: string): string | undefined;
    /**
     * Resolves any JID (whether LID or PN) to standard Phone Number JID (@s.whatsapp.net)
     */
    resolveToPN(jid: string): string;
    /**
     * Extract pure digits from any JID
     */
    extractDigits(jid: string): string;
    /**
     * Total cached mappings
     */
    get size(): number;
    /**
     * Clear cache
     */
    clear(): void;
}
export declare const lidCache: ILidCache;
//# sourceMappingURL=lid-cache.d.ts.map