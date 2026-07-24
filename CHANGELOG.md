## v3.0.0 — 架构重构：WebSocket SFTP，模块化布局，全面优化

> 发布时间：2026-07-24

### 架构重组
- **项目结构**：前端移入 `web/`，后端移入 `core/server/`，Worker 移入 `core/worker/`
- **Docker**：配置移入 `docker/`；**部署脚本** 移入 `scripts/`
- **原生平台**：`android/`（源码追踪）、`ios/`、`electron/` 独立目录

### WebSocket SFTP 文件管理（全新）
- **后端**：`core/server/lib/sftp.mjs` — 基于 WebSocket 的持久 SFTP 连接，支持 list/read/write/delete/mkdir/rmdir/rename/chmod
- **前端**：`web/src/services/sftpWsService.ts` — WebSocket 客户端，请求-响应 ID 匹配，30s 超时
- **Session 复用**：`findSession` 自动复用已有 SSH 会话，无需二次认证
- 文件列表浏览、上传、下载（含 ZIP 批量下载文件夹）、删除、重命名、权限修改
- SFTP 内联编辑器：双击文件直接编辑并保存

### 终端增强
- 移除标签中 `>_SSH` ProtocolBadge，更简洁
- 双击标签重命名，联动 `connectionStore` 更新服务器名称
- 相同服务器多标签自动追加 `(副本2)`、`(副本3)` 编号
- 删除终端标签下方的置顶便签拖拽栏
- 终端输入框上方保留 Copy/Paste + 便签快捷按钮
- 字体大小设置修复：`term-settings-change` 事件 + localStorage 读取

### 文件管理独立登录
- `SftpView.vue` — 不依赖终端 SSH，独立选择服务器连接
- 无凭据时弹出密码/密钥输入框，支持密码和私钥切换
- 连接成功后自动加密保存凭据到 sessionStorage
- `watch(currentNodeDetails)` + `immediate` 支持终端连接后自动填充

### 代码便签优化
- **收藏改置顶**：Star → Pin 图标，`favorite` → `pinToTop`
- **拖动排序**：置顶便签可拖拽自排序，`sortedSnippets` computed 置顶优先
- 置顶项背景淡黄色标注，非置顶正常显示
- `isSaved()` 检测已收藏便签，已收藏显示实心图标

### 代码笔记收藏
- 每条命令新增 Star 按钮
- 点击收藏到便签，已收藏状态显示实心金色图标
- 防重复添加检查

### 连接与分组
- 保存服务器时自动加密存入 sessionStorage（`async/await` 等待完成）
- 分组右键菜单 `setTimeout(0)` 防监听器即时关闭的竞态问题
- 拖入分组：`@drop.prevent.stop` 防止事件冒泡
- `moveConnectionToGroup` 添加同组跳过、Ungrouped 正确转空字符串
- `moveConnectionToGroup` 数组展开 `[...savedConnections.value]` 强制响应式
- 连接表单保存后不清空内容
- 连接按钮/分组连接按钮加载 sessionStorage 凭据直连
- SSH `readyTimeout` 从 15s 提高到 30s

### 错误提示优化
- `friendlyError()` 函数统一映射常见错误到友好中文提示
- 超时 → "连接超时，请检查IP地址和端口"
- 认证失败 → "认证失败，请核对用户名和密码"
- 连接拒绝 → "连接被拒绝，请检查IP和端口是否正确"
- 连接中断 → "连接中断，请检查网络"
- 终端和 SFTP 文件管理均生效

### 界面优化
- 浏览器标签标题固定为 `WebSSH`
- 新 Logo：深紫渐变底 + 白色 `>_` 终端提示符（`icon.svg`）
- PNG 图标同步更新（icon-192、icon-512、apple-touch-icon）
- favicon 多格式兼容（shortcut icon + SVG + PNG + mask-icon）
- 发送按钮改为纯图标（Send），输入框 `field-sizing: content` 自适应扩宽
- 设置中清除凭据按钮添加 `showSuccess` 通知

### 国际化
- 新增 `terminal.connecting` / `terminal.connected` 中文翻译
- 新增 `terminal.authFailed` / `terminal.connTimeout` / `terminal.connRefused` / `terminal.connLost`
- 新增 `sftp.enterCredentials`
- 新增 `snippets.pinToTop` / `snippets.addToSnippets`
- 新增 `settings.credentialsCleared`

