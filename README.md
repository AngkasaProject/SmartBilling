# SmartBilling

Platform billing MikroTik berbasis Docker untuk pengelolaan pelanggan PPPoE, invoice, dan router RouterOS. Portal publik menampilkan paket dan menyediakan pembayaran manual serta maksimal satu gateway otomatis addon (Midtrans, DOKU, Xendit, Tripay, atau Qrisly). WhatsApp terhubung ke layanan eksternal Fonnte atau OpenWA melalui REST API.

---

## 📑 Daftar Isi
1. [Fitur Utama](#-fitur-utama)
2. [Arsitektur Sistem & Direktori](#-arsitektur-sistem--direktori)
3. [Prasyarat Sistem](#-prasyarat-sistem)
4. [Panduan Instalasi Docker (Langkah Cepat)](#-panduan-instalasi-docker-langkah-cepat)
5. [Konfigurasi WhatsApp Gateway (Fonnte/OpenWA)](#-konfigurasi-whatsapp-gateway-fonnteopenwa)
6. [Panduan Integrasi Login Page Hotspot MikroTik](#-panduan-integrasi-login-page-hotspot-mikrotik)
7. [Operasi Isolir PPPoE MikroTik](#-operasi-isolir-pppoe-mikrotik)
8. [Pembayaran Invoice](#-pembayaran-invoice)
9. [Troubleshooting & FAQ](#-troubleshooting--faq)

---

## 🚀 Fitur Utama

- **👥 Manajemen Pelanggan PPPoE**:
  - Menu Paket PPPoE menampilkan PPP profile langsung dari router terpilih, serta mendukung tambah, edit, dan hapus profile MikroTik. Paket billing ditautkan ke profile live; perubahan nama/kecepatan menyinkronkan paket dan data pelanggan, sedangkan profile yang masih dipakai secret atau pelanggan tidak dapat dihapus.
  - Workspace Data Router menampilkan seluruh PPPoE secret dan sesi aktif pada router terpilih, termasuk akun yang belum terdaftar di billing. Akun dapat dibuat, diedit, diaktifkan/nonaktifkan, dihapus, atau ditautkan secara opsional ke pelanggan billing tanpa membuat secret baru. Form penautan membuat ID pelanggan unik serta menyediakan data pelanggan, paket, siklus tagihan, dan tanggal jatuh tempo.
  - Daftar billing membedakan akun yang terhubung dari secret yang tidak ditemukan di router; akun router yang belum tertaut dapat dibuka lewat dialog penautan tanpa mengubah password atau membuat secret duplikat.
  - Status secret aktif/nonaktif dibedakan dari status billing. Jika keduanya berbeda, daftar menampilkan peringatan dan menyediakan aksi untuk menyamakan status RouterOS setelah konfirmasi.
  - Sesi aktif menampilkan IP, caller ID, uptime, dan trafik live; operator dapat memutus sesi tanpa menghapus akun atau mengubah billing, serta mengaktifkan/nonaktifkan secret langsung pada router dengan dialog konfirmasi.
  - Isolir billing dan pemblokiran secret RouterOS merupakan tindakan terpisah. Operator dapat memilih secara eksplisit apakah perubahan status billing juga mengubah akses PPPoE.
  - Saat mendaftarkan pelanggan, operator memilih paket; profile, kecepatan, dan harga terisi dari paket.
  - Pendaftaran user secret, assign static / dynamic IP pool, profile kecepatan (*rate-limit*), dan penetapan tanggal jatuh tempo.
  - Pencatatan pembayaran manual memperpanjang masa aktif; aktivasi router hanya dilakukan setelah RouterOS mengonfirmasi perubahan.
  
- **⚡ Operasi PPPoE RouterOS**:
  - Membaca status router, resource, interface, profil PPP, serta menambah/mengubah/menghapus secret PPPoE melalui RouterOS API atau REST.
  - Isolir dan aktivasi PPPoE dilakukan dengan mengubah status secret RouterOS secara langsung.
  - Dashboard menampilkan log server MikroTik dan menyediakan tab pemilih saat lebih dari satu router dikonfigurasi. Koneksi API digunakan ulang per router, ditutup setelah satu jam tanpa aktivitas, serta dibersihkan saat server berhenti.

- **💳 Keuangan (Tagihan & Pendapatan)**:
  - Menu Keuangan menyatukan pengelolaan invoice, persetujuan pembayaran, generate tagihan, pembayaran manual, dan riwayat pendapatan dalam tab terpisah. Billing run massal dibuat dan disimpan server-side memakai periode Jakarta serta mencegah duplikasi periode.
  - Invoice yang belum dibayar otomatis dibatalkan 7 hari setelah jatuh tempo dan dipindahkan ke riwayat; operator juga dapat membatalkan invoice aktif secara manual. Invoice periode baru tetap dapat dibuat pada siklus bulan berikutnya. PPPoE secret tidak dinonaktifkan otomatis ketika invoice dibatalkan. Pembayaran yang masuk setelah pembatalan memerlukan rekonsiliasi manual dan tidak mengaktifkan layanan otomatis. Jika notifikasi otomatis aktif, WhatsApp mengirim pengingat H-1 dan pemberitahuan saat invoice dibatalkan. Menu Tagihan memisahkan invoice aktif dari riwayat invoice lunas, jatuh tempo, dan dibatalkan. Riwayat dapat difilter berdasarkan status atau bulan jatuh tempo (termasuk bulan lalu), dihapus satu per satu, atau dibersihkan sekaligus setelah konfirmasi; pembayaran yang masih diproses mencegah penghapusan. Menghapus invoice lunas mengeluarkannya dari laporan pendapatan, sedangkan catatan transaksi pembayaran tetap disimpan.
  - Riwayat invoice lunas dan voucher terbayar dapat dicari, difilter, dan diekspor ke CSV yang kompatibel dengan Excel.
  - Statistik dapat direset terpisah dari riwayat; reset laporan tidak menghapus data transaksi operasional.

- **💬 Integrasi WhatsApp melalui layanan eksternal**:
  - Pilih Fonnte atau OpenWA; SmartBilling hanya mengakses REST API tanpa membundel server WhatsApp.
  - Pengiriman pesan uji dan pelanggan mencatat respons nyata dari provider terpilih.
  - Pengingat PPPoE H-1 dapat diaktifkan di Pengaturan. Pesan pengingat dan isolir manual memuat tautan bertanda tangan ke detail pelanggan/tagihan di Portal pada `/portal/billing`; atur `APP_URL` ke origin publik Portal (HTTPS) dan pastikan provider WhatsApp aktif. Kegagalan pengiriman dicatat dan dicoba ulang secara terbatas.

- **🛒 Portal publik paket dan pelanggan**:
  - Halaman utama `/` pada Portal adalah halaman publik pelanggan. Cek cepat tagihan memakai ID pelanggan atau nomor WhatsApp terdaftar tanpa login hanya menampilkan tagihan yang belum lunas tanpa nama/riwayat transaksi; riwayat lengkap tersedia setelah login OTP di dashboard.
  - Instalasi SmartBilling mandiri menyediakan dashboard pelanggan lokal di `/portal/dashboard`. Pelanggan masuk dengan OTP WhatsApp ke nomor terdaftar untuk melihat status layanan, paket, tagihan, riwayat pembayaran, dan kontak bantuan; buat secret sesi Portal satu kali di **Pengaturan > Admin & keamanan** sebelum mengaktifkan login. Portal eksternal tetap tidak berubah.
  - Logo utama dan icon brand dapat diunggah terpisah melalui **Pengaturan > Profil bisnis** (PNG, JPG, atau WebP, maksimal 1 MB per gambar). Logo utama menggantikan nama brand pada Portal dan navbar admin; icon digunakan sebagai favicon.
  - Portal menyediakan satu pencarian tagihan/status: ID pelanggan atau nomor WhatsApp untuk pelanggan PPPoE, serta ID pesanan atau kode bayar untuk pesanan voucher. Katalog paket hotspot dan PPPoE bulanan tersedia; pembelian hotspot dapat dilakukan daring dan pendaftaran PPPoE diarahkan ke Customer Service.
  - Upgrade PPPoE mandiri dijadwalkan untuk periode tagihan berikutnya dan baru diterapkan setelah invoice dibayar. Pembatalan mempertahankan akses sampai akhir masa layanan yang sudah dibayar.
  - Pembayaran manual yang dikonfigurasi operator selalu tersedia. Sebagai addon, aktifkan maksimal satu gateway otomatis: Midtrans Snap, DOKU Checkout, Xendit, Tripay, atau Qrisly.
  - Kredensial gateway otomatis diatur melalui menu Pembayaran dan disimpan terenkripsi di server. Pembayaran manual memakai instruksi yang disiapkan operator, kode pesanan, serta persetujuan manual.
  - Return sukses/gagal pembayaran kembali ke Portal pelanggan pada origin `APP_URL`. Xendit menerima URL return sukses dan gagal terpisah (`/portal?...payment=success` atau `payment=failed`); Midtrans, DOKU, dan Tripay memakai URL return umum (`payment=return`). Qrisly menampilkan QR dinamis di Portal. Redirect hanya membawa pelanggan kembali, bukan bukti lunas.
  - Notifikasi gateway selalu dikirim ke endpoint SmartBilling `PAYMENT_WEBHOOK_URL` (`/api/payment/webhook`), terpisah dari URL return pelanggan. Pembayaran manual berubah menjadi lunas setelah operator menyetujui; Portal memperbarui status invoice berkala.
  - Tautan invoice bertanda tangan mengarah ke `/portal/billing` pada origin publik `APP_URL`. Tautan hanya membuka tagihan yang ditentukan dan dapat kedaluwarsa.
  - Portal dapat berjalan pada origin terpisah. Data pelanggan, paket, pembayaran, dan konfigurasi bisnis tetap dikelola oleh SmartBilling API.

- **🎫 Penjualan voucher hotspot**:
  - Workspace Hotspot memakai satu pilihan router untuk ringkasan, daftar user, sesi aktif, persediaan voucher, user profile, Hotspot Server/Server Profile, dan paket. User dapat diedit atau diaktifkan/nonaktifkan langsung pada RouterOS; sesi diperbarui otomatis setiap 15 detik dan dapat diputus tanpa menghapus akun.
  - Hotspot Server dapat dibuat, diaktifkan/nonaktifkan, dan dihapus; Server Profile live dapat ditambah, diedit, atau dihapus. Pilihan HTML directory berasal dari folder router yang terdeteksi, dan file dalam folder dapat dilihat serta dihapus dengan konfirmasi. Profile yang masih digunakan server tidak dapat dihapus atau diganti namanya.
  - User/profile/server dibaca langsung dari RouterOS, sedangkan harga, kuota billing, dan persetujuan pembayaran tetap merupakan data aplikasi.
  - User Profile pada menu Voucher dibaca langsung dari router terpilih dan dapat ditambah, diedit, serta dihapus. Pengaturan billing profil disimpan bersama sinkronisasi RouterOS; menghapus profil juga menghapus konfigurasi layanan dan paket jual yang terkait.
  - Buat paket jual dengan memilih User Profile live dari MikroTik, lalu tetapkan masa berlaku, batas kuota, dan harga. Paket dan generator voucher tersedia sebagai dialog agar halaman administrasi tetap ringkas.
  - Untuk voucher baru, masa kalender mulai dihitung saat pemakaian pertama terdeteksi dan user RouterOS dinonaktifkan setelah durasinya habis. Batas `limit-uptime` tidak lagi dipakai sebagai masa berlaku; pemantauan berjalan di server billing setiap menit, sehingga server harus tetap aktif agar penonaktifan tepat waktu. Voucher lama tidak diubah.
  - Daftar voucher, status online, batas, dan pemakaian dibaca langsung dari `/ip hotspot user` dan sesi aktif router. Hapus voucher menghapus user RouterOS dan data operasional billing terkait; tindakan hapus memakai dialog konfirmasi aplikasi.
  - Pelanggan memilih pembayaran manual atau gateway otomatis yang aktif. Pesanan manual menghasilkan kode dan tautan WhatsApp operator; voucher diprovisikan setelah admin mengonfirmasi pembayaran.
  - Voucher dibuat pada MikroTik hanya setelah pembayaran otomatis terverifikasi atau operator mengonfirmasi transaksi manual. Status pesanan dan kode voucher ditampilkan di portal pelanggan.

- **📱 Template Hotspot Captive Portal MikroTik Siap Pakai**:
  - File `login.html`, `alogin.html`, `status.html`, dan `logout.html` dengan desain responsif mobile-friendly; identitas dan tautan Portal dikonfigurasi lewat JSON, logo opsional, serta login mendukung scan QR voucher offline.
  - Form login voucher untuk autentikasi yang diproses oleh RouterOS.

- **🎫 Generator & Cetak Voucher Massal**:
  - Format cetak Grid A4 (kartu gunting dengan QR login) dan Thermal Receipt mini POS (58mm / 80mm).
  - QR pada voucher di-encode sebagai QR standar yang berisi kode voucher, bukan pola gambar dekoratif. Generator stok membuat akun langsung di RouterOS dan menyimpan hasilnya di SQLite.
  - Ekspor CLI script `/ip hotspot user add ...` untuk impor cepat ke terminal Winbox.

- **🛜 Pengelolaan layanan MikroTik**:
  - Menu Router MikroTik menampilkan server PPPoE dan Hotspot serta profil PPP, Hotspot User, dan Hotspot Server yang dibaca langsung dari router.
  - Profil PPP dan Hotspot dapat ditambahkan, demikian pula Hotspot Server dan Server Profile. Pembuatan server Hotspot memerlukan interface dan Server Profile yang sudah tersedia.
  - Metode pembayaran manual memiliki field layanan/bank dan nomor rekening/akun. Form awal menyiapkan contoh BRI dan nomor rekening, yang harus diverifikasi atau diganti operator sebelum metode diaktifkan.

- **📊 Status NOC**:
  - Menampilkan telemetri router yang berhasil dimuat dari RouterOS.
  - Grafik trafik interface belum tersedia; dashboard tidak lagi menampilkan data simulasi.

- **💾 Persistensi Data Aplikasi**:
  - Pengaturan dan data pelanggan, invoice, profil hotspot, voucher, router, log WhatsApp, konfigurasi gateway, serta transaksi disimpan di SQLite server.
  - Data aplikasi disimpan secara persisten di SQLite server. Identitas perusahaan dan kredensial tidak diisi dengan nilai contoh.
  - Frontend hanya menyimpan cache kerja di memori; data bisnis dan preferensi tidak ditulis ke `localStorage`. Dashboard memuat data dari server, lalu membersihkan data browser lama setelah sinkronisasi berhasil. Riwayat pesanan voucher pada portal hanya tersedia selama halaman masih terbuka.

---

## 🏗 Arsitektur Sistem & Direktori

```text
├── docker-compose.yml       # Definisi container aplikasi billing
├── Dockerfile               # Multi-stage production build Node.js 22 Alpine + npm
├── setup.sh                 # Skrip instalasi otomatis 1-klik untuk VPS Linux
├── .env.example             # Template konfigurasi environment variables
├── server.ts                # Backend Express, healthcheck & API aplikasi
├── data/                    # Database SQLite persisten (tidak masuk Git)
├── hotspot/                 # File template captive portal siap upload ke MikroTik
│   ├── login.html           # Halaman login hotspot dengan pemindai QR offline
│   ├── alogin.html          # Konfirmasi login berhasil dan redirect ke tujuan
│   ├── status.html          # Halaman status internet dan pemakaian sesi
│   ├── logout.html          # Ringkasan sesi setelah logout
│   ├── config.json          # Pengaturan brand, nama WiFi, portal, dan logo
│   ├── hotspot-config.js    # Loader konfigurasi untuk semua halaman hotspot
│   ├── jsQR.js              # Decoder QR lokal untuk login hotspot
│   ├── jsQR-LICENSE.txt     # Lisensi decoder QR
│   ├── logo.png             # Logo opsional (tambahkan sendiri; icon default jadi fallback)
│   └── rsc/
│       ├── walled-garden.rsc # Template akses portal hotspot
│       └── firewall-isolir.rsc # Catatan operasi isolir via API
└── src/                     # Frontend React 19 + Tailwind CSS v4 + Dashboard Admin
```

Backend menyediakan `GET /api/data` untuk memuat snapshot dari SQLite dan `PUT /api/data` untuk menyimpannya ke SQLite. Browser tidak menjadi sumber cadangan; jika backend tidak tersedia, perubahan tidak dianggap tersimpan dan harus dicoba lagi setelah koneksi pulih. Data browser lama dibersihkan setelah dashboard berhasil memuat data dari server.

### Login admin dan portal pelanggan

- Buka `/admin` pertama kali tanpa `ADMIN_USERNAME`/`ADMIN_PASSWORD` untuk mendaftarkan admin pertama. Buat password minimal 12 karakter; pendaftaran awal otomatis ditutup setelah admin dibuat.
- Jika kedua variabel admin diisi di `.env`, login memakai kredensial tersebut dan perubahan kredensial harus dilakukan lewat environment server. Jangan hanya mengisi salah satunya.
- Halaman utama `/` adalah Portal publik pelanggan dengan tombol Cek tagihan, Beli voucher, dan Login Admin (`/admin`). Pelanggan dapat mengecek tagihan menggunakan ID pelanggan atau nomor WhatsApp terdaftar tanpa login; status pembayaran diambil dari Billing dan diperbarui berkala.
- Tautan invoice bertanda tangan untuk pelanggan/admin tetap tersedia di `/portal/billing`. Token tautan baru memakai format ringkas, dan token lama tetap diterima sampai kedaluwarsa.
- Template captive hotspot tersedia di folder `hotspot/` untuk dipasang ke MikroTik. Sesuaikan `hotspot/config.json`; tidak perlu mengedit file HTML untuk mengatur identitas WiFi dan tautan Portal.
- `APP_ENCRYPTION_KEY` bersifat opsional. Tanpa nilai tersebut, aplikasi membuat kunci acak di `data/router-secrets.key`; file itu harus ikut dicadangkan bersama database. Kunci yang dibuat dapat dilihat/disalin melalui Pengaturan → Admin & Keamanan. Simpan di tempat aman. Jika kunci dikelola environment, rotasi melalui panel terkunci.
- Database dapat diunduh dan dipulihkan dari **Pengaturan → Database & backup**. Restore menerima backup SQLite SmartBilling yang valid, membuat salinan database aktif sebelum menggantinya, dan memuat ulang aplikasi. Jika database backup memakai kredensial terenkripsi, kunci enkripsi yang cocok (`APP_ENCRYPTION_KEY` atau `data/router-secrets.key`) tetap diperlukan.
- **Reset All** di bagian yang sama menghapus data operasional dan konfigurasi router, WhatsApp, serta pembayaran yang tersimpan di database, tetapi mempertahankan identitas bisnis, akun admin, dan kunci enkripsi. Dialog meminta teks `RESET ALL`; database aktif dicadangkan otomatis, sesi admin dicabut, dan konfigurasi dari environment server tidak diubah. Reset tidak mengubah konfigurasi atau akun pada router MikroTik fisik.

### Menjalankan mode development

Gunakan `npm run dev` untuk menjalankan Vite (port `3000`) dan backend Express/SQLite (port `3001`) bersamaan. Permintaan `/api/*` dari Vite otomatis diteruskan ke backend. Jangan jalankan Vite saja (`npm run dev:client`) bila ingin perubahan tersimpan ke SQLite; mode itu hanya menyediakan frontend. Untuk menjalankan API secara terpisah gunakan `npm run dev:server`.

**Runtime dan package manager:** proyek ini memakai **Node.js >=22.12.0** dan **npm** saja. `package-lock.json` adalah lockfile acuan; instal dependensi lokal dengan `npm ci` dan perbarui lockfile setelah perubahan manifest dengan `npm install`. Docker membangun dan menjalankan aplikasi pada Node.js 22 Alpine menggunakan `npm ci`, sehingga versi dependensi konsisten dan binary opsional dipilih untuk platform Linux target. Container berjalan sebagai user non-root; data SQLite dan file unggahan persisten di named volume Docker. Node.js 20 tidak didukung.

---

## 📋 Prasyarat Sistem

**Runtime aplikasi:** Docker Engine dengan plugin Docker Compose v2 pada Ubuntu 20.04 / 22.04 / 24.04 LTS atau Debian 11 / 12. Node.js tidak perlu dipasang pada host untuk deployment Docker. Untuk development lokal diperlukan Node.js `>=22.12.0` dan npm.

1. **VPS Cloud / Server Lokal**:
   - OS: Ubuntu 20.04 / 22.04 / 24.04 LTS atau Debian 11 / 12.
   - Minimal Spek: 1 vCPU, 1 GB RAM, 10 GB Storage.
   - Port yang perlu dibuka:
     - `1707` (Web Billing & Portal Voucher default Docker; dapat diubah lewat `BILLING_PORT`)
     - `80` & `443` (Nginx Reverse Proxy jika menggunakan domain)
2. **Router MikroTik**:
   - RouterOS v6.48+ atau RouterOS v7.x.
   - Layanan API MikroTik aktif di port `8728` (atau API-SSL di port `8729`).

---

## 🐳 Panduan Instalasi Docker (Langkah Cepat)

### Metode 1: Instalasi otomatis menggunakan `setup.sh`

1. Masuk ke server Linux melalui SSH, lalu clone repository:
   ```bash
   ssh root@IP_VPS_ANDA
   git clone https://github.com/AngkasaProject/SmartBilling.git /opt/SmartBilling
   cd /opt/SmartBilling
   ```

2. Jalankan installer:
   ```bash
   sudo bash setup.sh
   ```
   Installer memeriksa Docker Engine dan Compose v2, memasang Docker jika belum tersedia pada distro yang didukung, membuat `.env` dari template bila belum ada, membangun image, dan menunggu health check aplikasi. Tinjau skrip sebelum menjalankannya sebagai root. Jika `.env` baru dibuat, edit dan isi konfigurasi MikroTik atau integrasi yang diperlukan, lalu jalankan `docker compose up -d`.

---

### Metode 2: Instalasi Manual dengan Docker Compose

Clone repository dan masuk ke direktori aplikasi terlebih dahulu:

```bash
git clone https://github.com/AngkasaProject/SmartBilling.git /opt/SmartBilling
cd /opt/SmartBilling
```

1. **Siapkan environment dan konfigurasi awal**:
   ```bash
   cp .env.example .env
   chmod 600 .env
   ${EDITOR:-nano} .env
   ```
   Atur sekurangnya `BILLING_PORT` jika port default `1707` sudah digunakan. Untuk koneksi router, isi `MIKROTIK_HOST`, `MIKROTIK_USER`, dan `MIKROTIK_PASS`. Kredensial admin dapat disediakan melalui `ADMIN_USERNAME` dan `ADMIN_PASSWORD`; biarkan keduanya kosong untuk mendaftarkan admin pertama melalui halaman login. Seluruh variabel yang didukung tercantum di `.env.example`.

   Untuk produksi, buat HTTPS reverse proxy dan set `APP_URL` ke origin Portal publik serta `PAYMENT_WEBHOOK_URL` ke endpoint webhook publik SmartBilling. Keduanya juga dapat dikonfigurasi melalui dashboard. Jangan masukkan kredensial ke Git atau membagikan file `.env`.

2. **Validasi konfigurasi dan jalankan aplikasi**:
   ```bash
   docker compose config --quiet
   docker compose up -d --build
   ```

3. **Tunggu hingga aplikasi sehat**:
   ```bash
   docker compose ps
   docker compose logs --tail=100 mikrotik-billing
   ```
   Status akan berubah menjadi `healthy` setelah backend dan database siap. Endpoint health check internal adalah `/api/health`.

4. **Buka Aplikasi di Browser**:
   - Portal paket pelanggan: `http://IP_VPS:1707`
   - Dashboard admin: `http://IP_VPS:1707/admin`

Container memakai port internal `1707`; port host dapat diubah lewat `BILLING_PORT` (contoh `1807` menerbitkan `1807:1707`). Izinkan port host tersebut pada firewall hanya sesuai kebutuhan. Untuk akses publik, gunakan reverse proxy HTTPS dan hindari mengirim kredensial melalui HTTP biasa.

**Pembaruan dan data persisten:**

```bash
git pull
docker compose up -d --build
docker compose ps
```

Database, kunci enkripsi otomatis, gambar QRIS, dan bukti pembayaran tersimpan di named volume `billing_data` yang dipasang pada `/app/data` di dalam container. `docker compose down` tidak menghapus volume; jangan gunakan `docker compose down -v` kecuali memang ingin menghapus seluruh data persisten. Buat backup database dari dashboard. Jika `APP_ENCRYPTION_KEY` tidak ditetapkan, salin `router-secrets.key` dari volume ke lokasi backup aman di luar repository dan simpan bersama backup database:

```bash
docker compose cp mikrotik-billing:/app/data/router-secrets.key /path/backup-aman/router-secrets.key
chmod 600 /path/backup-aman/router-secrets.key
```

### Integrasi RouterOS

1. Pada `.env` server, isi `MIKROTIK_HOST`, `MIKROTIK_PORT`, `MIKROTIK_USER`, `MIKROTIK_PASS`, `MIKROTIK_API_TYPE`, dan `MIKROTIK_TIMEOUT_SEC`. Kredensial admin panel dikelola melalui `ADMIN_USERNAME`/`ADMIN_PASSWORD` atau registrasi pertama.
2. Buat user RouterOS khusus aplikasi dan batasi aksesnya dengan firewall ke alamat server billing. Hak baca diperlukan untuk uji koneksi; operasi PPP secret dan setup PPPoE memerlukan hak tulis RouterOS.
3. Pastikan API (`8728`), API-SSL (`8729`), atau REST RouterOS v7 (`443`) hanya dapat diakses dari host yang dipercaya. Jangan membuka layanan API RouterOS ke seluruh internet.
4. Restart container setelah mengubah `.env`. Jika konfigurasi RouterOS berasal dari environment, tampilannya akan terkunci di panel; gunakan tab **Router MikroTik** untuk menambahkan server tambahan.
5. Router dari `.env` akan dimuat otomatis. Gunakan **Tambah MikroTik** untuk menambahkan router lain; password router tambahan disimpan terenkripsi. Buat cadangan `data/router-secrets.key` bersama database bila `APP_ENCRYPTION_KEY` tidak diset.
6. Koneksi router tambahan dapat diedit atau dihapus dari kartu router. Edit menguji koneksi sebelum menyimpan; password lama tetap digunakan bila kolom password baru dikosongkan. Hapus hanya menghapus koneksi dan kredensial dari aplikasi, tidak mengubah konfigurasi perangkat, dan tidak menghapus data billing yang sudah terkait.
7. Pilih interface aktual dan konfigurasi pool/profile/server PPPoE dari halaman yang sama. Operasi setup bersifat aditif dan menolak nama yang sudah ada dengan konfigurasi konflik. Tinjau konfigurasi RouterOS sebelum menerapkan perubahan.

---

## 📱 Konfigurasi WhatsApp Gateway (Fonnte/OpenWA)

SmartBilling tidak menjalankan atau membundel server WhatsApp. Instalasi/akun provider dikelola terpisah; aplikasi hanya mengirim request REST API dari server. Provider dan kredensial dapat diatur di menu **WhatsApp API** dashboard.

- **Fonnte:** masukkan token dan, bila perlu, URL API di dashboard. URL bawaan adalah `https://api.fonnte.com/send`.
- **OpenWA:** jalankan instalasi OpenWA secara terpisah, lalu masukkan Base URL, Session ID, dan API key di dashboard.
- Nilai environment yang diisi (`FONNTE_TOKEN`, `FONNTE_API_URL`, `OPENWA_BASE_URL`, `OPENWA_API_KEY`, `OPENWA_SESSION_ID`) mengesampingkan nilai dashboard. `WA_PROVIDER` opsional; jika diisi, provider dikunci ke nilai tersebut. Kosongkan variabel override yang ingin dikelola lewat dashboard.
- Token/API key disimpan terenkripsi di database server menggunakan kunci enkripsi aplikasi, tidak dikirim kembali ke browser, dan kolom rahasia yang dibiarkan kosong tidak menghapus kredensial tersimpan. Simpan backup database dan kunci enkripsi di tempat aman; jangan masukkan kredensial ke Git. Tes pesan tersedia melalui provider aktif; cek status sesi hanya berlaku untuk OpenWA.
- `WA_BULK_DELAY_MS` mengatur jeda minimum antar pesan pengingat tagihan otomatis dan pemberitahuan pembatalan invoice (default `3000`, rentang `0`-`60000` ms). Atur di environment server lalu restart/redeploy; ini pengaturan SmartBilling, terpisah dari dashboard Fonnte.

---

## 📶 Panduan Integrasi Login Page Hotspot MikroTik

Template login captive page disediakan di folder `/hotspot`. Halaman captive disajikan lokal oleh MikroTik, sedangkan katalog paket dan checkout voucher menggunakan Portal publik pada `/?tab=voucher`. Tombol **Lihat Paket & Beli Voucher** membuka Portal pada domain Billing; MikroTik tidak membaca database billing secara langsung.

### 1. Upload Template ke Router MikroTik
1. Buka Winbox dan hubungkan ke MikroTik Anda.
2. Buka menu **Files**.
3. Sebelum upload, buka `hotspot/config.json` di komputer dengan editor teks. Atur `brandName` untuk nama usaha, `wifiName` untuk nama WiFi yang ditampilkan, dan `portalUrl` untuk tautan pembelian lengkap sampai `?tab=voucher` (contoh: `https://billing.contoh.id/?tab=voucher`). Pengaturan yang sama dipakai di halaman login, sukses, status, dan logout.
4. Logo bersifat opsional: simpan gambar bernama `logo.png` di folder `hotspot`, sesuai nilai default `logoPath`. Anda juga dapat mengatur `logoPath` ke file lokal lain di folder tersebut, seperti `images/logo.webp`, atau isi string kosong untuk selalu memakai icon bawaan. Jika file tidak ada atau gagal dimuat, template otomatis kembali ke icon bawaan.
5. Pertahankan `md5.js` bawaan pada folder HotSpot MikroTik yang sudah ada; file ini diperlukan jika profil memakai HTTP-CHAP. Unggah file template `login.html`, `alogin.html`, `status.html`, `logout.html`, `config.json`, `hotspot-config.js`, `jsQR.js`, dan `jsQR-LICENSE.txt` ke direktori HTML yang sama tanpa menghapus `md5.js`. Jangan unggah folder sebagai subfolder tambahan jika HTML Directory sudah menunjuk langsung ke folder tersebut.
6. Pemindai QR berjalan offline tanpa CDN. QR pada kartu voucher berisi kode voucher dan hasil scan akan mengisi form login.
7. Kamera live browser memerlukan halaman HTTPS. Captive portal MikroTik umumnya dibuka melalui HTTP sebelum login, sehingga gunakan tombol **Scan QR** untuk mengambil foto/pilih gambar voucher; pemindaian dilakukan lokal di perangkat dan gambar tidak dikirim ke server.
8. `alogin.html` adalah halaman bawaan HotSpot untuk login yang berhasil. Halaman ini menampilkan konfirmasi lalu mengarahkan pengguna ke URL tujuan; pengguna juga dapat membuka status koneksi dari tombol **Lihat status koneksi**.

### 2. Atur Server Profile Hotspot
1. Di Winbox, buka **IP** > **Hotspot** > tab **Server Profiles**.
2. Klik ganda pada profile hotspot aktif Anda (misalnya `hsprof1`).
3. Pada opsi **HTML Directory**, pilih folder: `hotspot`.
4. Pada tab **Login**, aktifkan metode autentikasi yang sesuai dengan akun hotspot dan kebijakan jaringan Anda. Konfigurasi trial dilakukan terpisah pada profile RouterOS.
5. Klik **Apply** & **OK**.

### 3. Konfigurasi Walled Garden (PENTING!)
Agar pengguna yang belum login WiFi dapat membuka katalog dan membeli voucher, izinkan hostname portal billing melalui Walled Garden. Masukkan host saja (tanpa `https://`, path, atau port). Untuk produksi captive portal, gunakan domain HTTPS dengan sertifikat valid dan pastikan reverse proxy/firewall menerima koneksi pelanggan.

Cukup ganti `DOMAIN_PORTAL_ANDA` dengan hostname portal Anda, lalu jalankan script ini di **New Terminal** Winbox:
```routeros
/ip hotspot walled-garden
add dst-host=DOMAIN_PORTAL_ANDA action=allow comment="Portal Billing"
```
Ganti `DOMAIN_PORTAL_ANDA` dengan hostname yang sama dengan URL pada tombol beli. Bila memakai alamat IP dan port publik, firewall jaringan juga harus mengizinkan koneksi tersebut. Untuk pelanggan captive, direkomendasikan memasang reverse proxy HTTPS pada port `443`.

### 4. Alur pembelian voucher dari login MikroTik
1. Pelanggan terhubung ke SSID dan melihat halaman login lokal MikroTik.
2. Pelanggan yang sudah memiliki voucher login seperti biasa. Pelanggan baru menekan **Lihat Paket & Beli Voucher**.
3. Portal SmartBilling menampilkan paket hotspot aktif dari SQLite dan pelanggan mengisi nama serta nomor WhatsApp.
4. Pelanggan memilih pembayaran otomatis (jika gateway tersedia) atau manual. Pembayaran manual memberikan kode pesanan dan tautan WhatsApp operator; voucher baru aktif setelah operator menyetujui pembayaran. Pembayaran otomatis menunggu konfirmasi provider.
5. Sesudah pembayaran dikonfirmasi, akun voucher dibuat di RouterOS dan kodenya ditampilkan/dikirim ke pelanggan. Pelanggan kembali ke halaman login MikroTik, memasukkan kode voucher, lalu mulai menggunakan internet.

Uji portal dari perangkat yang belum login. Untuk pembayaran otomatis, hostname checkout/payment Midtrans yang diwajibkan provider juga harus diizinkan menurut dokumentasi Midtrans; aturan Walled Garden domain billing saja tidak otomatis membuka domain pembayaran pihak ketiga. Perhatikan bahwa kebijakan akses provider dapat berubah. Untuk WhatsApp, pelanggan diarahkan ke aplikasi WhatsApp operator setelah pesanan manual dibuat.

---

## 🔒 Operasi Isolir PPPoE MikroTik

Status isolir billing tidak otomatis mengubah akses MikroTik. Saat mengubah status pelanggan, operator dapat mengonfirmasi secara terpisah apakah secret PPPoE juga harus dinonaktifkan atau diaktifkan. Perbedaan status billing dan secret ditandai pada daftar pelanggan, dengan aksi untuk menyelaraskan secret setelah konfirmasi. Pengiriman notifikasi isolir otomatis hanya dilakukan setelah RouterOS berhasil mengonfirmasi secret dinonaktifkan. Pembatalan langganan yang dijadwalkan tetap menonaktifkan secret saat masa layanan berakhir; isolir otomatis semata-mata karena tagihan jatuh tempo tidak diimplementasikan.

## 💳 Pembayaran Invoice

Menu **Pembayaran** mengatur metode manual dan addon gateway otomatis secara terpisah:

- **Pembayaran manual** selalu berdiri sendiri. Konfigurasikan rekening bank, e-wallet, QRIS statis (unggah gambar PNG/JPG), atau metode lain. QRIS ditampilkan di Portal saat pelanggan memilih metode dan setelah membuat pesanan; pembayaran tetap menunggu verifikasi operator, bukan terdeteksi otomatis. Pelanggan dapat mengganti metode pembayaran yang masih menunggu untuk invoice maupun voucher; kode bayar lama dibatalkan sebelum pesanan baru dibuat. Jangan ganti metode setelah pembayaran dilakukan. Gambar QRIS disimpan di `data/payment-methods`; sertakan folder tersebut dalam cadangan data aplikasi. Layanan dan voucher baru aktif setelah pembayaran disetujui.
- Kode unik nominal invoice dapat diaktifkan atau dinonaktifkan dari bagian Pembayaran Manual. Default-nya nonaktif; pengaturan berlaku untuk invoice baru dan tidak mengubah tagihan yang sudah dibuat.
- **Gateway otomatis (addon)**: aktifkan maksimal satu provider, atau nonaktifkan semua gateway otomatis.
  - **Midtrans** — Server Key wajib, Client Key opsional; pilih sandbox atau production.
  - **DOKU** — Client ID dan Secret Key; pilih sandbox atau production.
  - **Custom** — adapter Xendit (API Key dan Callback Token), Tripay (Merchant Code, API Key, Private Key, dan kode metode pembayaran), atau Qrisly (API Key dan QRIS ID hasil upload).
  - **Qrisly** — gunakan Sandbox terlebih dahulu; unggah QRIS merchant di dashboard Qrisly lalu masukkan QRIS ID dan API Key. Nominal minimum Rp 1.000 dan ada biaya per pembuatan QR. SmartBilling menampilkan nominal final dari Qrisly sebagai jumlah yang harus dibayar, lalu memeriksa status dan nominal tersebut langsung ke API Qrisly sebelum mengaktifkan layanan. Qrisly tidak memerlukan APP_URL atau PAYMENT_WEBHOOK_URL untuk checkout QR dinamis. Lihat [dokumentasi Qrisly](https://rajaongkir.com/docs/qrisly/getting-started/getting-started).

Kredensial online disimpan terenkripsi menggunakan kunci aplikasi yang sama dengan kredensial router. Cadangkan `data/router-secrets.key` bersama database bila `APP_ENCRYPTION_KEY` tidak ditetapkan melalui environment. Gateway otomatis selain Qrisly memerlukan APP_URL HTTPS untuk return pelanggan serta PAYMENT_WEBHOOK_URL HTTPS yang dapat diakses publik di SmartBilling. Keduanya dapat diatur lewat UI **Pembayaran** atau `.env`; nilai `.env` mengunci dan mengutamakan field terkait di UI.

Setelah konfigurasi gateway disimpan, daftarkan Notification/Webhook URL yang tampil di menu **Pembayaran** pada dashboard provider. Pastikan `PAYMENT_WEBHOOK_URL` menuju host SmartBilling API, sedangkan `APP_URL` menuju Portal pelanggan. Jika memakai Docker Compose, pastikan kedua variabel tersebut ada di `.env` dan diteruskan oleh `docker-compose.yml`. Invoice dan voucher otomatis hanya diproses setelah status provider terverifikasi dan nominal cocok; Qrisly diverifikasi dengan endpoint status API, bukan berdasarkan payload webhook saja. Uji dengan sandbox/test mode terlebih dahulu sebelum beralih ke production. Pengaturan gateway melalui panel menjadi konfigurasi aktif; variabel Midtrans di `.env` hanya dipakai sebagai fallback untuk instalasi lama yang belum menyimpan pilihan gateway.

---

## 🛠 Troubleshooting & FAQ

**Q: Bagaimana cara melihat log kontainer jika ada kendala?**
```bash
# Log seluruh layanan
docker compose logs -f

# Log khusus aplikasi billing
docker compose logs -f mikrotik-billing
```

**Q: Bagaimana cara restart kontainer setelah mengubah file `.env`?**
```bash
docker compose down && docker compose up -d
```

**Q: Apakah aplikasi ini aman dibuka langsung tanpa domain?**
Untuk tahap pengujian dapat menggunakan IP VPS port `1707`. Untuk produksi publik dan penggunaan captive portal, disarankan domain dengan sertifikat SSL valid melalui reverse proxy.

---

Dibuat dengan ❤️ untuk komunitas jaringan & ISP Indonesia.
Lisensi: MIT.
Integrasi WhatsApp dilakukan melalui REST API Fonnte atau instalasi OpenWA eksternal yang dipilih administrator.
