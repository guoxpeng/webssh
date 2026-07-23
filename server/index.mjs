import { WebSocketServer } from 'ws';
import { Client } from 'ssh2';
import { createServer } from 'http';
import { createConnection } from 'net';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { networkInterfaces } from 'os';
import { get as httpGet } from 'http';
import { get as httpsGet } from 'https';

let SerialPort;
try {
  const mod = await import('serialport');
  SerialPort = mod.SerialPort;
} catch {} // Optional serialport support

// Fast SSH algorithms: order matters, fastest first
const SSH_ALGORITHMS = {
  kex: ['curve25519-sha256', 'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521', 'diffie-hellman-group-exchange-sha256', 'diffie-hellman-group14-sha256'],
  cipher: ['chacha20-poly1305@openssh.com', 'aes256-gcm@openssh.com', 'aes128-gcm@openssh.com', 'aes256-ctr', 'aes128-ctr'],
  serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-rsa'],
  hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
  compress: ['none'],
};

const __dirname = join(fileURLToPath(import.meta.url), '..');
const DIST_DIR = join(__dirname, '..', 'dist');
const MIME = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.json':'application/json' };

const PORT = parseInt(process.env.PORT || '9627', 10);
const WS_PATH = process.env.WS_PATH || '/ws/ssh';

const sessions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > 1800000) { try { s.client.end(); } catch {} sessions.delete(id); }
  }
}, 60000);

function findSession(host, port, username) {
  for (const [id, s] of sessions) {
    if (s.host === host && s.port === (port || 22) && s.username === username) return s.client;
  }
  return null;
}

function makeSSHConfig(body) {
  const cfg = {
    host: body.host,
    port: body.port || 22,
    username: body.username || 'root',
    readyTimeout: 3000,
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

// Prevent process crash on unhandled errors
process.on('uncaughtException', (err) => {
  console.error('❗ Uncaught Exception:', err.message);
  console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('❗ Unhandled Rejection:', reason?.message || reason);
});

async function withSftp(body, fn) {
  if (!body?.host) throw new Error('Host is required');
  const conn = new Client();
  setupSSHClient(conn, body.auth_value);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { conn.end(); } catch {}
      reject(new Error('SFTP connection timeout'));
    }, 10000);
    conn.on('ready', () => {
      clearTimeout(timeout);
      conn.sftp((err, sftp) => {
        if (err) { clearTimeout(timeout); conn.end(); reject(err); return; }
        fn(sftp, conn).then(resolve).catch(reject).finally(() => { clearTimeout(timeout); try { conn.end(); } catch {} });
      });
    });
    conn.on('error', (err) => { clearTimeout(timeout); reject(err); });
    conn.on('close', () => { clearTimeout(timeout); });
    const cfg = makeSSHConfig(body);
    try { conn.connect(cfg); } catch (e) { clearTimeout(timeout); reject(e); }
  });
}

async function withSessionSftp(body, fn) {
  let conn = findSession(body.host, body.port, body.username);
  let ownsClient = false;
  if (!conn) {
    conn = new Client();
    setupSSHClient(conn, body.auth_value);
    ownsClient = true;
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { if (ownsClient) try { conn.end(); } catch {} reject(new Error('SFTP timeout')); }, 15000);
    const done = () => { clearTimeout(timeout); };
    const onReady = () => {
      conn.sftp((err, sftp) => {
        if (err) { done(); if (ownsClient) try { conn.end(); } catch {} reject(err); return; }
        fn(sftp, conn).then(r => { done(); resolve(r); }).catch(e => { done(); if (ownsClient) try { conn.end(); } catch {} reject(e); });
      });
    };
    if (ownsClient) {
      const cfg = { ...makeSSHConfig(body), keepaliveInterval: 30000, keepaliveCountMax: 3 };
      const sessKey = `${body.host}_${body.port || 22}_${body.username || 'root'}`;
      conn.on('ready', () => {
        sessions.set(sessKey, { client: conn, host: body.host, port: body.port || 22, username: body.username || 'root', createdAt: Date.now() });
        conn.on('close', () => sessions.delete(sessKey));
        ownsClient = false;
        onReady();
      });
      conn.on('error', e => { done(); try { conn.end(); } catch {} reject(e); });
      try { conn.connect(cfg); } catch (e) { done(); try { conn.end(); } catch {} reject(e); }
    } else {
      onReady();
    }
  });
}

