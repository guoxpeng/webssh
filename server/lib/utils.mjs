import { SSH_ALGORITHMS } from './config.mjs';
import { createHash } from 'crypto';

export function hashCreds(authValue) {
  if (!authValue) return null;
  return createHash('sha256').update(authValue).digest('hex').slice(0, 16);
}

export function makeSSHConfig(body) {
  const cfg = {
    host: body.host,
    port: body.port || 22,
    username: body.username || 'root',
    readyTimeout: 15000,
    algorithms: SSH_ALGORITHMS,
    hostVerifier: (keyHash, callback) => {
      const fp = keyHash.toString('hex').match(/.{2}/g)?.join(':') || keyHash.toString('hex');
      console.log(`[SSH] Host key fingerprint for ${body.host}:${body.port || 22}: ${fp}`);
      if (typeof callback === 'function') callback(true);
      return true;
    },
  };
  if (body.auth_value) {
    if (body.auth_type === 'key') cfg.privateKey = body.auth_value;
    else cfg.password = body.auth_value;
  }
  return cfg;
}

export function setupSSHClient(client, password) {
  client.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
    finish(prompts.map(() => password || ''));
  });
}

export function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

// Rate limiter
const rateMap = new Map();
export function checkRate(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, reset: now + 60000 };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60000; }
  entry.count++;
  rateMap.set(ip, entry);
  return entry.count <= 60;
}
// WebSocket connection rate limiter (per IP)
const wsRateMap = new Map();
export function checkWsRate(ip) {
  const now = Date.now();
  const entry = wsRateMap.get(ip) || { count: 0, reset: now + 60000 };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60000; }
  entry.count++;
  wsRateMap.set(ip, entry);
  return entry.count <= 10; // max 10 WS connections/min per IP
}
// rate limiter cleanup every 60s
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateMap) { if (now > v.reset) rateMap.delete(k); }
  for (const [k, v] of wsRateMap) { if (now > v.reset) wsRateMap.delete(k); }
}, 60000);

import { networkInterfaces } from 'os';

export function getLocalIP() {
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

// Serve static files
import { readFileSync, existsSync } from 'fs';
import { join, extname, resolve } from 'path';
import { DIST_DIR, MIME } from './config.mjs';

export function serveStatic(req, res) {
  if (req.method !== 'GET' || !existsSync(DIST_DIR)) return false;
  try {
    let filePath = req.url === '/' ? '/index.html' : req.url.split('?')[0].split('#')[0];
    const fullPath = resolve(join(DIST_DIR, filePath));
    // Prevent path traversal: fullPath must be within DIST_DIR
    if (!fullPath.startsWith(resolve(DIST_DIR))) return false;
    if (existsSync(fullPath)) {
      const ext = extname(fullPath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(readFileSync(fullPath));
      return true;
    }
    const indexPath = join(DIST_DIR, 'index.html');
    if (existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(readFileSync(indexPath));
      return true;
    }
  } catch (e) {
    console.error('Static file error:', e.message);
  }
  return false;
}

// Suicide SW to break stale PWA cache
export function serveSuicideSW(req, res) {
  if (req.url !== '/sw.js') return false;
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
  return true;
}
