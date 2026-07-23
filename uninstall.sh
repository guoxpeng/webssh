#!/usr/bin/env bash
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'; BOLD='\033[1m'

echo ""
echo -e "  ${BOLD}${RED}╔══════════════════════════════════════╗${NC}"
echo -e "  ${BOLD}${RED}║        WebSSH · 卸载清理              ║${NC}"
echo -e "  ${BOLD}${RED}╚══════════════════════════════════════╝${NC}"
echo ""

# Confirm
echo -e "  ${YELLOW}⚠ 将清除以下内容：${NC}"
echo -e "      • 程序文件（webssh 目录）"
echo -e "      • Node 模块（node_modules）"
echo -e "      • 本地存储数据（密码、配置、备份）"
echo -e "      • 进程（如果正在运行）"
echo ""
read -p "  确认卸载？(y/N) " CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo -e "  ${CYAN}已取消${NC}"; exit 0; }

DIR="$(cd "$(dirname "$0")" && pwd)"
echo ""

# Kill running process
PID_FILE="$DIR/webssh.pid"
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo -e "  ${YELLOW}[..]${NC} 停止运行中的进程 (PID: $OLD_PID)..."
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
  fi
  rm -f "$PID_FILE"
fi
# Also kill by process name
pkill -f "node server/index.mjs" 2>/dev/null || true
sleep 1
echo -e "  ${GREEN}[OK]${NC} 进程已停止"

# Remove dist
if [ -d "$DIR/dist" ]; then
  rm -rf "$DIR/dist"
  echo -e "  ${GREEN}[OK]${NC} 构建文件已删除 (dist/)"
fi

# Remove node_modules
if [ -d "$DIR/node_modules" ]; then
  rm -rf "$DIR/node_modules"
  echo -e "  ${GREEN}[OK]${NC} Node 模块已删除 (node_modules/)"
fi

# Remove program files (everything except uninstall.sh itself)
echo -e "  ${YELLOW}[..]${NC} 删除程序文件..."
for f in "$DIR"/*; do
  [ "$f" = "$0" ] || [ "$f" = "$DIR/uninstall.sh" ] && continue
  rm -rf "$f"
done
echo -e "  ${GREEN}[OK]${NC} 程序文件已删除"

# Remove local storage data (browser data hints)
echo ""
echo -e "  ${BOLD}${YELLOW}📋 浏览器数据清理指引${NC}"
echo -e "  ─────────────────────────────────────"
echo -e "  以下数据存储在浏览器中，需手动清除："
echo -e ""
echo -e "  ① 打开浏览器开发者工具 (F12)"
echo -e "  ② Application → Storage → Clear site data"
echo -e "  ③ 或清除该站点所有 cookies 和缓存"
echo -e ""
echo -e "  需要清除的 Key："
echo -e "    • appTheme / appThemePreset"
echo -e "    • webssh_terminal_layout"
echo -e "    • sshWebAppConnections_configs"
echo -e "    • sshWebAppCred_*"
echo -e "    • webssh_*"
echo ""

if [ -d "$DIR" ]; then
  rmdir "$DIR" 2>/dev/null || true
fi

echo -e "  ${GREEN}${BOLD}✓ 卸载完成${NC}"
echo ""