# Dokumentasi Resmi & Panduan Komprehensif MFSAVANA Baileys (v1.0.0)

> **Base Engine**: @whiskeysockets/baileys v7.0.0-rc14 • **WhatsApp Web Protocol**: 2.3000.1043857760

Pustaka WhatsApp Web API termutakhir berbasis Baileys yang dirancang khusus agar **mudah dan ramah bagi pemula yang baru pertama kali membuat bot WhatsApp**, sekaligus **tangguh untuk kebutuhan production skala besar**. 

Dilengkapi arsitektur **Self-Healing Enkripsi (Anti Bad MAC)**, **Inspeksi Nomor Mendalam**, **Menu & Tombol Interaktif Native Flow**, **Database Pesan Masuk (Anti Delete)**, **View-Once v1/v2/v3 Recovery**, **Album Multi-Media**, **Newsletter/Channel Manager**, serta **Session Health Monitoring**.

---

## Daftar Isi
- [0. Panduan Kilat Pemula: Dari Nol Sampai Bot Jalan](#0-panduan-kilat-pemula-dari-nol-sampai-bot-jalan)
- [FUNDAMENTAL: Kapan Menggunakan `sock` vs `msg` / `ctx`?](#fundamental-kapan-menggunakan-sock-vs-msg--ctx)
- [1. Inisialisasi & Konfigurasi Socket](#1-inisialisasi--konfigurasi-socket)
- [2. Session Health & Realtime State Monitoring](#2-session-health--realtime-state-monitoring)
- [3. Dynamic Colored Terminal Logger](#3-dynamic-colored-terminal-logger)
- [4. Database Pesan Masuk & Fitur Anti-Delete](#4-database-pesan-masuk--fitur-anti-delete)
- [5. Pesan Interaktif: List Menu & Flow Buttons](#5-pesan-interaktif-list-menu--flow-buttons)
- [6. Inspeksi Nomor WhatsApp Mendalam (`inspectPhone`)](#6-inspeksi-nomor-whatsapp-mendalam-inspectphone)
- [7. Mengedit & Menghapus Pesan](#7-mengedit--menghapus-pesan)
- [8. Verifikasi Status Admin Grup](#8-verifikasi-status-admin-grup)
- [9. Broadcast Story / Status WhatsApp Mention Grup](#9-broadcast-story--status-whatsapp-mention-grup)
- [10. Helper Pesan Terserialisasi (`msg`) Lengkap](#10-helper-pesan-terserialisasi-msg-lengkap)
- [11. Manajemen Profil, Grup & Kontrol Kehadiran](#11-manajemen-profil-grup--kontrol-kehadiran)
- [12. Smart High-Level Event Listeners](#12-smart-high-level-event-listeners)
- [13. Context Wrapper (`ctx`) & Declarative Command Dispatcher (`onCommand`)](#13-context-wrapper-ctx--declarative-command-dispatcher-oncommand)
- [14. Arsitektur Anti Bad MAC & Keandalan Enkripsi Sesi](#14-arsitektur-anti-bad-mac--keandalan-enkripsi-sesi)
- [15. Fitur Pesan Sekali Lihat (View-Once Engine v1, v2, v3)](#15-fitur-pesan-sekali-lihat-view-once-engine-v1-v2-v3)
- [16. Pembuatan Poling Lengkap & Tracker Suara Realtime](#16-pembuatan-poling-lengkap--tracker-suara-realtime)
- [17. Sistem Proteksi Bot: Anti-Ban & Rate Limiter](#17-sistem-proteksi-bot-anti-ban--rate-limiter)
- [18. Fitur Album Messages (Pengiriman Multi-Media Bersatu)](#18-fitur-album-messages-pengiriman-multi-media-bersatu)
- [19. Newsletter & WhatsApp Channel API (Lengkap)](#19-newsletter--whatsapp-channel-api-lengkap)
- [20. Panduan Pemecahan Masalah (Troubleshooting & FAQ Pemula)](#20-panduan-pemecahan-masalah-troubleshooting--faq-pemula)

---

## 0. Panduan Kilat Pemula: Dari Nol Sampai Bot Jalan

Jika kamu belum pernah membuat bot WhatsApp sebelumnya, kamu berada di tempat yang tepat. `mfsavana-baileys` menyederhanakan semua kerumitan teknis (enkripsi Signal, decode protobuf, session crash) sehingga kamu bisa fokus membuat fitur bot impianmu.

### 1. Apa Itu JID (Jabber ID) di WhatsApp?
Di WhatsApp, setiap kontak, grup, atau saluran diidentifikasi oleh string unik bernama **JID**:
- **Nomor Pribadi**: `628123456789@s.whatsapp.net` (Gunakan kode negara, tanpa tanda `+` atau `08`).
- **Grup WhatsApp**: `120363000000000000@g.us`
- **Saluran / Channel**: `120363000000000000@newsletter`
- **Story Status**: `status@broadcast`

### 2. Prasyarat
- Pasang **Node.js versi 20 atau lebih baru** (Cek di terminal: `node -v`).

### 3. Kode Bot Pertama Kamu (Hanya 25 Baris!)
Simpan kode berikut sebagai `index.js`:

```javascript
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from 'mfsavana-baileys'

async function main() {
    // 1. Siapkan folder sesi untuk menyimpan login WhatsApp
    const { state, saveCreds } = await useMultiFileAuthState('./session')

    // 2. Buat socket koneksi
    const sock = makeWASocket({
        auth: state,
        dynamicLogger: true,        // Tampilan log terminal rapi & berwarna
        promptPhoneNumber: true,    // Minta nomor HP otomatis di terminal jika belum login
        defaultPairingCode: 'MFSAVANA', // Kode pairing default
        autoTyping: true            // Efek mengetik otomatis sebelum bot membalas
    })

    // 3. Simpan perubahan login
    sock.ev.on('creds.update', saveCreds)

    // 4. Pantau status koneksi
    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
        if (connection === 'close') {
            const reconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
            if (reconnect) main() // Reconnect otomatis jika koneksi terputus sesaat
        } else if (connection === 'open') {
            console.log('✅ Bot WhatsApp MFSAVANA Berhasil Terhubung!')
        }
    })

    // 5. Tanggapi pesan masuk menggunakan perintah praktis!
    sock.onCommand('ping', async (ctx) => {
        await ctx.reply('Pong! Bot MFSAVANA aktif dan responsif 🚀')
    })
}

main()
```

Jalankan di terminal:
```bash
node index.js
```
Ketik nomor HP WhatsApp bot kamu di terminal (misal: `6285360554431`). Buka WhatsApp di HP > **Perangkat Tertaut** > **Tautkan dengan Kode**, lalu masukkan kode 8 digit yang muncul di layar terminal. Bot langsung aktif!

---

## FUNDAMENTAL: Kapan Menggunakan `sock` vs `msg` / `ctx`?

Salah satu pertanyaan paling umum bagi pemula adalah:
> *"Kapan saya harus memanggil fungsi lewat `sock` (misal: `sock.sendMessage`), dan kapan saya harus memanggil lewat `msg` / `ctx` (misal: `msg.reply`)?"*

Pahami analogi sederhana ini:

```
┌────────────────────────────────────────────────────────────────────────┐
│  sock (Socket) = Telepon Bot Sendiri (Aksi Mandiri & Global)           │
│  Digunakan saat bot berinisiatif sendiri tanpa terikat pesan masuk.    │
│  Contoh: Kirim broadcast berkala, ubah bio bot, buat channel baru.     │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│  msg / ctx = Surat yang Sedang Dibaca Bot (Aksi Reaktif & Terarah)     │
│  Digunakan saat bot sedang MEMBALAS atau MERESPON pesan pengguna.      │
│  Otomatis tahu siapa pengirimnya, chat tujuannya, dan quoted msg-nya. │
└────────────────────────────────────────────────────────────────────────┘
```

### Tabel Komparasi Praktis: `sock` vs `msg` / `ctx`

| Tujuan / Aksi | Menggunakan `sock` (Level Socket Global) | Menggunakan `msg` atau `ctx` (Level Pesan Masuk) | Rekomendasi Pilihan |
| :--- | :--- | :--- | :--- |
| **Membalas Pesan Pengguna** | `sock.sendMessage(chatId, { text: 'Halo' }, { quoted: rawMsg })` *(Panjang & manual)* | `await msg.reply('Halo')` atau `await ctx.reply('Halo')` *(Cepat & otomatis quote)* | **Gunakan `msg` / `ctx`** |
| **Memberikan Reaksi Emoji** | `sock.sendMessage(chatId, { react: { text: '👍', key: msg.key } })` | `await msg.react('👍')` atau `await ctx.react('👍')` | **Gunakan `msg` / `ctx`** |
| **Kirim Pesan Terjadwal (Cron Job / Alarm)** | `await sock.sendMessage('628xxx@s.whatsapp.net', { text: 'Waktunya minum air!' })` | *Tidak bisa (tidak ada pesan masuk)* | **Wajib `sock`** |
| **Cek Admin Grup Pengirim** | Ambil `sock.groupMetadata()`, cari array participants, cocokkan JID manual | `await msg.isSenderAdmin()` atau `await ctx.isSenderAdmin()` | **Gunakan `msg` / `ctx`** |
| **Cek Apakah Bot Adalah Admin** | Ambil `sock.groupMetadata()`, cari nomor bot sendiri di daftar admin | `await msg.isBotAdmin()` atau `await ctx.isBotAdmin()` | **Gunakan `msg` / `ctx`** |
| **Unduh Foto/Video yang Dikirim** | `downloadMediaMessage(rawMsg, ...)` *(Butuh import dan parsing stream)* | `const buffer = await msg.download()` atau `await ctx.download()` | **Gunakan `msg` / `ctx`** |
| **Kirim Tombol Interaktif** | `sock.sendButton(targetChat, btnData)` | `await msg.replyButton(btnData)` *(Otomatis mengutip pesan pengirim)* | **`msg` untuk balas, `sock` untuk broadcast** |
| **Kirim List Menu Pilihan** | `sock.sendListMenu(targetChat, listData)` | `await msg.replyListMenu(listData)` | **`msg` untuk balas, `sock` untuk broadcast** |
| **Buka Pesan Sekali Lihat (RVO)** | `sock.downloadViewOnce(rawMsg)` | `const buf = await ctx.downloadViewOnce()` *(Otomatis cek cache lokal)* | **Gunakan `ctx` / `msg`** |
| **Mengubah Nama / Bio Bot Sendiri** | `await sock.profileUtils().setName('Nama Bot')` | `await msg.profileUtils().setName('Nama Bot')` | **Bebas (keduanya mengarah ke bot)** |
| **Mengubah Nama Grup Saat Ini** | `await sock.groupUpdateSubject(chatId, 'Nama Baru')` | `await msg.setGroupName('Nama Baru')` atau `await ctx.group.setName('Nama Baru')` | **Gunakan `msg` / `ctx`** |
| **Keluarkan Member dari Grup** | `sock.groupParticipantsUpdate(chatId, [userJid], 'remove')` | `await msg.kick(userJid)` atau `await ctx.kick(userJid)` | **Gunakan `msg` / `ctx`** |
| **Manajemen Saluran (Newsletter)** | `sock.newsletterId()`, `sock.newsletterCreate()`, dll. | *(Selalu melalui socket karena channel bersifat global)* | **Wajib `sock`** |

> [!TIP]
> **Aturan Emas Pemula**: Jika kamu sedang membuat logika perintah di dalam `sock.onMessage` atau `sock.onCommand`, **selalu prioritaskan memakai `msg` atau `ctx`**. Gunakan `sock` hanya jika aksinya dilakukan di luar pesan masuk (misal: saat startup, timer `setInterval`, webhook luar, atau fungsi saluran WhatsApp).

---

## 1. Inisialisasi & Konfigurasi Socket

Inisialisasi bot dengan parameter lengkap dan optimal:

```javascript
import makeWASocket, { useMultiFileAuthState, Browsers, DisconnectReason } from 'mfsavana-baileys'

const { state, saveCreds } = await useMultiFileAuthState('./session')

const sock = makeWASocket({
    auth: state,

    // 1. Browser Signature (Meniru browser Chrome Windows asli agar aman dari blokir)
    // Pilihan string: 'optimal' | 'windows' | 'macos' | 'ubuntu' | 'edge' | 'firefox'
    browser: 'optimal',

    // 2. Terminal Logger Rapi Berwarna
    dynamicLogger: true,

    // 3. Database Penyimpanan Pesan Masuk (Pondasi Anti-Delete & View-Once Recovery)
    saveIncomingMessages: 'all',                // 'all' | 'group' | 'direct' | 'none'
    messageStoreMaxAgeMs: 24 * 60 * 60 * 1000, // Simpan riwayat selama 24 jam di memori
    messageStorePath: './message_store.json',   // Opsional: simpan ke file JSON permanen

    // 4. Input Nomor Otomatis & Pairing Code
    promptPhoneNumber: true,                   // Meminta input nomor di terminal jika belum login
    phoneNumber: '628xxxxxxxxxx',              // Atau tentukan nomor langsung di sini
    defaultPairingCode: 'MFSAVANA',            // Custom kode pairing 8 karakter

    // 5. Animasi Mengetik Alami
    autoTyping: true,                          // Bot otomatis menampilkan status 'mengetik' sebelum membalas

    // 6. Proteksi Anti-Ban Outbound (Jeda Alami Pengiriman Pesan)
    antiBan: {
        enabled: true,
        minDelayMs: 400,                       // Jeda acak 400ms - 1200ms antar pesan keluar
        maxDelayMs: 1200,
        simulatePresence: true
    },

    // 7. Rate Limiter (Proteksi Serangan Flood / Spam User)
    rateLimit: {
        max: 5,                                // Maksimal 5 perintah
        windowMs: 10000,                       // Dalam kurun 10 detik
        cooldownMs: 15000,                     // Hukuman cooldown 15 detik jika spam
        notifyOnLimit: false                   // Kirim peringatan otomatis jika limit habis
    }
})

// Simpan kredensial setiap kali diperbarui oleh server WhatsApp
sock.ev.on('creds.update', saveCreds)
```

---

## 2. Session Health & Realtime State Monitoring

Ketahui kesehatan koneksi bot, kecepatan latensi WebSocket, serta beban RAM server secara realtime.

### Kapan Menggunakan `sock` vs `msg`?
- **Gunakan `sock.getSessionHealth()`**: Saat membuat dashboard admin, cron job pemantau server, atau endpoint API monitoring.
- **Gunakan `msg.getSessionHealth()`**: Saat kamu membuat perintah balasan bot seperti `.health` atau `.status` yang diminta pengguna di chat.

### Contoh Implementasi:

```javascript
// 1. Pantau perubahan koneksi secara global via sock
sock.onSessionStateUpdate((state) => {
    console.log(`[HEALTH] Koneksi: ${state.connectionStatus}, Latensi: ${state.latencyMs}ms, Pesan In: ${state.messagesIn}, Out: ${state.messagesOut}`)
})

// 2. Respon perintah .health via ctx / msg
sock.onCommand(['health', 'status'], async (ctx) => {
    const report = await ctx.getSessionHealth() // atau sock.getSessionHealth()
    
    await ctx.reply(
        `*KESEHATAN SESI BOT*\n\n` +
        `• Status Koneksi: ${report.connectionStatus}\n` +
        `• Skor Kesehatan: ${report.isHealthy ? 'Normal' : 'Terganggu'} (${report.score}%)\n` +
        `• Latensi Server: ${report.latencyMs} ms\n` +
        `• Pesan Diterima: ${report.messagesIn}\n` +
        `• Pesan Dikirim: ${report.messagesOut}\n` +
        `• Uptime Bot: ${Math.floor(process.uptime())} detik`
    )
})
```

---

## 3. Dynamic Colored Terminal Logger

`mfsavana-baileys` menyertakan logger bawaan yang bersih, informatif, dan berwarna sehingga terminal kamu tidak dipenuhi pesan *debug json raw* yang membingungkan:

```javascript
const sock = makeWASocket({
    auth: state,
    dynamicLogger: true // Mengaktifkan warna terminal ANSI dinamis
})
```
- **Warna Hijau**: Event koneksi sukses (*CONNECTED*) & pesan keluar berhasil dikirim.
- **Warna Kuning**: Warning jaringan, proses re-keying, atau antrian rate limit.
- **Warna Merah**: Error koneksi, sesi logout, atau dekripsi gagal.
- **Warna Biru / Magenta**: Event interaktif (tombol diklik, poling dipilih, pesan diedit/dihapus).

---

## 4. Database Pesan Masuk & Fitur Anti-Delete

WhatsApp sering kali menghapus cipher kunci saat pesan ditarik atau saat pesan sekali lihat dikutip. `mfsavana-baileys` memecahkan masalah ini dengan **Message Store Caching**:

```javascript
// Konfigurasi di makeWASocket
saveIncomingMessages: 'all', // Menyimpan riwayat pesan di memori
messageStoreMaxAgeMs: 24 * 60 * 60 * 1000 // Bersihkan riwayat otomatis setelah 24 jam
```

### Kapan Menggunakan `sock` vs `msg`?
- Deteksi pesan ditarik selalu didengarkan di level global socket lewat event **`sock.onDelete`**.
- Di dalam event tersebut, kamu menggunakan parameter `d` untuk membalas kembali ke grup atau owner.

```javascript
// Smart Anti-Delete Notifier (Hanya aktif jika pesan berteks nyata terhapus)
sock.onDelete(async (d) => {
    if (!d.deletedMessage) return
    const text = d.deletedMessage.text || d.deletedMessage.body
    if (!text) return // Abaikan jika bukan teks nyata agar tidak spam

    // Kirim notifikasi menggunakan sock karena objek pesan aslinya sudah terhapus dari WA
    await sock.sendMessage(d.chat, {
        text: `[Pesan Ditarik]\nPengirim: @${d.deletedByNumber}\nPesan: "${text}"`,
        mentions: d.deletedBy ? [d.deletedBy] : []
    })
})
```

---

## 5. Pesan Interaktif: List Menu & Flow Buttons

WhatsApp versi modern mendukung **Interactive Native Flow Messages**: tombol pilihan (*single select*) dan tombol aksi (*quick reply, copy code, open url, call*).

### Kapan Menggunakan `sock` vs `msg`?
- **Gunakan `msg.replyListMenu` / `msg.replyButton`**: Saat membalas perintah pengguna (misal user mengetik `.menu`, bot membalas dengan list menu yang mengutip pesan user).
- **Gunakan `sock.sendListMenu` / `sock.sendButton`**: Saat mengirim menu promosi atau tombol broadcast ke nomor/grup tertentu tanpa mengutip pesan siapapun.

### A. List Menu (Menu Pilihan dengan Bagian & Baris)

```javascript
sock.onCommand(['menu', 'listmenu'], async (ctx) => {
    // Membalas langsung ke pengirim
    await ctx.replyListMenu({
        title: 'Pusat Layanan Bot',
        subtitle: 'Pilih kategori yang kamu butuhkan',
        text: 'Silakan klik tombol di bawah untuk melihat seluruh modul yang tersedia:',
        footer: 'MFSAVANA Baileys Engine',
        buttonText: 'Buka Daftar Menu',
        sections: [
            {
                title: 'Administrasi Grup',
                rows: [
                    { id: '.tagall', title: 'Tag Seluruh Member', description: 'Panggil semua anggota' },
                    { id: '.hidetag', title: 'Hidetag Tersembunyi', description: 'Tag tanpa teks nomor' }
                ]
            },
            {
                title: 'Utilitas & Media',
                rows: [
                    { id: '.rvo', title: 'Buka Pesan 1x Lihat', description: 'Download foto/video sekali lihat' },
                    { id: '.album', title: 'Contoh Album', description: 'Kirim album multi-media' }
                ]
            }
        ]
    })
})
```

### B. Interactive Flow Buttons (Tombol Cepat, Salin Teks, Buka URL)

```javascript
sock.onCommand('tombol', async (ctx) => {
    await ctx.replyButton({
        title: 'Pusat Bantuan',
        text: 'Klik tombol di bawah ini untuk aksi cepat:',
        footer: 'MFSAVANA Bot',
        buttons: [
            {
                type: 'quick_reply',
                text: 'Cek Kesehatan Bot',
                id: '.health'
            },
            {
                type: 'cta_copy',
                text: 'Salin Kode Voucher',
                copy: 'HEMAT2026'
            },
            {
                type: 'cta_url',
                text: 'Kunjungi Website',
                url: 'https://github.com'
            }
        ]
    })
})
```

### C. Menangkap Respon Tombol / Menu yang Diklik Pengguna
Gunakan `sock.onMessage` untuk mendeteksi ID tombol atau baris menu yang diklik:

```javascript
sock.onMessage(async (ctx, msg) => {
    const selectedId = msg.selectedButtonId || ctx.selectedButtonId
    if (selectedId) {
        console.log(`Pengguna ${ctx.senderNumber} memilih tombol: ${selectedId}`)
        if (selectedId === '.health') {
            await ctx.reply('Kamu baru saja mengklik tombol Health!')
        }
    }
})
```

---

## 6. Inspeksi Nomor WhatsApp Mendalam (`inspectPhone`)

Mengetahui informasi nomor WhatsApp target tanpa perlu menyimpan kontak terlebih dahulu.

### Kapan Menggunakan `sock` vs `msg`?
- **`sock.inspectPhone('628123456789')`**: Untuk mengecek nomor sembarang yang diinputkan pengguna.
- **`msg.inspectPhone()`**: Otomatis mengecek nomor pengirim pesan saat ini tanpa perlu passing argumen.

```javascript
sock.onCommand('inspect', async (ctx) => {
    // Ambil nomor target dari argumen atau default pengirim pesan
    const target = ctx.args[0] || ctx.senderNumber
    const res = await sock.inspectPhone(target)

    await ctx.reply(
        `*HASIL INSPEKSI WHATSAPP*\n\n` +
        `• Nomor: +${target}\n` +
        `• Terdaftar di WhatsApp: ${res.isRegistered ? 'Ya' : 'Tidak'}\n` +
        `• Status Banned: ${res.isBanned ? 'Terbanned' : 'Normal / Aktif'}\n` +
        `• Tipe Akun: ${res.isBusiness ? 'WhatsApp Business' : 'WhatsApp Personal'}\n` +
        `• Bio / About: "${res.description || '-'}"\n` +
        `• Foto Profil: ${res.profilePictureUrl || 'Tidak ada / Privasi'}`
    )
})
```

---

## 7. Mengedit & Menghapus Pesan

### Kapan Menggunakan `sock` vs `msg`?
- **`msg.edit('Teks Baru')`**: Mengedit pesan yang sebelumnya dikirim oleh bot dan sedang di-reply.
- **`msg.delete(true)`**: Menghapus pesan yang sedang di-reply untuk semua orang (*Delete for Everyone*).
- **`sock.editMessage(chat, messageKey, 'Teks Baru')`**: Mengedit pesan sembarang di latar belakang jika kamu menyimpan objek `messageKey`-nya.

```javascript
// 1. Edit Pesan Bot:
sock.onCommand('edit', async (ctx) => {
    if (!ctx.quoted) return ctx.reply('Reply pesan bot yang ingin kamu edit!')
    await ctx.edit(ctx.query, ctx.quoted.key)
    await ctx.reply('Pesan berhasil diedit!')
})

// 2. Hapus Pesan (Delete for Everyone):
sock.onCommand('del', async (ctx) => {
    if (!ctx.quoted) return ctx.reply('Reply pesan yang ingin dihapus!')
    await ctx.delete(true, ctx.quoted.key)
})
```

---

## 8. Verifikasi Status Admin Grup

Tidak perlu lagi mengambil metadata grup lalu memfilter array participants secara rumit!

### Kapan Menggunakan `sock` vs `msg`?
- **`msg.isSenderAdmin()` / `ctx.isSenderAdmin()`**: Memeriksa apakah **pengirim pesan** saat ini adalah admin di grup tersebut.
- **`msg.isBotAdmin()` / `ctx.isBotAdmin()`**: Memeriksa apakah **akun bot sendiri** sudah menjadi admin di grup tersebut.
- **`sock.isGroupAdmin(groupJid, userJid)`**: Digunakan jika kamu ingin memeriksa status admin seseorang di grup lain dari luar obrolan.

```javascript
sock.onCommand('kick', async (ctx) => {
    if (!ctx.isGroup) return ctx.reply('Perintah ini hanya bisa dipakai di dalam grup!')
    
    // Validasi apakah pengirim berhak
    if (!await ctx.isSenderAdmin()) {
        return ctx.reply('❌ Kamu bukan admin grup ini!')
    }

    // Validasi apakah bot punya wewenang mengeluarkan member
    if (!await ctx.isBotAdmin()) {
        return ctx.reply('❌ Jadikan bot sebagai admin grup terlebih dahulu!')
    }

    const target = ctx.mentions[0] || ctx.args[0]
    if (!target) return ctx.reply('Format: .kick @user')

    await ctx.kick(target)
    await ctx.reply('Anggota berhasil dikeluarkan.')
})
```

---

## 9. Broadcast Story / Status WhatsApp Mention Grup

Fitur eksklusif untuk memposting Story/Status WhatsApp yang otomatis mengirimkan notifikasi *status mention* ke seluruh anggota grup!

### Kapan Menggunakan `sock` vs `msg`?
- **`msg.postGroupStory('Teks Pengumuman')`**: Otomatis me-mention seluruh member di grup pesan saat ini.
- **`sock.broadcastGroupStory(payload, ['120363xxx@g.us', '120363yyy@g.us'])`**: Memposting story dan me-mention anggota dari beberapa grup sekaligus secara terprogram.

```javascript
sock.onCommand('story', async (ctx) => {
    if (!ctx.isGroup) return ctx.reply('Gunakan perintah ini di dalam grup!')
    
    const pengumuman = ctx.query || 'Pengumuman resmi dari Admin Grup!'
    await ctx.postGroupStory(pengumuman)
    await ctx.reply('✅ Story status berhasil diposting dan seluruh member grup telah dimention!')
})
```

---

## 10. Helper Pesan Terserialisasi (`msg`) Lengkap

Setiap pesan yang masuk melalui `sock.onMessage(async (ctx, msg) => ...)` telah dibungkus dengan puluhan shortcut instan:

| Helper | Deskripsi | Kapan Digunakan |
| :--- | :--- | :--- |
| `msg.reply(content)` | Membalas pesan pengirim dengan auto-quote | Saat menjawab perintah / pertanyaan user |
| `msg.replyButton(data)` | Membalas dengan tombol flow interaktif | Saat menawarkan opsi tombol |
| `msg.replyListMenu(data)` | Membalas dengan menu pilihan single-select | Saat menampilkan menu bertingkat |
| `msg.react(emoji)` | Memberikan reaksi emoji pada pesan masuk | Konfirmasi cepat tanpa teks (misal: '⏳', '✅') |
| `msg.download()` | Mengunduh media dari pesan menjadi Buffer | Saat ingin mengolah foto/audio dari user |
| `msg.pin(durationSec)` | Menyematkan pesan di obrolan (default: 86400s) | Menyorot pengumuman penting |
| `msg.unpin()` | Melepas sematan pesan | Mengakhiri penyorotan pesan |
| `msg.sendPoll(judul, opsi)`| Mengirim poling langsung ke chat | Mengadakan voting cepat |
| `msg.sendContact(nama, no)`| Mengirim kartu kontak resmi vCard | Membagikan kontak admin/owner |
| `msg.tagAll(pesan)` | Tag seluruh anggota grup (terbuka) | Pengumuman massal grup |
| `msg.hidetag(pesan)` | Tag seluruh anggota grup (tersembunyi) | Pengumuman darurat tanpa daftar nomor panjang |
| `msg.isOwner(ownerList)` | Cek apakah pengirim ada di daftar nomor owner | Membatasi command khusus owner |
| `msg.kick(members)` | Mengeluarkan member dari grup saat ini | Moderasi grup |
| `msg.add(members)` | Menambahkan member ke grup saat ini | Moderasi grup |
| `msg.promote(members)` | Mengangkat member menjadi admin | Kepengurusan grup |
| `msg.demote(members)` | Menurunkan jabatan admin menjadi member biasa | Kepengurusan grup |
| `msg.setGroupName(nama)` | Mengubah nama / subjek grup saat ini | Pengaturan grup |
| `msg.setGroupDescription(d)`| Mengubah teks deskripsi grup saat ini | Pengaturan grup |
| `msg.getInviteUrl()` | Mendapatkan link tautan undangan grup saat ini | Membagikan tautan masuk grup |

---

## 11. Manajemen Profil, Grup & Kontrol Kehadiran

### A. Kontrol Kehadiran Dinamis (`behaviorUpdate` & `msg.behavior`)
Tampilkan status bot secara realistis:

```javascript
// Menggunakan sock (Tentukan JID target secara manual):
await sock.behaviorUpdate('online')                       // Tampil online
await sock.behaviorUpdate('typing', '120363xxx@g.us')     // Tampil mengetik di grup tertentu
await sock.behaviorUpdate('recording', '628xxx@s.whatsapp.net') // Tampil merekam suara
await sock.behaviorUpdate('stop', '120363xxx@g.us')       // Berhenti mengetik/merekam

// Menggunakan msg / ctx (Otomatis menggunakan chat obrolan saat ini):
await ctx.behavior('typing')
await ctx.behavior('recording')
```

### B. Utilitas Profil (`sock.profileUtils` & `msg.profileUtils`)
Mengubah profil bot atau memeriksa kontak:

```javascript
const profile = sock.profileUtils() // default: bot sendiri

// Update profil bot:
await profile.setName('MFSAVANA Assistant')
await profile.setAbout('Aktif 24/7 Melayani Anda')
await profile.setPicture(fs.readFileSync('./avatar.jpg'))

// Periksa info kontak orang lain:
const status = await profile.getStatus('628123456789@s.whatsapp.net')
const avatar = await profile.getPicture('image', '628123456789@s.whatsapp.net')
```

### C. Utilitas Grup (`sock.groupUtils` & `msg.groupUtils`)
Kelola seluruh aspek grup dengan perintah manusiawi:

```javascript
// Di dalam command handler, cukup panggil msg.groupUtils() atau ctx.group:
const group = ctx.group // atau sock.groupUtils('120363xxx@g.us')

await group.lock(true)     // Hanya admin yang boleh edit info grup
await group.announce(true) // Hanya admin yang boleh kirim chat di grup
await group.revokeInviteCode() // Tarik dan perbarui link undangan
```

---

## 12. Smart High-Level Event Listeners

`mfsavana-baileys` menyediakan event listener khusus yang siap pakai tanpa perlu mendengarkan raw stanza:

```javascript
// 1. Deteksi Reaksi Emoji
sock.onReaction((r) => {
    console.log(`${r.senderNumber} ${r.isRemoved ? 'menghapus reaksi' : `memberi reaksi ${r.emoji}`} di chat ${r.chat}`)
})

// 2. Deteksi Pesan Diedit
sock.onEdit((e) => {
    console.log(`[EDIT] ${e.senderNumber} mengedit pesan: "${e.previousMessage?.body}" -> "${e.newText}"`)
})

// 3. Sambutan Member Baru & Perubahan Admin
sock.onParticipantUpdate(async (p) => {
    if (p.action === 'add') {
        await p.reply(`Selamat datang @${p.participantNumbers.join(', @')} di grup!`)
    } else if (p.action === 'remove') {
        await p.reply(`Selamat tinggal @${p.participantNumbers.join(', @')}.`)
    } else if (p.action === 'promote') {
        await p.reply(`Selamat kepada @${p.participantNumbers.join(', @')} atas promosi menjadi Admin!`)
    }
})

// 4. Tolak Panggilan Otomatis (Anti-Call)
sock.onCall(async (call) => {
    if (call.status === 'offer') {
        await call.reject() // Langsung tolak panggilan
        await sock.sendMessage(call.from, {
            text: 'Mohon maaf, bot tidak menerima panggilan telepon atau video.'
        })
    }
})
```

---

## 13. Context Wrapper (`ctx`) & Declarative Command Dispatcher (`onCommand`)

Daripada menggunakan struktur `switch-case` atau `if-else` bertingkat yang panjang, gunakan metode **deklaratif** `sock.onCommand`:

```javascript
// 1. Pendaftaran Satu Perintah
sock.onCommand('ping', async (ctx) => {
    await ctx.reply('Pong!')
})

// 2. Pendaftaran Multi-Alias (Beberapa nama memicu fungsi yang sama)
sock.onCommand(['menu', 'help', 'bantuan'], async (ctx) => {
    await ctx.reply('Daftar menu bantuan...')
})

// 3. Pola Ekspresi Reguler (Regex)
sock.onCommand(/^cek(wa|nomor)$/i, async (ctx) => {
    await ctx.reply('Memeriksa nomor...')
})
```

### Properti Utama pada `ctx`:
- `ctx.command`: Nama perintah yang dipicu (contoh: `'menu'`).
- `ctx.prefix`: Awalan yang dipakai (contoh: `.` atau `/`).
- `ctx.args`: Array argumen (contoh: `['62812', 'admin']`).
- `ctx.query`: Seluruh string argumen setelah perintah.
- `ctx.senderNumber`: Nomor pengirim dalam format angka bersih (contoh: `'6285360554431'`).
- `ctx.isGroup`: Boolean apakah pesan berasal dari grup.

---

## 14. Arsitektur Anti Bad MAC & Keandalan Enkripsi Sesi

Salah satu masalah terbesar library Baileys klasik adalah pesan error `Bad MAC` atau `Session error` yang membuat bot crash berulang kali saat sesi enkripsi desinkronisasi.

### Solusi di `mfsavana-baileys`:
1. **Self-Healing Cipher State**: Saat error Bad MAC terdeteksi, library me-reset memori Signal session yang korup dan secara otomatis mengunggah PreKey baru (`uploadPreKeysToServerIfRequired`). Bot tidak akan crash dan folder sesi tidak perlu dihapus!
2. **Pencegahan Waiting for Message**: Pesan keluar disimpan sementara di memori lokal untuk memenuhi permintaan retry kunci secara transparan tanpa intervensi manual pengguna.

---

## 15. Fitur Pesan Sekali Lihat (View-Once Engine v1, v2, v3)

WhatsApp resmi menghapus kunci cipher media (*mediaKey*, *directPath*) saat pengguna me-reply pesan Sekali Lihat (*View-Once*). Akibatnya, pada Baileys biasa, fitur `.rvo` sering kali gagal (*media key not found*).

### Solusi di `mfsavana-baileys`:
Library secara otomatis menyimpan replika payload media asli ke dalam `messageStore` saat pesan pertama kali masuk. Saat kamu me-reply pesan tersebut dengan `.rvo`, media diambil dari cache lokal bot sehingga unduhan selalu berhasil 100%!

```javascript
sock.onCommand(['rvo', 'buka'], async (ctx) => {
    const isVo = ctx.isViewOnce || ctx.quoted?.isViewOnce
    if (!isVo) {
        return ctx.reply('Reply pesan Sekali Lihat (foto/video/vn) dengan perintah `.rvo`!')
    }

    const type = ctx.viewOnceType || ctx.quoted?.viewOnceType || 'image'

    try {
        // ctx.downloadViewOnce() otomatis mencari media di pesan langsung atau di cache lokal
        const buffer = await ctx.downloadViewOnce()

        if (type === 'image') {
            await ctx.reply({ image: buffer, caption: 'Pesan sekali lihat berhasil dibuka.' })
        } else if (type === 'video') {
            await ctx.reply({ video: buffer, caption: 'Pesan sekali lihat berhasil dibuka.' })
        } else if (type === 'audio') {
            await ctx.reply({ audio: buffer, mimetype: 'audio/mp4', ptt: true })
        }
    } catch (err) {
        await ctx.reply(`Gagal mengunduh: ${err.message}`)
    }
})
```

---

## 16. Pembuatan Poling Lengkap & Tracker Suara Realtime

### Kapan Menggunakan `sock` vs `msg`?
- **`msg.replyPoll(...)`**: Mengirim poling sebagai balasan terhadap pesan pengguna.
- **`sock.sendPoll(chatId, ...)`**: Mengirim poling secara proaktif ke chat/grup tertentu.
- **`sock.onPollUpdate(callback)`**: Mendengarkan setiap suara pemilih yang masuk di level socket.

```javascript
// 1. Buat Poling Single Choice:
await ctx.replyPoll({
    name: 'Metode Pembayaran Pilihan:',
    values: ['QRIS', 'Transfer Bank', 'E-Wallet'],
    multipleAnswers: false // Hanya boleh pilih 1 opsi
})

// 2. Pantau Pemilih yang Masuk Secara Realtime:
sock.onPollUpdate((vote) => {
    console.log(`Partisipan ${vote.voterNumber} memilih di polling: ${vote.pollKey?.id}`)
})
```

---

## 17. Sistem Proteksi Bot: Anti-Ban & Rate Limiter

Mencegah bot terblokir karena spamming:
1. **Outbound Queue (Anti-Ban)**: Pesan keluar tidak ditembakkan secara bersamaan, melainkan dimasukkan ke dalam antrian pintar dengan delay acak natural (`minDelayMs` hingga `maxDelayMs`) disertai simulasi status online/mengetik.
2. **Inbound Rate Limiter**: Membatasi pengguna yang sengaja melakukan spam command secara cepat.

```javascript
// Cek kuota pengirim pesan saat ini
sock.onCommand('ratelimit', async (ctx) => {
    const status = ctx.checkRateLimit()
    await ctx.reply(
        `*STATUS RATE LIMITER*\n\n` +
        `• Status: ${status.limited ? 'Dibatasi (Cooldown)' : 'Aman'}\n` +
        `• Terpakai: ${status.count} / ${status.max} perintah\n` +
        `• Reset Kuota: ${(status.remainingMs / 1000).toFixed(1)} detik`
    )
})
```

---

## 18. Fitur Album Messages (Pengiriman Multi-Media Bersatu)

Mengirim banyak foto dan video sekaligus yang dikelompokkan oleh WhatsApp menjadi **satu kotak album terpadu**, bukan pesan terpisah yang berceceran.

### Kapan Menggunakan `sock` vs `msg`?
- **`msg.replyAlbum([...medias], options)`**: Mengirim album seraya mengutip pesan pengirim.
- **`sock.sendAlbum(chatId, [...medias], options)`**: Mengirim album langsung ke chat tujuan.

```javascript
sock.onCommand('album', async (ctx) => {
    await ctx.replyAlbum([
        {
            image: { url: 'https://example.com/banner.jpg' },
            caption: 'Foto 1 dari Album'
        },
        {
            image: fs.readFileSync('./dokumentasi.png'),
            caption: 'Foto 2 dari Album'
        }
    ], {
        caption: 'Koleksi Dokumentasi Kegiatan',
        delayMs: 300 // Jeda pengiriman antar item agar urutan rapi
    })
})
```

---

## 19. Newsletter & WhatsApp Channel API (Lengkap)

Fitur lengkap untuk mengelola Saluran WhatsApp (*WhatsApp Channels*). 

> [!NOTE]
> Seluruh method channel dijalankan melalui objek **`sock`** (bukan `msg`), karena saluran WhatsApp adalah entitas global dan tidak terikat pada obrolan pesan masuk pribadi tertentu.

### Tabel Lengkap API Saluran WhatsApp:

| Method Socket | Parameter | Fungsi |
| :--- | :--- | :--- |
| `sock.newsletterId(urlOrCode)` | `link/kode invite` | **Mengekstrak ID Channel (`@newsletter`)**, nama, subscriber, foto profil, dan status verifikasi |
| `sock.newsletterFetchAllSubscribed()` | - | Mengambil daftar seluruh channel yang di-follow bot |
| `sock.newsletterCreate(nama, desc)` | `nama, deskripsi` | Membuat saluran WhatsApp baru |
| `sock.newsletterFollow(jid)` | `jid_channel` | Mengikuti saluran WhatsApp |
| `sock.newsletterUnfollow(jid)` | `jid_channel` | Berhenti mengikuti saluran |
| `sock.newsletterMute(jid)` | `jid_channel` | Membisukan notifikasi saluran |
| `sock.newsletterUnmute(jid)` | `jid_channel` | Mengaktifkan kembali notifikasi saluran |
| `sock.newsletterReactionMode(jid, mode)`| `jid, 'ALL'\|'BASIC'\|'NONE'` | Mengatur batasan reaksi emoji di saluran |

### Contoh Penggunaan Nyata:

```javascript
// 1. Ekstrak ID Channel dari Tautan Publik:
sock.onCommand('channel', async (ctx) => {
    const link = ctx.query?.trim()
    if (!link) return ctx.reply('Ketik: .channel https://whatsapp.com/channel/0029Va4KqKG4Crfhi18D7p2j')

    const info = await sock.newsletterId(link)
    if (!info) return ctx.reply('Saluran tidak ditemukan atau tautan salah.')

    await ctx.reply(
        `*INFORMASI SALURAN WHATSAPP*\n\n` +
        `• Nama Saluran: ${info.name}\n` +
        `• Channel ID: \`${info.id}\`\n` +
        `• Jumlah Pengikut: ${info.subscribers.toLocaleString('id-ID')}\n` +
        `• Status: ${info.verification === 'VERIFIED' ? 'Terverifikasi (Centang Hijau)' : 'Reguler'}\n` +
        `• Deskripsi: ${info.description || '-'}`
    )
})

// 2. Tampilkan Semua Saluran yang Diikuti Bot:
sock.onCommand('subscribedchannel', async (ctx) => {
    const list = await sock.newsletterFetchAllSubscribed()
    if (!list.length) return ctx.reply('Bot belum mengikuti saluran manapun.')

    let teks = `*DAFTAR SALURAN DIIKUTI (${list.length})*\n\n`
    list.forEach((item, index) => {
        const name = item.thread_metadata?.name?.text || item.name || 'Saluran'
        teks += `${index + 1}. *${name}*\n   ID: \`${item.id}\`\n`
    })
    await ctx.reply(teks)
})
```

---

## 20. Panduan Pemecahan Masalah (Troubleshooting & FAQ Pemula)

### Q1: Apa bedanya `DisconnectReason.loggedOut` dengan disconnect biasa?
- **Disconnect Biasa (Koneksi Terputus / Jaringan RTO)**: Sesi login masih sah. Cukup panggil kembali fungsi `startBot()` setelah jeda beberapa detik.
- **`DisconnectReason.loggedOut` (Keluar Sesi)**: WhatsApp di HP kamu telah menekan "Keluar / Logout" dari perangkat tertaut. Kamu harus menghapus folder `./session` dan melakukan pairing ulang.

### Q2: Mengapa nomor bot saya tidak membalas saat dimasukkan ke grup?
Jika kamu menjalankan bot menggunakan boilerplate [bot.js](file:///D:/MFSAVANA%20Baileys/bot.js), bot dilengkapi sistem keamanan whitelist grup ([verified-groups.json](file:///D:/MFSAVANA%20Baileys/verified-groups.json)). Bot sengaja diam agar tidak dianggap spam atau di-kick sembarangan. Untuk mengaktifkannya, ketik `.verifgrup` di grup tersebut dari nomor owner!

### Q3: Bagaimana format penulisan nomor WhatsApp yang benar?
Selalu gunakan format angka murni diawali kode negara tanpa spasi, tanda tambah, atau angka nol di depan:
- ✅ Benar: `6285360554431`
- ❌ Salah: `+62 853-6055-4431`
- ❌ Salah: `085360554431`

### Q4: Kenapa saya disarankan menggunakan `ctx` atau `msg` daripada `sock` di command handler?
Karena `ctx` dan `msg` sudah mengisolasi data pesan pengguna tersebut. Jika kamu menggunakan `sock.sendMessage`, kamu harus mengetikkan JID tujuan secara manual, mencari key pesan untuk quote, dan menyusun payload mentah. Dengan `ctx.reply()`, semuanya selesai dalam 1 baris yang aman dan bersih.

---

*Dokumentasi ini disusun khusus untuk ekosistem **mfsavana-baileys** v1.0.0. Selamat berkreasi membangun bot WhatsApp terbaik!*

---

## 13. Manajemen Kontak & Sinkronisasi Cloud (Cloud & VCF)

MFSAVANA Baileys menyediakan metode tingkat tinggi untuk menyimpan, mengubah (edit), dan menghapus kontak secara langsung pada WhatsApp Cloud Address Book (App State Sync), serta fitur ekstraksi kontak grup ke format vCard / berkas VCF.

### 13.1 Simpan & Edit Kontak Langsung
Simpan atau perbarui nama kontak agar tersinkronisasi di akun WhatsApp bot dan seluruh perangkat tertaut:
```typescript
// Simpan dengan nama string langsung
await sock.saveContact('6281234567890@s.whatsapp.net', 'Budi Santoso')

// Ubah (edit) nama kontak yang sudah ada
await sock.editContact('6281234567890@s.whatsapp.net', 'Budi Santoso (Pelanggan VIP)')

// Atau gunakan objek IContactAction detail
await sock.saveContact('6281234567890@s.whatsapp.net', {
    fullName: 'Budi Santoso',
    firstName: 'Budi',
    saveOnPrimaryAddressbook: true
})
```

### 13.2 Hapus Kontak
Hapus kontak dari buku alamat cloud WhatsApp:
```typescript
await sock.deleteContact('6281234567890@s.whatsapp.net')
```

### 13.3 Mengirim Kartu Kontak vCard
Kirim kartu kontak interaktif WhatsApp (tunggal atau banyak sekaligus):
```typescript
await sock.sendContact('6281234567890@s.whatsapp.net', {
    fullName: 'Customer Support',
    number: '628999999999',
    org: 'MFSAVANA Tech'
})
```

### 13.4 Ekstraksi Kontak Grup (VCF Ekspor)
Ekstrak seluruh nomor anggota grup (otomatis mengabaikan bot) menjadi berkas dokumen `.vcf` yang bisa langsung diimpor ke buku telepon HP pengguna:
```typescript
const { count, groupSubject, vcfBuffer, fileName, contactsList } = await sock.exportGroupContactsVCF(groupId, 'Member')

// Kirim dokumen .vcf untuk disimpan sekali klik di HP
await sock.sendMessage(groupId, {
    document: vcfBuffer,
    fileName,
    mimetype: 'text/vcard',
    caption: `Berhasil mengekstrak ${count} kontak dari grup ${groupSubject}`
})
```

### 13.5 Namespace Helper (`sock.contact`)
Semua method kontak di atas juga dapat diakses rapi melalui namespace `sock.contact`:
```typescript
await sock.contact.save(jid, 'Nama')
await sock.contact.edit(jid, 'Nama Baru')
await sock.contact.delete(jid)
await sock.contact.send(targetJid, contactInfo)
await sock.contact.exportGroupVCF(groupId, 'Member')
```
