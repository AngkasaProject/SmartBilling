# SmartBilling

Platform billing MikroTik berbasis Docker untuk pengelolaan pelanggan PPPoE, invoice, dan router RouterOS. Portal publik menampilkan paket dan menyediakan pemeriksaan status serta pembayaran invoice melalui Midtrans Snap jika dikonfigurasi. WhatsApp terhubung ke layanan eksternal Fonnte atau OpenWA melalui REST API.

---

## 📑 Daftar Isi
1. [Fitur Utama](#-fitur-utama)
2. [Arsitektur Sistem & Direktori](#-arsitektur-sistem--direktori)
3. [Prasyarat Sistem](#-prasyarat-sistem)
4. [Panduan Instalasi Docker (Langkah Cepat)](#-panduan-instalasi-docker-langkah-cepat)
5. [Konfigurasi WhatsApp Gateway (Fonnte/OpenWA)](#-konfigurasi-whatsapp-gateway-fonnteopenwa)
6. [Panduan Integrasi Login Page Hotspot MikroTik](#-panduan-integrasi-login-page-hotspot-mikrotik)
7. [Operasi Isolir PPPoE MikroTik](#-operasi-isolir-pppoe-mikrotik)
8. [Pembayaran Invoice dengan Midtrans Snap](#-pembayaran-invoice-dengan-midtrans-snap)
9. [Troubleshooting & FAQ](#-troubleshooting--faq)

---

## 🚀 Fitur Utama

- **👥 Manajemen Pelanggan PPPoE**:
  - Paket PPPoE dapat dibuat dari menu Pelanggan dengan menghubungkan harga billing ke PPP profile live di router. Saat mendaftarkan pelanggan, operator memilih paket; profile, kecepatan, dan harga terisi dari paket.
  - Pendaftaran user secret, assign static / dynamic IP pool, profile kecepatan (*rate-limit*), dan penetapan tanggal jatuh tempo.
  - Pencatatan pembayaran manual memperpanjang masa aktif; aktivasi router hanya dilakukan setelah RouterOS mengonfirmasi perubahan.
  
- **⚡ Operasi PPPoE RouterOS**:
  - Membaca status router, resource, interface, profil PPP, serta menambah/mengubah/menghapus secret PPPoE melalui RouterOS API atau REST.
  - Isolir dan aktivasi PPPoE dilakukan dengan mengubah status secret RouterOS secara langsung.

- **💬 Integrasi WhatsApp melalui layanan eksternal**:
  - Pilih Fonnte atau OpenWA; SmartBilling hanya mengakses REST API tanpa membundel server WhatsApp.
  - Pengiriman pesan uji dan pelanggan mencatat respons nyata dari provider terpilih.
  - Pengingat PPPoE H-1 dapat diaktifkan di Pengaturan. Pesan pengingat dan isolir manual memuat tautan bertanda tangan ke detail pelanggan/tagihan; pastikan `APP_URL` HTTPS dan provider WhatsApp aktif. Kegagalan pengiriman dicatat dan dicoba ulang secara terbatas.

- **🛒 Portal publik paket dan pelanggan**:
  - Halaman awal menampilkan profil hotspot dari data operator serta pemeriksaan status langganan dengan ID pelanggan dan nomor WhatsApp.
  - Invoice dapat dibayar melalui Midtrans Snap jika dikonfigurasi atau melalui instruksi pembayaran manual. Metode manual menghasilkan kode bayar dan tautan WhatsApp operator untuk konfirmasi; admin memverifikasi pembayaran sebelum menyetujui.
  - Saat pelanggan tidak aktif atau memasuki tanggal jatuh tempo, portal membuat invoice bulanan bila belum ada dan menampilkan flow pembayaran. Pelanggan yang masih aktif tidak diberi tombol bayar.
  - Tautan invoice bertanda tangan memungkinkan pelanggan membuka tagihan tertentu tanpa menampilkan ID pelanggan di tautan.

- **🎫 Penjualan voucher hotspot**:
  - Buat profil layanan di menu Voucher: pilih router dan profil RouterOS tersinkron, lalu tetapkan kecepatan, masa penggunaan (1 jam, 12 jam, 1 hari, 1 minggu, 2 minggu, atau 1 bulan), perangkat bersama, dan batas kuota. Profil RouterOS baru dapat dibuat dari form yang sama.
  - Buat paket jual dengan memilih profil layanan dan menetapkan harga. Paket dan generator voucher tersedia sebagai dialog agar halaman administrasi tetap ringkas.
  - Pelanggan membayar melalui Midtrans Snap atau metode manual yang diatur operator. Pembayaran manual menghasilkan kode bayar dan tautan WhatsApp operator; pesanan berakhir setelah 60 menit secara default (dapat diubah). Admin mengonfirmasi transaksi sebelum voucher diprovisikan.
  - Voucher dibuat pada MikroTik hanya setelah pembayaran otomatis terverifikasi atau operator mengonfirmasi transaksi manual. Status pesanan dan kode voucher ditampilkan di portal pelanggan.

- **📱 Template Hotspot Captive Portal MikroTik Siap Pakai**:
  - File `login.html`, `status.html`, dan `logout.html` dengan desain responsif mobile-friendly.
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

---

## 🏗 Arsitektur Sistem & Direktori

```text
├── docker-compose.yml       # Definisi container aplikasi billing
├── Dockerfile               # Multi-stage production build Node 20 Alpine
├── setup.sh                 # Skrip instalasi otomatis 1-klik untuk VPS Linux
├── .env.example             # Template konfigurasi environment variables
├── server.ts                # Backend Express, healthcheck & API aplikasi
├── data/                    # Database SQLite persisten (tidak masuk Git)
├── hotspot/                 # File template captive portal siap upload ke MikroTik
│   ├── login.html           # Halaman login hotspot
│   ├── status.html          # Halaman status internet dan info sisa kuota/waktu
│   ├── logout.html          # Halaman konfirmasi pemutusan koneksi
│   └── rsc/
│       ├── walled-garden.rsc # Template akses portal hotspot
│       └── firewall-isolir.rsc # Catatan operasi isolir via API
└── src/                     # Frontend React 19 + Tailwind CSS v4 + Dashboard Admin
```

Backend menyediakan `GET /api/data` untuk memuat snapshot data dan `PUT /api/data` untuk menyimpannya ke SQLite. Jika backend tidak tersedia, perubahan tidak dianggap tersimpan ke server.

### Login admin dan halaman pelanggan

- Buka aplikasi pertama kali tanpa `ADMIN_USERNAME`/`ADMIN_PASSWORD` untuk mendaftarkan admin pertama. Buat password minimal 12 karakter; pendaftaran awal otomatis ditutup setelah admin dibuat.
- Jika kedua variabel admin diisi di `.env`, login memakai kredensial tersebut dan perubahan kredensial harus dilakukan lewat environment server. Jangan hanya mengisi salah satunya.
- Halaman awal `/` adalah portal paket pelanggan. Dashboard admin berada di `/admin` dan memerlukan login. Cek tagihan tersedia di `/portal/billing`; profil voucher ada di `/portal/vouchers`. Login captive hotspot tetap disediakan sebagai file di folder `hotspot/` untuk dipasang ke MikroTik.
- `APP_ENCRYPTION_KEY` bersifat opsional. Tanpa nilai tersebut, aplikasi membuat kunci acak di `data/router-secrets.key`; file itu harus ikut dicadangkan bersama database. Kunci yang dibuat dapat dilihat/disalin melalui Pengaturan → Admin & Keamanan. Simpan di tempat aman. Jika kunci dikelola environment, rotasi melalui panel terkunci.

### Menjalankan mode development

Gunakan `npm run dev` untuk menjalankan Vite (port `3000`) dan backend Express/SQLite (port `3001`) bersamaan. Permintaan `/api/*` dari Vite otomatis diteruskan ke backend. Jangan jalankan Vite saja (`npm run dev:client`) bila ingin perubahan tersimpan ke SQLite; mode itu hanya menyediakan frontend. Untuk menjalankan API secara terpisah gunakan `npm run dev:server`.

**Manajer paket dan lockfile:** instalasi Docker serta script deployment memakai **npm** dan `package-lock.json` sebagai lockfile acuan (`npm ci`). `bun.lock` dipertahankan untuk developer yang memilih Bun; keduanya harus diperbarui dari `package.json` yang sama. Setelah mengubah dependency, jalankan `npm install` lalu `bun install --lockfile-only`; validasi workflow Bun dengan `bun install --frozen-lockfile`. Docker mengabaikan `bun.lock` dan tetap memakai `package-lock.json`. Pilih satu package manager untuk satu direktori kerja `node_modules`; jangan bergantian menjalankan `npm install` dan `bun install` pada direktori yang sama. Jika berpindah, hentikan proses dev terlebih dahulu, hapus `node_modules`, lalu instal ulang dengan package manager yang dipilih.

---

## 📋 Prasyarat Sistem

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

### Metode 1: Instalasi Otomatis Menggunakan `setup.sh` (Paling Direkomendasikan)

1. Masuk ke terminal VPS Anda melalui SSH:
   ```bash
   ssh root@IP_VPS_ANDA
   ```

2. Jalankan skrip setup otomatis:
   ```bash
   bash setup.sh
   ```
   *Skrip ini akan memeriksa Docker, membuat file `.env`, mengatur izin direktori, dan menjalankan kontainer di background.*

---

### Metode 2: Instalasi Manual dengan Docker Compose

1. **Salin file konfigurasi environment**:
   ```bash
   cp .env.example .env
   nano .env
   ```
   Sesuaikan parameter berikut:
   ```env
   # Koneksi API MikroTik RouterOS
   MIKROTIK_HOST="IP_ROUTEROS_ANDA"
   MIKROTIK_PORT=8728
   MIKROTIK_USER="USER_API_ROUTEROS"
   MIKROTIK_PASS="PASSWORD_API_ROUTEROS"
   MIKROTIK_API_TYPE="api"
   MIKROTIK_TIMEOUT_SEC=10

   # Opsional: jika dikosongkan, admin pertama dibuat dari halaman login.
   ADMIN_USERNAME=""
   ADMIN_PASSWORD=""

   # Opsional: kunci acak 32 byte dalam base64. Jika kosong, aplikasi membuatnya otomatis.
   APP_ENCRYPTION_KEY=""

   # Opsional: pilih Fonnte atau OpenWA (service eksternal terpisah)
   WA_PROVIDER=""
   OPENWA_BASE_URL=""
   OPENWA_API_KEY=""
   OPENWA_SESSION_ID="billing-isp"
   FONNTE_API_URL="https://api.fonnte.com/send"
   FONNTE_TOKEN=""

   # Pembayaran Midtrans Snap
   APP_URL="https://billing.domain-anda"
   PAYMENT_GATEWAY="midtrans"
   MIDTRANS_SERVER_KEY=""
   MIDTRANS_CLIENT_KEY=""
   MIDTRANS_IS_PRODUCTION=false
   ```

2. **Jalankan Docker Compose**:
   ```bash
   docker compose up -d --build
   ```

3. **Periksa status kontainer yang sedang berjalan**:
   ```bash
   docker compose ps
   ```
   Periksa status layanan yang sudah dikonfigurasi:
   ```text
   NAME                   IMAGE                     STATUS         PORTS
   mikrotik-billing-app   mikrotik-billing:latest   Up (healthy)   0.0.0.0:1707->3000/tcp
   ```

4. **Buka Aplikasi di Browser**:
   - Portal paket pelanggan: `http://IP_VPS:1707`
   - Dashboard admin: `http://IP_VPS:1707/admin`

Docker menggunakan port host `1707` sebagai default, sementara port internal container tetap `3000`. Port yang tidak umum tetap dapat dipakai aplikasi lain; bila `1707` sudah terpakai, atur `BILLING_PORT=PORT_PILIHAN` di `.env`, lalu jalankan ulang `docker compose up -d`.

### Integrasi RouterOS

1. Pada `.env` server, isi `MIKROTIK_HOST`, `MIKROTIK_PORT`, `MIKROTIK_USER`, `MIKROTIK_PASS`, `MIKROTIK_API_TYPE`, dan `MIKROTIK_TIMEOUT_SEC`. Kredensial admin panel dikelola melalui `ADMIN_USERNAME`/`ADMIN_PASSWORD` atau registrasi pertama.
2. Buat user RouterOS khusus aplikasi dan batasi aksesnya dengan firewall ke alamat server billing. Hak baca diperlukan untuk uji koneksi; operasi PPP secret dan setup PPPoE memerlukan hak tulis RouterOS.
3. Pastikan API (`8728`), API-SSL (`8729`), atau REST RouterOS v7 (`443`) hanya dapat diakses dari host yang dipercaya. Jangan membuka layanan API RouterOS ke seluruh internet.
4. Restart container setelah mengubah `.env`. Jika konfigurasi RouterOS berasal dari environment, tampilannya akan terkunci di panel; gunakan tab **Router MikroTik** untuk menambahkan server tambahan.
5. Router dari `.env` akan dimuat otomatis. Gunakan **Tambah MikroTik** untuk menambahkan router lain; password router tambahan disimpan terenkripsi. Buat cadangan `data/router-secrets.key` bersama database bila `APP_ENCRYPTION_KEY` tidak diset.
6. Pilih interface aktual dan konfigurasi pool/profile/server PPPoE dari halaman yang sama. Operasi setup bersifat aditif dan menolak nama yang sudah ada dengan konfigurasi konflik. Tinjau konfigurasi RouterOS sebelum menerapkan perubahan.

---

## 📱 Konfigurasi WhatsApp Gateway (Fonnte/OpenWA)

SmartBilling tidak menjalankan atau membundel server WhatsApp. Instalasi/akun provider dikelola terpisah; aplikasi hanya mengirim request REST API dari server.

- **Fonnte:** set `FONNTE_TOKEN` (dan opsional `FONNTE_API_URL`) memakai token dari akun Fonnte.
- **OpenWA:** jalankan instalasi OpenWA secara terpisah, lalu set `OPENWA_BASE_URL`, `OPENWA_API_KEY`, dan `OPENWA_SESSION_ID`.
- Pilih provider di menu **WhatsApp API** dashboard. `WA_PROVIDER` opsional; jika diisi di `.env`, pilihan panel dikunci.
- Token/API key hanya disimpan di environment server. Tes pesan tersedia melalui provider aktif; cek status sesi hanya berlaku untuk OpenWA.

---

## 📶 Panduan Integrasi Login Page Hotspot MikroTik

Template login captive page disediakan di folder `/hotspot`. Halaman captive disajikan lokal oleh MikroTik, sedangkan katalog paket dan checkout voucher aktual menggunakan portal SmartBilling `/portal/vouchers`. Tombol **Lihat Paket & Beli Voucher** pada template membuka portal publik tersebut; MikroTik tidak membaca database billing secara langsung.

### 1. Upload Template ke Router MikroTik
1. Buka Winbox dan hubungkan ke MikroTik Anda.
2. Buka menu **Files**.
3. Drag & drop folder `hotspot` dari komputer Anda ke dalam Winbox, atau letakkan file `login.html`, `status.html`, dan `logout.html` ke direktori `hotspot/`.
4. Sebelum mengunggah, edit `hotspot/login.html` dan ganti `https://BILLING_DOMAIN/portal/vouchers` dengan alamat publik billing Anda, misalnya `https://billing.contoh.id/portal/vouchers`. Untuk pengujian tanpa domain, gunakan `http://IP_PUBLIK:1707/portal/vouchers`.

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

Isolir manual di menu pelanggan mengubah properti `disabled` pada PPP secret yang dipilih setelah RouterOS mengonfirmasi perubahan. Aktivasi manual dari daftar pelanggan menggunakan operasi yang sama. Scheduler isolir otomatis dan redirect ke halaman tagihan belum diimplementasikan; jangan mengandalkan aplikasi ini untuk memutus pelanggan otomatis karena jatuh tempo.

## 💳 Pembayaran invoice dengan Midtrans Snap

Konfigurasikan `APP_URL`, `PAYMENT_GATEWAY=midtrans`, `MIDTRANS_SERVER_KEY`, dan mode `MIDTRANS_IS_PRODUCTION` di environment server. Set URL notifikasi Midtrans menjadi `https://domain-anda/api/payment/webhook`. `MIDTRANS_CLIENT_KEY` dapat disimpan untuk referensi dashboard; kredensial rahasia tidak dikirim ke browser.

Pelanggan membuka portal publik, memasukkan ID pelanggan dan nomor WhatsApp terdaftar, lalu memilih **Bayar Tagihan** pada invoice yang belum lunas. Aplikasi membuat checkout Snap; invoice hanya ditandai lunas setelah signature webhook Midtrans diverifikasi dan nominal cocok. Gunakan HTTPS untuk produksi dan uji dahulu dengan kredensial sandbox. Provider selain Midtrans belum didukung checkout.

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
