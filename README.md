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

### 一键 Linux 系统部署

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
| 便携版（zip） | `release/WebSSH-portable.zip` — 解压后运行 `WebSSH.exe` |

#### 构建

```bash
npm run desktop
```

---

## Cloudflare 版本

在 Cloudflare Workers/Pages 上部署 WebSSH，无需服务器，利用 Cloudflare 全球网络提供 SSH 访问。

> **注意：** Cloudflare Workers 不支持连接内网地址（192.168.x.x、10.x.x.x、172.16-31.x.x），仅适用于公网服务器。若需管理内网服务器，请使用 Docker 部署或 Windows 客户端。

### 前置条件

- 一个 Cloudflare 账号
- **Pages 部署**：免费，无需绑卡
- **Workers 部署**：需 Workers Paid 计划（`cloudflare:sockets` 需要付费订阅）
- [Node.js](https://nodejs.org/) >= 18 + npm

### 1. 创建 R2 存储桶

备份功能需要 R2 存储桶，请先在 Cloudflare 控制台创建：

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 左侧菜单 → **R2** → **Create bucket**
3. 名称填写 **`webssh-backups`**，区域保持默认（Auto）
4. 点击 **Create bucket**

### 2. 克隆项目并安装依赖

```bash
git clone https://github.com/guoxpeng/webssh.git
cd webssh
npm install
```

### 3. 配置部署参数

项目根目录下的 `wrangler.toml` 包含了部署配置：

```toml
name = "webssh"
compatibility_date = "2026-07-23"
compatibility_flags = ["nodejs_compat"]

pages_build_output_dir = "dist/client"

[[r2_buckets]]
binding = "BACKUP_BUCKET"
bucket_name = "webssh-backups"
```

**参数说明：**
- `compatibility_flags`：必须包含 `nodejs_compat`，否则 ssh2 依赖的 Node.js 内置模块无法正常工作
- `bucket_name`：必须与第 1 步中创建的 R2 存储桶名称一致
- `pages_build_output_dir`：构建产物目录，保持默认

### 4. 构建 Worker 文件

构建前端 + 打包 Worker 脚本（含加密垫片、WebSocket 处理、R2 备份 API）：

```bash
npm run build && node core/build-worker.mjs
```

该命令会：
1. 使用 Vite 构建前端静态资源 → `dist/client/`
2. 使用 esbuild 将 Worker 脚本（`core/worker/index.mjs`）打包为 `dist/client/_worker.js`
3. 注入加密垫片（ECDH + DH + RSA verify + AES-256-GCM → CTR/CBC 降级），兼容 Cloudflare workerd 运行时

### 5. 部署到 Cloudflare

#### 方式一：Cloudflare Pages（推荐）

```bash
npm run pages:deploy
```

该命令等效于：
```bash
npm run build && node core/build-worker.mjs && wrangler pages deploy dist/client --project-name=webssh
```

首次部署会提示登录 Cloudflare 并授权。部署完成后会获得一个 `*.pages.dev` 域名。

> **添加 R2 存储桶绑定（Pages）：**
> `wrangler.toml` 中的 `[[r2_buckets]]` 配置在 Pages 部署时需要手动在 Dashboard 中关联：
> 1. 进入 Pages 项目 → **Settings** → **Functions** → **R2 bucket bindings**
> 2. 点击 **Add binding**，变量名称填 `BACKUP_BUCKET`，R2 bucket 选择 `webssh-backups`
> 3. 保存后重新部署

#### 方式二：Cloudflare Workers（需 Paid 计划）

```bash
npm run worker:deploy
```

该命令等效于：
```bash
npm run build && node core/build-worker.mjs && wrangler deploy
```

> **注意：** Workers 部署需要 Paid 计划（$5+/月），因为 SSH 连接依赖 `cloudflare:sockets` API，该 API 在免费计划中不可用。

### 6. 验证部署

访问 `https://your-project.pages.dev`，看到 WebSSH 登录界面即表示部署成功。

**常见检查：**
- 连接公网服务器成功 → 全套功能正常工作（终端 + SFTP + 备份）
- 右下角出现 "检测到局域网连接" 提示 → 告知用户 CF 版不能连内网，请使用 Docker/Win 客户端
- 备份功能可用 → 验证 R2 绑定正确：进入备份页面可看到云端存储列表

### Pages 自动部署（CI/CD）

如果使用 GitHub 仓库，Cloudflare Pages 支持自动部署。将项目推送到 GitHub 后，在 Pages Dashboard 中选择仓库即可自动触发构建和部署。

构建命令（在 Pages Dashboard 中设置）：
```
Build command: npm run build && node core/build-worker.mjs
Build output: dist/client
```

> **提示：** 每次提交后 Pages 会自动构建并部署，无需手动运行命令。

### 已知限制

| 限制 | 说明 |
|---|---|
| 仅支持 RSA 主机密钥 | ECDSA 主机密钥验证已从算法列表移除 |
| 仅支持 CTR/CBC 加密 | AES-256-GCM 在 workerd 中不可用，已降级为 CTR/CBC |
| 不支持内网地址 | Workers 无法建立 RFC 1918 私有地址的 TCP 连接 |
| WebSocket 空闲超时 | 每 30 秒心跳保活防止连接断开 |
| 连接数限制 | Workers Paid 计划有并发连接数上限 |

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
