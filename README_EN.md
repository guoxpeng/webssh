# 🚀 WebSSH v3.0 — All Your Servers in One Browser Tab

<p align="center">
  <a href="README.md">中文</a> | <a href="README_EN.md">English</a>
</p>

---

## 🤔 What is this?

Managing lots of servers?

- **Before**: Install bloated clients, memorize IPs, juggle windows 😫
- **Now**: Open a browser. All servers listed. **One click to connect** — no password re-entry needed.

---

## 🌟 Why WebSSH?

| Feature | 🏆 **WebSSH** | Termius | MobaXterm | PuTTY |
|------|:-----------:|:-------:|:---------:|:-----:|
| 100% Free | ✅ **Completely free** | ❌ Premium $$ | ❌ Premium $$ | ✅ |
| Browser-based | ✅ **No install** | ❌ | ❌ | ❌ |
| Works on phone/tablet | ✅ **All devices** | App required | ❌ | ❌ |
| AES-256 encrypted storage | ✅ **Military-grade** | ✅ | ❌ | ❌ |
| Master password | ✅ **Double encryption** | ✅ | ✅ | ❌ |
| **Standalone file manager** | ✅ **SFTP without SSH session** | ❌ | ❌ | ❌ |
| **Inline file editor** | ✅ **Double-click to edit remote files** | ❌ | ❌ | ❌ |
| **Macro: record + batch + schedule** | ✅ **Automate everything** | ❌ | ✅ | ❌ |
| **Docker management** | ✅ **View/start/stop/logs via web** 🐳 | ❌ | ❌ | ❌ |
| **Snippet pin-to-top & drag** | ✅ **Reorder favorite commands** | ✅ | ❌ | ❌ |
| Serial/UART | ✅ **COM port support** | ✅ | ✅ | ❌ |
| SSH tunneling (3 modes) | ✅ **Local / Remote / Dynamic** | ✅ | ✅ | ✅ |
| **Group drag-drop** | ✅ **Right-click full menu** | ✅ | ❌ | ❌ |
| Multi-tab terminal | ✅ **Drag reorder + color + rename** | ✅ | ✅ | ❌ |
| **Terminal search** | ✅ **Ctrl+F live search** | ❌ | ✅ | ❌ |
| 4 themes | ✅ **One click switch** | ✅ | ✅ | ❌ |
| i18n (English/Chinese) | ✅ **Built-in** | ❌ | ❌ | ❌ |
| **PWA desktop install** | ✅ **Like a native app** | ❌ | ❌ | ❌ |
| **Smart error messages** | ✅ **"Check IP / Verify password"** | ✅ | ❌ | ❌ |
| Cloudflare Workers | ✅ **Global edge deploy** | ❌ | ❌ | ❌ |
| Encrypted backup + sync | ✅ **Restore on any device** | ✅ | ❌ | ❌ |

---

## 🚀 Quick Start

### Docker (fastest)

```bash
docker run -d --name webssh -p 9627:9627 --restart=unless-stopped nameguoguo/webssh
```

Or with docker-compose:

```yaml
services:
  webssh:
    image: nameguoguo/webssh
    container_name: webssh
    restart: unless-stopped
    ports:
      - "9627:9627"
```

#### Advanced Docker (RDP/VNC + Docker management)

```yaml
services:
  webssh:
    image: nameguoguo/webssh
    restart: unless-stopped
    ports:
      - "9627:9627"
    environment:
      - GUACD_HOST=guacd
      - DOCKER_SOCKET=/var/run/docker.sock
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
  guacd:
    image: guacamole/guacd
    restart: unless-stopped
```

> guacd and docker.sock are optional. SSH/Telnet/Serial work without them.

### One-liner

```bash
curl -fsSL https://raw.githubusercontent.com/guoxpeng/webssh/main/scripts/deploy.sh | bash
```

### Manual

```bash
git clone https://github.com/guoxpeng/webssh.git
cd webssh && npm install && npm run build
node core/server/index.mjs
```

Open `http://localhost:9627`

### Cloudflare Workers (global edge deploy) ⚡

#### Pages (recommended)

Workers & Pages → Pages → Create → Connect Git

| Field | Value |
|------|-----|
| Build command | `npm run build && node core/build-worker.mjs` |
| Output directory | `dist/client` |
| Env `NODE_VERSION` | `20` |

#### Workers

Workers & Pages → Workers → Create → Connect Git

| Field | Value |
|------|-----|
| Build command | `npm run build && node core/build-worker.mjs` |
| Deploy command | `npx wrangler deploy` |
| Env `NODE_VERSION` | `20` |

> **CF Workers limitations**: No Telegram/WeChat/QQ bots (need Node.js long-polling), no AI chat. Use Docker/VPS for those.

### Dev mode

```bash
# Terminal 1: backend
node core/server/index.mjs

# Terminal 2: frontend (hot reload)
npm run dev
```

---

## 📖 How to Use

### 1. Set master password 🔐

First visit sets a master password to encrypt all stored server credentials.

### 2. Add a server

Fill hostname, username, password (or key), click **Connect**. Save it to skip password next time.

### 3. Organize groups

- Group servers (production / staging)
- **Drag** to reorder
- Right-click group: rename / delete / **connect all**
- **Pin** frequently used servers

### 4. Macros 🤖

Record commands → replay → **batch** across multiple servers → schedule

### 5. Shortcuts

- `Ctrl+F` search in terminal · `Ctrl+Tab` switch tabs

---

## 🤖 AI SSH Commands

Configure OpenAI API key in the chat panel to let AI generate and execute shell commands:

> Sidebar chat icon → switch to AI tab → fill API key + model → type "check disk usage"

---

## 🏗 Architecture

```
webssh/
├── web/                # Vue 3 + xterm.js frontend
├── core/
│   ├── server/          # Node.js backend
│   │   ├── index.mjs    # Routes, middleware, startup
│   │   └── lib/         # ssh / telnet / serial / sftp / chat / docker / session
│   ├── worker/          # Cloudflare Workers
│   └── build-worker.mjs
├── android/             # Android shell (source tracked)
├── docker/              # Docker configs
└── scripts/             # Deploy & icon utilities
```

---

## ⚙ Environment Variables

| Variable | Default | Description |
|------|------|------|
| `PORT` | `9627` | HTTP port |
| `AUTH_TOKEN` | (empty) | API auth token |
| `GUACD_HOST` | `127.0.0.1` | RDP/VNC proxy |
| `GUACD_PORT` | `4822` | guacd port |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker socket |

### Uninstall

```bash
cd webssh && bash scripts/uninstall.sh
```

---

## 🛠 Tech Stack

Vue 3 · xterm.js · WebSocket · ssh2 · AES-256-GCM · Bulma · Vite · Pinia · Capacitor · dockerode · guacd

---

> ⚠️ **Security**: Use inside intranet/VPN. For public access, set `AUTH_TOKEN` and enable HTTPS via reverse proxy.
