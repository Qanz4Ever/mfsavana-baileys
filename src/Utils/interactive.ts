import crypto from 'crypto'
import { proto } from '../../WAProto/index.js'
import type {
	ButtonMessageContent,
	ButtonSection,
	ButtonSectionRow,
	InteractiveButtonItem,
	InteractiveButtonType,
	WAMediaUpload,
	WAMessage
} from '../Types'
import { prepareWAMessageMedia } from './messages'

export type {
	ButtonMessageContent,
	ButtonSection,
	ButtonSectionRow,
	InteractiveButtonItem,
	InteractiveButtonType
}

/**
 * Format a single user-friendly button item into proto NativeFlowButton
 */
export const formatInteractiveButton = (
	item: InteractiveButtonItem
): proto.Message.InteractiveMessage.NativeFlowMessage.INativeFlowButton => {
	const rawType = (item.type || item.name || 'quick_reply').toLowerCase()
	const displayText = item.text || item.displayText || item.display_text || ''

	// 1. Copy to Clipboard button (cta_copy)
	if (rawType === 'copy' || rawType === 'cta_copy') {
		const copyCode = item.copy || item.code || item.copy_code || displayText
		return {
			name: 'cta_copy',
			buttonParamsJson: JSON.stringify({
				display_text: displayText,
				copy_code: copyCode
			})
		}
	}

	// 2. Open URL button (cta_url)
	if (rawType === 'url' || rawType === 'cta_url') {
		const targetUrl = item.url || item.link || ''
		return {
			name: 'cta_url',
			buttonParamsJson: JSON.stringify({
				display_text: displayText,
				url: targetUrl,
				merchant_url: item.merchant_url || targetUrl
			})
		}
	}

	// 3. Phone Call button (cta_call)
	if (rawType === 'call' || rawType === 'cta_call') {
		const phone = item.phone || item.phoneNumber || item.id || ''
		return {
			name: 'cta_call',
			buttonParamsJson: JSON.stringify({
				display_text: displayText,
				id: phone
			})
		}
	}

	// 4. Reminder button (cta_reminder)
	if (rawType === 'reminder' || rawType === 'cta_reminder') {
		return {
			name: 'cta_reminder',
			buttonParamsJson: JSON.stringify({
				display_text: displayText,
				id: item.id || ''
			})
		}
	}

	// 5. Cancel Reminder button (cta_cancel_reminder)
	if (rawType === 'cancel_reminder' || rawType === 'cta_cancel_reminder') {
		return {
			name: 'cta_cancel_reminder',
			buttonParamsJson: JSON.stringify({
				display_text: displayText,
				id: item.id || ''
			})
		}
	}

	// 6. Single Select List button (single_select)
	if (rawType === 'list' || rawType === 'single_select') {
		if (item.buttonParamsJson) {
			return {
				name: 'single_select',
				buttonParamsJson:
					typeof item.buttonParamsJson === 'string'
						? item.buttonParamsJson
						: JSON.stringify(item.buttonParamsJson)
			}
		}
		return {
			name: 'single_select',
			buttonParamsJson: JSON.stringify({
				title: item.title || displayText || 'Select',
				sections: item.sections || []
			})
		}
	}

	// 7. Send Location button (send_location)
	if (rawType === 'location' || rawType === 'send_location') {
		const params =
			typeof item.buttonParamsJson === 'string'
				? JSON.parse(item.buttonParamsJson)
				: item.buttonParamsJson || {}
		return {
			name: 'send_location',
			buttonParamsJson: JSON.stringify(params)
		}
	}

	// 8. Custom or Raw button
	if (item.name && item.buttonParamsJson) {
		return {
			name: item.name,
			buttonParamsJson:
				typeof item.buttonParamsJson === 'string'
					? item.buttonParamsJson
					: JSON.stringify(item.buttonParamsJson)
		}
	}

	// 9. Default Quick Reply button (quick_reply)
	return {
		name: 'quick_reply',
		buttonParamsJson: JSON.stringify({
			display_text: displayText,
			id: item.id || displayText
		})
	}
}

/**
 * Build a complete Interactive Button message wrapped in viewOnceMessage
 */