function apiRoute(url, handler) {
  if (url.startsWith('/api/sftp/')) return handler;
  return null;
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

// --- Rate limiter ---
const rateMap = new Map();
function checkRate(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, reset: now + 60000 };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60000; }
  entry.count++;
  rateMap.set(ip, entry);
  return entry.count <= 60;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateMap) { if (now > v.reset) rateMap.delete(k); }
}, 60000);

const server = createServer(async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
  if (!checkRate(ip)) { res.writeHead(429); res.end('Too many requests'); return; }

  // Force PWA to reload fresh content
  res.setHeader('Clear-Site-Data', '"cache"');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Override dist/sw.js with suicide SW to break stale PWA cache
  if (req.url === '/sw.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' });
    res.end(`self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.map(k=>caches.delete(k)));
  const clients=await self.clients.matchAll();
  clients.forEach(c=>c.navigate('/'));
  self.registration.unregister();
});
self.addEventListener('fetch',()=>{});`);
    return;
  }

  if (req.url === '/health') {
    json(res, { status: 'ok', uptime: process.uptime() });
    return;
  }

  // Production: serve built frontend
  if (req.method === 'GET' && existsSync(DIST_DIR)) {
    try {
      let filePath = req.url === '/' ? '/index.html' : req.url;
      const fullPath = join(DIST_DIR, filePath);
      if (existsSync(fullPath)) {
        const ext = extname(fullPath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(readFileSync(fullPath));
        return;
      }
      // SPA fallback
      const indexPath = join(DIST_DIR, 'index.html');
      if (existsSync(indexPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(readFileSync(indexPath));
        return;
      }
    } catch (e) {
      console.error('Static file error:', e.message);
    }
    res.writeHead(404); res.end('Not found');
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(404); res.end();
    return;
  }

  const body = await parseBody(req);

  if (req.url === '/api/ssh/test') {
    const node = body.node || body;
    try {
      const existing = findSession(node.host, node.port, node.username);
      if (existing) {
        const output = [];
        const result = await new Promise((resolve) => {
          existing.exec('echo \'Connection test OK\' && date', (err, stream) => {
            if (err) { resolve({ success: false, error: [err.message] }); return; }
            stream.on('data', (d) => output.push(d.toString().trim()));
            stream.stderr.on('data', (d) => output.push(d.toString().trim()));
            stream.on('close', () => resolve({ success: true, output, time_elapsed: 0.1 }));
          });
        });
        json(res, result);
        return;
      }
      const cmds = body.cmds || ["echo 'Connection test OK' && date"];
      const output = [];
      let done = false;
      const conn = new Client();
      setupSSHClient(conn, node.auth_value);
      const result = await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (!done) { done = true; try { conn.end(); } catch {} resolve({ success: false, error: ['Timeout'] }); }
        }, 10000);
        conn.on('ready', () => {
          clearTimeout(timeout);
          conn.exec(cmds.join(' && '), (err, stream) => {
            if (err) { done = true; conn.end(); resolve({ success: false, error: [err.message] }); return; }
            stream.on('data', (d) => output.push(d.toString().trim()));
            stream.stderr.on('data', (d) => output.push(d.toString().trim()));
            stream.on('close', () => { done = true; conn.end(); resolve({ success: true, output, time_elapsed: 0.5 }); });
          });
        });
        conn.on('error', (err) => { clearTimeout(timeout); if (!done) { done = true; resolve({ success: false, error: [err.message] }); } });
        const cfg = makeSSHConfig(node);
        try { conn.connect(cfg); } catch (e) { clearTimeout(timeout); resolve({ success: false, error: [e.message] }); }
      });
      json(res, result);
    } catch (e) {
      json(res, { success: false, error: [e.message] }, 500);
    }
    return;
  }

  // --- Chat Bot API ---
  if (req.url === '/api/chat/config') {
    if (req.method === 'POST') {
      Object.assign(chatConfig, body);
      saveChatConfig();
      restartTelegramPoll();
      json(res, { success: true });
    } else {
      json(res, chatConfig);
    }
    return;
  }
  if (req.url === '/api/chat/messages') {
    const since = parseInt(req.headers['x-since'] || '0', 10);
    const msgs = since > 0 ? chatMessages.filter(m => m.timestamp > since) : chatMessages;
    json(res, { messages: msgs });
    return;
  }
  if (req.url === '/api/chat/send') {
    const { platform, text, meta } = body;
    if (!platform || !text) { json(res, { success: false, error: 'platform and text required' }, 400); return; }
    addChatMessage({ platform, direction: 'out', from: 'Admin', text, meta });
    const result = await sendBotMessage(platform, text, meta);
    json(res, result);
    return;
  }

  if (!req.url.startsWith('/api/sftp/')) {
    res.writeHead(404); res.end();
    return;
  }

  const action = req.url.slice('/api/sftp/'.length);
  const sftpFn = withSessionSftp;

  try {
    switch (action) {
      case 'list': {
        const entries = await sftpFn(body, (sftp) => new Promise((resolve, reject) => {
          sftp.readdir(body.path || '/', (err, list) => {
            if (err) { reject(err); return; }
            const result = list.filter(e => e.filename !== '.' && e.filename !== '..')
              .map(e => ({
                name: e.filename,
                type: e.longname?.startsWith('d') ? 'dir' : 'file',
                size: e.attrs?.size || 0,
                mode: e.attrs?.mode || 0o644,
                mtime: e.attrs?.mtime ? new Date(e.attrs.mtime * 1000).toISOString() : null,
              }));
            resolve(result);
          });
        }));
        json(res, { entries });
        break;
      }
      case 'stat': {
        const stat = await sftpFn(body, (sftp) => new Promise((resolve, reject) => {
          sftp.stat(body.path, (err, st) => {
            if (err) { reject(err); return; }
            resolve({ size: st.size, mode: st.mode, mtime: st.mtime ? new Date(st.mtime * 1000).toISOString() : null });
          });
        }));
        json(res, stat);
        break;
      }
      case 'read': {
        const content = await sftpFn(body, (sftp) => new Promise((resolve, reject) => {
          const chunks = [];
          sftp.createReadStream(body.path)
            .on('data', (chunk) => chunks.push(chunk))
            .on('error', (err) => reject(err))
            .on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
        }));
        json(res, { content });
        break;
      }
      case 'write': {
        await sftpFn(body, (sftp) => new Promise((resolve, reject) => {
          const buf = Buffer.from(body.content, body.encoding === 'base64' ? 'base64' : 'utf8');
          sftp.writeFile(body.path, buf, (err) => {
            if (err) reject(err); else resolve();
          });
        }));
        json(res, { success: true });
        break;
      }
      case 'delete': {
        await sftpFn(body, (sftp) => new Promise((resolve, reject) => {
          sftp.unlink(body.path, (err) => {
            if (err) reject(err); else resolve();
          });
        }));
        json(res, { success: true });
        break;
      }
      case 'rmdir': {
        await sftpFn(body, (sftp) => new Promise((resolve, reject) => {
          sftp.rmdir(body.path, (err) => {
            if (err) reject(err); else resolve();
          });
        }));
        json(res, { success: true });
        break;
      }
      case 'mkdir': {
        await sftpFn(body, (sftp) => new Promise((resolve, reject) => {
          sftp.mkdir(body.path, (err) => {
            if (err) reject(err); else resolve();
          });
        }));
        json(res, { success: true });
        break;
      }
      case 'rename': {
        await sftpFn(body, (sftp) => new Promise((resolve, reject) => {
          sftp.rename(body.srcPath, body.destPath, (err) => {
            if (err) reject(err); else resolve();
          });
        }));
        json(res, { success: true });
        break;
      }
      case 'chmod': {
        await sftpFn(body, (sftp) => new Promise((resolve, reject) => {
          sftp.chmod(body.path, parseInt(body.mode, 8), (err) => {
            if (err) reject(err); else resolve();
          });
        }));
        json(res, { success: true });
        break;
      }
      default:
        json(res, { error: 'Unknown action' }, 400);
    }
  } catch (e) {
    json(res, { error: e.message }, 500);
  }
});

