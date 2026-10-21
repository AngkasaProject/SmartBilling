# ========================================================
# MIKROTIK HOTSPOT WALLED GARDEN SCRIPT
# Mengizinkan Pelanggan Beli Voucher & Bayar QRIS Tanpa Login
# Import via Winbox Terminal: /import walled-garden.rsc
# ========================================================

/ip hotspot walled-garden
add dst-host=*billing.ispnet.id action=allow comment="Server Web Billing & Voucher"
add dst-host=*midtrans.com action=allow comment="Payment Gateway Midtrans"
add dst-host=*api.midtrans.com action=allow comment="Midtrans Core API"
add dst-host=*app.midtrans.com action=allow comment="Midtrans Snap API"
add dst-host=*xendit.co action=allow comment="Payment Gateway Xendit"
add dst-host=*tripay.co.id action=allow comment="Payment Gateway Tripay"
add dst-host=*googleapis.com action=allow comment="Google Fonts & CDN"
add dst-host=*gstatic.com action=allow comment="Google Static"
add dst-host=*github.com action=allow comment="GitHub Assets"

/ip hotspot walled-garden ip
add action=accept protocol=tcp dst-port=80 comment="Allow HTTP Portal"
add action=accept protocol=tcp dst-port=443 comment="Allow HTTPS Gateway"
add action=accept protocol=tcp dst-port=3000 comment="Allow Billing Web Port 3000"
add action=accept protocol=tcp dst-port=2785 comment="Allow OpenWA Port 2785"
