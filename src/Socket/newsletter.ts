import type { NewsletterCreateResponse, SocketConfig, WAMediaUpload } from '../Types'
import type { NewsletterMetadata, NewsletterUpdate } from '../Types'
import { QueryIds, XWAPaths } from '../Types'
import { generateProfilePicture } from '../Utils/messages-media'
import { getBinaryNodeChild } from '../WABinary'
import { makeGroupsSocket } from './groups'
import { executeWMexQuery as genericExecuteWMexQuery } from './mex'

const extractNewsletterData = (data: any): NewsletterMetadata => {
	if (!data || typeof data !== 'object') {
		return { id: '', name: '-' }
	}

	const raw = data.xwa2_newsletter_create || data.xwa2_newsletter || data.result || data
	const thread = raw.thread_metadata || raw
	const viewer = raw.viewer_metadata || {}

	const name =
		typeof thread.name === 'string'
			? thread.name
			: thread.name?.text || raw.name || '-'

	const description =
		typeof thread.description === 'string'
			? thread.description
			: thread.description?.text || raw.description || undefined

	const subscribersCount =
		thread.subscribers_count !== undefined
			? parseInt(String(thread.subscribers_count), 10)
			: raw.subscribers !== undefined
			? parseInt(String(raw.subscribers), 10)
			: undefined

	const creationTime =
		thread.creation_time !== undefined
			? parseInt(String(thread.creation_time), 10)
			: raw.creation_time !== undefined
			? parseInt(String(raw.creation_time), 10)
			: undefined

	const picture = thread.picture || raw.picture
	const picObj = picture && typeof picture === 'object'
		? {
				id: picture.id || undefined,
				directPath: picture.direct_path || picture.directPath || undefined,
				url: picture.url || undefined
		  }
		: undefined

	return {
		id: raw.id || '',
		owner: raw.owner || undefined,
		name,
		creation_time: creationTime,
		description,
		invite: thread.invite || raw.invite || undefined,
		subscribers: Number.isNaN(subscribersCount) ? 0 : subscribersCount,
		verification: thread.verification || raw.verification || undefined,
		picture: picObj,
		mute_state: viewer.mute || raw.mute_state || undefined,
		thread_metadata: {
			creation_time: creationTime,
			name,
			description
		}
	}
}

const parseNewsletterCreateResponse = (response: NewsletterCreateResponse | any): NewsletterMetadata => {
	return extractNewsletterData(response)
}

const parseNewsletterMetadata = (result: unknown): NewsletterMetadata | null => {
	if (typeof result !== 'object' || result === null) {
		return null
	}

	return extractNewsletterData(result)
}

