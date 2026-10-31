# MFSAVANA Baileys (v1.0.0)

<p align="center">
  <b>Production-Ready, Resilient, and Full-Featured WhatsApp Web API Engine for Node.js</b>
</p>

<p align="center">
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-≥20.0.0-339933?logo=node.js&logoColor=white" alt="Node.js Version" /></a>
  <a href="https://github.com/WhiskeySockets/Baileys"><img src="https://img.shields.io/badge/Base-Baileys%20v7.0.0--rc14-25D366?logo=whatsapp&logoColor=white" alt="Base Engine" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://www.npmjs.com/package/mfsavana-baileys"><img src="https://img.shields.io/npm/v/mfsavana-baileys.svg?color=cb3837&logo=npm" alt="NPM Version" /></a>
  <a href="https://www.npmjs.com/package/mfsavana-baileys"><img src="https://img.shields.io/npm/dm/mfsavana-baileys.svg?color=blue" alt="NPM Downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL_v3-blue.svg" alt="License" /></a>
  <a href="README_ID.md"><img src="https://img.shields.io/badge/Bahasa%20Indonesia-README_ID.md-orange" alt="Indonesian Docs" /></a>
</p>

---

## Overview

**MFSAVANA Baileys** is a hardened, production-grade fork built on top of upstream **`@whiskeysockets/baileys` (v7.0.0-rc14)**, tracking the latest WhatsApp Web binary protocol (**`2.3000.1043857760`**).

While vanilla Baileys provides the core WebSocket and Signal protocol primitives, building a reliable 24/7 production bot often requires solving stream deadlocks (Error 515), multi-device LID/PN mismatches, message retry loops, rate-limiting, and modern interactive elements. **MFSAVANA Baileys** solves these pain points out of the box with zero external framework overhead.

---

## Why MFSAVANA Baileys? (Comparison)

| Feature | Vanilla Baileys | MFSAVANA Baileys |
| :--- | :---: | :---: |
| **Base Engine** | v7.0.0-rc14 | **v7.0.0-rc14 (Hardened)** |
| **Reconnection Architecture** | Manual `connection.update` loop | **Built-in `ReconnectionSupervisor` (Exponential Backoff, Error 515 auto-recovery, 401 permanent halt)** |
| **Stream Deadlock (Error 515)** | Requires custom restart code | **Automatic graceful restart with exponential backoff** |
| **Anti-Ban Protection** | None (Raw socket emission) | **`AntiBanEngine` with humanized jitter queue (400–1000ms) & presence simulation** |
| **Rate Limiter** | None | **Token-bucket limiter with user-level cooldowns (10 msg / 10s)** |
| **Native Flow Buttons** | Manual Protobuf manipulation | **First-class helper: Quick Reply, Single Select List, CTA Copy, CTA URL, CTA Call** |
| **Album Messages** | Standalone messages | **Native grouped multi-media album container (`messageAssociation`)** |
| **View-Once Media** | Manual decryption stream | **Auto caching, recovery, and download helper (`downloadViewOnce()`)** |
| **Voice Notes (PTT)** | Glitches to 0:03 if unpadded | **Auto OPUS formatting, rounded duration, 64-sample synthetic waveform (Starts at 0:00)** |
| **Sticker Creation** | Raw WebP without EXIF | **`formatSticker()` with automatic 512x512 WebP scaling & official EXIF metadata chunk** |
| **WhatsApp Channels / Newsletter** | Fragmented queries | **Full Mex GraphQL v2: create, metadata, subscribe, reaction, admin demote/promote** |
| **High-Level Listeners** | `messages.upsert` only | **Declarative: `onCommand`, `onEdit`, `onDelete`, `onCall`, `onParticipantUpdate`** |

---

## Key Enhancements

### 1. Connection Resilience Supervisor
- Auto-handles stream restarts (`Stream Errored: 515`), connection resets (`ECONNRESET`), socket timeouts (`408`), and server rejections (`500`).
- Prevents infinite reconnect spam on permanent logouts (`401 / loggedOut`).
- Automatically clears orphan timers, WebSocket listeners, and auth mutex locks on teardown.

