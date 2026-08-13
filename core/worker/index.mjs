import { connect } from 'cloudflare:sockets';
import { Client } from 'ssh2';
import { Duplex } from 'stream';

const SSH_ALGORITHMS = {
  // Pure JS polyfill enables ECDH + DH group14
  kex: ['ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521', 'diffie-hellman-group14-sha256'],
  // CTR/CBC handled by pure JS AES polyfill; GCM not yet implemented
  cipher: ['aes256-ctr', 'aes192-ctr', 'aes128-ctr', 'aes256-cbc', 'aes128-cbc'],
  serverHostKey: ['rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa'],
  hmac: ['hmac-sha2-256-etm@openssh.com', 'hmac-sha2-512-etm@openssh.com', 'hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
  compress: ['none'],
};

// Host resource snapshot for the monitor bar (kept in sync with the Node
// server's STATS_SCRIPT; Worker is self-contained so it is duplicated here).
// Pure /proc + POSIX tools, ~1s sampling window; non-Linux hosts yield zeros.
const STATS_SCRIPT = `
cpu1=$(head -n1 /proc/stat 2>/dev/null)
rx1=$(cat /sys/class/net/*/statistics/rx_bytes 2>/dev/null | awk '{s+=$1} END{print s+0}')
tx1=$(cat /sys/class/net/*/statistics/tx_bytes 2>/dev/null | awk '{s+=$1} END{print s+0}')
sleep 1
cpu2=$(head -n1 /proc/stat 2>/dev/null)
rx2=$(cat /sys/class/net/*/statistics/rx_bytes 2>/dev/null | awk '{s+=$1} END{print s+0}')
tx2=$(cat /sys/class/net/*/statistics/tx_bytes 2>/dev/null | awk '{s+=$1} END{print s+0}')
echo "$cpu1"
echo "$cpu2"
echo "RX $rx1 $rx2"
echo "TX $tx1 $tx2"
free -b 2>/dev/null | awk '/^Mem/{print "MEM",$2,$3,$7} /^Swap/{print "SWAP",$2,$3}'
df -B1 -P / 2>/dev/null | awk 'NR==2{print "DISK",$2,$3,$5}'
awk '{print "LOAD",$1,$2,$3}' /proc/loadavg 2>/dev/null
nproc 2>/dev/null | awk '{print "CPU_N",$1}'
awk '{print "UPTIME",int($1)}' /proc/uptime 2>/dev/null
`;

function parseStats(raw) {
  const out = { cpu: 0, cores: 0, memTotal: 0, memUsed: 0, memAvail: 0, swapTotal: 0, swapUsed: 0, diskTotal: 0, diskUsed: 0, diskPct: 0, rxRate: 0, txRate: 0, load: [0, 0, 0], uptime: 0 };
  const lines = String(raw).split('\n');
  let c1 = null, c2 = null, rx = null, tx = null;
  for (const line of lines) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'cpu') { if (!c1) c1 = p; else c2 = p; continue; }
    switch (p[0]) {
      case 'RX': rx = [Number(p[1]) || 0, Number(p[2]) || 0]; break;
      case 'TX': tx = [Number(p[1]) || 0, Number(p[2]) || 0]; break;
      case 'MEM': out.memTotal = +p[1] || 0; out.memUsed = +p[2] || 0; out.memAvail = +p[3] || 0; break;
      case 'SWAP': out.swapTotal = +p[1] || 0; out.swapUsed = +p[2] || 0; break;
      case 'DISK': out.diskTotal = +p[1] || 0; out.diskUsed = +p[2] || 0; out.diskPct = parseInt(p[3], 10) || 0; break;
      case 'LOAD': out.load = [+p[1] || 0, +p[2] || 0, +p[3] || 0]; break;
      case 'CPU_N': out.cores = +p[1] || 0; break;
      case 'UPTIME': out.uptime = +p[1] || 0; break;
    }
  }
  if (c1 && c2) {
    const idle1 = (+c1[4] || 0) + (+c1[5] || 0);
    const idle2 = (+c2[4] || 0) + (+c2[5] || 0);
    const tot1 = c1.slice(1).reduce((s, v) => s + (+v || 0), 0);
    const tot2 = c2.slice(1).reduce((s, v) => s + (+v || 0), 0);
    const dt = tot2 - tot1, di = idle2 - idle1;
    out.cpu = dt > 0 ? Math.round(((dt - di) / dt) * 1000) / 10 : 0;
  }
  if (rx) out.rxRate = Math.max(0, rx[1] - rx[0]);
  if (tx) out.txRate = Math.max(0, tx[1] - tx[0]);
  return out;
}

// ── AUTH_TOKEN enforcement (parity with the Node server's authCheck) ──────
// Public CF deployments must set the AUTH_TOKEN env var (README requires it).
// Token travels via Sec-WebSocket-Protocol (preferred), Authorization: Bearer,
// or legacy ?token= query. Constant-time compare; no token → 503 so a
// misconfigured deployment can never become an open SSH relay.
function extractToken(request, url) {
  const protoHeader = request.headers.get('Sec-WebSocket-Protocol');
  if (protoHeader) {
    for (const part of String(protoHeader).split(',')) {
      const p = part.trim();
      if (p && p !== 'webssh-auth') return p;
    }
  }
  const auth = request.headers.get('Authorization') || '';
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '');
  return url.searchParams.get('token') || '';
}

