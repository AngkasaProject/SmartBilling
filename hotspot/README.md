# Template Hotspot MikroTik

Folder ini berisi halaman captive portal SmartBilling dan file pendamping HotSpot RouterOS. Upload file portal yang diperlukan dari folder ini, bukan folder `hotspot` sebagai subfolder tambahan. Pertahankan subfolder `css/` dan `xml/`.

## Pasang ke MikroTik

1. Cadangkan dulu file HotSpot yang sedang dipakai.
2. Sesuaikan `config.json`: `brandName`, `wifiName`, `portalUrl`, dan `logoPath`. Logo utama ditampilkan sendiri; fallback brand dipakai jika logo tidak tersedia.
3. Di Winbox, buka **Files**, masuk ke direktori HTML HotSpot yang digunakan, lalu upload file `.html`, `md5.js`, `hotspot-config.js`, `config.json`, `jsQR.js`, `errors.txt`, `logo.png`, serta folder `css/` dan `xml/`. Jangan upload `README.md`, file lisensi, atau folder `rsc/` ke direktori HTML.
4. Di **IP > Hotspot > Server Profiles**, atur **HTML Directory** ke direktori yang sama.
5. Pastikan `md5.js` ikut ter-upload bila metode login memakai HTTP-CHAP. File ini diperlukan oleh `login.html` untuk membuat respons CHAP.
6. Uji login voucher, halaman sukses, status, logout, error, serta redirect dari perangkat yang tersambung ke SSID.

`errors.txt` menyediakan pesan Bahasa Indonesia. Untuk memakai pesan Bahasa Inggris, upload `errors-en.txt` dengan nama `errors.txt`. `md5-LICENSE.txt` dan `jsQR-LICENSE.txt` hanya berisi informasi lisensi dan disimpan bersama source, bukan file yang diperlukan RouterOS.

## Isi utama

- `login.html`, `alogin.html`, `status.html`, `logout.html`: alur login dan sesi.
- `md5.js`: respons HTTP-CHAP.
- `error.html`, `flogout.html`, `rlogin.html`, `redirect.html`, `radvert.html`: halaman tambahan RouterOS.
- `errors.txt`, `errors-en.txt`: pesan kesalahan HotSpot.
- `xml/`: respons WISPr dan skema XML.
- `css/style.css`: gaya untuk halaman tambahan.
- `config.json`, `hotspot-config.js`, `jsQR.js`, `logo.png`: konfigurasi, pemindai QR, dan logo.
