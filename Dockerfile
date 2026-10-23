# ============================================================
# SmartBilling - Multi-stage Dockerfile
# Node.js 22 Alpine (Vite 8 dan concurrently 10 memerlukan Node.js 22).
# ============================================================

# ---------- Stage 1: Builder ----------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifest lockfile lebih dulu agar layer caching efisien
COPY package*.json ./

# Lockfile dibuat di Windows dan tidak mencatat semua binary native opsional.
# npm install memilih binary yang sesuai dengan platform Linux Alpine/musl.
RUN npm install --include=optional

# Copy seluruh source setelah dependency terpasang
COPY . .

# Build frontend (Vite) + apapun yang didefinisikan di package.json
RUN npm run build

# ---------- Stage 2: Runner (production) ----------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=1707

# Copy manifest untuk instalasi dependensi produksi
COPY package*.json ./

# Resolve optional native packages untuk platform runner yang sama.
RUN npm install --omit=dev --include=optional

# Copy hasil build dari builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/types ./src/types

# Folder data untuk SQLite persisten (di-mount via volume di compose)
RUN mkdir -p /app/data

EXPOSE 1707

# Jalankan server Express/TypeScript via tsx
CMD ["npx", "tsx", "server.ts"]