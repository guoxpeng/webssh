#!/usr/bin/env bash
set -e

# WebSSH - One-click Deploy (v2.2.5)
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

# ─── Phase 1: Check environment ───
progress 5 "Checking environment..."
command -v node >/dev/null 2>&1 || err "Node.js is required (https://nodejs.org)"
command -v npm  >/dev/null 2>&1 || err "npm is required."
command -v git  >/dev/null 2>&1 || err "git is required."
NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
[ "$NODE_VER" -ge 18 ] || err "Node.js >= 18 required (current: $(node -v))"
progress 8 "Environment OK"

# ─── Absolute paths (root cause fix: no relative-path bugs) ───
ORIG_DIR="$(pwd)"
REPO="https://github.com/guoxpeng/webssh.git"
APP_DIR="${ORIG_DIR}/webssh"
PORT="${PORT:-9627}"
PID_FILE="${APP_DIR}/webssh.pid"
LOG_FILE="${APP_DIR}/webssh.log"

progress 10 "Stopping old instance..."
# 1) fuser — most reliable, works across users on Linux
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" 2>/dev/null || true
  sleep 1
fi
# 2) lsof fallback
if command -v lsof >/dev/null 2>&1; then
  PORT_PID=$(lsof -ti :"${PORT}" 2>/dev/null || true)
  if [ -n "$PORT_PID" ]; then
    kill -9 $PORT_PID 2>/dev/null || true
    info "Killed process on port ${PORT} (PID $PORT_PID)"
  fi
fi
# 3) PID file
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || true)
  kill "$OLD_PID" 2>/dev/null || true
  sleep 1
  kill -9 "$OLD_PID" 2>/dev/null || true
  rm -f "$PID_FILE"
fi
# 4) pkill by process name
pkill -f "node.*server/index.mjs" 2>/dev/null || true
sleep 2

# 5) Final check — if port still occupied, print owner and bail
PORT_OWNER=$(lsof -ti :"${PORT}" 2>/dev/null | head -1 || true)
if [ -n "$PORT_OWNER" ]; then
  OWNER_USER=$(ps -o user= -p "$PORT_OWNER" 2>/dev/null || echo "unknown")
  echo ""
  echo -e "  ${RED}端口 ${PORT} 被 ${OWNER_USER} 用户 (PID ${PORT_OWNER}) 占用，无法释放${NC}"
  echo -e "  ${YELLOW}请手动执行: sudo kill -9 ${PORT_OWNER}${NC}"
  echo ""
  exit 1
fi
progress 15 "Old instance stopped"

# ─── Phase 2: Clone or update ───
progress 18 "Fetching source..."
if [ -d "${APP_DIR}/.git" ]; then
  cd "$APP_DIR"
  # Fetch deeper history — shallow clones can't always see new commits
  info "Fetching latest commits..."
  if ! git fetch --depth=10 origin main 2>/dev/null; then
    err "Failed to fetch from GitHub. Check network."
  fi
  OLD_HASH=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
  git reset --hard origin/main
  NEW_HASH=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
  git clean -fdx
  # Read version from source (before build)
  SRC_VER=$(grep -oP "APP_VERSION\s*=\s*'\K[^']+" src/layouts/WorkbenchLayout.vue 2>/dev/null || echo "unknown")
  if [ "$OLD_HASH" = "$NEW_HASH" ] && [ "$SRC_VER" != "unknown" ]; then
    info "Already at latest: ${NEW_HASH:0:7} (v${SRC_VER})"
  elif [ "$SRC_VER" = "unknown" ]; then
    err "Source file corrupted. Remove ${APP_DIR} and re-run."
  else
    ok "Updated: ${OLD_HASH:0:7} → ${NEW_HASH:0:7} (v${SRC_VER})"
  fi
else
  info "First install — cloning repository..."
  rm -rf "$APP_DIR"
  git clone --depth=1 "$REPO" "$APP_DIR"
  cd "$APP_DIR"
  NEW_HASH=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
  SRC_VER=$(grep -oP "APP_VERSION\s*=\s*'\K[^']+" src/layouts/WorkbenchLayout.vue 2>/dev/null || echo "unknown")
  ok "Cloned: ${NEW_HASH:0:7} (v${SRC_VER})"
