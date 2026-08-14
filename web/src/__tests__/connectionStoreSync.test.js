// @vitest-environment jsdom
// Regression tests for connectionStore's server-side (Cloudflare R2) sync:
//   - probeCloudConnections() hydrates a fresh origin from getConnections
//   - every add/edit/delete queues a debounced saveConnections push (800ms)
//   - rapid mutations coalesce into a single push
//   - payloads are metadata-only — auth_value / rememberForSession never leave
//   - backends without /api/cloud/backup degrade silently (no push, no crash)
// A future refactor that breaks the debounce, the hydrate-on-empty rule, or
// the credential stripping fails here instead of on a deployed site.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useConnectionStore } from '@/stores/connectionStore';
import { LOCAL_STORAGE_CONNECTIONS_KEY, LEGACY_CONNECTIONS_KEY } from '@/utils/constants';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('@/utils/api', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, apiFetch: apiFetchMock };
});

// The store constructs an SshWebSocketService at creation — jsdom has no WS.
vi.mock('@/services/sshWebSocketService', () => ({
  default: class {
    connect() {}
    disconnect() {}
    sendMessage() {}
    getReadyState() { return 3; }
  },
}));

const ok = (data, status = 200) => ({ ok: true, status, json: async () => data });
const failed = (status = 404) => ({ ok: false, status, json: async () => ({}) });

function callsForAction(action) {
  return apiFetchMock.mock.calls.filter(([, opts]) => {
    try { return JSON.parse(opts?.body).action === action; } catch { return false; }
  });
}

function lastPushPayload(action) {
  const calls = callsForAction(action);
  return calls.length ? JSON.parse(calls[calls.length - 1][1].body) : null;
}

const AUTH_LADEN = {
  name: 'prod', host: '10.0.0.1', port: 22, username: 'root',
  auth_value: 'super-secret', auth_type: 'password', rememberForSession: true,
};

