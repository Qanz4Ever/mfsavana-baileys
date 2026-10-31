import { DEFAULT_CONNECTION_CONFIG } from '../Defaults/index.js';
import { makeCommunitiesSocket } from './communities.js';
import { serializeMessage, extractMessageText } from '../Utils/serialize.js';
import { resolveBrowserConfig } from '../Utils/browser-utils.js';
import { createDynamicLogger } from '../Utils/dynamic-logger.js';
import { SessionHealthTracker } from '../Utils/session-health.js';
import { MessageDatabase } from '../Utils/message-database.js';
import { lidCache } from '../Utils/lid-cache.js';
import { isLidUser } from '../WABinary/index.js';
import { createContext } from '../Utils/context.js';
import { RateLimiter, AntiBanEngine } from '../Utils/rate-limiter.js';
import { inspectPhoneNumber } from '../Utils/phone-inspector.js';
// export the last socket layer
const makeWASocket = (config) => {
    const resolvedBrowser = resolveBrowserConfig(config.browser || DEFAULT_CONNECTION_CONFIG.browser);
    const dynamicLog = config.dynamicLogger ?? DEFAULT_CONNECTION_CONFIG.dynamicLogger;
    const loggerInstance = dynamicLog && !config.logger
        ? createDynamicLogger({ level: 'info' })
        : (config.logger || DEFAULT_CONNECTION_CONFIG.logger);
    const newConfig = {
        ...DEFAULT_CONNECTION_CONFIG,
        ...config,
        browser: resolvedBrowser,
        logger: loggerInstance
    };
    const sock = makeCommunitiesSocket(newConfig);
    // Anti-Ban Engine & Outbound Rate Limiter
    const antiBanEngine = new AntiBanEngine(newConfig.antiBan);
    const rateLimiter = new RateLimiter(newConfig.rateLimit);
    // 3. Message Database Store (Anti-Delete & Message History)
    const messageDatabase = new MessageDatabase({
        scope: newConfig.saveIncomingMessages,
        maxAgeMs: newConfig.messageStoreMaxAgeMs,
        filePath: newConfig.messageStorePath
    });
    // 4. Session Health & Realtime State Tracker
    const healthTracker = new SessionHealthTracker(sock.authState, (node, timeout) => sock.query(node, timeout));
    // Track socket connection updates reactively
    sock.ev.on('connection.update', update => {
        if (update.connection) {
            healthTracker.updateConnection(update.connection);
        }
        if (update.qr) {
            healthTracker.setQrPending(true);
        }
    });
    const processedMessageIds = new Map();
    const DEDUP_TTL = 5 * 60 * 1000; // 5 minutes deduplication window
    const MAX_DEDUP_SIZE = 5000;
    const messageHandlers = [];
    sock.ev.on('messages.upsert', async ({ messages }) => {
        if (!messages || messages.length === 0)
            return;
        const now = Date.now();
        // Clean expired deduplication entries if map exceeds limit
        if (processedMessageIds.size > MAX_DEDUP_SIZE) {
            for (const [id, timestamp] of processedMessageIds) {
                if (now - timestamp > DEDUP_TTL) {
                    processedMessageIds.delete(id);
                }
            }
        }
        for (const rawMsg of messages) {
            if (!rawMsg.message)
                continue;
            const msgId = rawMsg.key?.id;
            if (msgId) {
                const seenAt = processedMessageIds.get(msgId);
                if (seenAt && now - seenAt < DEDUP_TTL) {
                    sock.logger?.debug({ msgId }, 'ignoring duplicate message in onMessage');
                    continue;
                }
                processedMessageIds.set(msgId, now);
            }
            // Automatically save incoming message for anti-delete and message retrieval
            messageDatabase.save(rawMsg);
            healthTracker.recordMessageReceived();
            const serialized = serializeMessage(rawMsg, finalSock);
            const ctx = createContext(serialized, finalSock);
            serialized.ctx = ctx;
            for (const handler of messageHandlers) {
                try {
                    await handler(ctx, serialized);
                }
                catch (error) {
                    sock.logger?.error({ error, msgId: rawMsg.key?.id }, 'error in onMessage handler');
                }
            }
        }
    });
    /**
     * High-level message event listener.
     * Automatically filters empty messages, deduplicates retransmitted stanzas,
     * persists incoming messages for anti-delete retrieval,
     * hydrates/serializes the message object with helpers (msg.reply, msg.text, msg.isOwner),
     * transparently resolves group sender LIDs into real phone numbers,
     * and provides a full MessageContext (ctx) wrapper for command & event handling.
     */
    const onMessage = (handler) => {
        messageHandlers.push(handler);
        return () => {
            const idx = messageHandlers.indexOf(handler);
            if (idx !== -1)
                messageHandlers.splice(idx, 1);
        };
    };
    /**
     * Create a MessageContext (ctx) wrapper from any message
     */
    const createMessageContext = (msg, options) => {
        const serialized = msg?.reply ? msg : serializeMessage(msg, finalSock);
        return createContext(serialized, finalSock, options);
    };
    /**
     * Register a declarative command handler triggered by command name(s) or RegExp
     */
    const onCommand = (command, handler) => {
        const commands = Array.isArray(command)
            ? command.map(c => c.toLowerCase())
            : typeof command === 'string'
                ? [command.toLowerCase()]
                : null;
        return onMessage(async (ctx) => {
            let isMatch = false;
            if (command instanceof RegExp) {
                isMatch = command.test(ctx.text) || command.test(ctx.command);
            }
            else if (commands && commands.includes(ctx.command)) {
                isMatch = true;
            }
            if (isMatch) {
                if (newConfig.rateLimit) {
                    const limitResult = rateLimiter.consume(ctx.sender, newConfig.rateLimit);
                    if (limitResult.limited) {
                        const remainingSec = Math.ceil(limitResult.remainingMs / 1000);
                        const notify = newConfig.rateLimit.notifyOnLimit;
                        if (typeof notify === 'function') {
                            await notify(ctx, limitResult.remainingMs);
                        }
                        else if (typeof notify === 'string') {
                            await ctx.reply(notify.replace('{remaining}', remainingSec.toString()));
                        }
                        else if (notify === true) {
                            await ctx.reply(`⚠️ Terlalu banyak request. Tunggu ${remainingSec} detik sebelum mencoba lagi.`);
                        }
                        return;
                    }
                }
                await handler(ctx);
            }
        });
    };
    /**
     * Listen for message reactions (emoji added or removed)
     */
    const onReaction = (handler) => {
        const listener = async (reactions) => {
            if (!reactions || !reactions.length)
                return;
            for (const { key, reaction } of reactions) {
                const chat = key.remoteJid || '';
                const targetKey = reaction.key || key;
                const rawSender = key.participant || (key.fromMe ? sock.user?.id : key.remoteJid) || '';
                const sender = lidCache.resolveToPN(rawSender);
                const senderNumber = lidCache.extractDigits(sender);
                const emoji = reaction.text || '';
                const isRemoved = !emoji;
                const timestamp = Number(reaction.senderTimestampMs) || Date.now();
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
                    });
                }
                catch (err) {
                    sock.logger?.error({ err, key }, 'error in onReaction handler');
                }
            }
        };
        sock.ev.on('messages.reaction', listener);
        return () => sock.ev.off('messages.reaction', listener);
    };
    /**
     * Listen for edited messages
     */
    const onEdit = (handler) => {
        const listener = async (updates) => {
            if (!updates || !updates.length)
                return;
            for (const u of updates) {
                const editedMsg = u.update?.message?.editedMessage?.message;
                if (!editedMsg)
                    continue;
                const chat = u.key.remoteJid || '';
                const isGroup = chat.endsWith('@g.us');
                const rawSender = u.key.participant || (u.key.fromMe ? sock.user?.id : u.key.remoteJid) || '';
                const sender = lidCache.resolveToPN(rawSender);
                const senderNumber = lidCache.extractDigits(sender);
                const newText = extractMessageText(editedMsg);
                const previousMessage = messageDatabase.get(u.key.id || '');
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
                    });
                }
                catch (err) {
                    sock.logger?.error({ err, key: u.key }, 'error in onEdit handler');
                }
            }
        };
        sock.ev.on('messages.update', listener);
        return () => sock.ev.off('messages.update', listener);
    };
    /**
     * Listen for deleted / revoked messages (Anti-Delete event)
     */
    const onDelete = (handler) => {
        const deletedHistory = new Set();
        // Handle messages.delete event
        const deleteListener = async (item) => {
            if ('keys' in item && Array.isArray(item.keys)) {
                for (const key of item.keys) {
                    const id = key.id || '';
                    if (id && deletedHistory.has(id))
                        continue;
                    if (id) {
                        deletedHistory.add(id);
                        setTimeout(() => deletedHistory.delete(id), 10000);
                    }
                    const chat = key.remoteJid || '';
                    const isGroup = chat.endsWith('@g.us');
                    const rawSender = key.participant || (key.fromMe ? sock.user?.id : key.remoteJid) || '';
                    const sender = lidCache.resolveToPN(rawSender);
                    const senderNumber = lidCache.extractDigits(sender);
                    const deletedMessage = messageDatabase.findDeleted(key);
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
                        });
                    }
                    catch (err) {
                        sock.logger?.error({ err, key }, 'error in onDelete handler');
                    }
                }
            }
            else if ('jid' in item && item.all) {
                try {
                    await handler({
                        chat: item.jid,
                        all: true,
                        isGroup: item.jid.endsWith('@g.us'),
                        timestamp: Date.now()
                    });
                }
                catch (err) {
                    sock.logger?.error({ err, jid: item.jid }, 'error in onDelete (clear chat) handler');
                }
            }
        };
        // Handle revoke protocol messages in messages.upsert
        const upsertRevokeListener = async ({ messages }) => {
            if (!messages || !messages.length)
                return;
            for (const msg of messages) {
                const protoMsg = msg.message?.protocolMessage;
                if (protoMsg && (protoMsg.type === 0 || protoMsg.type === 'REVOKE')) {
                    const targetKey = protoMsg.key;
                    const targetId = targetKey?.id || '';
                    if (!targetId || deletedHistory.has(targetId))
                        continue;
                    deletedHistory.add(targetId);
                    setTimeout(() => deletedHistory.delete(targetId), 10000);
                    const chat = targetKey.remoteJid || msg.key?.remoteJid || '';
                    const isGroup = chat.endsWith('@g.us');
                    const rawSender = msg.key?.participant || (msg.key?.fromMe ? sock.user?.id : targetKey.participant || chat) || '';
                    const sender = lidCache.resolveToPN(rawSender);
                    const senderNumber = lidCache.extractDigits(sender);
                    const deletedMessage = messageDatabase.findDeleted(targetKey);
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
                        });
                    }
                    catch (err) {
                        sock.logger?.error({ err, key: msg.key }, 'error in onDelete protocolMessage handler');
                    }
                }
            }
        };
        sock.ev.on('messages.delete', deleteListener);
        sock.ev.on('messages.upsert', upsertRevokeListener);
        return () => {
            sock.ev.off('messages.delete', deleteListener);
            sock.ev.off('messages.upsert', upsertRevokeListener);
        };
    };
    /**
     * Listen for group settings and metadata updates (subject, desc, announce, restrict, etc.)
     */
    const onGroupUpdate = (handler) => {
        const listener = async (updates) => {
            if (!updates || !updates.length)
                return;
            for (const u of updates) {
                try {
                    await handler({
                        ...u,
                        id: u.id || '',
                        groupJid: u.id || '',
                        subject: u.subject,
                        desc: u.desc
                    });
                }
                catch (err) {
                    sock.logger?.error({ err, id: u.id }, 'error in onGroupUpdate handler');
                }
            }
        };
        sock.ev.on('groups.update', listener);
        return () => sock.ev.off('groups.update', listener);
    };
    /**
     * Listen for group participant membership changes (add, remove/kick, promote, demote)
     */
    const onParticipantUpdate = (handler) => {
        const listener = async (data) => {
            const { id, author, authorPn, authorUsername, participants, action } = data;
            const rawList = Array.isArray(participants) ? participants : [participants];
            const participantJids = rawList.map((p) => (typeof p === 'string' ? p : p.id));
            const resolvedParticipants = participantJids.map(p => lidCache.resolveToPN(p));
            const participantNumbers = resolvedParticipants.map(p => lidCache.extractDigits(p));
            const resolvedAuthor = lidCache.resolveToPN(authorPn || author || '');
            const authorNumber = lidCache.extractDigits(resolvedAuthor);
            const eventObj = {
                id,
                groupJid: id,
                author: resolvedAuthor,
                authorNumber,
                authorPn,
                authorUsername,
                participants: resolvedParticipants,
                participantNumbers,
                action,
                reply: async (text, options) => {
                    const textMentions = (text.match(/@(\d{5,16})/g) || []).map((t) => `${t.slice(1)}@s.whatsapp.net`);
                    const allMentions = Array.from(new Set([...resolvedParticipants, ...participantJids, ...textMentions])).filter(Boolean);
                    return sock.sendMessage(id, { text, mentions: allMentions, ...options });
                }
            };
            try {
                await handler(eventObj);
            }
            catch (err) {
                sock.logger?.error({ err, id }, 'error in onParticipantUpdate handler');
            }
        };
        sock.ev.on('group-participants.update', listener);
        return () => sock.ev.off('group-participants.update', listener);
    };
    /**
     * Listen for chat updates (archive, unread count, mute, pinned, etc.)
     */
    const onChatUpdate = (handler) => {
        const listener = async (chats) => {
            if (!chats || !chats.length)
                return;
            for (const c of chats) {
                try {
                    await handler({
                        ...c,
                        chat: c.id || ''
                    });
                }
                catch (err) {
                    sock.logger?.error({ err, id: c.id }, 'error in onChatUpdate handler');
                }
            }
        };
        sock.ev.on('chats.update', listener);
        return () => sock.ev.off('chats.update', listener);
    };
    /**
     * Listen for contact presence updates (typing, recording, online, offline)
     */
    const onPresence = (handler) => {
        const listener = async ({ id, presences }) => {
            if (!presences)
                return;
            for (const [pJid, data] of Object.entries(presences)) {
                const resolvedParticipant = lidCache.resolveToPN(pJid);
                const participantNumber = lidCache.extractDigits(resolvedParticipant);
                try {
                    await handler({
                        id,
                        chat: id,
                        participant: resolvedParticipant,
                        participantNumber,
                        presence: data.lastKnownPresence,
                        lastSeen: data.lastSeen
                    });
                }
                catch (err) {
                    sock.logger?.error({ err, id, participant: pJid }, 'error in onPresence handler');
                }
            }
        };
        sock.ev.on('presence.update', listener);
        return () => sock.ev.off('presence.update', listener);
    };
    /**
     * Listen for message delivery and read receipts
     */
    const onReceipt = (handler) => {
        const listener = async (receipts) => {
            if (!receipts || !receipts.length)
                return;
            for (const r of receipts) {
                const chat = r.key?.remoteJid || '';
                const rawUser = r.receipt?.userJid;
                const userJid = rawUser ? lidCache.resolveToPN(rawUser) : undefined;
                const userNumber = userJid ? lidCache.extractDigits(userJid) : undefined;
                const status = r.receipt?.readTimestamp ? 'read' : (r.receipt?.playedTimestamp ? 'played' : 'delivered');
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
                    });
                }
                catch (err) {
                    sock.logger?.error({ err, key: r.key }, 'error in onReceipt handler');
                }
            }
        };
        sock.ev.on('message-receipt.update', listener);
        return () => sock.ev.off('message-receipt.update', listener);
    };
    /**
     * Listen for incoming and updated WhatsApp calls (with reject shortcut)
     */
    const onCall = (handler) => {
        const listener = async (calls) => {
            if (!calls || !calls.length)
                return;
            for (const call of calls) {
                const fromPn = lidCache.resolveToPN(call.from || '');
                const fromNumber = lidCache.extractDigits(fromPn);
                const callEvent = {
                    ...call,
                    fromNumber,
                    reject: async () => {
                        if (typeof sock.rejectCall === 'function') {
                            return sock.rejectCall(call.id, call.from);
                        }
                    }
                };
                try {
                    await handler(callEvent);
                }
                catch (err) {
                    sock.logger?.error({ err, callId: call.id }, 'error in onCall handler');
                }
            }
        };
        sock.ev.on('call', listener);
        return () => sock.ev.off('call', listener);
    };
    /**
     * Listen for contact blocklist changes
     */
    const onBlockUpdate = (handler) => {
        const listener = async (update) => {
            try {
                await handler(update);
            }
            catch (err) {
                sock.logger?.error({ err }, 'error in onBlockUpdate handler');
            }
        };
        sock.ev.on('blocklist.update', listener);
        return () => sock.ev.off('blocklist.update', listener);
    };
    /**
     * Listen for group join approval requests
     */
    const onJoinRequest = (handler) => {
        const listener = async (req) => {
            const authorPn = lidCache.resolveToPN(req.authorPn || req.author || '');
            const participantPn = lidCache.resolveToPN(req.participantPn || req.participant || '');
            const eventObj = {
                id: req.id,
                groupJid: req.id,
                author: authorPn,
                authorNumber: lidCache.extractDigits(authorPn),
                participant: participantPn,
                participantNumber: lidCache.extractDigits(participantPn),
                action: req.action,
                method: req.method,
                approve: async () => {
                    if (typeof sock.groupRequestParticipantsUpdate === 'function') {
                        return sock.groupRequestParticipantsUpdate(req.id, [req.participant], 'approve');
                    }
                },
                reject: async () => {
                    if (typeof sock.groupRequestParticipantsUpdate === 'function') {
                        return sock.groupRequestParticipantsUpdate(req.id, [req.participant], 'reject');
                    }
                }
            };
            try {
                await handler(eventObj);
            }
            catch (err) {
                sock.logger?.error({ err, id: req.id }, 'error in onJoinRequest handler');
            }
        };
        sock.ev.on('group.join-request', listener);
        return () => sock.ev.off('group.join-request', listener);
    };
    /**
     * Listen for poll votes / updates
     */
    const onPollUpdate = (handler) => {
        const listener = async ({ messages }) => {
            for (const rawMsg of messages || []) {
                const pollUpdate = rawMsg.message?.pollUpdateMessage;
                if (pollUpdate && pollUpdate.pollCreationMessageKey) {
                    const chat = rawMsg.key?.remoteJid || '';
                    const rawVoter = rawMsg.key?.participant || chat;
                    const voter = lidCache.resolveToPN(rawVoter);
                    const voterNumber = lidCache.extractDigits(voter || rawVoter);
                    const voterLid = isLidUser(rawVoter) ? rawVoter : lidCache.getLID(voter);
                    const timestamp = typeof pollUpdate.senderTimestampMs === 'number'
                        ? pollUpdate.senderTimestampMs
                        : pollUpdate.senderTimestampMs?.toNumber?.() || Date.now();
                    const pollEvent = {
                        key: rawMsg.key,
                        pollKey: pollUpdate.pollCreationMessageKey,
                        chat,
                        voter,
                        voterNumber,
                        voterLid,
                        timestamp,
                        raw: pollUpdate
                    };
                    try {
                        await handler(pollEvent);
                    }
                    catch (err) {
                        sock.logger?.error({ err, pollKey: pollUpdate.pollCreationMessageKey }, 'error in onPollUpdate handler');
                    }
                }
            }
        };
        sock.ev.on('messages.upsert', listener);
        return () => sock.ev.off('messages.upsert', listener);
    };
    /**
     * Download view-once media directly as Buffer from a message or message key
     */
    const downloadViewOnce = async (msgOrKey) => {
        if (msgOrKey && typeof msgOrKey.downloadViewOnce === 'function') {
            return msgOrKey.downloadViewOnce();
        }
        let targetMsg = msgOrKey;
        if (msgOrKey?.id && !msgOrKey.message) {
            targetMsg = messageDatabase.get(msgOrKey);
        }
        if (!targetMsg)
            throw new Error('Message not found for downloadViewOnce');
        const serialized = serializeMessage(targetMsg, finalSock);
        return serialized.downloadViewOnce();
    };
    // Record outbound messages in healthTracker & throttle through AntiBanEngine
    const originalSendMessage = sock.sendMessage.bind(sock);
    sock.sendMessage = async (jid, content, options) => {
        return antiBanEngine.schedule(async () => {
            healthTracker.recordMessageSent();
            return originalSendMessage(jid, content, options);
        }, { chat: jid, sock, skipDelay: options?.skipAntiBan });
    };
    /**
     * Enable or disable simulated typing mode dynamically
     */
    const autoTyping = (enabled) => {
        if (typeof enabled === 'boolean') {
            newConfig.autoTyping = enabled;
            if (antiBanEngine && typeof antiBanEngine.updateConfig === 'function') {
                antiBanEngine.updateConfig({ simulatePresence: enabled });
            }
        }
        return !!newConfig.autoTyping;
    };
    /**
     * Dynamically control presence / bot behavior in WhatsApp
     * @param behavior 'online' | 'offline' | 'typing' | 'recording' | 'paused'
     * @param targetJid Optional target chat JID
     */
    const behaviorUpdate = async (behavior, targetJid) => {
        const b = behavior.toLowerCase();
        if (b === 'online' || b === 'available') {
            return sock.sendPresenceUpdate('available');
        }
        if (b === 'offline' || b === 'unavailable') {
            return sock.sendPresenceUpdate('unavailable');
        }
        if (b === 'typing' || b === 'composing') {
            return sock.sendPresenceUpdate('composing', targetJid);
        }
        if (b === 'recording') {
            return sock.sendPresenceUpdate('recording', targetJid);
        }
        if (b === 'paused' || b === 'stop') {
            return sock.sendPresenceUpdate('paused', targetJid);
        }
        return sock.sendPresenceUpdate(behavior, targetJid);
    };
    /**
     * Profile utilities namespace to manage names, bios, profile pictures, and business details
     */
    const profileUtils = (targetJid) => {
        const meId = sock.authState.creds.me?.id;
        const jid = targetJid || meId || '';
        return {
            target: jid,
            setName: async (name) => {
                return sock.updateProfileName(name);
            },
            setAbout: async (status) => {
                return sock.updateProfileStatus(status);
            },
            setStatus: async (status) => {
                return sock.updateProfileStatus(status);
            },
            setPicture: async (content, customJid) => {
                return sock.updateProfilePicture(customJid || jid, content);
            },
            removePicture: async (customJid) => {
                return sock.removeProfilePicture(customJid || jid);
            },
            getPicture: async (type = 'image', customJid) => {
                return sock.profilePictureUrl(customJid || jid, type);
            },
            getStatus: async (customJid) => {
                return sock.fetchStatus(customJid || jid);
            },
            getBusinessProfile: async (customJid) => {
                return sock.getBusinessProfile(customJid || jid);
            },
            block: async (contactJid) => {
                return sock.updateBlockStatus(contactJid || jid, 'block');
            },
            unblock: async (contactJid) => {
                return sock.updateBlockStatus(contactJid || jid, 'unblock');
            }
        };
    };
    /**
     * Comprehensive group utilities namespace to manage group subjects, descriptions,
     * pictures, invite codes, participant management, and group settings.
     */
    const groupUtils = (groupJid) => {
        const targetJid = groupJid || '';
        return {
            target: targetJid,
            getMetadata: async (customJid) => {
                return sock.groupMetadata(customJid || targetJid);
            },
            getMembers: async (customJid) => {
                const meta = await sock.groupMetadata(customJid || targetJid);
                return meta?.participants || [];
            },
            getAdmins: async (customJid) => {
                const meta = await sock.groupMetadata(customJid || targetJid);
                return (meta?.participants || []).filter((p) => p.admin === 'admin' || p.admin === 'superadmin');
            },
            setName: async (name, customJid) => {
                return sock.groupUpdateSubject(customJid || targetJid, name);
            },
            setDescription: async (desc, customJid) => {
                return sock.groupUpdateDescription(customJid || targetJid, desc);
            },
            setPicture: async (content, customJid) => {
                return sock.updateProfilePicture(customJid || targetJid, content);
            },
            removePicture: async (customJid) => {
                return sock.removeProfilePicture(customJid || targetJid);
            },
            getPicture: async (type = 'image', customJid) => {
                return sock.profilePictureUrl(customJid || targetJid, type);
            },
            getInviteCode: async (customJid) => {
                return sock.groupInviteCode(customJid || targetJid);
            },
            getInviteUrl: async (customJid) => {
                const code = await sock.groupInviteCode(customJid || targetJid);
                return `https://chat.whatsapp.com/${code}`;
            },
            revokeInviteCode: async (customJid) => {
                return sock.groupRevokeInvite(customJid || targetJid);
            },
            add: async (participants, customJid) => {
                const list = Array.isArray(participants) ? participants : [participants];
                return sock.groupParticipantsUpdate(customJid || targetJid, list, 'add');
            },
            kick: async (participants, customJid) => {
                const list = Array.isArray(participants) ? participants : [participants];
                return sock.groupParticipantsUpdate(customJid || targetJid, list, 'remove');
            },
            promote: async (participants, customJid) => {
                const list = Array.isArray(participants) ? participants : [participants];
                return sock.groupParticipantsUpdate(customJid || targetJid, list, 'promote');
            },
            demote: async (participants, customJid) => {
                const list = Array.isArray(participants) ? participants : [participants];
                return sock.groupParticipantsUpdate(customJid || targetJid, list, 'demote');
            },
            lock: async (locked = true, customJid) => {
                return sock.groupSettingUpdate(customJid || targetJid, locked ? 'locked' : 'unlocked');
            },
            announce: async (announcement = true, customJid) => {
                return sock.groupSettingUpdate(customJid || targetJid, announcement ? 'announcement' : 'not_announcement');
            },
            setEphemeral: async (durationSeconds, customJid) => {
                return sock.groupToggleEphemeral(customJid || targetJid, durationSeconds);
            },
            setMemberAddMode: async (mode, customJid) => {
                return sock.groupMemberAddMode(customJid || targetJid, mode);
            },
            setJoinApprovalMode: async (mode, customJid) => {
                return sock.groupJoinApprovalMode(customJid || targetJid, mode);
            },
            leave: async (customJid) => {
                return sock.groupLeave(customJid || targetJid);
            },
            create: async (subject, participants) => {
                return sock.groupCreate(subject, participants);
            },
            acceptInvite: async (code) => {
                return sock.groupAcceptInvite(code);
            },
            getInviteInfo: async (code) => {
                return sock.groupGetInviteInfo(code);
            },
            fetchAll: async () => {
                return sock.groupFetchAllParticipating();
            }
        };
    };
    let sockRef = null;
    /**
     * Generates a valid standard vCard 3.0 string
     */
    const createVCard = (info) => {
        const cleanNumber = (info.number || '').replace(/\D/g, '');
        return [
            'BEGIN:VCARD',
            'VERSION:3.0',
            `FN:${info.fullName}`,
            `ORG:${info.org || ''};`,
            `TEL;type=CELL;type=VOICE;waid=${cleanNumber}:+${cleanNumber}`,
            'END:VCARD'
        ].join('\n');
    };
    /**
     * Helper to send single or multiple vCard contacts directly
     */
    const sendContact = async (targetJid, contact, options = {}) => {
        const contactsList = Array.isArray(contact) ? contact : [contact];
        const vcards = contactsList.map(c => ({ vcard: createVCard(c) }));
        const first = contactsList[0];
        const displayName = contactsList.length === 1 ? (first ? first.fullName : 'Contact') : `${contactsList.length} Contacts`;
        const sendFn = sockRef?.sendMessage || sock.sendMessage;
        return sendFn(targetJid, {
            contacts: {
                displayName,
                contacts: vcards
            }
        }, options);
    };
    /**
     * Extract group participants into a downloadable VCF buffer and contact list
     */
    const exportGroupContactsVCF = async (groupId, baseName = 'User') => {
        const getMetaFn = sockRef?.groupMetadata || sock.groupMetadata;
        const meta = await getMetaFn(groupId);
        const participants = meta?.participants || [];
        const userRawId = sock.user?.id || '';
        const botPart = userRawId.split(':')[0] || '';
        const botNumber = botPart.replace(/\D/g, '');
        let vcards = '';
        let count = 0;
        const contactsList = [];
        for (const p of participants) {
            const idStr = p.id || '';
            const atSplit = idStr.split('@')[0] || '';
            const num = (atSplit.split(':')[0] || '').replace(/\D/g, '');
            if (!num || num === botNumber)
                continue;
            count++;
            const contactName = `${baseName} ${count}`;
            const vcard = createVCard({ fullName: contactName, number: num, org: meta?.subject || 'Group Contact' });
            vcards += vcard + '\n';
            contactsList.push({ vcard });
        }
        return {
            count,
            groupSubject: meta?.subject || '',
            vcfBuffer: Buffer.from(vcards, 'utf8'),
            fileName: `${baseName}_${count}_Contacts.vcf`,
            contactsList
        };
    };
    /**
     * Comprehensive contact utilities namespace for managing WhatsApp Cloud contacts,
     * vCard generation, and group contact extractions.
     */
    const contactUtils = (contactJid) => {
        const targetJid = contactJid || '';
        return {
            target: targetJid,
            save: async (nameOrAction, customJid) => {
                return sock.saveContact(customJid || targetJid, nameOrAction);
            },
            edit: async (nameOrAction, customJid) => {
                return sock.editContact(customJid || targetJid, nameOrAction);
            },
            delete: async (customJid) => {
                return sock.deleteContact(customJid || targetJid);
            },
            createVCard,
            send: async (contact, options, customJid) => {
                return sendContact(customJid || targetJid, contact, options);
            },
            exportGroupVCF: async (groupId, baseName) => {
                return exportGroupContactsVCF(groupId || targetJid, baseName);
            }
        };
    };
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
        checkRateLimit: (key, customConfig, consume = false) => consume ? rateLimiter.consume(key, customConfig) : rateLimiter.check(key, customConfig),
        resetRateLimit: (key) => rateLimiter.reset(key),
        blockUser: (key, durationMs) => rateLimiter.block(key, durationMs),
        // Message Database API
        messageStore: messageDatabase,
        getMessageFromStore: (idOrKey) => messageDatabase.get(idOrKey),
        getDeletedMessage: (revokeKey) => messageDatabase.findDeleted(revokeKey),
        // Session Health & Realtime State API
        getSessionHealth: () => healthTracker.checkHealth(),
        get sessionState() {
            return healthTracker.getState();
        },
        onSessionStateUpdate: (listener) => {
            return healthTracker.onStateUpdate(listener);
        },
        // Presence & Behavior API
        behaviorUpdate,
        // Phone Inspector API
        inspectPhone: (target, options) => inspectPhoneNumber(sock, target, options),
        inspectPhoneNumber: (target, options) => inspectPhoneNumber(sock, target, options),
        // Management Utility Namespaces
        profileUtils,
        groupUtils,
        // Contact Management & VCF API
        saveContact: sock.saveContact,
        editContact: sock.editContact,
        deleteContact: sock.deleteContact,
        createVCard,
        sendContact,
        exportGroupContactsVCF,
        contactUtils,
        contact: contactUtils()
    };
    sockRef = finalSock;
    return finalSock;
};
export default makeWASocket;
//# sourceMappingURL=index.js.map