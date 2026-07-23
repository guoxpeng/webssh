#!/usr/bin/env bash
set -e

# WebSSH - Uninstall
# Usage: curl -fsSL https://raw.githubusercontent.com/guoxpeng/webssh/main/uninstall.sh | bash

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'; BOLD='\033[1m'
info()  { echo -e "  ${CYAN}[..]${NC} $1"; }
ok()    { echo -e "  ${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "  ${YELLOW}[!!]${NC} $1"; }

echo ""
echo -e "  ${BOLD}${RED}╔══════════════════════════════════════╗${NC}"
echo -e "  ${BOLD}${RED}║        WebSSH · 卸载清理              ║${NC}"
echo -e "  ${BOLD}${RED}╚══════════════════════════════════════╝${NC}"
echo ""

PORT="${PORT:-9627}"

# Find the webssh directory
APP_DIR=""
for d in "$(pwd)/webssh" "$HOME/webssh" "/root/webssh" "/opt/webssh"; do
  if [ -f "$d/webssh.pid" ] || [ -f "$d/server/index.mjs" ]; then
    APP_DIR="$d"
    break
  fi
done

if [ -z "$APP_DIR" ]; then
  warn "未找到 webssh 安装目录。请手动删除。"
  echo ""
  echo "  查找方法: find / -name 'webssh.pid' 2>/dev/null"
  exit 0
fi

echo -e "  ${YELLOW}⚠ 找到安装目录: ${APP_DIR}${NC}"
echo -e "      • 程序文件（整个 webssh 目录）"
echo -e "      • 运行中的进程（端口 ${PORT}）"
echo -e "      • 本地数据（data 目录）"
echo ""

read -p "  确认卸载？(y/N) " CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo -e "  ${CYAN}已取消${NC}"; exit 0; }
echo ""

# 1. Kill process on port
info "停止进程 (端口 ${PORT})..."
if command -v lsof >/dev/null 2>&1; then
  PORT_PID=$(lsof -ti :"${PORT}" 2>/dev/null || true)
  if [ -n "$PORT_PID" ]; then
    kill -9 $PORT_PID 2>/dev/null || true
    ok "已终止 PID $PORT_PID"
  fi
fi

# 2. Kill by PID file
PID_FILE="${APP_DIR}/webssh.pid"
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || true)
  kill "$OLD_PID" 2>/dev/null || true
  sleep 1
  kill -9 "$OLD_PID" 2>/dev/null || true
  ok "已终止 PID 文件进程"
fi

# 3. Kill by process name
pkill -f "node.*server/index.mjs" 2>/dev/null || true
sleep 1

# 4. Remove the directory
info "删除程序文件..."
rm -rf "$APP_DIR"
ok "已删除 ${APP_DIR}"

echo ""
echo -e "  ${GREEN}${BOLD}✓ 卸载完成${NC}"
echo ""
echo -e "  ${YELLOW}📋 浏览器数据需手动清除：${NC}"
echo -e "  F12 → Application → Storage → Clear site data"
echo ""