export const formatInteractiveButtonMessage = async (
	content: ButtonMessageContent,
	options: { upload?: any } = {}
): Promise<proto.IMessage> => {
	const bodyText = content.text || content.body || content.caption || ''
	const footerText = content.footer || ''
	const headerTitle = content.title || ''
	const headerSubtitle = content.subtitle || ''

	// Format native flow buttons
	const protoButtons = (content.buttons || []).map(formatInteractiveButton)

	// Prepare Header
	const header: proto.Message.InteractiveMessage.IHeader = {
		title: headerTitle || undefined,
		subtitle: headerSubtitle || undefined,
		hasMediaAttachment: false
	}

	if (content.image && options.upload) {
		const media = await prepareWAMessageMedia(
			{ image: content.image, jpegThumbnail: content.jpegThumbnail as any },
			{ upload: options.upload }
		)
		header.imageMessage = media.imageMessage
		header.hasMediaAttachment = true
	} else if (content.video && options.upload) {
		const media = await prepareWAMessageMedia(
			{ video: content.video, jpegThumbnail: content.jpegThumbnail as any },
			{ upload: options.upload }
		)
		header.videoMessage = media.videoMessage
		header.hasMediaAttachment = true
	} else if (content.document && options.upload) {
		const docPayload: any = {
			document: content.document,
			mimetype: content.mimetype,
			fileName: content.fileName
		}
		if (content.jpegThumbnail) {
			docPayload.jpegThumbnail = content.jpegThumbnail
		}
		const media = await prepareWAMessageMedia(docPayload, { upload: options.upload })
		header.documentMessage = media.documentMessage
		header.hasMediaAttachment = true
	}

	// Prepare ContextInfo
	let contextInfo: proto.IContextInfo = { ...(content.contextInfo || {}) }

	if (content.mentions?.length) {
		contextInfo.mentionedJid = content.mentions
	}

	if (content.quoted) {
		const qKey = content.quoted.key
		contextInfo.stanzaId = qKey.id
		contextInfo.participant = qKey.participant || qKey.remoteJid
		contextInfo.quotedMessage = content.quoted.message || undefined
	}

	const hasContext = Object.keys(contextInfo).length > 0

	const fullMessage: proto.IMessage = {
		viewOnceMessage: {
			message: {
				messageContextInfo: {
					deviceListMetadata: {},
					deviceListMetadataVersion: 2,
					messageSecret: crypto.randomBytes(32)
				},
				interactiveMessage: {
					header,
					body: { text: bodyText },
					footer: footerText ? { text: footerText } : undefined,
					nativeFlowMessage: {
						buttons: protoButtons,
						messageParamsJson: ''
					},
					contextInfo: hasContext ? contextInfo : undefined
				}
			}
		}
	}

	return fullMessage
}

export interface ListMenuRow {
	title: string
	id: string
	description?: string
	header?: string
}

export interface ListMenuSection {
	title: string
	highlight_label?: string
	rows: ListMenuRow[]
}

export interface ListMenuContent {
	title?: string
	subtitle?: string
	body?: string
	text?: string
	caption?: string
	footer?: string
	buttonText?: string
	sections: ListMenuSection[]
	image?: WAMediaUpload
	video?: WAMediaUpload
	document?: WAMediaUpload
	fileName?: string
	mimetype?: string
	jpegThumbnail?: Buffer
	contextInfo?: proto.IContextInfo
	mentions?: string[]
	quoted?: WAMessage
}

/**
 * Build a structured interactive List Menu (single_select) message
 */
export const formatListMenuMessage = async (
	content: ListMenuContent,
	options: { upload?: any } = {}
): Promise<proto.IMessage> => {
	const buttonText = content.buttonText || 'Pilih Menu'
	const formattedSections = (content.sections || []).map(sec => ({
		title: sec.title,
		highlight_label: sec.highlight_label,
		rows: (sec.rows || []).map(r => ({
			header: r.header,
			title: r.title,
			description: r.description,
			id: r.id
		}))
	}))

	const singleSelectButton: InteractiveButtonItem = {
		name: 'single_select',
		buttonParamsJson: JSON.stringify({
			title: buttonText,
			sections: formattedSections
		})
	}

	return formatInteractiveButtonMessage(
		{
			title: content.title,
			subtitle: content.subtitle,
			text: content.text || content.body || content.caption || '',
			footer: content.footer,
			image: content.image,
			video: content.video,
			document: content.document,
			fileName: content.fileName,
			mimetype: content.mimetype,
			jpegThumbnail: content.jpegThumbnail,
			contextInfo: content.contextInfo,
			mentions: content.mentions,
			quoted: content.quoted,
			buttons: [singleSelectButton]
		},
		options
	)
}

