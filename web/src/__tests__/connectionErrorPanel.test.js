// @vitest-environment jsdom
// Locks the error classifier in ConnectionErrorPanel: it matches server error
// text against keyword lists sourced from the locale files (both English and
// Chinese synonyms). ASCII keywords are matched as WHOLE WORDS (word
// boundaries) and CJK keywords as substrings, so coverage is case-insensitive
// and generic tokens like "key" do not false-match inside "monkey"/"keyboard".
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import ConnectionErrorPanel from '@/components/terminal/ConnectionErrorPanel.vue';

function suggestions(message, locale = 'en-US') {
  i18n.global.locale.value = locale;
  const wrapper = mount(ConnectionErrorPanel, {
    props: { message },
    global: { plugins: [i18n], stubs: { teleport: true } },
  });
  return wrapper.findAll('.suggestion-item').map((s) => s.text().trim());
}

// First suggestion of each category, used as a category fingerprint.
const CAT = {
  en: {
    refused: 'Check if the service is running on the remote host',
    auth: 'Verify your username and password',
    timeout: 'Check if the host is reachable',
    dns: 'Check if the hostname resolves correctly',
    key: 'Check if the key format is correct (PEM format required)',
    general: 'Verify the connection details are correct',
  },
  zh: {
    refused: '检查远程主机上的服务是否正在运行',
    auth: '验证用户名和密码是否正确',
    timeout: '检查主机是否可达',
    dns: '检查主机名解析是否正确',
    key: '检查密钥格式是否正确（需要 PEM 格式）',
    general: '验证连接信息是否正确',
  },
};

function expectCategory(message, category, locale = 'en') {
  const list = suggestions(message, locale === 'en' ? 'en-US' : 'zh-CN');
  expect(list[0]).toBe(CAT[locale][category]);
}

describe('ConnectionErrorPanel suggestions', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('case insensitivity', () => {
    it('classifies upper- and mixed-case messages the same as lowercase', () => {
      expectCategory('CONNECTION REFUSED', 'refused');
      expectCategory('connect ECONNREFUSED 10.0.0.1:22', 'refused');
      expectCategory('Permission Denied (Publickey)', 'auth');
      expectCategory('connect ETIMEDOUT 10.0.0.1:22', 'timeout');
      expectCategory('GETADDRINFO ENOTFOUND example.com', 'dns');
      expectCategory('connect ENETUNREACH 10.0.0.1:22', 'timeout');
    });
  });

  describe('expanded corpus', () => {
    it('classifies real-world SSH/library error text', () => {
      expectCategory('All configured authentication methods failed', 'auth');
      expectCategory('no matching key exchange method found', 'key');
      expectCategory('Could not resolve hostname example.com', 'dns');
      expectCategory('Encrypted private key detected, but no passphrase given', 'key');
      expectCategory('Network is unreachable', 'timeout');
      expectCategory('Host unreachable', 'timeout');
      expectCategory('Timed out while waiting for handshake', 'timeout');
      expectCategory('getaddrinfo EAI_AGAIN', 'dns');
    });

    it('classifies Chinese error text via the CJK keywords', () => {
      expectCategory('连接超时', 'timeout', 'zh');
      expectCategory('认证失败，请核对用户名和密码', 'auth', 'zh');
      expectCategory('私钥格式不正确', 'key', 'zh');
      expectCategory('网络不可达', 'timeout', 'zh');
      expectCategory('无法解析主机名', 'dns', 'zh');
    });
  });

  describe('word-boundary false-match guards', () => {
    it('does not treat "key" inside a longer word as a key error', () => {
      expectCategory('keyboard shortcut error', 'general');
      expectCategory('the monkey wrench broke', 'general');
      expectCategory('donkey kong is not a server', 'general');
    });

    it('does not treat "auth" inside "author" as an auth error', () => {
      expectCategory('author of the change', 'general');
    });

    it('still matches "key"/"keys" as standalone words', () => {
      expectCategory('private key is invalid', 'key');
      expectCategory('encryption keys mismatch', 'key');
    });
  });

  it('falls back to general suggestions for an unrecognized message', () => {
    expectCategory('something entirely unexpected', 'general');
  });
});
