import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { Client } from 'ssh2';
import { createConnection } from 'net';
import { existsSync } from 'fs';
import { get as httpGet } from 'http';
import { get as httpsGet } from 'https';

import { PORT, WS_PATH, DIST_DIR, GUACD_HOST, GUACD_PORT } from './lib/config.mjs';
import { makeSSHConfig, setupSSHClient, json, parseBody, checkRate, serveStatic, serveSuicideSW, getLocalIP } from './lib/utils.mjs';
import { findSession, withSessionSftp } from './lib/session.mjs';
import { handleSSH } from './lib/ssh.mjs';
import { handleTelnet } from './lib/telnet.mjs';
import { handleSerial } from './lib/serial.mjs';
import { createChatBot } from './lib/chat.mjs';
import { audit, getAuditLog, clearAuditLog } from './lib/audit.mjs';

// ─── Auth middleware (only when AUTH_TOKEN is set) ───
const AUTH_TOKEN = process.env.AUTH_TOKEN || null;
function authCheck(req, res) {
  if (!AUTH_TOKEN) return true;
  // Health check always public
  if (req.url === '/health') return true;
  // Static files always public (GET only)
  if (req.method === 'GET' && !req.url.startsWith('/api/')) return true;
  // All API calls (GET/POST) require Bearer token
  const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '');
  if (token === AUTH_TOKEN) return true;
  // Allow WebSocket upgrade with token in query param too
  if (req.headers['upgrade']?.toLowerCase() === 'websocket') {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    if (url.searchParams.get('token') === AUTH_TOKEN) return true;
  }
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized. Set Authorization: Bearer <token>' }));
  return false;
}

function setSecurityHeaders(res) {
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

process.on('uncaughtException', (err) => {
  console.error('❗ Uncaught Exception:', err.message);
  console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('❗ Unhandled Rejection:', reason?.message || reason);
});

const chatBot = createChatBot();

// ─── HTTP Server ───
const server = createServer(async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
  if (!checkRate(ip)) { res.writeHead(429); res.end('Too many requests'); return; }
  setSecurityHeaders(res);
  if (!authCheck(req, res)) return;
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (serveSuicideSW(req, res)) return;
  if (req.url === '/health') { json(res, { status: 'ok', uptime: process.uptime() }); return; }
  if (serveStatic(req, res)) return;
  if (req.method !== 'POST') { res.writeHead(404); res.end(); return; }

  const body = await parseBody(req);

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
    if (req.url === '/api/chat/config') {
      if (req.method === 'POST') { chatBot.updateConfig(body); json(res, { success: true }); }
      else json(res, chatBot.getSanitizedConfig());
      return;
    }
    if (req.url === '/api/chat/messages') {
      const since = parseInt(req.headers['x-since'] || '0', 10);
      json(res, { messages: chatBot.getMessages(since) });
      return;
    }
    if (req.url === '/api/chat/send') {
      const { platform, text, meta } = body;
      if (!platform || !text) { json(res, { success: false, error: 'platform and text required' }, 400); return; }
      const result = await chatBot.sendMessage(platform, text, meta);
      json(res, result);
      return;
    }
    if (req.url === '/api/chat/ai') {
      const { message, serverConfig } = body;
      if (!message) { json(res, { success: false, error: 'message required' }, 400); return; }
      const result = await chatBot.processAiMessage(message, serverConfig || null);
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
            const chunks = []; sftp.createReadStream(body.path).on('data', c => chunks.push(c)).on('error', reject).on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
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
  if (!AUTH_TOKEN) return; // Allow WS upgrade when auth is disabled
  // Check token from query parameter in WS URL
  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const token = url.searchParams.get('token') || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
  if (token === AUTH_TOKEN) return; // Allow upgrade
  socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
  socket.destroy();
});

// ─── WebSocket Server (SSH/Telnet/Serial) ───
const wss = new WebSocketServer({ server, path: WS_PATH });
wss.on('connection', (ws, req) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
  console.log(`[WS] New connection from ${ip}`);
  let initialized = false;
  const cleanup = () => { clearInterval(pingInterval); try { ws.close(); } catch {} try { ws.terminate(); } catch {} try { ws.removeAllListeners(); } catch {} };
  ws.on('close', cleanup);
  ws.on('error', () => cleanup());
  const pingInterval = setInterval(() => { if (ws.readyState === 1) { try { ws.ping(); } catch {} } else clearInterval(pingInterval); }, 30000);

  ws.on('message', (data) => {
    if (initialized) return;
    try {
      let config;
      try { config = JSON.parse(data.toString()); } catch { throw new Error('Invalid JSON'); }
      const proto = (config.protocol || 'ssh').toLowerCase();
      console.log(`[WS] ${proto} ${config.host}:${config.port || 22} as ${config.username}`);
      if (proto !== 'serial' && !config.host) throw new Error('Host is required');
      initialized = true;
      ws.removeAllListeners('message');
      if (proto === 'telnet') handleTelnet(ws, config);
      else if (proto === 'serial') handleSerial(ws, config);
      else handleSSH(ws, config);
    } catch (e) { try { ws.send('\r\n\x1b[31m[Init Error] ' + e.message + '\x1b[0m\r\n'); } catch {} cleanup(); }
  });
});

// ─── Guacd WebSocket Proxy (RDP/VNC) ───
const wssGuacd = new WebSocketServer({ server, path: '/ws/guacd' });
wssGuacd.on('connection', (ws) => {
  const guacd = createConnection({ host: GUACD_HOST, port: GUACD_PORT }, () => {
    console.log('[Guacd] Connected');
  });
  ws.on('message', (data) => { if (guacd.writable) guacd.write(data); });
  guacd.on('data', (data) => { if (ws.readyState === 1) ws.send(data); });
  guacd.on('close', () => { try { ws.close(); } catch {} });
  guacd.on('error', () => { try { ws.close(); } catch {} });
  ws.on('close', () => guacd.destroy());
  ws.on('error', () => guacd.destroy());
});

// ─── Docker API via dockerode ───
let Docker;
let docker;
try {
  const dockerode = await import('dockerode');
  Docker = dockerode.default;
  docker = new Docker();
} catch {}

async function handleDockerApi(docker, req, res, body) {
  try {
    const action = req.url.slice('/api/docker/'.length);
    if (action === 'ps') {
      const containers = await docker.listContainers({ all: true });
      json(res, { containers });
    } else if (action === 'exec') {
      const container = docker.getContainer(body.containerId);
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
  if (ip !== 'localhost') console.log(`  Network: http://${ip}:${PORT}`);
  console.log(`  WS:      ws://${ip}:${PORT}${WS_PATH}`);
  console.log(`  Health:  http://localhost:${PORT}/health`);
  if (Docker) console.log(`  Docker:  dockerode (native API)`);
  console.log(`  Guacd:   ws://${ip}:${PORT}/ws/guacd → ${GUACD_HOST}:${GUACD_PORT}`);
  if (existsSync(DIST_DIR)) console.log(`  Mode:    production (serving built frontend)`);
  else console.log(`  Mode:    development (frontend on :5173)`);
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
      if (ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) { console.log(`  Public:  http://${ip}:${PORT}\n`); }
      else fetchPublicIP(retries + 1);
    });
  });
  req.on('error', () => fetchPublicIP(retries + 1));
  req.on('timeout', () => { req.destroy(); fetchPublicIP(retries + 1); });
}
