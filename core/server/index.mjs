import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { Client } from 'ssh2';
import { createConnection } from 'net';
import { existsSync } from 'fs';
import os from 'os';
import { get as httpGet } from 'http';
import { get as httpsGet } from 'https';
import { timingSafeEqual, randomBytes } from 'crypto';

import { PORT, WS_PATH, DIST_DIR, GUACD_HOST, GUACD_PORT } from './lib/config.mjs';
import { makeSSHConfig, setupSSHClient, json, parseBody, checkRate, serveStatic, serveSuicideSW, getLocalIP, originAllowed, setInjectedAuthToken } from './lib/utils.mjs';
import { findSession, withSessionSftp } from './lib/session.mjs';
import { handleSSH } from './lib/ssh.mjs';
import { handleSFTP } from './lib/sftp.mjs';
import { handleTelnet } from './lib/telnet.mjs';
import { handleSerial } from './lib/serial.mjs';
import { handleGuacdWS } from './lib/guacd.mjs';
import { audit, getAuditLog, clearAuditLog } from './lib/audit.mjs';
import { handleModelApi, setAuthToken } from './lib/modelapi.mjs';

import { logger, getLevel } from './lib/logger.mjs';

// SECURITY (M3): hard cap for SFTP file reads through the API
const MAX_SFTP_READ_BYTES = 16 * 1024 * 1024;

let chatBot = null;
async function getChatBot() {
  if (!chatBot) {
    const module = await import('./lib/chat.mjs');
    chatBot = module.createChatBot();
  }
  return chatBot;
}

const log = logger('Server');

// ─── Auth middleware ───
// SECURITY (C1): every API/WS request must present AUTH_TOKEN — the server
// refuses to act as an open SSH relay. If the operator did not provide one we
// generate a random per-process token instead of disabling the app, so
// zero-config launches (desktop shell, plain `node index.mjs`) keep working
// while the endpoint is still never unauthenticated. The token is handed to
// the locally served frontend via the startup page (see serveStatic).
const AUTH_TOKEN = process.env.AUTH_TOKEN || randomBytes(24).toString('base64url');
if (!process.env.AUTH_TOKEN) {
  log.warn('AUTH_TOKEN not set — generated an ephemeral token for this session. Set AUTH_TOKEN=<secret> for a stable token (e.g. for the local-model API).');
}
setAuthToken(AUTH_TOKEN);
// Hand the token to the locally served frontend (index.html injection).
setInjectedAuthToken(AUTH_TOKEN);

// SECURITY (M7): constant-time token comparison.
function safeTokenMatch(token) {
  if (!AUTH_TOKEN || typeof token !== 'string' || token.length === 0) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(AUTH_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authCheck(req, res) {
  // Health check always public
  if (req.url === '/health') return true;
  const isStaticGet = req.method === 'GET' && !req.url.startsWith('/api/');
  if (!AUTH_TOKEN) {
    if (isStaticGet) return true;
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'AUTH_TOKEN not set: all API/WS endpoints are disabled. Start the server with AUTH_TOKEN=<secret>.' }));
    return false;
  }
  // Static files always public (GET only)
  if (isStaticGet) return true;
  // All API calls (GET/POST) require Bearer token
  const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '');
  if (safeTokenMatch(token)) return true;
  // Allow WebSocket upgrade with token in query param too
  if (req.headers['upgrade']?.toLowerCase() === 'websocket') {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    if (safeTokenMatch(url.searchParams.get('token'))) return true;
  }
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized. Set Authorization: Bearer <token>' }));
  return false;
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

// SECURITY (M5): log and keep running; a single bad request must not kill the
// whole server (supervisor/process manager remains the restart backstop).
process.on('uncaughtException', (err) => {
  log.error('uncaught exception (process kept alive)', err);
});
process.on('unhandledRejection', (reason) => {
  log.error('unhandled rejection', reason instanceof Error ? reason : new Error(String(reason)));
});

// SECURITY (H5): only trust X-Forwarded-For when explicitly deployed behind a
// proxy; otherwise the rate limiter is keyed on the real socket address.
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
function clientIp(req) {
  if (TRUST_PROXY) return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
  return req.socket.remoteAddress || '';
}