function tokenOk(provided, expected) {
  if (!provided || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function makeSSHConfig(body) {
  const cfg = {
    host: body.host,
    port: body.port || 22,
    username: body.username || 'root',
    readyTimeout: 15000,
    algorithms: SSH_ALGORITHMS,
  };
  if (body.auth_value) {
    if (body.auth_type === 'key') cfg.privateKey = body.auth_value;
    else cfg.password = body.auth_value;
  }
  return cfg;
}

function setupSSHClient(client, password) {
  client.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
    finish(prompts.map(() => password || ''));
  });
}

/* ── CloudflareSocketDuplex: wraps cloudflare:sockets TCP into stream.Duplex ── */
class CloudflareSocketDuplex extends Duplex {
  constructor(tcpSocket) {
    super({ highWaterMark: 64 * 1024 });
    this.tcpSocket = tcpSocket;
    this.reader = tcpSocket.readable.getReader();
    this.writer = tcpSocket.writable.getWriter();
    this.destroyedByClose = false;
    this.pump();
  }
  _read() {}
  _write(chunk, encoding, callback) {
    let bytes;
    if (chunk instanceof Uint8Array) {
      bytes = chunk;
    } else if (Buffer.isBuffer(chunk)) {
      bytes = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    } else if (typeof chunk === 'string') {
      bytes = new TextEncoder().encode(chunk);
    } else {
      bytes = new Uint8Array(chunk);
    }
    this.writer.write(bytes).then(() => callback(), callback);
  }
  _final(callback) {
    this.writer.close().then(() => callback(), callback);
  }
  _destroy(error, callback) {
    this.destroyedByClose = true;
    Promise.allSettled([this.reader.cancel(), this.writer.abort(error || undefined)])
      .then(() => this.tcpSocket.close())
      .then(() => callback(error))
      .catch((closeError) => callback(closeError || error));
  }
  async pump() {
    try {
      while (!this.destroyedByClose) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) this.push(Buffer.from(value));
      }
      this.push(null);
    } catch (error) {
      if (!this.destroyedByClose) this.destroy(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/* ── Connect via cloudflare:sockets + ssh2 ── */
async function createSSHConnection(cfg) {
  let tcpSocket;
  try {
    tcpSocket = connect(`${cfg.host}:${cfg.port}`);
  } catch (e) {
    throw new Error('cloudflare:sockets not available. Requires Workers Paid plan for TCP connections. Error: ' + e.message);
  }
  try {
    await tcpSocket.opened;
  } catch (e) {
    throw new Error('TCP connection failed to ' + cfg.host + ':' + cfg.port + ' — verify host is reachable. ' + e.message);
  }
  const stream = new CloudflareSocketDuplex(tcpSocket);
  const conn = new Client();
  setupSSHClient(conn, cfg.password);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { conn.end(); } catch {}
      reject(new Error('SSH connection timeout'));
    }, cfg.readyTimeout + 3000);
    conn.on('ready', () => {
      clearTimeout(timeout);
      resolve({ conn, stream });
    });
    conn.on('error', (err) => {
      clearTimeout(timeout);
      logError('createSSHConnection', err);
      reject(err);
    });
    conn.on('close', () => {
      clearTimeout(timeout);
    });
    conn.connect({ ...cfg, sock: stream, keepaliveInterval: 10000, keepaliveCountMax: 3 });
  });
}

/* ── Helpers ── */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' },
  });
}

function parseBody(request) {
  return request.json().catch(() => ({}));
}

function logError(context, e) {
  console.error(`[Worker ${context}] ${e.message}${e.stack ? ' | ' + e.stack.split('\n').slice(0, 3).join(' | ') : ''}`);
}

/* ── Model API — server registry + probe + exec (MCP backend) ──────────────
   Contract mirrors core/server/lib/modelapi.mjs so the same MCP bridge
   (core/mcp/server.mjs) works against a CF deployment. Workers have no
   filesystem, so the registry lives in the MODEL_REGISTRY KV namespace.
   Credentials are AES-256-GCM encrypted at rest with a key derived from
   AUTH_TOKEN (same derivation as the Node server). */
const MODEL_MAX_COMMAND_LEN = 4096;
const MODEL_MAX_OUTPUT_BYTES = 256 * 1024;
const MODEL_DEFAULT_TIMEOUT_MS = 30000;
const MODEL_MAX_TIMEOUT_MS = 120000;
const MODEL_MAX_CONCURRENCY = 5;

function bytesToB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function modelKey(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`webssh-model-v1:${token}`));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function modelEncryptSecret(plain, token) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await modelKey(token), new TextEncoder().encode(plain)));
  // Web Crypto appends the 16-byte tag; split so the stored format matches
  // the Node server (iv:tag:data).
  const tag = ct.slice(ct.length - 16);
  const data = ct.slice(0, ct.length - 16);
  return `${bytesToB64(iv)}:${bytesToB64(tag)}:${bytesToB64(data)}`;
}

