var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _LidCacheManager_lidToPn, _LidCacheManager_pnToLid;
import { isLidUser, isPnUser, jidDecode, jidNormalizedUser } from '../WABinary/index.js';
/**
 * In-memory high speed bidirectional LID <-> Phone Number (PN) cache.
 * Avoids repeated network queries and enables instant, transparent JID resolution.
 */
export class LidCacheManager {
    constructor() {
        _LidCacheManager_lidToPn.set(this, new Map());
        _LidCacheManager_pnToLid.set(this, new Map()
        /**
         * Store multiple LID-PN mappings in memory
         */
        );
    }
    /**
     * Store multiple LID-PN mappings in memory
     */
    store(mappings) {
        for (const { lid, pn } of mappings) {
            if (!lid || !pn)
                continue;
            const cleanLid = jidNormalizedUser(lid);
            const cleanPn = jidNormalizedUser(pn);
            __classPrivateFieldGet(this, _LidCacheManager_lidToPn, "f").set(cleanLid, cleanPn);
            __classPrivateFieldGet(this, _LidCacheManager_pnToLid, "f").set(cleanPn, cleanLid);
            // Also index with bare user IDs (without @lid or @s.whatsapp.net) for fast digit lookup
            const lidUser = jidDecode(cleanLid)?.user;
            const pnUser = jidDecode(cleanPn)?.user;
            if (lidUser && pnUser) {
                __classPrivateFieldGet(this, _LidCacheManager_lidToPn, "f").set(lidUser, cleanPn);
                __classPrivateFieldGet(this, _LidCacheManager_pnToLid, "f").set(pnUser, cleanLid);
            }
        }
    }
    /**
     * Get phone number JID for a given LID
     */
    getPN(lid) {
        if (!lid)
            return undefined;
        const clean = jidNormalizedUser(lid);
        const user = jidDecode(clean)?.user;
        return __classPrivateFieldGet(this, _LidCacheManager_lidToPn, "f").get(clean) || (user ? __classPrivateFieldGet(this, _LidCacheManager_lidToPn, "f").get(user) : undefined);
    }
    /**
     * Get LID for a given phone number JID
     */
    getLID(pn) {
        if (!pn)
            return undefined;
        const clean = jidNormalizedUser(pn);
        const user = jidDecode(clean)?.user;
        return __classPrivateFieldGet(this, _LidCacheManager_pnToLid, "f").get(clean) || (user ? __classPrivateFieldGet(this, _LidCacheManager_pnToLid, "f").get(user) : undefined);
    }
    /**
     * Resolves any JID (whether LID or PN) to standard Phone Number JID (@s.whatsapp.net)
     */
    resolveToPN(jid) {
        if (!jid)
            return jid;
        if (isPnUser(jid))
            return jidNormalizedUser(jid);
        if (isLidUser(jid)) {
            const pn = this.getPN(jid);
            if (pn)
                return pn;
        }
        return jidNormalizedUser(jid);
    }
    /**
     * Extract pure digits from any JID
     */
    extractDigits(jid) {
        if (!jid)
            return '';
        const resolved = this.resolveToPN(jid);
        const user = jidDecode(resolved)?.user || resolved;
        return user.replace(/\D/g, '');
    }
    /**
     * Total cached mappings
     */
    get size() {
        return __classPrivateFieldGet(this, _LidCacheManager_lidToPn, "f").size;
    }
    /**
     * Clear cache
     */
    clear() {
        __classPrivateFieldGet(this, _LidCacheManager_lidToPn, "f").clear();
        __classPrivateFieldGet(this, _LidCacheManager_pnToLid, "f").clear();
    }
}
_LidCacheManager_lidToPn = new WeakMap(), _LidCacheManager_pnToLid = new WeakMap();
export const lidCache = new LidCacheManager();
//# sourceMappingURL=lid-cache.js.map