// ─── HTTP Server ───
export const server = createServer(async (req, res) => {
  if (!checkRate(clientIp(req))) { res.writeHead(429); res.end('Too many requests'); return; }
  setSecurityHeaders(res);
  if (!authCheck(req, res)) return;
  // SECURITY (H2): browser requests must come from our own origin. Non-browser
  // clients (no Origin header) authenticate via Bearer token instead.
  if (req.url.startsWith('/api/') && !originAllowed(req)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Origin not allowed' }));
    return;
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (serveSuicideSW(req, res)) return;
  if (req.url === '/health') { json(res, { status: 'ok', uptime: process.uptime() }); return; }
  if (serveStatic(req, res)) return;
  // SECURITY (L2): previously GET APIs were dead code (unreachable behind the
  // POST-only gate). Read-only endpoints are now explicitly GET-allowed
  // (still behind the Bearer-token authCheck above).
  const GET_ALLOWED_API = new Set(['/api/chat/config', '/api/audit', '/api/model/servers', '/api/server-info']);
  if (req.method !== 'POST' && !(req.method === 'GET' && GET_ALLOWED_API.has(req.url))) {
    res.writeHead(404); res.end(); return;
  }
  // ── Server self-description ──
  // Lets any client (esp. phones on the LAN) discover the address they should
  // point at: reports the server's own non-internal IPv4 addresses + port.
  if (req.method === 'GET' && req.url === '/api/server-info') {
    const lan = [];
    try {
      const ifaces = os.networkInterfaces();
      for (const list of Object.values(ifaces)) {
        for (const ni of list || []) {
          if (ni.family === 'IPv4' && !ni.internal) lan.push(ni.address);
        }
      }
    } catch {}
    json(res, { port: Number(PORT), addresses: lan, wsPath: WS_PATH });
    return;
  }
  // SECURITY (H2): strict Content-Type so cross-site "simple" (text/plain)
  // requests cannot drive the API.
  const contentType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (req.method === 'POST' && contentType !== 'application/json') {
    res.writeHead(415, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Content-Type must be application/json' }));
    return;
  }

  const body = await parseBody(req);
  // SECURITY (M3): parseBody resolves null when the body exceeds the size cap.
  if (body === null) {
    res.writeHead(413, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Request body too large' }));
    req.destroy();
    return;
  }

  // ── SSH Test ──
  if (req.url === '/api/ssh/test') {
    const node = body.node || body;
    try {
      const existing = findSession(node.host, node.port, node.username, node.auth_value);
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
        audit('ssh_test', { host: node.host, port: node.port, username: node.username, success: result.success });
        return;
      }
      const cmds = body.cmds || ["echo 'Connection test OK' && date"];
      const output = [];
      let done = false;
      const conn = new Client();
      setupSSHClient(conn, node.auth_value);
      const result = await new Promise((resolve) => {
        const timeout = setTimeout(() => { if (!done) { done = true; try { conn.end(); } catch {} resolve({ success: false, error: ['Timeout'] }); } }, 10000);
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
        try { conn.connect(makeSSHConfig(node)); } catch (e) { clearTimeout(timeout); resolve({ success: false, error: [e.message] }); }
      });
      json(res, result);
      audit('ssh_test', { host: node.host, port: node.port, username: node.username, success: result.success });
    } catch (e) { json(res, { success: false, error: [e.message] }, 500); }
    return;
  }

  // ── Chat Bot API ──
  if (req.url.startsWith('/api/chat/')) {
    const bot = await getChatBot();
    if (req.url === '/api/chat/config') {
      if (req.method === 'POST') { bot.updateConfig(body); json(res, { success: true }); }
      else json(res, bot.getSanitizedConfig());
      return;
    }
    if (req.url === '/api/chat/messages') {
      const since = parseInt(req.headers['x-since'] || '0', 10);
      json(res, { messages: bot.getMessages(since) });
      return;
    }
    if (req.url === '/api/chat/send') {
      const { platform, text, meta } = body;
      if (!platform || !text) { json(res, { success: false, error: 'platform and text required' }, 400); return; }
      const result = await bot.sendMessage(platform, text, meta);
      json(res, result);
      return;
    }
    if (req.url === '/api/chat/ai') {
      const { message, serverConfig } = body;
      if (!message) { json(res, { success: false, error: 'message required' }, 400); return; }
      const result = await bot.processAiMessage(message, serverConfig || null);
      json(res, result);
      return;
    }
    json(res, { error: 'Not found' }, 404);
    return;
  }

  // ── Audit Log API ──
  if (req.url === '/api/audit') {
    json(res, { entries: getAuditLog(parseInt(body.limit || '200', 10)) });
    return;
  }
  if (req.url === '/api/audit/clear') {
    clearAuditLog();
    json(res, { success: true });
    return;
  }

  // ── SFTP API ──
  if (req.url.startsWith('/api/sftp/')) {
    const action = req.url.slice('/api/sftp/'.length);
    try {
      switch (action) {
        case 'list': {
          const entries = await withSessionSftp(body, (sftp) => new Promise((resolve, reject) => {
            sftp.readdir(body.path || '/', (err, list) => {
              if (err) { reject(err); return; }
              resolve(list.filter(e => e.filename !== '.' && e.filename !== '..').map(e => ({
                name: e.filename, type: e.longname?.startsWith('d') ? 'dir' : 'file',
                size: e.attrs?.size || 0, mode: e.attrs?.mode || 0o644,
                mtime: e.attrs?.mtime ? new Date(e.attrs.mtime * 1000).toISOString() : null,
              })));
            });
          }));
          json(res, { entries }); break;
        }
        case 'stat': {
          const stat = await withSessionSftp(body, (sftp) => new Promise((resolve, reject) => {
            sftp.stat(body.path, (err, st) => { if (err) reject(err); else resolve({ size: st.size, mode: st.mode, mtime: st.mtime ? new Date(st.mtime * 1000).toISOString() : null }); });
          }));
          json(res, stat); break;
        }
        case 'read': {
          const content = await withSessionSftp(body, (sftp) => new Promise((resolve, reject) => {
            const chunks = []; let size = 0;
            const stream = sftp.createReadStream(body.path);
            stream.on('data', c => {
              size += c.length;
              // SECURITY (M3): refuse to buffer unbounded remote files
              if (size > MAX_SFTP_READ_BYTES) { stream.destroy(); reject(new Error('File too large to read via API')); return; }
              chunks.push(c);
            }).on('error', reject).on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
          }));
          json(res, { content }); break;
        }
        case 'write': { await withSessionSftp(body, (sftp) => new Promise((resolve, reject) => { const buf = Buffer.from(body.content, body.encoding === 'base64' ? 'base64' : 'utf8'); sftp.writeFile(body.path, buf, (err) => { if (err) reject(err); else resolve(); }); })); json(res, { success: true }); break; }
        case 'delete': { await withSessionSftp(body, (sftp) => new Promise((resolve, reject) => { sftp.unlink(body.path, (err) => { if (err) reject(err); else resolve(); }); })); json(res, { success: true }); break; }
        case 'rmdir': { await withSessionSftp(body, (sftp) => new Promise((resolve, reject) => { sftp.rmdir(body.path, (err) => { if (err) reject(err); else resolve(); }); })); json(res, { success: true }); break; }
        case 'mkdir': { await withSessionSftp(body, (sftp) => new Promise((resolve, reject) => { sftp.mkdir(body.path, (err) => { if (err) reject(err); else resolve(); }); })); json(res, { success: true }); break; }
        case 'rename': { await withSessionSftp(body, (sftp) => new Promise((resolve, reject) => { sftp.rename(body.srcPath, body.destPath, (err) => { if (err) reject(err); else resolve(); }); })); json(res, { success: true }); break; }
        case 'chmod': { await withSessionSftp(body, (sftp) => new Promise((resolve, reject) => { sftp.chmod(body.path, parseInt(body.mode, 8), (err) => { if (err) reject(err); else resolve(); }); })); json(res, { success: true }); break; }
        default: json(res, { error: 'Unknown action' }, 400);
      }
    } catch (e) { json(res, { error: e.message }, 500); }
    return;
  }

  // ── Model API (registry + probe + exec for local AI models) ──
  if (req.url.startsWith('/api/model/')) {
    await handleModelApi(req, res, body);
    return;
  }

  // ── Docker API (via dockerode, falls back to SSH exec) ──
  if (req.url.startsWith('/api/docker/')) {
    if (Docker) {
      await handleDockerApi(docker, req, res, body);
    } else {
      json(res, { error: 'Docker socket not available. Use Docker/VPS deployment.' }, 501);
    }
    return;
  }

  res.writeHead(404); res.end();
});

// ─── WebSocket Upgrade Auth ───
server.on('upgrade', (req, socket, head) => {
  // SECURITY (C1): without AUTH_TOKEN no WebSocket sessions are accepted.
  if (!AUTH_TOKEN) {
    socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    socket.destroy();
    return;
  }
  // Check token from query parameter, Authorization header, or the
  // Sec-WebSocket-Protocol header (preferred — keeps tokens out of URLs/logs).
  // Clients offer ['webssh-auth', <token>]; any non-marker entry is the token.
  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  let protoToken = '';
  const protoHeader = req.headers['sec-websocket-protocol'];
  if (protoHeader) {
    for (const part of String(protoHeader).split(',')) {
      const p = part.trim();
      if (p && p !== 'webssh-auth') { protoToken = p; break; }
    }
  }
  const token = url.searchParams.get('token') || req.headers['authorization']?.replace(/^Bearer\s+/i, '') || protoToken;
  if (safeTokenMatch(token)) return; // Allow upgrade
  socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
  socket.destroy();
});

// ─── WebSocket Server (SSH/Telnet/Serial + Guacd) ───
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  if (socket.destroyed) return; // rejected by the auth handler above
  // Strip the query string — tokens/params must not break path routing.
  const url = (req.url || '').split('?')[0];
  if (url === WS_PATH) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
      log.info(`WS connection from ${ip}`);
      let initialized = false;
      const cleanup = () => { clearInterval(pingInterval); try { ws.close(1000); } catch {} try { ws.removeAllListeners(); } catch {} };
      ws.on('close', () => cleanup());
      ws.on('error', () => cleanup());
      const pingInterval = setInterval(() => { if (ws.readyState === 1) { try { ws.ping(); } catch {} } else clearInterval(pingInterval); }, 30000);

      ws.on('message', (data) => {
        if (initialized) return;
        try {
          let config;
          try { config = JSON.parse(data.toString()); } catch { throw new Error('Invalid JSON'); }
          const proto = (config.protocol || 'ssh').toLowerCase();
          log.info(`${proto} ${config.host}:${config.port || 22} as ${config.username}`);
          if (proto !== 'serial' && !config.host) throw new Error('Host is required');
          initialized = true;
          ws.removeAllListeners('message');
          if (proto === 'telnet') handleTelnet(ws, config);
          else if (proto === 'serial') handleSerial(ws, config);
          else handleSSH(ws, config);
        } catch (e) { try { ws.send('\r\n\x1b[31m[Init Error] ' + e.message + '\x1b[0m\r\n'); } catch {} cleanup(); }
      });
    });
  } else if (url === '/ws/guacd') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
      log.info(`guacd WS from ${ip}`);
      let initialized = false;
      const cleanup = () => { try { ws.close(1000); } catch {} try { ws.removeAllListeners(); } catch {}; };
      ws.on('close', () => cleanup());
      ws.on('error', () => cleanup());
      // First message carries the connection config as JSON (same shape as
      // /ws/ssh); the handshake with guacd is done server-side afterwards.
      ws.on('message', (data) => {
        if (initialized) return;
        try {
          const config = JSON.parse(data.toString());
          if (!config.host) throw new Error('Host is required');
          initialized = true;
          ws.removeAllListeners('message');
          handleGuacdWS(ws, config);
        } catch (e) {
          try { ws.send(JSON.stringify({ type: 'error', message: '[Init Error] ' + e.message })); } catch {}
          cleanup();
        }
      });
    });
  } else if (url === '/ws/sftp') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
      log.info(`SFTP WS from ${ip}`);
      let initialized = false;
      ws.on('close', () => { log.debug('SFTP WS closed'); });
      ws.on('error', (e) => { log.error('SFTP WS error', e); });
      ws.on('message', (data) => {
        if (initialized) return;
        try {
          const config = JSON.parse(data.toString());
          log.info(`SFTP ${config.host} ${config.username} ${config.auth_type} ${config.auth_value ? '***' : 'NO_AUTH'}`);
          initialized = true;
          handleSFTP(ws, config);
        } catch (e) {
          log.error('SFTP WS parse error', e);
          try { ws.send(JSON.stringify({ type: 'status', status: 'error', error: 'Invalid config JSON' })); } catch {}
          try { ws.close(1000); } catch {}
        }
      });
    });
  }
});


