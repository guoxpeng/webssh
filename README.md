# WebSSH v3.5 — 浏览器里的全能 SSH 工作站

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
| **多协议** | SSH / Telnet / 串口；RDP / VNC 远程桌面（自建服务器启用 guacd 后，网页内直接显示画面） |
| **审计日志** | 连接与 AI 操作全程留痕，可过滤 / 导出 / 清空 |
| **中英文界面** | 完整双语，跟随浏览器自动切换 |

## 📱 客户端矩阵

| 端 | 形态 | 说明 |
|---|---|---|
| 网页版 | 任意浏览器 | 部署即用，支持 PWA 安装 |
| Windows | 便携 zip（免安装） | 内置服务，双击即用，托盘运行 |
| macOS | dmg / zip | Apple Silicon 与 Intel 均支持 |
| Android | APK（Capacitor） | 指向任意 webssh 服务器：设置 → 后端网关地址 |
| iOS | Xcode 打包（Capacitor） | 同上，已配好 ATS 与触屏适配；签名与上架见 `IOS-SIGNING.md` |
| Cloudflare | Workers / Pages | 公网免服务器部署（功能有裁剪，见下文） |

---

## 🚀 部署

### 1. Docker（推荐自托管）

**步骤：**

1. 运行容器（需先设置 `AUTH_TOKEN` 为你的访问密码）：

```bash
docker run -d --name webssh -p 9627:9627 --restart=unless-stopped \
  -e AUTH_TOKEN=你的密码 nameguoguo/webssh
```

2. （可选）用 Docker Compose 管理：

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

3. （可选）如需 RDP/VNC 远程桌面和 Docker 管理，加上 `guacd` 服务：

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

4. 浏览器访问 `http://localhost:9627`。

> 🖥️ **启用 RDP / VNC 远程桌面**：使用上面带 `guacd` 服务的 compose 配置
> （`GUACD_HOST` 指向 guacd 容器），启动后在新建连接时选择 RDP 或 VNC 协议，
> 画面直接在网页里显示（键盘 / 鼠标 / 触屏可用）。Cloudflare 部署无 guacd，
> 选择这两个协议时会收到明确提示。

### 2. 一键 Linux 部署

**步骤：**

1. 执行脚本：

```bash
curl -fsSL https://raw.githubusercontent.com/guoxpeng/webssh/main/scripts/deploy.sh | bash
```

2. 脚本会安装依赖、启动服务并自动生成访问密码（详见「密码体系」）。

### 3. 手动部署

**步骤：**

1. 拉取代码：

```bash
git clone https://github.com/guoxpeng/webssh.git
```

2. 安装依赖并构建前端：

```bash
cd webssh && npm install && npm run build
```

3. 启动服务（公网部署必须固定访问密码）：

```bash
AUTH_TOKEN=你的密码 node core/server/index.mjs
```

4. 浏览器访问 `http://localhost:9627`。

> 💡 上面的 `AUTH_TOKEN=你的密码` 可以整行删掉——服务器会**自动生成一个临时
> 访问密码**并直接传给页面，浏览器打开即用。只有公网部署 / 手机远程连 / MCP
> 接入时才需要自己固定设一个（详见下文「密码体系」）。

### 4. GitHub Actions 自动构建（打 tag 即出全端安装包）

推送版本号标签后自动构建并附加到 GitHub Release，无需本地装任何环境。

**步骤：**

1. 提交代码并推送：

```bash
git add -A && git commit -m "release: v3.5.0"
```

2. 打版本标签并推送（触发全平台构建）：

```bash
git tag v3.5.0 && git push origin v3.5.0
```

3. 在 GitHub 仓库 Actions 页面查看「Build All Platforms」运行状态，构建完成后产物自动附加到对应的 **Release**。

自动产出：**Windows 便携版**（exe）· **macOS**（dmg + zip，arm64/x64）·
**Android APK**（debug 签名，直接安装）· **iOS 未签名构建包**（签名发布流程见 `IOS-SIGNING.md`）· Docker 镜像构建自检。
也可以在仓库 Actions 页面手动触发（Build All Platforms → Run workflow）。

### 5. Windows 桌面端

**步骤：**

1. 到 GitHub Release 下载便携版 zip。
2. 解压 → 运行 `WebSSH.exe`（Windows 10+ 64 位，免安装）。
3. 自行构建：`npm run desktop`。

### 6. macOS 桌面端

macOS 11+，Apple Silicon 与 Intel 均支持。在 Mac 上执行：

**步骤：**

1. 进入仓库目录，构建（需在 Mac 上执行）：

```bash
npm run desktop:mac
```

2. 产物在 `release/`（arm64 / x64 的 dmg 与 zip）。

3. 未签名构建首次打开：右键 WebSSH.app → 打开，或
   `xattr -dr com.apple.quarantine /Applications/WebSSH.app`。

4. 如需分发，在 `win/package.json` 的 `mac` 段配置开发者证书后重新构建。

### 7. Cloudflare Pages（公网免服务器）

> ⚠ **公网部署必须设置一个后端访问密码**（环境变量名 `AUTH_TOKEN`，自己随便定一个即可；未设置时所有接口直接拒绝服务）；且仅支持连**公网**服务器。

**步骤：**

1. Fork 本仓库到你的 GitHub。

2. Cloudflare Dashboard → R2 → 创建存储桶 `webssh-backups`（备份功能需要）。

