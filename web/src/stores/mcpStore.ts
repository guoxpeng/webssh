import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiFetch } from '@/utils/api';
import { getApiBaseUrl } from '@/utils/constants';
import { storageGetJSON, storageSetJSON } from '@/utils/storage';

export interface McpClientConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  cwd?: string;
  enabled: boolean;
  lastStatus?: 'connected' | 'disconnected' | 'untested';
  toolCount?: number;
  tools?: { name: string; description?: string; inputSchema?: any }[];
  lastError?: string;
  lastChecked?: number;
}

function loadClients(): McpClientConfig[] {
  try {
    const list = storageGetJSON('mcpClients', []);
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function saveClients(clients: McpClientConfig[]): void {
  storageSetJSON('mcpClients', clients);
}

function makeId(): string {
  return `mcp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// Parse the standard mcpServers shape used by Claude Desktop / Claude Code:
// { "mcpServers": { "<name>": { command, args, env, url, headers } } }
export function parseMcpServersJson(json: string): Omit<McpClientConfig, 'id' | 'enabled' | 'lastStatus'>[] {
  const data = JSON.parse(json);
  const map = data?.mcpServers ?? data;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return [];
  const out: Omit<McpClientConfig, 'id' | 'enabled' | 'lastStatus'>[] = [];
  for (const [name, raw] of Object.entries(map)) {
    if (!raw || typeof raw !== 'object') continue;
    const cfg = raw as Record<string, any>;
    const transport = cfg.url ? 'sse' : 'stdio';
    if (transport === 'stdio' && !cfg.command) continue;
    if (transport === 'sse' && !cfg.url) continue;
    out.push({
      name,
      transport,
      command: cfg.command,
      args: Array.isArray(cfg.args) ? cfg.args.map(String) : undefined,
      env: cfg.env && typeof cfg.env === 'object' ? cfg.env : undefined,
      url: cfg.url,
      headers: cfg.headers && typeof cfg.headers === 'object' ? cfg.headers : undefined,
    });
  }
  return out;
}

export const useMcpStore = defineStore('mcp', () => {
  const clients = ref<McpClientConfig[]>(loadClients());

  function persist() { saveClients(clients.value); }

  function addClient(data: Omit<McpClientConfig, 'id'>): McpClientConfig {
    const client: McpClientConfig = { ...data, id: makeId() };
    clients.value.unshift(client);
    persist();
    return client;
  }

  function updateClient(id: string, data: Partial<McpClientConfig>): void {
    const idx = clients.value.findIndex((c) => c.id === id);
    if (idx === -1) return;
    clients.value[idx] = { ...clients.value[idx], ...data };
    persist();
  }

  function removeClient(id: string): void {
    clients.value = clients.value.filter((c) => c.id !== id);
    persist();
  }

  function importClients(json: string): number {
    try {
      const parsed = parseMcpServersJson(json);
      let count = 0;
      for (const item of parsed) {
        addClient({ ...item, enabled: true, lastStatus: 'untested' });
        count++;
      }
      return count;
    } catch {
      return 0;
    }
  }

  async function fetchStatus(): Promise<any> {
    const res = await apiFetch(`${getApiBaseUrl()}/mcp/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  async function fetchTokens(): Promise<any> {
    const res = await apiFetch(`${getApiBaseUrl()}/mcp/tokens`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  async function clearTokens(): Promise<void> {
    const res = await apiFetch(`${getApiBaseUrl()}/mcp/tokens/clear`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async function testClient(config: McpClientConfig): Promise<{ ok: boolean; tools: any[]; error?: string }> {
    try {
      const res = await apiFetch(`${getApiBaseUrl()}/mcp/clients/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: config }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, tools: [], error: data.error || `HTTP ${res.status}` };
      return { ok: data.ok, tools: data.tools || [], error: data.error };
    } catch (e: any) {
      return { ok: false, tools: [], error: e.message };
    }
  }

  async function callTool(config: McpClientConfig, tool: string, args: any): Promise<{ success: boolean; result?: string; truncated?: boolean; error?: string }> {
    try {
      const res = await apiFetch(`${getApiBaseUrl()}/mcp/clients/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: config, tool, arguments: args }),
      });
      const data = await res.json();
      return { success: data.success, result: data.result, truncated: data.truncated, error: data.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  return {
    clients,
    addClient, updateClient, removeClient, importClients,
    testClient, callTool, fetchStatus, fetchTokens, clearTokens,
  };
});
