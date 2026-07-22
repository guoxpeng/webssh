#!/usr/bin/env bash
set -e

# HaoSSH - One-click Deploy
# Usage: curl -fsSL https://raw.githubusercontent.com/guoxpeng/webssh/main/deploy.sh | bash

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info() { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
err()  { echo -e "${RED}[ERR]${NC} $1"; exit 1; }

# --- Check prerequisites ---
command -v node >/dev/null 2>&1 || err "Node.js is required. Install from https://nodejs.org"
command -v npm  >/dev/null 2>&1 || err "npm is required."

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
[ "$NODE_VER" -ge 18 ] || err "Node.js >= 18 required (current: $(node -v))"

# --- Clone or pull ---
REPO="https://github.com/guoxpeng/webssh.git"
DIR="webssh"

if [ -d "$DIR" ]; then
  info "Updating existing installation in $DIR..."
  cd "$DIR" && git pull
else
  info "Cloning repository..."
  git clone --depth=1 "$REPO" "$DIR"
  cd "$DIR"
fi

# --- Install dependencies ---
info "Installing dependencies..."
npm install

# --- Build frontend ---
info "Building frontend..."
npm run build

# --- Detect IP ---
IP=$(ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '127.0.0.1' | head -1)
[ -z "$IP" ] && IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -z "$IP" ] && IP="localhost"

# --- Start server ---
PORT="${PORT:-9627}"
echo ""
echo -e "  ${GREEN}✅ HaoSSH is running!${NC}"
echo -e "  ${CYAN}Local:   http://localhost:${PORT}${NC}"
echo -e "  ${CYAN}Network: http://${IP}:${PORT}${NC}"
echo -e "  ${CYAN}Stop:    Ctrl+C${NC}"
echo ""
echo -e "  ${GREEN}To run in background:${NC}"
echo -e "  cd $(pwd) && PORT=${PORT} nohup node server/index.mjs > webssh.log 2>&1 &"
echo ""
node server/index.mjs
