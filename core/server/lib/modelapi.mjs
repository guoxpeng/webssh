// Model API — server registry + probe + exec for local AI models.
//
// Security model (deliberately differs from /api/chat/ai, see SECURITY-REVIEW.md C2):
//   - every endpoint requires AUTH_TOKEN to be set (503 otherwise); callers are
//     already authenticated by authCheck() in index.mjs
//   - targets come ONLY from the server-side registry, never from per-request
//     host/credentials
//   - credentials are AES-256-GCM encrypted at rest with a key derived from
//     AUTH_TOKEN and never appear in responses or logs
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'ssh2';
import { makeSSHConfig, setupSSHClient, json } from './utils.mjs';
import { audit } from './audit.mjs';
import { logger } from './logger.mjs';

const log = logger('ModelAPI');

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const REGISTRY_PATH = join(DATA_DIR, 'model-servers.json');

const MAX_COMMAND_LEN = 4096;
const MAX_OUTPUT_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;
const MAX_CONCURRENCY = 5;

let authToken = null; // set via setAuthToken() from index.mjs

export function setAuthToken(token) { authToken = token || null; }

// Lightweight status for the MCP / status panels (avoids a full request cycle).
export function modelApiStatus() {
  return { enabled: !!authToken, servers: loadRegistry().length };
}

export function listModelServers() {
  return loadRegistry().map(publicEntry);
}

// ── credential encryption at rest ──
function deriveKey() {
  return createHash('sha256').update(`webssh-model-v1:${authToken}`).digest();
}

function encryptSecret(plain) {
  if (!plain) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}

