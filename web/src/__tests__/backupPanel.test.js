// @vitest-environment jsdom
// Regression tests for the BackupPanel component (UI layer on top of the
// store-level backupStore.test.js):
//   - empty state
//   - the create modal defaults to master-password encryption
//   - creating a backup requires the master password (or matching custom pw)
//   - a successful create lands in the list; deleting removes it
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import BackupPanel from '@/components/backup/BackupPanel.vue';
import { useBackupStore } from '@/stores/backupStore';

const { apiFetchMock, encryptMock, decryptMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  encryptMock: vi.fn(),
  decryptMock: vi.fn(),
}));
vi.mock('@/utils/api', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, apiFetch: apiFetchMock };
});
vi.mock('@/services/sshWebSocketService', () => ({
  default: class { connect() {} disconnect() {} sendMessage() {} getReadyState() { return 3; } },
}));
// Crypto round-trips are covered by crypto.test.js + backupStore.test.js with
// real WebCrypto; the panel test only verifies UI wiring, so make encryption
// instant and deterministic (the 100k-iteration PBKDF2 would otherwise leave a
// pending promise that outlives `flushPromises` and leaks into the next test).
vi.mock('@/utils/crypto', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    encryptBackupData: encryptMock,
    decryptBackupData: decryptMock,
  };
});

const ok = (data, status = 200) => ({ ok: true, status, json: async () => data });

function mountPanel() {
  return mount(BackupPanel, { global: { plugins: [i18n], stubs: { teleport: true } } });
}

function buttonByText(wrapper, text) {
  return wrapper.findAll('button').find((b) => b.text().includes(text));
}

function inputByPlaceholder(wrapper, ph) {
  return wrapper.find(`input[placeholder*="${ph}"]`);
}

describe('BackupPanel', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'zh-CN';
    setActivePinia(createPinia());
    localStorage.clear();
    sessionStorage.clear();
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(ok({ backups: [] }));
    encryptMock.mockReset();
    encryptMock.mockImplementation(async (data, pw) => `v2aes:enc(${JSON.stringify(data).length}:${pw})`);
    decryptMock.mockReset();
    decryptMock.mockImplementation(async (_ciphertext, _pw) => ({ data: {}, checksum: 'mock', version: 2 }));
    // The export path builds a Blob URL + clicks an anchor; jsdom lacks these.
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  it('shows the empty state when there are no backups', () => {
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain('还没有备份');
    expect(wrapper.findAll('.backup-item')).toHaveLength(0);
  });

  it('opens the create modal with master-password encryption defaulted on', async () => {
    const wrapper = mountPanel();
    await buttonByText(wrapper, '新建').trigger('click');

    expect(wrapper.find('.modal-body').exists()).toBe(true);
    const masterToggle = wrapper.find('.masterpw-toggle input');
    expect(masterToggle.element.checked).toBe(true);
  });

  it('requires the master password before creating a master-keyed backup', async () => {
    const wrapper = mountPanel();
    await buttonByText(wrapper, '新建').trigger('click');

    // No webssh_master in sessionStorage → the master password is unavailable.
    await buttonByText(wrapper, '确认').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('请输入备份密码');
    expect(useBackupStore().backups).toHaveLength(0);
  });

  it('creates a master-keyed backup and lists it when unlocked', async () => {
    sessionStorage.setItem('webssh_master', 'master-pw');
    const wrapper = mountPanel();
    await buttonByText(wrapper, '新建').trigger('click');

    await inputByPlaceholder(wrapper, '备份名称').setValue('nightly');
    await buttonByText(wrapper, '确认').trigger('click');
    await flushPromises();

    const store = useBackupStore();
    expect(store.backups).toHaveLength(1);
    expect(store.backups[0].label).toBe('nightly');
    expect(wrapper.findAll('.backup-item')).toHaveLength(1);
    expect(wrapper.text()).toContain('nightly');
  });

  it('rejects mismatched custom passwords', async () => {
    const wrapper = mountPanel();
    await buttonByText(wrapper, '新建').trigger('click');

    // Turn off master-password encryption and type mismatched passwords.
    await wrapper.find('.masterpw-toggle input').setValue(false);
    await inputByPlaceholder(wrapper, '设置备份密码').setValue('pw-one');
    await inputByPlaceholder(wrapper, '确认密码').setValue('pw-two');
    await buttonByText(wrapper, '确认').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('两次密码输入不一致');
    expect(useBackupStore().backups).toHaveLength(0);
  });

  it('deletes a backup from the list', async () => {
    sessionStorage.setItem('webssh_master', 'master-pw');
    const store = useBackupStore();
    await store.createBackup('to-delete', 'master-pw');
    expect(store.backups).toHaveLength(1);

    const wrapper = mountPanel();
    expect(wrapper.findAll('.backup-item')).toHaveLength(1);
    await wrapper.find('.bak-btn.is-danger').trigger('click');
    await flushPromises();

    expect(store.backups).toHaveLength(0);
    expect(wrapper.text()).toContain('还没有备份');
  });
});