const wss = new WebSocketServer({ server, path: WS_PATH });

function handleSSH(ws, config) {
  // ⚠ DO NOT send JSON through the WebSocket in this handler.
  // The client writes ALL WebSocket data directly to the terminal.
  // Any JSON will appear as garbled text or be misinterpreted.
  const client = new Client();
  setupSSHClient(client, config.auth_value);
  const cfg = {
    ...makeSSHConfig(config),
    keepaliveInterval: 30000,
    keepaliveCountMax: 3,
  };
  const tag = `[SSH ${cfg.host}:${cfg.port}]`;
  let sessionId = null;
  const log = (m) => console.log(`${tag} ${m}`);
  const cleanup = () => { if (sessionId && sessions.get(sessionId)?.client === client) sessions.delete(sessionId); try { client.end(); } catch {}; try { ws.close(); } catch {}; try { client.removeAllListeners(); } catch {}; try { ws.removeAllListeners(); } catch {}; };

  client.on('ready', () => {
    log('Connected');
    const stdKey = `${cfg.host}_${cfg.port}_${cfg.username}`;
    sessionId = stdKey;
    if (!sessions.has(stdKey)) {
      sessions.set(stdKey, { client, host: cfg.host, port: cfg.port, username: cfg.username, createdAt: Date.now() });
    }
    client.shell({ term: 'xterm-256color', cols: 120, rows: 30 }, (err, stream) => {
      if (err) { log('Shell error: ' + err.message); try { ws.send('\r\n\x1b[31m[Shell Error] ' + err.message + '\x1b[0m\r\n'); } catch {} cleanup(); return; }
      const onWsMsg = (input) => {
        const str = input.toString();
        if (str.startsWith('resize:')) {
          const [_, rs, cs] = str.split(':');
          const rows = parseInt(rs, 10);
          const cols = parseInt(cs, 10);
          if (rows && cols && stream.setWindow) stream.setWindow(rows, cols);
          return;
        }
        if (stream.writable) stream.write(str);
      };
      ws.on('message', onWsMsg);
      stream.on('data', (c) => { if (ws.readyState === 1) ws.send(c.toString()); });
      stream.stderr.on('data', (c) => { if (ws.readyState === 1) ws.send(c.toString()); });
      stream.on('close', () => { log('Shell closed'); ws.removeListener('message', onWsMsg); cleanup(); });
      // Handle WebSocket close without killing SSH
      ws.on('close', () => { log('WS closed (SSH kept alive)'); ws.removeListener('message', onWsMsg); });
    });
  });
  client.on('error', (err) => {
    log('Error: ' + err.message);
    try { ws.send('\r\n\x1b[31m[Error] ' + err.message + '\x1b[0m\r\n'); } catch {}
    setTimeout(() => cleanup(), 500);
  });
  client.on('close', () => { log('Disconnected'); cleanup(); });
  client.connect(cfg);
}

