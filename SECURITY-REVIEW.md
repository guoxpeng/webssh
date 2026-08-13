# WebSSH 安全审查报告

审查对象：`guoxpeng/webssh` @ main（2026-08-12 快照）
审查范围：`core/server/**`（Node 服务端全量）、`web/src/utils/crypto*.ts`、`web/src/stores/connectionStore.ts`、`web/src/utils/api.ts` 及相关前端凭据链路。

结论：**默认配置下不具备对外暴露条件**。核心问题不在单点漏洞，而是整个信任模型——服务端对"谁能建立 SSH、对哪台机器、执行什么"完全没有自己的边界，全部交给调用方，而鉴权默认关闭。

---

## 严重（Critical）

### C1. 鉴权默认关闭，且产品行为鼓励公网暴露
`core/server/index.mjs:33` — `AUTH_TOKEN = process.env.AUTH_TOKEN || null`，未设置时 `authCheck()` 恒过。同时启动时主动探测并打印公网 IP（`fetchPublicIP()`，index.mjs:352），README/docker 面向 VPS 部署。
后果：默认启动 = 以下能力对全网开放：
- `/api/ssh/test`：以攻击者给的任意凭据连任意主机执行命令；
- `/api/chat/ai`：见 C2；
- `/ws/ssh`、`/ws/sftp`、`/ws/guacd`：任意 WebSocket 直连；
- `/api/docker/*`：容器 start/stop/restart/logs（挂载 docker.sock 时等价宿主机部分控制权）。
修复：`AUTH_TOKEN` 未设置时拒绝启动（或至少禁用一切 API/WS，只留静态页 + /health）；日志中明确警告。