async function modelDecryptSecret(stored, token) {
  try {
    const [ivB64, tagB64, dataB64] = String(stored).split(':');
    const data = b64ToBytes(dataB64);
    const tag = b64ToBytes(tagB64);
    const merged = new Uint8Array(data.length + tag.length);
    merged.set(data, 0);
    merged.set(tag, data.length);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(ivB64) }, await modelKey(token), merged);
    return new TextDecoder().decode(pt);
  } catch {
    return ''; // AUTH_TOKEN changed or entry corrupted — treat as no credential
  }
}

function modelRandomId() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function modelLoadRegistry(env) {
  try {
    const list = await env.MODEL_REGISTRY.get('registry', 'json');
    return Array.isArray(list) ? list : [];
  } catch (e) {
    logError('ModelAPI load', e);
    return [];
  }
}

async function modelSaveRegistry(env, list) {
  await env.MODEL_REGISTRY.put('registry', JSON.stringify(list));
}

function modelPublicEntry(e) {
  return {
    id: e.id, name: e.name, host: e.host, port: e.port, username: e.username,
    auth_type: e.auth_type, last_probe: e.last_probe || null,
  };
}

async function modelNormalizeEntry(input, token, existing = null) {
  if (!input || typeof input !== 'object') return null;
  const host = String(input.host || '').trim();
  const username = String(input.username || '').trim();
  if (!host || !username) return null;
  const port = Math.max(1, Math.min(65535, parseInt(input.port, 10) || 22));
  const authType = input.auth_type === 'key' ? 'key' : 'password';
  const entry = existing ? { ...existing } : { id: modelRandomId(), created_at: Date.now() };
  entry.name = String(input.name || `${username}@${host}`).slice(0, 100);
  entry.host = host.slice(0, 255);
  entry.port = port;
  entry.username = username.slice(0, 100);
  entry.auth_type = authType;
  if (input.auth_value) entry.auth_enc = await modelEncryptSecret(String(input.auth_value), token);
  else if (!existing) return null; // new entry must carry credentials
  return entry;
}

// One-shot SSH exec used by both probe ('true') and exec actions.
function modelRunOnce(entry, command, timeoutMs, token) {
  return new Promise(async (resolve) => {
    const authValue = await modelDecryptSecret(entry.auth_enc, token);
    if (!authValue) { resolve({ success: false, error: 'no stored credential (or AUTH_TOKEN changed)' }); return; }
    let conn = null, stream = null;
    let stdout = '', stderr = '', truncated = false;
    const push = (target, chunk) => {
      if (target.length >= MODEL_MAX_OUTPUT_BYTES) { truncated = true; return target; }
      return target + String(chunk);
    };
    const finish = (result) => { try { conn?.end(); } catch {} try { stream?.destroy(); } catch {} resolve(result); };
    const timer = setTimeout(() => finish({ success: false, error: 'timeout', stdout, stderr, truncated }), timeoutMs);
    try {
      const tcpSocket = connect(`${entry.host}:${entry.port || 22}`);
      await Promise.race([
        tcpSocket.opened,
        new Promise((_, reject) => setTimeout(() => reject(new Error('TCP connection timeout')), Math.min(timeoutMs, 15000))),
      ]);
      stream = new CloudflareSocketDuplex(tcpSocket);
      conn = new Client();
      setupSSHClient(conn, authValue);
      conn.on('ready', () => {
        conn.exec(command, (err, ch) => {
          if (err) { clearTimeout(timer); finish({ success: false, error: err.message }); return; }
          ch.on('data', (d) => { stdout = push(stdout, d); });
          ch.stderr.on('data', (d) => { stderr = push(stderr, d); });
          ch.on('close', (code) => {
            clearTimeout(timer);
            finish({ success: code === 0, exit_code: typeof code === 'number' ? code : null, stdout, stderr, truncated });
          });
          ch.on('error', () => {});
        });
      });
      conn.on('error', (err) => { clearTimeout(timer); finish({ success: false, error: err.message }); });
      conn.connect({ ...makeSSHConfig({ ...entry, auth_value: authValue }), sock: stream, readyTimeout: Math.min(timeoutMs, 15000) });
    } catch (e) {
      clearTimeout(timer);
      finish({ success: false, error: e.message });
    }
  });
}

async function modelMapLimited(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function workerFn() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, workerFn));
  return results;
}

