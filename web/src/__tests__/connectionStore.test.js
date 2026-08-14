import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useConnectionStore, FAILED_GROUP } from '../stores/connectionStore.js';
import { SESSION_STORAGE_CRED_PREFIX, LOCAL_STORAGE_CONNECTIONS_KEY, LEGACY_CONNECTIONS_KEY } from '../utils/constants.js';

vi.mock('@/utils/cryptoService', () => ({
  encrypt: vi.fn((v) => Promise.resolve('encrypted_' + v)),
  decrypt: vi.fn((v) => {
    if (v.startsWith('encrypted_')) return Promise.resolve(v.slice(10));
    return Promise.resolve(v);
  }),
}));

describe('connectionStore - credential management', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setActivePinia(createPinia());
    sessionStorage.clear();
    localStorage.clear();
  });

  it('starts with no saved connections', () => {
    const store = useConnectionStore();
    expect(store.savedConnections).toHaveLength(0);
  });

  it('addConnection strips auth_value and rememberForSession', () => {
    const store = useConnectionStore();
    store.addConnection({ name: 'test', host: '10.0.0.1', auth_value: 'secret', rememberForSession: true });
    expect(store.savedConnections).toHaveLength(1);
    expect(store.savedConnections[0].auth_value).toBeUndefined();
    expect(store.savedConnections[0].rememberForSession).toBeUndefined();
    expect(store.savedConnections[0].host).toBe('10.0.0.1');
  });

  it('saveCredentialToSessionStorage stores encrypted credential', async () => {
    const store = useConnectionStore();
    await store.saveCredentialToSessionStorage('srv-1', 'password', 'my-pass');
    const raw = sessionStorage.getItem(SESSION_STORAGE_CRED_PREFIX + 'srv-1');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw);
    expect(parsed.auth_value).toBe('encrypted_my-pass');
    expect(parsed.auth_type).toBe('password');
  });

  it('getCredentialFromSessionStorage retrieves decrypted credential', async () => {
    const store = useConnectionStore();
    await store.saveCredentialToSessionStorage('srv-2', 'key', 'my-key-data');
    const cred = await store.getCredentialFromSessionStorage('srv-2');
    expect(cred).toBeTruthy();
    expect(cred.auth_type).toBe('key');
    expect(cred.auth_value).toBe('my-key-data');
  });

  it('getCredentialFromSessionStorage returns null for unknown id', async () => {
    const store = useConnectionStore();
    const cred = await store.getCredentialFromSessionStorage('nonexistent');
    expect(cred).toBeNull();
  });

  it('clearAllSessionCredentials removes all credentials', async () => {
    const store = useConnectionStore();
    await store.saveCredentialToSessionStorage('srv-3', 'password', 'secret');
    store.clearAllSessionCredentials();
    const cred = await store.getCredentialFromSessionStorage('srv-3');
    expect(cred).toBeNull();
  });

  it('loadCredentialsFromSessionStorage populates remembered credentials', async () => {
    sessionStorage.setItem(SESSION_STORAGE_CRED_PREFIX + 'srv-a', JSON.stringify({
      auth_type: 'password', auth_value: 'encrypted_val', encrypted: true,
    }));
    const store = useConnectionStore();
    await store.loadCredentialsFromSessionStorage();
    const cred = await store.getCredentialFromSessionStorage('srv-a');
    expect(cred).toBeTruthy();
  });

  it('migrates the legacy Chinese failed-group sentinel to the neutral value', () => {
    // Pre-seed persisted data written by an older build that used the literal
    // Chinese '未成功连接' as the FAILED_GROUP sentinel.
    localStorage.setItem(LOCAL_STORAGE_CONNECTIONS_KEY, JSON.stringify([
      { id: 'c1', name: 'legacy', host: '1.2.3.4', port: 22, username: 'root', group: '未成功连接' },
      { id: 'c2', name: 'normal', host: '5.6.7.8', port: 22, username: 'root', group: 'prod' },
    ]));

    const store = useConnectionStore();

    expect(store.savedConnections.find((c) => c.id === 'c1').group).toBe(FAILED_GROUP);
    expect(store.savedConnections.find((c) => c.id === 'c2').group).toBe('prod');
  });

  it('loads and migrates connections stored under the legacy key', () => {
    // Older builds persisted the list under the SESSION_STORAGE_-era key
    // value. It must still be readable, and the data moved to the new key
    // with the old key removed afterwards.
    localStorage.setItem(LEGACY_CONNECTIONS_KEY, JSON.stringify([
      { id: 'old-1', name: 'legacy-data', host: '9.9.9.9', port: 22, username: 'root' },
    ]));

    const store = useConnectionStore();

    expect(store.savedConnections).toHaveLength(1);
    expect(store.savedConnections[0].id).toBe('old-1');
    // Migrated in place: new key holds the data, legacy key removed.
    expect(JSON.parse(localStorage.getItem(LOCAL_STORAGE_CONNECTIONS_KEY))[0].id).toBe('old-1');
    expect(localStorage.getItem(LEGACY_CONNECTIONS_KEY)).toBeNull();
  });
});