// ─── Docker API via dockerode ───
let Docker = null;
let docker = null;
let dockerInitialized = false;
async function initDocker() {
  if (dockerInitialized) return;
  dockerInitialized = true;
  try {
    const dockerode = await import('dockerode');
    Docker = dockerode.default;
    docker = new Docker();
  } catch {}
}

async function handleDockerApi(dockerInstance, req, res, body) {
  try {
    const action = req.url.slice('/api/docker/'.length);
    if (action === 'ps') {
      const containers = await dockerInstance.listContainers({ all: true });
      json(res, { containers });
    } else if (action === 'exec') {
      const container = dockerInstance.getContainer(body.containerId);
      if (body.action === 'logs') {
        const logs = await container.logs({ stdout: true, stderr: true, tail: 100 });
        json(res, { output: logs.toString() });
      } else if (body.action === 'start') { await container.start(); json(res, { success: true }); }
      else if (body.action === 'stop') { await container.stop(); json(res, { success: true }); }
      else if (body.action === 'restart') { await container.restart(); json(res, { success: true }); }
      else json(res, { error: 'Unknown action' }, 400);
    } else json(res, { error: 'Unknown action' }, 400);
  } catch (e) { json(res, { error: e.message }, 500); }
}

// ─── Startup ───
server.on('error', (err) => {
  log.error('server error', err);
  if (err.code === 'EADDRINUSE') { log.error(`port ${PORT} already in use`); process.exit(1); }
});
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.listen(PORT, () => {
  if (!AUTH_TOKEN) {
    log.warn('AUTH_TOKEN not set — all API/WebSocket endpoints are DISABLED (static + /health only). Set AUTH_TOKEN=<secret> to enable.');
  }
  const ip = getLocalIP();
  log.info(`WebSSH ready — http://localhost:${PORT}`);
  log.info(`health: http://localhost:${PORT}/health`);
  log.info(`ws: ws://${ip}:${PORT}${WS_PATH}`);
  if (Docker) log.info('docker: native API (dockerode)');
  log.info(`guacd: ws://${ip}:${PORT}/ws/guacd → ${GUACD_HOST}:${GUACD_PORT}`);
  log.info(`mode: ${existsSync(DIST_DIR) ? 'production' : 'development (frontend :5173)'}`);
  log.info(`log level: ${getLevel()}`);
  fetchPublicIP();
});

function fetchPublicIP(retries = 0) {
  const services = ['https://api.ipify.org', 'https://checkip.amazonaws.com', 'https://ifconfig.me/ip', 'http://ip-api.com/line/?query=ip'];
  if (retries >= services.length) return;
  const url = services[retries];
  const get = url.startsWith('https') ? httpsGet : httpGet;
  const req = get(url, { timeout: 5000 }, (res) => {
    let body = '';
    res.on('data', (c) => body += c);
    res.on('end', () => {
      const ip = body.trim();
      if (ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) { log.info(`public IP: ${ip}:${PORT}`); }
      else fetchPublicIP(retries + 1);
    });
  });
  req.on('error', () => fetchPublicIP(retries + 1));
  req.on('timeout', () => { req.destroy(); fetchPublicIP(retries + 1); });
}
