# ---- build stage ----
FROM node:22-alpine AS builder
WORKDIR /app

# native addons (better-sqlite3) のビルドに必要
RUN apk add --no-cache python3 make g++
RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma  ./prisma/
COPY client  ./client/
COPY public  ./public/
RUN pnpm install --frozen-lockfile \
 && pnpm exec prisma generate \
 && pnpm build:ui

# ---- production stage ----
FROM node:22-alpine
WORKDIR /app

RUN apk add --no-cache libgcc libstdc++ \
 && corepack enable pnpm \
 && addgroup -g 1001 -S nodejs \
 && adduser  -S nodejs -u 1001

COPY --from=builder --chown=nodejs:nodejs /app/node_modules  ./node_modules
COPY --chown=nodejs:nodejs . .
# ビルド済み SPA でローカルの未ビルド状態を上書き
COPY --from=builder --chown=nodejs:nodejs /app/public/spa    ./public/spa

RUN mkdir -p data && chown nodejs:nodejs data

USER nodejs

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["sh", "-c", "pnpm migrate && pnpm start"]