3. Workers 和 Pages → 创建 → Pages → 连接该仓库：
   - 构建命令：`npm run build && node core/build-worker.mjs`
   - 构建输出：`dist/client`
   - 环境变量：`AUTH_TOKEN=你自己定的密码`（随手定一个、自己记住即可）

4. （可选）Settings → Functions → R2 bucket bindings → 变量名 `BACKUP_BUCKET` 绑定上述桶，重新部署。

5. （可选，MCP / 服务器注册表）Workers 和 Pages → KV → 创建命名空间，
   在 Settings → Functions → KV namespace bindings 以变量名 `MODEL_REGISTRY` 绑定后重新部署。
   之后即可在设置里开启「同步服务器到后端」，MCP 桥的 `WEBSSH_URL` 指向本部署地址。

6. **首次使用：在页面「设置」里填写访问密码**（关键！）

   Cloudflare 是纯静态构建，Worker 的 `AUTH_TOKEN` 只在云端运行时，**不会自动传给前端**。
   打开部署页面后，进入 **设置 → 后端访问密码**，填入与第 3 步相同的 `AUTH_TOKEN` 值并保存，
   否则 WebSocket 会因未认证被拒绝，连接服务器时提示 `WebSocket error`。
   （「后端地址」留空即可，因为是同源部署。）

   > 💡 若不想每次手动填，可在构建时把密码烘焙进前端：部署时给构建命令加环境变量
   > `VITE_AUTH_TOKEN=你的密码`，这样所有用户打开页面即自动携带访问密码。

   > ⚠ **`VITE_AUTH_TOKEN` 与 `AUTH_TOKEN` 必须同时设置，且值一模一样**——
   > 一个是锁，一个是钥匙：
   >
   > - **`AUTH_TOKEN`（服务端）= 锁**：Worker 运行时用它校验每个请求。
   > - **`VITE_AUTH_TOKEN`（前端）= 钥匙**：**构建时写进前端页面**，前端拿来开锁。
   >
   > 两者任一不一致，WebSocket 都会被拒绝。以后若改了 `AUTH_TOKEN`（换了锁），
   > 必须同步把 `VITE_AUTH_TOKEN` 改成一样的（配新钥匙），并且**重新部署**
   > 才会生效——因为 `VITE_AUTH_TOKEN` 是构建时写入的，只改环境变量、不重新
   > 部署，页面里仍是旧钥匙，照样连不上。

**CF 已知限制**：仅 RSA 主机密钥 · 仅 CTR/CBC 加密（无 AES-GCM）· 不支持内网地址 · WebSocket 30 秒心跳保活 · 注册表依赖 KV，未绑定时 `/api/model/*` 返回 503 · 不支持串口与 RDP/VNC 远程桌面（依赖 guacd，请用自建服务器版）。

---

## 🔑 密码体系（一图看懂）

| 密码 | 作用 | 设置位置 |
|---|---|---|
| **主密码（初始密码）** | 解锁应用；加密本机凭据；备份加密默认用它 | 首次启动设置；设置 → 修改初始密码 |
| **后端访问密码**（环境变量名 `AUTH_TOKEN`） | 访问后端接口的钥匙，公网部署必填 | 自己随便定一个密码写进部署配置；**不设也行**，见下方说明 |
| **备份密码** | 加密备份文件；默认 = 主密码，也可自定义 | 创建备份时选择 |

**后端访问密码要自己去哪找吗？不用，它就是你自己定的一个密码**，比如
`MyServer@2026`，写进部署命令/环境变量里即可（格式 `AUTH_TOKEN=你定的密码`）。

- **什么都不设也能用**：服务器启动时会自动生成一个临时密码并直接传给
  页面，浏览器打开即用，全程无感。缺点：每次重启会换一个新的。
- **什么时候必须自己设一个固定密码**：① 公网部署（必须）；② 手机 App /
  其他设备要远程连这台服务器；③ 使用 MCP 接入（Claude / Cursor 需要填它）。
- **客户端怎么填**：同一台机器的浏览器里不需要填（自动带上）；手机 App 等
  远程设备在 设置 → 后端访问密码 里填你部署时定的那个。

- **局域网场景**（exe / mac / Docker / 手机）：备份默认用主密码加密，
  任意设备恢复时输入同一主密码即可，备份文件泄露也无法读取。
- **公网场景**（Linux / CF）：后端访问密码就是"后台登录密码"。
  建议把主密码设成与它相同，登录、备份恢复只用记一个密码。
- 备份文件全端通用：任意端导出 → 任意端导入恢复。

## 📲 手机连接内网服务器

1. 在电脑 / NAS 上跑起 webssh（Docker 或桌面端）；
2. 桌面端打开设置 → 「后端网关地址」区块会列出**本服务的局域网地址**，点击复制；
3. 手机 App 设置 → 后端网关地址粘贴该地址、填入部署时定的**后端访问密码**，保存即连。

## 🤖 MCP Agent 接入

设置 → MCP 连接 提供现成配置片段，复制到 Claude Desktop / Claude Code / Cursor：

```json
{
  "mcpServers": {
    "webssh": {
      "command": "node",
      "args": ["webssh/core/mcp/server.mjs"],
      "env": { "WEBSSH_URL": "http://127.0.0.1:9627", "WEBSSH_TOKEN": "你部署时定的后端访问密码" }
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

> **安全说明：** WebSSH 默认假设运行于内网/VPN 环境。公网部署必须配置后端访问密码（环境变量 `AUTH_TOKEN`）+ HTTPS。
> 审计日志不包含任何密码、密钥或会话数据。
