import NodeCache from '@cacheable/node-cache'
import { Boom } from '@hapi/boom'
import { randomBytes } from 'crypto'
import { proto } from '../../WAProto/index.js'
import { DEFAULT_CACHE_TTLS, WA_DEFAULT_EPHEMERAL } from '../Defaults'
import type {
	AlbumMediaItem,
	AnyMessageContent,
	ButtonMessageContent,
	MediaConnInfo,
	MessageReceiptType,
	MessageRelayOptions,
	MiscMessageGenerationOptions,
	SocketConfig,
	WAMessage,
	WAMessageKey
} from '../Types'
import {
	aggregateMessageKeysNotFromMe,
	assertMediaContent,
	assertMeId,
	bindWaitForEvent,
	decryptMediaRetryData,
	DEF_MEDIA_HOST,
	encodeNewsletterMessage,
	encodeSignedDeviceIdentity,
	encodeWAMessage,
	encryptMediaRetryRequest,
	extractDeviceJids,
	formatInteractiveButtonMessage,
	formatListMenuMessage,
	type ListMenuContent,
	generateMessageIDV2,
	generateParticipantHashV2,
	generateWAMessage,
	generateWAMessageFromContent,
	getStatusCodeForMediaRetry,
	getUrlFromDirectPath,
	getWAUploadToServer,
	MessageRetryManager,
	normalizeMessageContent,
	parseAndInjectE2ESessions,
	unixTimestampSeconds
} from '../Utils'
import { getUrlInfo } from '../Utils/link-preview'
import { makeKeyedMutex, makeMutex } from '../Utils/make-mutex'
import { getMessageReportingToken, shouldIncludeReportingToken } from '../Utils/reporting-utils'
import {
	buildMergedTcTokenIndexWrite,
	isTcTokenExpired,
	resolveIssuanceJid,
	resolveTcTokenJid,
	shouldSendNewTcToken,
	storeTcTokensFromIqResult
} from '../Utils/tc-token-utils'
import {
	areJidsSameUser,
	type BinaryNode,
	type BinaryNodeAttributes,
	type FullJid,
	getAdditionalNode,
	getBinaryNodeChild,
	getBinaryNodeChildren,
	isHostedLidUser,
	isHostedPnUser,
	isJidBot,
	isJidGroup,
	isJidMetaAI,
	isJidNewsletter,
	isLidUser,
	isPnUser,
	jidDecode,
	jidEncode,
	jidNormalizedUser,
	type JidWithDevice,
	PSA_WID,
	S_WHATSAPP_NET,
	STORIES_JID
} from '../WABinary'
import { inspectPhoneNumber, type InspectPhoneOptions } from '../Utils/phone-inspector'
import { lidCache } from '../Utils/lid-cache'
import { USyncQuery, USyncUser } from '../WAUSync'
import { makeNewsletterSocket } from './newsletter'

const NATIVE_FLOW_BUTTON_MAP: Record<string, string> = {
	review_and_pay: 'order_details',
	review_order: 'order_status',
	payment_info: 'payment_info',
	payment_status: 'payment_status',
	payment_method: 'payment_method'
}

export const getButtonType = (message: proto.IMessage): string | null => {
	const msg = normalizeMessageContent(message) || message
	if (msg?.buttonsMessage || msg?.listMessage) {
		return msg.listMessage ? 'list' : 'buttons'
	}

	const vm = (msg as any)?.viewOnceMessage?.message || (msg as any)?.viewOnceMessageV2?.message
	const im = vm?.interactiveMessage || (msg as any)?.interactiveMessage
	if (!im?.nativeFlowMessage) return null

	const btnName = im.nativeFlowMessage?.buttons?.[0]?.name
	if (btnName && NATIVE_FLOW_BUTTON_MAP[btnName]) {
		return NATIVE_FLOW_BUTTON_MAP[btnName]
	}

	return 'interactive'
}

