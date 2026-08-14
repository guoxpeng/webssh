// Integration test for the Cloudflare Worker's SSE MCP *client* bridge —
// /api/mcp/clients/test. The REAL Worker bundle is built with esbuild and run
// inside Miniflare; the outbound streamable-HTTP MCP server is a local HTTP
// server that speaks both JSON and text/event-stream responses. This exercises
// the exact failure modes seen on a deployed CF site:
//   - stdio transports are rejected (Cloudflare has no child_process)
//   - streamable-HTTP initialize + tools/list handshake round-trips
//   - SSE (text/event-stream) response bodies are parsed
//   - session-id header is threaded through the handshake
//   - unconfigured AUTH_TOKEN → 503; unreachable server → friendly error
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';

const ROOT = process.cwd();
const WORKER_PATH = join(ROOT, 'dist', 'client', '_worker.js');
const AUTH = 'mcp-test-token';
const SSE = 'text/event-stream';

// ── Mock streamable-HTTP MCP server ────────────────────────────────────────
// Implements the subset of the MCP protocol the Worker's clients/test uses:
// initialize → tools/list, both over POST with JSON-RPC bodies. Responds in
// SSE format (like a real streamable-HTTP endpoint) or plain JSON depending on
// the route, so both parsing paths in mcpHttpRpc are covered.
const TOOLS = [
  { name: 'webssh_list_servers', description: 'List servers' },
  { name: 'webssh_probe_servers', description: 'Probe servers' },
];

let server;
let serverUrl;
const seenHeaders = { initialize: null, toolsList: null };
let mode = 'sse'; // 'sse' | 'json' | 'fail-init' | 'missing-session' | 'chunked'

function sseEvent(data) {
  // streamable-HTTP sends each JSON-RPC message as an `event: message` block
  // whose payload is a `data:` line, terminated by a blank line.
  return `event: message\ndata: ${JSON.stringify(data)}\n\n`;
}

// Writes an SSE response the way a real streamable-HTTP server does: the
// JSON-RPC result event is split across two `data:` lines (per SSE spec,
// multiple data: lines join with a newline), and a notification event follows
// as a COMPLETE parseable message. A naive parser that takes the first
// parseable `data:` line gets the notification instead of the result; one that
// concatenates data: lines without the newline corrupts the split JSON. The
// body is physically chunked across many small network writes.
function writeChunkedSSE(res, events) {
  // events[0] = JSON-RPC response (split across two data: lines), events[1..]
  // = complete notification events. First-parseable-line scanners would return
  // the notification in events[1] (or events[2]...) and lose the result.
  const [main, ...rest] = events;
  const mainStr = `event: message\ndata: ${JSON.stringify(main)}`;
  const cut = mainStr.indexOf('"result"') === -1 ? mainStr.indexOf('"error"') : mainStr.indexOf('"result"');
  const head = mainStr.slice(0, cut) + '\ndata: ' + mainStr.slice(cut);
  const restStr = rest.map((e) => `event: message\ndata: ${JSON.stringify(e)}`).join('\n\n');
  const full = head + '\n\n' + restStr + '\n\n';
  const parts = [];
  for (let i = 0; i < full.length; i += 5) parts.push(full.slice(i, i + 5)); // tiny chunks
  let i = 0;
  const timer = setInterval(() => {
    if (i < parts.length) { res.write(parts[i]); i++; }
    else { clearInterval(timer); res.end(); }
  }, 1);
}

function startMockServer() {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let payload = {};
        try { payload = JSON.parse(body); } catch {}
        const method = payload.method || '';
        const id = payload.id ?? 1;

        if (method === 'initialize') {
          seenHeaders.initialize = req.headers;
          const result = {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'mock-mcp', version: '1.0.0' },
          };
          const chunk = mode === 'fail-init'
            ? { jsonrpc: '2.0', id, error: { code: -32000, message: 'boom on init' } }
            : { jsonrpc: '2.0', id, result };
          res.setHeader('content-type', mode === 'json' ? 'application/json' : SSE);
          if (mode !== 'missing-session') res.setHeader('mcp-session-id', 'sess-abc-123');
          if (mode === 'chunked') {
            // Result event split across two data: lines, then a COMPLETE
            // notification — the naive first-parseable-line parser returns
            // the notification and loses the result.
            writeChunkedSSE(res, [
              chunk,
              { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
            ]);
          } else {
            res.end(mode === 'json' ? JSON.stringify(chunk) : sseEvent(chunk));
          }
          return;
        }
        if (method === 'tools/list') {
          seenHeaders.toolsList = req.headers;
          const result = { tools: TOOLS };
          const chunk = { jsonrpc: '2.0', id, result };
          res.setHeader('content-type', mode === 'json' ? 'application/json' : SSE);
          res.setHeader('mcp-session-id', 'sess-abc-123');
          if (mode === 'chunked') {
            // Result split across data: lines, complete heartbeat notification
            // after it — must be skipped, not mistaken for the response.
            writeChunkedSSE(res, [
              chunk,
              { jsonrpc: '2.0', method: 'notifications/cancelled', params: {} },
            ]);
          } else {
            res.end(mode === 'json' ? JSON.stringify(chunk) : sseEvent(chunk));
          }
          return;
        }
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: `unexpected method ${method}` }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      serverUrl = `http://127.0.0.1:${server.address().port}/mcp`;
      resolve();
    });
  });
}

