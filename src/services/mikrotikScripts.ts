// MikroTik RouterOS scripts and templates

export const getMikrotikIsolirScript = () => `# Isolir PPPoE dilakukan melalui API RouterOS dari menu Pelanggan.
# Scheduler sinkronisasi otomatis belum tersedia; skrip contoh tidak akan mengubah router.
# Gunakan tombol Isolir/Aktifkan pada data pelanggan untuk menerapkan perubahan ke router.
`;

export const getHotspotWalledGardenScript = (billingDomain: string) => {
  return `# =========================================================
# AKSES PORTAL BILLING UNTUK HOTSPOT
# Masukkan di Terminal MikroTik
# =========================================================

/ip hotspot walled-garden
add dst-host=${billingDomain} action=allow comment="Portal Billing"
add dst-host=cdn.tailwindcss.com action=allow comment="Hotspot Portal Styles"
add dst-host=fonts.googleapis.com action=allow comment="Hotspot Portal Fonts"
`;
};

export const getHotspotLoginTemplate = () => {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login WiFi Hotspot</title>
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
      <h1 class="text-2xl font-bold text-white tracking-tight">Login Hotspot</h1>
      <p class="text-xs text-slate-400 mt-1">Masukkan kredensial hotspot Anda</p>
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
          placeholder="Kode voucher"
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
      <span class="relative px-3 bg-slate-900 text-[11px] font-medium text-slate-500 uppercase tracking-wider">Belum punya voucher?</span>
    </div>

    <p class="text-center text-xs text-slate-400">Hubungi operator jaringan untuk mendapatkan voucher.</p>

    <!-- Trial Gratis jika diaktifkan di MikroTik -->
    $(if trial == 'yes')
    <div class="mt-3 text-center">
      <a href="$(link-login-only)?dst=$(link-orig-esc)&amp;username=T-$(mac-esc)" class="text-xs text-indigo-400 hover:underline">
        Coba akses gratis
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
    dockerfile: `# Multi-stage Dockerfile for SmartBilling
FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
# Resolve optional native binaries for the Linux Alpine/musl build platform.
RUN npm install --include=optional

COPY . .
RUN npm run build

# Production runtime stage
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=1707

COPY package*.json ./
RUN npm install --omit=dev --include=optional

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/types ./src/types
RUN mkdir -p /app/data

EXPOSE 1707

CMD ["npx", "tsx", "server.ts"]
`,
    dockerCompose: `version: '3.8'

services:
  mikrotik-billing:
    build: .
    container_name: mikrotik-billing-app
    restart: unless-stopped
    # BILLING_PORT selects the host port; the app listens on 1707 inside the container.
    ports:
      - "\${BILLING_PORT:-1707}:1707"
    env_file:
      - .env
    environment:
      - PORT=1707
      - NODE_ENV=production
    depends_on:
      - openwa
    volumes:
      - billing_data:/app/data
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:1707/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3

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
    server_name DOMAIN_ANDA;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name DOMAIN_ANDA;

    ssl_certificate /etc/letsencrypt/live/DOMAIN_ANDA/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/DOMAIN_ANDA/privkey.pem;

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