export const makeMessagesSocket = (config: SocketConfig) => {
	const {
		logger,
		linkPreviewImageThumbnailWidth,
		generateHighQualityLinkPreview,
		options: httpRequestOptions,
		patchMessageBeforeSending,
		cachedGroupMetadata,
		enableRecentMessageCache,
		maxMsgRetryCount
	} = config
	const sock = makeNewsletterSocket(config)
	const {
		ev,
		authState,
		messageMutex,
		signalRepository,
		upsertMessage,
		query,
		fetchPrivacySettings,
		sendNode,
		groupMetadata,
		groupToggleEphemeral,
		registerSocketEndHandler
	} = sock

	const getLIDForPN = signalRepository.lidMapping.getLIDForPN.bind(signalRepository.lidMapping)

	/**
	 * Set of tctoken storage JIDs with a fire-and-forget `issuePrivacyTokens` IQ in flight.
	 * Prevents duplicate IQs from rapid back-to-back sends before `senderTimestamp` persists.
	 * Entries are always removed in `.finally()`, so the set is bounded by concurrency.
	 */
	const inFlightTcTokenIssuance = new Set<string>()

	const userDevicesCache =
		config.userDevicesCache ||
		new NodeCache<JidWithDevice[]>({
			stdTTL: DEFAULT_CACHE_TTLS.USER_DEVICES, // 5 minutes
			useClones: false
		})
	/** Serializes writes to userDevicesCache across USync refresh and device-notification handling. */
	const devicesMutex = makeMutex()

	// Initialize message retry manager if enabled
	const messageRetryManager = enableRecentMessageCache ? new MessageRetryManager(logger, maxMsgRetryCount) : null

	// Prevent race conditions in Signal session encryption by user
	const encryptionMutex = makeKeyedMutex()

	let mediaConn: Promise<MediaConnInfo> | undefined
	/** Per-socket media host; updated whenever media_conn is fetched. Defaults to the public WhatsApp host. */
	let mediaHost: string = DEF_MEDIA_HOST
	const refreshMediaConn = async (forceGet = false): Promise<MediaConnInfo> => {
		const media = await mediaConn
		if (!media || forceGet || new Date().getTime() - media.fetchDate.getTime() > media.ttl * 1000) {
			mediaConn = (async () => {
				const result = await query({
					tag: 'iq',
					attrs: {
						type: 'set',
						xmlns: 'w:m',
						to: S_WHATSAPP_NET
					},
					content: [{ tag: 'media_conn', attrs: {} }]
				})
				const mediaConnNode = getBinaryNodeChild(result, 'media_conn')!
				// TODO: explore full length of data that whatsapp provides
				const node: MediaConnInfo = {
					hosts: getBinaryNodeChildren(mediaConnNode, 'host').map(({ attrs }) => ({
						hostname: attrs.hostname!,
						maxContentLengthBytes: +attrs.maxContentLengthBytes!
					})),
					auth: mediaConnNode.attrs.auth!,
					ttl: +mediaConnNode.attrs.ttl!,
					fetchDate: new Date()
				}
				logger.debug('fetched media conn')
				if (node.hosts[0]) {
					mediaHost = node.hosts[0].hostname
				}

				return node
			})()
		}

		return mediaConn!
	}

	/**
	 * generic send receipt function
	 * used for receipts of phone call, read, delivery etc.
	 * */
	const sendReceipt = async (
		jid: string,
		participant: string | undefined,
		messageIds: string[],
		type: MessageReceiptType
	) => {
		if (!messageIds || messageIds.length === 0) {
			throw new Boom('missing ids in receipt')
		}

		const node: BinaryNode = {
			tag: 'receipt',
			attrs: {
				id: messageIds[0]!
			}
		}
		const isReadReceipt = type === 'read' || type === 'read-self'
		if (isReadReceipt) {
			node.attrs.t = unixTimestampSeconds().toString()
		}

		if (type === 'sender' && (isPnUser(jid) || isLidUser(jid))) {
			node.attrs.recipient = jid
			node.attrs.to = participant!
		} else {
			node.attrs.to = jid
			if (participant) {
				node.attrs.participant = participant
			}
		}

		if (type) {
			node.attrs.type = type
		}

		const remainingMessageIds = messageIds.slice(1)
		if (remainingMessageIds.length) {
			node.content = [
				{
					tag: 'list',
					attrs: {},
					content: remainingMessageIds.map(id => ({
						tag: 'item',
						attrs: { id }
					}))
				}
			]
		}

		logger.debug({ attrs: node.attrs, messageIds }, 'sending receipt for messages')
		await sendNode(node)
	}

	/** Correctly bulk send receipts to multiple chats, participants */
	const sendReceipts = async (keys: WAMessageKey[], type: MessageReceiptType) => {
		const recps = aggregateMessageKeysNotFromMe(keys)
		for (const { jid, participant, messageIds } of recps) {
			await sendReceipt(jid, participant, messageIds, type)
		}
	}

	/** Bulk read messages. Keys can be from different chats & participants */
	const readMessages = async (keys: WAMessageKey[]) => {
		const privacySettings = await fetchPrivacySettings()
		// based on privacy settings, we have to change the read type
		const readType = privacySettings.readreceipts === 'all' ? 'read' : 'read-self'
		await sendReceipts(keys, readType)
	}

	/** Device info with wire JID */
	type DeviceWithJid = JidWithDevice & {
		jid: string
	}

	/** Fetch all the devices we've to send a message to */
	const getUSyncDevices = async (
		jids: string[],
		useCache: boolean,
		ignoreZeroDevices: boolean
	): Promise<DeviceWithJid[]> => {
		const deviceResults: DeviceWithJid[] = []

		if (!useCache) {
			logger.debug('not using cache for devices')
		}

		const toFetch: string[] = []

		const jidsWithUser = jids
			.map(jid => {
				const decoded = jidDecode(jid)
				const user = decoded?.user
				const device = decoded?.device
				const isExplicitDevice = typeof device === 'number' && device >= 0

				if (isExplicitDevice && user) {
					deviceResults.push({
						user,
						device,
						jid
					})
					return null
				}

				jid = jidNormalizedUser(jid)
				return { jid, user }
			})
			.filter(jid => jid !== null)

		let mgetDevices: undefined | Record<string, FullJid[] | undefined>

		if (useCache && userDevicesCache.mget) {
			const usersToFetch = jidsWithUser.map(j => j?.user).filter(Boolean) as string[]
			mgetDevices = await userDevicesCache.mget(usersToFetch)
		}

		for (const { jid, user } of jidsWithUser) {
			if (useCache) {
				const devices =
					mgetDevices?.[user!] ||
					(userDevicesCache.mget ? undefined : ((await userDevicesCache.get(user!)) as FullJid[]))
				if (devices) {
					const devicesWithJid = devices.map(d => ({
						...d,
						jid: jidEncode(d.user, d.server, d.device)
					}))
					deviceResults.push(...devicesWithJid)

					logger.trace({ user }, 'using cache for devices')
				} else {
					toFetch.push(jid)
				}
			} else {
				toFetch.push(jid)
			}
		}

		if (!toFetch.length) {
			return deviceResults
		}

		const requestedLidUsers = new Set<string>()
		for (const jid of toFetch) {
			if (isLidUser(jid) || isHostedLidUser(jid)) {
				const user = jidDecode(jid)?.user
				if (user) requestedLidUsers.add(user)
			}
		}

		const query = new USyncQuery().withContext('message').withDeviceProtocol().withLIDProtocol()

		for (const jid of toFetch) {
			query.withUser(new USyncUser().withId(jid)) // todo: investigate - the idea here is that <user> should have an inline lid field with the lid being the pn equivalent
		}

		const result = await sock.executeUSyncQuery(query)

		if (result) {
			// TODO: LID MAP this stuff (lid protocol will now return lid with devices)
			const lidResults = result.list.filter(a => !!a.lid)
			if (lidResults.length > 0) {
				logger.trace('Storing LID maps from device call')
				await signalRepository.lidMapping.storeLIDPNMappings(lidResults.map(a => ({ lid: a.lid as string, pn: a.id })))

				// Force-refresh sessions for newly mapped LIDs to align identity addressing
				try {
					const lids = lidResults.map(a => a.lid as string)
					if (lids.length) {
						await assertSessions(lids, true)
					}
				} catch (e) {
					logger.warn({ e, count: lidResults.length }, 'failed to assert sessions for newly mapped LIDs')
				}
			}

			const extracted = extractDeviceJids(
				result?.list,
				authState.creds.me!.id,
				authState.creds.me!.lid!,
				ignoreZeroDevices
			)
			const deviceMap: { [_: string]: FullJid[] } = {}

			for (const item of extracted) {
				deviceMap[item.user] = deviceMap[item.user] || []
				deviceMap[item.user]?.push(item)
			}

			// Process each user's devices as a group for bulk LID migration
			for (const [user, userDevices] of Object.entries(deviceMap)) {
				const isLidUser = requestedLidUsers.has(user)

				// Process all devices for this user
				for (const item of userDevices) {
					const finalJid = isLidUser
						? jidEncode(user, item.server, item.device)
						: jidEncode(item.user, item.server, item.device)

					deviceResults.push({
						...item,
						jid: finalJid
					})

					logger.debug(
						{
							user: item.user,
							device: item.device,
							finalJid,
							usedLid: isLidUser
						},
						'Processed device with LID priority'
					)
				}
			}

			await devicesMutex.mutex(async () => {
				if (userDevicesCache.mset) {
					// if the cache supports mset, we can set all devices in one go
					await userDevicesCache.mset(Object.entries(deviceMap).map(([key, value]) => ({ key, value })))
				} else {
					for (const key in deviceMap) {
						if (deviceMap[key]) await userDevicesCache.set(key, deviceMap[key])
					}
				}
			})

			const userDeviceUpdates: { [userId: string]: string[] } = {}
			for (const [userId, devices] of Object.entries(deviceMap)) {
				if (devices && devices.length > 0) {
					userDeviceUpdates[userId] = devices.map(d => d.device?.toString() || '0')
				}
			}

			if (Object.keys(userDeviceUpdates).length > 0) {
				try {
					await authState.keys.set({ 'device-list': userDeviceUpdates })
					logger.debug(
						{ userCount: Object.keys(userDeviceUpdates).length },
						'stored user device lists for bulk migration'
					)
				} catch (error) {
					logger.warn({ error }, 'failed to store user device lists')
				}
			}
		}

		return deviceResults
	}

	/**
	 * Update Member Label
	 */
	const updateMemberLabel = (jid: string, memberLabel: string) => {
		return relayMessage(
			jid,
			{
				protocolMessage: {
					type: proto.Message.ProtocolMessage.Type.GROUP_MEMBER_LABEL_CHANGE,
					memberLabel: {
						label: memberLabel?.slice(0, 30),
						labelTimestamp: unixTimestampSeconds()
					}
				}
			},
			{
				additionalNodes: [
					{
						tag: 'meta',
						attrs: {
							tag_reason: 'user_update',
							appdata: 'member_tag'
						},
						content: undefined
					}
				]
			}
		)
	}

	const assertSessions = async (jids: string[], force?: boolean) => {
		let didFetchNewSession = false
		const uniqueJids = [...new Set(jids)]
		const jidsRequiringFetch: string[] = []

		logger.debug({ jids }, 'assertSessions call with jids')

		for (const jid of uniqueJids) {
			if (!force) {
				const sessionValidation = await signalRepository.validateSession(jid)
				if (sessionValidation.exists) {
					continue
				}
			}

			jidsRequiringFetch.push(jid)
		}

		if (jidsRequiringFetch.length) {
			// LID if mapped, otherwise original
			const wireJids = [
				...jidsRequiringFetch.filter(jid => !!isLidUser(jid) || !!isHostedLidUser(jid)),
				...(
					(await signalRepository.lidMapping.getLIDsForPNs(
						jidsRequiringFetch.filter(jid => !!isPnUser(jid) || !!isHostedPnUser(jid))
					)) || []
				).map(a => a.lid)
			]

			logger.debug({ jidsRequiringFetch, wireJids }, 'fetching sessions')
			const result = await query({
				tag: 'iq',
				attrs: {
					xmlns: 'encrypt',
					type: 'get',
					to: S_WHATSAPP_NET
				},
				content: [
					{
						tag: 'key',
						attrs: {},
						content: wireJids.map(jid => {
							const attrs: { [key: string]: string } = { jid }
							if (force) attrs.reason = 'identity'
							return { tag: 'user', attrs }
						})
					}
				]
			})
			await parseAndInjectE2ESessions(result, signalRepository)
			didFetchNewSession = true
		}

		return didFetchNewSession
	}

	const sendPeerDataOperationMessage = async (
		pdoMessage: proto.Message.IPeerDataOperationRequestMessage
	): Promise<string> => {
		//TODO: for later, abstract the logic to send a Peer Message instead of just PDO - useful for App State Key Resync with phone
		if (!authState.creds.me?.id) {
			throw new Boom('Not authenticated')
		}

		const protocolMessage: proto.IMessage = {
			protocolMessage: {
				peerDataOperationRequestMessage: pdoMessage,
				type: proto.Message.ProtocolMessage.Type.PEER_DATA_OPERATION_REQUEST_MESSAGE
			}
		}

		const meJid = jidNormalizedUser(authState.creds.me.id)

		const msgId = await relayMessage(meJid, protocolMessage, {
			additionalAttributes: {
				category: 'peer',

				push_priority: 'high_force'
			},
			additionalNodes: [
				{
					tag: 'meta',
					attrs: { appdata: 'default' }
				}
			]
		})

		return msgId
	}

	const createParticipantNodes = async (
		recipientJids: string[],
		message: proto.IMessage,
		extraAttrs?: BinaryNode['attrs'],
		dsmMessage?: proto.IMessage
	) => {
		if (!recipientJids.length) {
			return { nodes: [] as BinaryNode[], shouldIncludeDeviceIdentity: false }
		}

		const patched = await patchMessageBeforeSending(message, recipientJids)
		const patchedMessages = Array.isArray(patched)
			? patched
			: recipientJids.map(jid => ({ recipientJid: jid, message: patched }))

		let shouldIncludeDeviceIdentity = false
		const meId = authState.creds.me!.id
		const meLid = authState.creds.me?.lid
		const meLidUser = meLid ? jidDecode(meLid)?.user : null

		const encryptionPromises = (patchedMessages as any).map(
			async ({ recipientJid: jid, message: patchedMessage }: any) => {
				try {
					if (!jid) return null

					let msgToEncrypt = patchedMessage

					if (dsmMessage) {
						const { user: targetUser } = jidDecode(jid)!
						const { user: ownPnUser } = jidDecode(meId)!
						const ownLidUser = meLidUser

						const isOwnUser = targetUser === ownPnUser || (ownLidUser && targetUser === ownLidUser)
						const isExactSenderDevice = jid === meId || (meLid && jid === meLid)

						if (isOwnUser && !isExactSenderDevice) {
							msgToEncrypt = dsmMessage
							logger.debug({ jid, targetUser }, 'Using DSM for own device')
						}
					}

					const bytes = encodeWAMessage(msgToEncrypt)
					const mutexKey = jid

					const node = await encryptionMutex.mutex(mutexKey, async () => {
						let encResult
						try {
							encResult = await signalRepository.encryptMessage({ jid, data: bytes })
						} catch (encErr: any) {
							const errMsg = (encErr?.message || String(encErr)).toLowerCase()
							if (errMsg.includes('bad mac') || errMsg.includes('mac')) {
								logger.warn({ jid, encErr }, 'Bad MAC encountered during encryptMessage, resetting session & re-encrypting')
								const sessionId = signalRepository.jidToSignalProtocolAddress(jid)
								await authState.keys.set({ session: { [sessionId]: null } })
								encResult = await signalRepository.encryptMessage({ jid, data: bytes })
							} else {
								throw encErr
							}
						}

						const { type, ciphertext } = encResult

						if (type === 'pkmsg') {
							shouldIncludeDeviceIdentity = true
						}

						return {
							tag: 'to',
							attrs: { jid },
							content: [
								{
									tag: 'enc',
									attrs: { v: '2', type, ...(extraAttrs || {}) },
									content: ciphertext
								}
							]
						}
					})

					return node
				} catch (err) {
					logger.error({ jid, err }, 'Failed to encrypt for recipient')
					return null
				}
			}
		)

		const nodes = (await Promise.all(encryptionPromises)).filter(node => node !== null) as BinaryNode[]

		if (recipientJids.length > 0 && nodes.length === 0) {
			throw new Boom('All encryptions failed', { statusCode: 500 })
		}

		return { nodes, shouldIncludeDeviceIdentity }
	}

	const relayMessage = async (
		jid: string,
		message: proto.IMessage,
		{
			messageId: msgId,
			participant,
			additionalAttributes,
			additionalNodes,
			useUserDevicesCache,
			useCachedGroupMetadata,
			statusJidList
		}: MessageRelayOptions
	) => {
		const meId = assertMeId(authState.creds)
		const meLid = authState.creds.me?.lid
		const isRetryResend = Boolean(participant?.jid)
		let shouldIncludeDeviceIdentity = isRetryResend
		const statusJid = 'status@broadcast'

		const { user, server } = jidDecode(jid)!
		const isGroup = server === 'g.us'
		const isStatus = jid === statusJid
		const isLid = server === 'lid'
		const isNewsletter = server === 'newsletter'
		const isGroupOrStatus = isGroup || isStatus
		const finalJid = jid

		msgId = msgId || generateMessageIDV2(meId)
		useUserDevicesCache = useUserDevicesCache !== false
		useCachedGroupMetadata = useCachedGroupMetadata !== false && !isStatus

		const participants: BinaryNode[] = []
		const destinationJid = !isStatus ? finalJid : statusJid
		const binaryNodeContent: BinaryNode[] = []
		const devices: DeviceWithJid[] = []
		let reportingMessage: proto.IMessage | undefined

		const meMsg: proto.IMessage = {
			deviceSentMessage: {
				destinationJid,
				message
			},
			messageContextInfo: message.messageContextInfo
		}

		const extraAttrs: BinaryNodeAttributes = {}

		if (participant) {
			if (!isGroup && !isStatus) {
				additionalAttributes = { ...additionalAttributes, device_fanout: 'false' }
			}

			const { user, device } = jidDecode(participant.jid)!
			devices.push({
				user,
				device,
				jid: participant.jid
			})
		}

		await authState.keys.transaction(async () => {
			const mediaType = getMediaType(message)
			if (mediaType) {
				extraAttrs['mediatype'] = mediaType
			}

			if (isNewsletter) {
				const patched = patchMessageBeforeSending ? await patchMessageBeforeSending(message, []) : message
				const bytes = encodeNewsletterMessage(patched as proto.IMessage)
				binaryNodeContent.push({
					tag: 'plaintext',
					attrs: {},
					content: bytes
				})
				const stanza: BinaryNode = {
					tag: 'message',
					attrs: {
						to: jid,
						id: msgId,
						type: getMessageType(message),
						...(additionalAttributes || {})
					},
					content: binaryNodeContent
				}
				logger.debug({ msgId }, `sending newsletter message to ${jid}`)
				await sendNode(stanza)
				return
			}

			if (normalizeMessageContent(message)?.pinInChatMessage || normalizeMessageContent(message)?.reactionMessage) {
				extraAttrs['decrypt-fail'] = 'hide' // todo: expand for reactions and other types
			}

			if (isGroupOrStatus && !isRetryResend) {
				const [groupData, senderKeyMap] = await Promise.all([
					(async () => {
						let groupData = useCachedGroupMetadata && cachedGroupMetadata ? await cachedGroupMetadata(jid) : undefined // todo: should we rely on the cache specially if the cache is outdated and the metadata has new fields?
						if (groupData && Array.isArray(groupData?.participants)) {
							logger.trace({ jid, participants: groupData.participants.length }, 'using cached group metadata')
						} else if (!isStatus) {
							try {
								groupData = await groupMetadata(jid)
							} catch (err: any) {
								logger.warn({ jid, err: err?.message }, 'failed to fetch group metadata for send, falling back to cached or minimal')
								groupData = (cachedGroupMetadata ? await cachedGroupMetadata(jid) : undefined) || ({
									id: jid,
									participants: [],
									subject: 'Unknown'
								} as any)
							}
						}

						return groupData
					})(),
					(async () => {
						if (!participant && !isStatus) {
							// what if sender memory is less accurate than the cached metadata
							// on participant change in group, we should do sender memory manipulation
							const result = await authState.keys.get('sender-key-memory', [jid]) // TODO: check out what if the sender key memory doesn't include the LID stuff now?
							return result[jid] || {}
						}

						return {}
					})()
				])

				const participantsList = groupData ? groupData.participants.map(p => p.id) : []

				if (groupData?.ephemeralDuration && groupData.ephemeralDuration > 0) {
					additionalAttributes = {
						...additionalAttributes,
						expiration: groupData.ephemeralDuration.toString()
					}
				}

				if (isStatus) {
					if (statusJidList && statusJidList.length) {
						participantsList.push(...statusJidList)
					} else {
						const myJid = meId ? (meId.includes('@') ? meId : `${meId}@s.whatsapp.net`) : ''
						if (myJid) participantsList.push(myJid)
					}
				}

				const additionalDevices = await getUSyncDevices(participantsList, !!useUserDevicesCache, false)
				devices.push(...additionalDevices)

				if (isGroup) {
					additionalAttributes = {
						...additionalAttributes,
						addressing_mode: groupData?.addressingMode || 'lid'
					}
				}

				const patched = await patchMessageBeforeSending(message)
				if (Array.isArray(patched)) {
					throw new Boom('Per-jid patching is not supported in groups')
				}

				const bytes = encodeWAMessage(patched)
				reportingMessage = patched
				const groupAddressingMode = additionalAttributes?.['addressing_mode'] || groupData?.addressingMode || 'lid'
				const groupSenderIdentity = groupAddressingMode === 'lid' && meLid ? meLid : meId

				let groupEncResult
				try {
					groupEncResult = await signalRepository.encryptGroupMessage({
						group: destinationJid,
						data: bytes,
						meId: groupSenderIdentity
					})
				} catch (encErr: any) {
					const errMsg = (encErr?.message || String(encErr)).toLowerCase()
					if (errMsg.includes('bad mac') || errMsg.includes('mac')) {
						logger.warn({ destinationJid, encErr }, 'Bad MAC encountered in encryptGroupMessage, resetting sender key & re-encrypting')
						await authState.keys.set({ 'sender-key-memory': { [destinationJid]: null } })
						groupEncResult = await signalRepository.encryptGroupMessage({
							group: destinationJid,
							data: bytes,
							meId: groupSenderIdentity
						})
					} else {
						throw encErr
					}
				}

				const { ciphertext, senderKeyDistributionMessage } = groupEncResult

				const senderKeyRecipients: string[] = []
				for (const device of devices) {
					const deviceJid = device.jid
					const hasKey = !!senderKeyMap[deviceJid]
					if (
						(!hasKey || !!participant) &&
						!isHostedLidUser(deviceJid) &&
						!isHostedPnUser(deviceJid) &&
						device.device !== 99
					) {
						//todo: revamp all this logic
						// the goal is to follow with what I said above for each group, and instead of a true false map of ids, we can set an array full of those the app has already sent pkmsgs
						senderKeyRecipients.push(deviceJid)
						senderKeyMap[deviceJid] = true
					}
				}

				if (senderKeyRecipients.length) {
					logger.debug({ senderKeyJids: senderKeyRecipients }, 'sending new sender key')

					const senderKeyMsg: proto.IMessage = {
						senderKeyDistributionMessage: {
							axolotlSenderKeyDistributionMessage: senderKeyDistributionMessage,
							groupId: destinationJid
						}
					}

					const senderKeySessionTargets = senderKeyRecipients
					await assertSessions(senderKeySessionTargets)

					const result = await createParticipantNodes(senderKeyRecipients, senderKeyMsg, extraAttrs)
					shouldIncludeDeviceIdentity = shouldIncludeDeviceIdentity || result.shouldIncludeDeviceIdentity

					participants.push(...result.nodes)
				}

				binaryNodeContent.push({
					tag: 'enc',
					attrs: { v: '2', type: 'skmsg', ...extraAttrs },
					content: ciphertext
				})

				await authState.keys.set({ 'sender-key-memory': { [jid]: senderKeyMap } })
			} else {
				// ADDRESSING CONSISTENCY: Match own identity to conversation context
				// TODO: investigate if this is true
				let ownId = meId
				if (isLid && meLid) {
					ownId = meLid
					logger.debug({ to: jid, ownId }, 'Using LID identity for @lid conversation')
				} else {
					logger.debug({ to: jid, ownId }, 'Using PN identity for @s.whatsapp.net conversation')
				}

				const { user: ownUser } = jidDecode(ownId)!
				if (!participant) {
					const patchedForReporting = await patchMessageBeforeSending(message, [jid])
					reportingMessage = Array.isArray(patchedForReporting)
						? patchedForReporting.find(item => item.recipientJid === jid) || patchedForReporting[0]
						: patchedForReporting
				}

				if (!isRetryResend) {
					const targetUserServer = isLid ? 'lid' : 's.whatsapp.net'
					devices.push({
						user,
						device: 0,
						jid: jidEncode(user, targetUserServer, 0) // rajeh, todo: this entire logic is convoluted and weird.
					})

					if (user !== ownUser) {
						const ownUserServer = isLid ? 'lid' : 's.whatsapp.net'
						const ownUserForAddressing = isLid && meLid ? jidDecode(meLid)!.user : jidDecode(meId)!.user

						devices.push({
							user: ownUserForAddressing,
							device: 0,
							jid: jidEncode(ownUserForAddressing, ownUserServer, 0)
						})
					}

					if (additionalAttributes?.['category'] !== 'peer') {
						// Clear placeholders and enumerate actual devices
						devices.length = 0

						// Use conversation-appropriate sender identity
						const senderIdentity =
							isLid && meLid
								? jidEncode(jidDecode(meLid)?.user!, 'lid', undefined)
								: jidEncode(jidDecode(meId)?.user!, 's.whatsapp.net', undefined)

						// Enumerate devices for sender and target with consistent addressing
						const sessionDevices = await getUSyncDevices([senderIdentity, jid], true, false)
						devices.push(...sessionDevices)

						logger.debug(
							{
								deviceCount: devices.length,
								devices: devices.map(d => `${d.user}:${d.device}@${jidDecode(d.jid)?.server}`)
							},
							'Device enumeration complete with unified addressing'
						)
					}
				}

				const allRecipients: string[] = []
				const meRecipients: string[] = []
				const otherRecipients: string[] = []
				const { user: mePnUser } = jidDecode(meId)!
				const { user: meLidUser } = meLid ? jidDecode(meLid)! : { user: null }

				for (const { user, jid } of devices) {
					const isExactSenderDevice = jid === meId || (meLid && jid === meLid)
					if (isExactSenderDevice) {
						logger.debug({ jid, meId, meLid }, 'Skipping exact sender device (whatsmeow pattern)')
						continue
					}

					// Check if this is our device (could match either PN or LID user)
					const isMe = user === mePnUser || user === meLidUser

					if (isMe) {
						meRecipients.push(jid)
					} else {
						otherRecipients.push(jid)
					}

					allRecipients.push(jid)
				}

				await assertSessions(allRecipients)

				const [
					{ nodes: meNodes, shouldIncludeDeviceIdentity: s1 },
					{ nodes: otherNodes, shouldIncludeDeviceIdentity: s2 }
				] = await Promise.all([
					// For own devices: use DSM if available (1:1 chats only)
					createParticipantNodes(meRecipients, meMsg || message, extraAttrs),
					createParticipantNodes(otherRecipients, message, extraAttrs, meMsg)
				])
				participants.push(...meNodes)
				participants.push(...otherNodes)

				if (meRecipients.length > 0 || otherRecipients.length > 0) {
					extraAttrs['phash'] = generateParticipantHashV2([...meRecipients, ...otherRecipients])
				}

				shouldIncludeDeviceIdentity = shouldIncludeDeviceIdentity || s1 || s2
			}

			if (isRetryResend) {
				const isParticipantLid = isLidUser(participant!.jid)
				const isMe = areJidsSameUser(participant!.jid, isParticipantLid ? meLid : meId)

				let messageToSend = message
				if (isGroupOrStatus) {
					let groupSenderIdentity: string | undefined
					if (meLid && (await signalRepository.hasSenderKey({ group: destinationJid, meId: meLid }))) {
						groupSenderIdentity = meLid
					} else if (await signalRepository.hasSenderKey({ group: destinationJid, meId })) {
						groupSenderIdentity = meId
					}

					if (groupSenderIdentity) {
						try {
							const skdm = await signalRepository.getSenderKeyDistributionMessage({
								group: destinationJid,
								meId: groupSenderIdentity
							})
							messageToSend = {
								...message,
								senderKeyDistributionMessage: {
									groupId: destinationJid,
									axolotlSenderKeyDistributionMessage: skdm
								}
							}
						} catch (err) {
							logger.warn({ err, jid: destinationJid }, 'failed to build SKDM for retry, sending without it')
						}
					}
				}

				const encodedMessageToSend = isMe
					? encodeWAMessage({
							deviceSentMessage: {
								destinationJid,
								message: messageToSend
							}
						})
					: encodeWAMessage(messageToSend)

				let partEncResult
				try {
					partEncResult = await signalRepository.encryptMessage({
						data: encodedMessageToSend,
						jid: participant!.jid
					})
				} catch (encErr: any) {
					const errMsg = (encErr?.message || String(encErr)).toLowerCase()
					if (errMsg.includes('bad mac') || errMsg.includes('mac')) {
						logger.warn({ jid: participant!.jid, encErr }, 'Bad MAC in participant encryptMessage, resetting session & re-encrypting')
						const sessionId = signalRepository.jidToSignalProtocolAddress(participant!.jid)
						await authState.keys.set({ session: { [sessionId]: null } })
						partEncResult = await signalRepository.encryptMessage({
							data: encodedMessageToSend,
							jid: participant!.jid
						})
					} else {
						throw encErr
					}
				}
				const { type, ciphertext: encryptedContent } = partEncResult

				binaryNodeContent.push({
					tag: 'enc',
					attrs: {
						v: '2',
						type,
						count: participant!.count.toString()
					},
					content: encryptedContent
				})
			}

			if (participants.length) {
				if (additionalAttributes?.['category'] === 'peer') {
					const peerNode = participants[0]?.content?.[0] as BinaryNode
					if (peerNode) {
						binaryNodeContent.push(peerNode) // push only enc
					}
				} else {
					binaryNodeContent.push({
						tag: 'participants',
						attrs: {},

						content: participants
					})
				}
			}

			const stanza: BinaryNode = {
				tag: 'message',
				attrs: {
					id: msgId,
					to: destinationJid,
					type: getMessageType(message),
					...(additionalAttributes || {})
				},
				content: binaryNodeContent
			}

			// if the participant to send to is explicitly specified (generally retry recp)
			// ensure the message is only sent to that person
			// if a retry receipt is sent to everyone -- it'll fail decryption for everyone else who received the msg
			if (participant) {
				if (isJidGroup(destinationJid)) {
					stanza.attrs.to = destinationJid
					stanza.attrs.participant = participant.jid
				} else if (areJidsSameUser(participant.jid, meId)) {
					stanza.attrs.to = participant.jid
					stanza.attrs.recipient = destinationJid
				} else {
					stanza.attrs.to = participant.jid
				}
			} else {
				stanza.attrs.to = destinationJid
			}

			if (shouldIncludeDeviceIdentity) {
				;(stanza.content as BinaryNode[]).push({
					tag: 'device-identity',
					attrs: {},
					content: encodeSignedDeviceIdentity(authState.creds.account!, true)
				})

				logger.debug({ jid }, 'adding device identity')
			}

			if (
				!isNewsletter &&
				!isRetryResend &&
				reportingMessage?.messageContextInfo?.messageSecret &&
				shouldIncludeReportingToken(reportingMessage)
			) {
				try {
					const encoded = encodeWAMessage(reportingMessage)
					const reportingKey: WAMessageKey = {
						id: msgId,
						fromMe: true,
						remoteJid: destinationJid,
						participant: participant?.jid
					}
					const reportingNode = await getMessageReportingToken(encoded, reportingMessage, reportingKey)
					if (reportingNode) {
						;(stanza.content as BinaryNode[]).push(reportingNode)
						logger.trace({ jid }, 'added reporting token to message')
					}
				} catch (error: any) {
					logger.warn({ jid, trace: error?.stack }, 'failed to attach reporting token')
				}
			}

			// WA Web never attaches tctoken to peer (AppStateSync) messages — server rejects with 479
			const isPeerMessage = additionalAttributes?.['category'] === 'peer'
			const is1on1Send = !isGroup && !isRetryResend && !isStatus && !isNewsletter && !isPeerMessage

			// Resolve destination to LID for tctoken storage — matches Signal session key pattern
			const tcTokenJid = is1on1Send ? await resolveTcTokenJid(destinationJid, getLIDForPN) : destinationJid
			const contactTcTokenData = is1on1Send ? await authState.keys.get('tctoken', [tcTokenJid]) : {}
			const existingTokenEntry = contactTcTokenData[tcTokenJid]
			let tcTokenBuffer = existingTokenEntry?.token

			// Treat expired tokens the same as missing — clear from cache
			if (tcTokenBuffer?.length && isTcTokenExpired(existingTokenEntry?.timestamp)) {
				logger.debug({ jid: destinationJid, timestamp: existingTokenEntry?.timestamp }, 'tctoken expired, clearing')
				tcTokenBuffer = undefined
				// Preserve senderTimestamp so the fire-and-forget issuance dedupe survives cleanup.
				const cleared =
					existingTokenEntry?.senderTimestamp !== undefined
						? { token: Buffer.alloc(0), senderTimestamp: existingTokenEntry.senderTimestamp }
						: null
				try {
					await authState.keys.set({ tctoken: { [tcTokenJid]: cleared } })
				} catch (err: any) {
					logger.debug({ jid: destinationJid, err: err?.message }, 'failed to persist tctoken expiry cleanup')
				}
			}

			if (tcTokenBuffer?.length && sock.serverProps.privacyTokenOn1to1) {
				;(stanza.content as BinaryNode[]).push({
					tag: 'tctoken',
					attrs: {},
					content: tcTokenBuffer
				})
			}

			if (additionalNodes && additionalNodes.length > 0) {
				;(stanza.content as BinaryNode[]).push(...additionalNodes)
			}

			const buttonType = getButtonType(message)
			if (buttonType && !isNewsletter && !isStatus) {
				const hasBizNode = (stanza.content as BinaryNode[]).some(
					node => typeof node === 'object' && (node as BinaryNode)?.tag === 'biz'
				)
				if (!hasBizNode) {
					const bizNodes = getAdditionalNode(buttonType)
					;(stanza.content as BinaryNode[]).push(...bizNodes)
				}
			}

			logger.debug({ msgId }, `sending message to ${participants.length} devices`)

			await sendNode(stanza)

			// Fire-and-forget: issue our token to the contact AFTER message send.
			// WA Web skips protocol messages and PSA/bot contacts (TcTokenChatAction: isRegularUser)
			const isProtocolMsg = !!normalizeMessageContent(message)?.protocolMessage
			const isBotOrPSA = destinationJid === PSA_WID || isJidBot(destinationJid) || isJidMetaAI(destinationJid)
			if (
				is1on1Send &&
				!isProtocolMsg &&
				!isBotOrPSA &&
				shouldSendNewTcToken(existingTokenEntry?.senderTimestamp) &&
				!inFlightTcTokenIssuance.has(tcTokenJid)
			) {
				inFlightTcTokenIssuance.add(tcTokenJid)
				const issueTimestamp = unixTimestampSeconds()
				const getPNForLID = signalRepository.lidMapping.getPNForLID.bind(signalRepository.lidMapping)
				resolveIssuanceJid(destinationJid, sock.serverProps.lidTrustedTokenIssueToLid, getLIDForPN, getPNForLID)
					.then(issueJid => issuePrivacyTokens([issueJid], issueTimestamp))
					.then(async result => {
						await storeTcTokensFromIqResult({
							result,
							fallbackJid: tcTokenJid,
							keys: authState.keys,
							getLIDForPN
						})

						const currentData = await authState.keys.get('tctoken', [tcTokenJid])
						const currentEntry = currentData[tcTokenJid]
						const indexWrite = await buildMergedTcTokenIndexWrite(authState.keys, [tcTokenJid])
						await authState.keys.set({
							tctoken: {
								[tcTokenJid]: {
									token: Buffer.alloc(0),
									...currentEntry,
									senderTimestamp: issueTimestamp
								},
								...indexWrite
							}
						})
					})
					.catch(err => {
						logger.debug({ jid: destinationJid, err: err?.message }, 'fire-and-forget tctoken issuance failed')
					})
					.finally(() => {
						inFlightTcTokenIssuance.delete(tcTokenJid)
					})
			}

			// Add message to retry cache if enabled
			if (messageRetryManager) {
				messageRetryManager.addRecentMessage(destinationJid, msgId, message)
			}
		}, meId)

		return msgId
	}

	const getMessageType = (message: proto.IMessage) => {
		const normalizedMessage = normalizeMessageContent(message)
		if (!normalizedMessage) return 'text'

		if (normalizedMessage.reactionMessage || normalizedMessage.encReactionMessage) {
			return 'reaction'
		}

		if (
			normalizedMessage.pollCreationMessage ||
			normalizedMessage.pollCreationMessageV2 ||
			normalizedMessage.pollCreationMessageV3 ||
			normalizedMessage.pollUpdateMessage
		) {
			return 'poll'
		}

		if (normalizedMessage.eventMessage) {
			return 'event'
		}

		if (getMediaType(normalizedMessage) !== '') {
			return 'media'
		}

		return 'text'
	}

	const getMediaType = (message: proto.IMessage) => {
		if (message.imageMessage) {
			return 'image'
		} else if (message.videoMessage) {
			return message.videoMessage.gifPlayback ? 'gif' : 'video'
		} else if (message.audioMessage) {
			return message.audioMessage.ptt ? 'ptt' : 'audio'
		} else if (message.contactMessage) {
			return 'vcard'
		} else if (message.documentMessage) {
			return 'document'
		} else if (message.contactsArrayMessage) {
			return 'contact_array'
		} else if (message.liveLocationMessage) {
			return 'livelocation'
		} else if (message.stickerMessage) {
			return 'sticker'
		} else if (message.listMessage) {
			return 'list'
		} else if (message.listResponseMessage) {
			return 'list_response'
		} else if (message.buttonsResponseMessage) {
			return 'buttons_response'
		} else if (message.orderMessage) {
			return 'order'
		} else if (message.productMessage) {
			return 'product'
		} else if (message.interactiveResponseMessage) {
			return 'native_flow_response'
		} else if (message.groupInviteMessage) {
			return 'url'
		}

		return ''
	}

	const issuePrivacyTokens = async (jids: string[], timestamp?: number) => {
		const t = (timestamp ?? unixTimestampSeconds()).toString()
		const result = await query({
			tag: 'iq',
			attrs: {
				to: S_WHATSAPP_NET,
				type: 'set',
				xmlns: 'privacy'
			},
			content: [
				{
					tag: 'tokens',
					attrs: {},
					content: jids.map(jid => ({
						tag: 'token',
						attrs: {
							jid: jidNormalizedUser(jid),
							t,
							type: 'trusted_contact'
						}
					}))
				}
			]
		})

		return result
	}

	const waUploadToServer = getWAUploadToServer(config, refreshMediaConn)

	const waitForMsgMediaUpdate = bindWaitForEvent(ev, 'messages.media-update')

	registerSocketEndHandler(() => {
		if (!config.userDevicesCache && userDevicesCache.close) {
			userDevicesCache.close()
		}

		mediaConn = undefined
		if (messageRetryManager) {
			messageRetryManager.clear()
		}
	})

	const sendMessage = async (jid: string, content: AnyMessageContent, options: MiscMessageGenerationOptions = {}) => {
		const userJid = authState.creds.me!.id
		if (
			typeof content === 'object' &&
			'disappearingMessagesInChat' in content &&
			typeof content['disappearingMessagesInChat'] !== 'undefined' &&
			isJidGroup(jid)
		) {
			const { disappearingMessagesInChat } = content
			const value =
				typeof disappearingMessagesInChat === 'boolean'
					? disappearingMessagesInChat
						? WA_DEFAULT_EPHEMERAL
						: 0
					: disappearingMessagesInChat
			await groupToggleEphemeral(jid, value)
		} else if (typeof content === 'object' && 'album' in content && Array.isArray((content as any).album)) {
			const albumItems: any[] = (content as any).album
			const mainCaption = (content as any).caption
			if (mainCaption && albumItems[0] && !albumItems[0].caption) {
				albumItems[0].caption = mainCaption
			}

			const albumParentMsg = await generateWAMessageFromContent(
				jid,
				{
					albumMessage: {
						expectedImageCount: albumItems.filter(item => 'image' in item).length,
						expectedVideoCount: albumItems.filter(item => 'video' in item).length
					}
				},
				{ userJid, ...options }
			)
			if (albumParentMsg.message) {
				albumParentMsg.message.messageContextInfo = {
					...(albumParentMsg.message.messageContextInfo || {}),
					messageSecret: randomBytes(32)
				}
			}

			await relayMessage(jid, albumParentMsg.message!, {
				messageId: albumParentMsg.key.id!,
				useCachedGroupMetadata: options.useCachedGroupMetadata,
				statusJidList: options.statusJidList
			})

			const delayMs = (content as any).delayMs !== undefined ? (content as any).delayMs : 100

			for (const mediaItem of albumItems) {
				let childMsg: any
				const isImg = 'image' in mediaItem
				const isVid = 'video' in mediaItem

				if (isImg) {
					childMsg = await generateWAMessage(
						jid,
						{
							image: mediaItem.image,
							...(mediaItem.caption ? { caption: mediaItem.caption } : {}),
							albumParentKey: albumParentMsg.key,
							...options
						},
						{
							userJid,
							upload: async (readStream: any, opts: any) => {
								return waUploadToServer(readStream, {
									...opts,
									newsletter: isJidNewsletter(jid)
								})
							},
							...options
						}
					)
				} else if (isVid) {
					childMsg = await generateWAMessage(
						jid,
						{
							video: mediaItem.video,
							...(mediaItem.caption ? { caption: mediaItem.caption } : {}),
							...(mediaItem.gifPlayback !== undefined ? { gifPlayback: mediaItem.gifPlayback } : {}),
							albumParentKey: albumParentMsg.key,
							...options
						},
						{
							userJid,
							upload: async (readStream: any, opts: any) => {
								return waUploadToServer(readStream, {
									...opts,
									newsletter: isJidNewsletter(jid)
								})
							},
							...options
						}
					)
				}

				if (childMsg?.message) {
					childMsg.message.messageContextInfo = {
						...(childMsg.message.messageContextInfo || {}),
						messageSecret: randomBytes(32),
						messageAssociation: {
							associationType: 1,
							parentMessageKey: albumParentMsg.key
						}
					}

					await relayMessage(jid, childMsg.message, {
						messageId: childMsg.key.id!,
						useCachedGroupMetadata: options.useCachedGroupMetadata,
						statusJidList: options.statusJidList
					})

					if (delayMs > 0) {
						await new Promise(r => setTimeout(r, delayMs))
					}
				}
			}

			if (config.emitOwnEvents) {
				process.nextTick(async () => {
					await messageMutex.mutex(() => upsertMessage(albumParentMsg, 'append'))
				})
			}

			return albumParentMsg
		} else {
			const fullMsg = await generateWAMessage(jid, content, {
				logger,
				userJid,
				getUrlInfo: text =>
					getUrlInfo(text, {
						thumbnailWidth: linkPreviewImageThumbnailWidth,
						fetchOpts: {
							timeout: 3_000,
							...(httpRequestOptions || {})
						},
						logger,
						uploadImage: generateHighQualityLinkPreview ? waUploadToServer : undefined
					}),
				//TODO: CACHE
				getProfilePicUrl: sock.profilePictureUrl,
				getCallLink: sock.createCallLink,
				upload: waUploadToServer,
				mediaCache: config.mediaCache,
				options: config.options,
				messageId: generateMessageIDV2(sock.user?.id),
				...options
			})
			const isEventMsg = 'event' in content && !!content.event
			const isDeleteMsg = 'delete' in content && !!content.delete
			const isEditMsg = 'edit' in content && !!content.edit
			const isPinMsg = 'pin' in content && !!content.pin
			const isPollMessage = 'poll' in content && !!content.poll
			const additionalAttributes: BinaryNodeAttributes = {}
			const additionalNodes: BinaryNode[] = []
			// required for delete
			if (isDeleteMsg) {
				// if the chat is a group, and I am not the author, then delete the message as an admin
				if (isJidGroup(content.delete?.remoteJid as string) && !content.delete?.fromMe) {
					additionalAttributes.edit = '8'
				} else {
					additionalAttributes.edit = '7'
				}
			} else if (isEditMsg) {
				additionalAttributes.edit = '1'
			} else if (isPinMsg) {
				additionalAttributes.edit = '2'
			} else if (isPollMessage) {
				additionalNodes.push({
					tag: 'meta',
					attrs: {
						polltype: 'creation'
					}
				} as BinaryNode)
			} else if (isEventMsg) {
				additionalNodes.push({
					tag: 'meta',
					attrs: {
						event_type: 'creation'
					}
				} as BinaryNode)
			}

			await relayMessage(jid, fullMsg.message!, {
				messageId: fullMsg.key.id!,
				useCachedGroupMetadata: options.useCachedGroupMetadata,
				additionalAttributes,
				statusJidList: options.statusJidList,
				additionalNodes
			})
			if (config.emitOwnEvents) {
				process.nextTick(async () => {
					await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'))
				})
			}

			return fullMsg
		}
	}

	return {
		...sock,
		userDevicesCache,
		devicesMutex,
		issuePrivacyTokens,
		assertSessions,
		relayMessage,
		sendReceipt,
		sendReceipts,
		readMessages,
		refreshMediaConn,
		// Function (not getter) so the spread in chats.ts preserves the live closure binding.
		getMediaHost: () => mediaHost,
		waUploadToServer,
		fetchPrivacySettings,
		sendPeerDataOperationMessage,
		createParticipantNodes,
		getUSyncDevices,
		messageRetryManager,
		updateMemberLabel,
		updateMediaMessage: async (message: WAMessage) => {
			const content = assertMediaContent(message.message)
			const mediaKey = content.mediaKey!
			const meId = authState.creds.me!.id
			const node = encryptMediaRetryRequest(message.key, mediaKey, meId)

			let error: Error | undefined = undefined
			await Promise.all([
				sendNode(node),
				waitForMsgMediaUpdate(async update => {
					const result = update.find(c => c.key.id === message.key.id)
					if (result) {
						if (result.error) {
							error = result.error
						} else {
							try {
								const media = decryptMediaRetryData(result.media!, mediaKey, result.key.id!)
								if (media.result !== proto.MediaRetryNotification.ResultType.SUCCESS) {
									const resultStr = proto.MediaRetryNotification.ResultType[media.result!]
									throw new Boom(`Media re-upload failed by device (${resultStr})`, {
										data: media,
										statusCode: getStatusCodeForMediaRetry(media.result!) || 404
									})
								}

								content.directPath = media.directPath
								content.url = getUrlFromDirectPath(content.directPath!, mediaHost)

								logger.debug({ directPath: media.directPath, key: result.key }, 'media update successful')
							} catch (err: any) {
								error = err
							}
						}

						return true
					}
				})
			])

			if (error) {
				throw error
			}

			ev.emit('messages.update', [{ key: message.key, update: { message: message.message } }])

			return message
		},
		sendMessage,
		sendButton: async function (
			this: any,
			jid: string,
			content: ButtonMessageContent,
			options: MiscMessageGenerationOptions = {}
		) {
			const interactiveContent = await formatInteractiveButtonMessage(content, {
				upload: waUploadToServer
			})

			const quoted = options.quoted || content.quoted
			const fullMsg = await generateWAMessageFromContent(
				jid,
				interactiveContent,
				{
					userJid: authState.creds.me!.id,
					quoted,
					...options
				}
			)

			const relayFn = this?.relayMessage || relayMessage
			await relayFn(jid, fullMsg.message!, {
				messageId: fullMsg.key.id!,
				useCachedGroupMetadata: options.useCachedGroupMetadata,
				statusJidList: options.statusJidList
			})

			if (config.emitOwnEvents) {
				process.nextTick(async () => {
					await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'))
				})
			}

			return fullMsg
		},
		/**
		 * Send an interactive List Menu with sections and selectable rows
		 */
		sendListMenu: async function (
			this: any,
			jid: string,
			content: ListMenuContent,
			options: MiscMessageGenerationOptions = {}
		) {
			const interactiveContent = await formatListMenuMessage(content, {
				upload: waUploadToServer
			})

			const quoted = options.quoted || content.quoted
			const fullMsg = await generateWAMessageFromContent(
				jid,
				interactiveContent,
				{
					userJid: authState.creds.me!.id,
					quoted,
					...options
				}
			)

			const relayFn = this?.relayMessage || relayMessage
			await relayFn(jid, fullMsg.message!, {
				messageId: fullMsg.key.id!,
				useCachedGroupMetadata: options.useCachedGroupMetadata,
				statusJidList: options.statusJidList
			})

			if (config.emitOwnEvents) {
				process.nextTick(async () => {
					await messageMutex.mutex(() => upsertMessage(fullMsg, 'append'))
				})
			}

			return fullMsg
		},
		/**
		 * Broadcast a WhatsApp status/story mentioning members of specific groups or contacts.
		 */
		broadcastGroupStory: async (
			content: AnyMessageContent,
			jids: string[] = []
		): Promise<WAMessage> => {
			const meJid = jidNormalizedUser(authState.creds.me!.id)
			const allTargetUsers = new Set<string>()
			allTargetUsers.add(meJid)

			for (const targetJid of jids) {
				if (isJidGroup(targetJid)) {
					try {
						const meta = await groupMetadata(targetJid)
						meta.participants.forEach(p => allTargetUsers.add(jidNormalizedUser(p.id)))
					} catch (error) {
						logger.warn({ targetJid, error }, 'failed to fetch group metadata for story mention')
					}
				} else {
					allTargetUsers.add(jidNormalizedUser(targetJid))
				}
			}

			const uniqueUsers = Array.from(allTargetUsers)
			const statusMsg = await generateWAMessage(
				STORIES_JID,
				content,
				{
					logger,
					userJid: meJid,
					upload: waUploadToServer,
					mediaCache: config.mediaCache,
					options: config.options
				}
			)

			await relayMessage(STORIES_JID, statusMsg.message!, {
				messageId: statusMsg.key.id!,
				statusJidList: uniqueUsers,
				additionalNodes: [
					{
						tag: 'meta',
						attrs: {},
						content: [
							{
								tag: 'mentioned_users',
								attrs: {},
								content: jids.map(j => ({
									tag: 'to',
									attrs: { jid: jidNormalizedUser(j) }
								}))
							}
						]
					}
				]
			})

			// Deliver status mention notification to targeted groups/users
			for (const targetJid of jids) {
				try {
					const normalized = jidNormalizedUser(targetJid)
					const isPrivate = !isJidGroup(normalized)
					const mentionType = isPrivate ? 'statusMentionMessage' : 'groupStatusMentionMessage'
					const mentionPayload = {
						[mentionType]: {
							message: {
								protocolMessage: {
									key: statusMsg.key,
									type: 25
								}
							}
						},
						messageContextInfo: {
							messageSecret: randomBytes(32)
						}
					}
					const notifMsg = await generateWAMessageFromContent(
						normalized,
						mentionPayload,
						{ userJid: meJid }
					)
					await relayMessage(normalized, notifMsg.message!, {
						additionalNodes: [
							{
								tag: 'meta',
								attrs: isPrivate ? { is_status_mention: 'true' } : { is_group_status_mention: 'true' }
							}
						]
					})
				} catch (err) {
					logger.warn({ targetJid, err }, 'failed to send story notification node')
				}
			}

			return statusMsg
		},
		/** Alias for broadcastGroupStory */
		sendStatusMention: async function (this: any, content: AnyMessageContent, jids: string[] = []) {
			const fn = this?.broadcastGroupStory
			return fn ? fn(content, jids) : undefined
		},
		/**
		 * Edit an already sent message
		 */
		editMessage: async function (
			this: any,
			chat: string,
			key: WAMessageKey,
			content: string | AnyMessageContent,
			options?: MiscMessageGenerationOptions
		) {
			const payload: AnyMessageContent = typeof content === 'string' ? { text: content } : content
			const sendFn = this?.sendMessage || sendMessage
			return sendFn(chat, { ...payload, edit: key }, options)
		},
		/**
		 * Delete a message either globally (for everyone / revoke) or locally (for me)
		 */
		deleteMessage: async function (
			this: any,
			chat: string,
			key: WAMessageKey,
			forEveryone = true
		) {
			if (forEveryone) {
				const deleteKey: WAMessageKey = {
					remoteJid: chat,
					id: key.id,
					fromMe: key.fromMe,
					participant: key.participant
				}
				const sendFn = this?.sendMessage || sendMessage
				return sendFn(chat, { delete: deleteKey })
			} else {
				const chatMod = this?.chatModify || (sock as any).chatModify
				if (typeof chatMod === 'function') {
					return chatMod(
						{
							deleteForMe: {
								deleteMedia: true,
								key,
								timestamp: Date.now()
							}
						},
						chat
					)
				}
			}
		},
		/**
		 * Check if a user (or the bot itself) is admin in a given group
		 */
		isGroupAdmin: async function (this: any, groupJid: string, targetJid?: string): Promise<boolean> {
			if (!isJidGroup(groupJid)) return false
			const checkJid = targetJid || authState.creds.me?.id
			if (!checkJid) return false

			const targetPn = lidCache.resolveToPN(checkJid)
			const targetLid = lidCache.getLID(checkJid)
			const targetDigits = lidCache.extractDigits(checkJid)
			const normalizedTarget = jidNormalizedUser(checkJid)
			const normalizedTargetPn = jidNormalizedUser(targetPn)

			const fetchGroupMeta = this?.groupMetadata || (sock as any).groupMetadata || groupMetadata
			const metadata = await fetchGroupMeta(groupJid)
			if (!metadata || !Array.isArray(metadata.participants)) return false

			const participant = metadata.participants.find((p: any) => {
				const pPn = jidNormalizedUser(p.phoneNumber ? (p.phoneNumber.includes('@') ? p.phoneNumber : `${p.phoneNumber}@s.whatsapp.net`) : p.id)
				const pId = jidNormalizedUser(p.id)
				const pResolvedPn = lidCache.resolveToPN(p.id)
				const pDigits = lidCache.extractDigits(p.phoneNumber || p.id || '')

				const matchDirect = pPn === normalizedTarget || pId === normalizedTarget || p.lid === checkJid
				const matchPn = pPn === normalizedTargetPn || jidNormalizedUser(pResolvedPn) === normalizedTargetPn
				const matchLid = Boolean(targetLid && (p.lid === targetLid || p.id === targetLid))
				const matchDigits = Boolean(targetDigits && targetDigits.length >= 7 && pDigits && pDigits === targetDigits)

				return matchDirect || matchPn || matchLid || matchDigits
			})
			return Boolean(participant?.admin === 'admin' || participant?.admin === 'superadmin')
		},
		/**
		 * Pin a message in chat
		 */
		pinMessage: async function (this: any, chat: string, key: WAMessageKey, durationSeconds = 86400) {
			const sendFn = this?.sendMessage || sendMessage
			return sendFn(chat, {
				pin: {
					key,
					type: proto.PinInChat.Type.PIN_FOR_ALL,
					time: durationSeconds
				}
			} as any)
		},
		/**
		 * Unpin a message in chat
		 */
		unpinMessage: async function (this: any, chat: string, key: WAMessageKey) {
			const sendFn = this?.sendMessage || sendMessage
			return sendFn(chat, {
				pin: {
					key,
					type: proto.PinInChat.Type.UNPIN_FOR_ALL,
					time: 0
				}
			} as any)
		},
		/**
		 * Send a poll easily with comprehensive configuration
		 */
		sendPoll: async function (
			this: any,
			chat: string,
			pollOrName: {
				name: string
				values: string[]
				selectableCount?: number
				multipleAnswers?: boolean
				toAnnouncementGroup?: boolean
				messageSecret?: Buffer | Uint8Array
				mentions?: string[]
			} | string,
			valuesOrOptions?: string[] | MiscMessageGenerationOptions,
			selectableCountOrOptions?: number | MiscMessageGenerationOptions,
			options?: MiscMessageGenerationOptions
		) {
			const sendFn = this?.sendMessage || sendMessage
			let pollConfig: {
				name: string
				values: string[]
				selectableCount?: number
				toAnnouncementGroup?: boolean
				messageSecret?: Buffer | Uint8Array
			}
			let mergedOptions: MiscMessageGenerationOptions | undefined = options

			if (typeof pollOrName === 'string') {
				const values = Array.isArray(valuesOrOptions) ? valuesOrOptions : []
				let selectableCount = typeof selectableCountOrOptions === 'number' ? selectableCountOrOptions : 1
				if (typeof selectableCountOrOptions === 'object') {
					mergedOptions = selectableCountOrOptions
				}
				pollConfig = {
					name: pollOrName,
					values,
					selectableCount
				}
			} else {
				let selectableCount = pollOrName.selectableCount
				if (typeof pollOrName.multipleAnswers === 'boolean') {
					selectableCount = pollOrName.multipleAnswers ? 0 : 1
				} else if (typeof selectableCount === 'undefined') {
					selectableCount = 1
				}

				pollConfig = {
					name: pollOrName.name,
					values: pollOrName.values,
					selectableCount,
					toAnnouncementGroup: pollOrName.toAnnouncementGroup,
					messageSecret: pollOrName.messageSecret
				}

				if (typeof valuesOrOptions === 'object' && !Array.isArray(valuesOrOptions)) {
					mergedOptions = valuesOrOptions
				} else if (typeof selectableCountOrOptions === 'object') {
					mergedOptions = selectableCountOrOptions
				}
			}

			const mentions = typeof pollOrName === 'object' && pollOrName.mentions?.length ? pollOrName.mentions : undefined

			return sendFn(
				chat,
				{
					poll: pollConfig,
					mentions
				},
				mergedOptions
			)
		},
		/**
		 * Send contact card easily
		 */
		sendContact: async function (
			this: any,
			chat: string,
			contact: { name: string; number: string },
			options?: MiscMessageGenerationOptions
		) {
			const cleanNumber = contact.number.replace(/\D/g, '')
			const vcard =
				'BEGIN:VCARD\n' +
				'VERSION:3.0\n' +
				`FN:${contact.name}\n` +
				`ORG:${contact.name}\n` +
				`TEL;type=CELL;type=VOICE;waid=${cleanNumber}:+${cleanNumber}\n` +
				'END:VCARD'
			const sendFn = this?.sendMessage || sendMessage
			return sendFn(
				chat,
				{
					contacts: {
						displayName: contact.name,
						contacts: [{ vcard }]
					}
				},
				options
			)
		},
		/**
		 * Inspect phone number in detail (registered, bio, banned, appeal, business)
		 */
		inspectPhoneNumber: async function (
			this: any,
			input: string,
			options?: InspectPhoneOptions
		) {
			const s = this || sock
			return inspectPhoneNumber(s, input, options)
		},
		inspectPhone: async function (
			this: any,
			input: string,
			options?: InspectPhoneOptions
		) {
			const s = this || sock
			return inspectPhoneNumber(s, input, options)
		},
		/**
		 * Send a multi-media album (images/videos grouped into a single album in WhatsApp)
		 */
		sendAlbum: async function (
			this: any,
			chat: string,
			medias: AlbumMediaItem[],
			options?: MiscMessageGenerationOptions & { caption?: string; delayMs?: number }
		) {
			const sendFn = this?.sendMessage || sendMessage
			const { caption, delayMs, ...restOptions } = options || {}
			return sendFn(
				chat,
				{
					album: medias,
					caption,
					delayMs
				},
				restOptions
			)
		}
	}
}
