import type { proto } from '../../WAProto/index.js';
import type { AnyMessageContent, ButtonMessageContent, MiscMessageGenerationOptions, PollMessageOptions, WAMessage, AlbumMediaItem } from '../Types/index.js';
import type { PhoneInspectionResult } from './phone-inspector.js';
import type { ListMenuContent } from './interactive.js';
import type { StoredMessageRecord } from './message-database.js';
import type { SessionHealthReport } from './session-health.js';
export type ViewOnceMediaType = 'image' | 'video' | 'audio' | 'document';
export interface ViewOnceInfo {
    isViewOnce: boolean;
    type?: ViewOnceMediaType;
    message?: proto.IMessage;
    caption?: string;
    isQuoted?: boolean;
}
export interface SerializedQuoted {
    key: proto.IMessageKey;
    message?: proto.IMessage | null;
    type?: string;
    text: string;
    sender: string;
    senderNumber: string;
    senderLid?: string;
    isFromMe: boolean;
    fromMe: boolean;
    isViewOnce?: boolean;
    viewOnceType?: ViewOnceMediaType;
    getViewOnce?: () => ViewOnceInfo;
    downloadViewOnce?: () => Promise<Buffer>;
    download: () => Promise<Buffer>;
    reply: (content: string | AnyMessageContent, options?: MiscMessageGenerationOptions) => Promise<proto.WebMessageInfo | undefined>;
    replyButton: (content: ButtonMessageContent, options?: MiscMessageGenerationOptions) => Promise<proto.WebMessageInfo | undefined>;
    replyListMenu?: (content: ListMenuContent, options?: MiscMessageGenerationOptions) => Promise<proto.WebMessageInfo | undefined>;
}
export interface SerializedMessage extends WAMessage {
    id: string;
    chat: string;
    sender: string;
    senderNumber: string;
    senderLid?: string;
    isGroup: boolean;
    fromMe: boolean;
    pushName: string;
    type?: string;
    text: string;
    body: string;
    isViewOnce: boolean;
    viewOnceType?: ViewOnceMediaType;
    mentionedJid: string[];
    mentions: string[];
    selectedButtonId?: string;
    selectedButtonText?: string;
    isRevoke?: boolean;
    revokedMessageKey?: proto.IMessageKey;
    deletedMessage?: StoredMessageRecord;
    quoted?: SerializedQuoted;
    ctx?: any;
    isOwner: (ownerList: string | string[]) => boolean;
    getRevokedMessage: () => StoredMessageRecord | undefined;
    getSessionHealth: () => Promise<SessionHealthReport | undefined>;
    getViewOnce: () => ViewOnceInfo;
    downloadViewOnce: () => Promise<Buffer>;
    reply: (content: string | AnyMessageContent, options?: MiscMessageGenerationOptions & {
        typing?: boolean;
    }) => Promise<proto.WebMessageInfo | undefined>;
    react: (emoji: string) => Promise<proto.WebMessageInfo | undefined>;
    download: () => Promise<Buffer>;
    sendTyping: (durationMs?: number) => Promise<void>;
    sendButton: (content: ButtonMessageContent, options?: MiscMessageGenerationOptions) => Promise<proto.WebMessageInfo | undefined>;
    replyButton: (content: ButtonMessageContent, options?: MiscMessageGenerationOptions & {
        typing?: boolean;
    }) => Promise<proto.WebMessageInfo | undefined>;
    sendListMenu: (content: ListMenuContent, options?: MiscMessageGenerationOptions) => Promise<proto.WebMessageInfo | undefined>;
    replyListMenu: (content: ListMenuContent, options?: MiscMessageGenerationOptions) => Promise<proto.WebMessageInfo | undefined>;
    tag: (targets: string | string[], text: string, options?: {
        hidden?: boolean;
        quoted?: boolean;
    }) => Promise<proto.WebMessageInfo | undefined>;
    tagAll: (text?: string, options?: {
        hidden?: boolean;
        quoted?: boolean;
    }) => Promise<proto.WebMessageInfo | undefined>;
    hidetag: (text: string, options?: {
        quoted?: boolean;
    }) => Promise<proto.WebMessageInfo | undefined>;
    behavior: (behavior: 'online' | 'offline' | 'available' | 'unavailable' | 'typing' | 'composing' | 'recording' | 'paused' | 'stop', targetJid?: string) => Promise<any>;
    profileUtils: (targetJid?: string) => any;
    groupUtils: (groupJid?: string) => any;
    getGroupMembers: (customJid?: string) => Promise<any[]>;
    getGroupAdmins: (customJid?: string) => Promise<any[]>;
    kick: (participants: string | string[], customJid?: string) => Promise<any>;
    add: (participants: string | string[], customJid?: string) => Promise<any>;
    promote: (participants: string | string[], customJid?: string) => Promise<any>;
    demote: (participants: string | string[], customJid?: string) => Promise<any>;
    leaveGroup: (customJid?: string) => Promise<any>;
    getInviteCode: (customJid?: string) => Promise<string>;
    getInviteUrl: (customJid?: string) => Promise<string>;
    revokeInviteCode: (customJid?: string) => Promise<any>;
    setGroupName: (name: string, customJid?: string) => Promise<any>;
    setGroupDescription: (desc: string, customJid?: string) => Promise<any>;
    setGroupPicture: (content: any, customJid?: string) => Promise<any>;
    removeGroupPicture: (customJid?: string) => Promise<any>;
    edit: (newContent: string | AnyMessageContent, targetKey?: proto.IMessageKey) => Promise<proto.WebMessageInfo | undefined>;
    delete: (forEveryone?: boolean, targetKey?: proto.IMessageKey) => Promise<any>;
    deleteForMe: (targetKey?: proto.IMessageKey) => Promise<any>;
    deleteForEveryone: (targetKey?: proto.IMessageKey) => Promise<any>;
    isAdmin: (userJid?: string) => Promise<boolean>;
    isSenderAdmin: () => Promise<boolean>;
    isBotAdmin: () => Promise<boolean>;
    inspectPhone: <T extends keyof PhoneInspectionResult | 'all' = 'all'>(targetNumber?: string, field?: T) => Promise<T extends keyof PhoneInspectionResult ? PhoneInspectionResult[T] : PhoneInspectionResult>;
    postGroupStory: (content: AnyMessageContent | string) => Promise<proto.WebMessageInfo | undefined>;
    broadcastStory: (content: AnyMessageContent | string, additionalJids?: string[]) => Promise<proto.WebMessageInfo | undefined>;
    pin: (durationSeconds?: number, targetKey?: proto.IMessageKey) => Promise<proto.WebMessageInfo | undefined>;
    unpin: (targetKey?: proto.IMessageKey) => Promise<proto.WebMessageInfo | undefined>;
    forward: (targetJid: string, options?: MiscMessageGenerationOptions) => Promise<proto.WebMessageInfo | undefined>;
    copy: (targetJid?: string, options?: MiscMessageGenerationOptions) => Promise<proto.WebMessageInfo | undefined>;
    sendPoll: (pollOrName: PollMessageOptions | string, values?: string[], selectableCountOrOptions?: number | MiscMessageGenerationOptions, options?: MiscMessageGenerationOptions) => Promise<proto.WebMessageInfo | undefined>;
    replyPoll: (pollOrName: PollMessageOptions | string, values?: string[], selectableCountOrOptions?: number | MiscMessageGenerationOptions, options?: MiscMessageGenerationOptions) => Promise<proto.WebMessageInfo | undefined>;
    sendContact: (name: string, number: string) => Promise<proto.WebMessageInfo | undefined>;
    sendAlbum: (medias: AlbumMediaItem[], options?: MiscMessageGenerationOptions & {
        caption?: string;
        delayMs?: number;
    }) => Promise<proto.WebMessageInfo | undefined>;
    replyAlbum: (medias: AlbumMediaItem[], options?: MiscMessageGenerationOptions & {
        caption?: string;
        delayMs?: number;
    }) => Promise<proto.WebMessageInfo | undefined>;
}
/**
 * Unwrap nested / wrapper messages such as ephemeral, view once, etc.
 */
