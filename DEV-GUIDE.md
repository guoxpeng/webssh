# WebSSH 开发记忆库（Dev Guide）

> 本文件是项目长期维护的「记忆文件」：记录关键架构、约定、坑位与发版流程，
> 后续任何修改 / 升级 / 排查都先读这里。比 ARCHITECTURE.md 更偏「实操向」。

---

## 1. 项目速览

WebSSH —— 浏览器里的全能 SSH 工作站，一套代码跑通 **5 端**：

| 端 | 载体 | 关键差异 |
|---|---|---|
| **Web / CF Pages** | 浏览器 + Cloudflare Worker | 无 Node 后端，SSH 经 `cloudflare:sockets` 直连 |
| **Node 自建服务** | Docker / VPS（`core/server`） | 完整功能：ssh2 + guacd 远程桌面 + 聊天机器人 |
| **桌面端 Windows** | electron（`win/build.mjs`） | 内置 Node 后端，打包为 exe |
| **桌面端 macOS** | electron（`win/build-mac.mjs`） | 同上，zip-only |
| **安卓 APK** | Capacitor（`android/`） | 内置 JSch SSH 网关，仅监听 127.0.0.1 |

版本：**当前 v3.6.3**（2026-08）。仓库无外部 remote 历史，发版推
`https://github.com/guoxpeng/webssh` 的 main + tag。

---

## 2. 目录结构速查

```
core/
├── server/            # Node 后端（index.mjs 入口，lib/ 下 config/sftp/ssh/mcp-client/guacd）
├── worker/            # Cloudflare Worker（index.mjs，一个文件承载所有 CF 路由）
├── mcp/               # MCP stdio 服务（本机 agent 接入用）
├── shared/version.mjs # ★ 版本单一事实源
└── __tests__/         # server 侧 vitest（含 miniflare Worker 集成测试）
web/src/
├── views/             # 页面（mcp/ 下 4 页：Server/Client/Token/Status）
├── components/        # 组件（terminal/ connection/ sftp/ global/ mcp/ ...）
├── stores/            # Pinia（connection/terminal/mcp/backup/macro/snippet/codeNote/...）
├── services/          # WebSocket 服务（sshWebSocketService/sftpWsService/guacTunnel）
├── utils/             # ★ storage.ts（存储注册表唯一入口）、crypto.ts、api.ts
├── locales/           # zh-CN.ts / en-US.ts（i18n）
└── __tests__/         # web 侧 vitest（组件测试）
scripts/               # 质量门禁脚本（check-*.mjs）+ 图标生成 + e2e-ssh-server.mjs
win/                   # 桌面端（package.json 版本号 + build.mjs/build-mac.mjs）
android/               # Capacitor 安卓工程（app/build.gradle 版本号）
wrangler.toml          # CF 部署配置（R2 绑定 BACKUP_BUCKET、KV MODEL_REGISTRY 注释态）
.github/workflows/ci.yml
```

---

## 3. ★ 版本管理（发版必读）

**单一事实源**：`core/shared/version.mjs` 的 `WEBSSH_VERSION`。
`scripts/check-version.mjs` 强制以下四处一致（已串入 lint + postbuild）：

1. `core/shared/version.mjs`
2. `package.json` → `version`
3. `win/package.json` → `version`（electron-builder 盖章进 exe/dmg）
4. `android/app/build.gradle` → `versionName` + `versionCode`（check-dist 校验）

**发版升版本 = 四处一起改**，格式如 v3.6.3：android `versionCode` 用 `30603`
（3 位主 + 2 位次 + 2 位补丁）。

**硬编码守卫**：`check-version` 还会扫 `core/server/lib/mcp-client.mjs`、
`core/worker/index.mjs`、`win/build.mjs`、`win/build-mac.mjs`，发现
`version: 'x.y.z'` 字面量即报错——必须 `import { WEBSSH_VERSION }`。

**发版流程（已跑通 v3.6.3）**：
1. 改 4 处版本号 → `npm run lint`（check-version 通过）
2. `npm test` + `npm run typecheck` + `npm run build`（postbuild 自动跑
   build-worker + check-version + check-dist --web）
3. 本地提交 release 提交
4. **历史重建**：本地 main 是孤立快照历史，需基于上游重建——
   `git checkout -b release-x.y.z <上游main>` → `git read-tree <本地提交>` →
   `git checkout-index -a -f` → 提交 → 推 `release-x.y.z:main` → 打 tag
5. 推 `https://github.com/guoxpeng/webssh.git` main + tag（本机 `git push` 会被杀，
   走 API：`gh_push_api.py --repo guoxpeng/webssh`，**务必带 `--repo`**，
   脚本默认仓库是 `guoxpeng/https_ssl`）
6. **Docker 镜像不用手动发**：`.github/workflows/docker-publish.yml` 监听
   main 推送与 `v*` 标签，自动构建 amd64 + arm64 并推到 `nameguoguo/webssh`
   （标签取 package.json 版本号：`3.6.3` / `3.6` / `3`，外加 `main` 与 `latest`），
   同时把 `DOCKERHUB.md` 同步为 Hub 仓库说明。凭据是仓库 Secrets
   `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN`，已配好