async function handleModelApi(request, url, env) {
  if (!env.MODEL_REGISTRY) {
    return json({ error: 'Model API requires the MODEL_REGISTRY KV binding (see README — Cloudflare section)' }, 503);
  }
  const token = String(env.AUTH_TOKEN || '').trim();
  const action = url.pathname.slice('/api/model/'.length);
  const registry = await modelLoadRegistry(env);

  if (action === 'servers' && request.method === 'GET') {
    return json({ servers: registry.map(modelPublicEntry) });
  }

  const body = await parseBody(request);

  if (action === 'servers/save') {
    const existing = body.id ? registry.find((e) => e.id === body.id) : null;
    if (body.id && !existing) return json({ error: 'unknown server id' }, 404);
    const entry = await modelNormalizeEntry(body, token, existing);
    if (!entry) return json({ error: 'host/username/auth_value required for new entries' }, 400);
    const idx = registry.findIndex((e) => e.id === entry.id);
    if (idx >= 0) registry[idx] = entry; else registry.push(entry);
    await modelSaveRegistry(env, registry);
    return json({ success: true, server: modelPublicEntry(entry) });
  }

  if (action === 'servers/remove') {
    const idx = registry.findIndex((e) => e.id === body.id);
    if (idx < 0) return json({ error: 'unknown server id' }, 404);
    registry.splice(idx, 1);
    await modelSaveRegistry(env, registry);
    return json({ success: true });
  }

  if (action === 'servers/sync') {
    if (!Array.isArray(body.servers)) return json({ error: 'servers[] required' }, 400);
    if (body.servers.length > 200) return json({ error: 'too many servers (max 200)' }, 400);
    const next = [];
    for (const input of body.servers) {
      const prev = registry.find((e) => e.host === String(input.host || '') && e.port === (parseInt(input.port, 10) || 22) && e.username === String(input.username || ''));
      const entry = await modelNormalizeEntry(input, token, prev);
      if (entry) next.push(entry);
    }
    await modelSaveRegistry(env, next);
    return json({ success: true, synced: next.map(modelPublicEntry) });
  }

  if (action === 'probe') {
    const targets = body.id ? registry.filter((e) => e.id === body.id) : registry;
    if (body.id && targets.length === 0) return json({ error: 'unknown server id' }, 404);
    const results = await modelMapLimited(targets, MODEL_MAX_CONCURRENCY, async (entry) => {
      const r = await modelRunOnce(entry, 'true', Math.min(parseInt(body.timeout_ms, 10) || MODEL_DEFAULT_TIMEOUT_MS, MODEL_MAX_TIMEOUT_MS), token);
      entry.last_probe = { t: Date.now(), ok: r.success, error: r.success ? null : String(r.error || '').slice(0, 200) };
      return { id: entry.id, name: entry.name, host: entry.host, port: entry.port, ok: r.success, error: r.success ? null : r.error };
    });
    await modelSaveRegistry(env, registry);
    return json({ results });
  }

  if (action === 'exec') {
    const command = typeof body.command === 'string' ? body.command : '';
    if (!command || command.length > MODEL_MAX_COMMAND_LEN) return json({ error: `command required (max ${MODEL_MAX_COMMAND_LEN} chars)` }, 400);
    const timeoutMs = Math.min(Math.max(parseInt(body.timeout_ms, 10) || MODEL_DEFAULT_TIMEOUT_MS, 3000), MODEL_MAX_TIMEOUT_MS);
    let targets;
    if (body.server === 'all') targets = registry;
    else if (body.server === 'ok') targets = registry.filter((e) => e.last_probe?.ok);
    else targets = registry.filter((e) => e.id === body.server);
    if (targets.length === 0) return json({ error: 'no matching server (probe first, or register one)' }, 404);
    if (targets.length > 50) return json({ error: 'refusing to exec on more than 50 servers at once' }, 400);
    const results = await modelMapLimited(targets, MODEL_MAX_CONCURRENCY, async (entry) => {
      const r = await modelRunOnce(entry, command, timeoutMs, token);
      return { id: entry.id, name: entry.name, host: entry.host, ...r };
    });
    return json({ results });
  }

  return json({ error: 'Unknown action' }, 400);
}

/* ── API: SSH Test ── */
async function handleSSHTest(request) {
  const body = await parseBody(request);
  const node = body.node || body;
  const cfg = makeSSHConfig(node);
  const output = [];
  try {
    const { conn } = await createSSHConnection(cfg);
    const result = await new Promise((resolve) => {
      const timeout = setTimeout(() => { try { conn.end(); } catch {} resolve({ success: false, error: ['Timeout'] }); }, 10000);
      const cmds = body.cmds || ["echo 'Connection test OK' && date"];
      conn.exec(cmds.join(' && '), (err, channel) => {
        if (err) { clearTimeout(timeout); resolve({ success: false, error: [err.message] }); return; }
        channel.on('data', (d) => output.push(d.toString().trim()));
        channel.stderr.on('data', (d) => output.push(d.toString().trim()));
        channel.on('close', () => { clearTimeout(timeout); conn.end(); resolve({ success: true, output, time_elapsed: 0.5 }); });
      });
    });
    return json(result);
  } catch (e) {
    logError('SSH Test', e);
    return json({ success: false, error: [e.message] }, 500);
  }
}

