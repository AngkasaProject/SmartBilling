# Profil Isolir PPPoE + Captive Portal Pembayaran

Panduan menyiapkan RouterOS agar pelanggan yang menunggak tetap bisa connect PPPoE
tetapi **tidak bisa internetan**, kecuali ke Portal Pembayaran SmartBilling.

Dipakai bila di **Pengaturan → Billing & voucher → Perilaku isolir** dipilih
**Ganti ke profil PPPoE isolir**. SmartBilling akan memutus sesi aktif lalu mengubah
secret pelanggan ke profil isolir yang dipilih per router.

Jika opsi isolir tidak dipakai, SmartBilling tetap memutus sesi lalu menonaktifkan secret.

---

## 1. Siapkan IP Address pelanggan isolir

Buat pool khusus untuk profil isolir, misalnya `192.168.99.2-192.168.99.254`
(jangan bertabrakan dengan pool normal).

```rsc
/ip pool
add name=isolir-pool ranges=192.168.99.2-192.168.99.254
```

## 2. Buat PPP profile isolir

Profil isolir wajib memakai pool di atas, dan **jangan** memakai queue/rate-limit paket normal.

```rsc
/ppp profile
add name=isolir local-address=192.168.99.1 remote-address=isolir-pool dns-server=192.168.99.1
```

Catatan:

- `local-address` di profil ini adalah gateway PPP untuk pelanggan isolir.
- Profil ini yang nanti dipilih di SmartBilling per router.
- Nama profil bebas, tetapi hanya huruf/angka/`.`/`_`/spasi/`-` (maks 64 karakter).

## 3. Tandai IP pelanggan isolir (address-list)

Cara paling aman: firewall menandai seluruh subnet isolir.

```rsc
/ip firewall address-list
add list=ISOLIR address=192.168.99.0/24 comment="pelanggan isolir"
```

Jika ingin per pelanggan, tambahkan IP statis masing-masing ke list yang sama.

## 4. Izinkan hanya Portal Pembayaran

Ganti `portal.contoh.id` dengan domain/IP server SmartBilling, dan
`192.168.99.1` dengan `local-address` profil isolir (dipakai sebagai DNS).

```rsc
/ip firewall filter
# DNS dibutuhkan agar domain portal bisa di-resolve
add chain=forward action=accept src-address-list=ISOLIR protocol=udp dst-port=53 comment="isolir: dns"
add chain=forward action=accept src-address-list=ISOLIR protocol=tcp dst-port=53 comment="isolir: dns tcp"

# Portal pembayaran (HTTP/HTTPS)
add chain=forward action=accept src-address-list=ISOLIR protocol=tcp dst-port=80,443 comment="isolir: portal"

# Sisa trafik pelanggan isolir dibuang
add chain=forward action=drop src-address-list=ISOLIR comment="isolir: drop sisa trafik"
```

**Urutan aturan penting.** Aturan `accept` harus berada **di atas** aturan `drop`
(rule firewall dievaluasi dari atas ke bawah). Setelah menambah rule, cek dengan
`/ip firewall filter print` dan pastikan posisinya benar.

Jika operator memakai `jump` ke chain custom, tambahkan rule di chain tersebut dengan urutan sama.

## 5. Captive portal (opsional)

Tanpa captive portal, pelanggan harus membuka tautan portal dari pesan WhatsApp isolir.
Dengan captive portal, browser otomatis diarahkan ke halaman pembayaran.

> **Penting: hotspot RouterOS tidak berlaku untuk pelanggan PPPoE.**
> `/ip hotspot` bekerja di layer interface L2 (`bridge`, `ether`, `wlan`, `vlan`).
> Pelanggan PPPoE berhenti di interface dinamis `ppp-out` dan tidak pernah menjadi
> user hotspot. Karena itu captive portal untuk isolir PPPoE memakai **NAT redirect**
> berbasis IP, bukan hotspot.
>
> Jangan memasang hotspot isolir pada bridge yang sama dengan hotspot voucher:
> pelanggan PPPoE tetap tidak terpengaruh, sementara seluruh pelanggan voucher
> akan ikut diarahkan ke portal billing dan tidak bisa login voucher.

