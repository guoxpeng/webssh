# WebSSH

基于 Web 的多协议远程连接管理工具。SSH / Telnet / Serial / VNC / RDP，浏览器打开即用，无需安装客户端。

## 特性

- **协议**：SSH / Telnet / Serial（串口）/ VNC / RDP
- **终端**：xterm.js，支持 Ctrl+F 搜索、字体/光标/闪烁自定义、多标签、拖拽排序、标签着色
- **SFTP 文件管理**：远程浏览、上传、下载、内联编辑（双击直接改）、拖拽上传
- **宏录制与自动化**：录制操作 → 回放 → 批量多台执行 → 定时任务（每小时/每天/每周）
- **SSH 隧道**：本地转发、远程转发、动态转发（SOCKS 代理）
- **Docker 管理**：查看容器列表、启动/停止/重启、查看日志
- **命令片段**：收藏常用命令，一键发送到终端，支持拖拽排序
- **分组管理**：拖拽分组、置顶收藏、右键操作、折叠状态持久化
- **加密备份**：AES-256-GCM 加密配置导出/导入，自动备份 + WebDAV 云同步
- **PWA**：可安装到桌面（Chrome / Edge），离线缓存，类原生体验
- **macOS 菜单栏 App**：菜单栏显示服务器列表，一键连接
- **主题**：浅色 / 深色 / Dracula / Nord，终端独立配色
- **国际化**：中英文一键切换
- **手机适配**：触控按键、双指缩放、响应式布局
- **安全**：主密码保护，密码 AES-256 加密存储，备份 SHA-256 指纹校验

## 快速开始

```bash
git clone https://github.com/guoxpeng/webssh.git
cd webssh
npm install
npm run build
node server/index.mjs
```

浏览器打开 `http://localhost:9627`

### Docker

```bash
docker run -d --restart=unless-stopped --name webssh -p 9627:9627 \
  node:20-alpine sh -c "apk add git openssh && \
  git clone --depth=1 https://github.com/guoxpeng/webssh.git /app && \
  cd /app && npm install && npm run build && node server/index.mjs"
```

### 一键脚本

```bash
curl -fsSL https://raw.githubusercontent.com/guoxpeng/webssh/main/deploy.sh | bash
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `9627` | HTTP 服务端口 |
| `WS_PATH` | `/ws/ssh` | WebSocket 路径 |

## 技术栈

Vue 3 / xterm.js / WebSocket / ssh2 / AES-256-GCM / Bulma / Vite / Pinia / Capacitor
