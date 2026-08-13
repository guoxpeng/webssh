# iOS 签名与发布方案

本项目 iOS 端是标准 Capacitor 工程（`ios/App`，Bundle ID `com.webssh.app`，当前版本 3.5.0 build 1，iPhone + iPad 通用）。
GitHub 自动构建产出的是**未签名包**（`WebSSH-ios-unsigned.zip`）——iOS 系统要求所有应用必须签名才能安装，
本文档给出从"未签名包"到"装进手机 / 上架 App Store"的完整路径。

---

## 一、前置准备

| 项目 | 说明 |
|---|---|
| Apple 开发者账号 | 个人 / 组织均可，99 美元/年（[developer.apple.com](https://developer.apple.com)）。没有账号只能在自己设备做开发调试（7 天有效期） |
| Mac 电脑 | 签名与上传必须用 Xcode（macOS 13+，Xcode 15+） |
| Bundle ID | `com.webssh.app`。若你的开发者账号里该 ID 已被占用，需在 Xcode 里改成自己的（见文末常见问题） |

证书和描述文件**推荐用 Xcode 自动管理**（下文方式一），全程不用手动碰证书。

---

## 二、三种发布路径怎么选

| 路径 | 适合场景 | 设备限制 | 难度 |
|---|---|---|---|
| **TestFlight + App Store**（推荐） | 正式分发：TestFlight 内测（最多 1 万人）→ 审核上架 | 无限制 | ★★ |
| **Ad Hoc** | 小范围分发：把 ipa 直接发给指定设备 | 每年最多 100 台设备（按 UDID 注册） | ★★ |
| **Development** | 只装在自己 / 同事的开发机上调试 | 已注册设备 | ★ |

企业证书（Enterprise，299 美元/年）仅面向企业内部员工分发，申请门槛高，个人项目不适用，此处不展开。

---

## 三、方式一：Xcode 手动签名（推荐起步）

### 1. 打开工程

```bash
npm install
npm run build          # 构建前端
npx cap sync ios       # 同步到 iOS 工程
open ios/App/App.xcodeproj
```

### 2. 配置签名（一次性）

1. 左侧选中 **App** 工程 → **Signing & Capabilities** 标签
2. 勾选 **Automatically manage signing**
3. **Team** 下拉选你的开发者账号
4. 若提示 Bundle ID 冲突：把 `com.webssh.app` 改成你自己的（如 `com.你的域名.webssh`）
5. Xcode 会自动创建证书 + 描述文件，看到 "Signing Certificate: Apple Distribution" 即成功

### 3. 分发

**走 TestFlight / App Store：**

1. 顶部设备选择 **Any iOS Device (arm64)** → 菜单 **Product → Archive**
2. Archive 完成后弹出 Organizer → **Distribute App**
3. 选 **App Store Connect** → 一路默认（Upload）
4. 到 [App Store Connect](https://appstoreconnect.apple.com) 创建 App（Bundle ID 选同一个），
   在 TestFlight 页等构建处理完成（约 10-30 分钟）：
   - **内测**：TestFlight 添加测试员邮箱即可，无需审核（内部测试）或仅需轻量合规审查（外部测试）
   - **上架**：填写截图、描述、隐私政策 → 提交审核（一般 1-3 天）

**走 Ad Hoc：**

1. 先把目标设备的 UDID 注册到开发者账号（Devices 页面；设备在 [udid.io](https://udid.io) 或 iTunes 可查）
2. Archive → Distribute App → **Release Testing**（Ad Hoc）→ 导出得到 `.ipa`
3. 把 ipa 发给对方，用 [Apple Configurator](https://apps.apple.com/app/apple-configurator-2/id1037126344)
   或第三方工具（如爱思助手）安装

### 4. 版本号规则

每次上传 App Store Connect 前：

- **MARKETING_VERSION**（如 3.5.0）：对外版本号，发新版才变
- **CURRENT_PROJECT_VERSION**（如 1）：构建号，**每次上传必须递增**（同一版本号下构建号不能重复）

位置：Xcode 工程设置 → General → Identity。

---

## 四、方式二：命令行签名（适合固定流程）

前提是已有开发者证书（Xcode 自动管理过一次就有了）。

```bash
cd ios/App

# 1. 归档
xcodebuild -project App.xcodeproj -scheme App -configuration Release \
  -archivePath build/WebSSH.xcarchive archive \
  CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=你的团队ID

# 2. 导出 ipa（三选一）
# App Store：
xcodebuild -exportArchive -archivePath build/WebSSH.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/out \
  -exportMethod app-store
```

`ExportOptions.plist` 最小模板（Ad Hoc 把 method 改 `ad-hoc`）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store</string>
  <key>teamID</key><string>你的团队ID</string>
  <key>signingStyle</key><string>automatic</string>
  <key>stripSwiftSymbols</key><true/>
</dict>
</plist>
```

---

## 五、方式三：GitHub Actions 自动签名（进阶，可后期再做）

当前 CI 产出未签名包是刻意设计：签名材料（证书 + 密钥）属于高敏感凭据。
如果想让打 tag 直接产出签名 ipa，推荐 **fastlane match** 方案：

1. 准备一个私有仓库存放 match 加密后的证书（或用 App Store Connect API Key）
2. 仓库 Secrets 里配置：
   - `MATCH_PASSWORD`（match 加密口令）
   - `APPSTORE_CONNECT_API_KEY`（API Key，p8 文件内容，用于上传）
   - 或传统三件套：证书 p12、证书密码、描述文件
3. CI 的 ios 任务改为：`fastlane match appstore --readonly` → `xcodebuild archive` →
   `xcodebuild -exportArchive` → `fastlane run upload_to_testflight`

安全底线：证书与 API Key 只放 Secrets / 加密仓库，**永远不进代码仓库和构建产物**。

---

## 六、上架注意事项（针对本应用）

1. **App 类别**：工具 / 开发者工具
2. **隐私政策**：App Store 必填。本应用数据全部本地存储、不采集用户数据，
   隐私标签可全部选"不收集"；若使用云备份（R2），需说明用户主动上传的加密备份
3. **出口合规**：应用使用标准 HTTPS / SSH 加密，按苹果指引申报"使用标准加密"即可
4. **审核要点**：远程服务器管理类应用很常见，正常过审；
   确保 App 描述说明"需要用户自有服务器"，避免被误判为无效功能
5. **ATS 已配置**：工程里已加 `NSAllowsArbitraryLoads` 例外（SSH 服务器多为 HTTP/明文内网场景所需），审核时在备注里说明用途

---

## 常见问题

**Q：不改 Bundle ID 可以吗？**
同一个 Bundle ID 全球只能被一个开发者账号持有。`com.webssh.app` 若未被注册你可以先在
开发者账号 Identifiers 里抢注；已被别人占用就必须换成自己的。

**Q：没有开发者账号能装到手机吗？**
可以，但仅限开发调试：Xcode 登录免费 Apple ID → 真机运行，应用 7 天后失效需重装，
且不能分发给他人。

**Q：CI 的未签名包有什么用？**
验证构建产物完整性、在越狱设备上自行签名安装，或作为本地签名流程的输入
（仍建议直接用源码走 Xcode 签名，未签名包不能直接补签上架）。

**Q：版本号 3.5.0 上传时要改什么？**
MARKETING_VERSION 保持 3.5.0，把 CURRENT_PROJECT_VERSION 从 1 递增（每次上传 +1）。