/* ── WebSocket: SFTP ── */
async function handleSFTPWebSocket(request) {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return json({ error: 'WebSocket required' }, 426);
  }
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();

  let conn = null;
  let sftp = null;
  let closed = false;

  const send = (msg) => {
    if (!closed && server.readyState === 1) {
      try { server.send(JSON.stringify(msg)); } catch {}
    }
  };

  function cleanup() {
    if (closed) return;
    closed = true;
    try { sftp?.end(); } catch {}
    try { conn?.end(); } catch {}
    try { server.close(); } catch {}
  }

  server.addEventListener('message', async (event) => {
    if (closed) return;
    const str = String(event.data);

    // Heartbeat
    if (str === '\x00hb\x00') return;
    let _ping;
    try { _ping = JSON.parse(str); } catch {}
    if (_ping?.type === 'ping') { send({ type: 'pong' }); return; }

    // First message: connection config
    if (!conn) {
      let cfgData;
      try { cfgData = JSON.parse(str); } catch {
        send({ type: 'status', status: 'error', error: 'Invalid config JSON' });
        return;
      }
      try {
        send({ type: 'status', status: 'connecting' });
        const { conn: c } = await createSSHConnection(makeSSHConfig(cfgData));
        conn = c;
        conn.sftp((err, sftpInstance) => {
          if (err) {
            send({ type: 'status', status: 'error', error: err.message });
            cleanup();
            return;
          }
          sftp = sftpInstance;
          send({ type: 'status', status: 'connected' });
        });
      } catch (e) {
        logError('SFTP connect', e);
        send({ type: 'status', status: 'error', error: e.message });
        cleanup();
      }
      return;
    }

    if (!sftp) return;

    let msg;
    try { msg = JSON.parse(str); } catch {
      send({ type: 'error', error: 'Invalid JSON' });
      return;
    }
    const { id, action, path, content, mode, srcPath, destPath, encoding } = msg;

    try {
      let result;
      switch (action) {
        case 'list': {
          const entries = await new Promise((resolve, reject) => {
            sftp.readdir(path || '/', (err, list) => {
              if (err) { reject(err); return; }
              resolve(list.filter(e => e.filename !== '.' && e.filename !== '..').map(e => ({
                name: e.filename,
                type: e.longname?.startsWith('d') ? 'dir' : 'file',
                size: e.attrs?.size || 0,
                mode: e.attrs?.mode || 0o644,
                mtime: e.attrs?.mtime ? new Date(e.attrs.mtime * 1000).toISOString() : null,
              })));
            });
          });
          result = { entries };
          break;
        }
        case 'stat': {
          const st = await new Promise((resolve, reject) => {
            sftp.stat(path, (err, st) => { if (err) reject(err); else resolve(st); });
          });
          result = { size: st.size, mode: st.mode, mtime: st.mtime ? new Date(st.mtime * 1000).toISOString() : null };
          break;
        }
        case 'read': {
          const chunks = [];
          await new Promise((resolve, reject) => {
            const stream = sftp.createReadStream(path);
            stream.on('data', c => chunks.push(c));
            stream.on('error', reject);
            stream.on('end', resolve);
          });
          result = { content: Buffer.concat(chunks).toString('base64') };
          break;
        }
        case 'write': {
          const buf = Buffer.from(content, encoding === 'base64' ? 'base64' : 'utf8');
          await new Promise((resolve, reject) => {
            sftp.writeFile(path, buf, (err) => { if (err) reject(err); else resolve(); });
          });
          result = { success: true };
          break;
        }
        case 'delete': {
          await new Promise((resolve, reject) => {
            sftp.unlink(path, (err) => { if (err) reject(err); else resolve(); });
          });
          result = { success: true };
          break;
        }
        case 'rmdir': {
          await new Promise((resolve, reject) => {
            sftp.rmdir(path, (err) => { if (err) reject(err); else resolve(); });
          });
          result = { success: true };
          break;
        }
        case 'mkdir': {
          await new Promise((resolve, reject) => {
            sftp.mkdir(path, (err) => { if (err) reject(err); else resolve(); });
          });
          result = { success: true };
          break;
        }
        case 'rename': {
          await new Promise((resolve, reject) => {
            sftp.rename(srcPath, destPath, (err) => { if (err) reject(err); else resolve(); });
          });
          result = { success: true };
          break;
        }
        case 'chmod': {
          await new Promise((resolve, reject) => {
            sftp.chmod(path, parseInt(mode, 8), (err) => { if (err) reject(err); else resolve(); });
          });
          result = { success: true };
          break;
        }
        default:
          send({ id, error: 'Unknown action: ' + action });
          return;
      }
      send({ id, result });
    } catch (e) {
      send({ id, error: e.message });
    }
  });

  server.addEventListener('close', () => cleanup());
  server.addEventListener('error', () => cleanup());

  return new Response(null, { status: 101, webSocket: client });
}

/* ── API: SFTP (HTTP fallback) ── */
async function handleSFTP(request, url) {
  return json({ error: 'SFTP is not yet supported on Cloudflare Workers. Please use WebSocket (/ws/sftp) for SFTP access.' }, 501);
}

/* ── API: Docker ── */
async function handleDocker(request, url) {
  const body = await parseBody(request);
  const cfg = makeSSHConfig(body);
  try {
    const { conn } = await createSSHConnection(cfg);
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { try { conn.end(); } catch {} reject(new Error('Docker timeout')); }, 15000);
      let cmd = '';
      if (url.pathname.endsWith('/docker/ps')) {
        cmd = 'docker ps -a --format "{{json .}}" 2>/dev/null || docker ps -a --format "table {{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Names}}" 2>&1';
      } else if (url.pathname.endsWith('/docker/exec')) {
        const action = body.action;
        if (action === 'logs') cmd = `docker logs ${body.containerId} 2>&1 | tail -100`;
        else if (action === 'start') cmd = `docker start ${body.containerId} 2>&1`;
        else if (action === 'stop') cmd = `docker stop ${body.containerId} 2>&1`;
        else if (action === 'restart') cmd = `docker restart ${body.containerId} 2>&1`;
        else cmd = `docker ${action} ${body.containerId} 2>&1`;
      } else {
        clearTimeout(timeout);
        conn.end();
        reject(new Error('Unknown Docker action'));
        return;
      }
      const output = [];
      conn.exec(cmd, (err, channel) => {
        if (err) { clearTimeout(timeout); conn.end(); reject(err); return; }
        channel.on('data', (d) => output.push(d.toString()));
        channel.stderr.on('data', (d) => output.push(d.toString()));
        channel.on('close', () => { clearTimeout(timeout); conn.end(); resolve({ success: true, output: output.join('').trim() }); });
      });
    });
    return json(result);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

