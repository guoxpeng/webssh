// Integration test for the Cloudflare Worker's R2 cloud-backup endpoints that
// back the cross-device unlock / connection-sync flows:
//   saveVerify / getVerify        — master-password verify hash sync (R2 `_master_verify`)
//   saveConnections/getConnections — metadata-only connection registry (R2 `_connections`)
// The real Worker bundle is built with esbuild and run inside Miniflare with an
// in-memory R2 bucket, so a future refactor that breaks the R2 contract — or
// the auth gate — fails here instead of on a deployed site.
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';

const ROOT = process.cwd();
const WORKER_PATH = join(ROOT, 'dist', 'client', '_worker.js');
const AUTH = 'test-token-123';

let mf;

async function cloud(action, payload = {}, token = AUTH) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await mf.dispatchFetch('http://worker.local/api/cloud/backup', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...payload }),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* non-JSON body */ }
  return { status: res.status, data };
}

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

describe('Cloud R2 verify + connections API (real Worker via Miniflare)', () => {
  it('rejects /api/* requests without the AUTH_TOKEN (auth gate)', async () => {
    const r = await cloud('getVerify', {}, '');
    expect(r.status).toBe(401);
  });

  it('getVerify reports exists:false on an empty bucket', async () => {
    const r = await cloud('getVerify');
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ exists: false });
  });

  it('saveVerify persists the marked hash and getVerify returns it verbatim', async () => {
    const saved = await cloud('saveVerify', { verifyKey: 'v2v1:abcdefgh', salt: 'salty' });
    expect(saved.status).toBe(200);
    expect(saved.data).toEqual({ ok: true });

    const fetched = await cloud('getVerify');
    expect(fetched.status).toBe(200);
    expect(fetched.data).toEqual({ exists: true, verifyKey: 'v2v1:abcdefgh', salt: 'salty' });
  });

  it('rejects saveVerify without verifyKey or salt', async () => {
    const r = await cloud('saveVerify', {});
    expect(r.status).toBe(400);
  });

  it('round-trips the connection registry (metadata only)', async () => {
    const conns = [{ name: 'A', host: 'example.com', port: 22, username: 'root' }];
    const saved = await cloud('saveConnections', { connections: conns, groupOrder: [], groupCollapsed: [] });
    expect(saved.status).toBe(200);
    expect(saved.data).toEqual({ ok: true });

    const fetched = await cloud('getConnections');
    expect(fetched.status).toBe(200);
    expect(fetched.data.exists).toBe(true);
    expect(fetched.data.connections).toEqual(conns);
    // The registry must never carry credentials.
    expect(JSON.stringify(fetched.data)).not.toContain('auth_value');
  });
});
