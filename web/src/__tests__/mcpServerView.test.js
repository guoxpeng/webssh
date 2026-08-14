// @vitest-environment jsdom
// Component tests for the model management panel (McpServerView — "MCP 服务"):
//   - lists servers from the model registry with probe state badges
//   - probe badge three-state rendering (untested / ok / failed)
//   - Cloudflare degradation: unavailable MCP server + AUTH_TOKEN hint (503
//     class), HTTP 401 → error state with retry
//   - self-hosted differences: available server, stdio transport, registry meta
//   - empty registry hint + exposed agent tools
// The panel's data comes from /api/mcp/status via mcpStore.fetchStatus();
// apiFetch is mocked so each test drives a concrete backend shape.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import McpServerView from '@/views/mcp/McpServerView.vue';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('@/utils/api', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, apiFetch: apiFetchMock };
});

const ok = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

function makeStatus(overrides = {}) {
  return {
    backend: { up: true, port: null, uptime: 0 },
    mcpServer: {
      available: true,
      name: 'webssh',
      version: '1.0.0',
      transport: 'stdio',
      tools: [{ name: 'webssh_probe_servers', description: 'Probe servers' }],
    },
    modelApi: {
      enabled: true,
      servers: 3,
      registry: [
        { id: 'a', name: 'prod-box', host: '10.0.0.1', port: 22, username: 'root', last_probe: null },
        { id: 'b', name: 'dev-box', host: '10.0.0.2', port: 2222, username: 'admin', last_probe: { t: 1, ok: true, error: null } },
        { id: 'c', name: 'broken-box', host: '10.0.0.3', port: 22, username: 'ops', last_probe: { t: 1, ok: false, error: 'connect ECONNREFUSED' } },
      ],
    },
    ai: { enabled: false, apiConfigured: false, model: null },
    backupBucket: 'bound',
    tokens: { total: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, requests: 0, calls: [] },
    ...overrides,
  };
}

function mountView() {
  return mount(McpServerView, { global: { plugins: [i18n], stubs: { teleport: true } } });
}

describe('McpServerView (model management panel)', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'zh-CN';
    setActivePinia(createPinia());
    localStorage.clear();
    sessionStorage.clear();
    apiFetchMock.mockReset();
  });

  it('shows a loading spinner while fetching /api/mcp/status', () => {
    apiFetchMock.mockReturnValue(new Promise(() => {})); // never settles
    const wrapper = mountView();
    expect(wrapper.text()).toContain('加载中...');
  });

  it('lists registry servers with name and user@host:port (列服务器)', async () => {
    apiFetchMock.mockResolvedValue(ok(makeStatus()));
    const wrapper = mountView();
    await flushPromises();

    const items = wrapper.findAll('.server-item');
    expect(items).toHaveLength(3);
    expect(wrapper.text()).toContain('prod-box');
    expect(wrapper.text()).toContain('root@10.0.0.1:22');
    expect(wrapper.text()).toContain('admin@10.0.0.2:2222');
    expect(wrapper.text()).toContain('ops@10.0.0.3:22');
  });

  it('renders the three probe badge states (探测): untested / ok / failed', async () => {
    apiFetchMock.mockResolvedValue(ok(makeStatus()));
    const wrapper = mountView();
    await flushPromises();

    const badges = wrapper.findAll('.probe-badge');
    expect(badges).toHaveLength(3);
    expect(badges[0].classes()).toContain('untested');
    expect(badges[0].text()).toContain('未测试');
    expect(badges[1].classes()).toContain('ok');
    expect(badges[1].text()).toContain('成功');
    expect(badges[2].classes()).toContain('bad');
    expect(badges[2].text()).toContain('失败');
  });

  it('shows the unavailable state + AUTH_TOKEN hint on a CF deployment without AUTH_TOKEN (503 class)', async () => {
    const st = makeStatus({
      mcpServer: { ...makeStatus().mcpServer, available: false },
      modelApi: { enabled: false, servers: 0, registry: [] },
    });
    apiFetchMock.mockResolvedValue(ok(st));
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('不可用');
    // The degradation hint explains the fixed AUTH_TOKEN requirement.
    expect(wrapper.text()).toContain('请部署时设置环境变量 AUTH_TOKEN');
    // Server meta (name/version) is hidden while unavailable.
    expect(wrapper.text()).not.toContain('v1.0.0');
    expect(wrapper.text()).toContain('暂无已同步的服务器');
  });

  it('shows the error state on HTTP 401 and recovers via retry', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) });
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('获取服务状态失败，请确认后端可达。');
    expect(wrapper.findAll('.server-item')).toHaveLength(0);

    // Retry with a healthy backend → the panel renders again.
    apiFetchMock.mockResolvedValueOnce(ok(makeStatus()));
    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('可用');
    expect(wrapper.text()).toContain('prod-box');
  });

  it('shows the self-hosted state: available MCP server, stdio transport, registry meta', async () => {
    apiFetchMock.mockResolvedValue(ok(makeStatus()));
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('可用');
    expect(wrapper.text()).toContain('v1.0.0');
    expect(wrapper.text()).toContain('stdio');
    expect(wrapper.text()).toContain('可管理的服务器');
  });

  it('shows the empty-registry hint when no servers are synced', async () => {
    apiFetchMock.mockResolvedValue(ok(makeStatus({ modelApi: { enabled: true, servers: 0, registry: [] } })));
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.findAll('.server-item')).toHaveLength(0);
    expect(wrapper.text()).toContain('暂无已同步的服务器');
  });

  it('lists the agent-facing tools (执行 capability surface)', async () => {
    apiFetchMock.mockResolvedValue(ok(makeStatus()));
    const wrapper = mountView();
    await flushPromises();

    const tools = wrapper.findAll('.tool-item');
    expect(tools).toHaveLength(1);
    expect(wrapper.text()).toContain('webssh_probe_servers');
  });
});
