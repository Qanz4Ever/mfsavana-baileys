import type { WAMessage, WAMessageKey } from '../Types/index.js';
export type MessageStoreScope = 'all' | 'group' | 'direct' | 'none' | boolean;
export interface StoredMessageRecord {
    id: string;
    key: WAMessageKey;
    chat: string;
    sender: string;
    senderNumber: string;
    isGroup: boolean;
    pushName?: string;
    text?: string;
    mediaType?: string;
    message?: any;
    isViewOnce?: boolean;
    viewOnceType?: string;
    raw: any;
    timestamp: number;
}
export declare class MessageDatabase {
    private records;
    private scope;
    private maxAgeMs;
    private filePath?;
    private lastPrunedAt;
    constructor(options?: {
        scope?: MessageStoreScope;
        maxAgeMs?: number;
        filePath?: string;
    });
    setScope(scope: MessageStoreScope): void;
    private shouldStore;
    private extractText;
    save(rawMsg: WAMessage): StoredMessageRecord | undefined;
    get(idOrKey: string | WAMessageKey): StoredMessageRecord | undefined;
    findDeleted(revokeKey: WAMessageKey): StoredMessageRecord | undefined;
    prune(): void;
    private persist;
    clear(): void;
    get size(): number;
}
export default MessageDatabase;
//# sourceMappingURL=message-database.d.ts.map