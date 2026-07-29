import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useConnectionStore } from '../stores/connectionStore.js';
import { SESSION_STORAGE_CRED_PREFIX } from '../utils/constants.js';

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
});
