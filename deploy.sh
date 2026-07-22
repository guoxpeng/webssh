#!/usr/bin/env bash
set -e

# WebSSH - One-click Deploy
# Usage: curl -fsSL https://raw.githubusercontent.com/guoxpeng/webssh/main/deploy.sh | bash

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'; BOLD='\033[1m'
info()  { echo -e "  ${CYAN}[..]${NC} $1"; }
ok()    { echo -e "  ${GREEN}[OK]${NC} $1"; }
err()   { echo -e "  ${RED}[ER]${NC} $1"; exit 1; }

clear
echo ""
echo -e "  ${BOLD}${CYAN}╔══════════════════════════════════╗${NC}"
echo -e "  ${BOLD}${CYAN}║      WebSSH - Quick Deploy       ║${NC}"
echo -e "  ${BOLD}${CYAN}╚══════════════════════════════════╝${NC}"
echo ""

# --- Phase 1: Check environment (5%) ---
echo -e "  ${YELLOW}[▌·········] 5%${NC}  Checking environment..."
command -v node >/dev/null 2>&1 || err "Node.js is required (https://nodejs.org)"
command -v npm  >/dev/null 2>&1 || err "npm is required."
NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
[ "$NODE_VER" -ge 18 ] || err "Node.js >= 18 required (current: $(node -v))"

# --- Phase 2: Clone / Pull (15%) ---
REPO="https://github.com/guoxpeng/webssh.git"
DIR="webssh"
PORT="${PORT:-9627}"

echo -e "  ${YELLOW}[██▌········] 15%${NC}  Fetching source..."
if [ -d "$DIR" ]; then
  cd "$DIR"
  git checkout -- . >/dev/null 2>&1 || true
  git clean -fd >/dev/null 2>&1 || true
  git pull --quiet >/dev/null 2>&1
else
  git clone --depth=1 --quiet "$REPO" "$DIR" >/dev/null 2>&1
  cd "$DIR"
fi

# --- Phase 3: npm install (30% → 55%) ---
echo -e "  ${YELLOW}[█████·····] 30%${NC}  Installing dependencies..."
npm install --no-audit --no-fund 2>&1 | tail -3
echo -e "  ${YELLOW}[███████···] 55%${NC}  Done."

# --- Phase 4: Build frontend (60% → 85%) ---
echo -e "  ${YELLOW}[████████▌·] 60%${NC}  Building frontend..."
BUILD_OUT=$(npm run build 2>&1) || { echo "$BUILD_OUT" | tail -20; err "Build failed."; }
echo -e "  ${YELLOW}[█████████·] 85%${NC}  Done."

# --- Phase 5: Start server (90% → 100%) ---
echo -e "  ${YELLOW}[█████████▌] 90%${NC}  Starting server..."

# Kill existing instance if any
PID_FILE="webssh.pid"
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  kill "$OLD_PID" 2>/dev/null || true
  sleep 1
fi

# Detect IP
IP=$(ip -4 addr show 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '127.0.0.1' | head -1)
[ -z "$IP" ] && IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -z "$IP" ] && IP="localhost"

# Detect public IP (show at end if found)
PUBLIC_IP=""
PUBLIC_IP=$(curl -s --max-time 3 https://api.ipify.org 2>/dev/null || true)
[ -z "$PUBLIC_IP" ] && PUBLIC_IP=$(curl -s --max-time 3 https://checkip.amazonaws.com 2>/dev/null || true)
[ -z "$PUBLIC_IP" ] && PUBLIC_IP=$(curl -s --max-time 3 https://ifconfig.me/ip 2>/dev/null || true)

# Start in background
nohup env PORT="$PORT" node server/index.mjs > webssh.log 2>&1 &
echo $! > "$PID_FILE"
sleep 2

# Verify it's running
sleep 2
HEALTH=$(curl -s --max-time 2 http://localhost:${PORT}/health 2>/dev/null || echo "")
if [ -n "$HEALTH" ]; then
  echo -e "  ${GREEN}[██████████] 100%${NC} Done!"
  echo ""
  echo -e "  ${BOLD}${GREEN}  ✓ WebSSH 已启动${NC}"
  echo -e "  ═══════════════════════════════════"
  echo -e ""
  echo -e "  ${BOLD}🔗 本地访问：${NC}"
  echo -e "      ${GREEN}${BOLD}http://localhost:${PORT}${NC}"
  echo -e ""
  if [ "$IP" != "localhost" ] && [ -n "$IP" ]; then
    echo -e "  ${BOLD}📱 局域网访问：${NC}"
    echo -e "      ${CYAN}http://${IP}:${PORT}${NC}"
    echo -e ""
  fi
  if [ -n "$PUBLIC_IP" ]; then
    echo -e "  ${BOLD}🌍 公网访问：${NC}"
    echo -e "      ${YELLOW}http://${PUBLIC_IP}:${PORT}${NC}"
    echo -e ""
  fi
  echo -e "  ═══════════════════════════════════"
  echo -e "  📝 日志文件: $(pwd)/webssh.log"
  echo -e ""
  echo -e "  ${YELLOW}管理命令:${NC}"
  echo -e "  停止:  kill \$(cat $(pwd)/webssh.pid)"
  echo -e "  更新:  cd $(pwd) && curl -fsSL https://raw.githubusercontent.com/guoxpeng/webssh/main/deploy.sh | bash"
  echo ""
else
  err "Server failed to start. Check webssh.log"
fi
