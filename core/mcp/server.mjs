#!/usr/bin/env node
/**
 * webssh MCP server — Model Context Protocol bridge for AI agents.
 *
 * Lets MCP-compatible agents (Claude Desktop, Claude Code, Cursor, ...)
 * manage the servers registered in webssh and run commands on them by
 * proxying to the webssh Model API (/api/model/*).
 *
 * Transport: stdio, newline-delimited JSON-RPC 2.0 (MCP standard).
 * Zero runtime dependencies — pure Node (>= 18, uses global fetch).
 *
 * Configuration (environment variables):
 *   WEBSSH_URL    Base URL of the webssh server (default http://127.0.0.1:9627)
 *   WEBSSH_TOKEN  The AUTH_TOKEN of the webssh server (required)
 *
 * Usage:  node core/mcp/server.mjs
 */

import { createInterface } from 'readline';
import { fileURLToPath } from 'url';

const WEBSSH_URL = (process.env.WEBSSH_URL || 'http://127.0.0.1:9627').replace(/\/+$/, '');
const WEBSSH_TOKEN = process.env.WEBSSH_TOKEN || '';

export const SERVER_INFO = { name: 'webssh', version: '1.0.0' };
export const PROTOCOL_VERSION = '2024-11-05';

// ── Tool catalog (MCP tools/list) ──────────────────────────────────────────
export const TOOLS = [
  {
    name: 'webssh_list_servers',
    description: 'List all SSH servers registered in webssh (id, name, host, port, username, last probe status). Credentials are never returned.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'webssh_probe_servers',
    description: 'Test SSH login on registered servers. Probe before exec to know which servers are reachable.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Server id to probe. Omit to probe every registered server.' },
        timeout_ms: { type: 'number', description: 'Per-server timeout in ms (max 120000).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'webssh_exec_command',
    description: 'Run a shell command over SSH on one server, all servers, or all servers whose last probe succeeded. Returns stdout/stderr/exit code per server. Max 4096 chars per command, 256KB output.',
    inputSchema: {
      type: 'object',
      properties: {
        server: { type: 'string', description: "Server id, or 'ok' (all servers whose last probe succeeded), or 'all'." },
        command: { type: 'string', description: 'Shell command to execute (max 4096 chars).' },
        timeout_ms: { type: 'number', description: 'Timeout in ms, 3000-120000.' },
      },
      required: ['server', 'command'],
      additionalProperties: false,
    },
  },
  {
    name: 'webssh_add_server',
    description: 'Register (or update) an SSH server in webssh so the agent can connect to it later.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Existing server id when updating an entry.' },
        name: { type: 'string', description: 'Display name.' },
        host: { type: 'string' },
        port: { type: 'number', description: 'SSH port (default 22).' },
        username: { type: 'string' },
        auth_type: { type: 'string', enum: ['password', 'key'], description: 'Default password.' },
        auth_value: { type: 'string', description: 'Password or private key content.' },
      },
      required: ['host', 'username', 'auth_value'],
      additionalProperties: false,
    },
  },
  {
    name: 'webssh_remove_server',
    description: 'Remove a registered server from webssh.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Server id to remove.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
];

// ── Model API client ───────────────────────────────────────────────────────
export async function apiRequest(path, body, deps = {}) {
  const base = deps.baseUrl || WEBSSH_URL;
  const token = deps.token ?? WEBSSH_TOKEN;
  if (!token) throw new Error('WEBSSH_TOKEN not set — provide the AUTH_TOKEN of the webssh server');
  const res = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `webssh returned HTTP ${res.status}`);
  return data;
}

const TOOL_IMPL = {
  webssh_list_servers: (_args, req) => req('/api/model/servers'),
  webssh_probe_servers: (args, req) => req('/api/model/probe', { id: args.id, timeout_ms: args.timeout_ms }),
  webssh_exec_command: (args, req) => req('/api/model/exec', { server: args.server, command: args.command, timeout_ms: args.timeout_ms }),
  webssh_add_server: (args, req) => req('/api/model/servers/save', args),
  webssh_remove_server: (args, req) => req('/api/model/servers/remove', { id: args.id }),
};

// ── JSON-RPC / MCP message handling ────────────────────────────────────────
const rpcOk = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcErr = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

export async function handleMessage(msg, deps = {}) {
  const req = deps.apiRequest || ((path, body) => apiRequest(path, body, deps));

  switch (msg.method) {
    case 'initialize':
      return rpcOk(msg.id, {
        protocolVersion: msg.params?.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });

    case 'ping':
      return rpcOk(msg.id, {});

    case 'tools/list':
      return rpcOk(msg.id, { tools: TOOLS });

    case 'tools/call': {
      const name = msg.params?.name;
      const impl = TOOL_IMPL[name];
      if (!impl) return rpcErr(msg.id, -32602, `Unknown tool: ${name}`);
      try {
        const result = await impl(msg.params?.arguments || {}, req);
        return rpcOk(msg.id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: false,
        });
      } catch (e) {
        // Tool-level failure: report inside the result (MCP convention),
        // not as a JSON-RPC error, so the agent can react to the message.
        return rpcOk(msg.id, {
          content: [{ type: 'text', text: `Error: ${e.message}` }],
          isError: true,
        });
      }
    }

    default:
      // Notifications (initialized, notifications/cancelled, ...) get no reply.
      if (msg.id === undefined || msg.id === null) return null;
      return rpcErr(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

// ── stdio transport ────────────────────────────────────────────────────────
function log(...args) {
  // stdout is reserved for the protocol — diagnostics go to stderr
  console.error('[webssh-mcp]', ...args);
}

export function startStdioServer() {
  if (!WEBSSH_TOKEN) {
    log('WARNING: WEBSSH_TOKEN is not set; every tool call will fail until it is provided.');
  }
  log(`ready (webssh: ${WEBSSH_URL})`);

  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      process.stdout.write(JSON.stringify(rpcErr(null, -32700, 'Parse error')) + '\n');
      return;
    }
    try {
      const reply = await handleMessage(msg);
      if (reply) process.stdout.write(JSON.stringify(reply) + '\n');
    } catch (e) {
      if (msg.id !== undefined && msg.id !== null) {
        process.stdout.write(JSON.stringify(rpcErr(msg.id, -32603, `Internal error: ${e.message}`)) + '\n');
      }
    }
  });
  rl.on('close', () => process.exit(0));
}

// Run only when executed directly (not when imported by tests)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startStdioServer();
}