export declare const unwrapMessage: (message?: proto.IMessage | null) => proto.IMessage | undefined;
/**
 * Check if a message structure contains a View-Once wrapper or flag (v1, v2, v2Extension, v3)
 */
export declare const isViewOnceMessage: (message?: proto.IMessage | null) => boolean;
/**
 * Extract inner message from View-Once wrapper
 */
export declare const extractViewOnceMessage: (message?: proto.IMessage | null) => proto.IMessage | undefined;
/**
 * Identify the media type of a View-Once message
 */
export declare const getViewOnceType: (message?: proto.IMessage | null) => ViewOnceMediaType | undefined;
/**
 * Extract clean text or caption from any message payload
 */
export declare const extractMessageText: (message?: proto.IMessage | null) => string;
/**
 * Extract button response metadata (id and display text) from response messages
 */
export declare const extractButtonResponse: (message?: proto.IMessage | null) => {
    id?: string;
    text?: string;
};
/**
 * Determine the primary message type name
 */
export declare const getMessageType: (message?: proto.IMessage | null) => string | undefined;
/**
 * Download media from message or quoted message as Buffer
 */
export declare const downloadMedia: (message?: proto.IMessage | null) => Promise<Buffer>;
/**
 * Transparently serialize a raw Baileys WAMessage into a developer-friendly SerializedMessage.
 * Resolves all group participant LIDs to real phone numbers in the background.
 */
export declare const serializeMessage: (msg: WAMessage, sock: any) => SerializedMessage;
//# sourceMappingURL=serialize.d.ts.map