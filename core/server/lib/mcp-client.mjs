// MCP *client* transport — connects webssh to external MCP services.
//
// Shared by two callers:
//   • core/server/lib/mcp.mjs     — /api/mcp/clients/test & call endpoints
//   • core/server/lib/chat.mjs    — the AI tool-calling loop
//
// Supports two transports:
//   • stdio — spawn a local subprocess, newline-delimited JSON-RPC.
//   • sse   — streamable HTTP/SSE over fetch (POST with Accept: text/event-stream).
//
// No dependency on chat/mcp/modelapi — this module is the lowest layer, so
// callers above can import it without creating import cycles.

import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { logger } from './logger.mjs';
import { WEBSSH_VERSION } from '../../shared/version.mjs';

const log = logger('MCPClient');

export const CLIENT_INFO = { name: 'webssh', version: WEBSSH_VERSION };
const PROTOCOL_VERSION = '2024-11-05';

// ── stdio transport ─────────────────────────────────────────────────────────
function spawnStdioProcess(cfg) {
  const command = String(cfg.command || '').trim();
  if (!command) throw new Error('stdio transport requires a command');
  const args = Array.isArray(cfg.args) ? cfg.args.map((a) => String(a)) : [];
  const env = { ...process.env };
  if (cfg.env && typeof cfg.env === 'object' && !Array.isArray(cfg.env)) {
    for (const [k, v] of Object.entries(cfg.env)) if (v != null) env[String(k)] = String(v);
  }
  // Windows .cmd/.bat shims (npx, uvicorn, ...) cannot be spawned directly
  // without a shell — resolve bare commands through cmd.exe /c.
  const isWindows = process.platform === 'win32';
  const isBareCommand = isWindows && !/[/\\]/.test(command) && !/\.(exe|cmd|bat)$/i.test(command);
  return spawn(isWindows && isBareCommand ? 'cmd.exe' : command, isWindows && isBareCommand ? ['/c', command, ...args] : args, {
    windowsHide: true,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
    cwd: typeof cfg.cwd === 'string' && cfg.cwd.trim() ? cfg.cwd.trim() : undefined,
  });
}

