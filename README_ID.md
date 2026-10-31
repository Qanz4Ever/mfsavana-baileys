# MFSAVANA Baileys (v1.0.1)

<p align="center">
  <b>Engine WhatsApp Web API Node.js yang Tangguh, Siap Produksi, dan Berfitur Lengkap</b>
</p>

<p align="center">
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-≥20.0.0-339933?logo=node.js&logoColor=white" alt="Node.js Version" /></a>
  <a href="https://github.com/WhiskeySockets/Baileys"><img src="https://img.shields.io/badge/Base-Baileys%20v7.0.0--rc14-25D366?logo=whatsapp&logoColor=white" alt="Base Engine" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://www.npmjs.com/package/mfsavana-baileys"><img src="https://img.shields.io/npm/v/mfsavana-baileys.svg?color=cb3837&logo=npm" alt="NPM Version" /></a>
  <a href="https://www.npmjs.com/package/mfsavana-baileys"><img src="https://img.shields.io/npm/dm/mfsavana-baileys.svg?color=blue" alt="NPM Downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License" /></a>
  <a href="README.md"><img src="https://img.shields.io/badge/English-README.md-blue" alt="English Docs" /></a>
</p>

---

## Ringkasan Proyek

**MFSAVANA Baileys** adalah fork Baileys siap produksi yang dibangun di atas fondasi resmi **`@whiskeysockets/baileys` (versi 7.0.0-rc14)**, dengan dukungan protokol biner WhatsApp Web terkini (**`2.3000.1043857760`**).

Baileys standar menyediakan fungsi dasar koneksi WebSocket dan enkripsi Signal. Namun, saat menjalankan bot skala produksi 24/7, seringkali ditemui masalah seperti deadlock stream (Error 515), ketidaksinkronan LID vs Nomor Telepon, spam reconnect, dan keterbatasan protokol tombol interaktif. **MFSAVANA Baileys** menyelesaikan semua permasalahan ini secara langsung tanpa perlu dependensi framework eksternal.

---

## Perbandingan Fitur: Vanilla Baileys vs MFSAVANA Baileys

| Fitur / Kemampuan | Vanilla Baileys | MFSAVANA Baileys |
| :--- | :---: | :---: |
| **Versi Base** | v7.0.0-rc14 | **v7.0.0-rc14 (Hardened)** |
| **Sistem Rekoneksi** | Manual via `connection.update` | **`ReconnectionSupervisor` Otomatis (Exponential Backoff, Recovery 515, Stop saat Logout 401)** |
| **Stream Deadlock (Error 515)** | Butuh restart manual | **Graceful auto-restart dengan backoff terkontrol** |
| **Perlindungan Anti-Ban** | Tidak ada | **`AntiBanEngine` bawaan dengan antrean jitter (400–1000ms) & simulasi status mengetik** |
| **Rate Limiter** | Tidak ada | **Token-bucket limiter per pengirim (10 pesan / 10 detik, cooldown otomatis 15s)** |
| **Pesan Tombol Interaktif** | Protobuf manual rumit | **Helper Native Flow resmi: Quick Reply, Single Select List, Salin Kode, Tautan Web, Telepon** |
| **Album Multi-Media** | Terkirim terpisah | **Container Album resmi WhatsApp (`messageAssociation.MEDIA_ALBUM`)** |
| **Media Sekali Lihat (View-Once)**| Stream manual | **Auto-caching pesan masuk & helper `downloadViewOnce()` instan** |
| **Voice Notes (PTT)** | Glitch mulai di detik 0:03 | **Waveform sintetis 64-sample & format OPUS (Audio mulai tepat di 0:00)** |
| **Pembuatan Stiker** | WebP mentah tanpa metadata | **Helper `formatSticker()` dengan kompresi WebP 512x512 dan metadata EXIF resmi** |
| **Saluran / Newsletter WA** | Query GraphQL terfragmentasi | **Mex GraphQL v2 lengkap: create, detail info, subscriber, reaksi emoji, mute/unmute** |
| **Event Listeners Tingkat Tinggi** | Hanya `messages.upsert` | **Listener Deklaratif: `onCommand`, `onEdit`, `onDelete`, `onCall`, `onParticipantUpdate`** |

---

## Fitur Utama

