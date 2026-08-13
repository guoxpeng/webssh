import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync, rmSync } from 'fs';
import { setAuthToken, handleModelApi, __testing } from '../server/lib/modelapi.mjs';

const { REGISTRY_PATH } = __testing;

function fakeReq(url) { return { url }; }
function fakeRes() {
  return {
    statusCode: null, body: null,
    writeHead(code) { this.statusCode = code; },
    end(data) { this.body = data; },
    get json() { return JSON.parse(this.body); },
  };
}

beforeAll(() => {
  setAuthToken('test-token-123');
  if (existsSync(REGISTRY_PATH)) rmSync(REGISTRY_PATH);
});

afterAll(() => {
  if (existsSync(REGISTRY_PATH)) rmSync(REGISTRY_PATH);
});

describe('modelapi credential encryption', () => {
  it('round-trips secrets', () => {
    const enc = __testing.encryptSecret('p@ssw0rd!');
    expect(enc).not.toContain('p@ssw0rd!');
    expect(enc.split(':')).toHaveLength(3);
    expect(__testing.decryptSecret(enc)).toBe('p@ssw0rd!');
  });

  it('fails closed on tampered ciphertext', () => {
    const enc = __testing.encryptSecret('secret');
    const parts = enc.split(':');
    parts[2] = parts[2].slice(0, -2) + 'AA';
    expect(__testing.decryptSecret(parts.join(':'))).toBe('');
  });
});

describe('modelapi normalizeEntry', () => {
  it('requires host and username', () => {
    expect(__testing.normalizeEntry({ host: '', username: 'root', auth_value: 'x' })).toBeNull();
    expect(__testing.normalizeEntry({ host: 'h', username: '', auth_value: 'x' })).toBeNull();
  });

  it('rejects new entries without credentials', () => {
    expect(__testing.normalizeEntry({ host: 'h', username: 'root' })).toBeNull();
  });

  it('clamps port and keeps existing credential when auth_value omitted on update', () => {
    const created = __testing.normalizeEntry({ host: 'h', username: 'root', auth_value: 'x', port: 99999 });
    expect(created.port).toBe(65535);
    const updated = __testing.normalizeEntry({ host: 'h', username: 'root' }, created);
    expect(updated.auth_enc).toBe(created.auth_enc);
    expect(updated.id).toBe(created.id);
  });
});

describe('modelapi HTTP surface', () => {
  it('503s when AUTH_TOKEN is not set', async () => {
    setAuthToken(null);
    const res = fakeRes();
    await handleModelApi(fakeReq('/api/model/servers'), res, {});
    expect(res.statusCode).toBe(503);
    setAuthToken('test-token-123');
  });

  it('rejects unknown actions', async () => {
    const res = fakeRes();
    await handleModelApi(fakeReq('/api/model/nope'), res, {});
    expect(res.statusCode).toBe(400);
  });

  it('saves, lists without secrets, and removes servers', async () => {
    let res = fakeRes();
    await handleModelApi(fakeReq('/api/model/servers/save'), res, {
      name: 'web1', host: '10.0.0.1', port: 22, username: 'root', auth_type: 'password', auth_value: 'hunter2',
    });
    expect(res.statusCode).toBe(200);
    const id = res.json.server.id;
    expect(id).toBeTruthy();

    res = fakeRes();
    await handleModelApi(fakeReq('/api/model/servers'), res, {});
    expect(res.json.servers).toHaveLength(1);
    expect(JSON.stringify(res.json.servers)).not.toContain('hunter2');
    expect(JSON.stringify(res.json.servers)).not.toContain('auth_enc');

    res = fakeRes();
    await handleModelApi(fakeReq('/api/model/servers/remove'), res, { id });
    expect(res.json.success).toBe(true);

    res = fakeRes();
    await handleModelApi(fakeReq('/api/model/servers'), res, {});
    expect(res.json.servers).toHaveLength(0);
  });

  it('sync replaces the registry', async () => {
    let res = fakeRes();
    await handleModelApi(fakeReq('/api/model/servers/sync'), res, {
      servers: [
        { name: 'a', host: 'a.example', username: 'root', auth_value: 'x' },
        { name: 'b', host: 'b.example', username: 'root' }, // no cred → dropped
      ],
    });
    expect(res.json.synced).toHaveLength(1);

    res = fakeRes();
    await handleModelApi(fakeReq('/api/model/servers'), res, {});
    expect(res.json.servers).toHaveLength(1);
    expect(res.json.servers[0].host).toBe('a.example');
  });

  it('exec validates command and unknown targets', async () => {
    let res = fakeRes();
    await handleModelApi(fakeReq('/api/model/exec'), res, { server: 'all', command: '' });
    expect(res.statusCode).toBe(400);

    res = fakeRes();
    await handleModelApi(fakeReq('/api/model/exec'), res, { server: 'nope', command: 'uptime' });
    expect(res.statusCode).toBe(404);

    res = fakeRes();
    await handleModelApi(fakeReq('/api/model/exec'), res, { server: 'all', command: 'x'.repeat(5000) });
    expect(res.statusCode).toBe(400);
  });

  it('persists registry without plaintext credentials', async () => {
    const res = fakeRes();
    await handleModelApi(fakeReq('/api/model/servers/save'), res, {
      name: 'secretcheck', host: 's.example', username: 'root', auth_value: 'SuperSecretPass123!',
    });
    expect(res.statusCode).toBe(200);
    const raw = readFileSync(REGISTRY_PATH, 'utf8');
    expect(raw).toContain('s.example');
    expect(raw).toContain('auth_enc');
    expect(raw).not.toContain('SuperSecretPass123!');
  });
});
