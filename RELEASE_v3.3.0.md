# WebSSH v3.3.0 — 六端统一 · 安全加固 · 体验重塑

一次全新基线发布：把过去所有迭代成果打包成 3.3.0，同时在**平台覆盖、安全、功能、体验**四个方向完成系统性升级。一个代码库，六种用法：Web、Windows、macOS、Android、iOS、Cloudflare。

---

## ✨ 亮点

- 🖥️ **六端统一**：Web / Windows 便携版 / macOS dmg / Android APK / iOS / Cloudflare Workers
- 🔐 **安全全面加固**：鉴权令牌去 URL 化、本地凭据 AES-GCM 加密、主密码一体化备份
- 📊 **FinalShell 式主机监控**：终端内实时查看 CPU / 内存 / 负载 / 磁盘 / 网速，免装 agent
- 🪟 **真分屏终端**：垂直 / 水平分屏，多会话同屏，分隔条可拖动
- 📱 **移动端重做**：卡片式服务器列表、抽屉式弹窗、触屏友好
- 🤖 **MCP 支持**：Claude / Cursor 可直接管理你的服务器

---

## 🖥️ 平台覆盖

| 平台 | 形态 | 获取方式 |
|---|---|---|
| Web | 浏览器 | `npm run dev:all` 或 Docker |
| Windows | 免安装便携版 | `npm run desktop` |
| macOS | dmg + zip（双架构） | `npm run desktop:mac`（需在 Mac 上执行） |
| Android | APK | `npm run cap:build:android` |
| iOS | Xcode 工程 | `npm run build && npx cap sync ios` |
| Cloudflare | Workers / Pages | `npm run worker:deploy` / `npm run pages:deploy` |

- **macOS 新增支持**：托盘、端口管理、图标全套适配
- **Android 深度适配**：边到边全屏、明文流量配置、键盘/状态栏插件、屏幕常亮、终端功能键栏
- **iOS 工程就绪**：ATS 例外、清除混合内容隐患、arm64 清单修正

## 🔐 安全

- **令牌去 URL 化**：WebSocket 鉴权令牌改走 `Sec-WebSocket-Protocol` 子协议传输，不再出现在 URL / 日志中（旧 query 方式保留为回退兼容）
- **本地凭据 AES 化**：本机记住的凭据升级为 AES-GCM（主密码 PBKDF2 派生），旧数据自动迁移
- **备份默认主密码加密**：跨端恢复只记一个密码；修改密码时已记住的凭据自动轮换重加密
- **忘记密码全清**：登录页一键清空全部本地数据，防止信息泄露
- **设备免密登录**：内网个人设备可「记住本设备」，下次打开免输密码
- **TOFU 主机密钥校验**：首次连接记录指纹，密钥变更即拒绝连接，防中间人

## 🚀 新功能

- **主机监控面板**：终端底部实时显示 CPU / 内存 / 负载 / 磁盘 / 网速 / 运行时长，含最近 2 分钟历史曲线，免 agent
- **终端真分屏**：垂直 / 水平两种布局，多会话同屏操作，分隔条拖动调比例，点选聚焦
- **SSH config 导入**：一键导入 `~/.ssh/config` 批量添加主机
- **MCP Agent 接入**：Claude / Cursor 等 MCP 客户端可列出服务器、探测、执行命令、增删服务器
- **内网地址发现**：设置页自动列出服务端局域网地址，点击复制，手机粘贴即连
- **备份多端通用**：加密备份文件任意端导出 / 导入 / 云同步
- **新手引导**：首次进入三步上手指南

## 🎨 体验

- **移动端 Termius 化**：卡片式服务器列表、全部弹窗底部抽屉化、输入防缩放、44px 触控目标
- **面板设计系统**：六个弹出面板统一视觉与交互
- **文件管理触屏优化**：操作按钮触屏常显、单击进目录
- **双语完整**：500+ 键位中英全覆盖

## ✅ 质量

- 服务端测试 **51 项全绿**；新增端到端冒烟测试 `npm run smoke`（真实起服务 + 模拟 SSH 目标全链路验证）
- 类型检查全量通过；Cloudflare Worker 保持独立实现，不受本次升级影响

## ⚠️ 升级须知

- **公网部署**：必须设置 `AUTH_TOKEN` 环境变量并启用 HTTPS，详见 `SECURITY.md`
- **旧凭据自动迁移**：首次打开新版本时，旧的本地凭据会自动升级为加密格式，无需手动操作
- **Cloudflare 用户**：重新部署即可（`npm run worker:deploy`），Worker 版本逻辑未变

## 📦 快速开始

```bash
git clone https://github.com/<你的用户名>/webssh.git
cd webssh
npm install
npm run dev:all     # 启动后端 + 前端，浏览器打开即可
```

---

完整变更细节见 [CHANGELOG.md](./CHANGELOG.md)；安全模型见 [SECURITY.md](./SECURITY.md)。
