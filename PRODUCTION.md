# Panduan Operasional MFSAVANA Baileys (Versi Production)

Dokumen ini berisi instruksi standar operasional untuk menjalankan bot WhatsApp dalam mode produksi stabil, aman, dan tanpa hambatan.

---

## 1. Arsitektur Lingkungan (Dev vs Prod)

| Komponen | Development (`mfsavana-baileys`) | Production (`mfsavana-baileys-production`) |
| :--- | :--- | :--- |
| **Tujuan** | Eksperimen fitur, unit testing, debug log | Eksekusi stabil, uptime 24/7 |
| **Sesi WhatsApp** | `./session` (Akun Uji/Tester) | `./session` (Akun Resmi Produksi) |
| **Log Level** | Verbose / Debug | Silent / Fatal / Error |
| **Process Manager** | Manual `node bot.js` | PM2 (`ecosystem.config.cjs`) |
| **Auto Restart** | Manual restart | Otomatis via supervisor & PM2 |
| **Memory Limit** | Tanpa batasan | Max restart pada 600MB memory |

> **PERINGATAN KRUSIAL**: Jangan pernah membagikan atau menyalin isi folder `session/` antara versi Development dan Production secara bersamaan. Dua instance yang terhubung ke sesi yang sama akan memicu WhatsApp menolak stream (*Error 440: Stream Replaced* / *Error 515*).

---

## 2. Cara Menjalankan Bot di Production

### A. Menggunakan PM2 (Rekomendasi untuk Server/VPS)
1. **Memulai Bot**:
   ```bash
   npm run pm2:start
   ```
2. **Melihat Log Realtime**:
   ```bash
   npm run pm2:logs
   ```
3. **Memeriksa Status & Konsumsi Memory**:
   ```bash
   pm2 status
   ```
4. **Merestart Bot**:
   ```bash
   npm run pm2:restart
   ```
5. **Menghentikan Bot**:
   ```bash
   npm run pm2:stop
   ```

### B. Menjalankan Langsung (Foreground / Docker)
```bash
npm start
# atau
node bot.js
```

---

## 3. Konfigurasi Lingkungan (`.env`)

Konfigurasi file `.env` di folder produksi:
```env
NODE_ENV=production
BOT_PHONE_NUMBER=628xxxxxxxxx
PAIRING_CODE=MFSAVANA
SESSION_FOLDER=./session
LOG_LEVEL=silent
OWNER_NUMBER=6285360554431
```

- Jika `BOT_PHONE_NUMBER` diisi, bot akan otomatis mencetak **Kode Pairing 8 Digit** ke log terminal saat pertama kali dijalankan.
- Buka **WhatsApp di HP > Perangkat Tertaut > Tautkan dengan Nomor Telepon > Masukkan Kode**.

---

## 4. Fitur Keamanan Bawaan
1. **Anti-Ban Jitter Queue**: Seluruh pengiriman pesan keluar dialirkan melalui antrean ber-jitter (400–1000 ms) dengan simulasi presence mengetik manusiawi.
2. **Token Bucket Rate Limiter**: Membatasi konsumsi perintah per pengguna (maksimal 10 command per 10 detik, cooldown otomatis 15 detik).
3. **Reconnection Supervisor**: Auto reconnect dengan algoritma eksponensial (2s hingga 60s). Tidak akan melakukan spam reconnect jika akun ter-logout permanen (401).
4. **Group Whitelist**: Perintah bot hanya merespons di grup terverifikasi (`verified-groups.json`) dan chat pribadi owner.
