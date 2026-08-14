// @vitest-environment jsdom
// Regression tests for backupStore: encrypted backup create/restore round-trip,
// cross-context (HTTP-created XOR → HTTPS restore) recovery, and the R2 cloud
// list/upload/download actions. Guards the store layer on top of crypto.test.js
// (which owns the scheme-marker mechanics).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useBackupStore } from '@/stores/backupStore';
import { useConnectionStore } from '@/stores/connectionStore';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('@/utils/api', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, apiFetch: apiFetchMock };
});

// connectionStore constructs an SshWebSocketService at creation — jsdom has no WS.
vi.mock('@/services/sshWebSocketService', () => ({
  default: class {
    connect() {}
    disconnect() {}
    sendMessage() {}
    getReadyState() { return 3; }
  },
}));

const PASSWORD = 'backup-pass-42';
const ok = (data, status = 200) => ({ ok: true, status, json: async () => data });

function callsForAction(action) {
  return apiFetchMock.mock.calls.filter(([, opts]) => {
    try { return JSON.parse(opts?.body).action === action; } catch { return false; }
  });
}

function seedOneConnection() {
  const connStore = useConnectionStore();
  return connStore.addConnection({
    name: 'prod', host: '10.0.0.1', port: 22, username: 'root',
    auth_value: 'secret', auth_type: 'password',
  });
}

describe('backupStore create/restore + cloud sync', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    sessionStorage.clear();
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(ok({ backups: [] }));
  });

  it('creates an encrypted backup locally and decrypts it back', async () => {
    seedOneConnection();
    const store = useBackupStore();
    const entry = await store.createBackup('test backup', PASSWORD);

    expect(store.backups).toHaveLength(1);
    expect(entry.encryptedPayload).toBeTruthy();
    expect(entry.encryptedPayload.startsWith('v2aes:')).toBe(true);
    expect(entry.inventory.connectionCount).toBe(1);

    const data = await store.decryptBackup(entry.id, PASSWORD);
    expect(data.connections).toHaveLength(1);
    expect(data.connections[0].name).toBe('prod');

    expect(await store.decryptBackup(entry.id, 'wrong-password')).toBeNull();
  });

  it('restores an exported encrypted payload into fresh stores (cross-device)', async () => {
    seedOneConnection();
    const store = useBackupStore();
    const entry = await store.createBackup('exported', PASSWORD);
    const exported = JSON.parse(store.exportBackup(entry.id));

    // A "new device": fresh pinia AND empty storage (connectionStore reloads
    // from localStorage on creation, which would otherwise look already-restored).
    setActivePinia(createPinia());
    localStorage.clear();
    sessionStorage.clear();
    const fresh = useBackupStore();
    const result = await fresh.restoreFromCiphertext(exported.encryptedPayload, PASSWORD);

    expect(result.error).toBeUndefined();
    expect(result.restored).toBe(1);
    expect(useConnectionStore().savedConnections.map((c) => c.name)).toContain('prod');
  });

  it('restoreBackup reports wrongPassword for a bad password', async () => {
    const store = useBackupStore();
    await store.createBackup('x', PASSWORD);
    const entry = store.backups[0];
    const result = await store.restoreBackup(entry.id, 'nope');
    expect(result.error).toBe('wrongPassword');
    expect(result.restored).toBe(0);
  });

  it('lists cloud backups only when cloud sync is enabled', async () => {
    apiFetchMock.mockResolvedValue(ok({
      backups: [{ id: 'c1', label: 'cloud-a', createdAt: 1, size: 10, inventory: { connectionCount: 2, snippetCount: 0, macroCount: 0, codeNoteCount: 0, hasPassword: true } }],
    }));
    const store = useBackupStore();

    expect(await store.listCloudBackups()).toBe(false);
    expect(callsForAction('list')).toHaveLength(0);

    store.updateCloud({ enabled: true });
    expect(await store.listCloudBackups()).toBe(true);
    expect(store.cloudBackups).toHaveLength(1);
    expect(store.cloudBackups[0].id).toBe('c1');
  });

  it('auto-uploads a fresh encrypted backup when cloud autoSync is on', async () => {
    apiFetchMock.mockResolvedValue(ok({ ok: true }));
    const store = useBackupStore();
    store.updateCloud({ enabled: true, autoSync: true });
    seedOneConnection();

    const entry = await store.createBackup('auto', PASSWORD);
    await flushPromises(); // auto-upload is fire-and-forget

    const uploads = callsForAction('upload');
    expect(uploads).toHaveLength(1);
    const payload = JSON.parse(uploads[0][1].body);
    expect(payload.backup.id).toBe(entry.id);
    expect(payload.backup.encryptedPayload.startsWith('v2aes:')).toBe(true);
  });

  it('downloads a full backup from the cloud and imports it locally', async () => {
    // Cloud stores the whole entry (encryptedPayload included), so the
    // download can be imported and later restored with the master password.
    const cloudEntry = {
      id: 'c1', label: 'cloud-a', createdAt: 1, size: 10, version: 3,
      inventory: { connectionCount: 0, snippetCount: 0, macroCount: 0, codeNoteCount: 0, hasPassword: true },
      encryptedPayload: 'v2aes:fake-encrypted',
    };
    apiFetchMock.mockResolvedValue(ok(cloudEntry));
    const store = useBackupStore();
    store.updateCloud({ enabled: true });

    expect(await store.downloadFromCloud('c1')).toBe(true);
    expect(store.backups).toHaveLength(1);
    expect(store.backups[0].id).not.toBe('c1'); // re-id'd locally
    expect(store.backups[0].label).toBe('cloud-a');
  });

  it('restores a backup created on an insecure (HTTP) context from a secure one', async () => {
    seedOneConnection();
    const realCrypto = globalThis.crypto;
    const random = realCrypto.getRandomValues.bind(realCrypto);
    // HTTP device: no WebCrypto → backup is created with the XOR scheme.
    vi.stubGlobal('crypto', { getRandomValues: random });
    let xorPayload;
    try {
      const store = useBackupStore();
      const entry = await store.createBackup('http-created', PASSWORD);
      xorPayload = entry.encryptedPayload;
    } finally {
      vi.stubGlobal('crypto', realCrypto);
    }
    expect(xorPayload.startsWith('v2xor:')).toBe(true);

    // Secure device (restored WebCrypto) must restore it with the same password.
    setActivePinia(createPinia());
    localStorage.clear();
    sessionStorage.clear();
    const fresh = useBackupStore();
    const result = await fresh.restoreFromCiphertext(xorPayload, PASSWORD);
    expect(result.error).toBeUndefined();
    expect(result.restored).toBe(1);
    expect(useConnectionStore().savedConnections.map((c) => c.name)).toContain('prod');
  });
});