### 5a. Redirect HTTP ke portal (cara yang dipakai)

Redirect berbasis `src-address-list=ISOLIR`, jadi tidak peduli pelanggan berada di
bridge mana. Cukup satu rule NAT ditambah satu halaman redirect.

```rsc
/ip firewall nat
add chain=dstnat src-address-list=ISOLIR protocol=tcp dst-port=80 \
    action=redirect to-ports=8080 comment="isolir: captive http"
```

`to-ports=8080` harus punya layanan yang menjawab di router. Dua pilihan:

**Pilihan 1 — halaman redirect di router (paling ringan).** RouterOS tidak punya
web server bawaan untuk ini. Jalankan container ringan (mis. `nginx` atau `caddy`)
yang mengembalikan `302` ke portal:

```
# contoh isi container: semua request dijawab 302 ke portal
HTTP/1.1 302 Found
Location: https://portal.contoh.id/portal/billing
```

**Pilihan 2 — redirect langsung ke portal SmartBilling.** Lewati web server router:
arahkan port 80 pelanggan isolir langsung ke port 80 server billing, dan biarkan
aplikasi yang mengembalikan halaman redirect.

```rsc
/ip firewall nat
add chain=dstnat src-address-list=ISOLIR protocol=tcp dst-port=80 \
    action=dst-nat to-addresses=<IP-server-smartbilling> to-ports=80 \
    comment="isolir: captive http ke portal"
```

Pastikan juga rule `accept` portal di langkah 4 mengizinkan IP server tersebut,
karena setelah `dst-nat` tujuan trafik menjadi IP server billing.

**Batasan redirect:** `action=redirect` dan `dst-nat` hanya menangkap **HTTP port 80**.
HTTPS (port 443) tidak bisa di-redirect — browser akan menampilkan peringatan
sertifikat atau timeout, bukan halaman portal. Karena itu tautan portal di pesan
WhatsApp tetap jalur utama; captive portal hanya pelengkap untuk pelanggan yang
mengetik alamat `http://`.

### 5b. Notifikasi "Masuk ke jaringan" / "Sign in to network"

Notifikasi itu **bukan** fitur SmartBilling. Itu browser/OS yang mendeteksi captive
portal: saat terhubung, OS memanggil URL probe bawaan, lalu memunculkan notifikasi
kalau jawabannya bukan yang diharapkan (`204 No Content` atau teks tertentu).

Supaya notifikasi muncul untuk pelanggan isolir, trafik probe itu harus **sampai ke
server SmartBilling**, bukan di-drop firewall. Server sudah menangani ini: rute probe
dijawab `302` ke Portal Pembayaran.

| OS | URL probe | Diharapkan normal |
|---|---|---|
| Android/Chrome | `/generate_204` | `204` |
| Windows | `/connecttest.txt`, `/ncsi.txt` | `200 Microsoft Connect Test` |
| Apple | `/hotspot-detect.html`, `/library/test/success.html` | halaman `Success` |

Rule firewall tambahan — arahkan probe ke server billing, **di atas** rule `drop`:

```rsc
/ip firewall filter
add chain=forward action=accept src-address-list=ISOLIR \
    dst-address=<IP-server-smartbilling> protocol=tcp dst-port=80 \
    comment="isolir: probe captive portal"
```

Pastikan rule ini berada **di atas** `drop` dan setelah rule DNS. Tanpa rule ini,
probe di-drop, OS menyimpulkan "tidak ada internet" tanpa notifikasi.

Verifikasi dari perangkat pelanggan isolir:

```rsc
# di router
/tool fetch url="http://<IP-server-smartbilling>/generate_204" mode=http
# harus melaporkan status 302, bukan failed
```

Kalau `302` terlihat di router tetapi notifikasi tetap tidak muncul di perangkat,
berarti paket probe dari perangkat tidak sampai ke router — periksa lagi urutan
rule firewall dan pastikan `src-address-list=ISOLIR` benar-benar memuat IP pelanggan.

**Catatan:** notifikasi hanya muncul pada **HTTP**. Banyak OS modern memakai probe
HTTPS yang tidak bisa di-redirect, sehingga notifikasi bisa tidak muncul meskipun
konfigurasi sudah benar. Tautan portal di pesan WhatsApp tetap jalur paling andal.


