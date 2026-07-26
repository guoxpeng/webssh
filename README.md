# WebSSH v3.1 — 浏览器端的 SSH 管理工具

<p align="center">
  <a href="README.md">中文</a> | <a href="README_EN.md">English</a>
</p>

---

## 概述

WebSSH 是一个基于 Web 的 SSH 客户端，无需安装本地终端软件，通过浏览器即可完成服务器连接、文件管理、批量运维等操作。支持 Docker 部署、Windows 桌面客户端、Cloudflare Workers 等多种运行方式。

---

## 功能对比

| 功能 | WebSSH | Termius | MobaXterm | PuTTY |
|---|---|---|---|---|
| 授权模式 | 完全免费 | 订阅制（高级版收费） | 共享软件（高级版收费） | 免费 |
| 运行环境 | 浏览器 / 桌面客户端 | 需安装客户端 | 需安装客户端 | 需安装客户端 |
| 跨平台支持 | 桌面、手机、平板均可用 | 需各平台分别安装 | Windows 独占 | Windows 独占 |
| 凭据加密存储 | AES-256-GCM | 支持 | 不支持 | 不支持 |
| 主密码保护 | 支持 | 支持 | 支持 | 不支持 |
| 文件管理（SFTP） | 独立于 SSH 会话 | 需 SSH 连接 | 需 SSH 连接 | 需第三方工具 |
| 远程文件编辑 | 浏览器内联编辑 | 不支持 | 支持 | 不支持 |
| 批量执行与定时任务 | 录制→回放→批量→定时 | 不支持 | 支持（脚本） | 不支持 |
| Docker 管理 | 浏览器内管理容器 | 不支持 | 不支持 | 不支持 |
| SSH 隧道 | 本地/远程/动态转发 | 支持 | 支持 | 支持 |
| 分组管理 | 拖拽排序、右键菜单 | 支持 | 不支持 | 不支持 |
| 多标签终端 | 拖拽排序、着色、重命名 | 支持 | 支持 | 不支持 |
| 终端搜索（Ctrl+F） | 支持 | 不支持 | 支持 | 不支持 |
| 主题系统 | 4 套预设 | 支持 | 支持 | 不支持 |
| 多语言界面 | 中文/英文 | 英文 | 英文 | 英文 |
| PWA 桌面安装 | 支持 | 不支持 | 不支持 | 不支持 |
| 错误诊断提示 | 中文提示（如"请核对密码"） | 支持 | 不支持 | 不支持 |
| 加密备份与云同步 | 支持 | 支持 | 不支持 | 不支持 |
| AI 命令生成 | OpenAI API 集成 | 不支持 | 不支持 | 不支持 |

---

## 部署方式

### Docker 部署（推荐）

```bash
docker run -d --name webssh -p 9627:9627 --restart=unless-stopped nameguoguo/webssh
```

Docker Compose 配置：

```yaml
services:
  webssh:
    image: nameguoguo/webssh
    container_name: webssh
    restart: unless-stopped
    ports:
      - "9627:9627"
```

如需 RDP/VNC 代理和 Docker 管理：

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

### 一键脚本部署

```bash
curl -fsSL https://raw.githubusercontent.com/guoxpeng/webssh/main/scripts/deploy.sh | bash
```

### 手动部署

```bash
git clone https://github.com/guoxpeng/webssh.git
cd webssh && npm install && npm run build
node core/server/index.mjs
```

浏览器访问 `http://localhost:9627`

### Windows 桌面客户端

#### 系统要求

- Windows 10 64-bit 或更高版本
- 不需要安装 Node.js 或任何运行时依赖

#### 下载

| 版本 | 下载地址 |
|---|---|
| 便携版（zip） | `win/release2/WebSSH-portable.zip` — 解压后运行 `WebSSH.exe` |
| 完整版（目录） | `win/release2/win-unpacked/` — 直接运行 `WebSSH.EXE` |

#### 构建

```bash
npm run build && npm run icons && cd win && node build.mjs
```

---

## Cloudflare 版本

> **状态：优化中。** Cloudflare Workers/Pages 版本的稳定性和功能仍在完善，暂时不建议生产环境使用。

---

## 快速上手

1. 部署完成后，打开页面首先设置**主密码**，用于加密存储所有服务器凭据。
2. 在表单中填写服务器名称、IP 地址、用户名和密码（或私钥），点击连接。
3. 可保存服务器配置，后续无需重复输入凭据。
4. 通过拖拽和右键菜单管理服务器分组，支持一键连接分组内所有服务器。
5. 录制操作后，可批量在多个服务器上执行，也支持定时任务。

---

## 开发

```bash
# 终端 1：启动后端服务
node core/server/index.mjs

# 终端 2：启动前端开发服务器（热更新）
npm run dev
```

---

## 技术栈

Vue 3 · xterm.js · WebSocket · ssh2 · AES-256-GCM · Bulma · Vite · Pinia · Docker · Electron

---

> **安全说明：** WebSSH 建议在内网或 VPN 环境下使用。公网部署时请设置 `AUTH_TOKEN` 环境变量并配置 HTTPS 反向代理。