describe('connectionStore R2 auto-sync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    localStorage.clear();
    sessionStorage.clear();
    apiFetchMock.mockReset();
    // Default cloud state: backend reachable, empty bucket.
    apiFetchMock.mockResolvedValue(ok({ exists: false }));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('hydrates a fresh origin from R2 on init (metadata only)', async () => {
    apiFetchMock.mockResolvedValue(ok({
      exists: true,
      connections: [{ id: 'c1', name: 'A', host: 'example.com', port: 22, username: 'u', auth_value: 'should-not-survive' }],
      groupOrder: ['g1'],
      groupCollapsed: ['g1'],
    }));
    const store = useConnectionStore();
    await flushPromises();

    expect(store.savedConnections).toHaveLength(1);
    expect(store.savedConnections[0].id).toBe('c1');
    expect(store.savedConnections[0].auth_value).toBeUndefined();
    expect(store.groupOrder).toEqual(['g1']);
    expect(store.groupCollapsed.has('g1')).toBe(true);
    // Persisted locally so the next reload doesn't need the cloud.
    expect(JSON.parse(localStorage.getItem(LOCAL_STORAGE_CONNECTIONS_KEY))[0].id).toBe('c1');
  });

  it('does NOT overwrite existing local data with the cloud copy (local wins)', async () => {
    localStorage.setItem(LOCAL_STORAGE_CONNECTIONS_KEY, JSON.stringify([{ id: 'local', name: 'L', host: 'h', port: 22, username: 'u' }]));
    apiFetchMock.mockResolvedValue(ok({
      exists: true,
      connections: [{ id: 'cloud', name: 'C', host: 'c', port: 22, username: 'u' }],
    }));
    const store = useConnectionStore();
    await flushPromises();

    expect(store.savedConnections.map((c) => c.id)).toEqual(['local']);
  });

  it('legacy-key data is migrated to the new key and WINS over the cloud copy', async () => {
    // Older build persisted under the legacy key; the cloud bucket already has
    // a (different) copy. The migrated local data must win — the hydrate
    // branch only fires when the LOCAL list is empty, and migration fills it
    // before the probe settles.
    localStorage.setItem(LEGACY_CONNECTIONS_KEY, JSON.stringify([
      { id: 'legacy-local', name: 'Local from old build', host: '1.2.3.4', port: 22, username: 'root' },
    ]));
    apiFetchMock.mockResolvedValue(ok({
      exists: true,
      connections: [{ id: 'cloud', name: 'C', host: 'c', port: 22, username: 'u' }],
    }));

    const store = useConnectionStore();
    await flushPromises();

    // Local (migrated) data survives; the cloud copy is NOT hydrated over it.
    expect(store.savedConnections.map((c) => c.id)).toEqual(['legacy-local']);
    // Migration wrote the new key and removed the legacy one.
    expect(localStorage.getItem(LEGACY_CONNECTIONS_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(LOCAL_STORAGE_CONNECTIONS_KEY)).map((c) => c.id)).toEqual(['legacy-local']);
  });

  it('the migrated new key stays authoritative on a re-probe (backend config change)', async () => {
    localStorage.setItem(LEGACY_CONNECTIONS_KEY, JSON.stringify([
      { id: 'legacy-local', name: 'Local', host: '1.2.3.4', port: 22, username: 'root' },
    ]));
    apiFetchMock.mockResolvedValue(ok({
      exists: true,
      connections: [{ id: 'cloud', name: 'C', host: 'c', port: 22, username: 'u' }],
    }));

    const store = useConnectionStore();
    await flushPromises();
    expect(store.savedConnections.map((c) => c.id)).toEqual(['legacy-local']);

    // Re-probe (e.g. the user edits the backend URL in Settings) — the
    // migrated local list still wins over the cloud copy.
    window.dispatchEvent(new CustomEvent('backend-config-changed'));
    await flushPromises();
    expect(store.savedConnections.map((c) => c.id)).toEqual(['legacy-local']);
    expect(JSON.parse(localStorage.getItem(LOCAL_STORAGE_CONNECTIONS_KEY)).map((c) => c.id)).toEqual(['legacy-local']);
  });

  it('a mutation after legacy migration pushes the LOCAL list, never the cloud copy', async () => {
    localStorage.setItem(LEGACY_CONNECTIONS_KEY, JSON.stringify([
      { id: 'legacy-local', name: 'Local', host: '1.2.3.4', port: 22, username: 'root' },
    ]));
    apiFetchMock.mockResolvedValue(ok({
      exists: true,
      connections: [{ id: 'cloud', name: 'C', host: 'c', port: 22, username: 'u' }],
    }));

    const store = useConnectionStore();
    await flushPromises();

    store.addConnection({ ...AUTH_LADEN, name: 'new', host: '10.0.0.9' });
    await vi.advanceTimersByTimeAsync(800);

    const payload = lastPushPayload('saveConnections');
    const ids = payload.connections.map((c) => c.id);
    // Migrated local data is pushed up alongside the new entry; the cloud
    // copy is never adopted locally, so it never appears in the push.
    expect(ids).toContain('legacy-local');
    expect(ids).not.toContain('cloud');
  });

  it('addConnection pushes after the 800ms debounce, credentials stripped', async () => {
    const store = useConnectionStore();
    await flushPromises(); // init probe settles
    expect(callsForAction('getConnections')).toHaveLength(1);

    store.addConnection({ ...AUTH_LADEN });
    // Saved locally without the secret.
    expect(store.savedConnections[0].auth_value).toBeUndefined();
    expect(store.savedConnections[0].rememberForSession).toBeUndefined();

    await vi.advanceTimersByTimeAsync(799);
    expect(callsForAction('saveConnections')).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(callsForAction('saveConnections')).toHaveLength(1);

    const payload = lastPushPayload('saveConnections');
    expect(payload.connections).toHaveLength(1);
    const pushed = payload.connections[0];
    expect(pushed.name).toBe('prod');
    expect(pushed.host).toBe('10.0.0.1');
    expect(pushed.auth_value).toBeUndefined();
    expect(pushed.rememberForSession).toBeUndefined();
  });

  it('editing an existing connection pushes the updated list', async () => {
    const store = useConnectionStore();
    await flushPromises();

    store.addConnection({ ...AUTH_LADEN });
    await vi.advanceTimersByTimeAsync(800);

    store.addConnection({ ...AUTH_LADEN, name: 'prod', host: '10.0.0.2' });
    await vi.advanceTimersByTimeAsync(800);

    const payload = lastPushPayload('saveConnections');
    expect(payload.connections).toHaveLength(1);
    expect(payload.connections[0].host).toBe('10.0.0.2');
  });

  it('removing a connection pushes the remaining list', async () => {
    const store = useConnectionStore();
    await flushPromises();

    const a = store.addConnection({ ...AUTH_LADEN });
    const b = store.addConnection({ ...AUTH_LADEN, name: 'dev', host: '10.0.0.3' });
    await vi.advanceTimersByTimeAsync(800);

    store.removeConnection(b.id);
    await vi.advanceTimersByTimeAsync(800);

    const payload = lastPushPayload('saveConnections');
    expect(payload.connections.map((c) => c.id)).toEqual([a.id]);
  });

  it('rapid mutations coalesce into a single push', async () => {
    const store = useConnectionStore();
    await flushPromises();

    store.addConnection({ ...AUTH_LADEN });
    store.addConnection({ ...AUTH_LADEN, name: 'dev', host: '10.0.0.3' });
    store.addConnection({ ...AUTH_LADEN, name: 'staging', host: '10.0.0.4' });
    await vi.advanceTimersByTimeAsync(800);

    expect(callsForAction('saveConnections')).toHaveLength(1);
    expect(lastPushPayload('saveConnections').connections).toHaveLength(3);
  });

  it('disables sync silently when the backend has no /api/cloud/backup', async () => {
    apiFetchMock.mockResolvedValue(failed(404));
    const store = useConnectionStore();
    await flushPromises();

    store.addConnection({ ...AUTH_LADEN });
    await vi.advanceTimersByTimeAsync(800);

    expect(callsForAction('saveConnections')).toHaveLength(0);
    // Local saving still works.
    expect(store.savedConnections).toHaveLength(1);
  });

  it('re-probes getConnections when the backend config changes', async () => {
    useConnectionStore();
    await flushPromises();
    const before = callsForAction('getConnections').length;

    window.dispatchEvent(new CustomEvent('backend-config-changed'));
    await flushPromises();

    expect(callsForAction('getConnections').length).toBeGreaterThan(before);
  });
});