### C2. `/api/chat/ai`：AI 回复中的命令在"请求方完全指定"的服务器上无确认执行
`core/server/lib/chat.mjs:174-210` — `processAiMessage(message, serverConfig)`：`serverConfig`（host/port/username/密码）全部来自请求体；AI 回复里 ` ```bash ` 代码块被 `extractCommands()` 原样提取并逐条 `executeSSHCommand()` 执行，无人工确认环节。
攻击面：
1. 配合 C1（无鉴权）= 任意人远程命令执行跳板；
2. 即使设置了 token，提示词注入（用户消息诱导模型输出恶意代码块）可直接打穿到运维目标机；
3. 目标服务器由调用方逐次指定，token 泄露 = 全部已知凭据主机沦陷。
修复：exec 必须走服务端注册表中的服务器（不接受请求体携带凭据）+ 命令白名单/危险命令拦截 + 独立审计；本次新增的 Model API（见文末）即按此模型实现。

---

## 高危（High）

### H1. 无凭据即可"借用"他人活跃 SSH 会话
`core/server/lib/session.mjs:15-23` — `findSession()` 中 `if (credHash === null || s.credHash === credHash)`：请求不带 `auth_value` 时 `credHash` 为 null，直接短路匹配同 host/port/username 的任意现存会话。`/api/ssh/test`（index.mjs:85）调用它后直接在该会话上 `exec`。
后果：多人共用一个部署（或攻击者与受害者先后访问）时，不带密码即可在他人已登录会话里执行命令。
修复：`credHash === null` 时必须返回 null，不允许匿名复用。

### H2. 跨站请求驱动 API（无 Origin 校验 + 忽略 Content-Type）
index.mjs 的 POST 处理对 `Content-Type` 零校验（`parseBody()` 对任意 body 直接 `JSON.parse`），且响应无任何 CORS 策略、无 Origin/Referer 校验。
后果：用户浏览器访问任意恶意网页时，该网页可发 `text/plain` 简单请求（免预检）到局域网/本机 `:9627`，body 照样按 JSON 解析执行——`/api/ssh/test`、`/api/sftp/delete`、`/api/docker/exec` 均可被跨站触发（配合 C1 无需 token）。DNS rebinding 场景下同样成立。
修复：强制校验 `Content-Type: application/json`；校验 Origin 白名单；非浏览器客户端靠 Bearer token 不受影响。

### H3. 浏览器端凭据存储实际是明文（XOR 混淆）
两处：
1. `web/src/stores/connectionStore.ts:212-231` — "记住密码"落 localStorage，仅用 serverId 做 XOR key（key 与密文同源同库），等同明文；
2. `web/src/utils/crypto.ts:82-86,101` — 非 HTTPS 环境（`crypto.subtle` 不可用）降级路径用 `xorEncrypt` + 迭代数砍到 10000 的 PBKDF2，"AES-GCM"退化成重复密钥 XOR。
后果：任何 XSS 或非 HTTPS 部署下，全部保存的服务器密码/私钥可被直接还原。
修复：localStorage 一律只存主密码加密（AES-GCM）后的密文；非安全上下文直接禁止保存凭据而不是降级 XOR。

### H4. 原型链污染：`/api/chat/config`
`chat.mjs:232` — `Object.assign(chatConfig, body)`，body 为攻击者 JSON（`JSON.parse` 可携带 `__proto__` 键，`Object.assign` 走 `[[Set]]` 触发 setter）。Node 服务端原型污染是成熟的 RCE 利用链前置条件。
修复：白名单字段合并（只取 `telegram/wechat/qq/ai` 四个键并逐层校验类型）。

### H5. 限流可被 `X-Forwarded-For` 伪造绕过
index.mjs:74 与 utils.mjs:56 — 限流键取 `req.headers['x-forwarded-for']` 第一段，客户端可任意伪造 → 60 req/min 限制对攻击者不存在，C1 场景下可无限爆破。
修复：仅在显式配置了可信代理时才信 XFF，否则用 `socket.remoteAddress`。

---

## 中危（Medium）

### M1. SSH 主机密钥从不校验（MITM）
`utils.mjs:19-24` — `hostVerifier` 恒 `callback(true)`，只打印指纹。密码/私钥与全部会话数据可被中间人截取。对 webssh 类产品这是核心信任点，应至少做 TOFU（首次记录、后续比对、变更即拒绝并告警）。

### M2. SSRF / 内网探测
`/api/ssh/test`、`/ws/ssh`、`/ws/sftp`、Telnet 均接受调用方任意 `host:port`，无私网/环回/元数据地址（169.254.169.254）过滤。服务端成为内网端口扫描与协议探测跳板（错误信息回显可区分端口开闭）。修复：可配置 allow/deny 网段，默认至少屏蔽云元数据地址。

### M3. 请求体无大小限制
`parseBody()` 无限累积字符串 → 单个大 body 即可打爆内存；`/api/sftp/read` 把整个远端文件读进内存再 base64，同理。修复：body 上限（如 1MB）+ SFTP read 限制尺寸/改流式。

### M4. WebSocket token 走 URL query
`index.mjs:227` 支持 `?token=`。token 会进访问日志、代理日志、浏览器历史。建议仅首包认证或 Sec-WebSocket-Protocol 传递。

### M5. 未捕获异常 = 整进程退出（崩溃型 DoS）
`index.mjs:64-69` — `uncaughtException`/`unhandledRejection` 直接 `process.exit(1)`。任何能触发未捕获路径的畸形输入都是拒绝服务。修复：记录 + 视情况关闭当前连接，仅保留 supervisor 兜底重启。

### M6. 敏感配置明文落盘
`chat-config.json` 明文存 Telegram bot token、微信/QQ apiKey、OpenAI key，权限 0644。修复：`chmod 600` + 文档提示，或支持环境变量注入。

### M7. token 比较时序侧信道 + 审计日志可被清空
`token === AUTH_TOKEN` 非常量时间（低危，但 token 是唯一防线时应 `timingSafeEqual`）；`/api/audit/clear` 允许任何持 token 者抹日志——建议删除该端点或要求二次凭据。

---

## 低危（Low）

- **L1.** `serveStatic` 用 `fullPath.startsWith(resolve(DIST_DIR))` 防穿越，缺路径分隔符判断（`/dist/client-evil/` 可通过前缀检查；当前目录布局下不可利用）。改用 `startsWith(dir + path.sep)`。
- **L2.** `GET /api/chat/config` 是死代码：请求在 index.mjs:79 被 `req.method !== 'POST'` 提前 404，chat 分支里的 GET 逻辑永远走不到（功能性 bug）。
- **L3.** Telnet 自动登录：远端输出含 `password:` 即发送密码，恶意/伪装服务端可骗出密码（telnet 本身无加密，风险叠加）。
- **L4.** `/api/chat/send` 可借已绑定的 Telegram/微信/QQ bot 向管理员发送任意文本（社工通道）。
- **L5.** `cmds.join(' && ')`（index.mjs:109）：exec 目标本就是任意命令，不构成独立注入漏洞，但放大了 C1/H1 的利用面；审计日志应记录完整命令（当前 `ssh_test` 审计未记命令内容）。

---

## 修复优先级建议

1. 立即：C1（无 token 拒绝暴露 API）、H1（匿名会话复用）、H2（Origin/Content-Type 校验）、H4（白名单合并）。
2. 一周内：C2 改造（exec 走注册表 + 确认）、H3、H5、M1 TOFU、M3 限流上限。
3. 计划内：M2/M4/M5/M6/M7 与低危项。

## 附：本次同时交付的 Model API 如何规避上述问题

新增 `/api/model/*`（见 `core/server/lib/modelapi.mjs`）：
- `AUTH_TOKEN` 未设置时整组端点返回 503（不重复 C1）；
- 服务器必须先进服务端注册表（`data/model-servers.json`，凭据用 AUTH_TOKEN 派生密钥 AES-256-GCM 加密落盘），exec/probe 只认注册表 id（不重复 C2 的"请求体带目标+凭据"）；
- 注册表条目与凭据永不出现在任何响应/日志里；
- 命令长度、执行超时、输出体积、并发数全部封顶，逐条审计。

---

## 修复记录（2026-08-12 第二轮）

以下问题已在本次变更中修复并通过回归测试（`core/__tests__/security-fixes.test.mjs` + 全量套件 41/41）：

| 编号 | 修复方式 | 涉及文件 |
|---|---|---|
| C1 | AUTH_TOKEN 未设置时 API 返回 503、WS upgrade 直接拒绝，只保留静态页与 /health；启动时打印醒目警告 | `index.mjs` |
| H1 | `findSession()` 禁止无凭据复用会话，必须 credHash 完全匹配 | `lib/session.mjs` |
| H2 | `/api/*` 强制 `Content-Type: application/json`（否则 415）；带 Origin 的浏览器请求必须同源（否则 403） | `index.mjs`、`lib/utils.mjs` |
| H4 | `updateConfig` 改为白名单分区 + `safeMerge`（跳过 `__proto__`/`constructor`/`prototype`，只接受 JSON 标量/数组） | `lib/chat.mjs` |
| H5 | 限流默认按 `socket.remoteAddress` 计，仅 `TRUST_PROXY=1` 时才信 X-Forwarded-For | `index.mjs` |
| M1 | SSH 主机密钥 TOFU：首次指纹落盘 `data/known_hosts.json`，后续不匹配即拒绝连接；`SSH_INSECURE_NO_HOST_CHECK=1` 可回退旧行为 | `lib/utils.mjs`、`lib/chat.mjs` |
| M3 | 请求体上限 2MB（超限 413，超限后丢弃数据不占内存）；SFTP 读取上限 16MB（HTTP 与 WS 通道均覆盖） | `lib/utils.mjs`、`index.mjs`、`lib/sftp.mjs` |
| M5 | uncaughtException/unhandledRejection 只记日志不再退出进程 | `index.mjs` |
| M7 | token 比较改为 `timingSafeEqual` | `index.mjs` |
| L1 | 静态文件前缀检查改为 `DIST_DIR + sep` | `lib/utils.mjs` |
| L2 | GET API 白名单（`/api/chat/config`、`/api/audit`），原死代码路径恢复可用 | `index.mjs` |
| — | 前端 `apiService` 改用带 token 的 `apiFetch`，启用 AUTH_TOKEN 后前端不再失效 | `web/src/services/apiService.ts` |

未修复（需要产品决策或影响面大，建议后续处理）：
- **C2**：`/api/chat/ai` 的"AI 回复直接执行"交互模式未动——新 Model API 已提供更安全的替代路径，建议下个大版本废弃该端点或强制人工确认；
- **H3**：前端 localStorage XOR 凭据存储属于前端架构改造（需要统一走主密码加密），本次未动；
- **M2**：SSH/Telnet 目标的私网过滤未加（会与"管理内网机器"的核心用途冲突，需 allow/deny 配置化方案）；
- **M4**：WS token 走 query string 未改（需前端三个 service 联动，已确认风险为日志泄露）；
- **M6**：chat-config.json 明文密钥未改；
- **L3/L4**：Telnet 自动登录启发式、bot 代发文本，维持现状并记录。

## 多端优化记录（2026-08-12 第三轮）

在安全修复与 Model API 基础上追加的各端体验优化，均已包含在交付补丁/源码包中：

### Win 端（Electron 壳，目标：启动快、占用小）
- `win/main.js`：新增 `waitForServer()`，优先监听内嵌服务自身的 `listening` 事件，替代原来 300ms 间隔的端口轮询——服务就绪即打开浏览器，启动更快且消除无谓轮询。原有内存/进程裁剪开关（128MB 堆上限、禁用 GPU/扩展/网络服务、single-process 等）保留。

### 前端通用（目标：首屏快、体积小）
- `web/src/main.ts`：移除重复引入的预构建 bulma.min.css（main.scss 已从源码编译整套 Bulma），gzip 后约省 66KB。
- `web/src/assets/scss/main.scss`：删除渲染阻塞的 Google Fonts 远程 @import（离线/内网环境还会直接卡住）。
- `vite.config.mjs`：构建目标 es2020；manualChunks 将 xterm（83KB gz）拆成懒加载块、图标/zip/框架各自分包，首屏连接页仅需加载约 8KB 自身代码 + 共享依赖。

### 安卓端（目标：触摸屏适配）
- `web/src/assets/scss/main.scss`：`@media (hover:none) and (pointer:coarse)` 下统一 `touch-action: manipulation`（消除 300ms 点击延迟）、去除点按高亮与长按弹出菜单、强制显示原本 hover 才出现的操作按钮（分组菜单/备份/片段/宏/已保存项的操作区）、按钮点按缩放反馈、改用原生惯性滚动。
- `web/src/components/global/AppNavbar.vue` + `web/src/layouts/WorkbenchLayout.vue`：导航栏高度计入 `env(safe-area-inset-top)`（刘海/状态屏），内容区不再被导航栏遮挡。

### 验证结果
- 服务端测试 41/41 通过（vitest server config）；
- `vite build` 成功，产物分包符合预期；
- 前端 vitest 套件 13 失败/19 通过——已用**未改动的原始代码副本**对照验证为同样的 13 失败/19 通过，确认为测试环境（jsdom localStorage 全局未生效）问题，与本次改动无关；
- 补丁经 `patch -p1 --dry-run` 在原始代码副本上验证零失败。

## UI 与文案修复记录（2026-08-12 第四轮）

- **翻译完整性**：补齐 9 个界面使用但翻译文件缺失的键（`common.refresh/delete/deleteAll/manual/reset/more`、`terminal.addTab/selectConnection`、`form.privateKeyPlaceholder`），此前这些位置会直接显示键名；消除 TerminalView 两处硬编码中文（英文界面下会串显）、备份恢复错误的硬编码中文（改为错误码 + 双语映射）、「连接失败」分组名改为按语言显示。
- **左下角互动提示**：修复通知「悬停暂停自动消失」实际不生效的问题（组件与 store 各维护一套计时器）——统一到 store 的 `pauseNotification/resumeNotification`；状态栏通知最多显示最近 3 条、长文案省略号截断并悬停可看全文；触屏设备上关闭按钮常显。
- **视觉优化**：首屏服务器页增加内容留白与已保存数量徽章；修复测试结果卡片标题栏配色因 SCSS `&` 嵌套写错而失效的问题；侧栏选中态与顶栏连接徽章精致化；全局补充键盘焦点环与选中文本配色。

## 全局健壮性修复记录（2026-08-12 第五轮）

对各端（Web / Win 桌面 / 安卓 / Cloudflare）做了全局排查与修复。**CF worker 为自包含实现，不依赖 core/server，本轮未改动 core/worker，CF 构建验证通过。**

### 鉴权链路（修复上一轮安全加固引入的零配置回归）
- 服务端未设置 AUTH_TOKEN 时不再整体禁用，而是**每次启动自动生成随机临时 token**（仍非开放中继），并在返回 index.html 时注入 `window.__WEBSSH_AUTH_TOKEN__` 交给前端（gzip 与非 gzip 路径都覆盖）；SPA 兜底收紧为仅 `/`、`/terminal`、`/sftp` 三条真实路由，任意路径不再回落到首页。
- 前端 token 解析支持：构建期 VITE_AUTH_TOKEN > 注入全局 > URL `?token=` > sessionStorage，服务重启换新 token 也不会被旧缓存卡死；`VITE_WS_BASE_URL` 自定义场景现在也会附带 token（此前会 401）。
- Win 桌面壳：启动时生成随机 token，经启动 URL 传给前端；Model API 同步在无该接口的后端（如 CF）上会误报成功，现按响应体校验失败并回滚开关。

### Win 桌面端
- 修复打包产物缺少 ssh2 依赖导致内嵌服务无法启动的问题：构建时用 esbuild 把服务端打包成单文件（复用 CF 构建已验证的 .node stub + ssh2 agent shim 方案，本地冒烟通过），main.js 优先加载 bundle、回退源码树；`WEBSSH_DIST_DIR` 显式指定前端目录。
- 单实例锁提到最前：第二次启动直接退出，不再误杀正在运行的第一个实例的端口（此前会打断活动 SSH 会话）；重复启动时重新打开页面；V8 堆上限 128MB→256MB 防多会话 OOM。

### 安卓 / Capacitor
- `capacitor.config.ts` webDir 由 `dist` 改为 `dist/client`（此前 `cap sync` 拷贝目录无 index.html，装包即白屏）。

### 终端与会话
- 断线自动重连：意外断开（切网/锁屏/服务端重启）按指数退避最多重连 5 次，认证类错误不重连；修复旧连接处于 CONNECTING 状态时的回调竞态（连接代数标记 + 统一清理）。
- SFTP 文件编辑改用 UTF-8 安全编解码（此前非 Latin-1 文件乱码、含中文保存直接抛错）；上传读取失败不再永久卡死；文件名不再被 `..` 清洗逻辑误伤。
- 终端滚动行数设置真正生效（此前设置项无任何消费者）；visualViewport 监听器随组件卸载释放。
- 宏录制从「假成功」变为真实录制：录制期间捕获终端键入、停止后回填宏编辑表单。

### 数据与稳定性
- 服务器列表 / 会话列表初始化的 JSON.parse 加保护（数据损坏不再导致启动白屏）；备份加密大文件 base64 转换改分块（几十 KB 以上备份不再栈溢出）；备份恢复代码笔记字段名修正（`command` 而非 `content`，此前永远恢复不出来）。
- 聊天面板 AI 执行 SSH 时凭据恒为空的问题修复（改从会话/本地凭据存储解析）；QQ 开关慢一拍（@input→@change）。
- 多处事件监听器泄漏修复（open-settings/open-macro、touchend）；标签重命名回车+失焦双触发修复；服务器列表键盘导航引用按连接 id 索引（跨分组索引冲突）。
- AI 聊天面板连接凭据、编辑连接的异步竞态（await 后再读取）。
