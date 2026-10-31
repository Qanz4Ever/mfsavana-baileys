import fs from 'fs'

// =============================================================================
// MFSAVANA WHATSAPP BOT - PRODUCTION ENGINE
// Arsitektur Modern, Resilien, Modular, dan Terlengkap
// =============================================================================

// 1. Load Environment Variables secara native
try {
	if (typeof process.loadEnvFile === 'function') {
		const envPath = fs.existsSync('.env')
			? '.env'
			: fs.existsSync('./mfsavana-baileys/.env')
			? './mfsavana-baileys/.env'
			: fs.existsSync('../.env')
			? '../.env'
			: null
		if (envPath) process.loadEnvFile(envPath)
	}
} catch {}

// 2. Deteksi lokasi library Baileys secara otomatis
const libPath = fs.existsSync('./lib/index.js')
	? './lib/index.js'
	: './mfsavana-baileys/lib/index.js'

const {
	default: makeWASocket,
	useMultiFileAuthState,
	DisconnectReason,
	ReconnectionSupervisor,
	evaluateDisconnect,
	downloadMediaMessage,
	formatSticker,
	proto,
	jidNormalizedUser,
	isJidGroup,
	isJidNewsletter
} = await import(libPath)

// =============================================================================
// KONFIGURASI GLOBAL & KEAMANAN
// =============================================================================

// Nomor Owner Resmi (Otorisasi Penuh)
const OWNER_NUMBER = process.env.OWNER_NUMBER || '6285360554431'

// File Persistensi Whitelist Grup Terverifikasi
const VERIFIED_GROUPS_FILE = fs.existsSync('./verified-groups.json')
	? './verified-groups.json'
	: fs.existsSync('../verified-groups.json')
	? '../verified-groups.json'
	: './verified-groups.json'

function loadVerifiedGroups() {
	try {
		if (fs.existsSync(VERIFIED_GROUPS_FILE)) {
			const raw = fs.readFileSync(VERIFIED_GROUPS_FILE, 'utf-8')
			const data = JSON.parse(raw)
			if (Array.isArray(data)) return new Set(data)
			if (data && Array.isArray(data.groups)) {
				return new Set(data.groups.map(g => (typeof g === 'string' ? g : g.id)))
			}
		}
	} catch (e) {
		console.error('[VERIFIED_GROUPS] Gagal membaca verified-groups.json:', e.message)
	}
	return new Set()
}

function saveVerifiedGroups(set) {
	try {
		const list = Array.from(set)
		fs.writeFileSync(VERIFIED_GROUPS_FILE, JSON.stringify({ groups: list }, null, 2), 'utf-8')
	} catch (e) {
		console.error('[VERIFIED_GROUPS] Gagal menyimpan verified-groups.json:', e.message)
	}
}

const verifiedGroups = loadVerifiedGroups()

function isOwnerSender(ctx) {
	if (typeof ctx?.isOwner === 'function') {
		return ctx.isOwner(OWNER_NUMBER)
	}
	const raw = String(ctx?.senderNumber || ctx?.sender || '').split('@')[0].split(':')[0]
	return raw.replace(/\D/g, '') === OWNER_NUMBER
}

function isGroupAllowed(chatJid) {
	if (!chatJid || !chatJid.endsWith('@g.us')) return true
	return verifiedGroups.has(chatJid)
}

function checkPermission(ctx, needsOwner = false) {
	if (needsOwner) {
		if (!isOwnerSender(ctx)) {
			ctx.reply(`⛔ *Akses Ditolak*\nPerintah ini khusus untuk Owner Resmi (+${OWNER_NUMBER}).`)
			return false
		}
		return true
	}

	if (ctx.isGroup && !isGroupAllowed(ctx.chat)) {
		if (isOwnerSender(ctx)) return true
		ctx.reply('⚠️ *Grup Belum Terverifikasi*\nHubungi Owner untuk verifikasi grup ini menggunakan `.verifgrup`.')
		return false
	}

	return true
}

// =============================================================================
// REKONEKSI SUPERVISOR (TAHAP 2 HARDENING)
// =============================================================================

const reconnectionSupervisor = new ReconnectionSupervisor({
	maxRetries: 15,
	baseDelayMs: 2000,
	maxDelayMs: 30000,
	jitter: true
})

let activeSocket = null

// =============================================================================
// REGISTRY PERINTAH LENGKAP & SISTEM PENJELASAN
// =============================================================================


const COMMAND_REGISTRY = []

function registerCommand(cmd) {
	COMMAND_REGISTRY.push(cmd)
}

function findCommand(nameOrAlias) {
	const query = (nameOrAlias || '').toLowerCase().trim()
	return COMMAND_REGISTRY.find(c => c.name === query || c.aliases.includes(query))
}

function formatCommandHelp(cmd) {
	const aliasesText = cmd.aliases.length ? cmd.aliases.map(a => `.${a}`).join(', ') : '-'
	const methodsText = cmd.baileysMethods.map(m => `\`${m}\``).join(', ')
	return (
		`📖 *PANDUAN LENGKAP PERINTAH: .${cmd.name}*\n` +
		`━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
		`• *Kategori*: ${cmd.category}\n` +
		`• *Fungsi*: ${cmd.description}\n` +
		`• *Format*: \`${cmd.usage}\`\n` +
		`• *Alias*: ${aliasesText}\n` +
		`• *Akses*: ${cmd.ownerOnly ? '👑 Owner Khusus' : cmd.groupOnly ? '👥 Grup Saja' : '🌐 Semua Chat'}\n` +
		`• *Method Baileys*: ${methodsText}\n` +
		`━━━━━━━━━━━━━━━━━━━━━━━━━━`
	)
}

// =============================================================================
// 1. KATEGORI: MENU & PESAN INTERAKTIF
// =============================================================================

registerCommand({
	name: 'menu',
	aliases: ['help', 'bantuan'],
	category: 'Menu & Interaktif',
	description: 'Menampilkan daftar seluruh perintah yang tersedia, statistik bot, atau detail teknis perintah tertentu.',
	usage: '.menu [nama_perintah]',
	baileysMethods: ['sock.sendListMenu', 'sock.sendButton', 'ctx.reply'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return

		// Jika user meminta bantuan command spesifik: .menu <command>
		if (ctx.query) {
			const targetCmd = findCommand(ctx.query.replace(/^\./, ''))
			if (targetCmd) {
				return ctx.reply(formatCommandHelp(targetCmd))
			}
			return ctx.reply(`❌ Perintah \`.${ctx.query}\` tidak ditemukan. Ketik \`.menu\` untuk melihat seluruh daftar.`)
		}

		// Kelompokkan command berdasarkan kategori
		const categories = new Map()
		for (const cmd of COMMAND_REGISTRY) {
			if (!categories.has(cmd.category)) categories.set(cmd.category, [])
			categories.get(cmd.category).push(cmd)
		}

		let menuText =
			`🤖 *MFSAVANA WHATSAPP BOT - PRODUCTION MENU*\n` +
			`━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
			`• *Owner Resmi*: +${OWNER_NUMBER}\n` +
			`• *Total Perintah*: ${COMMAND_REGISTRY.length} Fitur Siap Pakai\n` +
			`• *Grup Terverifikasi*: ${verifiedGroups.size} Grup\n` +
			`• *Sistem*: Baileys Engine Hardened Edition\n` +
			`━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`

		for (const [catName, cmds] of categories.entries()) {
			menuText += `📁 *[ ${catName.toUpperCase()} ]*\n`
			for (const c of cmds) {
				menuText += `  • \`.${c.name}\` ➔ ${c.description}\n`
			}
			menuText += `\n`
		}

		menuText +=
			`━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
			`💡 *Tips*: Ketik \`.menu <nama_perintah>\` untuk melihat parameter yang digunakan & method Baileys di balik layar!`

		// Kirim dengan menu interaktif button bantuan
		try {
			if (typeof ctx.sendButton === 'function') {
				return await ctx.sendButton({
					text: menuText,
					footer: 'MFSAVANA Engine • All Features Supported',
					buttons: [
						{ type: 'quick_reply', displayText: '⚡ Cek Ping', id: '.ping' },
						{ type: 'quick_reply', displayText: '📊 Cek Health', id: '.health' },
						{ type: 'copy', displayText: '📋 Salin Menu', copy: menuText }
					]
				})
			}
		} catch {}

		return ctx.reply(menuText)
	}
})

