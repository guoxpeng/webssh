# WebSSH v3.2 — SSH Client in Your Browser

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

## Cloudflare Deployment (Pages recommended)

> ⚠ **Public servers only.** Private IPs (192.168.x.x etc.) cannot be reached. Use Docker or Windows client for LAN.

### 1. Clone the repo

Fork or clone this repository to your GitHub account.

### 2. Create R2 bucket

Cloudflare Dashboard → **Storage & Databases** → **R2** → **Create bucket**
- Name: `webssh-backups`
- Region: default (Auto)

### 3. Create Pages project

Cloudflare Dashboard → **Compute** → **Workers & Pages** → **Create application** → scroll to "Pages" card, click **Get started**

- **Connect Git** → authorize and select your cloned repo
- **Build command**: `npm run build && node core/build-worker.mjs`
- **Build output**: `dist/client`
- **Environment variables (optional, for backup)**:
  - Variable name: `BACKUP_BUCKET`
  - Value: `webssh-backups`

Click **Save and Deploy**. Wait for the build to finish, then visit the generated URL.

### Known Limitations

| Limitation | Description |
|---|---|
| RSA host keys only | ECDSA removed from algorithm list |
| CTR/CBC ciphers only | AES-256-GCM unavailable in workerd |
| No private IP support | Workers cannot connect to RFC 1918 addresses |
| WebSocket idle timeout | Heartbeat every 30 seconds |

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