---

## 4. ★ 四条质量门禁（改代码后必跑）

| 脚本 | 作用 | 触发点 |
|---|---|---|
| `check-storage.mjs` | 42 个存储键登记；**禁止在 storage.ts 之外直接读写 localStorage/sessionStorage** | lint + CI |
| `check-i18n.mjs` | 扫非 locale 文件的中文硬编码（69 web 文件 / 24 core 文件） | lint + CI |
| `check-version.mjs` | 版本四处一致 + 防硬编码版本 | lint + postbuild + CI |
| `check-dist.mjs` | 产物完整性 + bundle 版本比对；`--web` 模式跳过平台校验 | postbuild + CI |

- `npm run lint` = eslint(--fix) + 双 i18n + check-version + check-storage
- `npm run build` 的 postbuild = build-worker + check-version + check-dist --web
- i18n 硬编码豁免：行内 `// i18n-ignore`；测试文件可引用 UI 文案
- **新增存储键**：必须先在 `web/src/utils/storage.ts` 的 `STORAGE_KEYS` 注册
  （`key`/`area`/`purpose`，area 是真实存储区域，前缀键加 `prefix: true`）
- **新增中文 UI 文案**：写进 `web/src/locales/zh-CN.ts` + `en-US.ts`，代码里用
  `t('...')` 引用，不要直接写字面中文

---

## 5. 测试体系

**命令**：`npm test` = web 套件 + server 套件。单独跑：
- web：`npx vitest run`（21 文件 / 163 测试）
- server：`npx vitest run --config vitest.config.server.mjs`（13 文件 / 126 测试）
  - 其中 4 个 `worker-*.test.mjs` 是 **miniflare 集成测试**：真实 esbuild bundle
    Worker + 本地 mock 服务器（SSE/JSON MCP、ssh2 Server）+ 内存 KV/R2

**覆盖金字塔**（本仓库已建立的模式）：
- **组件测试**：面板交互（设置/解锁屏/备份/宏/收藏/模型管理/错误面板…）
- **状态机测试**：SSH 终端三层（sshWebSocketService + TerminalDisplay + 连接错误面板）
- **miniflare 集成**：Worker 的鉴权门 / SSE+JSON MCP 握手 / model API KV+AES /
  并发写锁 / 真实 SSH 成功路径 / R2 备份
- **变异验证习惯**：改完关键逻辑，故意注入一处破坏（改回旧逻辑/删保护），
  确认测试能抓住，再还原。grep `MUTATED_BUG` 确认零残留。

**测试基建注意**：
- miniflare 测试里 Worker 代码是**构建时**编译的（`node core/build-worker.mjs`），
  改 `core/worker/index.mjs` 后必须重建 bundle 测试才生效
- 并发竞争测试要「锁内 load 是第一个 await」，否则 miniflare 会把请求串行化，
  移除锁也测不出竞争

---

## 6. ★ 关键架构决策与坑位

### 6.1 存储键名（历史大坑，已根治）
曾经有个键名 `SESSION_STORAGE_*` 实际存在 localStorage，语义与真实存储 API 不符。
现在**所有存储读写必须走 `web/src/utils/storage.ts`**，area 在注册表声明、helper 自动路由。
改键名 = 注册表改名 + 保留旧键兼容读取 + 迁移逻辑（已有先例）。

### 6.2 密码体系（跨端免密解锁）
- 凭据：`AES-256-GCM`，`iv:tag:data` 三段 base64；本地 salt + 主密码派生密钥
- **安全/非安全上下文算法必须一致**（加密标记法处理，跨端解锁依赖此契约）
- CF 端 R2 存 `saveVerify`/`getVerify`（云端主密码校验哈希）；新设备 401 时
  提示云端已有主密码，**禁止静默覆盖**
- model API 的 AES 密钥派生 `SHA-256("webssh-model-v1:"+token)`，Node 与 Worker
  双向互解（测试锁定）

### 6.3 MCP（Model Context Protocol）
- 本地：`core/mcp/server.mjs` stdio 服务，是 `/api/model/*` 的桥接层
- CF Worker：`/api/mcp/clients/test|call` 客户端桥，**仅支持 streamable-HTTP/SSE**
  （stdio 被明确拒绝，返回精确诊断）
- `mcpParseSse` 按 SSE 规范解析：按空行分事件、`data:` 行 `\n` 拼接、过滤通知、
  按 id 匹配 JSON-RPC 响应（chunked 分帧测试锁定）
- 结果截断：`MCP_MAX_RESULT` = 65536 字节

### 6.4 Model API 并发（KV 读改写）
- KV 注册表读改写竞争曾导致 10 并发 save 只活 2 个 → 用**隔离内互斥锁**
  `withModelLock`（promise 链串行化「加载→修改→写回」临界区）
- probe 慢操作锁外跑快照，完成后**锁内按 id 合并**回写，不覆盖并发新增
- 多 isolate 共享 KV 需 Durable Object（代码注释已说明）

