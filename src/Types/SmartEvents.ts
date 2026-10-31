import type { proto } from '../../WAProto'
import type { GroupMetadata, ParticipantAction, RequestJoinAction, RequestJoinMethod } from './GroupMetadata'
import type { ChatUpdate, PresenceData } from './Chat'
import type { WACallEvent } from './Call'
import type { StoredMessageRecord } from '../Utils/message-database'

export interface ReactionUpdateEvent {
	key: proto.IMessageKey
	targetKey: proto.IMessageKey
	chat: string
	sender: string
	senderNumber: string
	emoji: string
	text: string
	isRemoved: boolean
	timestamp: number
}

export interface EditMessageEvent {
	key: proto.IMessageKey
	targetKey: proto.IMessageKey
	chat: string
	sender: string
	senderNumber: string
	isGroup: boolean
	newContent?: proto.IMessage
	newText: string
	editedMessage?: { text: string; message: proto.IMessage }
	previousMessage?: StoredMessageRecord
	timestamp: number
}

export interface DeleteMessageEvent {
	key?: proto.IMessageKey
	targetKey?: proto.IMessageKey
	keys?: proto.IMessageKey[]
	chat: string
	deletedBy?: string
	deletedByNumber?: string
	isGroup: boolean
	deletedMessage?: StoredMessageRecord
	all?: boolean
	timestamp: number
}

export interface GroupUpdateEvent extends Partial<GroupMetadata> {
	id: string
	groupJid: string
	subject?: string
	desc?: string
	announce?: boolean
	restrict?: boolean
	joinApprovalMode?: boolean
	memberAddMode?: boolean
}

export interface GroupParticipantUpdateEvent {
	id: string
	groupJid: string
	author: string
	authorNumber: string
	authorPn?: string
	authorUsername?: string
	participants: string[]
	participantNumbers: string[]
	action: ParticipantAction
	reply: (text: string) => Promise<any>
}

export interface ChatUpdateEvent extends ChatUpdate {
	chat: string
}

export interface PresenceUpdateEvent {
	id: string
	chat: string
	participant: string
	participantNumber: string
	presence: PresenceData['lastKnownPresence']
	lastSeen?: number
}

export interface ReceiptUpdateEvent {
	key: proto.IMessageKey
	chat: string
	fromMe?: boolean
	userJid?: string
	userNumber?: string
	status: 'read' | 'delivered' | 'played'
	readTimestamp?: number
	receiptTimestamp?: number
}

export interface CallUpdateEvent extends WACallEvent {
	fromNumber: string
	reject: () => Promise<void>
}

export interface BlocklistUpdateEvent {
	blocklist: string[]
	type: 'add' | 'remove'
}

export interface GroupJoinRequestEvent {
	id: string
	groupJid: string
	author: string
	authorNumber: string
	participant: string
	participantNumber: string
	action: RequestJoinAction
	method: RequestJoinMethod
	approve: () => Promise<any>
	reject: () => Promise<any>
}

export interface PollVoteEvent {
	key: proto.IMessageKey
	pollKey: proto.IMessageKey
	chat: string
	voter: string
	voterNumber: string
	voterLid?: string
	timestamp: number
	raw?: proto.Message.IPollUpdateMessage | any
}
