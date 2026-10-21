// MikroTik RouterOS Script Generator & Templates for Auto-Isolir, Hotspot, and Walled Garden

export const getMikrotikIsolirScript = (billingHost = '103.180.12.5:3000') => {
  return `# =========================================================
# NETFLOW MIKROTIK AUTO-ISOLIR & PAYMENT WALLED-GARDEN SCRIPT
# Generated for RouterOS v6 & v7
# =========================================================

# 1. Buat Address-List untuk Pelanggan Isolir (Bila belum ada)
/ip firewall address-list
add list=ISOLIR_EXPIRED address=10.10.20.35 comment="Contoh Pelanggan Jatuh Tempo"

# 2. Buka Akses Walled Garden (Bypass) agar Pelanggan Isolir & Hotspot
#    Bisa Mengakses Web Billing dan Payment Gateway (QRIS/VA)
/ip firewall address-list
add list=ALLOW_BILLING address=${billingHost.split(':')[0]} comment="Server Billing Netflow"
add list=ALLOW_PAYMENT address=app.midtrans.com comment="Midtrans PG"
add list=ALLOW_PAYMENT address=api.midtrans.com comment="Midtrans API"
add list=ALLOW_PAYMENT address=api.xendit.co comment="Xendit PG"
add list=ALLOW_PAYMENT address=tripay.co.id comment="Tripay PG"
add list=ALLOW_PAYMENT address=fonts.googleapis.com comment="Web Fonts"

# 3. Izinkan DNS Lookup untuk User Isolir
/ip firewall filter
add chain=forward action=accept protocol=udp dst-port=53 src-address-list=ISOLIR_EXPIRED comment="Bypass DNS User Isolir"
add chain=forward action=accept protocol=tcp dst-port=53 src-address-list=ISOLIR_EXPIRED comment="Bypass DNS User Isolir"

# 4. Izinkan Akses ke Server Billing & Payment Gateway
/ip firewall filter
add chain=forward action=accept dst-address-list=ALLOW_BILLING src-address-list=ISOLIR_EXPIRED comment="Bypass Akses Billing"
add chain=forward action=accept dst-address-list=ALLOW_PAYMENT src-address-list=ISOLIR_EXPIRED comment="Bypass Akses Payment Gateway"

# 5. Blokir Akses Internet Lainnya untuk User yang Ter-Isolir
/ip firewall filter
add chain=forward action=drop src-address-list=ISOLIR_EXPIRED comment="DROP Semua Trafik Pelanggan Isolir"

# 6. Redirect Port HTTP (80) Pelanggan Isolir ke Halaman Pemberitahuan & Bayar Tagihan
/ip firewall nat
add chain=dstnat action=dst-nat to-addresses=${billingHost.split(':')[0]} to-ports=3000 protocol=tcp dst-port=80 src-address-list=ISOLIR_EXPIRED comment="Redirect HTTP Isolir ke Web Billing"

# 7. SCRIPT SCHEDULER: Cek API Billing Setiap Jam untuk Sinkronisasi Isolir
/system script
add name="sync-isolir-billing" policy=read,write,policy,test source="
  :log info \"[NETFLOW] Memulai sinkronisasi status isolir pelanggan...\";
  /tool fetch url=\"http://${billingHost}/api/mikrotik/sync\" mode=http dst-path=sync.txt;
  :log info \"[NETFLOW] Sinkronisasi isolir selesai.\";
"

/system scheduler
add name="sched-sync-isolir" interval=1h start-time=startup on-event="sync-isolir-billing"
`;
};

export const getHotspotWalledGardenScript = (billingDomain = 'billing.ispnet.id') => {
  return `# =========================================================
# HOTSPOT WALLED GARDEN UNTUK PEMBELIAN VOUCHER ONLINE & QRIS
# Masukkan di Terminal MikroTik
# =========================================================

/ip hotspot walled-garden
add dst-host=${billingDomain} action=allow comment="Web Portal Beli Voucher"
add dst-host=*midtrans.com action=allow comment="Midtrans Gateway"
add dst-host=*xendit.co action=allow comment="Xendit Gateway"
add dst-host=*tripay.co.id action=allow comment="Tripay Gateway"
add dst-host=*fonnte.com action=allow comment="WhatsApp Gateway Fonnte"
add dst-host=*googleapis.com action=allow comment="Google Fonts & CDN"
add dst-host=*gstatic.com action=allow comment="Google Static"

/ip hotspot walled-garden ip
add action=accept protocol=tcp dst-port=80,443 comment="Allow Payment Ports"
`;
};

