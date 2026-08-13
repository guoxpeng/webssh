# WebSSH v3.0 — 浏览器里的全能 SSH 工作站

<p align="center">
  <a href="README.md">中文</a> | <a href="README_EN.md">English</a>
  &nbsp;·&nbsp; <img alt="CI" src="https://github.com/guoxpeng/webssh/actions/workflows/ci.yml/badge.svg">
</p>

一个开箱即用的 Web SSH 客户端：浏览器打开就能连服务器、管文件、跑批量命令，
支持 Windows / macOS 桌面端、Android / iOS App、Docker、Cloudflare 多种部署。

<img width="1214" alt="screenshot" src="https://github.com/user-attachments/assets/1a44d2b0-31df-41bd-a6ee-46a3e26e5a23" />

---

## ✨ 核心功能

| 功能 | 说明 |
|---|---|
| **SSH 终端** | 多标签、分屏、自动重连、断线恢复、主题配色、终端内搜索、移动端功能键栏 |
| **主机监控** | 连接后底部实时显示远程主机 CPU / 内存 / 负载 / 磁盘 / 网速 / 运行时长（免 agent） |
| **SFTP 文件管理** | 浏览、上传、下载、重命名、改权限、在线编辑文本文件 |
| **批量运维** | 宏 / 自动化：录制命令、多服务器批量执行、定时计划任务 |
| **收藏与历史** | 命令便签、历史命令自动记录、一键重发 |
| **加密备份** | 连接配置一键加密备份，跨设备（任意端）导入恢复 |
| **SSH 隧道** | 本地 / 远程 / SOCKS5 动态转发 |
| **MCP Agent** | 接入 Claude / Cursor 等 MCP 客户端，让 AI 列出服务器并执行命令 |
| **多协议** | SSH / Telnet / 串口；RDP / VNC 引导跳转（配 guacd） |
| **审计日志** | 连接与 AI 操作全程留痕，可过滤 / 导出 / 清空 |
| **中英文界面** | 完整双语，跟随浏览器自动切换 |

## 📱 客户端矩阵

| 端 | 形态 | 说明 |
|---|---|---|
| 网页版 | 任意浏览器 | 部署即用，支持 PWA 安装 |
| Windows | 便携 zip（免安装） | 内置服务，双击即用，托盘运行 |
| macOS | dmg / zip | Apple Silicon 与 Intel 均支持 |
| Android | APK（Capacitor） | 指向任意 webssh 服务器：设置 → 后端网关地址 |
| iOS | Xcode 打包（Capacitor） | 同上，已配好 ATS 与触屏适配 |
| Cloudflare | Workers / Pages | 公网免服务器部署（功能有裁剪，见下文） |

---

## 🚀 部署

### Docker（推荐自托管）

```bash
docker run -d --name webssh -p 9627:9627 --restart=unless-stopped \
  -e AUTH_TOKEN=你的密码 nameguoguo/webssh
```

Docker Compose：

```yaml
services:
  webssh:
    image: nameguoguo/webssh
    container_name: webssh
    restart: unless-stopped
    ports:
      - "9627:9627"
    environment:
      - AUTH_TOKEN=你的密码
```

如需 RDP/VNC 代理和 Docker 管理：

```yaml
services:
  webssh:
    image: nameguoguo/webssh
    restart: unless-stopped
    ports:
      - "9627:9627"
    environment:
      - AUTH_TOKEN=你的密码
      - GUACD_HOST=guacd
      - DOCKER_SOCKET=/var/run/docker.sock
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
  guacd:
    image: guacamole/guacd
    restart: unless-stopped
```

### 一键 Linux 部署

```bash
curl -fsSL https://raw.githubusercontent.com/guoxpeng/webssh/main/scripts/deploy.sh | bash
```

### 手动部署

```bash
git clone https://github.com/guoxpeng/webssh.git
cd webssh && npm install && npm run build
AUTH_TOKEN=你的密码 node core/server/index.mjs
```

浏览器访问 `http://localhost:9627`

### Windows 桌面端

Windows 10+ 64 位，免安装运行时。下载便携版 zip → 解压 → 运行 `WebSSH.exe`；
自行构建：`npm run desktop`。

### macOS 桌面端

macOS 11+，Apple Silicon 与 Intel 均支持。在 Mac 上执行：

```bash
npm run desktop:mac
```

产物在 `release/`（arm64 / x64 的 dmg 与 zip）。未签名构建首次打开：
右键 WebSSH.app → 打开，或 `xattr -dr com.apple.quarantine /Applications/WebSSH.app`。
如需分发，在 `win/package.json` 的 `mac` 段配置开发者证书后重新构建。