function handleTelnet(ws, config) {
  const host = config.host;
  const port = config.port || 23;
  const username = config.username;
  const password = config.auth_value;
  const tag = `[TELNET ${host}:${port}]`;
  const log = (m) => console.log(`${tag} ${m}`);
  let tcp = null;
  let loginSent = false;
  let userIndex = 0, passIndex = 0;
  const cleanup = () => { try { tcp?.destroy(); } catch {}; try { ws.close(); } catch {}; };

  const tryLogin = (chunk) => {
    if (!username || loginSent) return;
    const text = chunk.toString('utf8').toLowerCase();
    // Send username on login prompt, password on password prompt
    if (text.includes('login:') || text.includes('username:') || text.includes('user:')) {
      if (!userIndex) { userIndex++; tcp?.write(username + '\n'); log('Sent username'); }
    } else if (text.includes('password:')) {
      if (password && !passIndex) { passIndex++; tcp?.write(password + '\n'); log('Sent password'); }
    }
    // Check for shell prompt or login success
    if (text.includes('$') || text.includes('#') || text.includes('>') || text.includes('Last login')) {
      loginSent = true;
      log('Login complete');
    }
  };

  try {
    tcp = createConnection({ host, port }, () => {
      log('Connected');
      ws.send(JSON.stringify({ type: 'status', message: 'connected' }));
      if (username) {
        // Some telnet servers need a CR/LF to show login prompt
        tcp?.write('\n');
      }
    });
    const onWsMsg = (input) => { if (tcp?.writable) tcp.write(input.toString()); };
    ws.on('message', onWsMsg);
    tcp.on('data', (c) => {
      if (ws.readyState === 1) ws.send(c.toString());
      if (!loginSent) tryLogin(c);
    });
    tcp.on('close', () => { log('Disconnected'); ws.removeListener('message', onWsMsg); cleanup(); });
    tcp.on('error', (err) => { log('Error: ' + err.message); try { ws.send(JSON.stringify({ type: 'error', message: err.message })); } catch {} cleanup(); });
    ws.on('close', () => { log('WS closed'); tcp?.destroy(); ws.removeListener('message', onWsMsg); });
  } catch (e) {
    log('Connection failed: ' + e.message);
    try { ws.send(JSON.stringify({ type: 'error', message: e.message })); } catch {}
    cleanup();
  }
}

