// @vitest-environment jsdom
// Regression tests for the SettingsPanel interactions fixed earlier:
//   - change master password: wrong current password is rejected, correct one
//     rotates the verify hash and the live session password
//   - theme presets are a computed over the i18n locale, so switching language
//     re-renders the theme labels (previously frozen at mount time)
//   - the local-model sync toggle pushes/clears the server-side registry
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import SettingsPanel from '@/components/global/SettingsPanel.vue';
import { useUiStore } from '@/stores/uiStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { setupMasterPassword, verifyMasterPassword } from '@/utils/crypto';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('@/utils/api', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, apiFetch: apiFetchMock };
});
vi.mock('@/services/sshWebSocketService', () => ({
  default: class { connect() {} disconnect() {} sendMessage() {} getReadyState() { return 3; } },
}));

const ok = (data, status = 200) => ({ ok: true, status, json: async () => data });

function mountPanel() {
  // The panel teleports its overlay to <body>; stubbing Teleport keeps the DOM
  // inside the wrapper so findAll() can reach it.
  return mount(SettingsPanel, { props: { visible: true }, global: { plugins: [i18n], stubs: { teleport: true } } });
}

function buttonByText(wrapper, text) {
  return wrapper.findAll('button').find((b) => b.text().includes(text));
}

function themeLabels(wrapper) {
  return wrapper.findAll('.theme-name').map((n) => n.text().trim());
}

function setInputValue(input, value) {
  // vue-test-utils setValue works on the input element directly.
  return input.setValue(value);
}

describe('SettingsPanel', () => {
  beforeEach(async () => {
    i18n.global.locale.value = 'zh-CN';
    setActivePinia(createPinia());
    localStorage.clear();
    sessionStorage.clear();
    // The app is reachable only after unlock, so the master session is present.
    sessionStorage.setItem('webssh_master', 'old-pw');
    await setupMasterPassword('old-pw');
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(ok({ success: true, synced: [] }));
  });

  describe('change master password', () => {
    it('rejects an incorrect current password and keeps the session password', async () => {
      const wrapper = mountPanel();
      const inputs = wrapper.findAll('.pw-change-form input:not([type=checkbox])');
      expect(inputs).toHaveLength(3);

      await setInputValue(inputs[0], 'WRONG-pw');
      await setInputValue(inputs[1], 'new-pw-1');
      await setInputValue(inputs[2], 'new-pw-1');

      await buttonByText(wrapper, '修改密码').trigger('click');
      await flushPromises();

      expect(sessionStorage.getItem('webssh_master')).toBe('old-pw');
      expect(await verifyMasterPassword('old-pw')).toBe(true);
      expect(await verifyMasterPassword('new-pw-1')).toBe(false);
      // The error is surfaced through the notification store.
      const ui = useUiStore();
      expect(ui.notifications.some((n) => n.message.includes('当前密码错误'))).toBe(true);
    });

    it('rotates the verify hash and session password on success', async () => {
      const wrapper = mountPanel();
      const inputs = wrapper.findAll('.pw-change-form input:not([type=checkbox])');

      await setInputValue(inputs[0], 'old-pw');
      await setInputValue(inputs[1], 'new-pw-1');
      await setInputValue(inputs[2], 'new-pw-1');

      await buttonByText(wrapper, '修改密码').trigger('click');
      await flushPromises();

      expect(sessionStorage.getItem('webssh_master')).toBe('new-pw-1');
      expect(await verifyMasterPassword('new-pw-1')).toBe(true);
      expect(await verifyMasterPassword('old-pw')).toBe(false);
      const ui = useUiStore();
      expect(ui.notifications.some((n) => n.message.includes('密码修改成功'))).toBe(true);
    });

    it('keeps the submit button disabled until current + matching new passwords are filled', async () => {
      const wrapper = mountPanel();
      const inputs = wrapper.findAll('.pw-change-form input:not([type=checkbox])');
      const btn = buttonByText(wrapper, '修改密码');
      expect(btn.attributes('disabled')).toBeDefined();

      await setInputValue(inputs[0], 'old-pw');
      await setInputValue(inputs[1], 'new-pw-1');
      await setInputValue(inputs[2], 'different');
      expect(buttonByText(wrapper, '修改密码').attributes('disabled')).toBeDefined();

      await setInputValue(inputs[2], 'new-pw-1');
      expect(buttonByText(wrapper, '修改密码').attributes('disabled')).toBeUndefined();
    });
  });

  describe('theme preset reactivity', () => {
    it('renders localized theme labels and re-renders them after a locale switch', async () => {
      const wrapper = mountPanel();
      expect(themeLabels(wrapper)).toEqual(['浅色', '深色', '德拉库拉', '北欧']);

      // The earlier bug froze labels at mount time; switching locale must update
      // them because themes is a computed over t().
      i18n.global.locale.value = 'en-US';
      await nextTick();
      expect(themeLabels(wrapper)).toEqual(['Light', 'Dark', 'Dracula', 'Nord']);
    });

    it('applying a preset updates the ui store current preset', async () => {
      const wrapper = mountPanel();
      const ui = useUiStore();

      await wrapper.findAll('.theme-card').find((c) => c.text().includes('德拉库拉')).trigger('click');
      await flushPromises();

      expect(ui.currentPreset).toBe('dracula');
      expect(localStorage.getItem('appThemePreset')).toBe('dracula');
    });
  });

  describe('local model sync toggle', () => {
    it('enabling sync persists the flag and pushes servers to the backend', async () => {
      const wrapper = mountPanel();
      const connStore = useConnectionStore();
      // One saved SSH connection with a remembered credential to sync up.
      connStore.addConnection({ id: 'c1', name: 'prod', host: 'example.com', port: 22, username: 'root', auth_type: 'password', protocol: 'ssh' });
      await connStore.saveCredentialToSessionStorage('c1', 'password', 'secret');

      apiFetchMock.mockResolvedValue(ok({ success: true, synced: [{ id: 'c1' }] }));
      const toggle = wrapper.findAll('.switch').find((s) => s.attributes('aria-label') === '允许本地模型操控');
      expect(toggle).toBeTruthy();
      expect(toggle.classes()).not.toContain('is-active');

      await toggle.trigger('click');
      await flushPromises();

      expect(localStorage.getItem('webssh_model_sync')).toBe('true');
      const syncCall = apiFetchMock.mock.calls.find(([url]) => String(url).includes('/model/servers/sync'));
      expect(syncCall).toBeTruthy();
      expect(JSON.parse(syncCall[1].body).servers).toMatchObject([{ host: 'example.com', username: 'root' }]);
    });

    it('disabling sync clears the server-side registry', async () => {
      localStorage.setItem('webssh_model_sync', 'true');
      const wrapper = mountPanel();
      apiFetchMock.mockResolvedValue(ok({ success: true }));

      const toggle = wrapper.findAll('.switch').find((s) => s.attributes('aria-label') === '允许本地模型操控');
      expect(toggle.classes()).toContain('is-active');

      await toggle.trigger('click');
      await flushPromises();

      expect(localStorage.getItem('webssh_model_sync')).toBeNull();
      const clearCall = apiFetchMock.mock.calls.find(([url]) => String(url).includes('/model/servers/sync'));
      expect(clearCall).toBeTruthy();
      expect(JSON.parse(clearCall[1].body).servers).toEqual([]);
    });
  });
});
