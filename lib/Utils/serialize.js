import { isJidGroup, isLidUser, isPnUser, jidDecode, jidNormalizedUser } from '../WABinary/index.js';
import { lidCache } from './lid-cache.js';
import { downloadContentFromMessage } from './messages-media.js';
/**
 * Unwrap nested / wrapper messages such as ephemeral, view once, etc.
 */
export const unwrapMessage = (message) => {
    if (!message)
        return undefined;
    let unwrapped = message;
    while (unwrapped?.ephemeralMessage ||
        unwrapped?.viewOnceMessage ||
        unwrapped?.viewOnceMessageV2 ||
        unwrapped?.viewOnceMessageV2Extension ||
        unwrapped?.viewOnceMessageV3 ||
        unwrapped?.documentWithCaptionMessage) {
        unwrapped =
            unwrapped.ephemeralMessage?.message ||
                unwrapped.viewOnceMessage?.message ||
                unwrapped.viewOnceMessageV2?.message ||
                unwrapped.viewOnceMessageV2Extension?.message ||
                unwrapped.viewOnceMessageV3?.message ||
                unwrapped.documentWithCaptionMessage?.message;
    }
    return unwrapped;
};
/**
 * Check if a message structure contains a View-Once wrapper or flag (v1, v2, v2Extension, v3)
 */
export const isViewOnceMessage = (message) => {
    if (!message)
        return false;
    const raw = message;
    const unwrapped = unwrapMessage(message);
    return Boolean(raw.viewOnceMessage ||
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
        unwrapped?.audioMessage?.viewOnce);
};
/**
 * Extract inner message from View-Once wrapper
 */
export const extractViewOnceMessage = (message) => {
    if (!message)
        return undefined;
    let curr = message;
    if (curr.ephemeralMessage?.message) {
        curr = curr.ephemeralMessage.message;
    }
    const inner = curr.viewOnceMessage?.message ||
        curr.viewOnceMessageV2?.message ||
        curr.viewOnceMessageV2Extension?.message ||
        curr.viewOnceMessageV3?.message;
    if (inner)
        return inner;
    if (curr.imageMessage?.viewOnce ||
        curr.videoMessage?.viewOnce ||
        curr.audioMessage?.viewOnce) {
        return curr;
    }
    const unwrapped = unwrapMessage(message);
    if (unwrapped?.imageMessage?.viewOnce ||
        unwrapped?.videoMessage?.viewOnce ||
        unwrapped?.audioMessage?.viewOnce) {
        return unwrapped;
    }
    return undefined;
};
/**
 * Identify the media type of a View-Once message
 */
export const getViewOnceType = (message) => {
    const vo = extractViewOnceMessage(message) || unwrapMessage(message);
    if (!vo)
        return undefined;
    if (vo.imageMessage)
        return 'image';
    if (vo.videoMessage)
        return 'video';
    if (vo.audioMessage)
        return 'audio';
    if (vo.documentMessage)
        return 'document';
    return undefined;
};
/**
 * Extract clean text or caption from any message payload
 */