/* ── WebSocket: SSH Terminal ── */
async function handleTerminalWS(request) {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return json({ error: 'WebSocket required' }, 426);
  }
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();

  let conn = null;
  let stream = null;
  let shell = null;
  let cfgData = null;

  function cleanup() {
    try { shell?.close(); } catch {}
    try { conn?.end(); } catch {}
    try { stream?.destroy(); } catch {}
    try { server.close(); } catch {}
  }

  // One exec at a time; overlapping samples would double the remote load.
  let statsBusy = false;
  function runStats() {
    if (statsBusy || !conn || !shell) return;
    statsBusy = true;
    conn.exec(STATS_SCRIPT, (err, ch) => {
      if (err) { statsBusy = false; return; }
      let out = '';
      ch.on('data', (d) => { out += d.toString(); });
      ch.stderr.on('data', () => {});
      ch.on('close', () => {
        statsBusy = false;
        try { if (server.readyState === 1) server.send(JSON.stringify({ type: 'host_stats', data: parseStats(out) })); } catch {}
      });
      ch.on('error', () => { statsBusy = false; });
    });
  }

  async function openSSH() {
    try {
      const tcpSocket = connect(`${cfgData.host}:${cfgData.port || 22}`);
      await Promise.race([
        tcpSocket.opened,
        new Promise((_, reject) => setTimeout(() => reject(new Error('TCP connection timeout')), 15000)),
      ]);
      stream = new CloudflareSocketDuplex(tcpSocket);
      conn = new Client();
      setupSSHClient(conn, cfgData.auth_value);

      const sshCfg = makeSSHConfig(cfgData);
      conn.on('ready', () => {
        conn.shell({ term: 'xterm-256color', cols: 120, rows: 30 }, (err, channel) => {
          if (err) { try { server.send(`\r\n\x1b[31m[Shell Error] ${err.message}\x1b[0m\r\n`); } catch {} cleanup(); return; }
          shell = channel;
          channel.on('data', (data) => { try { if (server.readyState === 1) server.send(typeof data === 'string' ? data : new Uint8Array(data)); } catch {} });
          channel.stderr.on('data', (data) => { try { if (server.readyState === 1) server.send(typeof data === 'string' ? data : new Uint8Array(data)); } catch {} });
          channel.on('close', () => cleanup());
          try { server.send('{"type":"ssh_ready"}'); } catch {}
        });
      });
      conn.on('error', (err) => {
        logError('Terminal', err);
        try { server.send(`\r\n\x1b[31m[SSH Error] ${err.message}\x1b[0m\r\n`); } catch {}
      });
      conn.on('close', () => cleanup());
      conn.connect({ ...sshCfg, sock: stream, keepaliveInterval: 15000, keepaliveCountMax: 3 });
    } catch (e) {
      logError('openSSH', e);
      try { server.send(`\r\n\x1b[31m[Connection Error] ${e.message}\x1b[0m\r\n`); } catch {}
      cleanup();
    }
  }

  server.addEventListener('message', (event) => {
    const str = String(event.data);
    // Heartbeat
    if (str === '\x00hb\x00') return;
    let _ping;
    try { _ping = JSON.parse(str); } catch {}
    if (_ping?.type === 'ping') { try { server.send('{"type":"pong"}'); } catch {} return; }
    // First message contains the connection config as JSON
    if (!conn && !cfgData) {
      try {
        cfgData = JSON.parse(str);
        if (cfgData.host && cfgData.username) openSSH();
        else server.send('\r\n\x1b[31mMissing host or username\x1b[0m\r\n');
      } catch {
        server.send(JSON.stringify({ type: 'error', message: 'Invalid config JSON' }));
      }
      return;
    }
    if (!shell) return;
    if (str.startsWith('resize:')) {
      const [_, rs, cs] = str.split(':');
      const rows = parseInt(rs, 10);
      const cols = parseInt(cs, 10);
      if (rows && cols && shell.setWindow) shell.setWindow(rows, cols);
      return;
    }
    // Host monitor polls; run on a separate exec channel so the interactive
    // shell is never polluted (mirrors core/server/lib/ssh.mjs).
    if (str.startsWith('stats:')) { runStats(); return; }
    shell.write(str);
  });

  server.addEventListener('close', () => cleanup());
  server.addEventListener('error', () => cleanup());

  return new Response(null, { status: 101, webSocket: client });
}