let mf;

async function testClient(cfg, token = AUTH) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await mf.dispatchFetch('http://worker.local/api/mcp/clients/test', {
    method: 'POST',
    headers,
    body: JSON.stringify({ client: cfg }),
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

const sseCfg = (overrides = {}) => ({ transport: 'sse', url: serverUrl, ...overrides });

beforeAll(async () => {
  execSync('node core/build-worker.mjs', { cwd: ROOT, stdio: 'pipe' });
  await startMockServer();
  mf = new Miniflare({
    modules: true,
    scriptPath: WORKER_PATH,
    compatibilityDate: '2026-07-23',
    compatibilityFlags: ['nodejs_compat'],
    bindings: { AUTH_TOKEN: AUTH },
    r2Buckets: ['BACKUP_BUCKET'],
    persist: false,
  });
  await mf.ready;
});

afterAll(async () => {
  await mf?.dispose();
  await new Promise((r) => server?.close(r));
});

describe('Worker SSE MCP client bridge (/api/mcp/clients/test)', () => {
  it('rejects stdio transports with the Cloudflare-only-SSE diagnostic', async () => {
    const { status, data } = await testClient({ transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-ssh'] });
    expect(status).toBe(200);
    expect(data.ok).toBe(false);
    // The error must be the EXPLICIT stdio-rejection diagnostic — not some
    // incidental 'url missing' error that happens to contain the letters SSE.
    expect(data.error).toBe('Cloudflare 部署仅支持 SSE（streamable HTTP）MCP 客户端；stdio 子进程请使用自建服务器版（Docker/桌面版）');
  });

  it('handshakes initialize + tools/list over streamable HTTP (SSE responses)', async () => {
    mode = 'sse';
    const { status, data } = await testClient(sseCfg());
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.toolCount).toBe(2);
    expect(data.tools.map((t) => t.name)).toEqual(['webssh_list_servers', 'webssh_probe_servers']);
  });

  it('threads the mcp-session-id from initialize into tools/list', async () => {
    mode = 'sse';
    seenHeaders.initialize = null;
    seenHeaders.toolsList = null;
    await testClient(sseCfg());
    // tools/list must carry the session id the server returned on initialize.
    expect(seenHeaders.toolsList['mcp-session-id']).toBe('sess-abc-123');
  });

  it('parses plain JSON responses when the server is not SSE', async () => {
    mode = 'json';
    const { status, data } = await testClient(sseCfg());
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.toolCount).toBe(2);
  });

  it('parses chunked SSE with notification events + split data: lines', async () => {
    // A real streamable-HTTP server emits notification events BEFORE the
    // JSON-RPC result, may split one JSON message across two data: lines, and
    // sends the body in many small network chunks. mcpParseSse must skip the
    // notifications, reassemble the split JSON (with the SSE newline), and
    // return the tools/list result — not the first parseable event.
    mode = 'chunked';
    const { status, data } = await testClient(sseCfg());
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.toolCount).toBe(2);
    expect(data.tools.map((t) => t.name)).toEqual(['webssh_list_servers', 'webssh_probe_servers']);
  });

  it('surfaces a JSON-RPC initialize error as a failed test', async () => {
    mode = 'fail-init';
    const { status, data } = await testClient(sseCfg());
    expect(status).toBe(200);
    expect(data.ok).toBe(false);
    expect(data.error).toContain('boom on init');
  });

  it('returns a friendly error when the server is unreachable', async () => {
    const { status, data } = await testClient(sseCfg({ url: 'http://127.0.0.1:1/mcp' }));
    expect(status).toBe(200);
    expect(data.ok).toBe(false);
    expect(data.error).toBeTruthy();
  });

  it('rejects a non-http(s) url', async () => {
    const { status, data } = await testClient(sseCfg({ url: 'file:///etc/passwd' }));
    expect(status).toBe(200);
    expect(data.ok).toBe(false);
    expect(data.error).toContain('http(s)');
  });

  it('requires AUTH_TOKEN — returns 503 when the binding is missing', async () => {
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
      const res = await bare.dispatchFetch('http://worker.local/api/mcp/clients/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: sseCfg() }),
      });
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error).toContain('AUTH_TOKEN');
    } finally {
      await bare.dispose();
    }
  });
});
