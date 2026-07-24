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

### 开发模式

```bash
# 终端1：后端
node core/server/index.mjs

# 终端2：前端（热更新）
npm run dev
```

---

## 🏗 架构

```
webssh/
├── web/                # 前端 Vue 3 + xterm.js
│   └── src/
│       ├── components/terminal/   # 终端组件
│       ├── components/sftp/       # SFTP 文件管理
│       ├── components/snippets/   # 代码便签
│       ├── stores/                # Pinia 状态管理
│       └── locales/               # 中英文翻译
├── core/
│   ├── server/          # Node.js 后端
│   │   ├── index.mjs    # 路由入口
│   │   └── lib/         # SSH/Telnet/Serial/SFTP/Docker 处理
│   ├── worker/          # Cloudflare Workers 部署
│   └── build-worker.mjs # Worker 构建脚本
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
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker 套接字 |

---

## 🛠 技术栈

Vue 3 · xterm.js · WebSocket · ssh2 · AES-256-GCM · Bulma · Vite · Pinia · Capacitor

---

> ⚠️ **安全提醒：** WebSSH 建议在内网/VPN 内使用。公网访问请设置 `AUTH_TOKEN` 并启用 HTTPS。
