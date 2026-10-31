import type { UserFacingSocketConfig, ReactionUpdateEvent, EditMessageEvent, DeleteMessageEvent, GroupUpdateEvent, GroupParticipantUpdateEvent, ChatUpdateEvent, PresenceUpdateEvent, ReceiptUpdateEvent, CallUpdateEvent, BlocklistUpdateEvent, GroupJoinRequestEvent, PollVoteEvent } from '../Types/index.js';
import { type SerializedMessage } from '../Utils/serialize.js';
import { type RealtimeSessionState } from '../Utils/session-health.js';
import { MessageDatabase } from '../Utils/message-database.js';
import { type MessageContext, type ContextOptions } from '../Utils/context.js';
import { RateLimiter, AntiBanEngine, type RateLimitConfig, type AntiBanConfig } from '../Utils/rate-limiter.js';
import { type InspectPhoneOptions } from '../Utils/phone-inspector.js';
import type { proto } from '../../WAProto/index.js';
declare const makeWASocket: (config: UserFacingSocketConfig) => {
    config: {
        browser: [string, string, string];
        logger: import("../Utils/logger.js").ILogger;
        version: import("../index.js").WAVersion;
        auth: import("../index.js").AuthenticationState;
        agent?: import("node:https").Agent;
        pushName?: string;
        options: RequestInit;
        customUploadHosts: import("../index.js").MediaConnInfo["hosts"];
        fetchAgent?: import("node:https").Agent;
        mediaCache?: import("../index.js").CacheStore;
        waWebSocketUrl: string | import("node:url").URL;
        connectTimeoutMs: number;
        defaultQueryTimeoutMs: number | undefined;
        keepAliveIntervalMs: number;
        mobile?: boolean;
        printQRInTerminal?: boolean;
        emitOwnEvents: boolean;
        retryRequestDelayMs: number;
        maxMsgRetryCount: number;
        qrTimeout?: number;
        shouldSyncHistoryMessage: (msg: proto.Message.IHistorySyncNotification) => boolean;
        transactionOpts: import("../index.js").TransactionCapabilityOptions;
        markOnlineOnConnect: boolean;
        countryCode: string;
        msgRetryCounterCache?: import("../index.js").CacheStore;
        userDevicesCache?: import("../index.js").PossiblyExtendedCacheStore;
        callOfferCache?: import("../index.js").CacheStore;
        placeholderResendCache?: import("../index.js").CacheStore;
        linkPreviewImageThumbnailWidth: number;
        syncFullHistory: boolean;
        fireInitQueries: boolean;
        generateHighQualityLinkPreview: boolean;
        enableAutoSessionRecreation: boolean;
        enableRecentMessageCache: boolean;
        defaultPairingCode?: string;
        phoneNumber?: string;
        promptPhoneNumber?: boolean;
        autoTyping?: boolean;
        shouldIgnoreJid: (jid: string) => boolean | undefined;
        patchMessageBeforeSending: (msg: proto.IMessage, recipientJids?: string[]) => Promise<import("../index.js").PatchedMessageWithRecipientJID[] | import("../index.js").PatchedMessageWithRecipientJID> | import("../index.js").PatchedMessageWithRecipientJID[] | import("../index.js").PatchedMessageWithRecipientJID;
        appStateMacVerification: {
            patch: boolean;
            snapshot: boolean;
        };
        getMessage: (key: import("../index.js").WAMessageKey) => Promise<proto.IMessage | undefined>;
        cachedGroupMetadata: (jid: string) => Promise<import("../index.js").GroupMetadata | undefined>;
        makeSignalRepository: (auth: import("../index.js").SignalAuthState, logger: import("../Utils/logger.js").ILogger, pnToLIDFunc?: (jids: string[]) => Promise<import("../index.js").LIDMapping[] | undefined>) => import("../index.js").SignalRepositoryWithLIDStore;
        dynamicLogger?: boolean;
        saveIncomingMessages?: "all" | "group" | "direct" | "none" | boolean;
        messageStoreMaxAgeMs?: number;
        messageStorePath?: string;
        antiBan?: AntiBanConfig;
        rateLimit?: RateLimitConfig & {
            notifyOnLimit?: boolean | string | ((ctx: any, remainingMs: number) => any);
        };
    };
    onMessage: (handler: (ctx: MessageContext, msg: SerializedMessage) => Promise<void> | void) => () => void;
    onCommand: (command: string | string[] | RegExp, handler: (ctx: MessageContext) => Promise<void> | void) => () => void;
    createContext: (msg: any, options?: ContextOptions) => MessageContext;
    onReaction: (handler: (reaction: ReactionUpdateEvent) => Promise<void> | void) => () => void;
    onEdit: (handler: (edit: EditMessageEvent) => Promise<void> | void) => () => void;
    onDelete: (handler: (del: DeleteMessageEvent) => Promise<void> | void) => () => void;
    onGroupUpdate: (handler: (update: GroupUpdateEvent) => Promise<void> | void) => () => void;
    onParticipantUpdate: (handler: (update: GroupParticipantUpdateEvent) => Promise<void> | void) => () => void;
    onChatUpdate: (handler: (chat: ChatUpdateEvent) => Promise<void> | void) => () => void;
    onPresence: (handler: (presence: PresenceUpdateEvent) => Promise<void> | void) => () => void;
    onReceipt: (handler: (receipt: ReceiptUpdateEvent) => Promise<void> | void) => () => void;
    onCall: (handler: (call: CallUpdateEvent) => Promise<void> | void) => () => void;
    onBlockUpdate: (handler: (block: BlocklistUpdateEvent) => Promise<void> | void) => () => void;
    onJoinRequest: (handler: (req: GroupJoinRequestEvent) => Promise<void> | void) => () => void;
    onPollUpdate: (handler: (event: PollVoteEvent) => Promise<void> | void) => () => void;
    downloadViewOnce: (msgOrKey: any) => Promise<Buffer>;
    autoTyping: (enabled?: boolean) => boolean;
    antiBan: AntiBanEngine;
    rateLimiter: RateLimiter;
    checkRateLimit: (key: string, customConfig?: RateLimitConfig, consume?: boolean) => import("../index.js").RateLimitCheckResult;
    resetRateLimit: (key: string) => void;
    blockUser: (key: string, durationMs?: number) => void;
    messageStore: MessageDatabase;
    getMessageFromStore: (idOrKey: string | proto.IMessageKey) => import("../index.js").StoredMessageRecord | undefined;
    getDeletedMessage: (revokeKey: proto.IMessageKey) => import("../index.js").StoredMessageRecord | undefined;
    getSessionHealth: () => Promise<import("../index.js").SessionHealthReport>;
    sessionState: RealtimeSessionState;
    onSessionStateUpdate: (listener: (state: RealtimeSessionState) => void) => () => void;
    behaviorUpdate: (behavior: "online" | "offline" | "available" | "unavailable" | "typing" | "composing" | "recording" | "paused" | "stop", targetJid?: string) => Promise<any>;
    inspectPhone: (target: string, options?: InspectPhoneOptions) => Promise<import("../index.js").PhoneInspectionResult>;
    inspectPhoneNumber: (target: string, options?: InspectPhoneOptions) => Promise<import("../index.js").PhoneInspectionResult>;
    profileUtils: (targetJid?: string) => {
        target: string;
        setName: (name: string) => Promise<any>;
        setAbout: (status: string) => Promise<any>;
        setStatus: (status: string) => Promise<any>;
        setPicture: (content: any, customJid?: string) => Promise<any>;
        removePicture: (customJid?: string) => Promise<any>;
        getPicture: (type?: "image" | "preview", customJid?: string) => Promise<any>;
        getStatus: (customJid?: string) => Promise<any>;
        getBusinessProfile: (customJid?: string) => Promise<any>;
        block: (contactJid?: string) => Promise<any>;
        unblock: (contactJid?: string) => Promise<any>;
    };
    groupUtils: (groupJid?: string) => {
        target: string;
        getMetadata: (customJid?: string) => Promise<any>;
        getMembers: (customJid?: string) => Promise<any>;
        getAdmins: (customJid?: string) => Promise<any>;
        setName: (name: string, customJid?: string) => Promise<any>;
        setDescription: (desc: string, customJid?: string) => Promise<any>;
        setPicture: (content: any, customJid?: string) => Promise<any>;
        removePicture: (customJid?: string) => Promise<any>;
        getPicture: (type?: "image" | "preview", customJid?: string) => Promise<any>;
        getInviteCode: (customJid?: string) => Promise<any>;
        getInviteUrl: (customJid?: string) => Promise<string>;
        revokeInviteCode: (customJid?: string) => Promise<any>;
        add: (participants: string | string[], customJid?: string) => Promise<any>;
        kick: (participants: string | string[], customJid?: string) => Promise<any>;
        promote: (participants: string | string[], customJid?: string) => Promise<any>;
        demote: (participants: string | string[], customJid?: string) => Promise<any>;
        lock: (locked?: boolean, customJid?: string) => Promise<any>;
        announce: (announcement?: boolean, customJid?: string) => Promise<any>;
        setEphemeral: (durationSeconds: number, customJid?: string) => Promise<any>;
        setMemberAddMode: (mode: "admin_add" | "all_member_add", customJid?: string) => Promise<any>;
        setJoinApprovalMode: (mode: "on" | "off", customJid?: string) => Promise<any>;
        leave: (customJid?: string) => Promise<any>;
        create: (subject: string, participants: string[]) => Promise<any>;
        acceptInvite: (code: string) => Promise<any>;
        getInviteInfo: (code: string) => Promise<any>;
        fetchAll: () => Promise<any>;
    };
    saveContact: any;
    editContact: any;
    deleteContact: any;
    createVCard: (info: {
        fullName: string;
        number: string;
        org?: string;
    }) => string;
    sendContact: (targetJid: string, contact: {
        fullName: string;
        number: string;
        org?: string;
    } | Array<{
        fullName: string;
        number: string;
        org?: string;
    }>, options?: any) => Promise<any>;
    exportGroupContactsVCF: (groupId: string, baseName?: string) => Promise<{
        count: number;
        groupSubject: any;
        vcfBuffer: Buffer<ArrayBuffer>;
        fileName: string;
        contactsList: {
            vcard: string;
        }[];
    }>;
    contactUtils: (contactJid?: string) => {
        target: string;
        save: (nameOrAction: string | proto.SyncActionValue.IContactAction, customJid?: string) => Promise<any>;
        edit: (nameOrAction: string | proto.SyncActionValue.IContactAction, customJid?: string) => Promise<any>;
        delete: (customJid?: string) => Promise<any>;
        createVCard: (info: {
            fullName: string;
            number: string;
            org?: string;
        }) => string;
        send: (contact: any, options?: any, customJid?: string) => Promise<any>;
        exportGroupVCF: (groupId?: string, baseName?: string) => Promise<{
            count: number;
            groupSubject: any;
            vcfBuffer: Buffer<ArrayBuffer>;
            fileName: string;
            contactsList: {
                vcard: string;
            }[];
        }>;
    };
    contact: {
        target: string;
        save: (nameOrAction: string | proto.SyncActionValue.IContactAction, customJid?: string) => Promise<any>;
        edit: (nameOrAction: string | proto.SyncActionValue.IContactAction, customJid?: string) => Promise<any>;
        delete: (customJid?: string) => Promise<any>;
        createVCard: (info: {
            fullName: string;
            number: string;
            org?: string;
        }) => string;
        send: (contact: any, options?: any, customJid?: string) => Promise<any>;
        exportGroupVCF: (groupId?: string, baseName?: string) => Promise<{
            count: number;
            groupSubject: any;
            vcfBuffer: Buffer<ArrayBuffer>;
            fileName: string;
            contactsList: {
                vcard: string;
            }[];
        }>;
    };
    communityMetadata: (jid: string) => Promise<import("../index.js").GroupMetadata>;
    communityCreate: (subject: string, body: string) => Promise<import("../index.js").GroupMetadata | null>;
    communityCreateGroup: (subject: string, participants: string[], parentCommunityJid: string) => Promise<import("../index.js").GroupMetadata | null>;
    communityLeave: (id: string) => Promise<void>;
    communityUpdateSubject: (jid: string, subject: string) => Promise<void>;
    communityLinkGroup: (groupJid: string, parentCommunityJid: string) => Promise<void>;
    communityUnlinkGroup: (groupJid: string, parentCommunityJid: string) => Promise<void>;
    communityFetchLinkedGroups: (jid: string) => Promise<{
        communityJid: string;
        isCommunity: boolean;
        linkedGroups: {
            id: string | undefined;
            subject: string;
            creation: number | undefined;
            owner: string | undefined;
            size: number | undefined;
        }[];
    }>;
    communityRequestParticipantsList: (jid: string) => Promise<{
        [key: string]: string;
    }[]>;
    communityRequestParticipantsUpdate: (jid: string, participants: string[], action: "approve" | "reject") => Promise<{
        status: string;
        jid: string | undefined;
    }[]>;
    communityParticipantsUpdate: (jid: string, participants: string[], action: import("../index.js").ParticipantAction) => Promise<{
        status: string;
        jid: string | undefined;
        content: import("../index.js").BinaryNode;
    }[]>;
    communityUpdateDescription: (jid: string, description?: string) => Promise<void>;
    communityInviteCode: (jid: string) => Promise<string | undefined>;
    communityRevokeInvite: (jid: string) => Promise<string | undefined>;
    communityAcceptInvite: (code: string) => Promise<string | undefined>;
    communityRevokeInviteV4: (communityJid: string, invitedJid: string) => Promise<boolean>;
    communityAcceptInviteV4: (key: string | import("../index.js").WAMessageKey, inviteMessage: proto.Message.IGroupInviteMessage) => Promise<any>;
    communityGetInviteInfo: (code: string) => Promise<import("../index.js").GroupMetadata>;
    communityToggleEphemeral: (jid: string, ephemeralExpiration: number) => Promise<void>;
    communitySettingUpdate: (jid: string, setting: "announcement" | "not_announcement" | "locked" | "unlocked") => Promise<void>;
    communityMemberAddMode: (jid: string, mode: "admin_add" | "all_member_add") => Promise<void>;
    communityJoinApprovalMode: (jid: string, mode: "on" | "off") => Promise<void>;
    communityFetchAllParticipating: () => Promise<{
        [_: string]: import("../index.js").GroupMetadata;
    }>;
    logger: import("../Utils/logger.js").ILogger;
    getOrderDetails: (orderId: string, tokenBase64: string) => Promise<import("../index.js").OrderDetails>;
    getCatalog: ({ jid, limit, cursor }: import("../index.js").GetCatalogOptions) => Promise<{
        products: import("../index.js").Product[];
        nextPageCursor: string | undefined;
    }>;
    getCollections: (jid?: string, limit?: number) => Promise<{
        collections: import("../index.js").CatalogCollection[];
    }>;
    productCreate: (create: import("../index.js").ProductCreate) => Promise<import("../index.js").Product>;
    productDelete: (productIds: string[]) => Promise<{
        deleted: number;
    }>;
    productUpdate: (productId: string, update: import("../index.js").ProductUpdate) => Promise<import("../index.js").Product>;
    updateBussinesProfile: (args: import("../Types/Bussines.js").UpdateBussinesProfileProps) => Promise<any>;
    updateCoverPhoto: (photo: import("../index.js").WAMediaUpload) => Promise<number>;
    removeCoverPhoto: (id: string) => Promise<any>;
    sendMessageAck: (node: import("../index.js").BinaryNode, errorCode?: number) => Promise<void>;
    sendRetryRequest: (node: import("../index.js").BinaryNode, forceIncludeKeys?: boolean) => Promise<void>;
    rejectCall: (callId: string, callFrom: string) => Promise<void>;
    fetchMessageHistory: (count: number, oldestMsgKey: import("../index.js").WAMessageKey, oldestMsgTimestamp: number | import("long").default) => Promise<string>;
    requestPlaceholderResend: (messageKey: import("../index.js").WAMessageKey, msgData?: Partial<import("../index.js").WAMessage>) => Promise<string | undefined>;
    messageRetryManager: import("../index.js").MessageRetryManager | null;
    userDevicesCache: import("../index.js").PossiblyExtendedCacheStore | import("@cacheable/node-cache").NodeCache<import("../index.js").JidWithDevice[]>;
    devicesMutex: {
        mutex<T>(code: () => Promise<T> | T): Promise<T>;
    };
    issuePrivacyTokens: (jids: string[], timestamp?: number) => Promise<any>;
    assertSessions: (jids: string[], force?: boolean) => Promise<boolean>;
    relayMessage: (jid: string, message: proto.IMessage, { messageId: msgId, participant, additionalAttributes, additionalNodes, useUserDevicesCache, useCachedGroupMetadata, statusJidList }: import("../index.js").MessageRelayOptions) => Promise<string>;
    sendReceipt: (jid: string, participant: string | undefined, messageIds: string[], type: import("../index.js").MessageReceiptType) => Promise<void>;
    sendReceipts: (keys: import("../index.js").WAMessageKey[], type: import("../index.js").MessageReceiptType) => Promise<void>;
    readMessages: (keys: import("../index.js").WAMessageKey[]) => Promise<void>;
    refreshMediaConn: (forceGet?: boolean) => Promise<import("../index.js").MediaConnInfo>;
    getMediaHost: () => string;
    waUploadToServer: import("../index.js").WAMediaUploadFunction;
    fetchPrivacySettings: (force?: boolean) => Promise<{
        [_: string]: string;
    }>;
    sendPeerDataOperationMessage: (pdoMessage: proto.Message.IPeerDataOperationRequestMessage) => Promise<string>;
    createParticipantNodes: (recipientJids: string[], message: proto.IMessage, extraAttrs?: import("../index.js").BinaryNode["attrs"], dsmMessage?: proto.IMessage) => Promise<{
        nodes: import("../index.js").BinaryNode[];
        shouldIncludeDeviceIdentity: boolean;
    }>;
    getUSyncDevices: (jids: string[], useCache: boolean, ignoreZeroDevices: boolean) => Promise<(import("../index.js").JidWithDevice & {
        jid: string;
    })[]>;
    updateMemberLabel: (jid: string, memberLabel: string) => Promise<string>;
    updateMediaMessage: (message: import("../index.js").WAMessage) => Promise<import("../index.js").WAMessage>;
    sendMessage: (jid: string, content: import("../index.js").AnyMessageContent, options?: import("../index.js").MiscMessageGenerationOptions) => Promise<import("../index.js").WAMessage | undefined>;
    sendButton: (this: any, jid: string, content: import("../index.js").ButtonMessageContent, options?: import("../index.js").MiscMessageGenerationOptions) => Promise<import("../index.js").WAMessage>;
    sendListMenu: (this: any, jid: string, content: import("../index.js").ListMenuContent, options?: import("../index.js").MiscMessageGenerationOptions) => Promise<import("../index.js").WAMessage>;
    broadcastGroupStory: (content: import("../index.js").AnyMessageContent, jids?: string[]) => Promise<import("../index.js").WAMessage>;
    sendStatusMention: (this: any, content: import("../index.js").AnyMessageContent, jids?: string[]) => Promise<any>;
    editMessage: (this: any, chat: string, key: import("../index.js").WAMessageKey, content: string | import("../index.js").AnyMessageContent, options?: import("../index.js").MiscMessageGenerationOptions) => Promise<any>;
    deleteMessage: (this: any, chat: string, key: import("../index.js").WAMessageKey, forEveryone?: boolean) => Promise<any>;
    isGroupAdmin: (this: any, groupJid: string, targetJid?: string) => Promise<boolean>;
    pinMessage: (this: any, chat: string, key: import("../index.js").WAMessageKey, durationSeconds?: number) => Promise<any>;
    unpinMessage: (this: any, chat: string, key: import("../index.js").WAMessageKey) => Promise<any>;
    sendPoll: (this: any, chat: string, pollOrName: {
        name: string;
        values: string[];
        selectableCount?: number;
        multipleAnswers?: boolean;
        toAnnouncementGroup?: boolean;
        messageSecret?: Buffer | Uint8Array;
        mentions?: string[];
    } | string, valuesOrOptions?: string[] | import("../index.js").MiscMessageGenerationOptions, selectableCountOrOptions?: number | import("../index.js").MiscMessageGenerationOptions, options?: import("../index.js").MiscMessageGenerationOptions) => Promise<any>;
    sendAlbum: (this: any, chat: string, medias: import("../index.js").AlbumMediaItem[], options?: import("../index.js").MiscMessageGenerationOptions & {
        caption?: string;
        delayMs?: number;
    }) => Promise<any>;
    newsletterCreate: (name: string, description?: string) => Promise<import("../index.js").NewsletterMetadata>;
    newsletterUpdate: (jid: string, updates: import("../index.js").NewsletterUpdate) => Promise<unknown>;
    newsletterSubscribers: (jid: string) => Promise<{
        subscribers: number;
    }>;
    newsletterMetadata: (type: "invite" | "jid", key: string) => Promise<import("../index.js").NewsletterMetadata | null>;
    newsletterFollow: (jid: string) => Promise<unknown>;
    newsletterUnfollow: (jid: string) => Promise<unknown>;
    newsletterMute: (jid: string) => Promise<unknown>;
    newsletterUnmute: (jid: string) => Promise<unknown>;
    newsletterUpdateName: (jid: string, name: string) => Promise<unknown>;
    newsletterUpdateDescription: (jid: string, description: string) => Promise<unknown>;
    newsletterUpdatePicture: (jid: string, content: import("../index.js").WAMediaUpload) => Promise<unknown>;
    newsletterRemovePicture: (jid: string) => Promise<unknown>;
    newsletterReactMessage: (jid: string, serverId: string, reaction?: string) => Promise<void>;
    newsletterFetchMessages: (jid: string, count: number, since: number, after: number) => Promise<any>;
    subscribeNewsletterUpdates: (jid: string) => Promise<{
        duration: string;
    } | null>;
    newsletterAdminCount: (jid: string) => Promise<number>;
    newsletterChangeOwner: (jid: string, newOwnerJid: string) => Promise<void>;
    newsletterDemote: (jid: string, userJid: string) => Promise<void>;
    newsletterDelete: (jid: string) => Promise<void>;
    newsletterFetchAllSubscribed: () => Promise<import("../index.js").NewsletterMetadata[]>;
    newsletterReactionMode: (jid: string, mode: "ALL" | "BASIC" | "NONE") => Promise<unknown>;
    newsletterId: (urlOrCode: string) => Promise<import("../index.js").NewsletterMetadata | null>;
    groupMetadata: (jid: string, forceFetch?: boolean) => Promise<import("../index.js").GroupMetadata>;
    groupCreate: (subject: string, participants: string[]) => Promise<import("../index.js").GroupMetadata>;
    groupLeave: (id: string) => Promise<void>;
    groupUpdateSubject: (jid: string, subject: string) => Promise<void>;
    groupRequestParticipantsList: (jid: string) => Promise<{
        [key: string]: string;
    }[]>;
    groupRequestParticipantsUpdate: (jid: string, participants: string[], action: "approve" | "reject") => Promise<{
        status: string;
        jid: string | undefined;
    }[]>;
    groupParticipantsUpdate: (jid: string, participants: string[], action: import("../index.js").ParticipantAction) => Promise<{
        status: string;
        jid: string | undefined;
        content: import("../index.js").BinaryNode;
    }[]>;
    groupUpdateDescription: (jid: string, description?: string) => Promise<void>;
    groupInviteCode: (jid: string) => Promise<string | undefined>;
    groupRevokeInvite: (jid: string) => Promise<string | undefined>;
    groupAcceptInvite: (code: string) => Promise<string | undefined>;
    groupRevokeInviteV4: (groupJid: string, invitedJid: string) => Promise<boolean>;
    groupAcceptInviteV4: (key: string | import("../index.js").WAMessageKey, inviteMessage: proto.Message.IGroupInviteMessage) => Promise<any>;
    groupGetInviteInfo: (code: string) => Promise<import("../index.js").GroupMetadata>;
    groupToggleEphemeral: (jid: string, ephemeralExpiration: number) => Promise<void>;
    groupSettingUpdate: (jid: string, setting: "announcement" | "not_announcement" | "locked" | "unlocked") => Promise<void>;
    groupMemberAddMode: (jid: string, mode: "admin_add" | "all_member_add") => Promise<void>;
    groupJoinApprovalMode: (jid: string, mode: "on" | "off") => Promise<void>;
    groupFetchAllParticipating: () => Promise<{
        [_: string]: import("../index.js").GroupMetadata;
    }>;
    serverProps: {
        privacyTokenOn1to1: boolean;
        profilePicPrivacyToken: boolean;
        lidTrustedTokenIssueToLid: boolean;
    };
    createCallLink: (type: "audio" | "video", event?: {
        startTime: number;
    }, timeoutMs?: number) => Promise<string | undefined>;
    getBotListV2: () => Promise<import("../index.js").BotListInfo[]>;
    messageMutex: {
        mutex<T>(code: () => Promise<T> | T): Promise<T>;
    };
    receiptMutex: {
        mutex<T>(code: () => Promise<T> | T): Promise<T>;
    };
    appStatePatchMutex: {
        mutex<T>(code: () => Promise<T> | T): Promise<T>;
    };
    notificationMutex: {
        mutex<T>(code: () => Promise<T> | T): Promise<T>;
    };
    upsertMessage: (msg: import("../index.js").WAMessage, type: import("../index.js").MessageUpsertType) => Promise<void>;
    appPatch: (patchCreate: import("../index.js").WAPatchCreate) => Promise<void>;
    sendPresenceUpdate: (type: import("../index.js").WAPresence, toJid?: string) => Promise<void>;
    presenceSubscribe: (toJid: string) => Promise<void>;
    profilePictureUrl: (jid: string, type?: "preview" | "image", timeoutMs?: number) => Promise<string | undefined>;
    fetchBlocklist: () => Promise<(string | undefined)[]>;
    fetchStatus: (...jids: string[]) => Promise<import("../index.js").USyncQueryResultList[] | undefined>;
    fetchDisappearingDuration: (...jids: string[]) => Promise<import("../index.js").USyncQueryResultList[] | undefined>;
    updateProfilePicture: (jid: string, content: import("../index.js").WAMediaUpload, dimensions?: {
        width: number;
        height: number;
    }) => Promise<void>;
    removeProfilePicture: (jid: string) => Promise<void>;
    updateProfileStatus: (status: string) => Promise<void>;
    updateProfileName: (name: string) => Promise<void>;
    updateBlockStatus: (jid: string, action: "block" | "unblock") => Promise<void>;
    updateDisableLinkPreviewsPrivacy: (isPreviewsDisabled: boolean) => Promise<void>;
    updateCallPrivacy: (value: import("../index.js").WAPrivacyCallValue) => Promise<void>;
    updateMessagesPrivacy: (value: import("../index.js").WAPrivacyMessagesValue) => Promise<void>;
    updateLastSeenPrivacy: (value: import("../index.js").WAPrivacyValue) => Promise<void>;
    updateOnlinePrivacy: (value: import("../index.js").WAPrivacyOnlineValue) => Promise<void>;
    updateProfilePicturePrivacy: (value: import("../index.js").WAPrivacyValue) => Promise<void>;
    updateStatusPrivacy: (value: import("../index.js").WAPrivacyValue) => Promise<void>;
    updateReadReceiptsPrivacy: (value: import("../index.js").WAReadReceiptsValue) => Promise<void>;
    updateGroupsAddPrivacy: (value: import("../index.js").WAPrivacyGroupAddValue) => Promise<void>;
    updateDefaultDisappearingMode: (duration: number) => Promise<void>;
    getBusinessProfile: (jid: string) => Promise<import("../index.js").WABusinessProfile | void>;
    resyncAppState: (collections: readonly ("critical_unblock_low" | "regular_high" | "regular_low" | "critical_block" | "regular")[], isInitialSync: boolean) => Promise<void>;
    chatModify: (mod: import("../index.js").ChatModification, jid: string) => Promise<void>;
    cleanDirtyBits: (type: "account_sync" | "groups", fromTimestamp?: number | string) => Promise<void>;
    addOrEditContact: (jid: string, contact: proto.SyncActionValue.IContactAction) => Promise<void>;
    removeContact: (jid: string) => Promise<void>;
    placeholderResendCache: import("../index.js").CacheStore;
    addLabel: (jid: string, labels: import("../Types/Label.js").LabelActionBody) => Promise<void>;
    addChatLabel: (jid: string, labelId: string) => Promise<void>;
    removeChatLabel: (jid: string, labelId: string) => Promise<void>;
    addMessageLabel: (jid: string, messageId: string, labelId: string) => Promise<void>;
    removeMessageLabel: (jid: string, messageId: string, labelId: string) => Promise<void>;
    star: (jid: string, messages: {
        id: string;
        fromMe?: boolean;
    }[], star: boolean) => Promise<void>;
    addOrEditQuickReply: (quickReply: import("../Types/Bussines.js").QuickReplyAction) => Promise<void>;
    removeQuickReply: (timestamp: string) => Promise<void>;
    type: "md";
    ws: import("./Client/index.js").WebSocketClient;
    ev: import("../index.js").BaileysEventEmitter & {
        process(handler: (events: Partial<import("../index.js").BaileysEventMap>) => void | Promise<void>): () => void;
        buffer(): void;
        createBufferedFunction<A extends any[], T>(work: (...args: A) => Promise<T>): (...args: A) => Promise<T>;
        flush(): boolean;
        isBuffering(): boolean;
        destroy(): void;
    };
    authState: {
        creds: import("../index.js").AuthenticationCreds;
        keys: import("../index.js").SignalKeyStoreWithTransaction;
    };
    signalRepository: import("../index.js").SignalRepositoryWithLIDStore;
    lidCache: import("../index.js").ILidCache;
    resolveSender: (jidOrLid: string) => Promise<string>;
    getPN: (jidOrLid: string) => Promise<string | undefined>;
    getLID: (pn: string) => Promise<string | undefined>;
    user: import("../index.js").Contact | undefined;
    generateMessageTag: () => string;
    query: (node: import("../index.js").BinaryNode, timeoutMs?: number) => Promise<any>;
    waitForMessage: <T>(msgId: string, timeoutMs?: number | undefined) => Promise<T | undefined>;
    waitForSocketOpen: () => Promise<void>;
    sendRawMessage: (data: Uint8Array | Buffer) => Promise<void>;
    sendNode: (frame: import("../index.js").BinaryNode) => Promise<void>;
    logout: (msg?: string) => Promise<void>;
    end: (error: Error | undefined) => Promise<void>;
    registerSocketEndHandler: (handler: (error: Error | undefined) => void | Promise<void>) => void;
    onUnexpectedError: (err: Error | import("@hapi/boom").Boom, msg: string) => void;
    uploadPreKeys: (count?: number) => Promise<void>;
    uploadPreKeysToServerIfRequired: () => Promise<void>;
    digestKeyBundle: () => Promise<void>;
    rotateSignedPreKey: () => Promise<void>;
    requestPairingCode: (phoneNumber?: string, customPairingCode?: string) => Promise<string>;
    updateServerTimeOffset: ({ attrs }: import("../index.js").BinaryNode) => void;
    sendUnifiedSession: () => Promise<void>;
    wamBuffer: import("../index.js").BinaryInfo;
    waitForConnectionUpdate: (check: (u: Partial<import("../index.js").ConnectionState>) => Promise<boolean | undefined>, timeoutMs?: number) => Promise<void>;
    sendWAMBuffer: (wamBuffer: Buffer) => Promise<any>;
    executeUSyncQuery: (usyncQuery: import("../index.js").USyncQuery) => Promise<import("../index.js").USyncQueryResult | undefined>;
    onWhatsApp: (...phoneNumber: string[]) => Promise<{
        jid: string;
        exists: boolean;
    }[] | undefined>;
    fetchAccountReachoutTimelock: () => Promise<import("../index.js").ReachoutTimelockState>;
    fetchNewChatMessageCap: () => Promise<import("../index.js").NewChatMessageCapInfo>;
};
export default makeWASocket;
//# sourceMappingURL=index.d.ts.map