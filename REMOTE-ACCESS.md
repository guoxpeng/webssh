# 外网访问家里内网服务器（免费方案）

> 场景：人在外面（酒店 / 国外 / 4G 网络），想用 webssh 管理**家里内网**的服务器。
> 方案：家里部署一台常驻的 webssh 网关，用 **Cloudflare 免费隧道**暴露出去；
> 外面的浏览器 / 手机 APK 通过「后端网关地址」连到它。**不需要公网 IP、不开路由器端口、不花钱。**

## 原理

```
[外面的浏览器 / APK] ──加载界面──▶ [CF Pages（或任意静态托管）]
        │
        └──wss（访问口令）──▶ [家里网关的隧道地址] ──ssh──▶ [内网设备]
                                   ▲
              cloudflared 从家里主动向 Cloudflare 拨出，
              家里不需要开放任何入站端口
```

两条关键结论：

1. **CF 部署的 webssh 连不了内网**——它的连接从公有云发起，物理上够不到你的内网。
   界面里弹出的「检测到局域网连接」警告说的就是这件事。
2. **内网连接必须由"在内网里的程序"发起**——所以家里要跑一个 webssh 网关，
   由它去连内网设备；外面的客户端只负责连这个网关。

## 第一步：在家里部署 webssh 网关

找一台**常开**的设备（NAS / 闲置电脑 / 树莓派均可），用项目自带的 compose 文件：

```bash
cd docker
# 编辑 docker-compose.yml：取消 AUTH_TOKEN 注释并设一个强密码（公网可达后这是唯一门禁）
docker compose up -d
```

本机验证：`curl http://127.0.0.1:9627/health` 应返回 `{"status":"ok",...}`。

## 第二步：用 cloudflared 免费隧道暴露网关

在同一个 compose 里加一个 cloudflared 服务（二选一）：

**方式 A：命名隧道（推荐，地址固定）**

1. 登录 Cloudflare Zero Trust 控制台 → Networks → Tunnels → 创建隧道，拿到 **token**；
2. 在隧道里添加 Public Hostname：`https` → `webssh:9627`（若域名已接入 CF 可直接绑子域名）；
3. compose 追加：

```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: webssh-tunnel
    restart: unless-stopped
    command: tunnel --no-autoupdate run --token <你的TUNNEL_TOKEN>
```

**方式 B：临时隧道（免注册试用，地址每次重启会变）**

```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: webssh-tunnel
    restart: unless-stopped
    command: tunnel --no-autoupdate run --url http://webssh:9627
```

启动后在 cloudflared 日志里找到分配的 `https://xxx.trycloudflare.com` 地址。

`docker compose up -d` 后，用手机流量访问该地址应能看到 webssh 界面。

## 第三步：在外面接入

**浏览器（含 CF 部署的界面）**：打开 webssh → 设置 →
「后端网关地址」填 `https://你的隧道地址`（不带路径）→
「后端访问密码」填第一步设置的 AUTH_TOKEN → 保存。
此后新建的终端 / 文件管理连接都经家里网关走，内网 IP 随便填。

**安卓 APK**：设置里同样填「后端网关地址 + 访问密码」即可；
也可以不填、直接开「内置 SSH 服务」——前提是**手机本身在家里内网**
（内置 SSH 是手机直连目标，人在外面时用不了）。

## 常见问题

- **家里设备关机 / 断网就连不上？** 是。隧道的生命线是家里那台设备在线，
  请在路由器里给它固定 IP 并保证常开。
- **临时隧道地址老变？** 换方式 A 的命名隧道，地址固定。
- **为什么不让 CF 部署直接中转回家里？** 需要付费的 Workers + Durable Objects
  才能做有状态中转；而「家里网关 + 免费隧道」不花钱、不开端口，效果更好。
- **安全吗？** 隧道只有出站连接，家里没有开放任何入站端口；
  公网侧唯一入口受 AUTH_TOKEN 保护——请务必用强密码。
- **设置面板里的「局域网地址」不显示了？** 该提示走 `/api/` 接口，
  跨源访问时被浏览器拦截，属已知限制，不影响终端与文件管理。

## 后续计划（Backlog）

- **跳板机连接（借鉴 Termius Jump host）**：内置 SSH 支持经一台可达主机中转
  连接目标（手机 → 公网 VPS → 内网服务器）。适合"有公网 VPS + 家里服务器与它
  组了 WireGuard/内网互通"的用户，家里无需部署任何东西。实现要点：连接配置增加
  跳板机字段；`SshConnections` 先建跳板 session，再经 `direct-tcpip` 通道连目标
  （JSch 原生支持）。优先级：低——当前 cloudflared 方案已覆盖远程访问需求。

## English Summary

To manage home-LAN servers from anywhere without paying anything:
run a webssh gateway on an always-on home device, expose it with a free
Cloudflare Tunnel (outbound-only, no open ports), then set that tunnel URL
plus your AUTH_TOKEN under Settings → Backend Gateway on any client
(browser or Android APK). The Cloudflare-hosted deployment cannot reach
private networks itself — the home gateway does the actual SSH.
