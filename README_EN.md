# WebSSH v3.5 — A Full SSH Workstation in Your Browser

<p align="center">
  <a href="README.md">中文</a> | <a href="README_EN.md">English</a>
  &nbsp;·&nbsp; <img alt="CI" src="https://github.com/guoxpeng/webssh/actions/workflows/ci.yml/badge.svg">
</p>

A ready-to-use web SSH client. Connect to servers, manage files, and run batch
commands — all from a browser tab. Ships as Windows / macOS desktop apps,
Android / iOS apps, Docker, and Cloudflare.

<img width="1214" alt="screenshot" src="https://github.com/user-attachments/assets/1a44d2b0-31df-41bd-a6ee-46a3e26e5a23" />

---

## ✨ Features

| Feature | Notes |
|---|---|
| **SSH terminal** | Tabs, split panes, auto-reconnect, themes, in-terminal search, mobile key bar |
| **Host monitor** | Live CPU / memory / load / disk / network / uptime bar per session (agentless) |
| **SFTP** | Browse, upload, download, rename, chmod, edit text files in place |
| **Batch ops** | Macros: record commands, run across many servers, scheduled tasks |
| **Snippets & history** | Saved commands, auto-recorded history, one-click resend |
| **Encrypted backups** | One-click encrypted backup; restore on any device |
| **SSH tunnels** | Local / remote / SOCKS5 dynamic forwarding |
| **MCP agent** | Let Claude / Cursor list servers and run commands via MCP |
| **Multi-protocol** | SSH / Telnet / serial; RDP / VNC handoff (with guacd) |
| **Audit log** | Connection & AI actions logged; filter / export / clear |
| **i18n** | Full English & Chinese UI, auto-detected |

## 📱 Clients

| Client | Form | Notes |
|---|---|---|
| Web | Any browser | PWA installable |
| Windows | Portable zip | Built-in server, tray app, no runtime needed |
| macOS | dmg / zip | Apple Silicon + Intel |
| Android | APK (Capacitor) | Point at any webssh server via Settings → Backend Gateway |
| iOS | Xcode build (Capacitor) | Same; ATS + touch already configured |
| Cloudflare | Workers / Pages | Serverless public deploy (reduced feature set) |

---

## 🚀 Deployment

### Docker (recommended)

```bash
docker run -d --name webssh -p 9627:9627 --restart=unless-stopped \
  -e AUTH_TOKEN=your_secret nameguoguo/webssh
```

### One-line Linux install

```bash
curl -fsSL https://raw.githubusercontent.com/guoxpeng/webssh/main/scripts/deploy.sh | bash
```

### Manual

```bash
git clone https://github.com/guoxpeng/webssh.git
cd webssh && npm install && npm run build
AUTH_TOKEN=your_secret node core/server/index.mjs
```

Open `http://localhost:9627`.

### Windows desktop

Windows 10+ 64-bit, no runtime required. Download the portable zip → run `WebSSH.exe`.
Build yourself: `npm run desktop`.

### macOS desktop

macOS 11+, Apple Silicon and Intel. Build **on a Mac**:

```bash
npm run desktop:mac
```

Outputs arm64/x64 dmg + zip in `release/`. Unsigned builds: right-click → Open, or
`xattr -dr com.apple.quarantine /Applications/WebSSH.app`.

### Cloudflare Pages (serverless)

> ⚠ Public deploy — you MUST set a backend access password (env var `AUTH_TOKEN`,
> any password you choose); without it every API call is rejected. Only public
> servers are reachable.

1. Fork this repo.
2. Create an R2 bucket `webssh-backups` (for cloud backups).
3. Workers & Pages → Create → Pages → connect the repo:
   - Build command: `npm run build && node core/build-worker.mjs`
   - Output directory: `dist/client`
   - Env var: `AUTH_TOKEN=<a password you choose>` (nothing to look up — pick one, remember it; the browser picks it up automatically)
