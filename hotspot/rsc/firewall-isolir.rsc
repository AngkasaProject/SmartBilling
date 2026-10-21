# ========================================================
# MIKROTIK FIREWALL AUTO-ISOLIR JATUH TEMPO SCRIPT
# Import via Winbox Terminal: /import firewall-isolir.rsc
# ========================================================

# 1. Address List Server Billing (Ganti dengan IP Server Anda)
/ip firewall address-list
add list=ALLOW_BILLING address=103.180.12.5 comment="Server Billing NetFlow"
add list=ALLOW_PAYMENT address=app.midtrans.com comment="Midtrans Gateway"
add list=ALLOW_PAYMENT address=api.xendit.co comment="Xendit Gateway"
add list=ALLOW_PAYMENT address=tripay.co.id comment="Tripay Gateway"

# 2. Filter Rules (Bypass DNS & Billing, Drop Internet Lainnya)
/ip firewall filter
add chain=forward action=accept protocol=udp dst-port=53 src-address-list=ISOLIR_EXPIRED comment="Bypass DNS User Isolir"
add chain=forward action=accept protocol=tcp dst-port=53 src-address-list=ISOLIR_EXPIRED comment="Bypass DNS User Isolir"
add chain=forward action=accept dst-address-list=ALLOW_BILLING src-address-list=ISOLIR_EXPIRED comment="Bypass Akses Web Billing"
add chain=forward action=accept dst-address-list=ALLOW_PAYMENT src-address-list=ISOLIR_EXPIRED comment="Bypass Akses Bayar QRIS"
add chain=forward action=drop src-address-list=ISOLIR_EXPIRED comment="DROP Akses Internet User Isolir"

# 3. NAT Redirect HTTP Pelanggan Isolir ke Web Tagihan Billing
/ip firewall nat
add chain=dstnat action=dst-nat to-addresses=103.180.12.5 to-ports=3000 protocol=tcp dst-port=80 src-address-list=ISOLIR_EXPIRED comment="Redirect Pelanggan Isolir ke Web Tagihan"
