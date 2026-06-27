FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5173

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 marra

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder --chown=marra:nodejs /app/dist ./dist
COPY --chown=marra:nodejs server ./server
COPY --chown=marra:nodejs db ./db
COPY --chown=marra:nodejs scripts ./scripts

RUN mkdir -p uploads && chown -R marra:nodejs uploads

USER marra
EXPOSE 5173
CMD ["sh", "-c", "node scripts/db-setup.mjs && node server/index.js"]