function createStdioSession(cfg) {
  let child;
  try {
    child = spawnStdioProcess(cfg);
  } catch (e) {
    throw new Error(`failed to start MCP process: ${e.message}`);
  }
  let closed = false;
  let stderrTail = '';
  const pending = new Map();
  let nextId = 1;
  const rl = createInterface({ input: child.stdout, terminal: false });

  const failAll = (err) => {
    for (const [, p] of pending) { clearTimeout(p.timer); p.reject(err); }
    pending.clear();
  };

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try { msg = JSON.parse(trimmed); } catch { return; }
    if (msg.id == null) return; // notifications (initialized, ...) have no reply
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.error) p.reject(new Error(msg.error.message || `MCP error ${msg.error.code ?? ''}`));
    else p.resolve(msg.result);
  });
  child.stderr.on('data', (d) => { stderrTail = (stderrTail + String(d)).slice(-2000); });
  child.on('error', (e) => { closed = true; failAll(e); });
  child.on('exit', (code) => {
    closed = true;
    const hint = stderrTail.trim().slice(-200);
    const msg = code === 0 ? 'MCP process exited' : `MCP process exited with code ${code}${hint ? `: ${hint}` : ''}`;
    failAll(new Error(msg));
  });

  function request(method, params, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      if (closed) {
        reject(new Error(`MCP process not running${stderrTail.trim() ? ': ' + stderrTail.trim().slice(-200) : ''}`));
        return;
      }
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP request timed out (${method})`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try {
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: params || {} }) + '\n');
      } catch (e) {
        clearTimeout(timer);
        pending.delete(id);
        reject(e);
      }
    });
  }

  return {
    request,
    close() {
      try { rl.close(); } catch {}
      try { child.stdin.end(); } catch {}
      setTimeout(() => { try { child.kill(); } catch {} }, 500);
    },
  };
}

// ── streamable HTTP / SSE transport ─────────────────────────────────────────
function parseSsePayload(text) {
  const dataLines = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  try { return JSON.parse(dataLines.join('')); } catch {}
  for (const d of dataLines) { try { return JSON.parse(d); } catch {} }
  return null;
}

async function httpRpc(cfg, method, params, sessionId) {
  const url = String(cfg.url || '').trim();
  if (!/^https?:\/\//i.test(url)) throw new Error('SSE transport requires an http(s) url');
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  if (cfg.headers && typeof cfg.headers === 'object' && !Array.isArray(cfg.headers)) {
    for (const [k, v] of Object.entries(cfg.headers)) if (v != null) headers[String(k)] = String(v);
  }
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  const timeoutMs = Math.min(Math.max(parseInt(cfg.timeout_ms, 10) || 20000, 3000), 120000);
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params || {} }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const newSession = res.headers.get('mcp-session-id') || res.headers.get('Mcp-Session-Id');
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  let data;
  if (ct.includes('text/event-stream')) data = parseSsePayload(await res.text());
  else data = await res.json().catch(() => null);
  return { data, sessionId: newSession || sessionId };
}

function createHttpSession(cfg) {
  let sessionId = null;
  return {
    async request(method, params) {
      const r = await httpRpc(cfg, method, params, sessionId);
      if (r.sessionId) sessionId = r.sessionId;
      if (r.data?.error) throw new Error(r.data.error.message || `MCP error ${r.data.error.code ?? ''}`);
      return r.data?.result;
    },
    close() {},
  };
}

// ── session + tool helpers ──────────────────────────────────────────────────
export async function createMcpSession(client) {
  const session = client.transport === 'stdio' ? createStdioSession(client) : createHttpSession(client);
  await session.request('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: CLIENT_INFO,
  });
  return session;
}

export async function listTools(session) {
  const result = await session.request('tools/list', {});
  const tools = result?.tools ?? result;
  return Array.isArray(tools) ? tools : [];
}

export async function callTool(session, name, args) {
  return await session.request('tools/call', { name, arguments: args || {} });
}

// Turn an MCP tool result (content[] / structuredContent) into text for the AI.
export function formatToolResult(result) {
  if (result == null) return '';
  if (result.structuredContent !== undefined) {
    try { return JSON.stringify(result.structuredContent, null, 2); } catch { return String(result.structuredContent); }
  }
  if (Array.isArray(result.content)) {
    return result.content.map((c) => {
      if (!c) return '';
      if (c.type === 'text') return String(c.text ?? '');
      if (c.type === 'image') return '[image]';
      if (c.type === 'resource') return `[resource: ${c.resource?.uri || ''}]`;
      try { return JSON.stringify(c); } catch { return ''; }
    }).filter(Boolean).join('\n');
  }
  if (typeof result === 'string') return result;
  try { return JSON.stringify(result, null, 2); } catch { return String(result); }
}

// "My Server" → "My_Server" — safe component of mcp__<service>__<tool>.
export function sanitizeMcpName(name) {
  const s = String(name || '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');
  return (s || 'mcp').slice(0, 32);
}

// Connect each enabled client, list its tools, and build OpenAI-style tool
// definitions namespaced as mcp__<service>__<tool>. Returns the session cache
// so the caller can invoke tools and close connections when done.
export async function collectMcpTools(clients) {
  const tools = [];
  const registry = new Map(); // tool name → { session, toolName, client }
  const sessions = new Set();

  for (const client of Array.isArray(clients) ? clients : []) {
    if (!client || client.enabled === false) continue;
    const prefix = sanitizeMcpName(client.name);
    let session;
    try {
      session = await createMcpSession(client);
      const list = await listTools(session);
      if (list.length === 0) { try { session.close(); } catch {} continue; }
      sessions.add(session);
      for (const t of list) {
        if (!t?.name) continue;
        const name = `mcp__${prefix}__${t.name}`;
        tools.push({
          type: 'function',
          function: {
            name,
            description: String(t.description || '').slice(0, 1024),
            parameters: t.inputSchema && typeof t.inputSchema === 'object'
              ? t.inputSchema
              : { type: 'object', properties: {} },
          },
        });
        registry.set(name, { session, toolName: t.name, client });
      }
    } catch (e) {
      log.warn(`MCP client "${client.name}" skipped: ${e.message}`);
      try { session?.close(); } catch {}
    }
  }

  return {
    tools,
    registry,
    close() {
      for (const s of sessions) { try { s.close(); } catch {} }
      sessions.clear();
      registry.clear();
    },
  };
}
