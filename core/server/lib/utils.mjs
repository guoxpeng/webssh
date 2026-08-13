import { SSH_ALGORITHMS } from './config.mjs';
import { createHash } from 'crypto';
import { logger } from './logger.mjs';
import { fileURLToPath } from 'url';

const log = logger('Utils');

export function hashCreds(authValue) {
  if (!authValue) return null;
  return createHash('sha256').update(authValue).digest('hex').slice(0, 16);
}

// ─── SSH host key verification (TOFU) ───
// SECURITY (M1): the previous hostVerifier accepted every key, leaving all SSH
// traffic open to MITM. The first-seen fingerprint is now persisted and later
// connections must match it. Set SSH_INSECURE_NO_HOST_CHECK=1 to restore the
// old behaviour (discouraged).
const INSECURE_NO_HOST_CHECK = process.env.SSH_INSECURE_NO_HOST_CHECK === '1';
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const KNOWN_HOSTS_PATH = join(DATA_DIR, 'known_hosts.json');
let knownHostsCache = null;

export function loadKnownHosts() {
  if (knownHostsCache) return knownHostsCache;
  try {
    knownHostsCache = existsSync(KNOWN_HOSTS_PATH) ? JSON.parse(readFileSync(KNOWN_HOSTS_PATH, 'utf8')) : {};
  } catch {
    knownHostsCache = {};
  }
  return knownHostsCache;
}

function saveKnownHosts() {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(KNOWN_HOSTS_PATH, JSON.stringify(knownHostsCache, null, 2), { mode: 0o600 });
  } catch (e) {
    log.error('failed to persist known_hosts', e.message);
  }
}

export function verifyHostKey(host, port, keyHash, callback) {
  const fp = keyHash.toString('hex').match(/.{2}/g)?.join(':') || keyHash.toString('hex');
  if (INSECURE_NO_HOST_CHECK) {
    log.info(`[SSH] host key check DISABLED via env, accepting ${fp} for ${host}:${port}`);
    if (typeof callback === 'function') callback(true);
    return true;
  }
  const known = loadKnownHosts();
  const key = `${host}:${port}`;
  if (!known[key]) {
    known[key] = fp;
    saveKnownHosts();
    log.info(`[SSH] TOFU: stored host key ${fp} for ${key}`);
    if (typeof callback === 'function') callback(true);
    return true;
  }
  if (known[key] === fp) {
    if (typeof callback === 'function') callback(true);
    return true;
  }
  log.error(`[SSH] HOST KEY MISMATCH for ${key}: expected ${known[key]}, got ${fp} — refusing connection (possible MITM)`);
  if (typeof callback === 'function') callback(new Error('Host key verification failed: fingerprint changed (possible MITM)'));
  return false;
}

export function makeSSHConfig(body) {
  const cfg = {
    host: body.host,
    port: body.port || 22,
    username: body.username || 'root',
    readyTimeout: 30000,
    algorithms: SSH_ALGORITHMS,
    hostVerifier: (keyHash, callback) => verifyHostKey(body.host, body.port || 22, keyHash, callback),
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

// SECURITY (M3): bounded request bodies. Resolves null when the cap is exceeded
// so callers can answer 413 instead of buffering unbounded input. After
// resolving, further chunks are dropped (memory stays bounded); the caller is
// responsible for destroying the request after sending the response.
const MAX_BODY_BYTES = 2 * 1024 * 1024;
export function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    let done = false;
    const finish = (value) => { if (!done) { done = true; resolve(value); } };
    req.on('data', (chunk) => {
      if (done) return; // drop everything after an oversize verdict
      body += chunk;
      if (body.length > MAX_BODY_BYTES) finish(null);
    });
    req.on('end', () => {
      try { finish(JSON.parse(body)); } catch { finish({}); }
    });
    req.on('error', () => finish({}));
  });
}

