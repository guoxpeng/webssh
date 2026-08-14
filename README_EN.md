# WebSSH v3.6 — A Full SSH Workstation in Your Browser

<p align="center">
  <a href="README.md">中文</a> | <a href="README_EN.md">English</a>
  &nbsp;·&nbsp; <img alt="CI" src="https://github.com/guoxpeng/webssh/actions/workflows/ci.yml/badge.svg">
</p>

A ready-to-use web SSH client. Connect to servers, manage files, and run batch
commands — all from a browser tab. Ships as Windows / macOS desktop apps,
Android / iOS apps, Docker, and Cloudflare.

<img width="1920" height="960" alt="PixPin_2026-08-14_11-58-40" src="https://github.com/user-attachments/assets/d67f4727-7baa-45c9-a910-bd44626a6b12" />


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

### 1. Docker (recommended self-host)

**Steps:**

1. Run the container (set `AUTH_TOKEN` to your access password first):

```bash
docker run -d --name webssh -p 9627:9627 --restart=unless-stopped \
  -e AUTH_TOKEN=your_secret nameguoguo/webssh
```

2. (Optional) Manage with Docker Compose:

```yaml
services:
  webssh:
    image: nameguoguo/webssh
    container_name: webssh
    restart: unless-stopped
    ports:
      - "9627:9627"
    environment:
      - AUTH_TOKEN=your_secret
```

3. (Optional) To enable RDP/VNC remote desktop and Docker management, add the `guacd` service:

```yaml
services:
  webssh:
    image: nameguoguo/webssh
    restart: unless-stopped
    ports:
      - "9627:9627"
    environment:
      - AUTH_TOKEN=your_secret
      - GUACD_HOST=guacd
      - DOCKER_SOCKET=/var/run/docker.sock
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
  guacd:
    image: guacamole/guacd
    restart: unless-stopped
```

4. Open `http://localhost:9627`.

### 2. One-line Linux install

**Steps:**

1. Run the script:

```bash
curl -fsSL https://raw.githubusercontent.com/guoxpeng/webssh/main/scripts/deploy.sh | bash
```

2. The script installs dependencies, starts the service and generates an access password (see "Passwords at a glance").

### 3. Manual

**Steps:**

1. Clone:

```bash
git clone https://github.com/guoxpeng/webssh.git
```

2. Install and build:

```bash
cd webssh && npm install && npm run build
```

3. Start (set a fixed password for public deploys):

```bash
AUTH_TOKEN=your_secret node core/server/index.mjs
```

4. Open `http://localhost:9627`.

> 💡 You can delete the `AUTH_TOKEN=your_secret` part — the server auto-generates
> a temporary access password and hands it to the page, so the browser just works.
> Only set your own fixed password for public / phone / MCP access (see "Passwords at a glance").

### 4. GitHub Actions auto-build (push a tag → all-platform installers)

Pushing a version tag auto-builds and attaches every platform's artifact to a GitHub Release — no local toolchain needed.

**Steps:**

1. Commit and push your changes:

```bash
git add -A && git commit -m "release: v3.5.0"
```

2. Tag and push (triggers the full build):

```bash
git tag v3.5.0 && git push origin v3.5.0
```

3. Watch the "Build All Platforms" run under the Actions tab; artifacts are attached to the matching **Release** when it finishes.

Produces: **Windows portable** (exe) · **macOS** (dmg + zip, arm64/x64) ·
**Android APK** (debug-signed, installable) · **iOS unsigned build** (signing flow in `IOS-SIGNING.md`) · Docker image build self-check.
You can also trigger it manually (Build All Platforms → Run workflow).

### 5. Windows desktop

**Steps:**

1. Download the portable zip from a GitHub Release.
2. Unzip → run `WebSSH.exe` (Windows 10+ 64-bit, no runtime required).
3. Build yourself: `npm run desktop`.

### 6. macOS desktop

macOS 11+, Apple Silicon and Intel. Build **on a Mac**:

**Steps:**

1. Build (must run on macOS):

```bash
npm run desktop:mac
```

2. Outputs arm64/x64 dmg + zip in `release/`.

3. Unsigned builds: right-click → Open, or
   `xattr -dr com.apple.quarantine /Applications/WebSSH.app`.

4. To distribute, configure your Developer certificate under `mac` in `win/package.json` and rebuild.

### 7. Cloudflare Pages (serverless)

> ⚠ Public deploy — you MUST set a backend access password (env var `AUTH_TOKEN`,
> any password you choose); without it every API call is rejected. Only public
> servers are reachable.

**Steps:**

1. Fork this repo.

2. Create an R2 bucket `webssh-backups` (for cloud backups).

3. Workers & Pages → Create → Pages → connect the repo:
   - Build command: `npm run build && node core/build-worker.mjs`
   - Output directory: `dist/client`
   - Env var: `AUTH_TOKEN=<a password you choose>` (nothing to look up — pick one, remember it)

4. (Optional) Bind the R2 bucket as `BACKUP_BUCKET` under Functions → R2 bindings, redeploy.

5. (Optional, MCP / server registry) Create a KV namespace and bind it as
   `MODEL_REGISTRY` under Functions → KV bindings, then redeploy. Afterwards you
   can enable "sync servers to backend" in Settings and point the MCP bridge at
   this deployment.

6. **First use: fill in the access password under Settings (important!)**

   Cloudflare is a purely static build — the Worker's `AUTH_TOKEN` lives only in
   the cloud runtime and is **not automatically passed to the frontend**. After
   opening the deployment, go to **Settings → backend access password**, enter the
   same `AUTH_TOKEN` value you chose in step 3 and save. Otherwise the WebSocket
   is rejected for lack of auth and you'll see `WebSocket error` when connecting.
   (Leave the "backend address" empty — this is a same-origin deployment.)

   > 💡 To avoid entering it manually every time, bake the password into the
   > frontend at build time: add `VITE_AUTH_TOKEN=<your password>` to the build
   > command so every visitor's page automatically carries it.

   > ⚠ **`VITE_AUTH_TOKEN` and `AUTH_TOKEN` must BOTH be set and be IDENTICAL** —
   > one is the lock, the other is the key:
   >
   > - **`AUTH_TOKEN` (server) = the lock**: the Worker checks every request against it at runtime.
   > - **`VITE_AUTH_TOKEN` (frontend) = the key**: it's **baked into the frontend
   >   page at build time**, and the frontend uses it to unlock.
   >
   > If the two ever differ, the WebSocket will be rejected. If you later change
   > the `AUTH_TOKEN` (replace the lock), you MUST update `VITE_AUTH_TOKEN` to
   > match (issue a new key) AND **redeploy** for it to take effect — because
   > `VITE_AUTH_TOKEN` is written at build time, changing the env var without
   > redeploying leaves the old key in the page and connections still fail.

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
