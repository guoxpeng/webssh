# WebSSH v3.6.0 — 安卓内置 SSH · Termius 式界面 · 移动端键盘重做

本版本让安卓 APK **无需部署任何后端即可直连服务器**（内置 Java SSH 网关），
界面按 Termius 风格全面重构，移动端终端键盘体验重做，并补齐 iOS 品牌资源与
「外网访问家里内网」的免费方案文档。

---

## ✨ 本版本亮点

- 📱 **安卓内置 SSH 网关**：APK 内嵌 WebSocket→SSH 网关（JSch），支持密码 / 私钥 /
  键盘交互认证、终端、SFTP、主机资源监控；仅监听本机回环，不开任何对外端口。
  设置里一键开启，手机直连服务器，零部署
- 🧭 **Termius 式侧栏**：主机 / 终端 / SFTP / 端口转发 / 代码片段 / 密钥链 / 历史 /
  已知主机 / 设置 / 帮助与反馈 十项主导航；AI 助手 / 代码笔记 / 宏 / 备份 / 审计
  收进「更多工具」
- 🗂️ **五个新板块**：端口转发独立页、密钥链（本地密钥库并可在连接表单一键选用）、
  连接历史、已知主机（网关 TOFU 指纹）、帮助与反馈
- ⌨️ **移动端键盘重做**：新增高频符号快捷键行（`/ . - _ : | > < ~ * & ?`）、
  Ctrl 快捷键行横向滑动、点按终端可靠唤起软键盘、终端窗口尺寸实时同步远端
- 🎨 **连接表单三段式重构**：基本信息 / 连接配置 / 认证方式分组，分段控件视觉，
  更清爽的间距与圆角
- 🖼️ **品牌资源补齐**：APK 全套图标（5 密度 × 3 形态）、iOS 图标与启动图
- 🌐 **外网访问家里内网（免费方案）**：新增 `REMOTE-ACCESS.md`——家里部署网关 +
  cloudflared 免费隧道，人在外面也能管内网服务器，不开端口不花钱
- 🔧 **服务端**：新增 `/api/known-hosts` 接口；CF 端连接内网/超时报错给出可操作指引

## 🐛 关键修复

- 安卓：`BridgeActivity.onDestroy()` 在新版 Capacitor 为 final，改用生命周期回调关闭网关
- WebSocket 握手子协议参数类型修正（Draft_6455 需 IProtocol 对象）
- 资源监控消息固定 `type` 键序，兼容前端前缀匹配
- macOS CI：`macos-13` runner 已退役导致构建永久排队——迁移到 arm64 runner 并改
  zip-only 产出，绕开 Apple Silicon 上 DMG `hdiutil detach` 的已知失败
- 内置 SSH 开关仅在安卓显示（iOS 无对应原生实现）

---

## 🖥️ 平台覆盖

| 平台 | 形态 | 获取方式 |
|---|---|---|
| Web | 浏览器 | `npm run dev:all` 或 Docker |
| Windows | 免安装便携版 | 打 tag 自动构建 |
| macOS | zip（arm64，CI）/ dmg+zip 双架构（本地 Mac） | 打 tag 自动构建 |
| Android | APK（内置 SSH） | 打 tag 自动构建 |
| iOS | 未签名包 | 打 tag 自动构建 |
| Cloudflare | Workers / Pages | `npm run worker:deploy` / Pages 自动部署 |

> 🤖 **自动构建**：`git tag v3.6.0 && git push origin v3.6.0`，GitHub Actions
> 自动产出全部安装包并附加到 Release。
