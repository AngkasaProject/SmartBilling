# ============================================================
# SmartBilling - Multi-stage Dockerfile
# Node 22 Alpine (memenuhi syarat concurrently@>=10 yang butuh Node >=22)
# ============================================================

# ---------- Stage 1: Builder ----------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifest lockfile lebih dulu agar layer caching efisien
COPY package*.json ./

# npm install (bukan npm ci) agar binary opsional untuk Alpine/musl
# (mis. @rolldown/binding-linux-x64-musl) ikut terunduh dan lockfile
# dapat diregenerasi bila perlu.
RUN npm install

# Copy seluruh source setelah dependency terpasang
COPY . .

# Build frontend (Vite) + apapun yang didefinisikan di package.json
RUN npm run build

# ---------- Stage 2: Runner (production) ----------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy manifest untuk instalasi dependensi produksi
COPY package*.json ./

# Coba npm ci dulu (cepat & deterministik). Jika lockfile belum sinkron
# dengan platform Alpine, fallback ke npm install --omit=dev.
RUN npm ci --omit=dev || npm install --omit=dev

# Copy hasil build dari builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/types ./src/types

# Folder data untuk SQLite persisten (di-mount via volume di compose)
RUN mkdir -p /app/data

EXPOSE 3000

# Jalankan server Express/TypeScript via tsx
CMD ["npx", "tsx", "server.ts"]