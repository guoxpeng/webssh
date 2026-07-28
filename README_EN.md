# WebSSH v3.1 — SSH Client in Your Browser

<p align="center">
  <a href="README.md">中文</a> | <a href="README_EN.md">English</a>
</p>

---

## Overview

WebSSH is a web-based SSH client that runs in your browser. No local terminal emulator required. Connect to servers, transfer files, manage Docker containers, and automate batch operations — all from a browser tab. Supports Docker deployment, Windows desktop client, and Cloudflare Workers.

---

## Feature Comparison

| Feature | WebSSH | Termius | MobaXterm | PuTTY |
|---|---|---|---|---|
| License | Free (no limitations) | Subscription (Premium required) | Shareware (Premium required) | Free |
| Runtime | Browser / Desktop app | Native client required | Native client required | Native client required |
| Cross-platform | Desktop, mobile, tablet | Separate apps per platform | Windows only | Windows only |
| Credential encryption | AES-256-GCM | Supported | Not supported | Not supported |
| Master password | Supported | Supported | Supported | Not supported |
| File manager (SFTP) | Independent of SSH session | Requires SSH connection | Requires SSH connection | Third-party tool required |
| Remote file editing | In-browser inline editor | Not supported | Supported | Not supported |
| Batch execution & scheduling | Record → Replay → Batch → Schedule | Not supported | Supported (scripting) | Not supported |
| Docker management | In-browser container management | Not supported | Not supported | Not supported |
| SSH tunneling | Local / Remote / Dynamic forwarding | Supported | Supported | Supported |
| Group management | Drag & drop, context menu | Supported | Not supported | Not supported |
| Multi-tab terminal | Drag reorder, color, rename | Supported | Supported | Not supported |
| Terminal search (Ctrl+F) | Supported | Not supported | Supported | Not supported |
| Theme system | 4 presets | Supported | Supported | Not supported |
| Multi-language UI | English / Chinese | English | English | English |
| PWA desktop install | Supported | Not supported | Not supported | Not supported |
| Error diagnostics | Human-readable messages | Supported | Not supported | Not supported |
| Encrypted backup & sync | Supported | Supported | Not supported | Not supported |
| AI command generation | OpenAI API integration | Not supported | Not supported | Not supported |

---

## Deployment

### Docker (recommended)

```bash
docker run -d --name webssh -p 9627:9627 --restart=unless-stopped nameguoguo/webssh
```

Docker Compose:

```yaml
services:
  webssh:
    image: nameguoguo/webssh
    container_name: webssh
    restart: unless-stopped
    ports:
      - "9627:9627"
```

For RDP/VNC proxy and Docker socket access:

```yaml
services:
  webssh:
    image: nameguoguo/webssh
    container_name: webssh
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
    container_name: guacd
    restart: unless-stopped
```

### One-click Linux deployment

```bash
curl -fsSL https://raw.githubusercontent.com/guoxpeng/webssh/main/scripts/deploy.sh | bash
```

### Manual installation

```bash
git clone https://github.com/guoxpeng/webssh.git
cd webssh && npm install && npm run build
node core/server/index.mjs
```

Open `http://localhost:9627` in your browser.

### Windows Desktop Client

#### System Requirements

- Windows 10 64-bit or later
- No Node.js or additional runtime required — the executable is self-contained.

#### Download

| Package | Location |
|---|---|
| Portable (zip) | `release/WebSSH-portable.zip` — extract and run `WebSSH.exe` |

#### Build from source

```bash
npm run desktop
```

---

## Cloudflare Version

Deploy WebSSH on Cloudflare Workers/Pages — no server required, leverage Cloudflare's global network for SSH access.

> **Note:** Cloudflare Workers cannot connect to private IP addresses (192.168.x.x, 10.x.x.x, 172.16-31.x.x). For LAN servers, use the Docker deployment or Windows desktop client.

### Prerequisites

