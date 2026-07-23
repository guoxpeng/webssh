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
echo -e "  ${BOLD}${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "  ${BOLD}${CYAN}║        WebSSH · 一键部署              ║${NC}"
echo -e "  ${BOLD}${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

BAR_WIDTH=28

progress() {
  local pct=$1 msg=$2
  local fill=$((pct * BAR_WIDTH / 100))
  local empty=$((BAR_WIDTH - fill))
  local s=""
  for ((i=0; i<fill; i++)); do s="${s}="; done
  for ((i=0; i<empty; i++)); do s="${s}-"; done
  printf "\r  ${YELLOW}[${GREEN}${s:0:fill}${NC}${s:fill:empty}${YELLOW}]${NC} %3d%%  %s" "$pct" "$msg"
}

# --- Phase 1: Check environment (5%) ---
progress 5 "Checking environment..."
command -v node >/dev/null 2>&1 || err "Node.js is required (https://nodejs.org)"
command -v npm  >/dev/null 2>&1 || err "npm is required."
NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
[ "$NODE_VER" -ge 18 ] || err "Node.js >= 18 required (current: $(node -v))"
progress 8 "Environment OK"

# --- Phase 2: Stop old instance (8% → 15%) ---
REPO="https://github.com/guoxpeng/webssh.git"
DIR="webssh"
PORT="${PORT:-9627}"

progress 10 "Stopping old instance..."
if [ -d "$DIR" ]; then
  cd "$DIR"
  PID_FILE="webssh.pid"
  if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE" 2>/dev/null || true)
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
    kill -9 "$OLD_PID" 2>/dev/null || true
    rm -f "$PID_FILE"
  fi
  # Kill any process on the target port
  PORT_PID=$(lsof -ti :"$PORT" 2>/dev/null || true)
  if [ -n "$PORT_PID" ]; then
    kill -9 $PORT_PID 2>/dev/null || true
    sleep 1
  fi
  # Kill any lingering node processes for this app
  pkill -f "node server/index.mjs" 2>/dev/null || true
  sleep 1
fi
progress 15 "Old instance stopped"

# --- Phase 3: Clone / Fetch (15% → 30%) ---
progress 18 "Fetching source..."
if [ -d "$DIR" ]; then
  cd "$DIR"
  # Verify git remote exists
  if ! git remote get-url origin >/dev/null 2>&1; then
    err "Git remote 'origin' not found. Remove '$DIR' directory and re-run."
  fi
  # Unshallow if previously cloned with --depth=1
  git fetch --unshallow origin 2>/dev/null || true
  # Fetch latest — fail loudly if it doesn't work
  info "Fetching latest commits..."
  if ! git fetch origin main 2>/dev/null; then
    err "Failed to fetch from GitHub. Check network and try again."
  fi
  OLD_HASH=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
  git reset --hard origin/main
  NEW_HASH=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
  git clean -fdx
  if [ "$OLD_HASH" != "$NEW_HASH" ]; then
    ok "Updated: ${OLD_HASH:0:7} → ${NEW_HASH:0:7}"
  else
    info "Already at latest: ${NEW_HASH:0:7}"
  fi
else
  git clone --depth=1 "$REPO" "$DIR" >/dev/null 2>&1
  cd "$DIR"
fi
# Verify we got the right version
GIT_VER=$(git log -1 --format='%h %s' 2>/dev/null || echo "unknown")
progress 25 "Source: ${GIT_VER:0:40}"
progress 30 "Source ready"

# --- Phase 4: Clear caches + npm install (30% → 60%) ---
progress 32 "Clearing build caches..."
rm -rf node_modules/.cache node_modules/.vite dist .nuxt .output 2>/dev/null || true
npm cache clean --force 2>/dev/null || true
progress 35 "Installing dependencies..."
npm install --no-audit --no-fund --prefer-offline 2>&1 | while IFS= read -r line; do
  if [[ "$line" =~ added|removed|changed ]]; then
    pkgs=$(echo "$line" | grep -oP '\d+')
    progress 45 "Packages: $pkgs"
  fi
done
progress 60 "Dependencies installed"

# --- Phase 5: Build frontend (60% → 85%) ---
progress 62 "Building frontend (no cache)..."
BUILD_OUT=$(npm run build 2>&1) || { echo -e "\n$BUILD_OUT" | tail -20; err "Build failed."; }
progress 85 "Build complete"

# --- Phase 6: Start server (85% → 100%) ---
progress 88 "Starting server..."

# Detect IP
IP=$(ip -4 addr show 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '127.0.0.1' | head -1)
[ -z "$IP" ] && IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -z "$IP" ] && IP="localhost"

# Detect public IP
PUBLIC_IP=""
PUBLIC_IP=$(curl -s --max-time 3 https://api.ipify.org 2>/dev/null || true)
[ -z "$PUBLIC_IP" ] && PUBLIC_IP=$(curl -s --max-time 3 https://checkip.amazonaws.com 2>/dev/null || true)
[ -z "$PUBLIC_IP" ] && PUBLIC_IP=$(curl -s --max-time 3 https://ifconfig.me/ip 2>/dev/null || true)

# Start in background
nohup env PORT="$PORT" node server/index.mjs > webssh.log 2>&1 &
echo $! > webssh.pid
sleep 3

# Verify it's running
HEALTH=$(curl -s --max-time 3 http://localhost:${PORT}/health 2>/dev/null || echo "")
if [ -n "$HEALTH" ]; then
  progress 100 "Done!"; echo ""
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
  echo -e "  📌 更新版本: ${GIT_VER}"
  echo -e ""
  echo -e "  ${YELLOW}管理命令:${NC}"
  echo -e "  停止:  kill \$(cat $(pwd)/webssh.pid)"
  echo -e "  更新:  cd $(pwd) && curl -fsSL https://raw.githubusercontent.com/guoxpeng/webssh/main/deploy.sh | bash"
  echo -e ""
  echo -e "  ${RED}⚠ 如页面显示旧版，请 Ctrl+Shift+R 清除浏览器缓存${NC}"
  echo ""
else
  err "Server failed to start. Check webssh.log"
fi