export const makeNewsletterSocket = (config: SocketConfig) => {
	const sock = makeGroupsSocket(config)
	const { query, generateMessageTag } = sock

	const executeWMexQuery = <T>(variables: Record<string, unknown>, queryId: string, dataPath: string): Promise<T> => {
		return genericExecuteWMexQuery<T>(variables, queryId, dataPath, query, generateMessageTag)
	}

	const newsletterUpdate = async (jid: string, updates: NewsletterUpdate) => {
		const variables = {
			newsletter_id: jid,
			updates: {
				...updates,
				settings: null
			}
		}
		return executeWMexQuery(variables, QueryIds.UPDATE_METADATA, 'xwa2_newsletter_update')
	}

	return {
		...sock,
		newsletterCreate: async (name: string, description?: string): Promise<NewsletterMetadata> => {
			const variables = {
				input: {
					name,
					description: description ?? null
				}
			}
			const rawResponse = await executeWMexQuery<NewsletterCreateResponse>(
				variables,
				QueryIds.CREATE,
				XWAPaths.xwa2_newsletter_create
			)
			return parseNewsletterCreateResponse(rawResponse)
		},

		newsletterUpdate,

		newsletterSubscribers: async (jid: string) => {
			return executeWMexQuery<{ subscribers: number }>(
				{ newsletter_id: jid },
				QueryIds.SUBSCRIBERS,
				XWAPaths.xwa2_newsletter_subscribers
			)
		},

		newsletterMetadata: async (type: 'invite' | 'jid', key: string) => {
			const variables = {
				fetch_creation_time: true,
				fetch_full_image: true,
				fetch_viewer_metadata: true,
				input: {
					key,
					type: type.toUpperCase(),
					view_role: 'GUEST'
				}
			}
			const result = await executeWMexQuery<unknown>(variables, QueryIds.METADATA, XWAPaths.xwa2_newsletter_metadata)
			return parseNewsletterMetadata(result)
		},

		newsletterFollow: (jid: string) => {
			return executeWMexQuery({ newsletter_id: jid }, QueryIds.FOLLOW, XWAPaths.xwa2_newsletter_join_v2)
		},

		newsletterUnfollow: (jid: string) => {
			return executeWMexQuery({ newsletter_id: jid }, QueryIds.UNFOLLOW, XWAPaths.xwa2_newsletter_leave_v2)
		},

		newsletterMute: (jid: string) => {
			return executeWMexQuery({ newsletter_id: jid }, QueryIds.MUTE, XWAPaths.xwa2_newsletter_mute_v2)
		},

		newsletterUnmute: (jid: string) => {
			return executeWMexQuery({ newsletter_id: jid }, QueryIds.UNMUTE, XWAPaths.xwa2_newsletter_unmute_v2)
		},

		newsletterUpdateName: async (jid: string, name: string) => {
			return await newsletterUpdate(jid, { name })
		},

		newsletterUpdateDescription: async (jid: string, description: string) => {
			return await newsletterUpdate(jid, { description })
		},

		newsletterUpdatePicture: async (jid: string, content: WAMediaUpload) => {
			const { img } = await generateProfilePicture(content)
			return await newsletterUpdate(jid, { picture: img.toString('base64') })
		},

		newsletterRemovePicture: async (jid: string) => {
			return await newsletterUpdate(jid, { picture: '' })
		},

		newsletterReactMessage: async (jid: string, serverId: string, reaction?: string) => {
			await query({
				tag: 'message',
				attrs: {
					to: jid,
					...(reaction ? {} : { edit: '7' }),
					type: 'reaction',
					server_id: serverId,
					id: generateMessageTag()
				},
				content: [
					{
						tag: 'reaction',
						attrs: reaction ? { code: reaction } : {}
					}
				]
			})
		},

		newsletterFetchMessages: async (jid: string, count: number, since: number, after: number) => {
			const messageUpdateAttrs: { count: string; since?: string; after?: string } = {
				count: count.toString()
			}
			if (typeof since === 'number') {
				messageUpdateAttrs.since = since.toString()
			}

			if (after) {
				messageUpdateAttrs.after = after.toString()
			}

			const result = await query({
				tag: 'iq',
				attrs: {
					id: generateMessageTag(),
					type: 'get',
					xmlns: 'newsletter',
					to: jid
				},
				content: [
					{
						tag: 'message_updates',
						attrs: messageUpdateAttrs
					}
				]
			})
			return result
		},

		subscribeNewsletterUpdates: async (jid: string): Promise<{ duration: string } | null> => {
			const result = await query({
				tag: 'iq',
				attrs: {
					id: generateMessageTag(),
					type: 'set',
					xmlns: 'newsletter',
					to: jid
				},
				content: [{ tag: 'live_updates', attrs: {}, content: [] }]
			})
			const liveUpdatesNode = getBinaryNodeChild(result, 'live_updates')
			const duration = liveUpdatesNode?.attrs?.duration
			return duration ? { duration: duration } : null
		},

		newsletterAdminCount: async (jid: string): Promise<number> => {
			const response = await executeWMexQuery<{ admin_count: number }>(
				{ newsletter_id: jid },
				QueryIds.ADMIN_COUNT,
				XWAPaths.xwa2_newsletter_admin_count
			)
			return response.admin_count
		},

		newsletterChangeOwner: async (jid: string, newOwnerJid: string) => {
			await executeWMexQuery(
				{ newsletter_id: jid, user_id: newOwnerJid },
				QueryIds.CHANGE_OWNER,
				XWAPaths.xwa2_newsletter_change_owner
			)
		},

		newsletterDemote: async (jid: string, userJid: string) => {
			await executeWMexQuery({ newsletter_id: jid, user_id: userJid }, QueryIds.DEMOTE, XWAPaths.xwa2_newsletter_demote)
		},

		newsletterDelete: async (jid: string) => {
			await executeWMexQuery({ newsletter_id: jid }, QueryIds.DELETE, XWAPaths.xwa2_newsletter_delete_v2)
		},

		newsletterFetchAllSubscribed: async () => {
			const list = await executeWMexQuery<any[]>(
				{},
				QueryIds.SUBSCRIBED,
				XWAPaths.xwa2_newsletter_subscribed
			)
			if (Array.isArray(list)) {
				return list.map(extractNewsletterData)
			}
			return []
		},

		newsletterReactionMode: async (jid: string, mode: 'ALL' | 'BASIC' | 'NONE') => {
			return executeWMexQuery(
				{
					newsletter_id: jid,
					updates: {
						settings: {
							reaction_codes: { value: mode }
						}
					}
				},
				QueryIds.JOB_MUTATION,
				'xwa2_newsletter_update'
			)
		},

		/**
		 * Inspect newsletter / channel ID and metadata from a channel invite link or code
		 * Example: https://whatsapp.com/channel/0029Va4KqKG4Crfhi18D7p2j or '0029Va4KqKG4Crfhi18D7p2j'
		 */
		newsletterId: async (urlOrCode: string): Promise<NewsletterMetadata | null> => {
			let code = urlOrCode.trim()
			const isJid = code.endsWith('@newsletter')

			if (!isJid) {
				if (code.includes('whatsapp.com/channel/')) {
					const afterChannel = code.split('whatsapp.com/channel/')[1] || ''
					const parts = afterChannel.split(/[/?#]/)
					code = parts[0] || code
				} else if (code.includes('/')) {
					const segments = code.split('/').filter(Boolean)
					code = segments[segments.length - 1] || code
				}
			}

			const variables = {
				fetch_creation_time: true,
				fetch_full_image: true,
				fetch_viewer_metadata: true,
				input: {
					key: code,
					type: isJid ? 'JID' : 'INVITE',
					view_role: 'GUEST'
				}
			}
			const result = await executeWMexQuery<unknown>(variables, QueryIds.METADATA, XWAPaths.xwa2_newsletter_metadata)
			return parseNewsletterMetadata(result)
		}
	}
}

export type NewsletterSocket = ReturnType<typeof makeNewsletterSocket>