export const extractMessageText = (message) => {
    const unwrapped = unwrapMessage(message);
    if (!unwrapped)
        return '';
    if (unwrapped.conversation)
        return unwrapped.conversation;
    if (unwrapped.extendedTextMessage?.text)
        return unwrapped.extendedTextMessage.text;
    if (unwrapped.imageMessage?.caption)
        return unwrapped.imageMessage.caption;
    if (unwrapped.videoMessage?.caption)
        return unwrapped.videoMessage.caption;
    if (unwrapped.documentMessage?.caption)
        return unwrapped.documentMessage.caption;
    // Interactive & Buttons
    if (unwrapped.buttonsResponseMessage?.selectedButtonId) {
        return unwrapped.buttonsResponseMessage.selectedButtonId;
    }
    if (unwrapped.buttonsResponseMessage?.selectedDisplayText) {
        return unwrapped.buttonsResponseMessage.selectedDisplayText;
    }
    if (unwrapped.templateButtonReplyMessage?.selectedId) {
        return unwrapped.templateButtonReplyMessage.selectedId;
    }
    if (unwrapped.templateButtonReplyMessage?.selectedDisplayText) {
        return unwrapped.templateButtonReplyMessage.selectedDisplayText;
    }
    if (unwrapped.listResponseMessage?.singleSelectReply?.selectedRowId) {
        return unwrapped.listResponseMessage.singleSelectReply.selectedRowId;
    }
    if (unwrapped.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
        try {
            const parsed = JSON.parse(unwrapped.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
            if (parsed.id)
                return String(parsed.id);
        }
        catch { }
    }
    if (unwrapped.pollCreationMessage?.name) {
        return unwrapped.pollCreationMessage.name;
    }
    return '';
};
/**
 * Extract button response metadata (id and display text) from response messages
 */
export const extractButtonResponse = (message) => {
    const unwrapped = unwrapMessage(message);
    if (!unwrapped)
        return {};
    if (unwrapped.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
        try {
            const parsed = JSON.parse(unwrapped.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
            return {
                id: parsed.id ? String(parsed.id) : undefined,
                text: unwrapped.interactiveResponseMessage?.body?.text || undefined
            };
        }
        catch { }
    }
    if (unwrapped.buttonsResponseMessage) {
        return {
            id: unwrapped.buttonsResponseMessage.selectedButtonId || undefined,
            text: unwrapped.buttonsResponseMessage.selectedDisplayText || undefined
        };
    }
    if (unwrapped.templateButtonReplyMessage) {
        return {
            id: unwrapped.templateButtonReplyMessage.selectedId || undefined,
            text: unwrapped.templateButtonReplyMessage.selectedDisplayText || undefined
        };
    }
    if (unwrapped.listResponseMessage?.singleSelectReply) {
        return {
            id: unwrapped.listResponseMessage.singleSelectReply.selectedRowId || undefined,
            text: unwrapped.listResponseMessage.title || undefined
        };
    }
    return {};
};
/**
 * Determine the primary message type name
 */
export const getMessageType = (message) => {
    const unwrapped = unwrapMessage(message);
    if (!unwrapped)
        return undefined;
    const keys = Object.keys(unwrapped).filter(k => k !== 'messageContextInfo' && unwrapped[k] != null);
    return keys[0];
};
/**
 * Download media from message or quoted message as Buffer
 */
export const downloadMedia = async (message) => {
    const unwrapped = unwrapMessage(message);
    if (!unwrapped)
        throw new Error('No message content to download media from');
    const mediaType = (unwrapped.imageMessage ? 'image' :
        unwrapped.videoMessage ? 'video' :
            unwrapped.audioMessage ? 'audio' :
                unwrapped.stickerMessage ? 'sticker' :
                    unwrapped.documentMessage ? 'document' : undefined);
    if (!mediaType)
        throw new Error('Message does not contain downloadable media');
    const mediaMessage = (unwrapped.imageMessage ||
        unwrapped.videoMessage ||
        unwrapped.audioMessage ||
        unwrapped.stickerMessage ||
        unwrapped.documentMessage);
    const maxRetries = 2;
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const stream = await downloadContentFromMessage(mediaMessage, mediaType);
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            return Buffer.concat(chunks);
        }
        catch (err) {
            lastErr = err;
            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
            }
        }
    }
    throw lastErr;
};
/**
 * Transparently serialize a raw Baileys WAMessage into a developer-friendly SerializedMessage.
 * Resolves all group participant LIDs to real phone numbers in the background.
 */