### 1. Reconnection Supervisor (Stabilitas Koneksi)
- Mengatasi otomatis putus koneksi sementara, socket timeout (`408`), penolakan server (`500`), dan restart stream (`515`).
- Mencegah spam reconnect tanpa henti jika sesi logout permanen (`401 / loggedOut`).
- Membersihkan timer tertinggal dan listener socket lama saat disconnect untuk mencegah memory leak.

### 2. Antrean Jitter Anti-Ban & Rate Limiter
- Setiap pengiriman pesan keluar dialirkan melalui antrean ber-jitter acak (400ms – 1000ms).
- Mensimulasikan status kehadiran mengetik (`composing` & `paused`) secara dinamis.
- Mencegah akun bot diblokir akibat pengiriman pesan terlalu cepat secara massal.

### 3. Tombol Interaktif & List Menu Native
- Mendukung protokol interaktif WhatsApp terbaru:
  - **Single Select List** (`single_select` dengan judul section dan baris pilihan)
  - **Tombol Salin** (`cta_copy` untuk kode promo / voucher)
  - **Tombol URL** (`cta_url` untuk tautan situs web)
  - **Tombol Telepon** (`cta_call` untuk kontak suara)
  - **Tombol Quick Reply** respons cepat
- Secara otomatis menyisipkan node XML `<biz>` dan `<native_flow>` sehingga tombol berfungsi di Android, iOS, dan WhatsApp Web.

### 4. Album Multi-Media WhatsApp
- Mengelompokkan banyak gambar dan video ke dalam satu tampilan album rapi menggunakan protokol konteks `MessageAssociation.MEDIA_ALBUM`.

### 5. Smart Event Listeners
- `sock.onCommand(['ping', 'menu'], async ctx => { ... })`: Router perintah pintar dengan parsing prefix, parameter, dan filter izin.
- `sock.onEdit(async e => { ... })`: Mendeteksi pesan yang diedit serta menampilkan teks lama vs teks baru.
- `sock.onDelete(async d => { ... })`: Mendeteksi pesan ditarik/dihapus (Anti-Delete).
- `sock.onCall(async call => { ... })`: Menolak otomatis panggilan suara atau video yang masuk (`call.reject()`).
- `sock.onParticipantUpdate(async p => { ... })`: Notifikasi member masuk (welcome) dan keluar (leave) grup.

---

## Persyaratan Sistem & Instalasi

### Persyaratan
- **Node.js**: Versi `20.0.0` atau lebih tinggi
- **Sistem Operasi**: Linux, macOS, atau Windows
- **Sharp**: Sudah terpasang otomatis untuk pemrosesan gambar & stiker WebP

### Opsi Instalasi

#### Opsi 1: Melalui Terminal CLI (Direkomendasikan)
Pasang menggunakan manajer paket pilihan Anda:
```bash
# npm
npm install mfsavana-baileys

# pnpm
pnpm add mfsavana-baileys

# yarn
yarn add mfsavana-baileys
```

#### Opsi 2: Melalui Berkas `package.json`
Tambahkan `mfsavana-baileys` secara langsung ke dalam `dependencies` di file `package.json` proyek bot Anda:

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
> **Tips:** Penggunaan nilai `"latest"` memastikan bot Anda selalu mendapatkan pembaruan otomatis perbaikan protokol WhatsApp Web dan patch keamanan terkini. Anda juga dapat mengunci versi tertentu dengan `"^1.0.1"`.

Setelah menyimpan berkas `package.json`, jalankan perintah pemasangan:
```bash
npm install
# atau: pnpm install / yarn install
```

#### Opsi 3: Langsung dari Repositori GitHub
```bash
npm install github:Qanz4Ever/mfsavana-baileys
```

---


## Panduan Cepat (Quick Start)

