FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# next.config.mjs reads BACKEND_URL to build the /api/* rewrite destination
# at build time, so it must be passed in as a build arg on Railway (not just
# a runtime service variable) or it silently falls back to localhost:8080.
ARG BACKEND_URL
ENV BACKEND_URL=$BACKEND_URL
# lib/api.ts reads NEXT_PUBLIC_BACKEND_URL to send streaming chat requests
# straight to the backend, bypassing the /api/* rewrite (which drops
# long-lived SSE connections mid-stream). NEXT_PUBLIC_* vars are inlined
# into the client bundle at build time, so this must also be a build arg —
# a runtime-only service variable is silently ignored and every send fails
# with a 404.
ARG NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN addgroup -S app && adduser -S app -G app \
  && mkdir -p .next/cache/images \
  && chown -R app:app .next
USER app

EXPOSE 3000
CMD ["node", "server.js"]
