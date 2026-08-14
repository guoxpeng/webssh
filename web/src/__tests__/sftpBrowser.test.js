// @vitest-environment jsdom
// Regression tests for the SftpBrowser component flow:
//   - connects on mount with nodeConfig credentials
//   - falls back to session-storage, then localStorage credentials
//   - shows the retry button without connecting when no credential exists
//   - a failed connect surfaces a friendly error and the retry reconnects
//   - switching hosts disconnects + reconnects; same-host prop changes don't
// Guards the two earlier fixes (credential fallback + retry affordance, and
// the host-switch reconnect that used to mis-fire refresh on a dead socket).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import SftpBrowser from '@/components/sftp/SftpBrowser.vue';
import { useConnectionStore } from '@/stores/connectionStore';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('@/utils/api', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, apiFetch: apiFetchMock };
});
vi.mock('@/services/sshWebSocketService', () => ({
  default: class { connect() {} disconnect() {} sendMessage() {} getReadyState() { return 3; } },
}));

const { sftpMock } = vi.hoisted(() => ({
  sftpMock: { connect: vi.fn(), disconnect: vi.fn(), send: vi.fn(), connected: false, error: '' },
}));
vi.mock('@/services/sftpWsService', () => ({ default: class { constructor() { return sftpMock; } } }));

const ok = (data) => ({ ok: true, status: 200, json: async () => data });

let mountedWrappers = [];
function mountBrowser(nodeConfig) {
  const wrapper = mount(SftpBrowser, { props: { nodeConfig }, global: { plugins: [i18n] } });
  mountedWrappers.push(wrapper);
  return wrapper;
}

function capturedConnect() {
  return sftpMock.connect.mock.calls.map(([auth, cbs]) => ({ auth, cbs }));
}

const FULL = {
  id: 's1', name: 'prod', host: 'example.com', port: 22,
  username: 'root', auth_type: 'password', auth_value: 'secret',
};

describe('SftpBrowser connection flow', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'zh-CN';
    setActivePinia(createPinia());
    localStorage.clear();
    sessionStorage.clear();
    // The app is only reachable after unlock, so webssh_master is always present
    // in real usage; onStatus('connected') persists the credential through it.
    sessionStorage.setItem('webssh_master', 'pw');
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(ok({ exists: false }));
    sftpMock.connect.mockReset();
    sftpMock.disconnect.mockReset();
    sftpMock.send.mockReset();
    sftpMock.send.mockResolvedValue({ entries: [] });
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    // Unmount every component created in this test. connectServer() awaits
    // credential decryption (WebCrypto), so a leaked instance could otherwise
    // finish its async chain in a LATER test and fire stale connect() calls.
    for (const w of mountedWrappers) w.unmount();
    mountedWrappers = [];
  });

  it('mounts and connects with the nodeConfig credentials', async () => {
    mountBrowser(FULL);
    await flushPromises();

    const calls = capturedConnect();
    expect(calls).toHaveLength(1);
    expect(calls[0].auth).toMatchObject({
      host: 'example.com', port: 22, username: 'root', auth_value: 'secret',
    });
  });

  it('lists the root directory once connected', async () => {
    sftpMock.send.mockResolvedValue({
      entries: [{ name: 'etc', type: 'dir' }, { name: 'hosts', type: 'file', size: 512 }],
    });
    const wrapper = mountBrowser(FULL);
    await flushPromises();
    capturedConnect()[0].cbs.onStatus('connected');
    await flushPromises();

    expect(sftpMock.send).toHaveBeenCalledWith('list', { path: '/' });
    expect(wrapper.findAll('.sftp-item')).toHaveLength(2);
  });

  it('falls back to the session-storage credential when the config has none', async () => {
    sessionStorage.setItem('webssh_master', 'pw');
    const connStore = useConnectionStore();
    await connStore.saveCredentialToSessionStorage('s1', 'password', 'ses-secret');

    mountBrowser({ id: 's1', name: 'prod', host: 'example.com', port: 22, username: 'root' });
    await flushPromises();

    expect(capturedConnect()[0].auth.auth_value).toBe('ses-secret');
  });

  it('falls back to the localStorage credential when session storage is empty', async () => {
    sessionStorage.setItem('webssh_master', 'pw');
    const connStore = useConnectionStore();
    await connStore.saveCredentialToLocalStorage('s1', 'password', 'loc-secret');

    mountBrowser({ id: 's1', name: 'prod', host: 'example.com', port: 22, username: 'root' });
    // Credential decryption is a real WebCrypto operation — give the async
    // chain a moment beyond plain microtask flushing.
    await flushPromises();
    await new Promise((r) => setTimeout(r, 100));
    await flushPromises();

    expect(capturedConnect()[0].auth.auth_value).toBe('loc-secret');
  });

  it('shows the retry button without connecting when no credential exists, and connects after it appears', async () => {
    const wrapper = mountBrowser({ id: 's1', name: 'prod', host: 'example.com', port: 22, username: 'root' });
    await flushPromises();

    expect(sftpMock.connect).not.toHaveBeenCalled();
    expect(wrapper.find('.sftp-error').exists()).toBe(true);
    expect(wrapper.find('.sftp-retry-btn').exists()).toBe(true);

    // Seed a credential, then retry.
    sessionStorage.setItem('webssh_master', 'pw');
    const connStore = useConnectionStore();
    await connStore.saveCredentialToSessionStorage('s1', 'password', 'later-secret');
    await wrapper.find('.sftp-retry-btn').trigger('click');
    await flushPromises();

    expect(sftpMock.connect).toHaveBeenCalledTimes(1);
    expect(capturedConnect()[0].auth.auth_value).toBe('later-secret');
  });

  it('reports a friendly error and retries the connection on button click', async () => {
    const wrapper = mountBrowser(FULL);
    await flushPromises();
    capturedConnect()[0].cbs.onStatus('error', 'ECONNREFUSED: connection refused');
    await flushPromises();

    expect(wrapper.find('.sftp-error').exists()).toBe(true);
    expect(wrapper.text()).toContain('连接被拒绝');

    await wrapper.find('.sftp-retry-btn').trigger('click');
    await flushPromises();
    expect(sftpMock.connect).toHaveBeenCalledTimes(2);
  });

  it('reconnects when the host changes and ignores same-host prop changes', async () => {
    const wrapper = mountBrowser(FULL);
    await flushPromises();
    expect(sftpMock.connect).toHaveBeenCalledTimes(1);

    await wrapper.setProps({ nodeConfig: { ...FULL, host: 'other.example.com' } });
    await flushPromises();
    expect(sftpMock.disconnect).toHaveBeenCalled();
    expect(sftpMock.connect).toHaveBeenCalledTimes(2);
    expect(capturedConnect()[1].auth.host).toBe('other.example.com');

    // Same host/port/user — only the label changed → no reconnect.
    await wrapper.setProps({ nodeConfig: { ...FULL, host: 'other.example.com', name: 'renamed' } });
    await flushPromises();
    expect(sftpMock.connect).toHaveBeenCalledTimes(2);
  });
});