function decryptSecret(stored) {
  if (!stored) return '';
  try {
    const [ivB64, tagB64, dataB64] = String(stored).split(':');
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch (e) {
    log.error('failed to decrypt registry credential (AUTH_TOKEN changed?)', e.message);
    return '';
  }
}

// ── registry ──
function loadRegistry() {
  try {
    if (!existsSync(REGISTRY_PATH)) return [];
    const list = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch (e) {
    log.error('registry load failed', e.message);
    return [];
  }
}

function saveRegistry(list) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(REGISTRY_PATH, JSON.stringify(list, null, 2), { mode: 0o600 });
}

function publicEntry(e) {
  return {
    id: e.id, name: e.name, host: e.host, port: e.port, username: e.username,
    auth_type: e.auth_type, last_probe: e.last_probe || null,
  };
}

function normalizeEntry(input, existing = null) {
  if (!input || typeof input !== 'object') return null;
  const host = String(input.host || '').trim();
  const username = String(input.username || '').trim();
  if (!host || !username) return null;
  const port = Math.max(1, Math.min(65535, parseInt(input.port, 10) || 22));
  const authType = input.auth_type === 'key' ? 'key' : 'password';
  const entry = existing ? { ...existing } : { id: randomBytes(8).toString('hex'), created_at: Date.now() };
  entry.name = String(input.name || `${username}@${host}`).slice(0, 100);
  entry.host = host.slice(0, 255);
  entry.port = port;
  entry.username = username.slice(0, 100);
  entry.auth_type = authType;
  if (input.auth_value) entry.auth_enc = encryptSecret(String(input.auth_value));
  else if (!existing) return null; // new entry must carry credentials
  return entry;
}

// ── ssh helpers ──
function runOnce(entry, command, timeoutMs) {
  return new Promise((resolve) => {
    const authValue = decryptSecret(entry.auth_enc);
    if (!authValue) { resolve({ success: false, error: 'no stored credential (or AUTH_TOKEN changed)' }); return; }
    const client = new Client();
    setupSSHClient(client, authValue);
    const cfg = { ...makeSSHConfig({ ...entry, auth_value: authValue }), readyTimeout: Math.min(timeoutMs, 15000) };
    delete cfg.auth_value;
    let stdout = ''; let stderr = ''; let truncated = false;
    const finish = (result) => { try { client.end(); } catch {} resolve(result); };
    const timer = setTimeout(() => finish({ success: false, error: 'timeout', stdout, stderr, truncated }), timeoutMs);
    const push = (target, chunk) => {
      if (target.length >= MAX_OUTPUT_BYTES) { truncated = true; return target; }
      return target + String(chunk);
    };
    client.on('ready', () => {
      client.exec(command, (err, stream) => {
        if (err) { clearTimeout(timer); finish({ success: false, error: err.message }); return; }
        stream.on('data', (d) => { stdout = push(stdout, d); });
        stream.stderr.on('data', (d) => { stderr = push(stderr, d); });
        stream.on('close', (code) => {
          clearTimeout(timer);
          finish({ success: code === 0, exit_code: typeof code === 'number' ? code : null, stdout, stderr, truncated });
        });
      });
    });
    client.on('error', (err) => { clearTimeout(timer); finish({ success: false, error: err.message }); });
    try { client.connect(cfg); } catch (e) { clearTimeout(timer); finish({ success: false, error: e.message }); }
  });
}

async function mapLimited(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ── request router (only reached when AUTH_TOKEN is set; see index.mjs) ──
export async function handleModelApi(req, res, body) {
  if (!authToken) { json(res, { error: 'Model API disabled: set AUTH_TOKEN first' }, 503); return; }
  const action = req.url.slice('/api/model/'.length);
  const registry = loadRegistry();

  if (action === 'servers') {
    json(res, { servers: registry.map(publicEntry) });
    return;
  }

  if (action === 'servers/save') {
    const existing = body.id ? registry.find(e => e.id === body.id) : null;
    if (body.id && !existing) { json(res, { error: 'unknown server id' }, 404); return; }
    const entry = normalizeEntry(body, existing);
    if (!entry) { json(res, { error: 'host/username/auth_value required for new entries' }, 400); return; }
    const idx = registry.findIndex(e => e.id === entry.id);
    if (idx >= 0) registry[idx] = entry; else registry.push(entry);
    saveRegistry(registry);
    audit('model_server_save', { id: entry.id, host: entry.host, port: entry.port, username: entry.username });
    json(res, { success: true, server: publicEntry(entry) });
    return;
  }

  if (action === 'servers/remove') {
    const idx = registry.findIndex(e => e.id === body.id);
    if (idx < 0) { json(res, { error: 'unknown server id' }, 404); return; }
    const [removed] = registry.splice(idx, 1);
    saveRegistry(registry);
    audit('model_server_remove', { id: removed.id, host: removed.host });
    json(res, { success: true });
    return;
  }

  if (action === 'servers/sync') {
    if (!Array.isArray(body.servers)) { json(res, { error: 'servers[] required' }, 400); return; }
    if (body.servers.length > 200) { json(res, { error: 'too many servers (max 200)' }, 400); return; }
    const next = [];
    for (const input of body.servers) {
      const prev = registry.find(e => e.host === String(input.host || '') && e.port === (parseInt(input.port, 10) || 22) && e.username === String(input.username || ''));
      const entry = normalizeEntry(input, prev);
      if (entry) next.push(entry);
    }
    saveRegistry(next);
    audit('model_server_sync', { count: next.length });
    json(res, { success: true, synced: next.map(publicEntry) });
    return;
  }

  if (action === 'probe') {
    const targets = body.id ? registry.filter(e => e.id === body.id) : registry;
    if (body.id && targets.length === 0) { json(res, { error: 'unknown server id' }, 404); return; }
    const results = await mapLimited(targets, MAX_CONCURRENCY, async (entry) => {
      const r = await runOnce(entry, 'true', Math.min(parseInt(body.timeout_ms, 10) || DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS));
      entry.last_probe = { t: Date.now(), ok: r.success, error: r.success ? null : String(r.error || '').slice(0, 200) };
      return { id: entry.id, name: entry.name, host: entry.host, port: entry.port, ok: r.success, error: r.success ? null : r.error };
    });
    saveRegistry(registry);
    audit('model_probe', { total: results.length, ok: results.filter(r => r.ok).length });
    json(res, { results });
    return;
  }

  if (action === 'exec') {
    const command = typeof body.command === 'string' ? body.command : '';
    if (!command || command.length > MAX_COMMAND_LEN) { json(res, { error: `command required (max ${MAX_COMMAND_LEN} chars)` }, 400); return; }
    const timeoutMs = Math.min(Math.max(parseInt(body.timeout_ms, 10) || DEFAULT_TIMEOUT_MS, 3000), MAX_TIMEOUT_MS);
    let targets;
    if (body.server === 'all') targets = registry;
    else if (body.server === 'ok') targets = registry.filter(e => e.last_probe?.ok);
    else targets = registry.filter(e => e.id === body.server);
    if (targets.length === 0) { json(res, { error: 'no matching server (probe first, or register one)' }, 404); return; }
    if (targets.length > 50) { json(res, { error: 'refusing to exec on more than 50 servers at once' }, 400); return; }
    audit('model_exec', { targets: targets.map(t => t.id), command: command.slice(0, 500), timeout_ms: timeoutMs });
    const results = await mapLimited(targets, MAX_CONCURRENCY, async (entry) => {
      const r = await runOnce(entry, command, timeoutMs);
      return { id: entry.id, name: entry.name, host: entry.host, ...r };
    });
    json(res, { results });
    return;
  }

  json(res, { error: 'Unknown action' }, 400);
}

// exported for tests
export const __testing = { encryptSecret, decryptSecret, normalizeEntry, loadRegistry, REGISTRY_PATH };