function handleSerial(ws, config) {
  const port = config.serial_port || 'COM1';
  const baud = config.serial_baud || 115200;
  const dataBits = config.serial_dataBits || 8;
  const stopBits = config.serial_stopBits || 1;
  const parity = config.serial_parity || 'none';
  const tag = `[SERIAL ${port}]`;
  const log = (m) => console.log(`${tag} ${m}`);
  const cleanup = () => { try { ws.close(); } catch {} };

  if (!SerialPort) {
    log('SerialPort module not available');
    ws.send(JSON.stringify({ type: 'error', message: 'Serial port support is not available. Install the "serialport" package or use a different protocol.' }));
    cleanup();
    return;
  }

  let sp = null;
  try {
    sp = new SerialPort({ path: port, baudRate: baud, dataBits, stopBits, parity }, (err) => {
      if (err) {
        log('Open error: ' + err.message);
        try { ws.send(JSON.stringify({ type: 'error', message: err.message })); } catch {}
        cleanup();
        return;
      }
      log('Opened ' + port + ' @ ' + baud + ' baud');
      ws.send(JSON.stringify({ type: 'status', message: 'connected' }));
    });
    const onWsMsg = (input) => { if (sp?.writable) sp.write(input.toString()); };
    ws.on('message', onWsMsg);
    sp.on('data', (c) => { if (ws.readyState === 1) ws.send(c.toString()); });
    sp.on('error', (err) => {
      log('Error: ' + err.message);
      try { ws.send(JSON.stringify({ type: 'error', message: err.message })); } catch {}
    });
    sp.on('close', () => {
      log('Port closed');
      ws.removeListener('message', onWsMsg);
      cleanup();
    });
    ws.on('close', () => {
      log('WS closed');
      try { sp?.close(); } catch {}
      ws.removeListener('message', onWsMsg);
    });
  } catch (e) {
    log('Failed: ' + e.message);
    try { ws.send(JSON.stringify({ type: 'error', message: e.message })); } catch {}
    cleanup();
  }
}

