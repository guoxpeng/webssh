// Integration test for the Cloudflare Worker's Model API — /api/model/* (the
// MCP backend registry). The REAL Worker bundle is built with esbuild and run
// inside Miniflare against an in-memory MODEL_REGISTRY KV namespace, so a
// future refactor of the registry / credential encryption breaks here instead
// of on a deployed CF site. Coverage:
//   - auth gate guards every /api/model/* route (401/503)
//   - KV registry round-trip: save / list / remove / sync
//   - credentials are AES-256-GCM at rest (iv:tag:data, no plaintext in KV)
//   - bidirectional interop with the Node server's crypto (core/server/lib/
//     modelapi.mjs derives the same key and uses the same on-disk format, so
//     a registry migrated between a self-hosted backend and CF stays usable)
//   - AUTH_TOKEN rotation invalidates stored credentials cleanly
//   - probe/exec validation and graceful error paths (no crash)
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { Server as SshServer } from 'ssh2';

const ROOT = process.cwd();
const WORKER_PATH = join(ROOT, 'dist', 'client', '_worker.js');
const AUTH = 'model-test-token-456';
const SECRET = 'sup3r-secret-pass!';

// ── Node-side mirror of the Worker's credential crypto ─────────────────────
// core/server/lib/modelapi.mjs and core/worker/index.mjs must stay in lockstep:
// key = SHA-256("webssh-model-v1:" + AUTH_TOKEN), AES-256-GCM, format
// iv:tag:data (all base64). These helpers let the test prove that lockstep —
// each side can decrypt what the other encrypted.
function nodeKey(token) {
  return createHash('sha256').update(`webssh-model-v1:${token}`).digest();
}
function nodeEncrypt(plain, token) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', nodeKey(token), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}
function nodeDecrypt(stored, token) {
  const [ivB64, tagB64, dataB64] = String(stored).split(':');
  const decipher = createDecipheriv('aes-256-gcm', nodeKey(token), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

// ── Live SSH server for the probe/exec SUCCESS paths ───────────────────────
// Windows OpenSSH `sshd` is not installed on dev/CI machines (and needs admin
// to enable), so this test starts a REAL SSH server using the same ssh2
// library the Worker bundles: RSA host key pair generated at startup,
// password auth for a known user, random loopback port. The Worker's ssh2
// client connects to it over cloudflare:sockets exactly as it would on CF,
// so probe ('true' → exit 0) and exec (stdout echo → exit 0) genuinely run.
const SSH_USER = 'tester';
const SSH_PASS = 'probe-pass-123';

let sshServer = null;
let sshPort = 0;

function startSshServer() {
  return new Promise((resolve, reject) => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const server = new SshServer(
      { hostKeys: [privateKey.export({ type: 'pkcs1', format: 'pem' })] },
      (client) => {
        client.on('authentication', (ctx) => {
          if (ctx.method === 'password' && ctx.username === SSH_USER && ctx.password === SSH_PASS) ctx.accept();
          else ctx.reject(['password']);
        });
        client.on('ready', () => {
          client.on('session', (accept) => {
            const session = accept();
            // Be tolerant of pty requests some clients send before exec.
            session.on('pty', (accept2) => accept2 && accept2());
            session.on('exec', (accept2, reject2, info) => {
              const stream = accept2();
              const cmd = String(info.command || '');
              stream.write(`echo-from-test-sshd: ${cmd}\n`);
              stream.exit(0);
              stream.end();
            });
          });
        });
      },
    );
    server.on('error', (e) => { console.error('[test sshd]', e.message); });
    server.listen(0, '127.0.0.1', () => {
      sshPort = server.address().port;
      sshServer = server;
      resolve();
    });
  });
}

function liveEntry(over = {}) {
  return entry({ id: 'live-01', name: 'live-box', host: '127.0.0.1', port: sshPort, username: SSH_USER, auth_enc: nodeEncrypt(SSH_PASS, AUTH), ...over });
}

let mf;
let kv;

async function req(path, { method = 'GET', headers = {}, body } = {}) {
  return mf.dispatchFetch(`http://worker.local${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const post = (path, body, token = AUTH) => req(path, { method: 'POST', headers: auth(token), body });

function entry(over = {}) {
  return {
    id: 'svr-001',
    name: 'prod-box',
    host: '127.0.0.1',
    port: 22,
    username: 'root',
    auth_type: 'password',
    auth_enc: '',
    created_at: 1,
    ...over,
  };
}

beforeAll(async () => {
  execSync('node core/build-worker.mjs', { cwd: ROOT, stdio: 'pipe' });
  await startSshServer();
  mf = new Miniflare({
    modules: true,
    scriptPath: WORKER_PATH,
    compatibilityDate: '2026-07-23',
    compatibilityFlags: ['nodejs_compat'],
    bindings: { AUTH_TOKEN: AUTH },
    kvNamespaces: ['MODEL_REGISTRY'],
    persist: false, // in-memory KV — isolated per test run
  });
  await mf.ready;
  kv = await mf.getKVNamespace('MODEL_REGISTRY');
});

afterAll(async () => {
  await mf?.dispose();
  await new Promise((r) => (sshServer ? sshServer.close(r) : r()));
});

describe('Cloudflare Worker Model API (real bundle via Miniflare + KV)', () => {
  it('auth gate: /api/model/* without a token → 401', async () => {
    const r = await req('/api/model/servers');
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe('Unauthorized');
  });

  it('auth gate: /api/model/* with a wrong token → 401', async () => {
    const r = await req('/api/model/servers', { headers: auth('nope') });
    expect(r.status).toBe(401);
  });

  it('returns a 503 diagnostic when MODEL_REGISTRY KV is not bound', async () => {
    const bare = new Miniflare({
      modules: true,
      scriptPath: WORKER_PATH,
      compatibilityDate: '2026-07-23',
      compatibilityFlags: ['nodejs_compat'],
      bindings: { AUTH_TOKEN: AUTH },
      persist: false,
    });
    try {
      await bare.ready;
      const r = await bare.dispatchFetch('http://worker.local/api/model/servers', { headers: auth(AUTH) });
      expect(r.status).toBe(503);
      expect((await r.json()).error).toContain('MODEL_REGISTRY');
    } finally {
      await bare.dispose();
    }
  });

  it('empty registry → GET servers returns an empty list', async () => {
    const r = await req('/api/model/servers', { headers: auth(AUTH) });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ servers: [] });
  });

  it('save → server appears in the list with credentials stripped from the public entry', async () => {
    const r = await post('/api/model/servers/save', {
      name: 'prod-box', host: '127.0.0.1', port: 22, username: 'root', auth_type: 'password', auth_value: SECRET,
    });
    expect(r.status).toBe(200);
    const saved = (await r.json()).server;
    expect(saved).toMatchObject({ host: '127.0.0.1', username: 'root', port: 22, auth_type: 'password' });
    expect(saved.id).toBeTruthy();

    const list = await (await req('/api/model/servers', { headers: auth(AUTH) })).json();
    expect(list.servers).toHaveLength(1);
    const body = JSON.stringify(list);
    expect(body).not.toContain(SECRET); // plaintext never leaves the worker
    expect(body).not.toContain('auth_enc'); // public entries expose no credential material
  });

  it('credentials are AES-256-GCM at rest in KV (iv:tag:data, no plaintext)', async () => {
    const raw = await kv.get('registry');
    expect(raw).toBeTruthy();
    const stored = JSON.parse(raw)[0];
    expect(stored.auth_enc).toMatch(/^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/); // iv:tag:data
    expect(raw).not.toContain(SECRET);
    expect(stored.auth_enc.split(':')).toHaveLength(3);
    // tag must be 16 bytes → 24 base64 chars
    expect(stored.auth_enc.split(':')[1].length).toBe(24);
  });

  it('Node server crypto can decrypt what the Worker encrypted (CF→self-hosted migration)', async () => {
    const raw = await kv.get('registry');
    const stored = JSON.parse(raw)[0];
    expect(nodeDecrypt(stored.auth_enc, AUTH)).toBe(SECRET);
    // wrong token must NOT decrypt
    expect(() => nodeDecrypt(stored.auth_enc, 'other-token')).toThrow();
  });

  it('Worker decrypts a Node-encrypted credential (self-hosted→CF migration) and proceeds to connect', async () => {
    // Seed the registry exactly as a self-hosted backend would have written it,
    // then exec: a successful decrypt (no "no stored credential" error) proves
    // the Worker read the Node ciphertext. The SSH attempt itself targets a
    // closed loopback port, so the result is a clean connection error, not a crash.
    const seeded = entry({ auth_enc: nodeEncrypt(SECRET, AUTH) });
    await kv.put('registry', JSON.stringify([seeded]));
    const r = await post('/api/model/exec', { server: 'svr-001', command: 'uptime', timeout_ms: 3000 });
    expect(r.status).toBe(200);
    const { results } = await r.json();
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(String(results[0].error)).not.toContain('no stored credential');
    expect(String(results[0].error)).toBeTruthy();
  });

  it('AUTH_TOKEN rotation invalidates stored credentials with a clean diagnostic', async () => {
    // Seeded with a DIFFERENT token's key: the gate still passes (request token
    // matches the worker's AUTH_TOKEN) but the credential no longer decrypts —
    // exactly what happens after rotating AUTH_TOKEN on an existing deployment.
    const seeded = entry({ auth_enc: nodeEncrypt(SECRET, 'rotated-old-token') });
    await kv.put('registry', JSON.stringify([seeded]));
    const r = await post('/api/model/exec', { server: 'svr-001', command: 'uptime', timeout_ms: 3000 });
    const { results } = await r.json();
    expect(results[0].success).toBe(false);
    expect(String(results[0].error)).toContain('no stored credential');
  });

  it('probe unknown server id → 404', async () => {
    const r = await post('/api/model/probe', { id: 'missing-id', timeout_ms: 3000 });
    expect(r.status).toBe(404);
  });

  it('exec validation: missing command → 400; over-long command → 400', async () => {
    const r1 = await post('/api/model/exec', { server: 'all' });
    expect(r1.status).toBe(400);
    const r2 = await post('/api/model/exec', { server: 'all', command: 'x'.repeat(4097) });
    expect(r2.status).toBe(400);
  });

  it('exec with no matching server → 404; exec on >50 servers → 400', async () => {
    await kv.put('registry', '[]');
    const r1 = await post('/api/model/exec', { server: 'all', command: 'true' });
    expect(r1.status).toBe(404);

    const many = Array.from({ length: 51 }, (_, i) => entry({ id: `s-${i}`, auth_enc: nodeEncrypt('pw', AUTH) }));
    await kv.put('registry', JSON.stringify(many));
    const r2 = await post('/api/model/exec', { server: 'all', command: 'true' });
    expect(r2.status).toBe(400);
    expect((await r2.json()).error).toContain('50');
  });

  it('save validation: missing host/username → 400; unknown id → 404', async () => {
    const r1 = await post('/api/model/servers/save', { auth_value: 'x' });
    expect(r1.status).toBe(400);
    const r2 = await post('/api/model/servers/save', { id: 'ghost', host: 'h', username: 'u', auth_value: 'x' });
    expect(r2.status).toBe(404);
  });

  it('remove: unknown id → 404; existing id → success and gone from list', async () => {
    const r1 = await post('/api/model/servers/remove', { id: 'ghost' });
    expect(r1.status).toBe(404);

    await kv.put('registry', JSON.stringify([entry({ auth_enc: nodeEncrypt('pw', AUTH) })]));
    const r2 = await post('/api/model/servers/remove', { id: 'svr-001' });
    expect(r2.status).toBe(200);
    expect((await r2.json()).success).toBe(true);
    const list = await (await req('/api/model/servers', { headers: auth(AUTH) })).json();
    expect(list.servers).toEqual([]);
  });

  it('sync: replaces the registry; >200 servers rejected', async () => {
    const two = [
      { host: '10.0.0.1', port: 22, username: 'root', auth_value: 'pw1' },
      { host: '10.0.0.2', port: 2222, username: 'admin', auth_value: 'pw2' },
    ];
    const r = await post('/api/model/servers/sync', { servers: two });
    expect(r.status).toBe(200);
    const { synced } = await r.json();
    expect(synced).toHaveLength(2);
    expect(synced.map((s) => s.host)).toEqual(['10.0.0.1', '10.0.0.2']);
    const body = JSON.stringify(synced);
    expect(body).not.toContain('pw1');
    expect(body).not.toContain('auth_enc');

    const tooMany = Array.from({ length: 201 }, (_, i) => ({ host: `h${i}`, username: 'u', auth_value: 'pw' }));
    const r2 = await post('/api/model/servers/sync', { servers: tooMany });
    expect(r2.status).toBe(400);
  });

  it('unknown action → 400', async () => {
    const r = await post('/api/model/bogus', {});
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain('Unknown action');
  });
});

describe('concurrent registry writes (read-modify-write under one KV)', () => {
  // KV has no atomic read-modify-write: every request loads the whole registry,
  // mutates its in-memory copy, then writes it back. Concurrent requests that
  // interleave between load and save silently drop each other's changes — a
  // save/probe/sync storm loses entries. These tests pin the fix (an in-isolate
  // mutex that serializes load→mutate→save).

  async function hosts() {
    const list = await (await req('/api/model/servers', { headers: auth(AUTH) })).json();
    return list.servers.map((s) => s.host);
  }

  it('10 concurrent saves keep ALL entries (no lost updates)', async () => {
    await kv.put('registry', '[]');
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => post('/api/model/servers/save', {
        name: `srv-${i}`, host: `10.9.0.${i}`, port: 22, username: 'root', auth_value: `pw-${i}`,
      })),
    );
    for (const r of results) expect(r.status).toBe(200);

    const got = await hosts();
    expect(got).toHaveLength(10);
    for (let i = 0; i < 10; i++) expect(got).toContain(`10.9.0.${i}`);
  });

  it('a save racing a probe is preserved and the probe result is recorded', async () => {
    // Two seeded servers with valid credentials on a closed loopback port, so
    // the probe fails fast (connection refused) instead of hanging.
    await kv.put('registry', JSON.stringify([
      entry({ id: 'svr-001', auth_enc: nodeEncrypt('pw', AUTH) }),
      entry({ id: 'svr-002', name: 'box2', host: '127.0.0.1', port: 1, auth_enc: nodeEncrypt('pw', AUTH) }),
    ]));

    const [saveRes, probeRes] = await Promise.all([
      post('/api/model/servers/save', { name: 'racer', host: '10.9.9.9', port: 22, username: 'root', auth_value: 'pw-racer' }),
      post('/api/model/probe', { id: 'svr-001', timeout_ms: 3000 }),
    ]);
    expect(saveRes.status).toBe(200);
    expect(probeRes.status).toBe(200);

    const list = await (await req('/api/model/servers', { headers: auth(AUTH) })).json();
    // The concurrently-saved entry must NOT have been clobbered by the probe's
    // write-back of its (stale) snapshot…
    const hosts = list.servers.map((s) => s.host);
    expect(hosts).toContain('10.9.9.9');
    expect(hosts).toContain('127.0.0.1');
    expect(list.servers).toHaveLength(3);
    // …and the probed server still carries its probe result.
    const probed = list.servers.find((s) => s.id === 'svr-001');
    expect(probed.last_probe).toBeTruthy();
    expect(probed.last_probe.ok).toBe(false);
  });
});

describe('model API real SSH success paths (live ssh2 server)', () => {
  it('probe succeeds against the live server (exit 0), persists last_probe, and the "ok" exec filter matches', async () => {
    await kv.put('registry', JSON.stringify([liveEntry()]));

    const pr = await post('/api/model/probe', { id: 'live-01', timeout_ms: 8000 });
    expect(pr.status).toBe(200);
    const { results } = await pr.json();
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    expect(results[0].error).toBeNull();

    // last_probe was persisted back to the registry by the probe.
    const list = await (await req('/api/model/servers', { headers: auth(AUTH) })).json();
    expect(list.servers[0].last_probe.ok).toBe(true);

    // The `server: 'ok'` exec filter must now match the probed server.
    const er = await post('/api/model/exec', { server: 'ok', command: 'true', timeout_ms: 8000 });
    expect(er.status).toBe(200);
    const execResults = (await er.json()).results;
    expect(execResults).toHaveLength(1);
    expect(execResults[0].success).toBe(true);
    expect(execResults[0].exit_code).toBe(0);
  });

  it('exec runs a real command and returns stdout + exit code 0', async () => {
    await kv.put('registry', JSON.stringify([liveEntry({ id: 'live-02' })]));
    const r = await post('/api/model/exec', { server: 'live-02', command: 'echo hello-model-exec', timeout_ms: 8000 });
    expect(r.status).toBe(200);
    const { results } = await r.json();
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].exit_code).toBe(0);
    expect(String(results[0].stdout)).toContain('echo-from-test-sshd: echo hello-model-exec');
  });
});