registerCommand({
	name: 'listmenu',
	aliases: ['pilihan', 'list'],
	category: 'Menu & Interaktif',
	description: 'Mengirim pesan pilihan tunggal interaktif (Single Select List Menu) dengan sections dan rows.',
	usage: '.listmenu',
	baileysMethods: ['sock.sendListMenu', 'sock.sendMessage'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return

		const listContent = {
			title: '📋 *DAFTAR MENU INTERAKTIF MFSAVANA*',
			body: 'Silakan klik tombol di bawah untuk memilih aksi atau menu yang ingin Anda jalankan secara langsung:',
			footer: 'MFSAVANA Interactive Engine',
			buttonText: 'Pilih Menu',
			sections: [
				{
					title: '⚡ Menu Cepat & Diagnostik',
					rows: [
						{ title: 'Ping Latency', rowId: '.ping', description: 'Uji responsivitas koneksi socket WhatsApp' },
						{ title: 'Session Health', rowId: '.health', description: 'Skor kesehatan sesi, memori, dan uptime bot' },
						{ title: 'Info Owner', rowId: '.owner', description: 'Lihat nomor dan otorisasi owner resmi' }
					]
				},
				{
					title: '🎨 Fitur Media & Interaktif',
					rows: [
						{ title: 'Tombol Salin (Copy)', rowId: '.copybutton', description: 'Contoh tombol salin kode ke clipboard' },
						{ title: 'Semua Tombol Interaktif', rowId: '.allbuttons', description: 'Kombinasi Quick Reply, Copy, URL, dan Call' },
						{ title: 'Buka Sekali Lihat (RVO)', rowId: '.rvo', description: 'Panduan buka media view-once' }
					]
				},
				{
					title: '📢 Saluran & Grup',
					rows: [
						{ title: 'Cek Status Admin', rowId: '.cekadmin', description: 'Periksa hak akses admin grup' },
						{ title: 'Daftar Saluran Diikuti', rowId: '.listsaluran', description: 'Melihat saluran yang diikuti bot' },
						{ title: 'Daftar Grup Terverifikasi', rowId: '.listgrup', description: 'Melihat whitelist grup bot' }
					]
				}
			]
		}

		if (typeof ctx.sendListMenu === 'function') {
			return await ctx.sendListMenu(listContent)
		} else if (typeof sock.sendListMenu === 'function') {
			return await sock.sendListMenu(ctx.chat, listContent)
		}
		return ctx.reply('Fitur List Menu tidak didukung pada socket ini.')
	}
})

registerCommand({
	name: 'copybutton',
	aliases: ['salin', 'copycode'],
	category: 'Menu & Interaktif',
	description: 'Mengirim tombol salin teks/kode (Native Flow cta_copy) yang langsung menyalin teks ke clipboard pengguna.',
	usage: '.copybutton [teks_tampilan] | [kode_salin]',
	baileysMethods: ['sock.sendButton', 'formatInteractiveButton (cta_copy)'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return

		const parts = ctx.query ? ctx.query.split('|').map(s => s.trim()) : []
		const displayText = parts[0] || 'Salin Kode Promo'
		const copyCode = parts[1] || 'MFSAVANA-2026-SUPER'

		if (typeof ctx.sendButton === 'function') {
			return await ctx.sendButton({
				text:
					`🏷️ *TOMBOL SALIN TEKS (CTA_COPY)*\n\n` +
					`Klik tombol di bawah ini untuk menyalin kode langsung ke clipboard WhatsApp Anda tanpa perlu mengetik manual.\n\n` +
					`• *Teks Tampilan*: ${displayText}\n` +
					`• *Kode yang Disalin*: \`${copyCode}\``,
				footer: 'Fitur Native Flow WhatsApp • Baileys MFSAVANA',
				buttons: [
					{
						type: 'copy',
						displayText: displayText,
						copy: copyCode
					},
					{
						type: 'quick_reply',
						displayText: '📋 Cek Menu',
						id: '.menu'
					}
				]
			})
		}
		return ctx.reply(`Teks untuk disalin: \`${copyCode}\``)
	}
})

registerCommand({
	name: 'button',
	aliases: ['tombol', 'quickreply'],
	category: 'Menu & Interaktif',
	description: 'Mengirim pesan dengan tombol Quick Reply interaktif.',
	usage: '.button',
	baileysMethods: ['sock.sendButton', 'formatInteractiveButton (quick_reply)'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return

		if (typeof ctx.sendButton === 'function') {
			return await ctx.sendButton({
				text:
					`🔘 *CONTOH TOMBOL QUICK REPLY*\n\n` +
					`Pilih salah satu tombol di bawah untuk menjalankan aksi cepat:`,
				footer: 'MFSAVANA Interactive Buttons',
				buttons: [
					{ type: 'quick_reply', displayText: '⚡ Ping Latency', id: '.ping' },
					{ type: 'quick_reply', displayText: '📊 Cek Status Sesi', id: '.health' },
					{ type: 'quick_reply', displayText: '👑 Hubungi Owner', id: '.owner' }
				]
			})
		}
		return ctx.reply('Tombol interaktif tidak didukung pada socket ini.')
	}
})

registerCommand({
	name: 'urlbutton',
	aliases: ['link', 'tautan'],
	category: 'Menu & Interaktif',
	description: 'Mengirim pesan dengan tombol tautan web (Native Flow cta_url).',
	usage: '.urlbutton [teks_tombol] | [url]',
	baileysMethods: ['sock.sendButton', 'formatInteractiveButton (cta_url)'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return

		const parts = ctx.query ? ctx.query.split('|').map(s => s.trim()) : []
		const displayText = parts[0] || 'Kunjungi Repositori'
		const targetUrl = parts[1] || 'https://github.com'

		if (typeof ctx.sendButton === 'function') {
			return await ctx.sendButton({
				text: `🌐 *TOMBOL TAUTAN WEB (CTA_URL)*\n\nKlik tombol di bawah untuk membuka halaman web eksternal:`,
				footer: 'MFSAVANA URL Button',
				buttons: [
					{ type: 'url', displayText: displayText, url: targetUrl },
					{ type: 'quick_reply', displayText: '📋 Kembali ke Menu', id: '.menu' }
				]
			})
		}
		return ctx.reply(`Buka tautan: ${targetUrl}`)
	}
})

registerCommand({
	name: 'callbutton',
	aliases: ['telpon', 'call'],
	category: 'Menu & Interaktif',
	description: 'Mengirim pesan dengan tombol panggilan langsung (Native Flow cta_call).',
	usage: '.callbutton [teks_tombol] | [nomor_tujuan]',
	baileysMethods: ['sock.sendButton', 'formatInteractiveButton (cta_call)'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return

		const parts = ctx.query ? ctx.query.split('|').map(s => s.trim()) : []
		const displayText = parts[0] || 'Panggilan Customer Service'
		const phoneNumber = parts[1] || `+${OWNER_NUMBER}`

		if (typeof ctx.sendButton === 'function') {
			return await ctx.sendButton({
				text: `📞 *TOMBOL PANGGILAN LANGSUNG (CTA_CALL)*\n\nKlik tombol di bawah untuk memulai panggilan:`,
				footer: 'MFSAVANA Direct Call',
				buttons: [
					{ type: 'call', displayText: displayText, phone: phoneNumber },
					{ type: 'quick_reply', displayText: '📋 Menu Utama', id: '.menu' }
				]
			})
		}
		return ctx.reply(`Nomor panggilan: ${phoneNumber}`)
	}
})