// ─── Chat Bot System ──────────────────────────────────────────
const CHAT_CONFIG_PATH = join(__dirname, 'chat-config.json');
let chatConfig = { telegram: { enabled: false, token: '', adminIds: [] }, wechat: { enabled: false, apiUrl: '', apiKey: '' }, qq: { enabled: false, apiUrl: '', apiKey: '' }, ai: { enabled: false, apiUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini', systemPrompt: 'You are a helpful SSH operations assistant.', temperature: 0.7 } };
let chatMessages = [];
let chatIdCounter = 0;

try { if (existsSync(CHAT_CONFIG_PATH)) chatConfig = JSON.parse(readFileSync(CHAT_CONFIG_PATH, 'utf8')); } catch {}

function saveChatConfig() { try { writeFileSync(CHAT_CONFIG_PATH, JSON.stringify(chatConfig, null, 2), 'utf8'); } catch (e) { console.error('[Chat] Failed to save config:', e.message); } }

function addChatMessage(msg) {
  const m = { id: `chat_${++chatIdCounter}`, ...msg, timestamp: msg.timestamp || Date.now() };
  chatMessages.push(m);
  if (chatMessages.length > 1000) chatMessages = chatMessages.slice(-1000);
  return m;
}

// Telegram bot polling
let telegramPollTimer = null;
let telegramLastUpdateId = 0;
function startTelegramPoll() {
  stopTelegramPoll();
  if (!chatConfig.telegram?.enabled || !chatConfig.telegram?.token) return;
  const base = `https://api.telegram.org/bot${chatConfig.telegram.token}`;
  const poll = () => {
    httpsGet(`${base}/getUpdates?offset=${telegramLastUpdateId + 1}&timeout=30&allowed_updates=["message"]`, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.ok && data.result) {
            for (const update of data.result) {
              const msg = update.message;
              if (!msg) continue;
              const uid = update.update_id;
              if (uid > telegramLastUpdateId) telegramLastUpdateId = uid;
              const chatId = msg.chat?.id;
              if (!chatId) continue;
              const text = msg.text || '';
              const from = msg.from?.username || msg.from?.first_name || 'User';
              if (!chatConfig.telegram.adminIds.includes(chatId)) {
                httpsGet(`${base}/sendMessage?chat_id=${chatId}&text=Sorry, you are not authorized.`, () => {});
                continue;
              }
              addChatMessage({ platform: 'telegram', direction: 'in', from, text, meta: { chatId } });
              if (chatConfig.ai.enabled) handleAiResponse(text, 'telegram', chatId);
            }
          }
        } catch {}
        telegramPollTimer = setTimeout(poll, 1000);
      });
    }).on('error', () => { telegramPollTimer = setTimeout(poll, 5000); });
  };
  poll();
}
function stopTelegramPoll() { if (telegramPollTimer) { clearTimeout(telegramPollTimer); telegramPollTimer = null; } }

// Platform: send message out via configured bot
async function sendBotMessage(platform, text, meta = {}) {
  if (platform === 'telegram') {
    const cfg = chatConfig.telegram;
    if (!cfg?.enabled || !cfg?.token) return { success: false, error: 'Telegram not configured' };
    const chatId = meta?.chatId || (cfg.adminIds.length > 0 ? cfg.adminIds[0] : null);
    if (!chatId) return { success: false, error: 'No target chat ID' };
    return new Promise((resolve) => {
      const url = `https://api.telegram.org/bot${cfg.token}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(text)}&parse_mode=Markdown`;
      httpsGet(url, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => { try { const r = JSON.parse(body); resolve(r.ok ? { success: true } : { success: false, error: r.description }); } catch { resolve({ success: false }); } });
      }).on('error', (e) => resolve({ success: false, error: e.message }));
    });
  } else if (platform === 'wechat') {
    const cfg = chatConfig.wechat;
    if (!cfg?.enabled || !cfg?.apiUrl) return { success: false, error: 'WeChat not configured' };
    try {
      const res = await fetch(cfg.apiUrl + '/send_message', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cfg.apiKey ? { 'Authorization': `Bearer ${cfg.apiKey}` } : {}) }, body: JSON.stringify({ type: 'text', content: text, ...meta }) });
      return { success: res.ok };
    } catch (e) { return { success: false, error: e.message }; }
  } else if (platform === 'qq') {
    const cfg = chatConfig.qq;
    if (!cfg?.enabled || !cfg?.apiUrl) return { success: false, error: 'QQ not configured' };
    try {
      const target = meta?.groupId ? `group_id=${meta.groupId}` : `user_id=${meta.userId}`;
      const res = await fetch(`${cfg.apiUrl}/send_msg?message_type=${meta?.groupId ? 'group' : 'private'}&${target}&message=${encodeURIComponent(text)}`, { headers: { ...(cfg.apiKey ? { 'Authorization': `Bearer ${cfg.apiKey}` } : {}) } });
      return { success: res.ok };
    } catch (e) { return { success: false, error: e.message }; }
  }
  return { success: false, error: `Unknown platform: ${platform}` };
}

