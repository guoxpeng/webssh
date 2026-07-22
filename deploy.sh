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
DIR="haossh"

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

# --- Start server ---
PORT="${PORT:-3000}"
info "Starting HaoSSH server on port $PORT..."
echo -e "\n  ${GREEN}✅ HaoSSH is running!${NC}"
echo -e "  ${CYAN}Local:   http://localhost:$PORT${NC}\n"
exec node server/index.mjs