// SECURITY (H2): browser requests (with an Origin header) must target our own
// host; non-browser clients send no Origin and rely on the Bearer token.
export function originAllowed(req) {
  const origin = req.headers['origin'];
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
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
// rate limiter cleanup every 60s
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateMap) { if (now > v.reset) rateMap.delete(k); }
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

// Serve static files with gzip
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, extname, resolve } from 'path';
import { createGzip, gzipSync } from 'zlib';
import { DIST_DIR, MIME } from './config.mjs';

// The auth token is injected into the served index.html so the frontend can
// authenticate without needing VITE_AUTH_TOKEN baked in at build time
// (desktop shell / zero-config launches generate a token at runtime).
let INJECTED_AUTH_TOKEN = '';
export function setInjectedAuthToken(token) { INJECTED_AUTH_TOKEN = token || ''; }

// Serve index.html with the runtime token injected (always fresh, no-cache)
function serveIndexWithToken(res, useGzip) {
  const indexPath = join(DIST_DIR, 'index.html');
  if (!existsSync(indexPath)) return false;
  let html = readFileSync(indexPath, 'utf8');
  if (INJECTED_AUTH_TOKEN) {
    const tag = `<script>window.__WEBSSH_AUTH_TOKEN__=${JSON.stringify(INJECTED_AUTH_TOKEN)};</script>`;
    html = html.includes('</head>') ? html.replace('</head>', `${tag}</head>`) : tag + html;
  }
  const headers = { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache, must-revalidate' };
  if (useGzip) {
    headers['Content-Encoding'] = 'gzip';
    res.writeHead(200, headers);
    res.end(gzipSync(Buffer.from(html, 'utf8')));
  } else {
    res.writeHead(200, headers);
    res.end(html);
  }
  return true;
}

export function serveStatic(req, res) {
  if (req.method !== 'GET' || !existsSync(DIST_DIR)) return false;
  try {
    let filePath = req.url === '/' ? '/index.html' : req.url.split('?')[0].split('#')[0];
    const fullPath = resolve(join(DIST_DIR, filePath));
    // SECURITY (L1): compare against the directory + separator so sibling dirs
    // sharing the prefix cannot be served
    if (!fullPath.startsWith(resolve(DIST_DIR) + '/') && fullPath !== resolve(DIST_DIR)) return false;
    const accept = req.headers['accept-encoding'] || '';
    const useGzip = accept.includes('gzip');
    // index.html always goes through the token-injecting path
    if (fullPath === resolve(join(DIST_DIR, 'index.html'))) {
      return serveIndexWithToken(res, useGzip);
    }
    let gzPath = fullPath + '.gz';
    if (useGzip && existsSync(gzPath)) {
      const ext = extname(fullPath);
      const isHashed = /[a-fA-F0-9]{8,}-/.test(filePath);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Encoding': 'gzip',
        'Cache-Control': isHashed ? 'public, max-age=31536000, immutable' : 'no-cache, must-revalidate',
      });
      const stream = createReadStream(gzPath);
      stream.pipe(res);
      stream.on('error', () => { try { res.end(); } catch {} });
      return true;
    }
    if (existsSync(fullPath)) {
      const ext = extname(fullPath);
      const isHashed = /[a-fA-F0-9]{8,}-/.test(filePath);
      const headers = {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': isHashed ? 'public, max-age=31536000, immutable' : 'no-cache, must-revalidate',
      };
      if (useGzip) {
        headers['Content-Encoding'] = 'gzip';
        res.writeHead(200, headers);
        createReadStream(fullPath).pipe(createGzip()).pipe(res);
      } else {
        res.writeHead(200, headers);
        createReadStream(fullPath).pipe(res);
      }
      return true;
    }
    // SPA fallback: only the real frontend routes get the app shell —
    // everything else is a genuine 404 (no index.html for /etc/passwd & co.)
    const SPA_ROUTES = new Set(['/', '/terminal', '/sftp']);
    if (SPA_ROUTES.has(filePath)) {
      return serveIndexWithToken(res, useGzip);
    }
  } catch (e) {
    log.error('static file error', e);
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
