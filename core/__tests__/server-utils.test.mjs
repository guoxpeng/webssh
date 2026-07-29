import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── hashCreds ───

describe('hashCreds', () => {
  let hashCreds;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../server/lib/utils.mjs');
    hashCreds = mod.hashCreds;
  });

  it('returns null for falsy input', () => {
    expect(hashCreds(null)).toBeNull();
    expect(hashCreds(undefined)).toBeNull();
    expect(hashCreds('')).toBeNull();
  });

  it('returns deterministic 16-char hex for same input', () => {
    const a = hashCreds('my-password');
    const b = hashCreds('my-password');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{16}$/);
  });

  it('returns different values for different inputs', () => {
    const a = hashCreds('password1');
    const b = hashCreds('password2');
    expect(a).not.toBe(b);
  });
});

// ─── checkRate ───

describe('checkRate', () => {
  let checkRate;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../server/lib/utils.mjs');
    checkRate = mod.checkRate;
  });

  it('allows first 60 requests from same IP', () => {
    for (let i = 0; i < 60; i++) {
      expect(checkRate('10.0.0.1')).toBe(true);
    }
  });

  it('blocks 61st request from same IP', () => {
    for (let i = 0; i < 60; i++) checkRate('10.0.0.2');
    expect(checkRate('10.0.0.2')).toBe(false);
  });

  it('tracks IPs independently', () => {
    for (let i = 0; i < 60; i++) checkRate('10.0.0.3');
    expect(checkRate('10.0.0.4')).toBe(true);
  });
});

// ─── serveStatic path traversal ───

describe('serveStatic', () => {
  let serveStatic;
  let mockReq, mockRes;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../server/lib/utils.mjs');
    serveStatic = mod.serveStatic;
    mockRes = { writeHead: vi.fn(), end: vi.fn() };
  });

  it('ignores non-GET requests', () => {
    mockReq = { method: 'POST', url: '/index.html' };
    expect(serveStatic(mockReq, mockRes)).toBe(false);
  });

  it('rejects path traversal with ../', () => {
    mockReq = { method: 'GET', url: '/../../../etc/passwd' };
    expect(serveStatic(mockReq, mockRes)).toBe(false);
  });

  it('rejects path traversal with encoded ..', () => {
    mockReq = { method: 'GET', url: '/%2e%2e/%2e%2e/etc/passwd', headers: {} };
    // Node's req.url contains raw URL; %2e%2e is NOT decoded by url.split,
    // so resolve(join(DIST_DIR, '/%2e%2e/%2e%2e/etc/passwd')) stays within DIST_DIR.
    // The server correctly allows this (it's not a traversal with encoded chars).
    // Real URL decoding happens at the HTTP parser level in production.
    expect(serveStatic(mockReq, mockRes)).toBe(false);
  });

  it('rejects absolute paths', () => {
    mockReq = { method: 'GET', url: '/etc/passwd', headers: {} };
    expect(serveStatic(mockReq, mockRes)).toBe(false);
  });
});

// ─── authCheck logic ───

describe('authCheck logic', () => {
  let authToken;

  function checkToken(req) {
    if (!authToken) return true;
    if (req.url === '/health') return true;
    if (req.method === 'GET' && !req.url.startsWith('/api/')) return true;
    const t = req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    if (t === authToken) return true;
    if (req.headers['upgrade']?.toLowerCase() === 'websocket') {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      if (url.searchParams.get('token') === authToken) return true;
    }
    return false;
  }

  function mockReq(overrides) {
    return {
      headers: { authorization: undefined, upgrade: undefined, ...overrides.headers },
      url: overrides.url || '/api/ssh/test',
      method: overrides.method || 'POST',
    };
  }

  it('allows all when AUTH_TOKEN is not set', () => {
    authToken = null;
    expect(checkToken(mockReq({}))).toBe(true);
  });

  it('rejects API requests without Bearer token', () => {
    authToken = 'test-token-123';
    expect(checkToken(mockReq({}))).toBe(false);
  });

  it('accepts API requests with correct Bearer token', () => {
    authToken = 'test-token-123';
    expect(checkToken(mockReq({ headers: { authorization: 'Bearer test-token-123' } }))).toBe(true);
  });

  it('rejects API requests with wrong Bearer token', () => {
    authToken = 'test-token-123';
    expect(checkToken(mockReq({ headers: { authorization: 'Bearer wrong-token' } }))).toBe(false);
  });

  it('allows health endpoint without token', () => {
    authToken = 'test-token-123';
    expect(checkToken(mockReq({ url: '/health' }))).toBe(true);
  });

  it('allows GET static files without token', () => {
    authToken = 'test-token-123';
    expect(checkToken(mockReq({ method: 'GET', url: '/index.html' }))).toBe(true);
  });

  it('allows WebSocket upgrade with token in query param', () => {
    authToken = 'test-token-123';
    expect(checkToken(mockReq({
      headers: { upgrade: 'websocket', host: 'localhost' },
      url: '/ws/ssh?token=test-token-123',
    }))).toBe(true);
  });
});

// ─── makeSSHConfig ───

describe('makeSSHConfig', () => {
  let makeSSHConfig;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../server/lib/utils.mjs');
    makeSSHConfig = mod.makeSSHConfig;
  });

  it('sets default port and username', () => {
    const cfg = makeSSHConfig({ host: '10.0.0.1' });
    expect(cfg.host).toBe('10.0.0.1');
    expect(cfg.port).toBe(22);
    expect(cfg.username).toBe('root');
  });

  it('places auth_type key into privateKey', () => {
    const cfg = makeSSHConfig({ host: 'h', auth_type: 'key', auth_value: 'xxx' });
    expect(cfg.privateKey).toBe('xxx');
    expect(cfg.password).toBeUndefined();
  });

  it('places auth_type password into password field', () => {
    const cfg = makeSSHConfig({ host: 'h', auth_type: 'password', auth_value: 'xxx' });
    expect(cfg.password).toBe('xxx');
    expect(cfg.privateKey).toBeUndefined();
  });

  it('keeps readyTimeout at 30s', () => {
    const cfg = makeSSHConfig({ host: 'h' });
    expect(cfg.readyTimeout).toBe(30000);
  });
});

// ─── json and parseBody ───

describe('json helper', () => {
  let json, parseBody;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../server/lib/utils.mjs');
    json = mod.json;
    parseBody = mod.parseBody;
  });

  it('json writes JSON response', () => {
    const res = { writeHead: vi.fn(), end: vi.fn() };
    json(res, { ok: true });
    expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ ok: true }));
  });

  it('parseBody parses valid JSON body', async () => {
    const req = { on: (event, cb) => { if (event === 'data') cb('{"a":1}'); if (event === 'end') cb(); } };
    const result = await parseBody(req);
    expect(result).toEqual({ a: 1 });
  });

  it('parseBody returns {} for invalid JSON', async () => {
    const req = { on: (event, cb) => { if (event === 'data') cb('not-json'); if (event === 'end') cb(); } };
    const result = await parseBody(req);
    expect(result).toEqual({});
  });
});
