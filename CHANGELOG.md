## v2.1.1 — 安全审计修复

> 发布时间：2026-07-23

### 安全修复

1. **AUTH_TOKEN WebSocket + GET 绕过修复** (CVE-2026-xxxx)
   - 之前 `authCheck` 无条件放行所有 GET 请求和 WebSocket Upgrade 握手
   - 现在 WebSocket 连接后第一条消息必须是 `{"type":"auth","token":"xxx"}` 才能继续
   - GET 请求僅放行静态资源路径，`/api/*` 全部需要 Bearer Token
   - guacd WebSocket 同样增加握手认证

2. **会话劫持修复 — Session 复用校验凭据**
   - `findSession()` 增加 `credHash` 参数，对 `auth_value` 取 SHA-256 指纹
   - 不同凭据即使 host/port/username 相同也不再共享 session
   - 存储的 session key 现在包含凭据指纹，彻底杜绝空密码劫持

3. **路径穿越修复**
   - `serveStatic()` 使用 `path.resolve()` 替代 `path.join()`
   - 增加 `fullPath.startsWith(resolve(DIST_DIR))` 校验
   - 对 URL 参数去掉 query 和 hash 部分

4. **SSH 主机密钥中间人防护**
   - `makeSSHConfig()` 增加 `hostVerifier` 回调，在终端打印 host key 指纹
   - 为未来实现"首次连接确认 + 密钥变化告警"做好准备

5. **敏感配置脱敏**
   - `GET /api/chat/config` 返回时自动将 token/apiKey 替换为 `abc****xyz` 格式
   - 仅 POST 更新配置时使用完整值

6. **死代码清理**
   - 删除 `server/lib/middleware.mjs`（与 index.mjs 内联认证重复）

7. **WebSocket 连接频率限制**
   - 新增 `checkWsRate()` 限制每个 IP 每分钟最多 10 次 WS 连接
   - 防止密码喷洒攻击

8. **HTTP 弱加密 UI 警告**
   - 非 HTTPS 环境下页面顶部显示醒目黄色警告条（已存在但增强文案）
   - 提示用户加密降级为 XOR 流密码

9. **README 安全警示**
   - 首页增加警告：仅建议内网/VPN 使用，公网必须 `AUTH_TOKEN` + HTTPS

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
