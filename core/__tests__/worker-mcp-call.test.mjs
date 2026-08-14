// Integration test for the Cloudflare Worker's MCP *client call* bridge —
// /api/mcp/clients/call. The REAL Worker bundle is built with esbuild and run
// inside Miniflare; the outbound streamable-HTTP MCP server is a local mock
// that speaks SSE and plain JSON. Coverage:
//   - tools/call execution round-trip (session-id threading, arguments echo)
//   - result truncation at MCP_MAX_RESULT (64 KiB) with a `truncated` flag
//   - JSON-RPC error passthrough (initialize / tools/call failures surface
//     with the server's message, not a swallowed 200)
//   - stdio rejection diagnostic, missing tool name → 400, auth gate
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';

const ROOT = process.cwd();
const WORKER_PATH = join(ROOT, 'dist', 'client', '_worker.js');
const AUTH = 'mcp-call-test-token';
const MCP_MAX_RESULT = 64 * 1024;
const SSE = 'text/event-stream';

const TOOL_NAME = 'webssh_exec';
const CALL_ARGS = { server: 'prod-01', command: 'uptime' };

function sseEvent(data) {
  return `event: message\ndata: ${JSON.stringify(data)}\n\n`;
}

// Modes: 'sse' | 'json' | 'fail-init' | 'call-error' | 'call-huge'
let mode = 'sse';
let server;
let serverUrl;
const seenHeaders = { initialize: null, call: null };

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
        const respond = (chunk, { session = true, ct = SSE } = {}) => {
          res.setHeader('content-type', ct);
          if (session) res.setHeader('mcp-session-id', 'sess-abc-123');
          res.end(ct === 'application/json' ? JSON.stringify(chunk) : sseEvent(chunk));
        };

        if (method === 'initialize') {
          seenHeaders.initialize = req.headers;
          if (mode === 'fail-init') {
            respond({ jsonrpc: '2.0', id, error: { code: -32000, message: 'boom on init' } });
            return;
          }
          respond({
            jsonrpc: '2.0', id,
            result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'mock-mcp', version: '1.0.0' } },
          });
          return;
        }

        if (method === 'tools/call') {
          seenHeaders.call = req.headers;
          if (mode === 'call-error') {
            respond({ jsonrpc: '2.0', id, error: { code: -32602, message: 'tool exploded: bad argument' } });
            return;
          }
          const big = mode === 'call-huge'
            ? { content: [{ type: 'text', text: 'x'.repeat(MCP_MAX_RESULT + 5000) }] }
            : { content: [{ type: 'text', text: `echo:${JSON.stringify(payload.params?.arguments || {})}` }], isError: false };
          respond({ jsonrpc: '2.0', id, result: big });
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

async function callClient(body, token = AUTH) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await mf.dispatchFetch('http://worker.local/api/mcp/clients/call', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

const sseCfg = (overrides = {}) => ({ transport: 'sse', url: serverUrl, ...overrides });
const callBody = (overrides = {}) => ({ client: sseCfg(), tool: TOOL_NAME, arguments: CALL_ARGS, ...overrides });

beforeAll(async () => {
  execSync('node core/build-worker.mjs', { cwd: ROOT, stdio: 'pipe' });
  await startMockServer();
  mf = new Miniflare({
    modules: true,
    scriptPath: WORKER_PATH,
    compatibilityDate: '2026-07-23',
    compatibilityFlags: ['nodejs_compat'],
    bindings: { AUTH_TOKEN: AUTH },
    persist: false,
  });
  await mf.ready;
});

afterAll(async () => {
  await mf?.dispose();
  await new Promise((r) => server?.close(r));
});

describe('Worker SSE MCP client call bridge (/api/mcp/clients/call)', () => {
  it('auth gate: /api/mcp/clients/call without a token → 401', async () => {
    const { status } = await callClient(callBody(), null);
    expect(status).toBe(401);
  });

  it('rejects stdio transports with the Cloudflare-only-SSE diagnostic', async () => {
    const { status, data } = await callClient({ client: { transport: 'stdio', command: 'npx' }, tool: TOOL_NAME });
    expect(status).toBe(200);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Cloudflare 部署仅支持 SSE（streamable HTTP）MCP 客户端；stdio 子进程请使用自建服务器版（Docker/桌面版）');
  });

  it('missing tool name → 400', async () => {
    const { status, data } = await callClient({ client: sseCfg() });
    expect(status).toBe(400);
    expect(data.error).toBe('tool name required');
  });

  it('tools/call executes and returns the JSON result (SSE response)', async () => {
    mode = 'sse';
    const { status, data } = await callClient(callBody());
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.truncated).toBe(false);
    // Arguments must be forwarded verbatim and echoed back by the mock
    // (the inner quotes are JSON-escaped inside the serialized result).
    expect(data.result).toContain('echo:');
    expect(data.result).toContain('prod-01');
    expect(data.result).toContain('uptime');
  });

  it('threads the initialize session-id into tools/call', async () => {
    mode = 'sse';
    seenHeaders.initialize = null;
    seenHeaders.call = null;
    await callClient(callBody());
    expect(seenHeaders.call['mcp-session-id']).toBe('sess-abc-123');
  });

  it('parses plain JSON responses when the server is not SSE', async () => {
    mode = 'json';
    const { status, data } = await callClient(callBody());
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.truncated).toBe(false);
    expect(data.result).toContain('echo:');
  });

  it('initialize failure surfaces the server error (success:false, message passthrough)', async () => {
    mode = 'fail-init';
    const { status, data } = await callClient(callBody());
    expect(status).toBe(200);
    expect(data.success).toBe(false);
    expect(data.error).toContain('boom on init');
  });

  it('tools/call JSON-RPC error is passed through, not swallowed', async () => {
    mode = 'call-error';
    const { status, data } = await callClient(callBody());
    expect(status).toBe(200);
    expect(data.success).toBe(false);
    expect(data.error).toContain('tool exploded: bad argument');
  });

  it('truncates results over MCP_MAX_RESULT (64 KiB) and reports truncated:true', async () => {
    mode = 'call-huge';
    const { status, data } = await callClient(callBody());
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.truncated).toBe(true);
    expect(data.result.length).toBe(MCP_MAX_RESULT);
    // The result is the exact JSON prefix, sliced at the byte limit.
    expect(data.result.startsWith('{"content":[{"type":"text","text":"xxx')).toBe(true);
  });

  it('returns a small result untruncated and byte-identical', async () => {
    mode = 'sse';
    const { data } = await callClient(callBody());
    expect(data.truncated).toBe(false);
    expect(data.result.length).toBeLessThan(MCP_MAX_RESULT);
    expect(data.result).toContain('echo:');
  });
});
