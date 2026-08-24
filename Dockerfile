FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_API_URL=/backend-api
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Stimulsoft Reports.JS runs entirely in the browser, so its licence key is
# necessarily part of the client bundle and has to be baked in at build time.
# Empty (the default) means trial mode: fully functional, TRIAL watermark.
ARG NEXT_PUBLIC_STIMULSOFT_LICENSE_KEY=
ENV NEXT_PUBLIC_STIMULSOFT_LICENSE_KEY=${NEXT_PUBLIC_STIMULSOFT_LICENSE_KEY}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"]

CMD ["node", "server.js"]
