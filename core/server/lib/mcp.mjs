// MCP management — status dashboard + MCP *client* bridge router.
//
// Two complementary halves:
//   • MCP **server**: webssh exposes its own tools to external agents (Claude
//     Code / Desktop / Cursor) via core/mcp/server.mjs. This module reports
//     that catalog + whether a stable AUTH_TOKEN lets external agents connect.
//   • MCP **client**: webssh connects to external MCP services (stdio
//     subprocess or streamable-HTTP/SSE) so their tools can be inspected and
//     invoked. Client configs live on the frontend (localStorage); the server
//     only runs transient connections when testing/calling — no subprocess is
//     kept alive beyond a single request.
//
// The actual transport lives in mcp-client.mjs so the AI tool loop (chat.mjs)
// can reuse it without an import cycle. Security: every /api/mcp/* route is
// behind the same Bearer-token gate as the rest of the API (index.mjs), so
// spawning a subprocess requires the operator's AUTH_TOKEN — the same trust
// level as the Model API's remote-command exec.

import { json } from './utils.mjs';
import { audit } from './audit.mjs';
import { modelApiStatus, listModelServers } from './modelapi.mjs';
import { getTokenUsage, clearTokenUsage, getAiStatus } from './chat.mjs';
import { TOOLS as MCP_SERVER_TOOLS, SERVER_INFO } from '../../mcp/server.mjs';
import { createMcpSession, listTools, callTool } from './mcp-client.mjs';

let stableToken = false; // true when AUTH_TOKEN came from env (external agents can join)
let serverPort = 9627;

export function setMcpMeta({ stableToken: st, port } = {}) {
  if (typeof st === 'boolean') stableToken = st;
  if (port) serverPort = port;
}

const MAX_TOOL_RESULT = 64 * 1024; // clamp tool results in API responses

async function listToolsFor(cfg) {
  const session = await createMcpSession(cfg);
  try { return await listTools(session); } finally { session.close(); }
}

async function callToolFor(cfg, name, args) {
  const session = await createMcpSession(cfg);
  try { return await callTool(session, name, args); } finally { session.close(); }
}

// ── status composition ──────────────────────────────────────────────────────
export async function getMcpStatus() {
  const model = modelApiStatus();
  const ai = getAiStatus();
  return {
    backend: { up: true, port: serverPort, uptime: Math.round(process.uptime()), stableToken },
    mcpServer: {
      available: stableToken,
      name: SERVER_INFO.name,
      version: SERVER_INFO.version,
      transport: 'stdio',
      tools: MCP_SERVER_TOOLS.map((t) => ({ name: t.name, description: t.description })),
    },
    modelApi: { enabled: model.enabled, servers: model.servers, registry: listModelServers() },
    ai: { ...ai },
    tokens: getTokenUsage(),
  };
}

// ── request router (reached only after authCheck in index.mjs) ──────────────
export async function handleMcpApi(req, res, body) {
  const action = req.url.slice('/api/mcp/'.length).split('?')[0];

  if (req.method === 'GET' && action === 'status') {
    json(res, await getMcpStatus());
    return;
  }

  if (req.method === 'GET' && action === 'tokens') {
    json(res, getTokenUsage());
    return;
  }

  if (action === 'tokens/clear') {
    clearTokenUsage();
    audit('mcp_tokens_clear', {});
    json(res, { success: true });
    return;
  }

  if (action === 'clients/test') {
    const cfg = body.client || body;
    try {
      const tools = await listToolsFor(cfg);
      audit('mcp_client_test', { name: cfg.name || '', transport: cfg.transport || 'stdio', ok: true, tools: tools.length });
      json(res, { ok: true, tools, toolCount: tools.length });
    } catch (e) {
      audit('mcp_client_test', { name: cfg.name || '', transport: cfg.transport || 'stdio', ok: false, error: e.message });
      json(res, { ok: false, error: e.message });
    }
    return;
  }

  if (action === 'clients/call') {
    const cfg = body.client || {};
    const name = body.tool;
    if (!name) { json(res, { error: 'tool name required' }, 400); return; }
    try {
      const result = await callToolFor(cfg, name, body.arguments || {});
      let text;
      try { text = JSON.stringify(result ?? null); } catch { text = String(result); }
      const truncated = text.length > MAX_TOOL_RESULT;
      audit('mcp_client_call', { name: cfg.name || '', transport: cfg.transport || 'stdio', tool: name });
      json(res, { success: true, result: text.slice(0, MAX_TOOL_RESULT), truncated });
    } catch (e) {
      json(res, { success: false, error: e.message });
    }
    return;
  }

  json(res, { error: 'Unknown MCP action' }, 400);
}