/* ── Crypto Diagnostic ── */
async function handleDiagnostic() {
  const results = {};
  const crypto = require('crypto');

  function test(name, fn) {
    try { results[name] = fn(); } catch (e) { results[name] = `FAIL: ${e.message}`; }
  }

  if (!crypto) {
    results.crypto_import = 'FAIL: node:crypto not available';
    return json(results);
  }
  results.crypto_import = 'OK';

  const key16 = new Uint8Array(16).fill(0x42);
  const key32 = new Uint8Array(32).fill(0x42);
  const iv16 = new Uint8Array(16).fill(0x00);

  test('randomBytes', () => crypto.randomBytes ? 'OK' : 'MISSING');
  test('randomFill', () => crypto.randomFill ? 'OK' : 'MISSING');
  test('createHmac', () => crypto.createHmac ? 'OK' : 'MISSING');
  test('createHash', () => crypto.createHash ? 'OK' : 'MISSING');
  test('createSign', () => crypto.createSign ? 'OK' : 'MISSING');
  test('createVerify', () => crypto.createVerify ? 'OK' : 'MISSING');
  test('createDiffieHellman', () => crypto.createDiffieHellman ? 'OK' : 'MISSING');
  test('createECDH', () => crypto.createECDH ? 'OK' : 'MISSING');
  test('createCipheriv', () => crypto.createCipheriv ? 'OK' : 'MISSING');
  test('createDecipheriv', () => crypto.createDecipheriv ? 'OK' : 'MISSING');

  test('hmac_sha256', () => { crypto.createHmac('sha256', key16).update('test').digest(); return 'OK'; });
  test('hash_sha256', () => { crypto.createHash('sha256').update('test').digest(); return 'OK'; });

  test('cipher_aes256ctr', () => { const c = crypto.createCipheriv('aes-256-ctr', key32, iv16.slice(0,16)); c.update('test','utf8','hex'); c.final('hex'); return 'OK'; });
  test('cipher_aes128ctr', () => { const c = crypto.createCipheriv('aes-128-ctr', key16, iv16.slice(0,16)); c.update('test','utf8','hex'); c.final('hex'); return 'OK'; });
  test('cipher_aes256gcm', () => { const c = crypto.createCipheriv('aes-256-gcm', key32, iv16.slice(0,12)); c.update('test','utf8','hex'); c.final('hex'); return 'OK'; });
  test('cipher_aes256cbc', () => { const c = crypto.createCipheriv('aes-256-cbc', key32, iv16); c.update('test','utf8','hex'); c.final('hex'); return 'OK'; });
  test('cipher_aes128cbc', () => { const c = crypto.createCipheriv('aes-128-cbc', key16, iv16); c.update('test','utf8','hex'); c.final('hex'); return 'OK'; });

  test('ecdh_p256', () => { const e = crypto.createECDH('prime256v1'); e.generateKeys(); return 'OK'; });
  test('dh_group14', () => { const d = crypto.createDiffieHellman('modp14'); d.generateKeys(); return 'OK'; });

  test('verify_rsa_sha256', () => {
    const v = crypto.createVerify('sha256');
    v.update(Buffer.from('SGVsbG8gV29ybGQgU1NI', 'base64'));
    const pub = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA6eBbE5kYs2HMJ9mS0eiF\nMk04LgUn0xGz4ZCPS5lJRaPNrYb4E2NcDbGvgnGRl0wlfo5Oji0AaJFqcO8R/xiq\n1WI/3C+YuM7hVEiQdA8btCNmOeQkukUBPJdyLDTEcU3L8zv1b7Qw2/peiJP9IGH3\ni9sLueT3cm5z57+vyvIGGIvoWT74Ij3GIriGUn5S7oe4sOV4o7ufPRj54RYkGZ3g\ndhmNVbSmnJbXAcy6Wlqc8q4JsGyN+agDpzGJYoGPjHLyNPSzKzA2KDIvzrHikw03\na5god9Q0Veb9fqxwDwyF6ApA7UD6G6xBp4ULDoEUaR7I1mLT+Y2Eh133ZG32PTZR\nywIDAQAB\n-----END PUBLIC KEY-----';
    const sig = Buffer.from('K+9Sy1uckYmfw76r8m5SF9gTaVmG95mkZhrJQCv3S2Be3KGpo+U84pYTOiMT5xoBw5pY9yge48S3B9rvFThen4rzzYb0aHDKICqqeMK6tsRxJQSwRsVPkSVSuuxl2Iw+UEg5jguDq7JBwFAd0FIVgZjuivSX7TWUWcvohRiFbh8RlASBrV/LM39SD4IYHvIvPFRoglArgsucN7C/tsWoA69gWh7VTou/kBUwl4LouQCVObEnpYfM9J5HjGdDj2KdQAvoo/G8CME8VBB1uKInaqZuxou9V+kwGuOeQBhP4lkjkZU3pgLCWCuZTo8+Tgf4OcLX+kECx/35/5OKUOQ/mw==', 'base64');
    const result = v.verify(pub, sig);
    return result ? 'OK' : 'FAIL (verify returned false)';
  });
  test('sign_rsa_sha256', () => {
    // Minimal test: createSign() does not throw
    const s = crypto.createSign('sha256');
    s.update(Buffer.from('test'));
    return 'OK';
  });

  test('ssh2_import', () => {
    try { const { Client } = require('ssh2'); return Client ? 'OK' : 'NULL'; }
    catch (ee) { return `FAIL: ${ee.message}`; }
  });

  return json(results);
}

