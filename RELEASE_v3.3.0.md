# WebSSH v3.3.0 — 六端统一 · 安全加固 · 体验重塑

一次全新基线发布：一个代码库，六种用法 —— **Web / Windows / macOS / Android / iOS / Cloudflare**。在平台覆盖、安全、功能、体验四个方向完成系统性升级。

## ✨ 亮点

- 🖥️ **六端统一**：Web、Windows 便携版、macOS dmg、Android APK、iOS、Cloudflare Workers
- 🔐 **安全全面加固**：鉴权令牌去 URL 化、本地凭据 AES-GCM 加密、TOFU 主机密钥校验
- 📊 **FinalShell 式主机监控**：终端内实时查看 CPU / 内存 / 负载 / 磁盘 / 网速，免装 agent
- 🪟 **真分屏终端**：垂直 / 水平分屏，多会话同屏，分隔条可拖动
- 📱 **移动端重做**：卡片式服务器列表、抽屉式弹窗、触屏友好
- 🤖 **MCP 支持**：Claude / Cursor 等客户端可直接管理你的服务器

## 🖥️ 平台覆盖

| 平台 | 形态 | 获取方式 |
|---|---|---|
| Web | 浏览器 | `npm run dev:all` 或 Docker |
| Windows | 免安装便携版 | `npm run desktop` |
| macOS | dmg + zip（双架构） | `npm run desktop:mac`（需在 Mac 上执行） |
| Android | APK | `npm run cap:build:android` |
| iOS | Xcode 工程 | `npm run build && npx cap sync ios` |
| Cloudflare | Workers / Pages | `npm run worker:deploy` / `pages:deploy` |

## 🔐 安全

- **令牌去 URL 化**：WebSocket 鉴权令牌改走 `Sec-WebSocket-Protocol` 子协议，不再出现在 URL / 日志中（旧方式保留为回退兼容）
- **本地凭据 AES-GCM 加密**：主密码 PBKDF2 派生，旧数据自动迁移
- **备份默认主密码加密**：跨端恢复只记一个密码；改密时已记住凭据自动轮换重加密
- **忘记密码全清**：登录页一键清空全部本地数据
- **设备免密登录**：内网个人设备可「记住本设备」
- **TOFU 主机密钥校验**：首次连接记录指纹，密钥变更即拒绝连接，防中间人

## 🚀 新功能

- **主机监控面板**：终端底部实时 CPU / 内存 / 负载 / 磁盘 / 网速 / 运行时长，含 2 分钟历史曲线，免 agent
- **终端真分屏**：垂直 / 水平布局，分隔条拖动调比例，点选聚焦
- **SSH config 导入**：一键导入 `~/.ssh/config` 批量添加主机
- **MCP Agent 接入**：列出服务器、探测、执行命令、增删服务器
- **内网地址发现**：设置页自动列出服务端局域网地址，手机粘贴即连
- **加密备份多端通用**：任意端导出 / 导入 / 云同步
- **新手引导**：首次进入三步上手

## 🎨 体验

- 移动端 Termius 化：卡片列表、底部抽屉弹窗、44px 触控目标、输入防缩放
- 六个弹出面板统一设计系统
- 文件管理触屏优化：操作按钮常显、单击进目录
- 500+ 文案中英双语全覆盖

## ✅ 质量

- 服务端测试 51 项全绿
- 新增端到端冒烟测试：`npm run smoke`
- 类型检查全量通过

## 🚀 快速开始

```bash
git clone https://github.com/guoxpeng/webssh.git
cd webssh
npm install
npm run dev:all     # 浏览器打开即可
```

## ⚠️ 升级须知

- **公网部署**：必须设置 `AUTH_TOKEN` 环境变量并启用 HTTPS，详见 `SECURITY.md`
- **旧凭据**：首次打开自动升级为加密格式，无需手动操作
- **Cloudflare 用户**：重新部署即可，Worker 逻辑未变

---

📦 源码包 SHA-256：`a97726355f87c541d86d0931d00b4b780c21773be1c735219405828617d125f6`

完整变更见 [CHANGELOG.md](./CHANGELOG.md)，安全模型见 [SECURITY.md](./SECURITY.md)。