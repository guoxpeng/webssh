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

### Dev mode

```bash
# Terminal 1: backend
node core/server/index.mjs

# Terminal 2: frontend (hot reload)
npm run dev
```

---

## 🏗 Architecture

```
webssh/
├── web/                # Vue 3 + xterm.js frontend
│   └── src/
│       ├── components/terminal/   # Terminal component
│       ├── components/sftp/       # SFTP file browser
│       ├── components/snippets/   # Command snippets
│       ├── stores/                # Pinia state
│       └── locales/               # i18n translations
├── core/
│   ├── server/          # Node.js backend
│   │   ├── index.mjs    # Route entry
│   │   └── lib/         # SSH/Telnet/Serial/SFTP/Docker handlers
│   ├── worker/          # Cloudflare Workers
│   └── build-worker.mjs # Worker build script
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
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker socket |

---

## 🛠 Tech Stack

Vue 3 · xterm.js · WebSocket · ssh2 · AES-256-GCM · Bulma · Vite · Pinia · Capacitor

---

> ⚠️ **Security**: Use inside intranet/VPN. For public access, set `AUTH_TOKEN` and enable HTTPS via reverse proxy.