### 6.5 终端连接状态机（v3.6.3 修复的 bug）
TerminalDisplay 用**自己的** SshWebSocketService 连接，不经过 store 的
connectToShell——pane 连接成功/失败必须**同步更新 store 的 `connectionStatus`**，
否则连接失败后表单按钮永久禁用。测试：`terminalDisplayConnect.test.js` 锁定。

### 6.6 CF Worker 路由（`core/worker/index.mjs`）
- 所有 `/api/*` 和 `/ws/*` 走 AUTH_TOKEN 鉴权门（未配置 → 503 + 诊断）
- `/ws/ssh` 终端、`/ws/sftp` 文件、`/ws/guacd` 远程桌面、`/api/ssh/test`、
  `/api/sftp/`(501)、`/api/docker/`、`/api/model/`、`/api/mcp/`、
  `/api/cloud/backup`(R2)、`/api/diag`、`/api/chat/`(501)
- 部署：`npm run worker:deploy`（需 Paid 计划跑 cloudflare:sockets）
- CF Pages：`npm run pages:deploy`（`dist/client`）

### 6.7 Node 服务端（`core/server/`）
- 端口 `PORT`（默认 **9627**）、guacd `GUACD_PORT`（默认 4822）
- 环境变量：`AUTH_TOKEN`（必设，MCP 用固定密码）、`TRUST_PROXY`
- WS 端点：`/ws/ssh`、`/ws/sftp`、`/ws/guacd`
- 前端的 `VITE_WS_BASE_URL`/`VITE_API_BASE_URL` 指向后端（vite 代理在 vite.config）

### 6.8 构建产物路径（check-dist 校验）
- APK：`android/app/build/outputs/apk/debug/app-debug.apk`（`cap:build:android`）
- Electron：`release/win-unpacked/WebSSH.exe`、`release/webssh-win.zip`（`desktop`）
- macOS：`release/mac/WebSSH.app`（`desktop:mac`，zip-only）
- 图标：`android/app/src/main/res/mipmap-*/ic_launcher*.png`（`android:icons`）
- check-dist 是**条件式**：对应源目录存在才校验，纯 web 部署不误报

---

## 7. 常用命令速查

```bash
npm run dev          # 前端 vite（端口见 vite.config）
npm run dev:server   # Node 后端（9627）
npm run dev:all      # 前后端一起
AUTH_TOKEN=xxx npm run dev:server   # 固定密码（MCP/CF 契约需要）
npm run lint         # eslint + i18n + version + storage 全链
npm test             # web 163 + server 126
npm run typecheck    # vue-tsc --noEmit
npm run build        # vite build + postbuild（worker+version+dist 校验）
npm run worker:deploy / pages:deploy
npm run cap:build:android   # APK
npm run desktop / desktop:mac
node scripts/e2e-ssh-server.mjs   # 本地临时 SSH 服务器（浏览器 E2E 用）
```

**本地联调注意**：
- CF Worker 的 ssh2 客户端经 `cloudflare:sockets` 走 workerd，Node 后端走 ssh2
  原生——两端的加密/协议契约由双向互解测试锁定
- 预览/测试用 `AUTH_TOKEN=test-token-123` 之类固定值，勿用临时密码（MCP 契约）

---

## 8. 发版 Checklist（打 v3.6.4 时照此执行）

- [ ] `git status` 确认改动面；无未提交的敏感文件（token/password 扫描）
- [ ] 4 处版本号升位（version.mjs / package.json / win/package.json / android gradle）
- [ ] `npm run lint` 全链过（check-version 报 OK 即四处一致）
- [ ] `npm test` + `npm run typecheck` + `npm run build` 全绿
- [ ] 提交；基于上游 main 重建干净历史（见 §3 第 4 步）
- [ ] 推送 main + 打 tag，`git ls-remote` 验证
- [ ] Docker Hub 镜像自动构建（见 §3 第 6 步），确认 Actions 绿灯且
      Hub 上出现新版本标签；**若构建失败先看是不是 `.dockerignore` 又排掉了
      构建期需要的 scripts**
- [ ] 通知用户：CF Pages 自动部署 / 桌面 / APK 各自验证

---

## 9. 已知约束（别踩）

- **CI 不构建平台产物**：CI 的 `check:dist -- --web` 只验 web；APK/桌面产物
  校验在本地发版时用完整 `node scripts/check-dist.mjs`
- **miniflare 测试慢**：worker 测试每次真实构建 bundle + 起 mock 服务器，
  别在它们前面加无关 IO 用例
- **Windows 行尾**：仓库文件是 LF，git 会提示 CRLF 转换警告——正常，别管
- **`core/server/chat-config.json`**：本地运行时配置（含 telegram token），
  未纳入版本库，别提交
- **本机没有 Docker**：镜像只能在 GitHub Actions 上构建，别试 `docker build`
- **镜像构建的两个专属坑**：`.dockerignore` 排除了 `win/`、`android/`、`ios/`，
  所以 `check-version` / `check-dist` 必须 `existsSync` 守卫；同时 `scripts/*`
  要白名单放行 `deploy.sh`、`gen-icons.mjs`、`check-version.mjs`、`check-dist.mjs`
- **archive-local-snapshot 分支**：旧的孤立快照历史存档，仅回看用，
  别 merge 回 main