registerCommand({
	name: 'allbuttons',
	aliases: ['interactive', 'komplit'],
	category: 'Menu & Interaktif',
	description: 'Mengirim pesan dengan kombinasi lengkap seluruh tipe tombol native flow (Quick Reply, Copy, URL, Call).',
	usage: '.allbuttons',
	baileysMethods: ['sock.sendButton', 'formatInteractiveButtonMessage'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return

		if (typeof ctx.sendButton === 'function') {
			return await ctx.sendButton({
				text:
					`💎 *PAKET TOMBOL INTERAKTIF LENGKAP*\n` +
					`━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
					`WhatsApp mendukung beragam aksi tombol modern dalam format Native Flow:\n` +
					`1. *Quick Reply*: Respons otomatis cepat\n` +
					`2. *Salin Teks (Copy)*: Salin kode langsung\n` +
					`3. *Buka Link (URL)*: Redirect ke peramban web\n` +
					`4. *Panggilan (Call)*: Memanggil nomor telepon`,
				footer: 'MFSAVANA High-Level Interactive Engine',
				buttons: [
					{ type: 'copy', displayText: '📋 Salin Kupon Diskon', copy: 'DISKON-100-MFSAVANA' },
					{ type: 'url', displayText: '🌐 Buka Google', url: 'https://www.google.com' },
					{ type: 'call', displayText: '📞 Telepon Owner', phone: `+${OWNER_NUMBER}` },
					{ type: 'quick_reply', displayText: '⚡ Cek Latensi', id: '.ping' }
				]
			})
		}
		return ctx.reply('Interactive buttons tidak didukung.')
	}
})

// =============================================================================
// 2. KATEGORI: MEDIA, ALBUM & VIEW-ONCE
// =============================================================================

registerCommand({
	name: 'rvo',
	aliases: ['buka', 'antivo', 'readviewonce'],
	category: 'Media & Album',
	description: 'Membuka dan mengunduh pesan Sekali Lihat (View-Once v1, v2, v3) dari pesan yang di-reply, lalu mengirimkannya kembali.',
	usage: '.rvo (reply pesan Sekali Lihat)',
	baileysMethods: ['downloadViewOnce', 'downloadMediaMessage', 'extractViewOnceMessage'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return

		const hasMedia = Boolean(
			ctx.isViewOnce ||
			ctx.quoted?.isViewOnce ||
			ctx.quoted?.message?.imageMessage ||
			ctx.quoted?.message?.videoMessage ||
			ctx.quoted?.message?.audioMessage ||
			ctx.quoted?.download
		)
		if (!hasMedia) {
			return ctx.reply(
				`⚠️ *Cara Penggunaan Perintah .rvo*\n` +
				`Reply (balas) pesan Sekali Lihat (gambar/video/audio 1x lihat) lalu ketik \`.rvo\`.\n` +
				`Bot akan mengunduh media dan mengirimkannya kembali dalam bentuk media biasa.`
			)
		}

		const voType = ctx.viewOnceType || ctx.quoted?.viewOnceType || (
			ctx.quoted?.message?.videoMessage ? 'video' :
			ctx.quoted?.message?.audioMessage ? 'audio' : 'image'
		)

		try {
			let mediaBuffer
			if (ctx.isViewOnce && typeof ctx.downloadViewOnce === 'function') {
				mediaBuffer = await ctx.downloadViewOnce()
			} else if (ctx.quoted?.downloadViewOnce) {
				mediaBuffer = await ctx.quoted.downloadViewOnce()
			} else if (ctx.quoted?.download) {
				mediaBuffer = await ctx.quoted.download()
			} else {
				throw new Error('Gagal menemukan data buffer media view-once.')
			}

			const captionText = '🔓 *Pesan Sekali Lihat Berhasil Dibuka*\nMedia telah diekstrak oleh MFSAVANA Engine.'

			if (voType === 'image') {
				return await ctx.reply({ image: mediaBuffer, caption: captionText })
			} else if (voType === 'video') {
				return await ctx.reply({ video: mediaBuffer, caption: captionText })
			} else if (voType === 'audio') {
				return await ctx.reply({ audio: mediaBuffer, mimetype: 'audio/mp4', ptt: true })
			} else {
				return await ctx.reply({ document: mediaBuffer, mimetype: 'application/octet-stream', fileName: 'view_once_media' })
			}
		} catch (err) {
			return ctx.reply(`❌ Gagal membuka pesan sekali lihat: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'sendvo',
	aliases: ['viewonce', 'kirimvo'],
	category: 'Media & Album',
	description: 'Mengirim media yang di-reply sebagai pesan Sekali Lihat (View-Once).',
	usage: '.sendvo [teks_caption] (reply gambar/video/audio)',
	baileysMethods: ['sock.sendMessage(..., { viewOnce: true })'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return

		if (!ctx.quoted || typeof ctx.quoted.download !== 'function') {
			return ctx.reply('⚠️ Reply gambar, video, atau audio yang ingin dijadikan pesan Sekali Lihat dengan perintah `.sendvo`.')
		}

		try {
			const buffer = await ctx.quoted.download()
			const caption = ctx.query || 'Pesan Sekali Lihat (View-Once)'
			const qMsg = ctx.quoted.message || {}
			const qType = (ctx.quoted.type || '').toLowerCase()

			const isImg = Boolean(qMsg.imageMessage || qType.includes('image'))
			const isVid = Boolean(qMsg.videoMessage || qType.includes('video'))
			const isAud = Boolean(qMsg.audioMessage || qType.includes('audio'))

			if (isImg) {
				return await sock.sendMessage(ctx.chat, { image: buffer, caption, viewOnce: true })
			} else if (isVid) {
				return await sock.sendMessage(ctx.chat, { video: buffer, caption, viewOnce: true })
			} else if (isAud) {
				return await sock.sendMessage(ctx.chat, { audio: buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true, viewOnce: true })
			}

			return ctx.reply('⚠️ Media yang di-reply bukan merupakan gambar, video, atau audio.')
		} catch (err) {
			return ctx.reply(`❌ Gagal mengirim view-once: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'album',
	aliases: ['kirimalbum', 'albummsg'],
	category: 'Media & Album',
	description: 'Mengirim kumpulan multi-media dalam 1 pesan Album terpadu WhatsApp.',
	usage: '.album',
	baileysMethods: ['sock.sendAlbum', 'sock.sendMessage(..., { album: [] })'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return

		// Sampel demonstrasi pengiriman album gambar
		const sampleImages = [
			{
				image: { url: 'https://picsum.photos/800/800?random=1' },
				caption: '📸 Gambar 1: Album Koleksi MFSAVANA'
			},
			{
				image: { url: 'https://picsum.photos/800/800?random=2' },
				caption: '📸 Gambar 2: Resolusi Tinggi'
			},
			{
				image: { url: 'https://picsum.photos/800/800?random=3' },
				caption: '📸 Gambar 3: Pengelompokan Otomatis'
			}
		]

		try {
			if (typeof ctx.sendAlbum === 'function') {
				return await ctx.sendAlbum(sampleImages, { caption: '📁 *Album Multi-Media WhatsApp*\nDikirim via MFSAVANA Baileys' })
			} else if (typeof sock.sendAlbum === 'function') {
				return await sock.sendAlbum(ctx.chat, sampleImages, { caption: '📁 *Album Multi-Media WhatsApp*' })
			}
			return ctx.reply('Fitur Album tidak didukung pada socket ini.')
		} catch (err) {
			return ctx.reply(`❌ Gagal mengirim album: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'download',
	aliases: ['ambil', 'getmedia'],
	category: 'Media & Album',
	description: 'Mengunduh media dari pesan yang di-reply dan mengirimkannya kembali dalam bentuk file dokumen/media.',
	usage: '.download (reply media)',
	baileysMethods: ['ctx.quoted.download()', 'sock.sendMessage'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return

		if (!ctx.quoted || typeof ctx.quoted.download !== 'function') {
			return ctx.reply('⚠️ Reply media (gambar, video, audio, dokumen, atau stiker) dengan perintah `.download`.')
		}

		try {
			const buffer = await ctx.quoted.download()
			const qMsg = ctx.quoted.message || {}

			if (qMsg.imageMessage) {
				return await ctx.reply({ image: buffer, caption: '✅ Media gambar berhasil diunduh.' })
			} else if (qMsg.videoMessage) {
				return await ctx.reply({ video: buffer, caption: '✅ Media video berhasil diunduh.' })
			} else if (qMsg.audioMessage) {
				return await ctx.reply({ audio: buffer, mimetype: 'audio/mp4' })
			} else {
				return await ctx.reply({ document: buffer, mimetype: 'application/octet-stream', fileName: 'downloaded_media' })
			}
		} catch (err) {
			return ctx.reply(`❌ Gagal mengunduh media: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'vn',
	aliases: ['ptt', 'voicenote'],
	category: 'Media & Album',
	description: 'Mengirim audio yang di-reply sebagai Voice Note WhatsApp (PTT dengan gelombang suara).',
	usage: '.vn (reply audio)',
	baileysMethods: ['sock.sendMessage(..., { audio, ptt: true })'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return

		if (!ctx.quoted || typeof ctx.quoted.download !== 'function') {
			return ctx.reply('⚠️ Reply audio atau rekaman suara dengan perintah `.vn` untuk mengubahnya menjadi Voice Note PTT.')
		}

		try {
			const buffer = await ctx.quoted.download()
			return await sock.sendMessage(ctx.chat, { audio: buffer, mimetype: 'audio/mp4', ptt: true }, { quoted: ctx.msg })
		} catch (err) {
			return ctx.reply(`❌ Gagal mengirim Voice Note: ${err.message}`)
		}
	}
})

// =============================================================================
// 3. KATEGORI: SALURAN / NEWSLETTER
// =============================================================================

registerCommand({
	name: 'cekchannel',
	aliases: ['channelid', 'cekid', 'chinfo'],
	category: 'Newsletter / Saluran',
	description: 'Memeriksa ID Channel, metadata, subscriber, dan status verifikasi dari URL link undangan atau JID saluran WhatsApp.',
	usage: '.cekchannel <link_saluran_atau_jid>',
	baileysMethods: ['sock.newsletterId(urlOrCode)'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return

		const query = ctx.query?.trim()
		if (!query) {
			return ctx.reply(
				`⚠️ *Cara Menggunakan .cekchannel*\n` +
				`Format: \`.cekchannel <link_saluran_atau_jid>\`\n` +
				`Contoh: \`.cekchannel https://whatsapp.com/channel/0029Va4KqKG4Crfhi18D7p2j\`\n` +
				`Atau: \`.cekchannel 120363144038483540@newsletter\``
			)
		}

		try {
			const meta = await sock.newsletterId(query)
			if (!meta || !meta.id) {
				return ctx.reply('❌ Saluran WhatsApp tidak ditemukan atau tautan undangan tidak valid.')
			}

			const createdDate = meta.creation_time ? new Date(meta.creation_time * 1000).toLocaleString('id-ID') : '-'
			const infoText =
				`📢 *INFORMASI SALURAN WHATSAPP*\n` +
				`━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
				`• *Nama Saluran*: ${meta.name || '-'}\n` +
				`• *ID Saluran (JID)*: \`${meta.id}\`\n` +
				`• *Total Pengikut*: ${(meta.subscribers || 0).toLocaleString('id-ID')}\n` +
				`• *Status Verifikasi*: ${meta.verification === 'VERIFIED' ? '✅ Terverifikasi' : 'Biasa'}\n` +
				`• *Tanggal Dibuat*: ${createdDate}\n` +
				`• *Kode Undangan*: ${meta.invite || '-'}\n` +
				`• *Status Mute*: ${meta.mute_state || 'OFF'}\n` +
				`• *Deskripsi*: ${meta.description || '-'}\n` +
				`━━━━━━━━━━━━━━━━━━━━━━━━━━━━`

			// Kirim dengan tombol salin JID
			if (typeof ctx.sendButton === 'function') {
				return await ctx.sendButton({
					text: infoText,
					footer: 'MFSAVANA Channel Inspector',
					buttons: [
						{ type: 'copy', displayText: '📋 Salin JID Channel', copy: meta.id },
						{ type: 'quick_reply', displayText: '➕ Ikuti Saluran', id: `.chfollow ${meta.id}` }
					]
				})
			}

			return ctx.reply(infoText)
		} catch (err) {
			return ctx.reply(`❌ Gagal memeriksa saluran: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'listsaluran',
	aliases: ['subscribedchannel', 'chlist'],
	category: 'Newsletter / Saluran',
	description: 'Melihat daftar seluruh saluran WhatsApp yang sedang diikuti atau dikelola oleh akun bot ini.',
	usage: '.listsaluran',
	baileysMethods: ['sock.newsletterFetchAllSubscribed()'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return

		try {
			const list = await sock.newsletterFetchAllSubscribed()
			if (!list || !list.length) {
				return ctx.reply('Bot saat ini belum mengikuti atau mengelola saluran WhatsApp apapun.')
			}

			let text = `📢 *SALURAN YANG DIIKUTI BOT (${list.length})*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
			list.forEach((ch, i) => {
				text += `${i + 1}. *${ch.name || 'Tanpa Nama'}*\n`
				text += `   • JID: \`${ch.id}\`\n`
				text += `   • Pengikut: ${(ch.subscribers || 0).toLocaleString('id-ID')}\n`
				text += `   • Peran: ${ch.viewer_metadata?.role || 'SUBSCRIBER'}\n\n`
			})

			return ctx.reply(text)
		} catch (err) {
			return ctx.reply(`❌ Gagal mengambil daftar saluran: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'buatchannel',
	aliases: ['chcreate'],
	category: 'Newsletter / Saluran',
	description: 'Membuat saluran siaran WhatsApp baru (Owner Only).',
	usage: '.buatchannel <nama_saluran> | <deskripsi>',
	baileysMethods: ['sock.newsletterCreate(name, description)'],
	ownerOnly: true,
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, true)) return

		const parts = ctx.query ? ctx.query.split('|').map(s => s.trim()) : []
		const name = parts[0]
		const desc = parts[1] || 'Saluran Resmi MFSAVANA'

		if (!name) {
			return ctx.reply('⚠️ Format: `.buatchannel <nama_saluran> | <deskripsi>`')
		}

		try {
			const res = await sock.newsletterCreate(name, desc)
			return ctx.reply(
				`🎉 *Saluran WhatsApp Berhasil Dibuat!*\n\n` +
				`• *Nama*: ${res.name}\n` +
				`• *JID*: \`${res.id}\`\n` +
				`• *Kode Undangan*: ${res.invite || '-'}`
			)
		} catch (err) {
			return ctx.reply(`❌ Gagal membuat saluran: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'chfollow',
	aliases: ['ikutichannel'],
	category: 'Newsletter / Saluran',
	description: 'Mengikuti (follow) saluran WhatsApp berdasarkan JID saluran.',
	usage: '.chfollow <jid_saluran>',
	baileysMethods: ['sock.newsletterFollow(jid)'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return

		const jid = ctx.query?.trim()
		if (!jid || !jid.endsWith('@newsletter')) {
			return ctx.reply('⚠️ Masukkan JID saluran yang valid (berakhiran `@newsletter`). Gunakan `.cekchannel` terlebih dahulu.')
		}

		try {
			await sock.newsletterFollow(jid)
			return ctx.reply(`✅ Berhasil mengikuti saluran: \`${jid}\``)
		} catch (err) {
			return ctx.reply(`❌ Gagal mengikuti saluran: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'chunfollow',
	aliases: ['unfollowchannel'],
	category: 'Newsletter / Saluran',
	description: 'Berhenti mengikuti (unfollow) saluran WhatsApp.',
	usage: '.chunfollow <jid_saluran>',
	baileysMethods: ['sock.newsletterUnfollow(jid)'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return

		const jid = ctx.query?.trim()
		if (!jid || !jid.endsWith('@newsletter')) {
			return ctx.reply('⚠️ Masukkan JID saluran yang valid (berakhiran `@newsletter`).')
		}

		try {
			await sock.newsletterUnfollow(jid)
			return ctx.reply(`✅ Berhasil berhenti mengikuti saluran: \`${jid}\``)
		} catch (err) {
			return ctx.reply(`❌ Gagal berhenti mengikuti: ${err.message}`)
		}
	}
})

// =============================================================================
// 4. KATEGORI: ADMINISTRASI & MODERASI GRUP
// =============================================================================

registerCommand({
	name: 'cekadmin',
	aliases: ['admin', 'listadmin'],
	category: 'Administrasi Grup',
	description: 'Memeriksa status admin bot, status admin pengirim, dan menampilkan daftar seluruh admin grup saat ini.',
	usage: '.cekadmin',
	baileysMethods: ['sock.groupMetadata', 'ctx.group.getAdmins()'],
	groupOnly: true,
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		if (!ctx.isGroup) return ctx.reply('Perintah ini hanya dapat dijalankan di dalam grup.')

		try {
			const meta = await sock.groupMetadata(ctx.chat)
			const participants = meta?.participants || []
			const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin')

			const botJid = jidNormalizedUser(sock.user?.id)
			const isBotAdmin = admins.some(a => jidNormalizedUser(a.id) === botJid)
			const senderJid = jidNormalizedUser(ctx.sender)
			const isSenderAdmin = admins.some(a => jidNormalizedUser(a.id) === senderJid) || isOwnerSender(ctx)

			let text =
				`🛡️ *STATUS ADMINISTRASI GRUP*\n` +
				`━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
				`• *Nama Grup*: ${meta.subject}\n` +
				`• *Total Anggota*: ${participants.length}\n` +
				`• *Status Bot*: ${isBotAdmin ? '✅ Admin Grup' : '❌ Bukan Admin (Fitur Admin Dibatasi)'}\n` +
				`• *Status Anda*: ${isSenderAdmin ? '✅ Admin Grup / Owner' : 'Bukan Admin'}\n\n` +
				`📋 *Daftar Admin Grup (${admins.length})*:\n`

			admins.forEach((admin, idx) => {
				const rawId = admin.phoneNumber || admin.id
				const pn = (sock.lidCache && typeof sock.lidCache.resolveToPN === 'function')
					? sock.lidCache.resolveToPN(rawId)
					: rawId
				const num = pn.split('@')[0].split(':')[0]
				const role = admin.admin === 'superadmin' ? '⭐ Pembuat Grup' : 'Admin'
				text += `  ${idx + 1}. +${num} (${role})\n`
			})

			return ctx.reply(text)
		} catch (err) {
			return ctx.reply(`❌ Gagal memeriksa admin grup: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'groupinfo',
	aliases: ['infogrup'],
	category: 'Administrasi Grup',
	description: 'Menampilkan detail lengkap statistik, deskripsi, perizinan, dan pengaturan grup WhatsApp.',
	usage: '.groupinfo',
	baileysMethods: ['sock.groupMetadata(chatJid)'],
	groupOnly: true,
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		if (!ctx.isGroup) return ctx.reply('Perintah ini khusus untuk grup WhatsApp.')

		try {
			const meta = await sock.groupMetadata(ctx.chat)
			const creationDate = meta.creation ? new Date(meta.creation * 1000).toLocaleString('id-ID') : '-'

			const info =
				`🏢 *INFORMASI LENGKAP GRUP*\n` +
				`━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
				`• *Nama*: ${meta.subject}\n` +
				`• *ID Grup*: \`${meta.id}\`\n` +
				`• *Dibuat*: ${creationDate}\n` +
				`• *Total Peserta*: ${meta.participants?.length || 0} anggota\n` +
				`• *Hanya Admin Kirim Pesan*: ${meta.announce ? 'Ya (Tutup)' : 'Tidak (Buka)'}\n` +
				`• *Hanya Admin Edit Info*: ${meta.restrict ? 'Ya' : 'Tidak'}\n` +
				`• *Persetujuan Masuk (Join Approval)*: ${meta.joinApprovalMode ? 'Aktif' : 'Nonaktif'}\n\n` +
				`📝 *Deskripsi Grup*:\n${meta.desc || 'Tidak ada deskripsi.'}`

			return ctx.reply(info)
		} catch (err) {
			return ctx.reply(`❌ Gagal mengambil informasi grup: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'tagall',
	aliases: ['semua', 'everyone'],
	category: 'Administrasi Grup',
	description: 'Mention seluruh anggota grup dengan daftar tag terlihat (Admin / Owner Only).',
	usage: '.tagall [pesan_pengumuman]',
	baileysMethods: ['sock.groupMetadata', 'sock.sendMessage(..., { text, mentions })'],
	groupOnly: true,
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		if (!ctx.isGroup) return ctx.reply('Khusus grup WhatsApp.')

		try {
			const meta = await sock.groupMetadata(ctx.chat)
			const participants = meta.participants || []
			const jids = participants.map(p => p.id)

			let text = `📢 *PENGUMUMAN KELOMPOK*\n${ctx.query ? ctx.query + '\n\n' : '\n'}`
			participants.forEach(p => {
				const num = p.id.split('@')[0].split(':')[0]
				text += `• @${num}\n`
			})

			return await sock.sendMessage(ctx.chat, { text, mentions: jids }, { quoted: ctx.msg })
		} catch (err) {
			return ctx.reply(`❌ Gagal tag all: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'hidetag',
	aliases: ['ghosttag'],
	category: 'Administrasi Grup',
	description: 'Mention seluruh anggota grup secara tersembunyi tanpa memenuhi isi chat (Admin / Owner Only).',
	usage: '.hidetag <pesan>',
	baileysMethods: ['sock.groupMetadata', 'sock.sendMessage(..., { text, mentions })'],
	groupOnly: true,
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		if (!ctx.isGroup) return ctx.reply('Khusus grup WhatsApp.')

		const messageText = ctx.query || 'Perhatian untuk seluruh anggota grup.'
		try {
			const meta = await sock.groupMetadata(ctx.chat)
			const jids = (meta.participants || []).map(p => p.id)
			return await sock.sendMessage(ctx.chat, { text: messageText, mentions: jids }, { quoted: ctx.msg })
		} catch (err) {
			return ctx.reply(`❌ Gagal hidetag: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'kick',
	aliases: ['tendang', 'remove'],
	category: 'Administrasi Grup',
	description: 'Mengeluarkan anggota dari grup WhatsApp (Admin & Bot Admin Only).',
	usage: '.kick @user atau reply pesannya',
	baileysMethods: ['sock.groupParticipantsUpdate(chat, [jid], "remove")'],
	groupOnly: true,
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		if (!ctx.isGroup) return ctx.reply('Khusus grup WhatsApp.')

		const target = ctx.mentionedJid?.[0] || ctx.quoted?.sender
		if (!target) {
			return ctx.reply('⚠️ Tag (@user) atau reply pesan anggota yang ingin dikeluarkan.')
		}

		try {
			await sock.groupParticipantsUpdate(ctx.chat, [target], 'remove')
			return ctx.reply(`✅ Anggota @${target.split('@')[0]} berhasil dikeluarkan.`, { mentions: [target] })
		} catch (err) {
			return ctx.reply(`❌ Gagal mengeluarkan anggota (Pastikan bot adalah Admin Grup): ${err.message}`)
		}
	}
})

registerCommand({
	name: 'promote',
	aliases: ['jadikanadmin'],
	category: 'Administrasi Grup',
	description: 'Menaikkan anggota menjadi Admin Grup (Admin & Bot Admin Only).',
	usage: '.promote @user',
	baileysMethods: ['sock.groupParticipantsUpdate(chat, [jid], "promote")'],
	groupOnly: true,
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		const target = ctx.mentionedJid?.[0] || ctx.quoted?.sender
		if (!target) return ctx.reply('Tag atau reply anggota yang ingin dijadikan admin.')

		try {
			await sock.groupParticipantsUpdate(ctx.chat, [target], 'promote')
			return ctx.reply(`🎉 Selamat, @${target.split('@')[0]} sekarang menjadi Admin Grup!`, { mentions: [target] })
		} catch (err) {
			return ctx.reply(`❌ Gagal mempromosikan admin: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'demote',
	aliases: ['turunadmin'],
	category: 'Administrasi Grup',
	description: 'Menurunkan admin menjadi anggota biasa (Admin & Bot Admin Only).',
	usage: '.demote @user',
	baileysMethods: ['sock.groupParticipantsUpdate(chat, [jid], "demote")'],
	groupOnly: true,
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		const target = ctx.mentionedJid?.[0] || ctx.quoted?.sender
		if (!target) return ctx.reply('Tag atau reply admin yang ingin diturunkan jabatannya.')

		try {
			await sock.groupParticipantsUpdate(ctx.chat, [target], 'demote')
			return ctx.reply(`✅ Jabatan admin @${target.split('@')[0]} telah dicabut.`, { mentions: [target] })
		} catch (err) {
			return ctx.reply(`❌ Gagal mendemosikan admin: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'opengroup',
	aliases: ['bukagrup'],
	category: 'Administrasi Grup',
	description: 'Membuka grup sehingga seluruh anggota dapat mengirim pesan.',
	usage: '.opengroup',
	baileysMethods: ['sock.groupSettingUpdate(chat, "not_announcement")'],
	groupOnly: true,
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		try {
			await sock.groupSettingUpdate(ctx.chat, 'not_announcement')
			return ctx.reply('🔓 *Grup Dibuka*: Seluruh anggota sekarang dapat mengirim pesan.')
		} catch (err) {
			return ctx.reply(`❌ Gagal membuka grup: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'closegroup',
	aliases: ['tutupgrup'],
	category: 'Administrasi Grup',
	description: 'Menutup grup sehingga hanya admin yang dapat mengirim pesan.',
	usage: '.closegroup',
	baileysMethods: ['sock.groupSettingUpdate(chat, "announcement")'],
	groupOnly: true,
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		try {
			await sock.groupSettingUpdate(ctx.chat, 'announcement')
			return ctx.reply('🔒 *Grup Ditutup*: Hanya Admin yang dapat mengirim pesan.')
		} catch (err) {
			return ctx.reply(`❌ Gagal menutup grup: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'linkgrup',
	aliases: ['invitecode', 'glink'],
	category: 'Administrasi Grup',
	description: 'Mengambil link undangan grup WhatsApp saat ini.',
	usage: '.linkgrup',
	baileysMethods: ['sock.groupInviteCode(chat)'],
	groupOnly: true,
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		try {
			const code = await sock.groupInviteCode(ctx.chat)
			const link = `https://chat.whatsapp.com/${code}`
			return ctx.reply(`🔗 *Tautan Undangan Grup*:\n${link}`)
		} catch (err) {
			return ctx.reply(`❌ Gagal mengambil tautan grup (Pastikan bot adalah Admin): ${err.message}`)
		}
	}
})

// =============================================================================
// 5. KATEGORI: UTILITAS, CHAT & SMART FEATURES
// =============================================================================

registerCommand({
	name: 'poll',
	aliases: ['polling', 'vote'],
	category: 'Informasi & Utility',
	description: 'Membuat pesan Polling interaktif WhatsApp dengan opsi pilihan ganda.',
	usage: '.poll Pertanyaan? | Opsi1 | Opsi2 | Opsi3',
	baileysMethods: ['sock.sendMessage(..., { poll: { name, values } })'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return

		const parts = ctx.query ? ctx.query.split('|').map(s => s.trim()) : []
		const question = parts[0] || 'Apakah Anda menyukai Bot MFSAVANA?'
		const options = parts.slice(1).length >= 2 ? parts.slice(1) : ['Sangat Suka ❤️', 'Bagus Banget 👍', 'Luar Biasa 🔥']

		if (options.length > 12) {
			return ctx.reply(`⚠️ Opsi polling melebihi batas WhatsApp (Maksimal 12 opsi, Anda memasukkan ${options.length} opsi).`)
		}
		if (options.length < 2) {
			return ctx.reply('⚠️ Polling membutuhkan minimal 2 opsi (format: `.poll Pertanyaan? | Opsi 1 | Opsi 2`).')
		}

		try {
			return await sock.sendMessage(ctx.chat, {
				poll: {
					name: question,
					values: options,
					selectableCount: 1
				}
			}, { quoted: ctx.msg })
		} catch (err) {
			return ctx.reply(`❌ Gagal membuat polling: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'vcard',
	aliases: ['kontak', 'contact'],
	category: 'Informasi & Utility',
	description: 'Mengirim kartu kontak vCard WhatsApp.',
	usage: '.vcard [nama] | [nomor]',
	baileysMethods: ['sock.sendMessage(..., { contacts: { displayName, contacts: [{ vcard }] } })'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return

		const parts = ctx.query ? ctx.query.split('|').map(s => s.trim()) : []
		const name = parts[0] || 'Owner MFSAVANA'
		const number = (parts[1] || OWNER_NUMBER).replace(/\D/g, '')

		const vcard =
			'BEGIN:VCARD\n' +
			'VERSION:3.0\n' +
			`FN:${name}\n` +
			`ORG:MFSAVANA Enterprise;\n` +
			`TEL;type=CELL;type=VOICE;waid=${number}:+${number}\n` +
			'END:VCARD'

		try {
			return await sock.sendMessage(ctx.chat, {
				contacts: {
					displayName: name,
					contacts: [{ vcard }]
				}
			}, { quoted: ctx.msg })
		} catch (err) {
			return ctx.reply(`❌ Gagal mengirim kontak: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'inspect',
	aliases: ['cekwa', 'cekno'],
	category: 'Informasi & Utility',
	description: 'Memeriksa apakah suatu nomor terdaftar di WhatsApp serta detail tipe akun bisnis/personal.',
	usage: '.inspect <nomor_telepon>',
	baileysMethods: ['sock.inspectPhone(cleanDigits)'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return

		const rawNum = ctx.query || ctx.senderNumber
		const cleanDigits = String(rawNum).replace(/\D/g, '')

		if (!cleanDigits || cleanDigits.length < 6) {
			return ctx.reply('⚠️ Masukkan nomor telepon internasional yang valid (misal: `6285360554431`).')
		}

		try {
			const res = await sock.inspectPhone(cleanDigits)
			const text =
				`🔍 *HASIL INSPEKSI NOMOR WHATSAPP*\n` +
				`━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
				`• *Nomor*: +${cleanDigits}\n` +
				`• *Status Terdaftar*: ${res.exists ? '✅ Terdaftar di WhatsApp' : '❌ Tidak Terdaftar'}\n` +
				`• *Tipe Akun*: ${res.isBusiness ? '🏢 Akun Bisnis' : 'Personal'}\n` +
				`• *JID Terpetakan*: \`${res.jid || '-'}\``

			return ctx.reply(text)
		} catch (err) {
			return ctx.reply(`❌ Gagal menginspeksi nomor: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'pin',
	aliases: ['sematkan'],
	category: 'Informasi & Utility',
	description: 'Menyematkan (pin) pesan yang di-reply selama durasi tertentu.',
	usage: '.pin [durasi_hari (default: 7)] (reply pesan)',
	baileysMethods: ['sock.sendMessage(..., { pin: key, type: 1, time: seconds })'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		if (!ctx.quoted) return ctx.reply('Reply pesan yang ingin disematkan.')

		const days = parseInt(ctx.query, 10) || 7
		const seconds = days * 24 * 60 * 60

		try {
			await sock.sendMessage(ctx.chat, {
				pin: ctx.quoted.key,
				type: 1, // PIN
				time: seconds
			})
			return ctx.reply(`📌 Pesan berhasil disematkan selama ${days} hari.`)
		} catch (err) {
			return ctx.reply(`❌ Gagal menyematkan pesan: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'unpin',
	aliases: ['lepaspin'],
	category: 'Informasi & Utility',
	description: 'Melepas sematan (unpin) dari pesan yang di-reply.',
	usage: '.unpin (reply pesan tersemat)',
	baileysMethods: ['sock.sendMessage(..., { pin: key, type: 0 })'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		if (!ctx.quoted) return ctx.reply('Reply pesan yang ingin dilepas sematannya.')

		try {
			await sock.sendMessage(ctx.chat, {
				pin: ctx.quoted.key,
				type: 2 // UNPIN_FOR_ALL
			})
			return ctx.reply('📍 Sematan pesan berhasil dilepas.')
		} catch (err) {
			return ctx.reply(`❌ Gagal melepas sematan: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'del',
	aliases: ['delete', 'hapus'],
	category: 'Informasi & Utility',
	description: 'Menghapus pesan (Delete for Everyone) pesan bot atau pesan anggota (jika bot admin).',
	usage: '.del (reply pesan)',
	baileysMethods: ['sock.sendMessage(..., { delete: key })'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		if (!ctx.quoted) return ctx.reply('Reply pesan yang ingin dihapus.')

		try {
			await sock.sendMessage(ctx.chat, { delete: ctx.quoted.key })
		} catch (err) {
			return ctx.reply(`❌ Gagal menghapus pesan: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'autotyping',
	aliases: ['typingmode'],
	category: 'Informasi & Utility',
	description: 'Mengaktifkan atau menonaktifkan simulasi mengetik otomatis sebelum bot mengirim pesan.',
	usage: '.autotyping [on/off]',
	baileysMethods: ['sock.autoTyping(boolean)'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return

		const current = sock.autoTyping()
		let newState = !current
		if (ctx.query === 'on') newState = true
		if (ctx.query === 'off') newState = false

		sock.autoTyping(newState)
		return ctx.reply(`✍️ Simulasi Mengetik Otomatis (Auto-Typing): *${newState ? 'AKTIF (ON)' : 'NONAKTIF (OFF)'}*`)
	}
})

// =============================================================================
// 6. KATEGORI: MONITORING, HEALTH & OWNER
// =============================================================================

registerCommand({
	name: 'ping',
	aliases: ['p'],
	category: 'Monitoring',
	description: 'Memeriksa responsivitas bot dan mengukur latency koneksi WebSocket ke server WhatsApp.',
	usage: '.ping',
	baileysMethods: ['sock.getSessionHealth()', 'ctx.reply'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return

		const start = Date.now()
		const health = await sock.getSessionHealth()
		const latency = health?.latencyMs ?? (Date.now() - start)

		return ctx.reply(
			`🏓 *PONG!*\n` +
			`• *Latency WS*: ${latency} ms\n` +
			`• *Status Sesi*: ${health?.status || 'HEALTHY'}\n` +
			`• *Skor Kesehatan*: ${health?.score ?? 100}%`
		)
	}
})

registerCommand({
	name: 'health',
	aliases: ['stats', 'statuskoneksi'],
	category: 'Monitoring',
	description: 'Menampilkan laporan realtime kesehatan sesi, penggunaan memori (RAM), uptime, dan total pesan masuk/keluar.',
	usage: '.health',
	baileysMethods: ['sock.getSessionHealth()'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return

		const health = await sock.getSessionHealth()
		const formatBytes = (bytes) => (bytes / 1024 / 1024).toFixed(2) + ' MB'
		const formatUptime = (seconds) => {
			const d = Math.floor(seconds / (3600 * 24))
			const h = Math.floor((seconds % (3600 * 24)) / 3600)
			const m = Math.floor((seconds % 3600) / 60)
			const s = Math.floor(seconds % 60)
			return `${d}h ${h}j ${m}m ${s}d`
		}

		const memory = process.memoryUsage()
		const healthText =
			`📊 *LAPORAN REALTIME SESSION HEALTH*\n` +
			`━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
			`• *Status Diagnostik*: ${health?.status === 'HEALTHY' ? '🟢 Normal' : '🟡 Terdegradasi'}\n` +
			`• *Skor Kesehatan*: ${health?.score ?? 100} / 100\n` +
			`• *Koneksi*: ${health?.connection?.toUpperCase() || 'OPEN'}\n` +
			`• *Uptime Bot*: ${formatUptime(health?.uptimeSeconds ?? process.uptime())}\n` +
			`• *Latency*: ${health?.latencyMs ?? 0} ms\n` +
			`• *Pesan Masuk (In)*: ${health?.messagesIn ?? 0}\n` +
			`• *Pesan Keluar (Out)*: ${health?.messagesOut ?? 0}\n` +
			`• *Percobaan Rekoneksi*: ${reconnectionSupervisor.getAttempts()}\n` +
			`• *Memori RSS*: ${formatBytes(memory.rss)}\n` +
			`• *Heap Used*: ${formatBytes(memory.heapUsed)} / ${formatBytes(memory.heapTotal)}\n` +
			`━━━━━━━━━━━━━━━━━━━━━━━━━━━━`

		return ctx.reply(healthText)
	}
})

registerCommand({
	name: 'owner',
	aliases: ['developer', 'creator'],
	category: 'Owner & Keamanan',
	description: 'Menampilkan informasi kontak dan otorisasi Owner Tunggal resmi bot.',
	usage: '.owner',
	baileysMethods: ['ctx.reply'],
	execute: async (ctx, sock) => {
		return ctx.reply(
			`👑 *OWNER RESMI MFSAVANA BOT*\n` +
			`━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
			`• *Nomor Owner*: +${OWNER_NUMBER}\n` +
			`• *Otorisasi Penuh*: Single Owner Architecture\n` +
			`• *Grup Terverifikasi*: ${verifiedGroups.size} Grup\n` +
			`━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
		)
	}
})

registerCommand({
	name: 'verifgrup',
	aliases: ['verifygroup', 'tambahgrup'],
	category: 'Owner & Keamanan',
	description: 'Memverifikasi grup saat ini ke dalam whitelist resmi agar bot dapat digunakan (Owner Only).',
	usage: '.verifgrup',
	baileysMethods: ['fs.writeFileSync (verified-groups.json)'],
	ownerOnly: true,
	groupOnly: true,
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, true)) return
		if (!ctx.isGroup) return ctx.reply('Perintah ini harus dijalankan di dalam grup.')

		verifiedGroups.add(ctx.chat)
		saveVerifiedGroups(verifiedGroups)

		return ctx.reply(
			`✅ *GRUP BERHASIL DIVERIFIKASI!*\n` +
			`ID Grup: \`${ctx.chat}\`\n` +
			`Total Grup Terverifikasi: ${verifiedGroups.size}\n\n` +
			`Seluruh anggota grup sekarang dapat menggunakan fitur bot.`
		)
	}
})

registerCommand({
	name: 'unverifgrup',
	aliases: ['unverifygroup', 'hapusgrup'],
	category: 'Owner & Keamanan',
	description: 'Menghapus grup dari whitelist resmi bot (Owner Only).',
	usage: '.unverifgrup',
	baileysMethods: ['fs.writeFileSync (verified-groups.json)'],
	ownerOnly: true,
	groupOnly: true,
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, true)) return
		if (!ctx.isGroup) return ctx.reply('Perintah ini harus dijalankan di dalam grup.')

		verifiedGroups.delete(ctx.chat)
		saveVerifiedGroups(verifiedGroups)

		return ctx.reply(`🚫 Grup \`${ctx.chat}\` telah dihapus dari daftar terverifikasi.`)
	}
})

registerCommand({
	name: 'listgrup',
	aliases: ['listgroup', 'whitelist'],
	category: 'Owner & Keamanan',
	description: 'Menampilkan daftar seluruh ID grup yang telah terverifikasi dalam whitelist resmi.',
	usage: '.listgrup',
	baileysMethods: ['fs.readFileSync'],
	ownerOnly: true,
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, true)) return

		const list = Array.from(verifiedGroups)
		if (!list.length) return ctx.reply('Belum ada grup yang terverifikasi.')

		let text = `📋 *DAFTAR GRUP TERVERIFIKASI (${list.length})*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
		list.forEach((id, idx) => {
			text += `${idx + 1}. \`${id}\`\n`
		})
		return ctx.reply(text)
	}
})

// =============================================================================

registerCommand({
	name: 'sticker',
	aliases: ['s', 'stiker'],
	category: 'Media & Album',
	description: 'Mengonversi gambar atau video pendek yang di-reply menjadi stiker WhatsApp.',
	usage: '.sticker (reply gambar/video)',
	baileysMethods: ['ctx.quoted.download()', 'sock.sendMessage(..., { sticker: buffer })'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		if (!ctx.quoted || typeof ctx.quoted.download !== 'function') {
			return ctx.reply('⚠️ Reply gambar atau video pendek dengan perintah `.sticker`.')
		}
		try {
			const buffer = await ctx.quoted.download()
			let stickerBuffer = buffer
			if (typeof formatSticker === 'function') {
				stickerBuffer = await formatSticker(buffer, { pack: 'MFSAVANA Bot', author: 'MFSAVANA' })
			}
			return await sock.sendMessage(ctx.chat, { sticker: stickerBuffer }, { quoted: ctx.msg })
		} catch (err) {
			return ctx.reply(`❌ Gagal membuat stiker: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'chmetadata',
	aliases: ['chdetail'],
	category: 'Newsletter / Saluran',
	description: 'Mengambil metadata teknis saluran WhatsApp secara langsung.',
	usage: '.chmetadata <jid_saluran>',
	baileysMethods: ['sock.newsletterMetadata("JID", jid, "GUEST")'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		const jid = ctx.query?.trim()
		if (!jid || !jid.endsWith('@newsletter')) return ctx.reply('⚠️ Masukkan JID saluran (@newsletter).')
		try {
			const meta = await sock.newsletterMetadata('JID', jid, 'GUEST')
			return ctx.reply(`📋 *Metadata Saluran*:\n\`\`\`${JSON.stringify(meta, null, 2)}\`\`\``)
		} catch (err) {
			return ctx.reply(`❌ Gagal mengambil metadata: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'chmute',
	aliases: ['bischannel'],
	category: 'Newsletter / Saluran',
	description: 'Membisukan notifikasi saluran WhatsApp.',
	usage: '.chmute <jid_saluran>',
	baileysMethods: ['sock.newsletterMute(jid)'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		const jid = ctx.query?.trim()
		if (!jid || !jid.endsWith('@newsletter')) return ctx.reply('⚠️ Masukkan JID saluran.')
		try {
			await sock.newsletterMute(jid)
			return ctx.reply(`🔇 Saluran \`${jid}\` berhasil dibisukan.`)
		} catch (err) {
			return ctx.reply(`❌ Gagal membisukan saluran: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'chunmute',
	aliases: ['unbischannel'],
	category: 'Newsletter / Saluran',
	description: 'Membunyikan notifikasi saluran WhatsApp.',
	usage: '.chunmute <jid_saluran>',
	baileysMethods: ['sock.newsletterUnmute(jid)'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		const jid = ctx.query?.trim()
		if (!jid || !jid.endsWith('@newsletter')) return ctx.reply('⚠️ Masukkan JID saluran.')
		try {
			await sock.newsletterUnmute(jid)
			return ctx.reply(`🔔 Notifikasi saluran \`${jid}\` berhasil diaktifkan.`)
		} catch (err) {
			return ctx.reply(`❌ Gagal mengaktifkan notifikasi: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'add',
	aliases: ['tambahmember'],
	category: 'Administrasi Grup',
	description: 'Menambahkan anggota baru ke grup WhatsApp (Admin & Bot Admin Only).',
	usage: '.add <nomor_telepon>',
	baileysMethods: ['sock.groupParticipantsUpdate(chat, [jid], "add")'],
	groupOnly: true,
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		const num = ctx.query?.replace(/\D/g, '')
		if (!num) return ctx.reply('⚠️ Masukkan nomor telepon (contoh: `.add 628123456789`).')
		const userJid = `${num}@s.whatsapp.net`
		try {
			const res = await sock.groupParticipantsUpdate(ctx.chat, [userJid], 'add')
			const status = res?.[0]?.status
			if (!status || status === '200') {
				return ctx.reply(`✅ Berhasil menambahkan @${num} ke dalam grup.`, { mentions: [userJid] })
			} else if (status === '403') {
				return ctx.reply(`❌ Gagal menambahkan @${num}: Bot bukan admin grup atau privasi pengguna membatasi undangan grup.`, { mentions: [userJid] })
			} else if (status === '409') {
				return ctx.reply(`⚠️ Pengguna @${num} sudah berada di dalam grup ini.`, { mentions: [userJid] })
			} else {
				return ctx.reply(`❌ Gagal menambahkan @${num} (Kode respons WhatsApp: ${status}).`, { mentions: [userJid] })
			}
		} catch (err) {
			return ctx.reply(`❌ Gagal menambahkan anggota: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'setnamagrup',
	aliases: ['setsubject'],
	category: 'Administrasi Grup',
	description: 'Mengubah nama/subjek grup WhatsApp (Admin Only).',
	usage: '.setnamagrup <nama_baru>',
	baileysMethods: ['sock.groupUpdateSubject(chat, name)'],
	groupOnly: true,
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		if (!ctx.query) return ctx.reply('⚠️ Masukkan nama grup baru.')
		try {
			await sock.groupUpdateSubject(ctx.chat, ctx.query)
			return ctx.reply(`✅ Nama grup diubah menjadi: *${ctx.query}*`)
		} catch (err) {
			return ctx.reply(`❌ Gagal mengubah nama grup: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'setdesc',
	aliases: ['setdeskripsi'],
	category: 'Administrasi Grup',
	description: 'Mengubah deskripsi grup WhatsApp (Admin Only).',
	usage: '.setdesc <deskripsi_baru>',
	baileysMethods: ['sock.groupUpdateDescription(chat, desc)'],
	groupOnly: true,
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		if (!ctx.query) return ctx.reply('⚠️ Masukkan deskripsi grup baru.')
		try {
			await sock.groupUpdateDescription(ctx.chat, ctx.query)
			return ctx.reply('✅ Deskripsi grup berhasil diperbarui.')
		} catch (err) {
			return ctx.reply(`❌ Gagal mengubah deskripsi: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'revokelink',
	aliases: ['resetlink'],
	category: 'Administrasi Grup',
	description: 'Mereset / mencabut tautan undangan grup saat ini dan membuat tautan baru (Admin Only).',
	usage: '.revokelink',
	baileysMethods: ['sock.groupRevokeInvite(chat)'],
	groupOnly: true,
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		try {
			const newCode = await sock.groupRevokeInvite(ctx.chat)
			return ctx.reply(`🔄 Tautan undangan grup berhasil di-reset.\nTautan baru: https://chat.whatsapp.com/${newCode}`)
		} catch (err) {
			return ctx.reply(`❌ Gagal mereset tautan grup: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'edit',
	aliases: ['editpesan'],
	category: 'Informasi & Utility',
	description: 'Mengedit teks pesan yang telah dikirim oleh bot sebelumnya.',
	usage: '.edit <teks_baru> (reply pesan bot)',
	baileysMethods: ['sock.sendMessage(..., { edit: key, text: ... })'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		if (!ctx.quoted) return ctx.reply('⚠️ Reply pesan milik bot yang ingin diedit.')
		const isBotSender = Boolean(
			ctx.quoted.isFromMe ||
			ctx.quoted.fromMe ||
			ctx.quoted.key?.fromMe ||
			(ctx.quoted.sender && jidNormalizedUser(ctx.quoted.sender) === jidNormalizedUser(sock.user?.id))
		)
		if (!isBotSender) return ctx.reply('⚠️ Reply pesan milik bot yang ingin diedit.')
		if (!ctx.query) return ctx.reply('⚠️ Masukkan teks pengganti.')
		try {
			await sock.sendMessage(ctx.chat, { edit: ctx.quoted.key, text: ctx.query })
		} catch (err) {
			return ctx.reply(`❌ Gagal mengedit pesan: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'react',
	aliases: ['reaksi'],
	category: 'Informasi & Utility',
	description: 'Memberikan reaksi emoji pada pesan yang di-reply.',
	usage: '.react <emoji> (reply pesan)',
	baileysMethods: ['sock.sendMessage(..., { react: { text: emoji, key } })'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		const emoji = ctx.query?.trim() || '❤️'
		const targetKey = ctx.quoted ? ctx.quoted.key : ctx.msg.key
		try {
			await sock.sendMessage(ctx.chat, { react: { text: emoji, key: targetKey } })
		} catch (err) {
			return ctx.reply(`❌ Gagal memberikan reaksi: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'status',
	aliases: ['presence'],
	category: 'Informasi & Utility',
	description: 'Mengubah status online presence bot ("available" / "unavailable").',
	usage: '.status [online/offline]',
	baileysMethods: ['sock.sendPresenceUpdate(mode)'],
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, false)) return
		const mode = ctx.query === 'offline' ? 'unavailable' : 'available'
		try {
			await sock.sendPresenceUpdate(mode, ctx.chat)
			return ctx.reply(`📡 Status kehadiran bot diubah ke: *${mode}*`)
		} catch (err) {
			return ctx.reply(`❌ Gagal mengubah status kehadiran: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'story',
	aliases: ['statuswa', 'upstatus'],
	category: 'Informasi & Utility',
	description: 'Mengirim teks atau media ke WhatsApp Status / Cerita bot (Owner Only).',
	usage: '.story <teks_atau_caption> (bisa reply media)',
	baileysMethods: ['sock.sendMessage("status@broadcast", ...)'],
	ownerOnly: true,
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, true)) return
		const text = ctx.query || 'Update Status via MFSAVANA Baileys'
		try {
			if (ctx.quoted && typeof ctx.quoted.download === 'function') {
				const buffer = await ctx.quoted.download()
				const qMsg = ctx.quoted.message || {}
				if (qMsg.imageMessage) {
					await sock.sendMessage('status@broadcast', { image: buffer, caption: text })
				} else if (qMsg.videoMessage) {
					await sock.sendMessage('status@broadcast', { video: buffer, caption: text })
				} else {
					await sock.sendMessage('status@broadcast', { text }, { statusJidList: [ctx.sender, sock.user?.id].filter(Boolean) })
				}
			} else {
				await sock.sendMessage('status@broadcast', { text }, { statusJidList: [ctx.sender, sock.user?.id].filter(Boolean) })
			}
			return ctx.reply('✅ Status WhatsApp berhasil diperbarui!')
		} catch (err) {
			return ctx.reply(`❌ Gagal memperbarui status: ${err.message}`)
		}
	}
})

registerCommand({
	name: 'ratelimit',
	aliases: ['limitinfo'],
	category: 'Owner & Keamanan',
	description: 'Melihat konfigurasi rate limit pengiriman command bot.',
	usage: '.ratelimit',
	baileysMethods: ['sock.rateLimit'],
	ownerOnly: true,
	execute: async (ctx, sock) => {
		if (!checkPermission(ctx, true)) return
		return ctx.reply(
			'⚙️ *KONFIGURASI RATE LIMITER*\n' +
			'• Max Pesan: 10 pesan / 10 detik\n' +
			'• Cooldown: 15 detik jika limit terlampaui\n' +
			'• Anti-Spam: Aktif'
		)
	}
})

// BOOTSTRAP SOCKET ENGINE
// =============================================================================

async function startBot() {
	console.log('[INIT] Mempersiapkan MFSAVANA WhatsApp Bot...\n')

	// 1. Bersihkan socket sebelumnya jika ada untuk mencegah concurrent instance / session file lock
	if (activeSocket) {
		try {
			activeSocket.ev?.removeAllListeners?.()
			activeSocket.end?.()
		} catch {}
		activeSocket = null
	}

	// 2. Setup Multi-File Auth State
	const sessionDir = process.env.SESSION_FOLDER || './session'
	const { state, saveCreds } = await useMultiFileAuthState(sessionDir)

	// 3. Instansiasi Engine makeWASocket dengan konfigurasi optimal
	const sock = makeWASocket({
		auth: state,
		dynamicLogger: true,
		browser: 'optimal',
		promptPhoneNumber: true,
		phoneNumber: process.env.BOT_PHONE_NUMBER,
		defaultPairingCode: process.env.PAIRING_CODE || 'MFSAVANA',
		autoTyping: true,
		saveIncomingMessages: 'all',
		messageStoreMaxAgeMs: 24 * 60 * 60 * 1000,
		antiBan: {
			enabled: true,
			minDelayMs: 400,
			maxDelayMs: 1000,
			simulatePresence: true
		},
		rateLimit: {
			max: 10,
			windowMs: 10000,
			cooldownMs: 15000,
			notifyOnLimit: false
		}
	})

	activeSocket = sock

	// 4. Simpan Kredensial Auth
	sock.ev.on('creds.update', saveCreds)

	// 5. Pantau Status Koneksi & Rekoneksi Teruji
	sock.ev.on('connection.update', async update => {
		const { connection, lastDisconnect, pairingCode } = update

		if (pairingCode) {
			console.log('======================================================')
			console.log(`KODE PAIRING WHATSAPP: ${pairingCode}`)
			console.log('Buka WhatsApp > Perangkat Tertaut > Tautkan dengan Kode')
			console.log('======================================================\n')
		}

		if (connection === 'close') {
			const { decision, scheduled, delayMs } = reconnectionSupervisor.handleDisconnect(
				lastDisconnect?.error,
				async () => {
					console.log(`[RECONNECTING] Memulai koneksi ulang (Percobaan ke-${reconnectionSupervisor.getAttempts()})...`)
					await startBot()
				}
			)

			console.log(`[KONEKSI TERPUTUS] Status code: ${decision.statusCode || 'N/A'}. Reason: ${decision.reason}. Reconnect: ${decision.shouldReconnect}`)

			if (scheduled) {
				console.log(`Menghubungkan ulang dalam ${(delayMs / 1000).toFixed(1)} detik...`)
			} else if (decision.isLoggedOut) {
				console.log('[FATAL] Sesi logout permanen. Hapus folder session dan scan ulang QR / tautkan kode.')
			} else if (decision.isFatal) {
				console.log(`[FATAL] Koneksi ditolak secara permanen (${decision.reason}). Reconnect dihentikan untuk keamanan akun.`)
			}
		} else if (connection === 'open') {
			reconnectionSupervisor.onConnected()
			console.log('[CONNECTED] Bot WhatsApp MFSAVANA aktif.')
			console.log(`[SECURITY] Owner Tunggal: +${OWNER_NUMBER}`)
			console.log(`[SECURITY] Total Grup Terverifikasi: ${verifiedGroups.size} grup\n`)
		}
	})

	// 6. Pantau Realtime Session Health State
	sock.onSessionStateUpdate(s => {
		console.log(`[SESSION HEALTH] Status: ${s.connectionStatus}, Latency: ${s.latencyMs}ms, In: ${s.messagesIn}, Out: ${s.messagesOut}`)
	})

	// =========================================================================
	// REGISTRASI PERINTAH KE HIGH-LEVEL SOCKET ROUTER
	// =========================================================================

	for (const cmd of COMMAND_REGISTRY) {
		const allTriggers = [cmd.name, ...cmd.aliases]
		sock.onCommand(allTriggers, async ctx => {
			try {
				await cmd.execute(ctx, sock)
			} catch (err) {
				console.error(`[COMMAND ERROR .${cmd.name}]:`, err)
				await ctx.reply(`❌ Terjadi kesalahan saat mengeksekusi \`.${cmd.name}\`: ${err.message}`)
			}
		})
	}

	// =========================================================================
	// SMART REALTIME EVENT LISTENERS
	// =========================================================================

	// 1. Anti-Delete Notifier: Mendeteksi pesan terhapus dan mengirimkan kembali isinya
	sock.onDelete(async d => {
		if (d.isGroup && !isGroupAllowed(d.chat)) return
		if (!d.deletedMessage) return

		const textContent = d.deletedMessage.text || d.deletedMessage.body
		if (!textContent) return

		try {
			await sock.sendMessage(d.chat, {
				text:
					`🗑️ *DETEKSI PESAN TERHAPUS*\n` +
					`• *Pengirim*: @${(d.sender || '').split('@')[0]}\n` +
					`• *Pesan Asli*: ${textContent}`,
				mentions: d.sender ? [d.sender] : []
			})
		} catch {}
	})

	// 2. Anti-Edit Notifier: Mendeteksi pesan yang diedit
	sock.onEdit(async e => {
		if (e.isGroup && !isGroupAllowed(e.chat)) return
		const prev = e.previousMessage?.text || e.previousMessage?.body || '(Pesan tidak tercatat)'
		const curr = e.newText || e.editedMessage?.text || ''
		if (!curr || prev === curr) return

		try {
			await sock.sendMessage(e.chat, {
				text:
					`✏️ *DETEKSI PESAN DIEDIT*\n` +
					`• *Pengirim*: @${(e.sender || '').split('@')[0]}\n` +
					`• *Sebelumnya*: ~${prev}~\n` +
					`• *Menjadi*: ${curr}`,
				mentions: e.sender ? [e.sender] : []
			})
		} catch {}
	})

	// 3. Welcome & Leave Notifier
	sock.onParticipantUpdate(async p => {
		if (!isGroupAllowed(p.id)) return

		for (const participant of p.participants) {
			const num = participant.split('@')[0]
			if (p.action === 'add') {
				await sock.sendMessage(p.id, {
					text: `👋 Selamat datang @${num} di grup!\nPatuhi peraturan grup dan ketik \`.menu\` untuk bantuan.`,
					mentions: [participant]
				})
			} else if (p.action === 'remove') {
				await sock.sendMessage(p.id, {
					text: `👋 Selamat jalan @${num}, semoga sukses di luar sana!`,
					mentions: [participant]
				})
			}
		}
	})

	// 4. Anti-Call Rejector
	sock.onCall(async call => {
		if (call.status === 'offer') {
			try {
				if (typeof call.reject === 'function') {
					await call.reject()
				} else if (typeof sock.rejectCall === 'function') {
					await sock.rejectCall(call.id, call.from)
				}
				await sock.sendMessage(call.from, {
					text: '⛔ *Panggilan Otomatis Ditolak*\nBot tidak dapat menerima panggilan telepon atau video.'
				})
			} catch {}
		}
	})

	// 5. Interactive Button & List Menu Logger
	sock.onMessage(async (ctx, msg) => {
		const selectedId = msg.selectedButtonId || ctx.selectedButtonId || msg.selectedRowId || ctx.selectedRowId
		if (selectedId) {
			console.log(`[INTERAKTIF DIPILIH] ${ctx.senderNumber} memilih: ${selectedId}`)
			// Perintah yang diawali titik otomatis dieksekusi oleh router sock.onCommand()
		}
	})
}

// Jalankan Bot
startBot().catch(err => {
	console.error('Fatal bot error:', err)
})
