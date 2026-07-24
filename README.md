# 🚀 WebSSH v3.0 — 一个网页管所有服务器

<p align="center">
  <a href="README.md">中文</a> | <a href="README_EN.md">English</a>
</p>

---

## 🤔 这是什么？

你有很多台服务器要管？

- 以前：装各种客户端、记一堆 IP、切来切去手忙脚乱 😫
- 现在：**打开浏览器**，所有服务器列在页面上，**点一下就连上**，甚至不用输入密码！

---

## 🌟 我们有什么特别的？

| 功能 | 🏆 **WebSSH** | Termius | MobaXterm | PuTTY |
|------|:-----------:|:-------:|:---------:|:-----:|
| 免费无限制 | ✅ **完全免费** | ❌ 高级版收费 | ❌ 高级版有广告 | ✅ |
| 网页即用，无需安装 | ✅ **浏览器打开就用** | ❌ | ❌ | ❌ |
| 手机/平板/电脑通用 | ✅ **全平台** | 需安装 App | ❌ | ❌ |
| AES-256 加密存密码 | ✅ **军规加密** | ✅ | ❌ | ❌ |
| 主密码二次保护 | ✅ **双重加密** | ✅ | ✅ | ❌ |
| **文件管理独立登录** | ✅ **不连 SSH 也能传文件** | ❌ | ❌ | ❌ |
| **SFTP 内联编辑** | ✅ **双击直接改远程文件** | ❌ | ❌ | ❌ |
| **宏录制 + 批量 + 定时** | ✅ **一键给所有服务器装环境** | ❌ | ✅ | ❌ |
| **Docker 容器管理** | ✅ **网页看容器/启动/日志** 🐳 | ❌ | ❌ | ❌ |
| **代码便签置顶** | ✅ **常用命令拖拽排序** | ✅ | ❌ | ❌ |
| 串口/UART | ✅ **COM 口支持** | ✅ | ✅ | ❌ |
| SSH 隧道（3种） | ✅ **本地/远程/动态** | ✅ | ✅ | ✅ |
| **分组拖拽管理** | ✅ **右键菜单全操作** | ✅ | ❌ | ❌ |
| 多标签终端 | ✅ **拖拽排序+着色+重命名** | ✅ | ✅ | ❌ |
| **终端文字搜索** | ✅ **Ctrl+F 实时查** | ❌ | ✅ | ❌ |
| 4 套主题 | ✅ **一键切换** | ✅ | ✅ | ❌ |
| 中英文界面 | ✅ **国人友好** | ❌ | ❌ | ❌ |
| **PWA 安装桌面** | ✅ **像原生 App** | ❌ | ❌ | ❌ |
| **出错明确提示** | ✅ **检查IP / 核对密码** | ✅ | ❌ | ❌ |
| Cloudflare Workers | ✅ **全球加速部署** | ❌ | ❌ | ❌ |
| 加密备份+云同步 | ✅ **换电脑一键恢复** | ✅ | ❌ | ❌ |

---

## 🚀 快速开始

### Docker（最快）

```bash
docker run -d --name webssh -p 9627:9627 --restart=unless-stopped nameguoguo/webssh
```

或用 docker-compose：

```yaml
services:
  webssh:
    image: nameguoguo/webssh
    container_name: webssh
    restart: unless-stopped
    ports:
      - "9627:9627"
```

```bash
docker compose up -d
```

#### 高级 Docker 部署（RDP/VNC + 原生 Docker 管理）

```yaml
services:
  webssh:
    image: nameguoguo/webssh
    container_name: webssh
    restart: unless-stopped
    ports:
      - "9627:9627"
    environment:
      - GUACD_HOST=guacd
      - DOCKER_SOCKET=/var/run/docker.sock
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
  guacd:
    image: guacamole/guacd
    container_name: guacd
    restart: unless-stopped
```

### 一键脚本

```bash
curl -fsSL https://raw.githubusercontent.com/guoxpeng/webssh/main/scripts/deploy.sh | bash
```

### 手动安装

```bash
git clone https://github.com/guoxpeng/webssh.git
cd webssh && npm install && npm run build
node core/server/index.mjs
```

打开 `http://localhost:9627`

### Cloudflare Pages 部署（全球加速）⚡

> ⚠️ **CF Pages 与 VPS/Docker 版本的区别**：CF Pages 部署的是独立精简版（`cf-pages` 分支），基于 v2.2.5 架构，仅支持 **SSH 终端** 和 **SSH 测试**。SFTP 文件管理、Docker 管理、串口、聊天机器人、AI 对话等功能仅 VPS/Docker 部署（`main` 分支 v3.0）支持。

#### Pages 方式

路径：Workers & Pages → Pages → 创建项目 → 连接到 Git

| 字段 | 值 |
|------|-----|
| 生产分支 | `cf-pages` |
| 构建命令 | `npm run build && node build-worker.mjs` |
| 输出目录 | `dist` |
| 环境变量 `NODE_VERSION` | `22` |

> **CF Pages 已知限制**：不支持 WebSocket SFTP、Telegram/WeChat/QQ 机器人、AI 对话。如需完整功能请用 Docker/VPS 部署。

### 开发模式

```bash
# 终端1：后端
node core/server/index.mjs

# 终端2：前端（热更新）
npm run dev
```

---

## 📖 怎么使用？

### 第一：设置主密码 🔐

第一次打开网页设置一个**主密码**，用它加密所有服务器密码。

### 第二：添加服务器

填名称、IP、用户名、密码（或密钥），点**连接**即可。支持**保存**后下次直连不输密码。

### 第三：管理分组

- 给服务器**分组**（生产/测试）
- **拖拽**到不同分组
- 右键分组：重命名/删除/**一键连接全部**
- **置顶**常用服务器

### 第四：宏 / 自动化 🤖

- **录制**命令 → **回放** → **批量**多服务器执行 → **定时**自动跑

### 第五：快捷键

- `Ctrl+F` 终端搜索 · `Ctrl+Tab` 切换标签 · `Ctrl+P` 宏面板

---

## 🤖 AI SSH 命令执行

在聊天面板配置 OpenAI API，输入自然语言让 AI 生成并在服务器上执行命令。

> 点击侧边栏聊天图标 → 切换到 AI → 填写 API Key 和模型 → 输入"检查磁盘使用情况"即可。

---

## 🏗 架构

```
webssh/
├── web/                # 前端 Vue 3 + xterm.js
├── core/
│   ├── server/          # Node.js 后端
│   │   ├── index.mjs    # 入口：路由、中间件、启动
│   │   └── lib/         # ssh / telnet / serial / sftp / chat / docker / session
│   ├── worker/          # Cloudflare Workers
│   └── build-worker.mjs
├── android/             # Android 原生壳（源码追踪）
├── docker/              # Docker 配置
└── scripts/             # 部署/图标工具
```

---

## ⚙ 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `9627` | HTTP 端口 |
| `AUTH_TOKEN` | (空) | API 认证令牌 |
| `GUACD_HOST` | `127.0.0.1` | RDP/VNC 代理地址 |
| `GUACD_PORT` | `4822` | guacd 端口 |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker 套接字 |

---

### 卸载

```bash
cd webssh && bash scripts/uninstall.sh
```

---

## 🛠 技术栈

Vue 3 · xterm.js · WebSocket · ssh2 · AES-256-GCM · Bulma · Vite · Pinia · Capacitor · dockerode · guacd

---

> ⚠️ **安全提醒：** WebSSH 建议在内网/VPN 内使用。公网访问请设置 `AUTH_TOKEN` 并启用 HTTPS。