### 构建与开发
- Vite 代理新增 `/ws/sftp` 路由
- `findSession` 放松凭据匹配：`credHash` 为 null 时仅匹配 host+port+username
- `.gitignore` 完整重写，保留 `android/` 源码，排除构建产物

### 文件变更（部分）
- 新增：`core/server/lib/sftp.mjs`、`web/src/services/sftpWsService.ts`
- 修改：`core/server/lib/session.mjs`、`core/server/lib/utils.mjs`、`core/server/lib/ssh.mjs`
- 修改：`web/src/components/sftp/SftpBrowser.vue`、`web/src/views/SftpView.vue`
- 修改：`web/src/components/terminal/TerminalDisplay.vue`、`web/src/components/terminal/SplitPaneTerminal.vue`
- 修改：`web/src/components/snippets/SnippetPanel.vue`、`web/src/components/codeNotes/CodeNotePanel.vue`
- 修改：`web/src/stores/connectionStore.ts`、`web/src/views/ConnectionView.vue`
- 修改：`web/src/router/index.ts`、`web/index.html`、`web/public/icon.svg`
- 修改：`vite.config.mjs`、`package.json`（v3.0.0）

---

## v2.2.5 — 部署脚本根因修复（绝对路径 + 版本验证）

> 发布时间：2026-07-23

### 部署脚本完全重写
- **绝对路径化**：`DIR="webssh"` → `APP_DIR="${ORIG_DIR}/webssh"`，彻底消除 `cd` 后相对路径失效
- **目录检测修复**：`[ -d "$DIR" ]` → `[ -d "${APP_DIR}/.git" ]`，不再受当前目录影响
- **三级进程终止**：lsof 杀端口占用 → PID 文件 → pkill，确保旧进程一定停止
- **构建版本验证**：`grep` 从 dist 提取 APP_VERSION，部署完成打印 `版本: v2.2.5 (ea72c34)`
- **错误即退出**：git fetch 失败、build 失败、启动失败全部 `err` 退出并打印原因

---

## v2.2.4 — 修复 Pages 部署无法 SSH 的原因 + 部署方式指引

> 发布时间：2026-07-23

### Cloudflare 部署方式修正
- **根本原因**：用户部署到了 Pages（`.pages.dev`），Pages 只托管静态文件，不能运行 SSH 服务端
- Worker 构建增加 `dist/_worker.js` 输出，兼容 Pages with Functions 模式
- Worker fetch handler 增加 `env.ASSETS` 安全判断，Pages 环境不会因缺少绑定而崩溃
- `package.json` 新增 `pages:deploy` 命令：`wrangler pages deploy dist --project-name=webssh`

> **关键区别**：
> - `npm run worker:deploy` → Workers（`workers.dev`），支持 SSH/API/WebSocket
> - `npm run pages:deploy` → Pages（`pages.dev`），仅静态文件 + `_worker.js`Functions

---

## v2.2.3 — 移除 HTTP 不安全警告 + 部署脚本健壮性修复

> 发布时间：2026-07-23

### UI 改进
- **移除 HTTP 不安全警告横幅**：删除顶部黄色 "当前使用 HTTP 连接 —— 加密功能不可用" 提示条

### 部署脚本可靠性修复
- **git fetch 不再静默失败**：移除 `|| true`，网络失败时 `err` 退出并打印错误
- **新增旧→新 hash 对比**：部署时显示 `Updated: abc1234 → def5678`，确认代码已更新
- **浅克隆自动解除**：`git fetch --unshallow` 避免 `--depth=1` 导致 fetch 不完整
- **git remote 预检**：拉取前验证 origin 远程是否存在

---

## v2.2.2 — CF Worker SSH 深度诊断 + TCP 数据处理修复

> 发布时间：2026-07-23

### Worker SSH 连接修复
- **TCP 数据写入修复**：`CloudflareSocketDuplex._write()` 重写，分离 `Uint8Array` / `Buffer` / `string` 三种路径
  - 修复 workerd `Buffer` 可能不是 `Uint8Array` 子类导致数据写入错误的问题
  - `Buffer.isBuffer()` 分支用 `buffer.byteOffset/buffer.byteLength` 安全提取字节
