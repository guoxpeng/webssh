# Security

## Threat Model

WebSSH is designed for **single-user** use behind a trusted network (intranet/VPN). The primary threats addressed are:

| Threat | Mitigation |
|---|---|
| Browser storage theft (localStorage access) | Credentials encrypted with AES-256-GCM; master password derived via PBKDF2-SHA256 |
| Session hijacking via reused connections | `credHash` (SHA-256 of auth value) bound to each session; different credentials never share a session |
| Path traversal via static file serving | `path.resolve()` + prefix check against DIST_DIR |
| WebSocket credential brute-force | Rate limit: 10 WS connections/min per IP |
| Debug endpoint information leak | All sensitive config redacted (`abc****xyz`) |
| Backups intercepted in transit | AES-256-GCM encrypted with master password; integrity verified via SHA-256 checksum |
| XSS via AI command output | Output rendered in read-only `<pre>` blocks; no HTML injection |

## Credential Storage

### In the Browser

- **Master password + salt** → PBKDF2-SHA256 (100,000 iterations, 32-byte salt) → AES-256-GCM key
- Individual server credentials encrypted and stored in **sessionStorage** (cleared on tab close)
- [CF Worker: credentials stored server-side in **R2** with the same encryption scheme]
- HTTP fallback (non-localhost, no `crypto.subtle`): PBKDF2 at 10,000 iterations + XOR cipher; **public HTTP deployment strongly discouraged**

### On the Server (Docker / Node)

- **No plaintext credential persistence.** Credentials arrive via WebSocket, used for SSH handshake, never written to disk.
- Audit logs record event types and timestamps only; **no passwords, keys, or session data** are logged.
- Credential caching in `sessionStorage` is encrypted via `cryptoService.encrypt()/decrypt()` (AES-256-GCM).

### Data Flow

```
User input → Pinia store → encrypt(AES-256-GCM) → sessionStorage
                                                → WebSocket → SSH target
```

### Master Password Derivation

```
PBKDF2(password, salt=random32, iterations=100000, hash=SHA-256) → AES-256-GCM key
                                                                 → SHA-256(key) → stored verify hash
```

The verify hash (`webssh_verify` in localStorage) allows password validation without storing the key. On CF Worker, verify data is additionally synced to R2 for cross-session persistence.

## Session Isolation

### Browser Side

- Tab-level isolation: each terminal tab opens an independent WebSocket
- Server credential cache bound to `sessionStorage` — cleared on tab close
- Session store (`sessionRememberedCredentials`) is in-memory only, not serialized

### Server Side (Docker / Node)

- `findSession()` checks `credHash` (SHA-256 of `auth_value`) before reusing
- Different credentials for the same host:port:username never share a session
- Stale sessions cleaned every 60s, TTL: 30 minutes
- SFTP pool: separate from shell sessions, auto-cleaned after 5 min idle

## Audit Logging

- Server-side JSONL audit at `data/audit.log`
- Auto-rotation at 5 MB
- Events recorded: SSH connect/disconnect/error, connection test, AI request/execution
- UI accessible via sidebar → `ScrollText` icon
- Support: filter by type, download as JSON, clear all entries
- **No credentials, tokens, or keys ever appear in audit logs**

## Public Deployment Checklist

> WebSSH is designed for **intranet/VPN use**. Public exposure increases attack surface significantly.

### Required

- [ ] Set `AUTH_TOKEN` environment variable (minimum 32 characters, random)
- [ ] Configure HTTPS reverse proxy (nginx/caddy/Caddyfile with HSTS shown in Docker section)
- [ ] Verify `AUTH_TOKEN` — WebSocket and API calls will reject without Bearer token
- [ ] Review audit logs periodically (`data/audit.log`)

### Recommended

- [ ] Restrict source IP via firewall / WAF rules
- [ ] Set `NODE_ENV=production` to disable debug endpoints
- [ ] Run a non-root user (Docker images default to `node` user)
- [ ] Enable Docker `read_only: true` + `tmpfs: /tmp` as in provided docker-compose
- [ ] Use `--restart=unless-stopped` for automatic recovery

### Cloudflare Workers

- Public by default; `AUTH_TOKEN` is mandatory for production use
- Only RSA host keys and CTR/CBC ciphers supported (AES-256-GCM unavailable in workerd)
- Private IPs (RFC 1918) cannot be reached — Workers run in Cloudflare's network
- R2 bucket encryption: data encrypted with your master password before upload

## Security History

Relevant security fixes are documented in CHANGELOG:

- **v2.1.1** — AUTH_TOKEN WebSocket bypass fix, session hijacking via credHash, path traversal fix, host key verification, config redaction, WS rate limiting
- **v2.2.0** — Docker security: non-root user, read-only filesystem, HSTS headers, audit log
- **v2.2.1** — CF Worker GCM/ChaCha20 cipher support for SecureContext environments
- **v2.2.2** — Worker TCP buffer handling, diagnostic endpoint, SSH error stack traces

## Reporting a Vulnerability

Please open a [GitHub Issue](https://github.com/guoxpeng/webssh/issues) for any security concerns. Response SLA: within 48 hours.
