# 版本发布说明

## v2.1.0 — 架构重构 + RDP/VNC + Docker 原生管理

> 发布时间：2026-07-23

### 1. 后端拆分，架构更清晰

`server/index.mjs` 从 810 行拆分为模块化结构：

```
server/
├── index.mjs          # 入口：路由、中间件、启动
└── lib/
    ├── config.mjs     # 常量
    ├── utils.mjs      # 工具函数
    ├── session.mjs    # SSH session 管理
    ├── ssh.mjs        # SSH WebSocket 处理器
    ├── telnet.mjs     # Telnet 处理器
    ├── serial.mjs     # 串口处理器
    ├── chat.mjs       # 聊天机器人
    └── middleware.mjs # 认证中间件
```

### 2. 认证中间件

- 设置环境变量 `AUTH_TOKEN=your-secret` 即可启用 Bearer Token 认证
- 未设置时完全透明，不干扰现有功能
- 为未来多用户扩展奠定基础

### 3. dockerode 原生 Docker 管理

- 引入 `dockerode` 库，通过 Docker socket 直连，不再依赖 SSH exec
- 检测到 `/var/run/docker.sock` 时自动启用
- 未检测到时自动降级为 SSH exec，向后兼容

### 4. guacd RDP/VNC 远程桌面

- 新增 WebSocket 端点 `/ws/guacd`，代理到 Apache Guacamole 服务
- 支持 RDP / VNC 协议，类似 Royal TS 的远程桌面体验
- 环境变量 `GUACD_HOST` / `GUACD_PORT` 控制连接地址
- docker-compose 示例已包含 guacd 服务，取消注释即可启用

### 5. 连接速度优化 + SFTP 稳定

- SSH `readyTimeout` 从 5s 降至 3s，快速失败
- 终端 SSH 连接与 SFTP 共享 session，免去二次握手
- SFTP session TTL 延长至 30 分钟，减少重复连接
- 修复切换终端标签时 SFTP 面板重连问题

### 6. 聊天机器人 (Telegram / WeChat / QQ + AI)

- 后端支持 Telegram 长轮询、WeChat ClawBot HTTP API、QQ go-cqhttp
- 集成 OpenAI 兼容 API，消息可自动触发 AI 回复
- 前端新增聊天面板，配置 + 消息列表 + 发送

### 7. Cloudflare Workers 部署优化

- 移除过时的 `pnpm-lock.yaml`，改用 npm 避免 CI 构建失败
- `build-worker.mjs` 自动复制前端资源到 `dist/client/`
- README 新增 Workers vs Pages 两种部署方式的填写对照表
