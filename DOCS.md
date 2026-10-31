# MFSAVANA Baileys - Official Documentation & Technical Reference

State-of-the-art WhatsApp Web API engine for Node.js built on top of Baileys (`@whiskeysockets/baileys v7.0.0-rc14`, WhatsApp Web binary protocol `2.3000.1043857760`). Designed for rock-solid 24/7 production stability with zero unnecessary abstraction.

---

## Table of Contents
- [0. Quick Start Guide for Beginners](#0-quick-start-guide-for-beginners)
- [Architecture: `sock` vs `msg` vs `ctx`](#architecture-sock-vs-msg-vs-ctx)
- [1. Socket Initialization & Options](#1-socket-initialization--options)
- [2. Session Health & Realtime Metrics](#2-session-health--realtime-metrics)
- [3. Anti-Ban Jitter Engine & Token-Bucket Rate Limiter](#3-anti-ban-jitter-engine--token-bucket-rate-limiter)
- [4. Interactive Messages (Native Flow Buttons & List Menu)](#4-interactive-messages-native-flow-buttons--list-menu)
- [5. Grouped Multi-Media Albums](#5-grouped-multi-media-albums)
- [6. View-Once Media Engine (v1, v2, v3)](#6-view-once-media-engine-v1-v2-v3)
- [7. Audio (Voice Notes) & Sticker Engine](#7-audio-voice-notes--sticker-engine)
- [8. WhatsApp Channel / Newsletter Suite](#8-whatsapp-channel--newsletter-suite)
- [9. Smart Realtime Event Listeners](#9-smart-realtime-event-listeners)
- [10. Group Administration & Whitelisting](#10-group-administration--whitelisting)
- [11. Deep Phone Number Inspector](#11-deep-phone-number-inspector)
- [12. Production Deployment & Troubleshooting](#12-production-deployment--troubleshooting)

---

## 0. Quick Start Guide for Beginners

### Understanding WhatsApp JIDs (Jabber Identifiers)
Every entity in the WhatsApp network has a unique JID:
- **Individual Contact**: `628123456789@s.whatsapp.net` (country code without `+` or leading `0`).
- **Group Chat**: `120363000000000000@g.us`
- **Channel / Newsletter**: `120363000000000000@newsletter`
- **Broadcast Status / Story**: `status@broadcast`

### Basic Bot Implementation (25 Lines)
```javascript
import makeWASocket, { useMultiFileAuthState } from 'mfsavana-baileys'

async function run() {
    const { state, saveCreds } = await useMultiFileAuthState('./session')

    const sock = makeWASocket({
        auth: state,
        promptPhoneNumber: true,
        defaultPairingCode: 'MFSAVANA',
        autoTyping: true
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', ({ connection }) => {
        if (connection === 'open') console.log('Bot is online!')
    })

    sock.onCommand(['ping'], async ctx => {
        await ctx.reply('Pong! Bot is active and healthy.')
    })
}

run()
```

---

## Architecture: `sock` vs `msg` vs `ctx`

1. **`sock` (The Socket Client)**:
   - Root connection instance managing WebSocket state, encryption keys, and low-level protocols.
   - Example: `sock.sendMessage(jid, content)`, `sock.groupMetadata(jid)`, `sock.newsletterCreate(name)`.

2. **`msg` (Serialized Message)**:
   - Developer-friendly wrapper around WhatsApp's raw `proto.WebMessageInfo`.
   - Has built-in methods: `msg.reply()`, `msg.react()`, `msg.download()`, `msg.tagAll()`.

3. **`ctx` (Command Context)**:
   - Provided inside `sock.onCommand((ctx) => { ... })`.
   - Encapsulates sender info, parsed command name (`ctx.command`), arguments array (`ctx.args`), query string (`ctx.query`), quoted message (`ctx.quoted`), and reply helpers (`ctx.reply()`, `ctx.replyButton()`, `ctx.replyListMenu()`).

---

## 1. Socket Initialization & Options

```typescript
import makeWASocket, { useMultiFileAuthState } from 'mfsavana-baileys'

const { state, saveCreds } = await useMultiFileAuthState('./session')

const sock = makeWASocket({
    auth: state,
    dynamicLogger: true,        // Clean colored terminal logging
    browser: 'optimal',         // macOS Chrome optimal emulation
    promptPhoneNumber: true,    // Terminal input for phone pairing
    phoneNumber: '628xxx',      // Auto phone number if defined
    defaultPairingCode: 'MFSAVANA',
    autoTyping: true,           // Automatic human composing simulation
    saveIncomingMessages: 'all',// Cache messages locally in memory (TTL 24h)
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
```

---

## 2. Session Health & Realtime Metrics

Monitor connection health, latency, message throughput, and socket lifecycle:

```javascript
sock.onSessionStateUpdate(health => {
    console.log(`Connection: ${health.connectionStatus}`)
    console.log(`Latency: ${health.latencyMs} ms`)
    console.log(`Messages In: ${health.messagesIn} | Out: ${health.messagesOut}`)
})
```

---

## 3. Anti-Ban Jitter Engine & Token-Bucket Rate Limiter

- **Jitter Queue**: Transparently queues outbound messages and applies randomized human-like delays (400ms – 1000ms) with `composing` and `paused` presence simulation.
- **Rate Limiter**: Token-bucket algorithm enforcing a maximum burst of 10 commands per 10 seconds. When a user exceeds the limit, a 15-second cooldown is automatically applied.

Toggle dynamically at runtime:
```javascript
// Toggle auto-typing presence
sock.autoTyping(false) // Disable
sock.autoTyping(true)  // Enable
```

---

## 4. Interactive Messages (Native Flow Buttons & List Menu)

### Interactive Buttons (`replyButton` / `sendButton`)
```javascript
await ctx.replyButton({
    title: 'MFSAVANA Interactivity',
    text: 'Please select one of the actions below:',
    footer: 'Powered by mfsavana-baileys',
    buttons: [
        { type: 'quick_reply', displayText: '⚡ Ping Status', id: '.ping' },
        { type: 'copy', displayText: '📋 Copy Voucher Code', copy: 'MFSAVANA2026' },
        { type: 'url', displayText: '🌐 Visit Website', url: 'https://example.com' },
        { type: 'call', displayText: '📞 Call Helpdesk', phone: '+628123456789' }
    ]
})
```

### List Menu Single Select (`replyListMenu` / `sendListMenu`)
```javascript
await ctx.replyListMenu({
    title: 'Bot Menu Navigation',
    subtitle: 'Select a category to view commands',
    text: 'Tap the button below to display available sections:',
    buttonText: 'Open Menu List',
    footer: 'MFSAVANA Engine',
    sections: [
        {
            title: 'General Commands',
            rows: [
                { id: '.ping', title: 'Ping Latency', description: 'Test WebSocket latency' },
                { id: '.health', title: 'System Health', description: 'Inspect memory and session score' }
            ]
        },
        {
            title: 'Media Utilities',
            rows: [
                { id: '.sticker', title: 'Convert to Sticker', description: 'Transform photo to WebP' },
                { id: '.album', title: 'Album Showcase', description: 'Send grouped photo album' }
            ]
        }
    ]
})
```

---

## 5. Grouped Multi-Media Albums

Group multiple images and videos into a single visual container in WhatsApp:

```javascript
await ctx.sendAlbum([
    {
        image: { url: 'https://picsum.photos/800/800?random=1' },
        caption: 'First photo caption'
    },
    {
        image: { url: 'https://picsum.photos/800/800?random=2' },
        caption: 'Second photo caption'
    },
    {
        video: { url: 'https://example.com/video.mp4' },
        caption: 'Video clip'
    }
], { caption: '📁 Complete Album Container' })
```

---

## 6. View-Once Media Engine (v1, v2, v3)

### Download View-Once Media
When a user replies to a View-Once image, video, or audio with `.rvo`:

```javascript
sock.onCommand(['rvo', 'readvo'], async ctx => {
    if (!ctx.quoted) return ctx.reply('Reply to a View-Once message.')
    
    // Download directly from decrypted cache or stream
    const buffer = await ctx.quoted.downloadViewOnce()
    const type = ctx.quoted.viewOnceType || 'image'
    
    if (type === 'image') {
        await ctx.reply({ image: buffer, caption: '🔓 Decrypted View-Once Image' })
    } else if (type === 'video') {
        await ctx.reply({ video: buffer, caption: '🔓 Decrypted View-Once Video' })
    } else if (type === 'audio') {
        await ctx.reply({ audio: buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true })
    }
})
```

### Send View-Once Media
```javascript
await sock.sendMessage(chatJid, {
    image: buffer,
    caption: 'View-Once Photo',
    viewOnce: true
})
```

---

## 7. Audio (Voice Notes) & Sticker Engine

### PTT Voice Notes (Aligned at 0:00)
MFSAVANA Baileys formats audio into `audio/ogg; codecs=opus`, calculates duration rounded to seconds, and embeds a 64-sample synthetic waveform to ensure audio plays immediately from `0:00`.

```javascript
await sock.sendMessage(chatJid, {
    audio: audioBuffer,
    mimetype: 'audio/ogg; codecs=opus',
    ptt: true
})
```

### WebP Stickers with EXIF Metadata
```javascript
import { formatSticker } from 'mfsavana-baileys'

const webpSticker = await formatSticker(rawImageBuffer, {
    pack: 'My Sticker Pack',
    author: 'MFSAVANA Bot',
    quality: 80
})

await sock.sendMessage(chatJid, { sticker: webpSticker })
```

---

## 8. WhatsApp Channel / Newsletter Suite

Comprehensive implementation of WhatsApp's Mex GraphQL v2:

```javascript
// 1. Create Channel
const channel = await sock.newsletterCreate('My Community Channel', 'Official updates')
console.log('Channel JID:', channel.id)

// 2. Fetch Channel Metadata (by JID or Invite Code)
const meta = await sock.newsletterMetadata('jid', '120363xxx@newsletter')
console.log(`Subscribers: ${meta.subscribers}, Name: ${meta.name}`)

// 3. Follow / Unfollow
await sock.newsletterFollow(channelJid)
await sock.newsletterUnfollow(channelJid)

// 4. Mute / Unmute
await sock.newsletterMute(channelJid)
await sock.newsletterUnmute(channelJid)

// 5. React to Channel Message
await sock.newsletterReactMessage(channelJid, serverId, '🔥')
```

---

## 9. Smart Realtime Event Listeners

```javascript
// 1. Declarative Command Dispatcher
sock.onCommand(['ping', 'latency'], async ctx => {
    await ctx.reply('Pong!')
})

// 2. Anti-Edit Detection
sock.onEdit(async e => {
    console.log(`Message in ${e.chat} edited by ${e.senderNumber}`)
    console.log(`Previous: ${e.previousMessage?.text}`)
    console.log(`New: ${e.newText}`)
})

// 3. Anti-Delete Detection
sock.onDelete(async d => {
    console.log(`Message deleted by ${d.sender} in ${d.chat}`)
})

// 4. Anti-Call Rejector
sock.onCall(async call => {
    if (call.status === 'offer') {
        await call.reject()
        await sock.sendMessage(call.from, { text: '⛔ Panggilan suara/video otomatis ditolak.' })
    }
})

// 5. Group Welcome & Leave
sock.onParticipantUpdate(async p => {
    for (const user of p.participants) {
        if (p.action === 'add') {
            await sock.sendMessage(p.id, { text: `Welcome @${user.split('@')[0]}!`, mentions: [user] })
        }
    }
})
```

---

## 10. Group Administration & Whitelisting

```javascript
// Check group metadata and admin roles
const meta = await sock.groupMetadata(groupJid)
const isAdmin = meta.participants.some(p => p.id === sock.user?.id && (p.admin === 'admin' || p.admin === 'superadmin'))

// Add participant with response status verification
const [res] = await sock.groupParticipantsUpdate(groupJid, [userJid], 'add')
if (res.status === '200') console.log('Successfully added')
if (res.status === '403') console.log('Privacy settings restricted')
if (res.status === '409') console.log('Already in group')
```

---

## 11. Deep Phone Number Inspector

Inspect any phone number before sending messages:

```javascript
const result = await sock.inspectPhone('628123456789')
console.log('Registered on WhatsApp:', result.isRegistered)
console.log('Business Account:', result.isBusiness)
console.log('Bio / About:', result.about)
```

---

## 12. Production Deployment & Troubleshooting

### Deployment via PM2
```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 logs mfsavana-baileys-prod
```

### Critical Rules for Production
1. **Single Instance**: Never run multiple cluster instances against the same `./session` folder. WhatsApp permits only one active WebSocket connection per session.
2. **Environment Isolation**: Always set `NODE_ENV=production` and `LOG_LEVEL=silent` in your `.env` file.
3. **Session Backup**: Periodically back up your `./session` folder while the bot process is stopped.

---

## 13. Contact Management & Cloud Address Book Sync

MFSAVANA Baileys provides first-class methods to save, edit, and delete contacts directly on the WhatsApp Cloud Address Book (App State Sync) and tools to generate and extract group contacts as vCard / VCF files.

### 13.1 Save & Edit Contacts Directly
Save or update a contact so it appears in WhatsApp Web and connected devices:
```typescript
// Save by string name (auto-splits firstName and fullName)
await sock.saveContact('6281234567890@s.whatsapp.net', 'Budi Santoso')

// Edit an existing contact's name
await sock.editContact('6281234567890@s.whatsapp.net', 'Budi Santoso (VIP Client)')

// Or pass detailed IContactAction object
await sock.saveContact('6281234567890@s.whatsapp.net', {
    fullName: 'Budi Santoso',
    firstName: 'Budi',
    saveOnPrimaryAddressbook: true
})
```

### 13.2 Delete Contacts
Remove a contact from WhatsApp Cloud address book:
```typescript
await sock.deleteContact('6281234567890@s.whatsapp.net')
```

### 13.3 Send vCard Contact Cards
Send single or multiple WhatsApp contact cards:
```typescript
await sock.sendContact('6281234567890@s.whatsapp.net', {
    fullName: 'Customer Support',
    number: '628999999999',
    org: 'MFSAVANA Tech'
})
```

### 13.4 Group Contact Extraction (VCF)
Extract all group participants (excluding bot) into a downloadable `.vcf` file:
```typescript
const { count, groupSubject, vcfBuffer, fileName, contactsList } = await sock.exportGroupContactsVCF(groupId, 'Client')

// Send .vcf document for instant phone import
await sock.sendMessage(groupId, {
    document: vcfBuffer,
    fileName,
    mimetype: 'text/vcard',
    caption: `Extracted ${count} contacts from ${groupSubject}`
})
```

### 13.5 Namespace Helper (`sock.contact`)
All methods are also available under the `sock.contact` namespace:
```typescript
await sock.contact.save(jid, 'Nama')
await sock.contact.edit(jid, 'Nama Baru')
await sock.contact.delete(jid)
await sock.contact.send(targetJid, contactInfo)
await sock.contact.exportGroupVCF(groupId, 'Member')
```
