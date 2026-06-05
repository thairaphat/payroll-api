# ── Stage 1: Build React app ─────────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# VITE_API_URL is intentionally empty — Nginx proxies /api/* to the backend
ARG VITE_API_URL=""
ARG VITE_GOOGLE_SHEET_ID=""
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GOOGLE_SHEET_ID=$VITE_GOOGLE_SHEET_ID
RUN bun run build

# ── Stage 2: Serve with Nginx ─────────────────────────────────────────────────
FROM nginx:alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost/ || exit 1