### 2. Anti-Ban Jitter & Token-Bucket Rate Limiter
- All outbound messages route through an asynchronous scheduler with randomized delay (default: 400ms – 1000ms).
- Simulates human presence typing state (`composing` & `paused`) dynamically.
- Per-sender token bucket prevents group flooding and temporary account bans.

### 3. Native Flow Buttons & Structured Menus
- Supports WhatsApp's latest interactive protocol:
  - **Single Select List** (`single_select` with sections and rows)
  - **Clipboard Copy** (`cta_copy`)
  - **URL Redirect** (`cta_url`)
  - **Phone Call** (`cta_call`)
  - **Quick Reply** buttons
- Automatically includes required XML `<biz>` and `<native_flow>` nodes in stanzas so buttons render reliably across Android, iOS, and Web.

### 4. Grouped Media Albums
- Group multiple images and videos into a single visual WhatsApp album container using official `MessageAssociation.MEDIA_ALBUM` context protocol.

### 5. Smart High-Level Event Handlers
- `sock.onCommand(['ping', 'menu'], async ctx => { ... })`: Context-aware command dispatcher with prefix detection, arguments parser, and permission checks.
- `sock.onEdit(async e => { ... })`: Detects edited messages and reports both previous and new content.
- `sock.onDelete(async d => { ... })`: Anti-Delete listener recovering original text messages.
- `sock.onCall(async call => { ... })`: Intercepts and rejects voice/video calls with instant shortcut (`call.reject()`).
- `sock.onParticipantUpdate(async p => { ... })`: Welcomes new members or announces departures in groups.

---

## Installation & Requirements

### System Requirements
- **Node.js**: `v20.0.0` or higher
- **OS**: Linux, macOS, or Windows (10/11 / Server)
- **Dependencies**: Sharp (bundled in `package.json` for high-speed WebP image processing)

### Installation Options

#### Option 1: Via CLI (Recommended)
Install using your preferred Node.js package manager:
```bash
# npm
npm install mfsavana-baileys

# pnpm
pnpm add mfsavana-baileys

# yarn
yarn add mfsavana-baileys
```

#### Option 2: Via `package.json`
Add `mfsavana-baileys` directly to your bot's `package.json` dependencies:

```json
{
  "name": "my-whatsapp-bot",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "mfsavana-baileys": "latest"
  }
}
```
> **Tip:** Setting `"latest"` ensures your bot always retrieves the latest WhatsApp Web binary protocol fixes and security patches. Alternatively, lock to a specific minor release using `"^1.0.0"`.

After saving your `package.json`, run:
```bash
npm install
# or: pnpm install / yarn install
```

#### Option 3: Direct Git Source (Bleeding-Edge)
```bash
npm install github:Qanz4Ever/mfsavana-baileys
```

---


## Quick Start

### 1. Initialize Connection (Pairing Code or QR)

