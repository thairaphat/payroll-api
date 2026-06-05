# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── Stage 2: Generate Prisma client ──────────────────────────────────────────
FROM deps AS builder
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json ./
RUN bunx prisma generate

# ── Stage 3: Production runtime ──────────────────────────────────────────────
FROM oven/bun:1-alpine AS runtime
WORKDIR /app

# Node + npm are required for PM2; curl for HEALTHCHECK
RUN apk add --no-cache nodejs npm curl
RUN npm install -g pm2

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY package.json ecosystem.config.js ./

RUN mkdir -p /app/logs

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3001/ || exit 1

CMD ["pm2-runtime", "ecosystem.config.js", "--env", "production"]