export const getHotspotLoginTemplate = () => {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login WiFi Hotspot - High Speed Internet</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-4">
  <div class="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
    <!-- Glow element -->
    <div class="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none"></div>
    <div class="absolute -bottom-10 -left-10 w-32 h-32 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none"></div>

    <div class="text-center mb-6">
      <div class="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-indigo-600 to-emerald-500 rounded-2xl shadow-lg mb-3">
        <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"></path>
        </svg>
      </div>
      <h1 class="text-2xl font-bold text-white tracking-tight">WIFI HOTSPOT SUPER</h1>
      <p class="text-xs text-slate-400 mt-1">Koneksi Internet Cepat, Stabil & Tanpa Batas</p>
    </div>

    <!-- Alert / Error message placeholder from MikroTik -->
    $(if error)
    <div class="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 text-center">
      $(error)
    </div>
    $(endif)

    <!-- Login Form -->
    <form name="login" action="$(link-login-only)" method="post" $(if chap-id) onSubmit="return doLogin()" $(endif) class="space-y-4">
      <input type="hidden" name="dst" value="$(link-orig)" />
      <input type="hidden" name="popup" value="true" />

      <div>
        <label class="block text-xs font-semibold text-slate-300 mb-1.5">Kode Voucher</label>
        <input 
          type="text" 
          name="username" 
          placeholder="Contoh: NET-73921" 
          class="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-center font-mono font-bold tracking-wider text-white text-lg placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          required 
          autocomplete="off"
        />
      </div>

      <input type="hidden" name="password" id="password" />

      <button 
        type="submit" 
        class="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 font-semibold text-white rounded-xl shadow-lg shadow-indigo-600/30 transition duration-200 active:scale-[0.99] flex items-center justify-center gap-2"
      >
        <span>Masuk Sekarang</span>
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
        </svg>
      </button>
    </form>

    <div class="relative my-6 text-center">
      <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-slate-800"></div></div>
      <span class="relative px-3 bg-slate-900 text-[11px] font-medium text-slate-500 uppercase tracking-wider">Belum Punya Voucher?</span>
    </div>

    <!-- Tombol Beli Voucher Mandiri Online -->
    <a 
      href="http://103.180.12.5:3000/?view=voucher" 
      class="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 font-semibold text-white rounded-xl shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2 text-sm text-center"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
      </svg>
      <span>Beli Voucher Online (QRIS / E-Wallet)</span>
    </a>

    <!-- Trial Gratis jika diaktifkan di MikroTik -->
    $(if trial == 'yes')
    <div class="mt-3 text-center">
      <a href="$(link-login-only)?dst=$(link-orig-esc)&amp;username=T-$(mac-esc)" class="text-xs text-indigo-400 hover:underline">
        Coba Gratis 10 Menit (Trial)
      </a>
    </div>
    $(endif)

    <div class="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
      <span>IP Anda: $(ip)</span>
      <span>MAC: $(mac)</span>
    </div>
  </div>

  <script>
    // Sinkronisasi otomatis password sama dengan username (kode voucher tunggal)
    document.forms['login'].elements['username'].addEventListener('input', function(e) {
      document.getElementById('password').value = e.target.value;
    });
  </script>
</body>
</html>
`;
};

export const getDockerConfig = () => {
  return {
    dockerfile: `# Multi-stage Dockerfile for MikroTik Billing & Hotspot Platform
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production runtime stage
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts

EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
`,
    dockerCompose: `version: '3.8'

services:
  mikrotik-billing:
    build: .
    container_name: mikrotik-billing-app
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - NODE_ENV=production
      # MikroTik API Connection
      - MIKROTIK_HOST=103.180.12.5
      - MIKROTIK_PORT=8728
      - MIKROTIK_USER=api_billing
      - MIKROTIK_PASS=SuperSecureMikrotikPassword!
      # Payment Gateway Config
      - PAYMENT_GATEWAY=midtrans
      - MIDTRANS_SERVER_KEY=SB-Mid-server-xX88sampleKey992834
      - MIDTRANS_CLIENT_KEY=SB-Mid-client-88sampleKey1192
      - MIDTRANS_IS_PRODUCTION=false
      # WhatsApp Gateway Config (rmyndharis/OpenWA)
      - WA_PROVIDER=openwa
      - OPENWA_BASE_URL=http://openwa:2785
      - OPENWA_API_KEY=openwa_admin_sec_88921a9f02b
      - OPENWA_SESSION_ID=billing-isp
    depends_on:
      - openwa
    volumes:
      - billing_data:/app/data
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  # WhatsApp Gateway Service (rmyndharis/OpenWA)
  openwa:
    image: rmyndharis/openwa:latest
    container_name: openwa-api
    restart: unless-stopped
    ports:
      - "2785:2785"
    environment:
      - PORT=2785
      - NODE_ENV=production
      - DEFAULT_ENGINE=baileys
    volumes:
      - openwa_data:/app/data
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:2785/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3

volumes:
  billing_data:
  openwa_data:
`,
    nginxConf: `# Nginx Reverse Proxy with SSL (Certbot)
server {
    listen 80;
    server_name billing.ispnet.id;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name billing.ispnet.id;

    ssl_certificate /etc/letsencrypt/live/billing.ispnet.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/billing.ispnet.id/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`
  };
};