```javascript
import makeWASocket, { useMultiFileAuthState } from 'mfsavana-baileys'

async function jalankanBot() {
    // 1. Inisialisasi kredensial auth multi-file
    const { state, saveCreds } = await useMultiFileAuthState('./session')

    // 2. Buat koneksi socket WhatsApp
    const sock = makeWASocket({
        auth: state,
        promptPhoneNumber: true, // Input nomor HP di terminal jika belum login
        defaultPairingCode: 'MFSAVANA',
        autoTyping: true, // Simulasi mengetik otomatis sebelum membalas
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

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', ({ connection, pairingCode }) => {
        if (pairingCode) {
            console.log(`Kode Pairing: ${pairingCode}`)
            console.log('Buka WhatsApp > Perangkat Tertaut > Tautkan dengan Kode')
        }
        if (connection === 'open') {
            console.log('✅ Bot MFSAVANA Baileys berhasil terhubung!')
        }
    })

    // 3. Command Ping
    sock.onCommand(['ping'], async ctx => {
        return ctx.reply('Pong! Bot merespon dengan cepat.')
    })

    // 4. Tombol Interaktif Native Flow
    sock.onCommand(['button'], async ctx => {
        return ctx.replyButton({
            title: 'MFSAVANA Engine',
            text: 'Silakan pilih menu di bawah ini:',
            footer: 'Pesan Tombol Interaktif WhatsApp',
            buttons: [
                { type: 'quick_reply', displayText: '⚡ Cek Ping', id: '.ping' },
                { type: 'copy', displayText: '📋 Salin Kode', copy: 'MFSAVANA-2026' },
                { type: 'url', displayText: '🌐 Buka Situs Web', url: 'https://example.com' }
            ]
        })
    })

    // 5. Anti-Call Rejector
    sock.onCall(async call => {
        if (call.status === 'offer') {
            await call.reject()
            await sock.sendMessage(call.from, { text: '⛔ Panggilan ditolak otomatis oleh bot.' })
        }
    })
}

jalankanBot()
```

---

## Konfigurasi Lingkungan (`.env`)

Buat file `.env` pada folder root tempat aplikasi `bot.js` Anda dijalankan:

```env
NODE_ENV=production
BOT_PHONE_NUMBER=628123456789
PAIRING_CODE=MFSAVANA
SESSION_FOLDER=./session
LOG_LEVEL=silent
OWNER_NUMBER=6285360554431
```

> **Catatan**: File `.env` dipanggil dari direktori kerja utama project Anda (`process.cwd()`). Anda **tidak perlu** meletakkannya di dalam folder `node_modules`.

---

## Menjalankan di Production (PM2)

Untuk server / VPS dengan jaminan uptime 24/7:

```bash
# 1. Pasang PM2 secara global
npm install -g pm2

# 2. Jalankan bot dengan konfigurasi single-instance
pm2 start ecosystem.config.cjs

# 3. Pantau status dan log realtime
pm2 status
pm2 logs mfsavana-baileys-prod
```

---

## Tautan Dokumentasi Terkait

- **Dokumentasi Lengkap Bahasa Inggris**: [DOCS.md](DOCS.md)
- **Dokumentasi Lengkap Bahasa Indonesia**: [DOCS_ID.md](DOCS_ID.md)
- **Panduan Pengujian 53 Perintah Bot**: [PANDUAN_TESTING_BOT.md](PANDUAN_TESTING_BOT.md)
- **Panduan Operasional Produksi**: [PRODUCTION.md](PRODUCTION.md)

---

## Lisensi

Proyek ini dilisensikan di bawah **GNU Affero General Public License v3.0 (AGPL-3.0-or-later)**.
* **Hak Cipta (c) 2026 MFSAVANA** (https://github.com/Qanz4Ever/mfsavana-baileys)
* Bagian hulu Hak Cipta (c) 2025 Rajeh Taher / WhiskeySockets (Lisensi MIT)

### Ketentuan Utama Lisensi
1. **Wajib Atribusi & Kredit**: Setiap distribusi, fork, atau modifikasi wajib mempertahankan pemberitahuan hak cipta asli dan mencantumkan kredit ke MFSAVANA secara jelas.
2. **Larangan Klaim Kepemilikan**: Dilarang keras mengklaim, menyatakan, atau memberi kesan bahwa proyek ini, fitur-fitur intinya, atau fork turunannya adalah milik/ciptaan Anda sendiri.
3. **Ketentuan Fork (Copyleft/Share-Alike)**: Semua fork dan karya turunan (termasuk yang dioperasikan melalui server jaringan/cloud) WAJIB tetap dirilis secara open-source di bawah lisensi AGPLv3 yang sama.
4. **Kepatuhan Upstream**: Sepenuhnya menghormati dan menyertakan lisensi MIT dari WhiskeySockets/Baileys.