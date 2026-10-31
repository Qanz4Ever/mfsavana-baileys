# Panduan Pengujian Fitur Bot WhatsApp MFSAVANA Baileys

Dokumen ini berisi panduan lengkap untuk menguji seluruh **53 fitur dan perintah** yang telah dibangun dari nol pada [bot.js](file:///D:/MFSAVANA%20Baileys/bot.js).

---

## 🚀 Langkah Persiapan Menjalankan Bot

1. **Jalankan Bot**:
   Buka terminal di root direktori project (`D:\MFSAVANA Baileys\`) lalu ketik:
   ```bash
   node bot.js
   ```
2. **Tautkan Akun WhatsApp**:
   - Jika nomor telepon belum diset di `.env`, bot akan menampilkan prompt nomor telepon atau pairing code.
   - Buka WhatsApp di ponsel > **Perangkat Tertaut** > **Tautkan dengan Kode**.
   - Masukkan kode yang tertera di terminal (default: `MFSAVANA`).
3. **Verifikasi Grup Uji (Penting!)**:
   - Untuk menguji fitur grup, pastikan nomor Anda adalah Owner (`6285360554431`).
   - Di dalam grup pengujian, ketik perintah berikut terlebih dahulu:
     ```text
     .verifgrup
     ```
   - Bot akan membalas bahwa grup berhasil diverifikasi ke whitelist `verified-groups.json`.

---

## 📋 Checklist & Panduan Uji 53 Perintah Bot

### 1. Kategori: Menu & Pesan Interaktif
| No | Perintah | Format Testing | Parameter & Fungsi | Yang Diharapkan |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `.menu` | `.menu` | Menampilkan seluruh 53 command per kategori beserta statistik bot. | Muncul teks menu lengkap + tombol interaktif (Ping, Health, Salin). |
| 2 | `.menu <cmd>` | `.menu copybutton` | Menampilkan detail teknis parameter & method Baileys command spesifik. | Muncul kartu panduan teknis khusus command tersebut. |
| 3 | `.listmenu` | `.listmenu` | Mengirim pesan single select list interaktif. | Muncul tombol "Pilih Menu", saat diklik membuka daftar sections & rows. |
| 4 | `.copybutton` | `.copybutton Salin Voucher \| PROMO-2026` | Mengirim tombol salin (`cta_copy`). Parameter: `teks \| kode`. | Tombol salin muncul di WA, saat diklik kode langsung tercopy ke clipboard. |
| 5 | `.button` | `.button` | Mengirim tombol Quick Reply. | Muncul tombol "⚡ Ping Latency", "📊 Cek Status", dll. |
| 6 | `.urlbutton` | `.urlbutton Buka Web \| https://google.com` | Mengirim tombol redirect tautan web (`cta_url`). | Tombol link muncul, saat diklik membuka peramban web ke URL tujuan. |
| 7 | `.callbutton` | `.callbutton Telepon CS \| +6285360554431` | Mengirim tombol panggilan telepon/WA (`cta_call`). | Tombol call muncul, saat diklik membuka dialer telepon ke nomor tujuan. |
| 8 | `.allbuttons` | `.allbuttons` | Mengirim kombinasi lengkap (Quick Reply + Copy + URL + Call). | Satu pesan berisi seluruh 4 varian tombol Native Flow WhatsApp. |

---

### 2. Kategori: Media, Album & View-Once (Sekali Lihat)
| No | Perintah | Format Testing | Parameter & Fungsi | Yang Diharapkan |
| :--- | :--- | :--- | :--- | :--- |
| 9 | `.rvo` | Reply pesan 1x lihat dengan `.rvo` | Mengambil dan mendownload media View-Once (v1, v2, v3). | Bot mengunduh media rahasia dan mengirimkannya kembali sebagai foto/video biasa. |
| 10 | `.sendvo` | Reply foto/video dengan `.sendvo Pesan Rahasia` | Mengirim media sebagai pesan View-Once (1x lihat). | Pesan terkirim dengan ikon lingkaran "1" (hanya bisa dibuka sekali oleh penerima). |
| 11 | `.album` | `.album` | Mengirim kumpulan multi-media dalam 1 album terpadu. | Beberapa gambar terkirim dan otomatis terkelompokkan menjadi album di chat. |
| 12 | `.sticker` | Reply foto/video dengan `.sticker` | Mengonversi foto/video pendek menjadi stiker WhatsApp. | Bot membalas dengan stiker WhatsApp transparan. |
| 13 | `.download` | Reply media apapun dengan `.download` | Mengunduh media dan mengirim kembali filenya. | File media diterima dalam bentuk file asli. |
| 14 | `.vn` | Reply audio/musik dengan `.vn` | Mengubah audio menjadi Voice Note (PTT gelombang suara). | Audio terkirim sebagai Voice Note bergaris gelombang suara. |

---

### 3. Kategori: Saluran / WhatsApp Newsletter
| No | Perintah | Format Testing | Parameter & Fungsi | Yang Diharapkan |
| :--- | :--- | :--- | :--- | :--- |
| 15 | `.cekchannel` | `.cekchannel https://whatsapp.com/channel/...` | Memeriksa ID Channel (JID), subscriber, dan metadata. | Tampil informasi nama saluran, JID `@newsletter`, dan tombol salin ID. |
| 16 | `.chmetadata` | `.chmetadata <jid_saluran>` | Mengambil metadata teknis mentah saluran via GraphQL/Mex. | Tampil JSON metadata lengkap saluran. |
| 17 | `.listsaluran` | `.listsaluran` | Melihat daftar saluran yang diikuti oleh bot. | Menampilkan daftar saluran yang tersubscribe. |
| 18 | `.buatchannel` | `.buatchannel Channel Test \| Saluran Uji Coba` | Membuat saluran WhatsApp baru (Owner Only). | Saluran baru terbuat dan bot memberikan JID saluran barunya. |
| 19 | `.chfollow` | `.chfollow <jid_saluran>` | Mengikuti (follow) saluran WhatsApp. | Bot berhasil mengikuti saluran tersebut. |
| 20 | `.chunfollow`| `.chunfollow <jid_saluran>` | Berhenti mengikuti saluran WhatsApp. | Bot berhasil keluar / unfollow saluran. |
| 21 | `.chmute` | `.chmute <jid_saluran>` | Membisukan notifikasi saluran. | Saluran berhasil dimute. |
| 22 | `.chunmute` | `.chunmute <jid_saluran>` | Mengaktifkan kembali suara notifikasi saluran. | Saluran berhasil diunmute. |

---

### 4. Kategori: Administrasi & Moderasi Grup
| No | Perintah | Format Testing | Parameter & Fungsi | Yang Diharapkan |
| :--- | :--- | :--- | :--- | :--- |
| 23 | `.cekadmin` | `.cekadmin` (di grup) | Cek status admin bot, admin pengirim, dan daftar admin. | Tampil daftar seluruh admin grup dan status otorisasi bot. |
| 24 | `.groupinfo` | `.groupinfo` (di grup) | Menampilkan profil, deskripsi, setelan pesan, dan kuota grup. | Muncul ringkasan data grup secara komprehensif. |
| 25 | `.tagall` | `.tagall Rapat Dimulai!` | Mention seluruh anggota grup secara terlihat. | Seluruh member di-tag (@) dalam isi teks pesan. |
| 26 | `.hidetag` | `.hidetag Pengumuman penting` | Mention seluruh anggota grup secara tersembunyi (*ghost tag*). | Seluruh member menerima notifikasi tag tanpa memenuhi chat dengan list @. |
| 27 | `.kick` | `.kick @user` atau reply pesan member | Mengeluarkan anggota dari grup (Bot & Pengirim harus Admin). | Anggota target dikeluarkan dari grup. |
| 28 | `.add` | `.add 6281234567890` | Menambahkan anggota ke dalam grup. | Nomor target berhasil dimasukkan ke grup. |
| 29 | `.promote` | `.promote @user` | Menaikkan anggota menjadi Admin Grup. | Anggota target berhasil diangkat menjadi Admin. |
| 30 | `.demote` | `.demote @user` | Menurunkan Admin menjadi anggota biasa. | Status admin anggota target berhasil dicabut. |
| 31 | `.linkgrup` | `.linkgrup` | Mengambil tautan link undangan grup saat ini. | Muncul URL `https://chat.whatsapp.com/...`. |
| 32 | `.revokelink`| `.revokelink` | Mereset / mencabut tautan undangan lama dan buat link baru. | Tautan lama hangus dan muncul tautan baru. |
| 33 | `.setnamagrup`| `.setnamagrup Nama Grup Baru` | Mengubah subjek / nama grup. | Nama grup di WhatsApp berganti secara seketika. |
| 34 | `.setdesc` | `.setdesc Deskripsi baru grup ini` | Mengubah deskripsi profil grup. | Deskripsi grup diperbarui. |
| 35 | `.opengroup` | `.opengroup` | Membuka grup (seluruh member bisa mengirim pesan). | Pengaturan grup berganti ke `not_announcement`. |
| 36 | `.closegroup`| `.closegroup` | Menutup grup (hanya admin yang bisa mengirim pesan). | Pengaturan grup berganti ke `announcement`. |

---

### 5. Kategori: Utilitas, Chat & Smart Features
| No | Perintah | Format Testing | Parameter & Fungsi | Yang Diharapkan |
| :--- | :--- | :--- | :--- | :--- |
| 37 | `.poll` | `.poll Pilih Mana? \| Opsi A \| Opsi B` | Membuat polling interaktif WhatsApp. | Pesan voting polling muncul di chat grup/pribadi. |
| 38 | `.vcard` | `.vcard Budi Santoso \| 628123456789` | Mengirim kartu kontak vCard. | Kontak WhatsApp terkirim dan bisa langsung disimpan. |
| 39 | `.inspect` | `.inspect 6285360554431` | Cek status nomor terdaftar di WA & tipe bisnis/personal. | Tampil status validasi pendaftaran nomor di server WA. |
| 40 | `.pin` | Reply pesan dengan `.pin 7` | Menyematkan pesan selama 7 hari. | Pesan tersemat di bagian atas obrolan chat. |
| 41 | `.unpin` | Reply pesan tersemat dengan `.unpin` | Melepas sematan pesan. | Pesan tidak lagi tersemat. |
| 42 | `.del` | Reply pesan dengan `.del` | Menghapus pesan (Delete for Everyone). | Pesan terhapus untuk semua peserta chat. |
| 43 | `.edit` | Reply pesan milik bot dengan `.edit Teks baru` | Mengedit teks pesan bot yang telah terkirim. | Teks pesan bot langsung berubah menjadi teks baru. |
| 44 | `.react` | Reply pesan dengan `.react 🔥` | Memberikan reaksi emoji pada pesan. | Emoji muncul menempel pada balon pesan target. |
| 45 | `.status` | `.status online` atau `.status offline` | Mengubah kehadiran bot (`available`/`unavailable`). | Kehadiran bot berubah. |
| 46 | `.story` | `.story Semangat Pagi!` (atau reply media) | Mengirim status/cerita ke WhatsApp bot (Owner Only). | Teks/media muncul di tab Status WhatsApp akun bot. |
| 47 | `.autotyping`| `.autotyping on` / `.autotyping off` | Simulasi mengetik otomatis saat bot memproses pesan. | Indikator "sedang mengetik..." muncul sebelum bot membalas. |

---

### 6. Kategori: Monitoring, Health & Owner Whitelist
| No | Perintah | Format Testing | Parameter & Fungsi | Yang Diharapkan |
| :--- | :--- | :--- | :--- | :--- |
| 48 | `.ping` | `.ping` | Cek latensi soket WebSocket ke server WhatsApp. | Menampilkan respon Pong dengan nilai milidetik latency. |
| 49 | `.health` | `.health` | Laporan realtime skor kesehatan, memori RAM, dan uptime. | Menampilkan metrik memori RSS, heap, uptime, dan skor sesi. |
| 50 | `.owner` | `.owner` | Menampilkan info kontak resmi owner bot. | Menampilkan nomor `+6285360554431`. |
| 51 | `.verifgrup` | `.verifgrup` (di grup) | Menambahkan grup ke whitelist `verified-groups.json`. | Grup terverifikasi; bot aktif merespon member grup. |
| 52 | `.unverifgrup`| `.unverifgrup` (di grup) | Menghapus grup dari whitelist. | Grup dicabut dari whitelist. |
| 53 | `.listgrup` | `.listgrup` | Melihat seluruh daftar grup yang terdaftar di whitelist. | Menampilkan list JID grup terverifikasi. |

---

### 7. Uji Fitur Event Otomatis (Realtime Smart Listeners)
Fitur ini berjalan otomatis di latar belakang tanpa perlu mengetik command:
1. **Anti-Delete**: Hapus salah satu pesan teks di grup terverifikasi (Pilih *Hapus untuk Semua Orang*).
   - *Hasil*: Bot otomatis mengirim kembali teks pesan asli yang dihapus beserta nama pengirimnya.
2. **Anti-Edit**: Edit salah satu pesan yang telah Anda kirimkan.
   - *Hasil*: Bot menampilkan teks sebelum diedit vs teks setelah diedit.
3. **Welcome / Leave**: Masukkan atau keluarkan nomor akun uji coba dari grup.
   - *Hasil*: Bot otomatis mengirimkan ucapan selamat datang / selamat jalan.
4. **Anti-Call**: Lakukan panggilan suara/video WhatsApp ke nomor bot.
   - *Hasil*: Bot otomatis menolak panggilan dan mengirim pesan peringatan bahwa panggilan tidak diterima.