```javascript
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from 'mfsavana-baileys'

async function startBot() {
    // 1. Setup multi-file auth credentials
    const { state, saveCreds } = await useMultiFileAuthState('./session')

    // 2. Instantiate socket with resilience options
    const sock = makeWASocket({
        auth: state,
        promptPhoneNumber: true, // Prompt for phone number in terminal if not authenticated
        phoneNumber: process.env.BOT_PHONE_NUMBER, // Or supply via environment variable
        defaultPairingCode: 'MFSAVANA',
        autoTyping: true, // Simulate human typing indicator before replying
        antiBan: {
            enabled: true,
            minDelayMs: 400,
            maxDelayMs: 1000,
            simulatePresence: true
        },
        rateLimit: {
            max: 10,
            windowMs: 10000,
            cooldownMs: 15000
        }
    })

    // Save auth credentials whenever updated
    sock.ev.on('creds.update', saveCreds)

    // Listen for connection lifecycle
    sock.ev.on('connection.update', ({ connection, lastDisconnect, pairingCode }) => {
        if (pairingCode) {
            console.log(`Pairing Code: ${pairingCode}`)
            console.log('Open WhatsApp > Linked Devices > Link with Phone Number')
        }

        if (connection === 'open') {
            console.log('WhatsApp Bot is online and connected!')
        }
    })

    // 3. Declarative Command Routing
    sock.onCommand(['ping'], async ctx => {
        return ctx.reply('Pong! Latency is nominal.')
    })

    // 4. Send Interactive Native Flow Buttons
    sock.onCommand(['button'], async ctx => {
        return ctx.replyButton({
            title: 'MFSAVANA Engine',
            text: 'Choose an option below:',
            footer: 'Interactive native button protocol',
            buttons: [
                { type: 'quick_reply', displayText: '⚡ Ping Status', id: '.ping' },
                { type: 'copy', displayText: '📋 Copy Voucher', copy: 'VOUCHER-2026' },
                { type: 'url', displayText: '🌐 Visit Website', url: 'https://example.com' }
            ]
        })
    })

    // 5. Send Grouped Media Album
    sock.onCommand(['album'], async ctx => {
        return ctx.sendAlbum([
            { image: { url: 'https://picsum.photos/800/800?random=1' }, caption: 'Photo 1' },
            { image: { url: 'https://picsum.photos/800/800?random=2' }, caption: 'Photo 2' }
        ], { caption: '📁 Grouped Media Album' })
    })

    // 6. Anti-Call Rejector
    sock.onCall(async call => {
        if (call.status === 'offer') {
            await call.reject()
            await sock.sendMessage(call.from, { text: '⛔ Auto-Reject: This bot does not accept calls.' })
        }
    })
}

startBot()
```

---

## Environment Variables (`.env`)

You can create a `.env` file at the root of your application where your `bot.js` is executed:

```env
NODE_ENV=production
BOT_PHONE_NUMBER=628123456789
PAIRING_CODE=MFSAVANA
SESSION_FOLDER=./session
LOG_LEVEL=silent
OWNER_NUMBER=6285360554431
```

> **Note**: `.env` is loaded by your main process from the current working directory (`process.cwd()`). It does not need to be stored inside `node_modules`.

---

## Production Deployment (PM2)

For 24/7 production servers (Ubuntu / Debian / CentOS / Windows VPS):

```bash
# 1. Install PM2 globally
npm install -g pm2

# 2. Start bot with single-instance policy (strictly 1 instance per WhatsApp session)
pm2 start ecosystem.config.cjs

# 3. Monitor live status
pm2 status
pm2 logs mfsavana-baileys-prod
```

### Sample `ecosystem.config.cjs`:
```javascript
module.exports = {
  apps: [
    {
      name: 'mfsavana-baileys-prod',
      script: 'bot.js',
      instances: 1, // MUST be 1 per session to prevent Error 440 (Stream Replaced)
      autorestart: true,
      max_memory_restart: '600M',
      env: {
        NODE_ENV: 'production',
        SESSION_FOLDER: './session',
        LOG_LEVEL: 'silent'
      }
    }
  ]
}
```

---

## Documentation

- **English Technical Reference**: [DOCS.md](DOCS.md)
- **Panduan Teknis Bahasa Indonesia**: [DOCS_ID.md](DOCS_ID.md)
- **Panduan Pengujian 53 Fitur Bot**: [PANDUAN_TESTING_BOT.md](PANDUAN_TESTING_BOT.md)
- **Panduan Operasional Produksi**: [PRODUCTION.md](PRODUCTION.md)

---

## Credits & License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0-or-later)**.
* **Copyright (c) 2026 MFSAVANA** (https://github.com/Qanz4Ever/mfsavana-baileys)
* Portions Copyright (c) 2025 Rajeh Taher / WhiskeySockets (MIT License)

### Key License Terms
1. **Attribution & Credit**: Any distribution, fork, or modification must preserve the original copyright notice and give prominent credit to MFSAVANA.
2. **No Misrepresentation**: You may not claim, state, or imply that this software, its core features, or derived forks are solely your own original work.
3. **Copyleft & Share-Alike**: All forks and derivative works (including network/cloud services interacting with users) MUST remain open source under the identical AGPLv3 license.
4. **Upstream Compliance**: Complies with WhiskeySockets/Baileys MIT license terms.