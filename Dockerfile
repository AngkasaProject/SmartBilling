# ============================================================
# SmartBilling - Multi-stage Dockerfile
# Node.js 22 Alpine
# ============================================================

# ---------- Stage 1: Builder ----------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifest
COPY package*.json ./

# 1. HAPUS LOCKFILE LAMA (Kunci utama agar binary Alpine/musl terunduh)
RUN rm -f package-lock.json

# 2. Install ulang dari package.json
RUN npm install --include=optional

# Copy seluruh source setelah dependency terpasang
COPY . .

# Build frontend (Vite)
RUN npm run build

# ---------- Stage 2: Runner (production) ----------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=1707

# Copy manifest
COPY package*.json ./

# Hapus lockfile lama lagi di stage runner, lalu install dependensi produksi
RUN rm -f package-lock.json && npm install --omit=dev --include=optional

# Copy hasil build dari builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server

# 3. SALIN SELURUH FOLDER SRC (Bukan hanya src/types)
COPY --from=builder /app/src ./src

# Folder data untuk SQLite persisten
RUN mkdir -p /app/data

EXPOSE 1707

# Jalankan server Express/TypeScript via tsx
CMD ["npx", "tsx", "server.ts"]
