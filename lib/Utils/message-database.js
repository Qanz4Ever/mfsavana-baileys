import fs from 'fs';
import { isJidGroup, jidNormalizedUser } from '../WABinary/index.js';
import { getContentType } from './messages.js';
export class MessageDatabase {
    constructor(options = {}) {
        this.records = new Map();
        this.lastPrunedAt = Date.now();
        this.scope = options.scope ?? 'all';
        this.maxAgeMs = options.maxAgeMs ?? 24 * 60 * 60 * 1000; // 24 hours
        this.filePath = options.filePath;
        if (this.filePath && fs.existsSync(this.filePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
                if (Array.isArray(data)) {
                    for (const item of data) {
                        if (item?.id) {
                            this.records.set(item.id, item);
                        }
                    }
                }
            }
            catch { }
        }
    }
    setScope(scope) {
        this.scope = scope;
    }
    shouldStore(chatJid) {
        if (this.scope === false || this.scope === 'none')
            return false;
        const inGroup = Boolean(isJidGroup(chatJid));
        if (this.scope === 'group')
            return inGroup;
        if (this.scope === 'direct')
            return !inGroup;
        return true; // 'all' or true
    }
    extractText(message) {
        if (!message)
            return undefined;
        return (message.conversation ||
            message.extendedTextMessage?.text ||
            message.imageMessage?.caption ||
            message.videoMessage?.caption ||
            message.documentMessage?.caption ||
            message.buttonsResponseMessage?.selectedDisplayText ||
            message.templateButtonReplyMessage?.selectedDisplayText ||
            message.listResponseMessage?.title ||
            undefined);
    }
    save(rawMsg) {
        const key = rawMsg.key;
        if (!key || !key.id || !key.remoteJid)
            return undefined;
        if (!rawMsg.message)
            return undefined;
        // Do not store protocol messages (revokes, ephemeral toggles) as content
        if (rawMsg.message.protocolMessage)
            return undefined;
        const chat = key.remoteJid;
        if (!this.shouldStore(chat))
            return undefined;
        const senderJid = key.participant || key.remoteJid || '';
        const sender = (jidNormalizedUser(senderJid) || '');
        const senderNumber = (sender ? sender.split('@')[0] : '') || '';
        const isGroup = Boolean(isJidGroup(chat));
        const mediaType = getContentType(rawMsg.message);
        const text = this.extractText(rawMsg.message);
        const raw = rawMsg.message;
        const isVo = Boolean(raw.viewOnceMessage ||
            raw.viewOnceMessageV2 ||
            raw.viewOnceMessageV2Extension ||
            raw.viewOnceMessageV3 ||
            raw.ephemeralMessage?.message?.viewOnceMessage ||
            raw.ephemeralMessage?.message?.viewOnceMessageV2 ||
            raw.ephemeralMessage?.message?.viewOnceMessageV3 ||
            raw.imageMessage?.viewOnce ||
            raw.videoMessage?.viewOnce ||
            raw.audioMessage?.viewOnce);
        const voType = raw.imageMessage || raw.viewOnceMessage?.message?.imageMessage || raw.viewOnceMessageV2?.message?.imageMessage || raw.viewOnceMessageV3?.message?.imageMessage ? 'image'
            : raw.videoMessage || raw.viewOnceMessage?.message?.videoMessage || raw.viewOnceMessageV2?.message?.videoMessage || raw.viewOnceMessageV3?.message?.videoMessage ? 'video'
                : raw.audioMessage || raw.viewOnceMessage?.message?.audioMessage || raw.viewOnceMessageV2?.message?.audioMessage || raw.viewOnceMessageV3?.message?.audioMessage ? 'audio'
                    : undefined;
        const record = {
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
        };
        this.records.set(key.id, record);
        // Periodically prune expired entries
        if (Date.now() - this.lastPrunedAt > 5 * 60 * 1000) {
            this.prune();
        }
        return record;
    }
    get(idOrKey) {
        const id = typeof idOrKey === 'string' ? idOrKey : idOrKey?.id;
        if (!id)
            return undefined;
        return this.records.get(id);
    }
    findDeleted(revokeKey) {
        if (!revokeKey || !revokeKey.id)
            return undefined;
        return this.records.get(revokeKey.id);
    }
    prune() {
        this.lastPrunedAt = Date.now();
        const cutoff = Date.now() - this.maxAgeMs;
        for (const [id, record] of this.records) {
            if (record.timestamp < cutoff) {
                this.records.delete(id);
            }
        }
        if (this.filePath) {
            this.persist();
        }
    }
    persist() {
        if (!this.filePath)
            return;
        try {
            const arr = Array.from(this.records.values());
            fs.writeFileSync(this.filePath, JSON.stringify(arr), 'utf-8');
        }
        catch { }
    }
    clear() {
        this.records.clear();
        if (this.filePath && fs.existsSync(this.filePath)) {
            try {
                fs.unlinkSync(this.filePath);
            }
            catch { }
        }
    }
    get size() {
        return this.records.size;
    }
}
export default MessageDatabase;
//# sourceMappingURL=message-database.js.map