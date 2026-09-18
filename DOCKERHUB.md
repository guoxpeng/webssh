# webssh

**浏览器里的全能 SSH 工作站** —— 打开网页就能连服务器、管文件、跑批量命令，还能让 AI 通过 MCP 帮你运维。

> ### 📦 项目主页、完整文档与问题反馈都在 GitHub
> ## 👉 https://github.com/guoxpeng/webssh
>
> Docker Hub 这里只放镜像。**安装说明、功能清单、更新日志请以 GitHub 为准**，
> 遇到问题也请到 GitHub 提 Issue（Docker Hub 的评论区不常看）。
> 觉得好用的话，**点个 ⭐ Star** 就是最大的支持。

[![GitHub stars](https://img.shields.io/github/stars/guoxpeng/webssh?style=social)](https://github.com/guoxpeng/webssh)
[![GitHub release](https://img.shields.io/github/v/release/guoxpeng/webssh)](https://github.com/guoxpeng/webssh/releases)
[![License](https://img.shields.io/github/license/guoxpeng/webssh)](https://github.com/guoxpeng/webssh/blob/main/LICENSE)

---

## 这是什么

不用装 Xshell、不用配 Termius，浏览器里就是一个完整的 SSH 客户端。服务器列表、
连接配置、命令历史全在浏览器里加密保存，换台电脑登录同一地址就回来了。

除了终端本身，还塞进了运维日常真正会用到的东西：SFTP 拖文件、批量跑命令、
一键备份迁移、RDP/VNC 远程桌面，以及把服务器交给 AI 操作的 MCP 接口。

## 能做什么

- 🖥️ **SSH 终端** —— 多标签、分屏、自动重连、断线恢复、终端内搜索、主题配色
- 📊 **主机监控** —— 连上就在底部看 CPU / 内存 / 负载 / 磁盘 / 网速（免装 agent）
- 📁 **SFTP 文件管理** —— 浏览、上传、下载、重命名、改权限、在线改文本
- ⚡ **批量运维** —— 录制宏命令，在多台服务器上批量执行，支持定时任务
- 🔐 **加密备份** —— 连接配置一键加密导出，跨设备导入恢复
- 🕳️ **SSH 隧道** —— 本地 / 远程 / SOCKS5 动态转发
- 🤖 **MCP Agent** —— 接入 Claude / Cursor 等 MCP 客户端，让 AI 列出服务器并执行命令
- 🔌 **多协议** —— SSH / Telnet / 串口；RDP / VNC 远程桌面（配合 guacd，网页里直接看画面）
- 📝 **审计日志** —— 连接与 AI 操作全程留痕，可过滤 / 导出
- 🌏 **中英文界面** —— 完整双语，跟随浏览器自动切换
- 📱 **不止网页** —— 同一套代码还出 Windows / macOS 桌面端、Android / iOS App，见 GitHub Releases

---

## 快速开始

### docker run

```bash
docker run -d --name webssh -p 9627:9627 --restart=unless-stopped \
  -e AUTH_TOKEN=你的密码 nameguoguo/webssh
```

然后浏览器打开 `http://<你的IP>:9627`。

### docker compose

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
    volumes:
      - ./data:/app/core/server/data
```

```bash
docker compose up -d
```

---

## 标签说明

| 标签 | 含义 |
|---|---|
| `latest` | 最新稳定版（跟随 main 分支） |
| `3.6.3` | 具体的语义化版本 |
| `v3.6.3` | 同上，带 `v` 前缀的别名（沿用 v3.1.0 / v2.0.0 时期的老写法） |
| `3.6` / `3` | 大版本 / 小版本浮动标签 |
| `main` | main 分支的最新构建 |

镜像同时提供 **linux/amd64** 与 **linux/arm64**，群晖、树莓派等 ARM 设备可直接拉取。

---

## 更新到新版本

镜像**不会自己升级**，`docker restart` 或面板里的「重启」只是重启**现有容器**——
它依然绑在创建时那个镜像 ID 上，后拉取的新镜像不会自动生效。所以升级必须
**先拉取、再重建容器**：

```bash
docker pull nameguoguo/webssh:latest
docker rm -f webssh
docker run -d --name webssh -p 9627:9627 --restart=unless-stopped \
  -e AUTH_TOKEN=你的密码 -v ./data:/app/core/server/data nameguoguo/webssh:latest
```

用 compose 部署的原地更新即可：

```bash
docker compose pull && docker compose up -d
```

确认升级生效：

```bash
docker inspect -f '{{.Image}}' webssh   # 这个 ID 每次升级都应该变化
docker logs --tail 50 webssh            # 应看到 “WebSSH ready”
```

---

## 常用环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `AUTH_TOKEN` | 无 | **公网部署必填**，访问密码；MCP 接入也需要它 |
| `PORT` | `9627` | 容器内监听端口 |
| `GUACD_HOST` | 无 | 启用 RDP / VNC 远程桌面时填 guacd 地址 |
| `TRUST_PROXY` | 无 | 部署在反代后面时设置 |

## 数据持久化

容器内的 `/app/core/server/data` 存放审计日志、服务器注册表、TOFU 主机指纹。
**建议挂载到宿主机**（见上方 compose 示例），否则容器重建后这些记录会丢失。

---

## 相关链接

- **GitHub（文档 / 源码 / Issues / Releases）**：https://github.com/guoxpeng/webssh
- **Docker Compose 完整示例**：`docker/docker-compose.yml`（仓库内）
- **桌面端 / 移动端**：见 GitHub Releases 的 exe / dmg / APK
- **Cloudflare 免服务器部署**：见 README 的 Cloudflare 章节

**License**：MIT