### 5c. DNS redirect (opsional, agresif)

Arahkan semua DNS pelanggan isolir ke router agar nama domain apa pun bisa
diarahkan ke portal:

```rsc
/ip firewall nat
add chain=dstnat src-address-list=ISOLIR protocol=udp dst-port=53 \
    action=redirect to-ports=53 comment="isolir: dns lokal"
```

Jangan arahkan DNS pelanggan isolir ke server publik, karena query DNS bisa dipakai
membuka trafik keluar. Trik ini hanya efektif untuk HTTP, bukan HTTPS.

## 6. Bypass portal agar pembayaran tetap bisa dibuka

Portal Pembayaran adalah satu-satunya tujuan yang diizinkan pada langkah 4. Pastikan:

1. Rule `accept` portal berada di atas rule `drop`.
2. IP server SmartBilling dan domain portal masuk `address-list=PORTAL-BILLING`
   (bukan walled garden — walled garden hanya untuk hotspot, tidak berlaku untuk PPPoE).
3. Jika memakai payment gateway dengan halaman eksternal (mis. halaman redirect
   Midtrans/DOKU), tambahkan juga domain gateway tersebut ke `PORTAL-BILLING`,
   karena pelanggan tetap tidak punya internet bebas.

Contoh menambahkan domain gateway:

```rsc
/ip firewall address-list
add list=PORTAL-BILLING address=portal.contoh.id comment="portal billing"
add list=PORTAL-BILLING address=app.midtrans.com comment="gateway pembayaran"

/ip firewall filter
add chain=forward action=accept src-address-list=ISOLIR dst-address-list=PORTAL-BILLING comment="isolir: portal & pembayaran"
```

## 7. Aktifkan di SmartBilling

1. Buka **Pengaturan → Billing & voucher**.
2. Pada **Perilaku isolir**, pilih **Ganti ke profil PPPoE isolir**.
3. Pilih profil isolir untuk setiap router (mis. `isolir`).
4. Simpan pengaturan.

SmartBilling akan:

- memutus sesi PPPoE aktif pelanggan,
- mengubah profil secret ke profil isolir (secret tetap aktif),
- mengirim notifikasi isolir berisi tautan portal pembayaran,
- saat pembayaran dikonfirmasi, memutus sesi isolir dan mengembalikan profil normal.

## 8. Verifikasi

1. Isolir satu pelanggan uji dari menu Billing atau tunggu scheduler.
2. Cek di router: `/ppp secret print where name=<user>` → `profile` harus profil isolir.
3. Cek sesi: `/ppp active print where name=<user>` → sesi baru memakai IP pool isolir.
4. Dari perangkat pelanggan: `ping 8.8.8.8` harus gagal, buka tautan portal harus berhasil.
5. Bayar invoice → secret kembali ke profil normal dan internet pulih setelah koneksi ulang.

## 9. Catatan & jebakan

- Pelanggan isolir tetap memakai sesi PPP; jika router penuh, gunakan opsi
  **Nonaktifkan secret PPPoE** untuk pelanggan yang benar-benar dihentikan.
- `local-address` profil isolir jangan sama dengan gateway profil normal, agar
  routing gateway tidak bentrok.
- Jika profil isolir diganti nama di RouterOS, perbarui pilihan profil di SmartBilling.
  Bila profil tidak ditemukan, isolir gagal dan status billing tidak diubah.
- Captive portal untuk PPPoE memakai NAT redirect berbasis IP, **bukan** `/ip hotspot`.
  Hotspot hanya bekerja pada interface L2 dan tidak menjangkau sesi PPPoE.
- Kalau PPPoE dan hotspot voucher berbagi bridge yang sama, jangan pasang hotspot
  isolir di bridge itu: pelanggan PPPoE tidak akan terpengaruh, tetapi seluruh
  pelanggan voucher ikut terlempar ke portal billing.
- Semua perubahan firewall bersifat manual; SmartBilling tidak mengubah firewall router.
- Uji dulu pada satu pelanggan sebelum mengaktifkan isolir otomatis massal.
