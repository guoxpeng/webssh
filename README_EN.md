# WebSSH - Manage Servers Like Opening a Web Page

> **Security Notice:** WebSSH is **recommended for use within an intranet/VPN**. Do not expose it directly to the public internet. If public access is required, set the `AUTH_TOKEN` environment variable and enable HTTPS (reverse proxy with TLS certificate). The default deployment does not include multi-user or audit logging.

Managing multiple remote servers?

- Before: Install clients, remember IPs, juggle windows.
- Now: **Open a browser**, all servers listed, **click to connect**.

---

## Why WebSSH?

### Free & Open Source

Built with Vue 3 + xterm.js + ssh2. Licensed under AGPL-3.0.

### Web-Based, No Installation

Windows, Mac, Linux, iPad — any device with a browser. Can also be **installed as a PWA** like a native app.

### Secure by Default

- Credentials encrypted with **AES-256-GCM**
- Master password protection (PBKDF2 + SHA-256 integrity checks)
- Optional `AUTH_TOKEN` for API/WebSocket authentication

### Feature-Rich

- SSH / Telnet / Serial / VNC / RDP connections
- Web Terminal (Ctrl+F search, customizable font/cursor)
- SFTP file manager (browse, upload, download, **inline editing**)
- SSH tunnels (local, remote, dynamic)
- **Docker container management** (start/stop/logs)
- **Macro recording / automation** (record, replay, batch execute, scheduled tasks)
- Command snippets (favorites, one-click send)
- **Server grouping** (drag-and-drop, pin to top, right-click menu)
- Encrypted backup + **auto cloud sync (WebDAV)**
- Multi-tab terminal with **drag-to-reorder + tab coloring**
- Chinese/English UI + 4 theme presets
- **PWA installable** to desktop
- Touch support for mobile devices

---

## Quick Start

### Docker (Fastest, No Node.js Required)

```bash
docker run -d --restart=unless-stopped --name webssh -p 9627:9627 nameguoguo/webssh
```

### One-Click Script

```bash
curl -fsSL https://raw.githubusercontent.com/guoxpeng/webssh/main/deploy.sh | bash
```

### Manual Installation

```bash
git clone https://github.com/guoxpeng/webssh.git
cd webssh
npm install
npm run build
node server/index.mjs
```

Open `http://localhost:9627`

### Deploy to Cloudflare Workers

```bash
npm run build && node build-worker.mjs && npx wrangler deploy
```

> **Limitations:** SSH connection requires Workers Paid plan (cloudflare:sockets). Not available on Workers Free plan. Use Docker/VPS deployment for full functionality.

---

## Usage

1. **Set a master password** on first launch — used to encrypt saved credentials.
2. **Add a server** — name, host/IP, port, username, password or private key.
3. **Connect** — click the server to open a terminal session.
4. **Manage** — create groups, drag servers, pin favorites.
5. **Automate** — record macros, batch execute, schedule recurring tasks.

### Shortcuts

- `Ctrl+F` — search terminal output
- `Ctrl+P` — command palette / macro panel
- `Ctrl+Tab` — switch terminal tabs

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `9627` | HTTP server port |
| `WS_PATH` | `/ws/ssh` | WebSocket path |
| `AUTH_TOKEN` | (empty) | Optional API Bearer Token for auth |
| `GUACD_HOST` | `127.0.0.1` | guacd RDP/VNC proxy address |
| `GUACD_PORT` | `4822` | guacd port |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker socket path |

---

## Architecture

```
server/
├── index.mjs          # Entry: routes, middleware, startup
└── lib/
    ├── config.mjs     # Constants (port, path, algorithms)
    ├── utils.mjs      # Utilities (JSON, rate limit, static files)
    ├── session.mjs    # SSH session management (SFTP reuse)
    ├── ssh.mjs        # SSH WebSocket handler
    ├── telnet.mjs     # Telnet handler
    ├── serial.mjs     # Serial port handler
    └── chat.mjs       # Chat bot (Telegram/WeChat/QQ/AI)
```

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| Vue 3 | Frontend framework |
| xterm.js | Terminal emulation in browser |
| WebSocket | Real-time bidirectional communication |
| ssh2 | Node.js SSH client |
| AES-256-GCM | Credential and backup encryption |
| Bulma | CSS framework |
| Vite | Build tool |
| Pinia | State management |
| dockerode | Native Docker API (optional) |
| guacd | RDP/VNC proxy (optional) |

---

## License

AGPL-3.0 License. See [LICENSE](./LICENSE).
