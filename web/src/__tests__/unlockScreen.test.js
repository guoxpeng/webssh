// @vitest-environment jsdom
// Regression tests for the unlock-screen bootstrap gap (cross-device unlock):
// when the cloud getVerify call is rejected (401/403/503) the screen must NOT
// offer the "set a new master password" form — that could silently overwrite
// the cloud verify hash. Instead it shows an auth gate with a backend
// connection config entry and an explicit local-only escape hatch.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { i18n } from '@/i18n';
import UnlockScreen from '@/components/global/UnlockScreen.vue';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('@/utils/api', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, apiFetch: apiFetchMock };
});

const ok = (data, status = 200) => ({ ok: true, status, json: async () => data });
const denied = (status = 401) => ({ ok: false, status, data: null });

function mountScreen() {
  return mount(UnlockScreen, { global: { plugins: [i18n] } });
}

function buttonByText(wrapper, text) {
  return wrapper.findAll('button').find((b) => b.text().includes(text));
}

async function settle(_wrapper) {
  await flushPromises();
  await nextTick();
}

describe('UnlockScreen cloud auth gate', () => {
  beforeEach(() => {
    // The app defaults to Chinese; pin the locale so string assertions are
    // deterministic regardless of the test host's navigator.language.
    i18n.global.locale.value = 'zh-CN';
    localStorage.clear();
    sessionStorage.clear();
    apiFetchMock.mockReset();
  });

  it('shows the auth gate (not the setup form) when getVerify is rejected', async () => {
    apiFetchMock.mockResolvedValue(denied(401));
    const wrapper = mountScreen();
    await settle(wrapper);

    expect(wrapper.find('.unlock-auth-gate').exists()).toBe(true);
    expect(wrapper.find('.unlock-form').exists()).toBe(false);
    expect(wrapper.text()).toContain('配置后端连接');
    expect(wrapper.text()).toContain('仍要仅在本机设置密码');
  });

  it('shows the normal setup form when the cloud has no master password', async () => {
    apiFetchMock.mockResolvedValue(ok({ exists: false }));
    const wrapper = mountScreen();
    await settle(wrapper);

    expect(wrapper.find('.unlock-auth-gate').exists()).toBe(false);
    expect(wrapper.find('.unlock-form').exists()).toBe(true);
    expect(wrapper.find('.unlock-title').text()).toContain('设置主密码');
  });

  it('switches to unlock mode when the cloud already has a verify hash', async () => {
    apiFetchMock.mockResolvedValue(ok({ exists: true, verifyKey: 'v2v1:cloudhash', salt: 'salt' }));
    const wrapper = mountScreen();
    await settle(wrapper);

    expect(wrapper.find('.unlock-form').exists()).toBe(true);
    expect(wrapper.find('.unlock-title').text()).toContain('输入主密码');
    // The pulled hash is stored locally for verifyMasterPassword to check.
    expect(localStorage.getItem('webssh_verify')).toBe('v2v1:cloudhash');
    expect(localStorage.getItem('webssh_verify_salt')).toBe('salt');
  });

  it('skips the cloud check when a local verify hash exists', async () => {
    localStorage.setItem('webssh_verify', 'v2v1:localhash');
    localStorage.setItem('webssh_verify_salt', 'localsalt');
    const wrapper = mountScreen();
    await settle(wrapper);

    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(wrapper.find('.unlock-title').text()).toContain('输入主密码');
  });

  it('escape hatch: explicit local-only setup still works from the auth gate', async () => {
    apiFetchMock.mockResolvedValue(denied(401));
    const wrapper = mountScreen();
    await settle(wrapper);

    await buttonByText(wrapper, '仍要仅在本机设置密码').trigger('click');
    await settle(wrapper);

    expect(wrapper.find('.unlock-form').exists()).toBe(true);
    expect(wrapper.find('.unlock-title').text()).toContain('设置主密码');
  });

  it('configuring the backend token re-checks the cloud and unlocks', async () => {
    apiFetchMock.mockResolvedValue(denied(401));
    const wrapper = mountScreen();
    await settle(wrapper);

    // Open the backend config box from the gate.
    await buttonByText(wrapper, '配置后端连接').trigger('click');
    await settle(wrapper);
    expect(wrapper.find('.unlock-backend-box').exists()).toBe(true);

    // Now the cloud is reachable and holds a verify hash.
    apiFetchMock.mockResolvedValue(ok({ exists: true, verifyKey: 'v2v1:cloudhash', salt: 'salt' }));

    await wrapper.find('input[placeholder*="AUTH_TOKEN"]').setValue('test-token-123');
    await buttonByText(wrapper, '保存并重新检测').trigger('click');
    await settle(wrapper);

    expect(localStorage.getItem('webssh_backend_token')).toBe('test-token-123');
    expect(wrapper.find('.unlock-form').exists()).toBe(true);
    expect(wrapper.find('.unlock-title').text()).toContain('输入主密码');
  });
});
