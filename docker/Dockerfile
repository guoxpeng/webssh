# ---- Stage 1: Build frontend ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- Stage 2: Production runtime ----
FROM node:20-alpine
RUN apk add --no-cache openssh-client curl
RUN addgroup -S nodegroup && adduser -S -G nodegroup -h /app -D webssh 2>/dev/null; mkdir -p /app/core/server/data
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=builder /app/dist ./dist
COPY core/server ./core/server
# core/server 里的 lib/mcp.mjs、lib/mcp-client.mjs 会 import ../../mcp/server.mjs
# 和 ../../shared/version.mjs，这两个目录不在 core/server 下，漏拷会导致容器启动即
# ERR_MODULE_NOT_FOUND 重启循环
COPY core/mcp ./core/mcp
COPY core/shared ./core/shared
COPY scripts/deploy.sh ./
RUN chown -R webssh:nodegroup /app
ENV PORT=9627
EXPOSE 9627
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:${PORT}/health || exit 1
USER webssh
CMD ["node", "core/server/index.mjs"]
