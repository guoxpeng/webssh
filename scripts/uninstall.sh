#!/usr/bin/env bash
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'; BOLD='\033[1m'
info()  { echo -e "  ${CYAN}[..]${NC} $1"; }
ok()    { echo -e "  ${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "  ${YELLOW}[!!]${NC} $1"; }
die()   { echo -e "  ${RED}[ER]${NC} $1"; exit 1; }

echo ""
echo -e "  ${BOLD}${RED}╔══════════════════════════════════════╗${NC}"
echo -e "  ${BOLD}${RED}║        WebSSH · 完整卸载              ║${NC}"
echo -e "  ${BOLD}${RED}╚══════════════════════════════════════╝${NC}"
echo ""

PORT="${PORT:-9627}"

# ── Find all installed directories (common locations + by PID) ──
declare -a FOUND_DIRS=()
SEARCH_PATHS=(
  "$(pwd)"
  "$(pwd)/webssh"
  "$HOME/webssh"
  "/root/webssh"
  "/opt/webssh"
  "/var/www/webssh"
  "/srv/webssh"
  "/usr/local/webssh"
  "/usr/local/lib/webssh"
)

# Find directory from running process
for pid in $(lsof -ti :"${PORT}" 2>/dev/null || true) $(pgrep -f "node.*[s]erver/index.mjs" 2>/dev/null || true); do
  [ -z "$pid" ] && continue
  cwd=$(ls -la "/proc/$pid/cwd" 2>/dev/null | awk '{print $NF}' || true)
  [ -n "$cwd" ] && SEARCH_PATHS+=("$cwd")
done

for d in "${SEARCH_PATHS[@]}"; do
  [ -d "$d" ] && [ -f "$d/core/server/index.mjs" -o -f "$d/package.json" ] && FOUND_DIRS+=("$d")
done

# Deduplicate
declare -a UNIQ=()
for d in "${FOUND_DIRS[@]}"; do
  skip=
  for u in "${UNIQ[@]}"; do [ "$u" = "$d" ] && { skip=1; break; }; done
  [ -z "$skip" ] && UNIQ+=("$d")
done
FOUND_DIRS=("${UNIQ[@]}")

# ── Find running processes ──
declare -a PROCS=()
if command -v lsof >/dev/null 2>&1; then
  while IFS= read -r pid; do
    [ -n "$pid" ] && PROCS+=("$pid")
  done < <(lsof -ti :"${PORT}" 2>/dev/null || true)
fi
while IFS= read -r line; do
  [ -n "$line" ] && PROCS+=("$line")
done < <(pgrep -f "node.*[s]erver/index.mjs" 2>/dev/null || true)

# ── Find systemd service ──
SERVICE_FILE=""
[ -f "/etc/systemd/system/webssh.service" ] && SERVICE_FILE="/etc/systemd/system/webssh.service"

# ── Find PM2 process (if used) ──
PM2_NAME=""
if command -v pm2 >/dev/null 2>&1; then
  PM2_NAME=$(pm2 id webssh 2>/dev/null | grep -oP '\d+' || true)
fi

# ── Summarize what will be removed ──
echo -e "  ${YELLOW}发现以下内容将被删除:${NC}"
echo ""
[ ${#FOUND_DIRS[@]} -gt 0 ] && for d in "${FOUND_DIRS[@]}"; do
  SIZE=$(du -sh "$d" 2>/dev/null | cut -f1 || echo "?")
  echo -e "    ${RED}📁${NC} 程序目录 ${CYAN}$d${NC} (${SIZE})"
done
[ ${#FOUND_DIRS[@]} -eq 0 ] && echo -e "    ${YELLOW}⚠${NC} 未找到程序目录"
echo ""
[ -n "$SERVICE_FILE" ] && echo -e "    ${RED}⚙${NC} systemd 服务 ${CYAN}$SERVICE_FILE${NC}"
[ ${#PROCS[@]} -gt 0 ] && echo -e "    ${RED}⚡${NC} 运行中进程: PID ${PROCS[*]}"
[ -n "$PM2_NAME" ] && echo -e "    ${RED}📊${NC} PM2 进程: webssh (id ${PM2_NAME})"
echo -e "    ${RED}🗑${NC} systemd 服务文件 (若有)"
echo ""

# ── Confirm ──
read -p "  确认卸载以上所有内容？(y/N) " CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo -e "  ${CYAN}已取消${NC}"; exit 0; }
echo ""

if [ ${#FOUND_DIRS[@]} -eq 0 ] && [ -z "$SERVICE_FILE" ] && [ ${#PROCS[@]} -eq 0 ] && [ -z "$PM2_NAME" ]; then
  warn "未找到 webssh 相关文件或进程"
  echo "  如果需要手动清理:"
  echo "    rm -rf /opt/webssh ~/webssh /root/webssh"
  echo "    sudo rm -f /etc/systemd/system/webssh.service"
  exit 0
fi

# ── 1. Stop systemd service ──
if [ -n "$SERVICE_FILE" ] && command -v systemctl >/dev/null 2>&1; then
  info "停止 systemd 服务..."
  sudo systemctl stop webssh 2>/dev/null || true
  sudo systemctl disable webssh 2>/dev/null || true
  ok "systemd 服务已停止"
fi

# ── 2. Stop PM2 ──
if [ -n "$PM2_NAME" ] && command -v pm2 >/dev/null 2>&1; then
  info "停止 PM2 进程..."
  pm2 stop webssh 2>/dev/null || true
  pm2 delete webssh 2>/dev/null || true
  ok "PM2 进程已停止"
fi

# ── 3. Kill processes ──
if [ ${#PROCS[@]} -gt 0 ]; then
  info "终止进程..."
  for pid in "${PROCS[@]}"; do
    kill -9 "$pid" 2>/dev/null || true
  done
  sleep 1
  ok "进程已终止"
fi

# Fallback: fuser on port
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" 2>/dev/null || true
  sleep 1
fi

# ── 4. Remove PID files ──
for d in "${FOUND_DIRS[@]}"; do
  rm -f "$d/webssh.pid"
done

# ── 5. Remove installation directories ──
if [ ${#FOUND_DIRS[@]} -gt 0 ]; then
  info "删除程序文件..."
  for d in "${FOUND_DIRS[@]}"; do
    rm -rf "$d"
    ok "已删除 ${d}"
  done
fi

# ── 6. Remove systemd service file ──
if [ -n "$SERVICE_FILE" ]; then
  info "删除 systemd 服务文件..."
  sudo rm -f "$SERVICE_FILE"
  sudo systemctl daemon-reload 2>/dev/null || true
  ok "已删除 ${SERVICE_FILE}"
fi

# ── 7. Kill remaining zombie node processes ──
REMAINING=$(lsof -ti :"${PORT}" 2>/dev/null || true)
[ -n "$REMAINING" ] && kill -9 $REMAINING 2>/dev/null || true

echo ""
echo -e "  ${GREEN}${BOLD}✓ 卸载完成${NC}"
echo ""
echo -e "  ${YELLOW}📋 浏览器数据需手动清除：${NC}"
echo -e "  F12 → Application → Storage → Clear site data (或清除站点 cookie)"
echo ""