4. (Optional) Bind the R2 bucket as `BACKUP_BUCKET` under Functions → R2 bindings, redeploy.
5. (Optional, MCP / server registry) Create a KV namespace and bind it as
   `MODEL_REGISTRY` under Functions → KV bindings, then redeploy. Afterwards you
   can enable "sync servers to backend" in Settings and point the MCP bridge at
   this deployment.

**CF limits**: RSA host keys only · CTR/CBC only (no AES-GCM) · no private IPs · 30s WS keep-alive · registry needs KV — `/api/model/*` returns 503 without the binding.

---

## 🔑 Passwords at a glance

| Password | Purpose | Where |
|---|---|---|
| **Master password** | Unlocks the app; encrypts stored credentials; default backup key | First launch; Settings → Change password |
| **Backend access password** (env var `AUTH_TOKEN`) | The key to the server API; required for public deploys | Any password you choose, set at deploy; **optional** — auto-generated if unset, see below |
| **Backup password** | Encrypts backup files; defaults to master password | Chosen at backup creation |

**Do you need to obtain the backend access password somewhere? No — it is just a
password you choose yourself** (e.g. `MyServer@2026`), written into the deploy
config as `AUTH_TOKEN=<your password>`.

- **Works with nothing set**: the server auto-generates an ephemeral password on
  startup and hands it to the page — open the browser and use it, nothing to type.
  It changes on every restart.
- **When to set a fixed one**: public deploys (required); phone/remote devices
  connecting to this server; MCP integration (Claude / Cursor need it).

- **LAN use** (desktop / Docker / phones): backups are encrypted with the master
  password, so restoring on any device only needs that one password.
- **Public use** (Linux / CF): the backend access password is the "login" secret.
  Set the master password equal to it and you only ever remember one password.
- Backup files are portable across all clients.

## 📲 Connect a phone to a LAN server

1. Run webssh on a PC / NAS (Docker or desktop app).
2. Desktop → Settings → Backend Gateway shows the **server's LAN address** — click to copy.
3. On the phone app, paste it into Settings → Backend Gateway + enter AUTH_TOKEN.

## 🤖 MCP agent

Copy the snippet from Settings → MCP Connection into Claude Desktop / Claude Code / Cursor:

```json
{
  "mcpServers": {
    "webssh": {
      "command": "node",
      "args": ["webssh/core/mcp/server.mjs"],
      "env": { "WEBSSH_URL": "http://127.0.0.1:9627", "WEBSSH_TOKEN": "your_AUTH_TOKEN" }
    }
  }
}
```

Tools: list servers, probe connectivity, run commands, add/remove servers. See [MCP.md](MCP.md).

---

## Quick start

1. Set a **master password** on first launch (encrypts credentials, never leaves your device).
2. Fill in host / port / user / password (or key) and connect.
3. Save connections for one-click reconnect; drag to group.
4. Watch live host stats in the terminal status bar; manage files in SFTP.
5. Record macros and run them across many servers, on a schedule.

## 🧑‍💻 Development

```bash
npm install
npm run dev:all        # backend :9627 + frontend HMR :5173
npm test               # frontend + server tests
npm run typecheck      # type check
npm run worker:build   # CF worker build
```

**Stack**: Node.js (http + ws + ssh2, no framework) · Vue 3 + Pinia + Bulma + xterm.js ·
Electron (Win/mac) · Capacitor (Android/iOS) · Cloudflare Workers (standalone).

## 📄 Docs

[SECURITY.md](SECURITY.md) · [ARCHITECTURE.md](ARCHITECTURE.md) ·
[MCP.md](MCP.md) · [CHANGELOG.md](CHANGELOG.md)

---

[AGPL-3.0 License](LICENSE).

> **Security**: WebSSH assumes a LAN/VPN by default. For public deploys you must set
> `AUTH_TOKEN` and use HTTPS. Audit logs never contain passwords, keys, or session data.