/* ── Cloud Backup (R2) ── */
async function handleCloudBackup(request, env) {
  const body = await request.json().catch(() => ({}));
  const { action, id, backup } = body;
  const bucket = env.BACKUP_BUCKET;
  if (!bucket) return json({ error: 'R2 bucket not configured' }, 500);

  if (action === 'list') {
    const objects = [];
    for await (const obj of bucket.list()) {
      objects.push({
        id: obj.key.replace(/^backup_/, ''),
        label: obj.customMetadata?.label || '',
        createdAt: parseInt(obj.customMetadata?.createdAt || '0'),
        size: obj.size,
        inventory: {
          connectionCount: parseInt(obj.customMetadata?.connectionCount || '0'),
          snippetCount: parseInt(obj.customMetadata?.snippetCount || '0'),
          hasPassword: obj.customMetadata?.hasPassword === 'true',
        },
      });
    }
    objects.sort((a, b) => b.createdAt - a.createdAt);
    return json({ backups: objects });
  }

  if (action === 'upload') {
    if (!backup || !backup.id) return json({ error: 'Missing backup data' }, 400);
    const payload = JSON.stringify(backup);
    const inv = backup.inventory || {};
    await bucket.put('backup_' + backup.id, payload, {
      customMetadata: {
        label: String(backup.label || ''),
        createdAt: String(backup.createdAt || Date.now()),
        connectionCount: String(inv.connectionCount || 0),
        snippetCount: String(inv.snippetCount || 0),
        hasPassword: inv.hasPassword ? 'true' : 'false',
      },
    });
    return json({ ok: true });
  }

  if (action === 'download') {
    if (!id) return json({ error: 'Missing backup id' }, 400);
    const obj = await bucket.get('backup_' + id);
    if (!obj) return json({ error: 'Backup not found' }, 404);
    const text = await obj.text();
    return new Response(text, {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' },
    });
  }

  if (action === 'delete') {
    if (!id) return json({ error: 'Missing backup id' }, 400);
    await bucket.delete('backup_' + id);
    return json({ ok: true });
  }

  if (action === 'saveVerify') {
    const { verifyKey, salt } = body;
    if (!verifyKey || !salt) return json({ error: 'Missing verifyKey or salt' }, 400);
    await bucket.put('_master_verify', JSON.stringify({ verifyKey, salt }), {
      customMetadata: { type: 'master_verify' },
    });
    return json({ ok: true });
  }

  if (action === 'getVerify') {
    const obj = await bucket.get('_master_verify');
    if (!obj) return json({ exists: false });
    const text = await obj.text();
    return json({ exists: true, ...JSON.parse(text) });
  }

  return json({ error: 'Unknown action: ' + action }, 400);
}

/* ── Main fetch handler ── */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    /* Auth gate: every /api/* and /ws/* route requires AUTH_TOKEN, matching
       the Node server. Static assets stay open so the login screen loads. */
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) {
      const expected = String(env.AUTH_TOKEN || '').trim();
      if (!expected) {
        return json({ error: 'AUTH_TOKEN is not configured on this deployment. Set the AUTH_TOKEN environment variable (see README).' }, 503);
      }
      if (!tokenOk(extractToken(request, url), expected)) {
        return json({ error: 'Unauthorized' }, 401);
      }
    }

    /* Health */
    if (url.pathname === '/health') {
      return json({ status: 'ok', uptime: 'worker' });
    }

    /* Crypto diagnostic */
    if (url.pathname === '/api/diag') {
      return handleDiagnostic();
    }

    /* SFTP WebSocket */
    if (url.pathname === '/ws/sftp') {
      return handleSFTPWebSocket(request);
    }

    /* SSH test */
    if (url.pathname === '/api/ssh/test' && request.method === 'POST') {
      return handleSSHTest(request);
    }

    /* SFTP HTTP API (returns 501 — use WebSocket instead) */
    if (url.pathname.startsWith('/api/sftp/') && request.method === 'POST') {
      return handleSFTP(request, url);
    }

    /* Cloud backup (R2) */
    if (url.pathname === '/api/cloud/backup' && request.method === 'POST') {
      return handleCloudBackup(request, env);
    }

    /* Docker */
    if (url.pathname.startsWith('/api/docker/') && request.method === 'POST') {
      return handleDocker(request, url);
    }

    /* Model API — MCP backend; registry in KV (see handleModelApi) */
    if (url.pathname.startsWith('/api/model/')) {
      return handleModelApi(request, url, env);
    }

    /* Chat Bot API (WebSocket terminal + Docker only, chat requires Node.js backend) */
    if (url.pathname.startsWith('/api/chat/')) {
      return json({ error: 'Chat bot requires Node.js backend (Docker/VPS). Not available in Cloudflare Workers.' }, 501);
    }

    /* WebSocket terminal */
    if (url.pathname === '/ws/ssh') {
      return handleTerminalWS(request);
    }

    /* Serve built frontend via ASSETS binding (Workers format) or fall through to Pages static assets */
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return; // Let CF Pages serve static files for unmatched routes
  },
};
