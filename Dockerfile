# ---- Stage 1: Build frontend ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- Stage 2: Production runtime ----
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssh-client curl
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY deploy.sh ./

ENV PORT=9627
EXPOSE 9627
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:${PORT}/health || exit 1
CMD ["node", "server/index.mjs"]
