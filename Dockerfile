# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=optional

COPY . .
RUN npm run lint && npm run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=1707 \
    RUN_EXPRESS=true

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --include=optional \
    && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server
COPY --from=builder /app/src ./src

RUN mkdir -p /app/data \
    && chown -R node:node /app/data

USER node

EXPOSE 1707

CMD ["./node_modules/.bin/tsx", "server.ts"]
