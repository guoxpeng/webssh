// Integration test for the Cloudflare Worker's auth gate and error paths —
// the exact surface that surfaced as "SSH connection WebSocket error" on the
// deployed CF site (missing/mismatched AUTH_TOKEN, non-WebSocket upgrade,
// unconfigured deployment). The REAL Worker bundle is built with esbuild and
// run inside Miniflare, so a future refactor that skips or reorders the auth
// gate fails here instead of on a deployed site.
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';

const ROOT = process.cwd();
const WORKER_PATH = join(ROOT, 'dist', 'client', '_worker.js');
const AUTH = 'test-token-123';

let mf;

async function req(path, { method = 'GET', headers = {}, body } = {}) {
  return mf.dispatchFetch(`http://worker.local${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  // Build the Worker bundle so the test exercises the REAL shipping code.
  execSync('node core/build-worker.mjs', { cwd: ROOT, stdio: 'pipe' });
  mf = new Miniflare({
    modules: true,
    scriptPath: WORKER_PATH,
    compatibilityDate: '2026-07-23',
    compatibilityFlags: ['nodejs_compat'],
    bindings: { AUTH_TOKEN: AUTH },
    r2Buckets: ['BACKUP_BUCKET'],
    persist: false, // in-memory R2 — isolated per test run
  });
  await mf.ready;
});

afterAll(async () => {
  await mf?.dispose();
});

describe('Cloudflare Worker auth gate + error paths (real bundle via Miniflare)', () => {
  it('/health is public (no token required)', async () => {
    const r = await req('/health');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ status: 'ok' });
  });

  it('/ws/ssh without a token → 401 (not a 101/HTML fallback)', async () => {
    const r = await req('/ws/ssh', {
      headers: { Upgrade: 'websocket', Connection: 'Upgrade', 'Sec-WebSocket-Protocol': 'webssh-auth' },
    });
    expect(r.status).toBe(401);
  });

  it('/ws/ssh with a wrong token → 401', async () => {
    const r = await req('/ws/ssh', {
      headers: { Upgrade: 'websocket', Connection: 'Upgrade', ...auth('wrong-token') },
    });
    expect(r.status).toBe(401);
  });

  it('/ws/ssh with a valid token but no Upgrade header → 426 WebSocket required', async () => {
    // Auth passes; the handler then rejects non-WebSocket requests. This is
    // what the frontend turns into a friendly "WebSocket required" diagnostic.
    const r = await req('/ws/ssh', { headers: auth(AUTH) });
    expect(r.status).toBe(426);
    const data = await r.json();
    expect(data.error).toContain('WebSocket');
  });

  it('/api/ssh/test without a token → 401', async () => {
    const r = await req('/api/ssh/test', { method: 'POST' });
    expect(r.status).toBe(401);
  });

  it('/api/cloud/backup without a token → 401', async () => {
    const r = await req('/api/cloud/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { action: 'getVerify' },
    });
    expect(r.status).toBe(401);
  });

  it('/api/mcp/status without a token → 401', async () => {
    const r = await req('/api/mcp/status');
    expect(r.status).toBe(401);
  });

  it('serves a 503 diagnostic when AUTH_TOKEN is not configured', async () => {
    // Separate Miniflare instance without AUTH_TOKEN — mirrors a fresh deploy
    // where the secret binding is missing.
    const bare = new Miniflare({
      modules: true,
      scriptPath: WORKER_PATH,
      compatibilityDate: '2026-07-23',
      compatibilityFlags: ['nodejs_compat'],
      bindings: {},
      r2Buckets: ['BACKUP_BUCKET'],
      persist: false,
    });
    try {
      await bare.ready;
      const r = await bare.dispatchFetch('http://worker.local/api/ssh/test', { method: 'POST' });
      expect(r.status).toBe(503);
      const data = await r.json();
      expect(data.error).toContain('AUTH_TOKEN');
    } finally {
      await bare.dispose();
    }
  });
});