export const serializeMessage = (msg, sock) => {
    const m = msg;
    m.id = msg.key?.id || '';
    m.chat = msg.key?.remoteJid || '';
    m.isGroup = Boolean(isJidGroup(m.chat));
    m.fromMe = !!msg.key?.fromMe;
    m.pushName = msg.pushName || '';
    // Normalize unwrapped message content
    const content = unwrapMessage(msg.message);
    // Determine sender
    const rawSender = m.fromMe
        ? (sock.user?.id || sock.authState?.creds?.me?.id || '')
        : (msg.key?.participant || m.chat);
    // Resolve LID to Phone Number JID
    m.sender = lidCache.resolveToPN(rawSender);
    m.senderNumber = lidCache.extractDigits(m.sender || rawSender);
    m.senderLid = isLidUser(rawSender) ? rawSender : lidCache.getLID(m.sender);
    // Extract message type and text
    m.type = getMessageType(content);
    m.text = extractMessageText(content);
    m.body = m.text;
    // View-Once detection and extraction
    const rawMessage = msg.message;
    m.isViewOnce = isViewOnceMessage(rawMessage) || Boolean(msg.key?.isViewOnce);
    m.viewOnceType = getViewOnceType(rawMessage);
    m.getViewOnce = () => {
        const voInner = extractViewOnceMessage(rawMessage);
        return {
            isViewOnce: m.isViewOnce,
            type: m.viewOnceType,
            message: voInner || (m.isViewOnce ? content : undefined),
            caption: extractMessageText(voInner || content),
            isQuoted: false
        };
    };
    m.downloadViewOnce = async () => {
        if (m.isViewOnce) {
            const voInner = extractViewOnceMessage(rawMessage) || content;
            return downloadMedia(voInner);
        }
        if (m.quoted && typeof m.quoted.downloadViewOnce === 'function') {
            return m.quoted.downloadViewOnce();
        }
        throw new Error('Neither this message nor quoted message contains a view-once payload');
    };
    // Revoke / Anti-delete message detection
    const protocolMsg = content?.protocolMessage;
    m.isRevoke = Boolean(protocolMsg && (protocolMsg.type === 0 || protocolMsg.type === 'REVOKE'));
    m.revokedMessageKey = m.isRevoke ? protocolMsg?.key || undefined : undefined;
    if (m.isRevoke && m.revokedMessageKey && typeof sock.getDeletedMessage === 'function') {
        m.deletedMessage = sock.getDeletedMessage(m.revokedMessageKey);
    }
    m.getRevokedMessage = () => {
        if (m.revokedMessageKey && typeof sock.getDeletedMessage === 'function') {
            return sock.getDeletedMessage(m.revokedMessageKey);
        }
        return m.deletedMessage;
    };
    // Mentioned JIDs & Mentions
    const findContextInfo = (obj) => {
        if (!obj || typeof obj !== 'object')
            return undefined;
        if (obj.contextInfo)
            return obj.contextInfo;
        for (const k of Object.keys(obj)) {
            if (obj[k] && typeof obj[k] === 'object' && obj[k].contextInfo) {
                return obj[k].contextInfo;
            }
        }
        return undefined;
    };
    const contextInfo = findContextInfo(content) || findContextInfo(rawMessage);
    m.mentionedJid = (contextInfo?.mentionedJid || []).map((jid) => lidCache.resolveToPN(jid));
    const textMentions = (m.text?.match(/@(\d{5,16})/g) || []).map((t) => `${t.slice(1)}@s.whatsapp.net`);
    m.mentions = Array.from(new Set([...m.mentionedJid, ...textMentions]));
    // Quoted message handling
    if (contextInfo?.quotedMessage) {
        const rawQuoted = contextInfo.quotedMessage;
        const qContent = unwrapMessage(rawQuoted);
        const stanzaId = contextInfo.stanzaId;
        const storedMsg = stanzaId && typeof sock?.getMessageFromStore === 'function'
            ? sock.getMessageFromStore(stanzaId)
            : undefined;
        const isQuotedVo = isViewOnceMessage(rawQuoted) || Boolean(storedMsg?.isViewOnce);
        const quotedVoType = getViewOnceType(rawQuoted) || storedMsg?.viewOnceType || (qContent?.imageMessage ? 'image' :
            qContent?.videoMessage ? 'video' :
                qContent?.audioMessage ? 'audio' :
                    qContent?.documentMessage ? 'document' : undefined);
        const qParticipant = contextInfo.participant || '';
        const qSender = lidCache.resolveToPN(qParticipant);
        const qSenderNumber = lidCache.extractDigits(qSender || qParticipant);
        const qSenderLid = isLidUser(qParticipant) ? qParticipant : lidCache.getLID(qSender);
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
            getViewOnce: () => {
                const voInner = extractViewOnceMessage(rawQuoted) || storedMsg?.message || (isQuotedVo ? qContent : undefined);
                return {
                    isViewOnce: isQuotedVo,
                    type: quotedVoType,
                    message: voInner || (isQuotedVo ? qContent : undefined),
                    caption: extractMessageText(voInner || qContent),
                    isQuoted: true
                };
            },
            downloadViewOnce: async () => {
                const stored = storedMsg?.message ? (extractViewOnceMessage(storedMsg.message) || storedMsg.message) : undefined;
                const rawExtract = extractViewOnceMessage(rawQuoted);
                const target = stored || rawExtract || qContent;
                if (!target) {
                    throw new Error('Pesan media sekali lihat tidak ditemukan di cache lokal bot.');
                }
                const media = unwrapMessage(target)?.imageMessage ||
                    unwrapMessage(target)?.videoMessage ||
                    unwrapMessage(target)?.audioMessage ||
                    unwrapMessage(target)?.documentMessage;
                if (!media?.mediaKey && !media?.url && !media?.directPath) {
                    throw new Error('Media key View-Once telah dihapus oleh WhatsApp klien saat di-reply dan bot tidak sempat menyimpannya saat pesan pertama kali masuk.');
                }
                return downloadMedia(target);
            },
            download: async () => {
                const stored = storedMsg?.message ? (extractViewOnceMessage(storedMsg.message) || storedMsg.message) : undefined;
                const rawExtract = extractViewOnceMessage(rawQuoted);
                const target = stored || rawExtract || qContent;
                return downloadMedia(target);
            },
            reply: async (replyContent, options) => {
                const payload = typeof replyContent === 'string' ? { text: replyContent } : replyContent;
                return sock.sendMessage(m.chat, payload, { quoted: { key: m.quoted.key, message: m.quoted.message }, ...options });
            },
            replyButton: async (btnContent, options) => {
                const quotedMsg = { key: m.quoted.key, message: m.quoted.message };
                if (typeof sock.sendButton === 'function') {
                    return sock.sendButton(m.chat, btnContent, { quoted: quotedMsg, ...options });
                }
                return sock.sendMessage(m.chat, btnContent, { quoted: quotedMsg, ...options });
            },
            replyListMenu: async (listContent, options) => {
                const quotedMsg = { key: m.quoted.key, message: m.quoted.message };
                if (typeof sock.sendListMenu === 'function') {
                    return sock.sendListMenu(m.chat, listContent, { quoted: quotedMsg, ...options });
                }
            }
        };
    }
    /**
     * Check if message sender is inside the provided owner list.
     * Handles phone numbers ('628xxx'), prefixed JIDs, or raw numbers transparently.
     */
    m.isOwner = (ownerList) => {
        const list = Array.isArray(ownerList) ? ownerList : [ownerList];
        const senderDigits = m.senderNumber;
        for (const item of list) {
            if (!item)
                continue;
            const cleanItem = String(item).trim();
            const itemDigits = cleanItem.replace(/\D/g, '');
            if (itemDigits && senderDigits === itemDigits) {
                return true;
            }
            if (cleanItem === m.sender || (m.senderLid && cleanItem === m.senderLid)) {
                return true;
            }
        }
        return false;
    };
    /**
     * Send simulated typing (composing) presence indicator for a duration
     */
    m.sendTyping = async (durationMs = 1200) => {
        try {
            await sock.sendPresenceUpdate?.('composing', m.chat);
            await new Promise(r => setTimeout(r, durationMs));
            await sock.sendPresenceUpdate?.('paused', m.chat);
        }
        catch { }
    };
    /**
     * Reply directly to this message
     */
    m.reply = async (replyContent, options) => {
        const payload = typeof replyContent === 'string' ? { text: replyContent } : replyContent;
        const shouldType = options?.typing ?? Boolean(sock.config?.autoTyping);
        if (shouldType) {
            try {
                await sock.sendPresenceUpdate?.('composing', m.chat);
                const textLen = typeof replyContent === 'string' ? replyContent.length : replyContent.text?.length || 20;
                const typeDelay = Math.min(Math.max(textLen * 15, 500), 2000);
                await new Promise(r => setTimeout(r, typeDelay));
            }
            catch { }
        }
        try {
            return await sock.sendMessage(m.chat, payload, { quoted: msg, ...options });
        }
        finally {
            if (shouldType) {
                try {
                    await sock.sendPresenceUpdate?.('paused', m.chat);
                }
                catch { }
            }
        }
    };
    /**
     * Send emoji reaction to this message
     */
    m.react = async (emoji) => {
        return sock.sendMessage(m.chat, {
            react: {
                text: emoji,
                key: msg.key
            }
        });
    };
    /**
     * Download attached media as Buffer
     */
    m.download = async () => {
        return downloadMedia(content);
    };
    // Extract button response details if present
    const btnResp = extractButtonResponse(content);
    m.selectedButtonId = btnResp.id;
    m.selectedButtonText = btnResp.text;
    /**
     * Send an interactive button message to this chat
     */
    m.sendButton = async (btnContent, options) => {
        if (typeof sock.sendButton === 'function') {
            return sock.sendButton(m.chat, btnContent, options);
        }
        return sock.sendMessage(m.chat, btnContent, options);
    };
    /**
     * Reply with an interactive button message (quoted to this message)
     */
    m.replyButton = async (btnContent, options) => {
        const shouldType = options?.typing ?? Boolean(sock.config?.autoTyping);
        if (shouldType) {
            try {
                await sock.sendPresenceUpdate?.('composing', m.chat);
                await new Promise(r => setTimeout(r, 600));
            }
            catch { }
        }
        try {
            if (typeof sock.sendButton === 'function') {
                return await sock.sendButton(m.chat, btnContent, { quoted: msg, ...options });
            }
            return await sock.sendMessage(m.chat, btnContent, { quoted: msg, ...options });
        }
        finally {
            if (shouldType) {
                try {
                    await sock.sendPresenceUpdate?.('paused', m.chat);
                }
                catch { }
            }
        }
    };
    /**
     * Edit an existing message
     */
    m.edit = async (newContent, targetKey) => {
        if (typeof sock.editMessage === 'function') {
            return sock.editMessage(m.chat, targetKey || msg.key, newContent);
        }
        const payload = typeof newContent === 'string' ? { text: newContent } : newContent;
        return sock.sendMessage(m.chat, { ...payload, edit: targetKey || msg.key });
    };
    /**
     * Delete a message (defaults to deleting this message)
     */
    m.delete = async (forEveryone = true, targetKey) => {
        if (typeof sock.deleteMessage === 'function') {
            return sock.deleteMessage(m.chat, targetKey || msg.key, forEveryone);
        }
        if (forEveryone) {
            const k = targetKey || msg.key;
            return sock.sendMessage(m.chat, {
                delete: {
                    remoteJid: m.chat,
                    id: k.id,
                    fromMe: k.fromMe,
                    participant: k.participant
                }
            });
        }
    };
    m.deleteForMe = async (targetKey) => {
        return m.delete(false, targetKey);
    };
    m.deleteForEveryone = async (targetKey) => {
        return m.delete(true, targetKey);
    };
    /**
     * Check if a user is admin in this group
     */
    m.isAdmin = async (userJid) => {
        if (!m.isGroup)
            return false;
        if (typeof sock.isGroupAdmin === 'function') {
            return sock.isGroupAdmin(m.chat, userJid || m.sender);
        }
        try {
            const target = userJid || m.sender;
            const targetDigits = lidCache.extractDigits(target);
            const admins = await m.getGroupAdmins();
            return admins.some((p) => {
                const pPn = lidCache.resolveToPN(p.id);
                return pPn === target || (targetDigits && lidCache.extractDigits(pPn) === targetDigits);
            });
        }
        catch {
            return false;
        }
    };
    /**
     * Check if the sender of this message is admin
     */
    m.isSenderAdmin = async () => {
        return m.isAdmin(m.sender);
    };
    /**
     * Check if the bot itself is admin in this group
     */
    m.isBotAdmin = async () => {
        if (!m.isGroup)
            return false;
        const botJid = sock.user?.id || sock.authState?.creds?.me?.id || '';
        return m.isAdmin(botJid);
    };
    /**
     * Inspect phone number in detail (registered, bio, banned, appeal, business)
     */
    m.inspectPhone = async (targetNumber, field) => {
        const target = targetNumber || m.senderNumber || m.sender;
        let res;
        if (typeof sock.inspectPhoneNumber === 'function') {
            res = await sock.inspectPhoneNumber(target);
        }
        else {
            const { inspectPhoneNumber } = await import('./phone-inspector.js');
            res = await inspectPhoneNumber(sock, target);
        }
        if (field && field !== 'all' && res && field in res) {
            return res[field];
        }
        return res;
    };
    /**
     * Broadcast WhatsApp status/story mentioning this group
     */
    m.postGroupStory = async (storyContent) => {
        const payload = typeof storyContent === 'string' ? { text: storyContent } : storyContent;
        if (typeof sock.broadcastGroupStory === 'function') {
            return sock.broadcastGroupStory(payload, [m.chat]);
        }
    };
    /**
     * Broadcast WhatsApp status/story mentioning this group and any extra targets
     */
    m.broadcastStory = async (storyContent, additionalJids = []) => {
        const payload = typeof storyContent === 'string' ? { text: storyContent } : storyContent;
        const allJids = Array.from(new Set([m.chat, ...additionalJids]));
        if (typeof sock.broadcastGroupStory === 'function') {
            return sock.broadcastGroupStory(payload, allJids);
        }
    };
    /**
     * Pin message in chat
     */
    m.pin = async (durationSeconds = 86400, targetKey) => {
        if (typeof sock.pinMessage === 'function') {
            return sock.pinMessage(m.chat, targetKey || msg.key, durationSeconds);
        }
    };
    /**
     * Unpin message in chat
     */
    m.unpin = async (targetKey) => {
        if (typeof sock.unpinMessage === 'function') {
            return sock.unpinMessage(m.chat, targetKey || msg.key);
        }
    };
    /**
     * Forward this message to another chat
     */
    m.forward = async (targetJid, options) => {
        return sock.sendMessage(targetJid, { forward: msg }, options);
    };
    /**
     * Copy/duplicate this message content to a chat
     */
    m.copy = async (targetJid, options) => {
        return sock.sendMessage(targetJid || m.chat, content, options);
    };
    /**
     * Send poll easily with comprehensive configuration
     */
    m.sendPoll = async (pollOrName, values, selectableCountOrOptions, options) => {
        if (typeof sock.sendPoll === 'function') {
            return sock.sendPoll(m.chat, pollOrName, values, selectableCountOrOptions, options);
        }
    };
    /**
     * Reply with a poll directly to this message
     */
    m.replyPoll = async (pollOrName, values, selectableCountOrOptions, options) => {
        const quotedOption = { quoted: msg };
        if (typeof pollOrName === 'string') {
            let mergedOpt = quotedOption;
            if (typeof selectableCountOrOptions === 'object' && selectableCountOrOptions !== null) {
                mergedOpt = { ...quotedOption, ...selectableCountOrOptions };
            }
            else if (typeof options === 'object' && options !== null) {
                mergedOpt = { ...quotedOption, ...options };
            }
            return m.sendPoll(pollOrName, values, selectableCountOrOptions, mergedOpt);
        }
        let mergedOpt = quotedOption;
        if (typeof values === 'object' && values !== null && !Array.isArray(values)) {
            mergedOpt = { ...quotedOption, ...values };
        }
        else if (typeof selectableCountOrOptions === 'object' && selectableCountOrOptions !== null) {
            mergedOpt = { ...quotedOption, ...selectableCountOrOptions };
        }
        return m.sendPoll(pollOrName, mergedOpt);
    };
    /**
     * Send contact card easily
     */
    m.sendContact = async (name, number) => {
        if (typeof sock.sendContact === 'function') {
            return sock.sendContact(m.chat, { name, number });
        }
    };
    /**
     * Send a multi-media album to this chat
     */
    m.sendAlbum = async (medias, options) => {
        if (typeof sock.sendAlbum === 'function') {
            return sock.sendAlbum(m.chat, medias, options);
        }
        const { caption, delayMs, ...restOptions } = options || {};
        return sock.sendMessage(m.chat, { album: medias, caption, delayMs }, restOptions);
    };
    /**
     * Reply with a multi-media album quoting this message
     */
    m.replyAlbum = async (medias, options) => {
        const quotedOption = { quoted: msg, ...(options || {}) };
        return m.sendAlbum(medias, quotedOption);
    };
    /**
     * Get Realtime Session Health Report
     */
    m.getSessionHealth = async () => {
        if (typeof sock.getSessionHealth === 'function') {
            return sock.getSessionHealth();
        }
        return undefined;
    };
    /**
     * Send an interactive List Menu
     */
    m.sendListMenu = async (listContent, options) => {
        if (typeof sock.sendListMenu === 'function') {
            return sock.sendListMenu(m.chat, listContent, options);
        }
    };
    /**
     * Reply with an interactive List Menu quoting this message
     */
    m.replyListMenu = async (listContent, options) => {
        const quotedMsg = { key: msg.key, message: msg.message };
        if (typeof sock.sendListMenu === 'function') {
            return sock.sendListMenu(m.chat, listContent, { quoted: quotedMsg, ...options });
        }
    };
    /**
     * Tag specific users with either visible mention text or hidden tags
     */
    m.tag = async (targets, text, options) => {
        const list = Array.isArray(targets) ? targets : [targets];
        const jids = list.map(t => (t.includes('@') ? t : `${t.replace(/\D/g, '')}@s.whatsapp.net`));
        const isHidden = options?.hidden ?? false;
        let finalText = text;
        if (!isHidden) {
            const tagString = jids.map(j => `@${j.split('@')[0]}`).join(' ');
            finalText = text.includes('@') ? text : `${tagString}\n${text}`;
        }
        return sock.sendMessage(m.chat, {
            text: finalText,
            mentions: jids
        }, {
            quoted: options?.quoted ? { key: msg.key, message: msg.message } : undefined
        });
    };
    /**
     * Tag all group members (visible list or hidden tag)
     */
    m.tagAll = async (text = '', options) => {
        if (!m.isGroup) {
            throw new Error('tagAll can only be used in group chats');
        }
        const metadata = await sock.groupMetadata(m.chat);
        const participants = (metadata?.participants || []).map((p) => p.id);
        const isHidden = options?.hidden ?? false;
        let finalText = text;
        if (!isHidden) {
            const tagList = participants.map((p) => `@${p.split('@')[0]}`).join(' ');
            finalText = text ? `${text}\n\n${tagList}` : tagList;
        }
        return sock.sendMessage(m.chat, {
            text: finalText,
            mentions: participants
        }, {
            quoted: options?.quoted ? { key: msg.key, message: msg.message } : undefined
        });
    };
    /**
     * Tag all group members invisibly without listing @ numbers in text
     */
    m.hidetag = async (text, options) => {
        return m.tagAll(text, { hidden: true, quoted: options?.quoted });
    };
    /**
     * Update bot behavior/presence directly from message context
     */
    m.behavior = async (behavior, targetJid) => {
        if (typeof sock.behaviorUpdate === 'function') {
            return sock.behaviorUpdate(behavior, targetJid || m.chat);
        }
    };
    /**
     * Shortcut to sock.profileUtils scoped to sender or specified JID
     */
    m.profileUtils = (targetJid) => {
        if (typeof sock.profileUtils === 'function') {
            return sock.profileUtils(targetJid || m.sender);
        }
        throw new Error('sock.profileUtils is not available on this socket');
    };
    /**
     * Shortcut to sock.groupUtils scoped to current group or specified JID
     */
    m.groupUtils = (groupJid) => {
        if (typeof sock.groupUtils === 'function') {
            return sock.groupUtils(groupJid || m.chat);
        }
        throw new Error('sock.groupUtils is not available on this socket');
    };
    /**
     * Group shortcut actions directly on msg
     */
    m.getGroupMembers = async (customJid) => {
        const target = customJid || m.chat;
        const meta = await sock.groupMetadata(target);
        return meta?.participants || [];
    };
    m.getGroupAdmins = async (customJid) => {
        const members = await m.getGroupMembers(customJid);
        return members.filter((p) => p.admin === 'admin' || p.admin === 'superadmin');
    };
    m.kick = async (participants, customJid) => {
        const list = Array.isArray(participants) ? participants : [participants];
        return sock.groupParticipantsUpdate(customJid || m.chat, list, 'remove');
    };
    m.add = async (participants, customJid) => {
        const list = Array.isArray(participants) ? participants : [participants];
        return sock.groupParticipantsUpdate(customJid || m.chat, list, 'add');
    };
    m.promote = async (participants, customJid) => {
        const list = Array.isArray(participants) ? participants : [participants];
        return sock.groupParticipantsUpdate(customJid || m.chat, list, 'promote');
    };
    m.demote = async (participants, customJid) => {
        const list = Array.isArray(participants) ? participants : [participants];
        return sock.groupParticipantsUpdate(customJid || m.chat, list, 'demote');
    };
    m.leaveGroup = async (customJid) => {
        return sock.groupLeave(customJid || m.chat);
    };
    m.getInviteCode = async (customJid) => {
        return sock.groupInviteCode(customJid || m.chat);
    };
    m.getInviteUrl = async (customJid) => {
        const code = await sock.groupInviteCode(customJid || m.chat);
        return `https://chat.whatsapp.com/${code}`;
    };
    m.revokeInviteCode = async (customJid) => {
        return sock.groupRevokeInvite(customJid || m.chat);
    };
    m.setGroupName = async (name, customJid) => {
        return sock.groupUpdateSubject(customJid || m.chat, name);
    };
    m.setGroupDescription = async (desc, customJid) => {
        return sock.groupUpdateDescription(customJid || m.chat, desc);
    };
    m.setGroupPicture = async (content, customJid) => {
        return sock.updateProfilePicture(customJid || m.chat, content);
    };
    m.removeGroupPicture = async (customJid) => {
        return sock.removeProfilePicture(customJid || m.chat);
    };
    return m;
};
//# sourceMappingURL=serialize.js.map