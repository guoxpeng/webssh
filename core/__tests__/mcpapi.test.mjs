import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'url';
import { getMcpStatus, handleMcpApi, setMcpMeta } from '../server/lib/mcp.mjs';
import { setAuthToken } from '../server/lib/modelapi.mjs';
import { clearTokenUsage } from '../server/lib/chat.mjs';

const MCP_SERVER_PATH = fileURLToPath(new URL('../mcp/server.mjs', import.meta.url));

function fakeReq(url, method = 'POST') { return { url, method }; }
function fakeRes() {
  return {
    statusCode: null, body: null,
    writeHead(code) { this.statusCode = code; },
    end(data) { this.body = data; },
    get json() { return JSON.parse(this.body); },
  };
}

describe('MCP management status', () => {
  it('reports backend, server catalog, model api, ai and token usage', async () => {
    setAuthToken('test-token-123');
    setMcpMeta({ stableToken: false, port: 9627 });
    const status = await getMcpStatus();
    expect(status.backend.up).toBe(true);
    expect(status.backend.stableToken).toBe(false);
    expect(status.backend.port).toBe(9627);
    expect(status.mcpServer.tools.map((t) => t.name)).toContain('webssh_exec_command');
    expect(status.mcpServer.available).toBe(false);
    expect(status.modelApi.enabled).toBe(true);
    expect(status.ai).toHaveProperty('enabled');
    expect(status.tokens).toHaveProperty('total');
  });

  it('marks the MCP server available when a stable token is set', async () => {
    setMcpMeta({ stableToken: true, port: 9627 });
    const status = await getMcpStatus();
    expect(status.mcpServer.available).toBe(true);
    setMcpMeta({ stableToken: false, port: 9627 });
  });
});

describe('MCP management router', () => {
  it('rejects unknown actions', async () => {
    const res = fakeRes();
    await handleMcpApi(fakeReq('/api/mcp/nope'), res, {});
    expect(res.statusCode).toBe(400);
  });

  it('returns token usage via GET', async () => {
    clearTokenUsage();
    const res = fakeRes();
    await handleMcpApi(fakeReq('/api/mcp/tokens', 'GET'), res, {});
    expect(res.json.requests).toBe(0);
    expect(res.json.total.total_tokens).toBe(0);
  });

  it('clears token usage', async () => {
    const res = fakeRes();
    await handleMcpApi(fakeReq('/api/mcp/tokens/clear'), res, {});
    expect(res.json.success).toBe(true);
  });

  it('requires a tool name before calling', async () => {
    const res = fakeRes();
    await handleMcpApi(fakeReq('/api/mcp/clients/call'), res, {});
    expect(res.statusCode).toBe(400);
  });

  it('lists tools from the bundled webssh MCP server over stdio', async () => {
    const res = fakeRes();
    await handleMcpApi(fakeReq('/api/mcp/clients/test'), res, {
      client: { name: 'self', transport: 'stdio', command: 'node', args: [MCP_SERVER_PATH], env: { WEBSSH_TOKEN: 'x' } },
    });
    expect(res.json.ok).toBe(true);
    expect(res.json.toolCount).toBe(5);
    expect(res.json.tools.map((t) => t.name)).toContain('webssh_exec_command');
  });
});