- **超时延长**：`readyTimeout` 从 5s → 15s（Workers TCP 延迟较高）
- **新增加密诊断端点** `GET /api/diag`：
  - 逐个测试 `createECDH` / `createDiffieHellman` / `createCipheriv` / `createHmac` 等 API
  - 测试具体算法：AES-256-CTR/GCM/CBC、HMAC-SHA256、ECDH P-256、DH group14
  - 部署后可访问 `https://your-worker.workers.dev/api/diag` 定位失败点
- **详细错误日志**：所有 SSH 错误附 stack trace 前 3 层

---

## v2.2.1 — 部署更新修复 + CF Worker SSH 算法优化

> 发布时间：2026-07-23

### 部署脚本修复
- **根因修复**：`git pull` 改 `git fetch + git reset --hard origin/main`，彻底消除合并冲突导致的代码不更新
- `git clean -fdx` 清除所有未跟踪文件（包括构建产物）
- 启动前强制杀死旧进程：PID 文件 → 端口占用 → 进程名三级兜底
- 构建前清除缓存：`rm -rf node_modules/.cache node_modules/.vite dist`
- `npm cache clean --force` 清除 npm 缓存
- 部署完成显示当前 git commit hash，方便确认版本

### CF Worker SSH 算法优化
- 新增 `aes256-gcm@openssh.com` / `aes128-gcm@openssh.com` 支持（Web Crypto 原生支持 GCM）
- 新增 `chacha20-poly1305@openssh.com` 作为后备
- 新增 ETM 变体 `hmac-sha2-256-etm@openssh.com` / `hmac-sha2-512-etm@openssh.com`
- 服务器主机密钥算法新增 `rsa-sha2-512` / `rsa-sha2-256`
- 增强错误日志：`console.error` 附带 stack trace 前 3 层

---

## v2.2.0 — 审计日志 + AI SSH 执行 + 安全加固

> 发布时间：2026-07-23

### 审计日志

- 新增服务器端审计日志模块 (`server/lib/audit.mjs`)
- 自动记录 SSH 连接/断开/错误、连接测试、AI 请求/AI SSH 执行事件
- JSONL 格式写入 `data/audit.log`，超过 5MB 自动轮转
- API：`POST /api/audit` 分页查询 + `POST /api/audit/clear` 清空
- 前端新增审计日志面板（侧边栏底部 `ScrollText` 图标）
- 支持按事件类型过滤（全部 / SSH / 测试 / AI）、下载导出 JSON

### AI SSH 命令执行

- 聊天机器人 AI 标签页添加服务器选择下拉框
- AI 回复中的 ` ```bash ` 代码块自动提取并通过 SSH 执行
- 执行结果以 `$ command` + stdout/stderr 格式展示
- 服务器端 `processAiMessage()` — 调用 AI → 提取命令 → SSH 执行 → 返回结果
- API：`POST /api/chat/ai` 接受 `{ message, serverConfig }`

### SFTP 优化

- SFTP 面板恢复为左右分割布局（拖拽分隔条调整宽度）
- 新增文件夹递归下载：勾选文件夹 + 点击下载按钮，递归遍历所有文件下载

### Docker 安全加固

- Dockerfile：末尾 `USER node`，创建独立组 `nodegroup`，`chown -R` 整个 `/app`
- docker-compose：添加 `read_only: true` + `tmpfs: /tmp`（数据目录 `/app/data` 仍可写）
- Caddyfile：添加 `Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"`

### 体验优化

- 代码笔记/聊天机器人弹窗面板添加背景色和阴影，解决终端画面穿透看不清的问题
- 移除底部状态栏 Wi-Fi 断开图标，精简界面
- 审计日志入口移至侧边栏最底部
- 中英文 README 顶部添加语言切换链接 + AI 配置使用文档

### CF Workers 部署优化

- KEX 算法移除 `diffie-hellman-group-exchange-sha256`（Workers 上计算量极大易超时）
- `wrangler.toml` 兼容标志从 `nodejs_compat` 升级为 `nodejs_compat_v2`

### 代码自查修复

- SftpBrowser `walkFolder` 错误读取 `list.files` 改为 `list.entries`（API 返回键名修正）
- 审计日志 `writeFileSync` 的 `flag: 'as'` 无效导致文件被截断，改为 `flag: 'a'`
- QQ/WeChat URL 拼接修复：`new URL()` 构造 + `groupId/userId` 过滤非数字字符
- Dockerfile `chown` 范围修正（`/app/data` → `/app`），确保 node 用户可读所有文件

---

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
