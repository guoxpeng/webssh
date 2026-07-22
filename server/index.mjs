import { WebSocketServer } from 'ws';
import { Client } from 'ssh2';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { networkInterfaces } from 'os';

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

  if (req.url === '/health') {
    json(res, { status: 'ok', uptime: process.uptime() });
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

wss.on('connection', (ws, req) => {
  console.log(`[SSH] Client connected from ${req.socket.remoteAddress}`);

  let sshClient = new Client();
  let sshConfig = null;
  let initialized = false;

  const cleanUp = () => {
    try { sshClient.end(); } catch {}
    try { ws.close(); } catch {}
    sshClient.removeAllListeners();
    ws.removeAllListeners();
  };

  ws.on('message', (data) => {
    try {
      if (!initialized) {
        const config = JSON.parse(data.toString());
        sshConfig = {
          host: config.host,
          port: config.port || 22,
          username: config.username,
          password: config.auth_type === 'password' ? config.auth_value : undefined,
          privateKey: config.auth_type === 'key' ? config.auth_value : undefined,
          readyTimeout: 10000,
          keepaliveInterval: 10000,
        };
        initialized = true;

        sshClient.on('ready', () => {
          console.log(`[SSH] Connected to ${sshConfig.host}:${sshConfig.port}`);
          ws.send(JSON.stringify({ type: 'status', message: 'connected' }));

          sshClient.shell({ term: 'xterm-256color', cols: 120, rows: 30 }, (err, stream) => {
            if (err) {
              ws.send(JSON.stringify({ type: 'error', message: err.message }));
              return;
            }
            stream.on('data', (chunk) => {
              if (ws.readyState === 1) ws.send(chunk.toString());
            });
            stream.stderr.on('data', (chunk) => {
              if (ws.readyState === 1) ws.send(chunk.toString());
            });
            ws.on('message', (input) => {
              if (initialized) stream.write(input.toString());
            });
            stream.on('close', () => {
              console.log(`[SSH] Shell closed for ${sshConfig.host}`);
              cleanUp();
            });
          });
        });

        sshClient.on('error', (err) => {
          console.error(`[SSH] Error: ${err.message}`);
          try { ws.send(JSON.stringify({ type: 'error', message: err.message })); } catch {}
          cleanUp();
        });

        sshClient.on('close', () => {
          console.log(`[SSH] Connection closed for ${sshConfig?.host}`);
          cleanUp();
        });

        sshClient.connect(sshConfig);
      }
    } catch (e) {
      console.error('[SSH] Parse error:', e.message);
      try { ws.send(JSON.stringify({ type: 'error', message: 'Invalid config: ' + e.message })); } catch {}
    }
  });

  ws.on('close', () => {
    console.log('[SSH] WebSocket closed');
    cleanUp();
  });

  ws.on('error', (e) => {
    console.error('[SSH] WS error:', e.message);
    cleanUp();
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

server.listen(PORT, () => {
  const ip = getLocalIP();
  console.log(`\n  🚀 WebSSH Server ready`);
  console.log(`  ───────────────────────`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://${ip}:${PORT}`);
  console.log(`  WS:      ws://${ip}:${PORT}${WS_PATH}`);
  console.log(`  Health:  http://${ip}:${PORT}/health`);
  if (existsSync(DIST_DIR)) console.log(`  Mode:    production (serving built frontend)`);
  else console.log(`  Mode:    development (frontend on :5173)`);
  console.log();
});