fi
progress 30 "Source ready (${NEW_HASH:0:7})"

# ─── Phase 3: npm install ───
progress 35 "Clearing caches..."
rm -rf node_modules/.cache node_modules/.vite dist 2>/dev/null || true
npm cache clean --force 2>/dev/null || true
progress 40 "Installing dependencies..."
npm install --no-audit --no-fund 2>&1 | tail -3
progress 60 "Dependencies installed"

# ─── Phase 4: Build ───
progress 65 "Building frontend (v${SRC_VER})..."
BUILD_OUT=$(npm run build 2>&1) || { echo -e "\n$BUILD_OUT" | tail -20; err "Build failed."; }
progress 85 "Build complete"

# ─── Phase 5: Start server ───
progress 90 "Starting server..."
IP=$(ip -4 addr show 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '127.0.0.1' | head -1)
[ -z "$IP" ] && IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -z "$IP" ] && IP="localhost"

PUBLIC_IP=$(curl -s --max-time 3 https://api.ipify.org 2>/dev/null || true)
[ -z "$PUBLIC_IP" ] && PUBLIC_IP=$(curl -s --max-time 3 https://checkip.amazonaws.com 2>/dev/null || true)

USE_SYSTEMD=false
if command -v systemctl >/dev/null 2>&1; then
  SERVICE_FILE="/etc/systemd/system/webssh.service"
  # Always update service file with current paths
  sudo tee "$SERVICE_FILE" > /dev/null << SERVICE_EOF
[Unit]
Description=WebSSH Server
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
ExecStart=${APP_DIR}/node_modules/.bin/node 2>/dev/null || echo node ${APP_DIR}/server/index.mjs
ExecStart=$(command -v node) ${APP_DIR}/server/index.mjs
Restart=always
RestartSec=5
Environment=PORT=${PORT}

[Install]
WantedBy=multi-user.target
SERVICE_EOF
  sudo systemctl daemon-reload
  sudo systemctl enable webssh 2>/dev/null || true
  sudo systemctl restart webssh 2>/dev/null && USE_SYSTEMD=true
fi

if [ "$USE_SYSTEMD" = true ]; then
  sleep 2
else
  nohup env PORT="$PORT" node server/index.mjs > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  sleep 3
fi

# Verify startup
HEALTH=$(curl -s --max-time 3 "http://localhost:${PORT}/health" 2>/dev/null || echo "")
if [ -n "$HEALTH" ]; then
  progress 100 "Done!"; echo ""
  echo ""
  echo -e "  ${BOLD}${GREEN}  ✓ WebSSH 已启动${NC}"
  echo -e "  ═══════════════════════════════════"
  echo -e ""
  echo -e "  📌 ${BOLD}版本: v${SRC_VER}${NC} (${NEW_HASH:0:7})"
  echo -e "  📝 日志: ${LOG_FILE}"
  echo -e ""
  echo -e "  ${BOLD}🔗 本地:${NC}  ${GREEN}http://localhost:${PORT}${NC}"
  [ "$IP" != "localhost" ] && [ -n "$IP" ] && echo -e "  ${BOLD}📱 局域网:${NC} ${CYAN}http://${IP}:${PORT}${NC}"
  [ -n "$PUBLIC_IP" ] && echo -e "  ${BOLD}🌍 公网:${NC}   ${YELLOW}http://${PUBLIC_IP}:${PORT}${NC}"
  echo ""
  echo -e "  ${YELLOW}管理命令:${NC}"
  if [ "$USE_SYSTEMD" = true ]; then
    echo -e "  状态: sudo systemctl status webssh"
    echo -e "  停止: sudo systemctl stop webssh"
    echo -e "  日志: sudo journalctl -u webssh -f"
  else
    echo -e "  停止: kill \$(cat ${PID_FILE})"
  fi
  echo -e "  更新: curl -fsSL https://raw.githubusercontent.com/guoxpeng/webssh/main/deploy.sh | bash"
  echo ""
else
  echo ""
  echo -e "  ${RED}✗ Server failed to start${NC}"
  echo -e "  Check log: cat ${LOG_FILE}"
  echo ""
  tail -20 "$LOG_FILE"
  exit 1
fi
