#!/usr/bin/env bash
set -e

# WebSSH - Complete Uninstall
# Usage: curl -fsSL https://raw.githubusercontent.com/guoxpeng/webssh/main/scripts/uninstall.sh | bash

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'; BOLD='\033[1m'
info()  { echo -e "  ${CYAN}[..]${NC} $1"; }
ok()    { echo -e "  ${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "  ${YELLOW}[!!]${NC} $1"; }

echo ""
echo -e "  ${BOLD}${RED}╔══════════════════════════════════════╗${NC}"
echo -e "  ${BOLD}${RED}║        WebSSH · 完整卸载              ║${NC}"
echo -e "  ${BOLD}${RED}╚══════════════════════════════════════╝${NC}"
echo ""

PORT="${PORT:-9627}"

# ── Detect installation directory ──
APP_DIR=""
for d in "$(pwd)/webssh" "$HOME/webssh" "/root/webssh" "/opt/webssh"; do
  if [ -f "$d/core/server/index.mjs" ] || [ -f "$d/server/index.mjs" ] || [ -f "$d/webssh.pid" ]; then
    APP_DIR="$d"
    break
  fi
done

if [ -z "$APP_DIR" ]; then
  warn "未找到 webssh 安装目录"
  echo ""
  echo "  尝试查找: find / -name 'core/server/index.mjs' -o -name 'webssh.pid' 2>/dev/null"
  echo "  你也可以手动删除: rm -rf /opt/webssh ~/webssh"
fi

if [ -n "$APP_DIR" ]; then
  echo -e "  ${YELLOW}⚠ 找到安装目录: ${APP_DIR}${NC}"
  echo -e "      • 程序文件（整个 webssh 目录）"
  echo -e "      • 运行中的进程（端口 ${PORT}）"
  echo -e "      • 本地数据（data 目录）"
  echo -e "      • systemd 服务（webssh.service）"
  echo -e "      • npm 全局缓存"
  echo ""
fi

read -p "  确认卸载？(y/N) " CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo -e "  ${CYAN}已取消${NC}"; exit 0; }
echo ""

# ── 1. Stop systemd service (cleanest, must be first) ──
if command -v systemctl >/dev/null 2>&1; then
  info "停止 systemd 服务..."
  sudo systemctl stop webssh 2>/dev/null || true
  sudo systemctl disable webssh 2>/dev/null || true
  ok "systemd 服务已停止"
fi

# ── 2. Kill process on port ──
info "终止进程 (端口 ${PORT})..."
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" 2>/dev/null || true
  sleep 1
fi
if command -v lsof >/dev/null 2>&1; then
  PORT_PID=$(lsof -ti :"${PORT}" 2>/dev/null || true)
  if [ -n "$PORT_PID" ]; then
    kill -9 $PORT_PID 2>/dev/null || true
    ok "已终止端口进程 PID $PORT_PID"
  fi
fi

# ── 3. Kill by PID file ──
if [ -n "$APP_DIR" ] && [ -f "${APP_DIR}/webssh.pid" ]; then
  OLD_PID=$(cat "${APP_DIR}/webssh.pid" 2>/dev/null || true)
  [ -n "$OLD_PID" ] && kill -9 "$OLD_PID" 2>/dev/null || true
  rm -f "${APP_DIR}/webssh.pid"
  ok "已终止 PID 文件进程"
fi

# ── 4. Kill by process name (all possible old structures) ──
pkill -f "node.*core/server/index.mjs" 2>/dev/null || true
pkill -f "node.*server/index.mjs" 2>/dev/null || true
sleep 1

# ── 5. Remove systemd service file ──
SERVICE_FILE="/etc/systemd/system/webssh.service"
if [ -f "$SERVICE_FILE" ]; then
  info "删除 systemd 服务文件..."
  sudo rm -f "$SERVICE_FILE"
  sudo systemctl daemon-reload 2>/dev/null || true
  ok "已删除 ${SERVICE_FILE}"
fi

# ── 6. Remove installation directory ──
if [ -n "$APP_DIR" ]; then
  info "删除程序文件..."
  rm -rf "$APP_DIR"
  ok "已删除 ${APP_DIR}"
fi

# ── 7. Clean npm global cache ──
info "清理 npm 缓存..."
npm cache clean --force 2>/dev/null || true
ok "npm 缓存已清理"

echo ""
echo -e "  ${GREEN}${BOLD}✓ 卸载完成${NC}"
echo ""
echo -e "  ${YELLOW}📋 浏览器数据需手动清除：${NC}"
echo -e "  F12 → Application → Storage → Clear site data"
echo ""