- A Cloudflare account
- **Pages deployment**: Free, no credit card required
- **Workers deployment**: Workers Paid plan required (`cloudflare:sockets` API requires paid subscription)
- [Node.js](https://nodejs.org/) >= 18 + npm

### 1. Create R2 Bucket

The backup feature requires an R2 storage bucket:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **R2** → **Create bucket**
3. Name it **`webssh-backups`** (region: default)
4. Click **Create bucket**

### 2. Clone & Install

```bash
git clone https://github.com/guoxpeng/webssh.git
cd webssh
npm install
```

### 3. Configure Deployment

The `wrangler.toml` file at the project root contains all configuration:

```toml
name = "webssh"
compatibility_date = "2026-07-23"
compatibility_flags = ["nodejs_compat"]

pages_build_output_dir = "dist/client"

[[r2_buckets]]
binding = "BACKUP_BUCKET"
bucket_name = "webssh-backups"
```

**Key points:**
- `compatibility_flags`: Must include `nodejs_compat` — required for ssh2's Node.js built-in modules to work
- `bucket_name`: Must match the R2 bucket name you created in step 1
- `pages_build_output_dir`: Keep as `dist/client`

### 4. Build Worker Bundle

Build the frontend and package the Worker script (includes crypto polyfill, WebSocket handlers, R2 backup API):

```bash
npm run build && node core/build-worker.mjs
```

This command:
1. Builds frontend static assets via Vite → `dist/client/`
2. Bundles the Worker script (`core/worker/index.mjs`) via esbuild → `dist/client/_worker.js`
3. Injects crypto polyfill (ECDH + DH + RSA verify + AES GCM→CTR/CBC downgrade) for Cloudflare workerd runtime compatibility

### 5. Deploy

#### Option A: Cloudflare Pages (recommended)

```bash
npm run pages:deploy
```

Equivalent to:
```bash
npm run build && node core/build-worker.mjs && wrangler pages deploy dist/client --project-name=webssh
```

The first deploy will prompt you to log in to Cloudflare and authorize. You'll get a `*.pages.dev` URL.

> **Adding R2 binding in Pages Dashboard:**
> The `[[r2_buckets]]` config in `wrangler.toml` must also be configured manually in the Pages Dashboard:
> 1. Go to Pages project → **Settings** → **Functions** → **R2 bucket bindings**
> 2. Click **Add binding**, variable name: `BACKUP_BUCKET`, R2 bucket: `webssh-backups`
> 3. Save and redeploy

#### Option B: Cloudflare Workers (Paid plan required)

```bash
npm run worker:deploy
```

Equivalent to:
```bash
npm run build && node core/build-worker.mjs && wrangler deploy
```

> **Note:** Workers deployment requires a Paid plan ($5+/month) because SSH connections depend on the `cloudflare:sockets` API, which is unavailable on the free plan.

### 6. Verify

Open `https://your-project.pages.dev`. You should see the WebSSH login screen.

**Quick checks:**
- Connect to a public server → terminal + SFTP + backup all work
- LAN warning appears if you saved 192.168./10.0. connections → informs you to use Docker/Win client instead
- Backup page shows cloud storage list → R2 binding is correct

### Pages Auto-Deployment (CI/CD)

If you use GitHub, Cloudflare Pages can auto-deploy from your repository:

1. Push your fork to GitHub
2. In Pages Dashboard, connect your repository
3. Set build configuration:
   ```
   Build command: npm run build && node core/build-worker.mjs
   Build output: dist/client
   ```

> Every push triggers an automatic build and deploy.

### Known Limitations

| Limitation | Description |
|---|---|
| RSA host keys only | ECDSA host key verification removed from algorithm list |
| CTR/CBC ciphers only | AES-256-GCM unavailable in workerd, downgraded to CTR/CBC |
| No private IP support | Workers cannot establish TCP connections to RFC 1918 addresses |
| WebSocket idle timeout | Heartbeat every 30 seconds prevents disconnection |
| Connection concurrency | Workers Paid plan has concurrent connection limits |

---

## Getting Started

1. After deployment, set a **master password** on first launch. All stored credentials are encrypted with this password.
2. Fill in the server details (name, host, username, password or private key) and click Connect.
3. Saved servers can be recalled without re-entering credentials.
4. Use drag-and-drop and the right-click context menu to organize server groups. A "Connect All" option is available per group.
5. Record a macro once, then replay it across multiple servers or schedule it for later execution.

---

## Development

```bash
# Terminal 1: start backend
node core/server/index.mjs

# Terminal 2: start frontend dev server (hot reload)
npm run dev
```

---

## Tech Stack

Vue 3 · xterm.js · WebSocket · ssh2 · AES-256-GCM · Bulma · Vite · Pinia · Docker · Electron

---

> **Security:** WebSSH is designed for intranet or VPN use. For public-facing deployments, set the `AUTH_TOKEN` environment variable and configure an HTTPS reverse proxy.
