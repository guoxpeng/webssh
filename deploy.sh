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
sleep 0.3

# --- Phase 2: Clone / Pull (15%) ---
REPO="https://github.com/guoxpeng/webssh.git"
DIR="webssh"
PORT="${PORT:-9627}"

echo -e "  ${YELLOW}[██▌········] 15%${NC}  Fetching source..."
if [ -d "$DIR" ]; then
  cd "$DIR"
  git checkout -- . 2>/dev/null || true
  git clean -fd 2>/dev/null || true
  git pull --quiet 2>&1 | tail -1
else
  git clone --depth=1 --quiet "$REPO" "$DIR" 2>&1 | tail -1
  cd "$DIR"
fi
sleep 0.3

# --- Phase 3: npm install (30% → 60%) ---
echo -e "  ${YELLOW}[█████·····] 30%${NC}  Installing dependencies (this may take a minute)..."
npm install --silent --no-audit --no-fund 2>&1 | grep -v '^$' | tail -1
sleep 0.3
echo -e "  ${YELLOW}[████████··] 60%${NC}  Dependencies installed."

# --- Phase 4: Build frontend (65% → 85%) ---
echo -e "  ${YELLOW}[████████▌·] 65%${NC}  Building frontend..."
npm run build --silent 2>&1 | tail -1
sleep 0.3
echo -e "  ${YELLOW}[█████████·] 85%${NC}  Build complete."

# --- Phase 5: Start server (90% → 100%) ---
echo -e "  ${YELLOW}[█████████▌] 90%${NC}  Starting server..."

# Kill existing instance if any
PID_FILE="$DIR/webssh.pid"
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  kill "$OLD_PID" 2>/dev/null || true
  sleep 1
fi

# Detect IP
IP=$(ip -4 addr show 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '127.0.0.1' | head -1)
[ -z "$IP" ] && IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -z "$IP" ] && IP="localhost"

# Start in background
nohup node server/index.mjs > webssh.log 2>&1 &
echo $! > "$PID_FILE"
sleep 2

# Verify it's running
if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo -e "  ${GREEN}[██████████] 100%${NC} Done!"
  echo ""
  echo -e "  ${BOLD}${GREEN}  ✓ WebSSH is running${NC}"
  echo -e "  ─────────────────────"
  echo -e "  Local:   ${CYAN}http://localhost:${PORT}${NC}"
  if [ "$IP" != "localhost" ]; then
    echo -e "  Network: ${CYAN}http://${IP}:${PORT}${NC}"
  fi
  echo -e "  Log:     ${CYAN}$(pwd)/webssh.log${NC}"
  echo ""
  echo -e "  ${YELLOW}Commands:${NC}"
  echo -e "  stop:    kill \$(cat $(pwd)/webssh.pid)"
  echo -e "  update:  cd $(pwd) && curl -fsSL https://raw.githubusercontent.com/guoxpeng/webssh/main/deploy.sh | bash"
  echo ""
else
  err "Server failed to start. Check webssh.log"
fi
