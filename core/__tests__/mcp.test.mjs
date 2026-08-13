import { describe, it, expect } from 'vitest';
import { handleMessage, TOOLS, SERVER_INFO } from '../mcp/server.mjs';

// Fake Model API backend injected via deps.apiRequest
function fakeApi(store = {}) {
  const calls = [];
  const fn = async (path, body) => {
    calls.push({ path, body });
    if (path === '/api/model/servers') return { servers: [{ id: 'srv1', name: 'web', host: '10.0.0.1' }] };
    if (path === '/api/model/probe') return { results: [{ id: 'srv1', ok: true }] };
    if (path === '/api/model/exec') return { results: [{ id: 'srv1', success: true, exit_code: 0, stdout: 'ok', stderr: '', truncated: false }] };
    if (path === '/api/model/servers/save') return { success: true, server: { id: 'srv2' } };
    if (path === '/api/model/servers/remove') return { success: true };
    throw new Error('unexpected path ' + path);
  };
  return { fn, calls };
}

describe('MCP protocol', () => {
  it('initialize returns server info and tool capability', async () => {
    const reply = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
    expect(reply.id).toBe(1);
    expect(reply.result.serverInfo.name).toBe(SERVER_INFO.name);
    expect(reply.result.capabilities.tools).toBeDefined();
    expect(reply.result.protocolVersion).toBe('2024-11-05');
  });

  it('ping replies with empty result', async () => {
    const reply = await handleMessage({ jsonrpc: '2.0', id: 2, method: 'ping' });
    expect(reply.result).toEqual({});
  });

  it('notifications get no reply', async () => {
    const reply = await handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(reply).toBeNull();
  });

  it('unknown method returns -32601', async () => {
    const reply = await handleMessage({ jsonrpc: '2.0', id: 3, method: 'resources/list' });
    expect(reply.error.code).toBe(-32601);
  });

  it('tools/list exposes the five webssh tools with schemas', async () => {
    const reply = await handleMessage({ jsonrpc: '2.0', id: 4, method: 'tools/list' });
    const names = reply.result.tools.map(t => t.name);
    expect(names).toEqual([
      'webssh_list_servers', 'webssh_probe_servers', 'webssh_exec_command',
      'webssh_add_server', 'webssh_remove_server',
    ]);
    for (const tool of reply.result.tools) {
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.inputSchema.type).toBe('object');
    }
    const exec = reply.result.tools.find(t => t.name === 'webssh_exec_command');
    expect(exec.inputSchema.required).toEqual(['server', 'command']);
  });
});

describe('MCP tools/call', () => {
  it('list_servers proxies the Model API', async () => {
    const api = fakeApi();
    const reply = await handleMessage(
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'webssh_list_servers', arguments: {} } },
      { apiRequest: api.fn },
    );
    expect(reply.result.isError).toBe(false);
    expect(api.calls[0].path).toBe('/api/model/servers');
    expect(JSON.parse(reply.result.content[0].text).servers[0].id).toBe('srv1');
  });

  it('exec_command passes server/command/timeout through', async () => {
    const api = fakeApi();
    const reply = await handleMessage(
      { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'webssh_exec_command', arguments: { server: 'ok', command: 'uptime', timeout_ms: 8000 } } },
      { apiRequest: api.fn },
    );
    expect(reply.result.isError).toBe(false);
    expect(api.calls[0]).toEqual({ path: '/api/model/exec', body: { server: 'ok', command: 'uptime', timeout_ms: 8000 } });
    expect(JSON.parse(reply.result.content[0].text).results[0].exit_code).toBe(0);
  });

  it('probe and add/remove map to the right endpoints', async () => {
    const api = fakeApi();
    await handleMessage({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'webssh_probe_servers', arguments: { id: 'srv1' } } }, { apiRequest: api.fn });
    await handleMessage({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'webssh_add_server', arguments: { host: 'h', username: 'u', auth_value: 'p' } } }, { apiRequest: api.fn });
    await handleMessage({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'webssh_remove_server', arguments: { id: 'srv1' } } }, { apiRequest: api.fn });
    expect(api.calls.map(c => c.path)).toEqual(['/api/model/probe', '/api/model/servers/save', '/api/model/servers/remove']);
    expect(api.calls[1].body.host).toBe('h');
    expect(api.calls[2].body).toEqual({ id: 'srv1' });
  });

  it('unknown tool returns -32602', async () => {
    const reply = await handleMessage({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'nope', arguments: {} } });
    expect(reply.error.code).toBe(-32602);
  });

  it('backend errors surface as isError tool results (not JSON-RPC errors)', async () => {
    const failApi = async () => { throw new Error('no matching server'); };
    const reply = await handleMessage(
      { jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'webssh_exec_command', arguments: { server: 'srvX', command: 'ls' } } },
      { apiRequest: failApi },
    );
    expect(reply.result.isError).toBe(true);
    expect(reply.result.content[0].text).toContain('no matching server');
  });
});
