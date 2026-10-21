# 🌐 NetFlow MikroTik ISP Billing & Hotspot Management Platform

Platform Billing MikroTik all-in-one modern berbasis Docker yang dirancang khusus untuk pengelola ISP, RT-RW Net, dan jaringan Hotspot. Dilengkapi dengan manajemen pelanggan PPPoE, sistem auto-isolir otomatis saat masa aktif habis, WhatsApp Gateway self-hosted menggunakan **[OpenWA by rmyndharis](https://github.com/rmyndharis/OpenWA)**, serta portal mandiri untuk pembelian voucher hotspot secara online terintegrasi dengan Payment Gateway QRIS lokal.

---

## 📑 Daftar Isi
1. [Fitur Utama](#-fitur-utama)
2. [Arsitektur Sistem & Direktori](#-arsitektur-sistem--direktori)
3. [Prasyarat Sistem](#-prasyarat-sistem)
4. [Panduan Instalasi Docker (Langkah Cepat)](#-panduan-instalasi-docker-langkah-cepat)
5. [Konfigurasi WhatsApp Gateway (OpenWA)](#-konfigurasi-whatsapp-gateway-openwa)
6. [Panduan Integrasi Login Page Hotspot MikroTik](#-panduan-integrasi-login-page-hotspot-mikrotik)
7. [Panduan Integrasi Auto-Isolir PPPoE MikroTik](#-panduan-integrasi-auto-isolir-pppoe-mikrotik)
8. [Panduan Payment Gateway Lokal (QRIS & Virtual Account)](#-panduan-payment-gateway-lokal-qris--virtual-account)
9. [Troubleshooting & FAQ](#-troubleshooting--faq)

---

## 🚀 Fitur Utama

- **👥 Manajemen Pelanggan PPPoE**:
  - Pendaftaran user secret, assign static / dynamic IP pool, profile kecepatan (*rate-limit*), dan penetapan tanggal jatuh tempo.
  - Perpanjangan masa aktif otomatis 30 hari ke depan seketika setelah pembayaran terverifikasi.
  
- **⚡ Pemutusan Akses Otomatis (Auto-Isolir)**:
  - Scheduler otomatis memindai masa aktif pelanggan setiap hari.
  - Memasukkan IP pelanggan yang telah lewat jatuh tempo ke *address-list* `ISOLIR_EXPIRED` di MikroTik.
  - Mengalihkan trafik HTTP port 80 pelanggan ke halaman pemberitahuan tagihan dan tombol bayar QRIS.

- **💬 WhatsApp Gateway Terintegrasi ([rmyndharis/OpenWA](https://github.com/rmyndharis/OpenWA))**:
  - Berbasis multi-device WebSocket (Baileys) tanpa biaya langganan per pesan.
  - Notifikasi otomatis: Pengingat H-3 dan H-1 sebelum jatuh tempo, notifikasi pemutusan isolir, tanda terima pembayaran lunas, dan pengiriman kode voucher online.
  - Fitur Scan QR Code pairing langsung di dalam Dashboard Admin.

- **🛒 Portal Pembelian Voucher Hotspot Mandiri**:
  - Pelanggan di warkop / kafe / area RT-RW Net dapat memilih paket voucher, memasukkan nomor WhatsApp, dan membayar via QRIS Nasional (BCA, Mandiri, Dana, GoPay, OVO, ShopeePay).
  - Kode voucher langsung muncul di layar + tombol *1-klik Login ke Hotspot*.

- **📱 Template Hotspot Captive Portal MikroTik Siap Pakai**:
  - File `login.html`, `status.html`, dan `logout.html` dengan desain responsif mobile-friendly.
  - Field kode voucher (single-code login) + toggle mode Member PPPoE + tombol *"Beli Voucher Online"*.

- **🎫 Generator & Cetak Voucher Massal**:
  - Format cetak Grid A4 (kartu gunting dengan QR login) dan Thermal Receipt mini POS (58mm / 80mm).
  - Ekspor CLI script `/ip hotspot user add ...` untuk impor cepat ke terminal Winbox.

- **📊 Monitoring Trafik NOC Real-Time**:
  - Grafik visualisasi bandwidth Rx (Download) dan Tx (Upload) per detik.
  - Telemetri MikroTik: CPU load, sisa RAM, uptime, dan jumlah user online.

---

## 🏗 Arsitektur Sistem & Direktori

```text
├── docker-compose.yml       # Definisi multi-container (Billing App + OpenWA Gateway)
├── Dockerfile               # Multi-stage production build Node 20 Alpine
├── setup.sh                 # Skrip instalasi otomatis 1-klik untuk VPS Linux
├── .env.example             # Template konfigurasi environment variables
├── server.ts                # Backend Express, healthcheck & OpenWA proxy
├── hotspot/                 # File template captive portal siap upload ke MikroTik
│   ├── login.html           # Halaman login hotspot dengan field voucher & tombol beli
│   ├── status.html          # Halaman status internet dan info sisa kuota/waktu
│   ├── logout.html          # Halaman konfirmasi pemutusan koneksi
│   └── rsc/
│       ├── walled-garden.rsc # Skrip MikroTik bypass payment gateway & billing
│       └── firewall-isolir.rsc # Skrip MikroTik redirect pelanggan jatuh tempo
└── src/                     # Frontend React 19 + Tailwind CSS v4 + Dashboard Admin
```

---

## 📋 Prasyarat Sistem

1. **VPS Cloud / Server Lokal**:
   - OS: Ubuntu 20.04 / 22.04 / 24.04 LTS atau Debian 11 / 12.
   - Minimal Spek: 1 vCPU, 1 GB RAM, 10 GB Storage.
   - Port yang perlu dibuka:
     - `3000` (Web Billing & Portal Voucher)
     - `2785` (OpenWA Dashboard & API)
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
   MIKROTIK_HOST="103.180.12.5"      # Ganti dengan IP Public / VPN MikroTik Anda
   MIKROTIK_PORT=8728
   MIKROTIK_USER="api_billing"
   MIKROTIK_PASS="PasswordMikrotikAnda"

   # OpenWA WhatsApp Gateway (rmyndharis/OpenWA)
   WA_PROVIDER="openwa"
   OPENWA_BASE_URL="http://openwa:2785"
   OPENWA_API_KEY="openwa_admin_sec_88921a9f02b"
   OPENWA_SESSION_ID="billing-isp"

   # Payment Gateway (midtrans / xendit / tripay)
   PAYMENT_GATEWAY="midtrans"
   MIDTRANS_SERVER_KEY="SB-Mid-server-xxxx"
   MIDTRANS_CLIENT_KEY="SB-Mid-client-xxxx"
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
   Output yang diharapkan:
   ```text
   NAME                   IMAGE                     STATUS         PORTS
   mikrotik-billing-app   mikrotik-billing:latest   Up (healthy)   0.0.0.0:3000->3000/tcp
   openwa-api             rmyndharis/openwa:latest  Up (healthy)   0.0.0.0:2785->2785/tcp
   ```

4. **Buka Aplikasi di Browser**:
   - Web Billing & Hotspot Portal: `http://IP_VPS:3000`
   - OpenWA Gateway API: `http://IP_VPS:2785`

---

## 📱 Konfigurasi WhatsApp Gateway (OpenWA)

Aplikasi ini menggunakan repository resmi **[rmyndharis/OpenWA](https://github.com/rmyndharis/OpenWA)**.

1. **Dapatkan API Key OpenWA**:
   Saat OpenWA pertama kali berjalan di Docker, kunci API admin dibuat di dalam volume:
   ```bash
   docker exec openwa-api cat /app/data/.api-key
   ```
   Salin teks API Key tersebut, lalu masukkan ke pengaturan menu **OpenWA Gateway** di Web Billing.

2. **Tautkan Nomor WhatsApp (Pairing QR Code)**:
   - Masuk ke Web Billing `http://IP_VPS:3000`.
   - Pilih tab **OpenWA Gateway**.
   - Klik tombol **"Scan QR Code Pairing"**.
   - Buka WhatsApp di smartphone Anda:
     - Pilih **Menu (titik tiga) / Pengaturan** > **Perangkat Tertaut (Linked Devices)**.
     - Ketuk **Tautkan Perangkat** lalu arahkan kamera ponsel ke QR Code di layar.
   - Selesai! Bot WhatsApp billing Anda kini aktif 24/7 untuk mengirim struk dan pengingat tagihan.

---

## 📶 Panduan Integrasi Login Page Hotspot MikroTik

Template login page lengkap telah disediakan di folder `/hotspot`.

### 1. Upload Template ke Router MikroTik
1. Buka Winbox dan hubungkan ke MikroTik Anda.
2. Buka menu **Files**.
3. Drag & drop folder `hotspot` dari komputer Anda ke dalam Winbox, atau letakkan file `login.html`, `status.html`, dan `logout.html` ke direktori `hotspot/`.

### 2. Atur Server Profile Hotspot
1. Di Winbox, buka **IP** > **Hotspot** > tab **Server Profiles**.
2. Klik ganda pada profile hotspot aktif Anda (misalnya `hsprof1`).
3. Pada opsi **HTML Directory**, pilih folder: `hotspot`.
4. Pada tab **Login**, centang:
   - `HTTP PAP`
   - `HTTP CHAP`
   - `Trial` (jika ingin mengaktifkan opsi uji coba gratis 10 menit).
5. Klik **Apply** & **OK**.

### 3. Konfigurasi Walled Garden (PENTING!)
Agar pengguna yang belum login WiFi dapat membuka web pembelian voucher dan memindai QRIS bank/e-wallet, MikroTik wajib mengizinkan domain tersebut lewat Walled Garden.

Cukup salin dan jalankan script ini di **New Terminal** Winbox:
```routeros
/ip hotspot walled-garden
add dst-host=*billing.ispnet.id action=allow comment="Web Billing & Beli Voucher"
add dst-host=*midtrans.com action=allow comment="Payment Gateway Midtrans"
add dst-host=*api.midtrans.com action=allow comment="Midtrans Core API"
add dst-host=*app.midtrans.com action=allow comment="Midtrans Snap API"
add dst-host=*xendit.co action=allow comment="Payment Gateway Xendit"
add dst-host=*tripay.co.id action=allow comment="Payment Gateway Tripay"
add dst-host=*googleapis.com action=allow comment="Google CDN & Fonts"

/ip hotspot walled-garden ip
add action=accept protocol=tcp dst-port=80 comment="Allow HTTP Portal"
add action=accept protocol=tcp dst-port=443 comment="Allow HTTPS Gateway"
add action=accept protocol=tcp dst-port=3000 comment="Allow Port Billing 3000"
```
*(Atau gunakan perintah `/import hotspot/rsc/walled-garden.rsc`)*

### 4. Hubungkan Tombol "Beli Voucher Online"
Buka file `hotspot/login.html` menggunakan text editor, cari baris tautan berikut:
```html
<a href="http://103.180.12.5:3000/?view=voucher" class="btn-buy">
```
Ganti `http://103.180.12.5:3000` dengan domain atau IP VPS Server Billing Anda.

---

## 🔒 Panduan Integrasi Auto-Isolir PPPoE MikroTik

Ketika masa aktif pelanggan habis, sistem billing akan memasukkan IP pelanggan ke *address-list* `ISOLIR_EXPIRED`. Agar trafik pelanggan teralihkan ke web tagihan, terapkan aturan firewall berikut di MikroTik:

```routeros
# 1. Daftarkan IP Server Billing agar selalu bisa diakses oleh pelanggan yang terisolir
/ip firewall address-list
add list=ALLOW_BILLING address=IP_VPS_BILLING_ANDA comment="Server Billing NetFlow"
add list=ALLOW_PAYMENT address=app.midtrans.com comment="Midtrans Payment"

# 2. Filter Rules
/ip firewall filter
add chain=forward action=accept protocol=udp dst-port=53 src-address-list=ISOLIR_EXPIRED comment="Bypass DNS User Isolir"
add chain=forward action=accept protocol=tcp dst-port=53 src-address-list=ISOLIR_EXPIRED comment="Bypass DNS User Isolir"
add chain=forward action=accept dst-address-list=ALLOW_BILLING src-address-list=ISOLIR_EXPIRED comment="Bypass Akses Web Tagihan"
add chain=forward action=accept dst-address-list=ALLOW_PAYMENT src-address-list=ISOLIR_EXPIRED comment="Bypass Akses Bayar QRIS"
add chain=forward action=drop src-address-list=ISOLIR_EXPIRED comment="DROP Akses Internet Lainnya User Isolir"

# 3. NAT Redirect Port HTTP (80) ke Halaman Tagihan Billing
/ip firewall nat
add chain=dstnat action=dst-nat to-addresses=IP_VPS_BILLING_ANDA to-ports=3000 protocol=tcp dst-port=80 src-address-list=ISOLIR_EXPIRED comment="Redirect Pelanggan Isolir ke Web Tagihan"
```

---

## 💳 Panduan Payment Gateway Lokal (QRIS & Virtual Account)

Sistem mendukung 3 gateway pembayaran Indonesia: **Midtrans**, **Xendit**, dan **Tripay**.

### Setting Webhook Callback URL:
1. Masuk ke dashboard gateway Anda (misalnya: [dashboard.midtrans.com](https://dashboard.midtrans.com)).
2. Masuk ke menu **Settings** > **Configuration**.
3. Isi **Payment Notification URL** dengan:
   ```text
   http://IP_VPS_ANDA:3000/api/payment/webhook
   ```
4. Simpan perubahan.
5. Saat pelanggan membayar QRIS atau Virtual Account, gateway akan mengirimkan sinyal instan ke endpoint ini. Sistem akan langsung menandai invoice **LUNAS**, memperpanjang masa aktif pelanggan, membuka blokir isolir di MikroTik, dan mengirimkan pesan tanda terima WhatsApp melalui OpenWA.

---

## 🛠 Troubleshooting & FAQ

**Q: Bagaimana cara melihat log kontainer jika ada kendala?**
```bash
# Log seluruh layanan
docker compose logs -f

# Log khusus WhatsApp Gateway OpenWA
docker compose logs -f openwa

# Log khusus aplikasi billing
docker compose logs -f mikrotik-billing
```

**Q: Bagaimana cara restart kontainer setelah mengubah file `.env`?**
```bash
docker compose down && docker compose up -d
```

**Q: Apakah aplikasi ini aman dibuka langsung tanpa domain?**
Untuk tahap pengujian dapat langsung menggunakan IP VPS port `3000`. Untuk produksi publik, disarankan memasang domain dan sertifikat SSL gratis (Let's Encrypt) menggunakan Nginx reverse proxy sesuai contoh konfigurasi di tab **Docker & VPS Hosting**.

---

Dibuat dengan ❤️ untuk komunitas jaringan & ISP Indonesia.
Lisensi: MIT.
WhatsApp Gateway ditenagai oleh **[rmyndharis/OpenWA](https://github.com/rmyndharis/OpenWA)**.