### Cloudflare Pages（公网免服务器）

> ⚠ **公网部署必须设置 `AUTH_TOKEN`**；且仅支持连**公网**服务器。

1. Fork 本仓库到你的 GitHub。
2. Cloudflare Dashboard → R2 → 创建存储桶 `webssh-backups`（备份功能需要）。
3. Workers 和 Pages → 创建 → Pages → 连接该仓库：
   - 构建命令：`npm run build && node core/build-worker.mjs`
   - 构建输出：`dist/client`
   - 环境变量：`AUTH_TOKEN=你的密码`
4. （可选）Settings → Functions → R2 bucket bindings → 变量名 `BACKUP_BUCKET` 绑定上述桶，重新部署。

**CF 已知限制**：仅 RSA 主机密钥 · 仅 CTR/CBC 加密（无 AES-GCM）· 不支持内网地址 · WebSocket 30 秒心跳保活。

---

## 🔑 密码体系（一图看懂）

| 密码 | 作用 | 设置位置 |
|---|---|---|
| **主密码（初始密码）** | 解锁应用；加密本机凭据；备份加密默认用它 | 首次启动设置；设置 → 修改初始密码 |
| **AUTH_TOKEN（后端令牌）** | 服务端接口 / WebSocket 鉴权，公网部署必填 | 部署时环境变量；客户端填在设置 → 后端 AUTH_TOKEN |
| **备份密码** | 加密备份文件；默认 = 主密码，也可自定义 | 创建备份时选择 |

- **局域网场景**（exe / mac / Docker / 手机）：备份默认用主密码加密，
  任意设备恢复时输入同一主密码即可，备份文件泄露也无法读取。
- **公网场景**（Linux / CF）：AUTH_TOKEN 即"后台登录密码"。
  建议把主密码设成与 AUTH_TOKEN 相同，登录、备份恢复只用记一个密码。
- 备份文件全端通用：任意端导出 → 任意端导入恢复。

## 📲 手机连接内网服务器

1. 在电脑 / NAS 上跑起 webssh（Docker 或桌面端）；
2. 桌面端打开设置 → 「后端网关地址」区块会列出**本服务的局域网地址**，点击复制；
3. 手机 App 设置 → 后端网关地址粘贴该地址、填入 AUTH_TOKEN，保存即连。

## 🤖 MCP Agent 接入

设置 → MCP 连接 提供现成配置片段，复制到 Claude Desktop / Claude Code / Cursor：

```json
{
  "mcpServers": {
    "webssh": {
      "command": "node",
      "args": ["webssh/core/mcp/server.mjs"],
      "env": { "WEBSSH_URL": "http://127.0.0.1:9627", "WEBSSH_TOKEN": "你的AUTH_TOKEN" }
    }
  }
}
```

Agent 可用工具：列服务器、探测连通性、执行命令、增删服务器。详见 [MCP.md](MCP.md)。

---

## 快速上手

1. 打开页面先设置**主密码**（加密保存所有凭据，不会上传任何服务器）。
2. 填写服务器名称 / IP / 用户名 / 密码（或私钥），点连接。
3. 保存服务器配置，下次一键直连；拖拽分组、右键管理。
4. 终端底部监控条实时显示主机资源；SFTP 页签直接管文件。
5. 录制宏 → 批量在多台服务器执行，可定时。

## 🧑‍💻 开发

```bash
npm install
npm run dev:all        # 后端 :9627 + 前端热更新 :5173
npm test               # 前端 + 服务端测试
npm run typecheck      # 类型检查
npm run worker:build   # CF worker 构建
```

**技术栈**：Node.js（http + ws + ssh2，无框架）· Vue 3 + Pinia + Bulma + xterm.js ·
Electron（Win/mac）· Capacitor（Android/iOS）· Cloudflare Workers（独立实现）

## 📄 其他文档

[SECURITY.md](SECURITY.md) 安全模型 · [ARCHITECTURE.md](ARCHITECTURE.md) 架构 ·
[MCP.md](MCP.md) MCP 接入 · [CHANGELOG.md](CHANGELOG.md) 版本历史

---

[AGPL-3.0 License](LICENSE) — 使用请遵守 GNU Affero General Public License v3.0。

> **安全说明：** WebSSH 默认假设运行于内网/VPN 环境。公网部署必须配置 `AUTH_TOKEN` + HTTPS。
> 审计日志不包含任何密码、密钥或会话数据。
