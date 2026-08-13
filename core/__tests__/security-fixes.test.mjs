import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { EventEmitter } from 'events';
import { existsSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DATA_DIR = join(__dirname, '..', 'server', 'data');
const KNOWN_HOSTS = join(SERVER_DATA_DIR, 'known_hosts.json');
const CHAT_CONFIG = join(__dirname, '..', 'server', 'chat-config.json');

function fakeReq(chunks, { url = '/api/x', method = 'POST', headers = {} } = {}) {
  const req = new EventEmitter();
  req.url = url;
  req.method = method;
  req.headers = headers;
  req.destroy = vi.fn();
  process.nextTick(() => {
    for (const c of chunks) req.emit('data', c);
    req.emit('end');
  });
  return req;
}

beforeAll(() => {
  for (const f of [KNOWN_HOSTS, CHAT_CONFIG]) if (existsSync(f)) rmSync(f);
});

afterAll(() => {
  for (const f of [KNOWN_HOSTS, CHAT_CONFIG]) if (existsSync(f)) rmSync(f);
});

describe('H1: no anonymous session reuse', () => {
  it('findSession refuses reuse without credentials', async () => {
    const { sessions, findSession } = await import('../server/lib/session.mjs');
    const fakeClient = { exec: () => {} };
    sessions.set('k', { client: fakeClient, host: 'h', port: 22, username: 'root', credHash: 'abc', createdAt: Date.now() });
    expect(findSession('h', 22, 'root', null)).toBeNull();
    expect(findSession('h', 22, 'root', undefined)).toBeNull();
    sessions.delete('k');
  });
});

describe('H2: origin + content-type guards', () => {
  it('originAllowed passes non-browser and same-host requests', async () => {
    const { originAllowed } = await import('../server/lib/utils.mjs');
    expect(originAllowed({ headers: {} })).toBe(true);
    expect(originAllowed({ headers: { origin: 'http://localhost:9627', host: 'localhost:9627' } })).toBe(true);
    expect(originAllowed({ headers: { origin: 'http://evil.example', host: 'localhost:9627' } })).toBe(false);
    expect(originAllowed({ headers: { origin: 'not a url', host: 'localhost:9627' } })).toBe(false);
  });
});

describe('H4: chat config prototype pollution blocked', () => {
  it('updateConfig ignores __proto__, unknown sections; applies known ones', async () => {
    const { createChatBot } = await import('../server/lib/chat.mjs');
    const bot = createChatBot();
    const polluted = JSON.parse('{"__proto__": {"polluted": true}, "hacker": {"x":1}, "ai": {"model": "test-model"}}');
    bot.updateConfig(polluted);
    expect({}.polluted).toBeUndefined();
    expect(Object.prototype.polluted).toBeUndefined();
    expect(bot.getConfig().hacker).toBeUndefined();
    expect(bot.getConfig().ai.model).toBe('test-model');
  });
});

describe('M1: SSH host key TOFU', () => {
  it('stores first-seen fingerprint, accepts repeats, rejects mismatch', async () => {
    const { verifyHostKey } = await import('../server/lib/utils.mjs');
    const fpA = Buffer.from('aaaa'.repeat(8), 'hex');
    const fpB = Buffer.from('bbbb'.repeat(8), 'hex');

    let accepted = null;
    verifyHostKey('tofu-host', 22, fpA, (r) => { accepted = r; });
    expect(accepted).toBe(true);
    expect(readFileSync(KNOWN_HOSTS, 'utf8')).toContain('tofu-host:22');

    accepted = null;
    verifyHostKey('tofu-host', 22, fpA, (r) => { accepted = r; });
    expect(accepted).toBe(true);

    let rejected = null;
    const ok = verifyHostKey('tofu-host', 22, fpB, (r) => { rejected = r; });
    expect(ok).toBe(false);
    expect(rejected).toBeInstanceOf(Error);
  });
});

describe('M3: request body size cap', () => {
  it('parseBody returns null when oversized', async () => {
    const { parseBody } = await import('../server/lib/utils.mjs');
    const req = new EventEmitter();
    req.destroy = vi.fn();
    const p = parseBody(req);
    const chunk = 'x'.repeat(256 * 1024);
    for (let i = 0; i < 10; i++) req.emit('data', chunk); // 2.5MB > 2MB cap
    req.emit('end');
    const result = await p;
    expect(result).toBeNull();
  });

  it('parseBody still parses normal bodies', async () => {
    const { parseBody } = await import('../server/lib/utils.mjs');
    const result = await parseBody(fakeReq(['{"a":1}']));
    expect(result).toEqual({ a: 1 });
  });
});
