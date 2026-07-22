import { WebSocketServer } from 'ws';
import { Client } from 'ssh2';
import { createServer } from 'http';
import { createConnection } from 'net';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { networkInterfaces } from 'os';
import { get as httpGet } from 'http';
import { get as httpsGet } from 'https';

const __dirname = join(fileURLToPath(import.meta.url), '..');
const DIST_DIR = join(__dirname, '..', 'dist');
const MIME = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.json':'application/json' };

const PORT = parseInt(process.env.PORT || '9627', 10);
const WS_PATH = process.env.WS_PATH || '/ws/ssh';

async function withSftp(body, fn) {
  const conn = new Client();
  return new Promise((resolve, reject) => {
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); reject(err); return; }
        fn(sftp, conn).then(resolve).catch(reject).finally(() => conn.end());
      });
    });
    conn.on('error', (err) => reject(err));
    const cfg = {
      host: body.host, port: body.port || 22, username: body.username,
      readyTimeout: 8000, keepaliveInterval: 10000,
    };
    if (body.auth_type === 'key') cfg.privateKey = body.auth_value;
    else cfg.password = body.auth_value;
    conn.connect(cfg);
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

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.url === '/health') {
    json(res, { status: 'ok', uptime: process.uptime() });
    return;
  }

  // Production: serve built frontend
  if (req.method === 'GET' && existsSync(DIST_DIR)) {
    let filePath = req.url === '/' ? '/index.html' : req.url;
    const fullPath = join(DIST_DIR, filePath);
    if (existsSync(fullPath)) {
      const ext = extname(fullPath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(readFileSync(fullPath));
      return;
    }
    // SPA fallback
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(readFileSync(join(DIST_DIR, 'index.html')));
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
      const result = await withSftp(node, (sftp) => new Promise((resolve) => {
        const cmds = body.cmds || ["echo 'Connection test OK' && date"];
        const output = [];
        let done = false;
        const conn2 = new Client();
        conn2.on('ready', () => {
          conn2.exec(cmds.join(' && '), (err, stream) => {
            if (err) { resolve({ success: false, error: [err.message] }); return; }
            stream.on('data', (d) => output.push(d.toString().trim()));
            stream.stderr.on('data', (d) => output.push(d.toString().trim()));
            stream.on('close', () => {
              conn2.end();
              resolve({ success: true, output, time_elapsed: 0.5 });
            });
          });
        });
        conn2.on('error', (err) => resolve({ success: false, error: [err.message] }));
        const cfg = { host: node.host, port: node.port || 22, username: node.username, readyTimeout: 8000 };
        if (node.auth_type === 'key') cfg.privateKey = node.auth_value;
        else cfg.password = node.auth_value;
        conn2.connect(cfg);
        setTimeout(() => { if (!done) { done = true; conn2.end(); resolve({ success: false, error: ['Timeout'] }); } }, 15000);
      }));
      json(res, result);
    } catch (e) {
      json(res, { success: false, error: [e.message] }, 500);
    }
    return;
  }

  if (!req.url.startsWith('/api/sftp/')) {
    res.writeHead(404); res.end();
    return;
  }

  const action = req.url.slice('/api/sftp/'.length);

  try {
    switch (action) {
      case 'list': {
        const entries = await withSftp(body, (sftp) => new Promise((resolve, reject) => {
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
        const stat = await withSftp(body, (sftp) => new Promise((resolve, reject) => {
          sftp.stat(body.path, (err, st) => {
            if (err) { reject(err); return; }
            resolve({ size: st.size, mode: st.mode, mtime: st.mtime ? new Date(st.mtime * 1000).toISOString() : null });
          });
        }));
        json(res, stat);
        break;
      }
      case 'read': {
        const content = await withSftp(body, (sftp) => new Promise((resolve, reject) => {
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
        await withSftp(body, (sftp) => new Promise((resolve, reject) => {
          const buf = Buffer.from(body.content, body.encoding === 'base64' ? 'base64' : 'utf8');
          sftp.writeFile(body.path, buf, (err) => {
            if (err) reject(err); else resolve();
          });
        }));
        json(res, { success: true });
        break;
      }
      case 'delete': {
        await withSftp(body, (sftp) => new Promise((resolve, reject) => {
          sftp.unlink(body.path, (err) => {
            if (err) reject(err); else resolve();
          });
        }));
        json(res, { success: true });
        break;
      }
      case 'rmdir': {
        await withSftp(body, (sftp) => new Promise((resolve, reject) => {
          sftp.rmdir(body.path, (err) => {
            if (err) reject(err); else resolve();
          });
        }));
        json(res, { success: true });
        break;
      }
      case 'mkdir': {
        await withSftp(body, (sftp) => new Promise((resolve, reject) => {
          sftp.mkdir(body.path, (err) => {
            if (err) reject(err); else resolve();
          });
        }));
        json(res, { success: true });
        break;
      }
      case 'rename': {
        await withSftp(body, (sftp) => new Promise((resolve, reject) => {
          sftp.rename(body.srcPath, body.destPath, (err) => {
            if (err) reject(err); else resolve();
          });
        }));
        json(res, { success: true });
        break;
      }
      case 'chmod': {
        await withSftp(body, (sftp) => new Promise((resolve, reject) => {
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
  const client = new Client();
  const cfg = {
    host: config.host, port: config.port || 22, username: config.username,
    password: config.auth_type === 'password' ? config.auth_value : undefined,
    privateKey: config.auth_type === 'key' ? config.auth_value : undefined,
    readyTimeout: 10000, keepaliveInterval: 10000,
  };
  const tag = `[SSH ${cfg.host}:${cfg.port}]`;
  const log = (m) => console.log(`${tag} ${m}`);
  const cleanup = () => { try { client.end(); } catch {}; try { ws.close(); } catch {}; client.removeAllListeners(); ws.removeAllListeners(); };

  client.on('ready', () => {
    log('Connected');
    ws.send(JSON.stringify({ type: 'status', message: 'connected' }));
    client.shell({ term: 'xterm-256color', cols: 120, rows: 30 }, (err, stream) => {
      if (err) { ws.send(JSON.stringify({ type: 'error', message: err.message })); return; }
      const onWsMsg = (input) => { if (stream.writable) stream.write(input.toString()); };
      ws.on('message', onWsMsg);
      stream.on('data', (c) => { if (ws.readyState === 1) ws.send(c.toString()); });
      stream.stderr.on('data', (c) => { if (ws.readyState === 1) ws.send(c.toString()); });
      stream.on('close', () => { log('Shell closed'); ws.removeListener('message', onWsMsg); cleanup(); });
    });
  });
  client.on('error', (err) => { log('Error: ' + err.message); try { ws.send(JSON.stringify({ type: 'error', message: err.message })); } catch {} cleanup(); });
  client.on('close', () => { log('Disconnected'); cleanup(); });
  client.connect(cfg);
}

function handleTelnet(ws, config) {
  const host = config.host;
  const port = config.port || 23;
  const tag = `[TELNET ${host}:${port}]`;
  const log = (m) => console.log(`${tag} ${m}`);
  let tcp = null;
  const cleanup = () => { try { tcp?.destroy(); } catch {}; try { ws.close(); } catch {}; };

  try {
    tcp = createConnection({ host, port }, () => {
      log('Connected');
      ws.send(JSON.stringify({ type: 'status', message: 'connected' }));
    });
    const onWsMsg = (input) => { if (tcp?.writable) tcp.write(input.toString()); };
    ws.on('message', onWsMsg);
    tcp.on('data', (c) => { if (ws.readyState === 1) ws.send(c.toString()); });
    tcp.on('close', () => { log('Disconnected'); ws.removeListener('message', onWsMsg); cleanup(); });
    tcp.on('error', (err) => { log('Error: ' + err.message); try { ws.send(JSON.stringify({ type: 'error', message: err.message })); } catch {} cleanup(); });
    ws.on('close', () => { log('WS closed'); tcp?.destroy(); ws.removeListener('message', onWsMsg); });
  } catch (e) {
    log('Connection failed: ' + e.message);
    try { ws.send(JSON.stringify({ type: 'error', message: e.message })); } catch {}
    cleanup();
  }
}

wss.on('connection', (ws, req) => {
  let initialized = false;
  const cleanup = () => { try { ws.close(); } catch {}; ws.removeAllListeners(); };

  ws.on('message', (data) => {
    if (initialized) return;
    try {
      const config = JSON.parse(data.toString());
      const proto = (config.protocol || 'ssh').toLowerCase();
      initialized = true;
      ws.removeAllListeners('message');

      if (proto === 'telnet') {
        handleTelnet(ws, config);
      } else {
        handleSSH(ws, config);
      }
    } catch (e) {
      try { ws.send(JSON.stringify({ type: 'error', message: 'Invalid config: ' + e.message })); } catch {}
      cleanup();
    }
  });

  ws.on('close', cleanup);
  ws.on('error', () => cleanup());
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