// AI response handler
async function handleAiResponse(incomingText, platform, meta) {
  const cfg = chatConfig.ai;
  if (!cfg?.enabled || !cfg?.apiKey) return;
  try {
    const res = await fetch(`${cfg.apiUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model || 'gpt-4o-mini', messages: [{ role: 'system', content: cfg.systemPrompt || 'You are a helpful assistant.' }, { role: 'user', content: incomingText }], temperature: cfg.temperature || 0.7, max_tokens: 1000 }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content;
    if (!reply) return;
    addChatMessage({ platform: 'ai', direction: 'in', from: 'AI', text: reply });
    await sendBotMessage(platform, reply, meta);
  } catch (e) { console.error('[Chat] AI error:', e.message); }
}

// Start/stop Telegram poll when config changes
function restartTelegramPoll() { startTelegramPoll(); }

// Add API routes for chat
const originalApiRoute = apiRoute;
// We handle chat routes inline in the request handler

wss.on('connection', (ws, req) => {
  console.log(`[WS] New connection from ${req.socket.remoteAddress}`);
  let initialized = false;
  const cleanup = () => {
    clearInterval(pingInterval);
    try { ws.close(); } catch {}
    try { ws.terminate(); } catch {}
    try { ws.removeAllListeners(); } catch {}
  };
  ws.on('close', cleanup);
  ws.on('error', () => cleanup());
  const pingInterval = setInterval(() => {
    if (ws.readyState === 1) { try { ws.ping(); } catch {} }
    else clearInterval(pingInterval);
  }, 30000);

  ws.on('message', (data) => {
    if (initialized) return;
    try {
      let config;
      try { config = JSON.parse(data.toString()); } catch { throw new Error('Invalid JSON'); }
      const proto = (config.protocol || 'ssh').toLowerCase();
      console.log(`[WS] SSH request: ${proto} ${config.host}:${config.port || 22} as ${config.username}`);
      if (proto !== 'serial' && !config.host) throw new Error('Host is required');
      initialized = true;
      ws.removeAllListeners('message');

      if (proto === 'telnet') {
        handleTelnet(ws, config);
      } else if (proto === 'serial') {
        handleSerial(ws, config);
      } else {
        handleSSH(ws, config);
      }
    } catch (e) {
      try { ws.send('\r\n\x1b[31m[Init Error] ' + e.message + '\x1b[0m\r\n'); } catch {}
      cleanup();
    }
  });
});

function getLocalIP() {
  const ifaces = networkInterfaces();
  let fallback = 'localhost';
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (name.startsWith('docker') || name.startsWith('veth') || name.startsWith('br-')) continue;
    for (const iface of addrs) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (name.startsWith('eth') || name.startsWith('en')) return iface.address;
        fallback = iface.address;
      }
    }
  }
  return fallback;
}

const IP_SERVICES = [
  'https://api.ipify.org',
  'https://checkip.amazonaws.com',
  'https://ifconfig.me/ip',
  'http://ip-api.com/line/?query=ip',
];

function fetchPublicIP(retries = 0) {
  if (retries >= IP_SERVICES.length) return;
  const url = IP_SERVICES[retries];
  const get = url.startsWith('https') ? httpsGet : httpGet;
  const req = get(url, { timeout: 5000 }, (res) => {
    let body = '';
    res.on('data', (c) => body += c);
    res.on('end', () => {
      const ip = body.trim();
      if (ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
        console.log(`  Public:  http://${ip}:${PORT}`);
        console.log();
      } else {
        fetchPublicIP(retries + 1);
      }
    });
  });
  req.on('error', () => fetchPublicIP(retries + 1));
  req.on('timeout', () => { req.destroy(); fetchPublicIP(retries + 1); });
}

server.on('error', (err) => {
  console.error('Server error:', err.message);
  if (err.code === 'EADDRINUSE') { console.error(`Port ${PORT} is already in use.`); process.exit(1); }
});
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.listen(PORT, () => {
  const ip = getLocalIP();
  console.log(`\n  🚀 WebSSH Server ready`);
  console.log(`  ───────────────────────`);
  console.log(`  Local:   http://localhost:${PORT}`);
  if (ip !== 'localhost') {
    console.log(`  Network: http://${ip}:${PORT}`);
    console.log(`  WS:      ws://${ip}:${PORT}${WS_PATH}`);
  }
  console.log(`  Health:  http://localhost:${PORT}/health`);
  if (existsSync(DIST_DIR)) console.log(`  Mode:    production (serving built frontend)`);
  else console.log(`  Mode:    development (frontend on :5173)`);
  console.log(`  Fetching public IP...`);
  fetchPublicIP();
});
