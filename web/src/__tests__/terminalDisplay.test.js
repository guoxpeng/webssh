// @vitest-environment jsdom
// Regression test for the wake-lock scope bug: acquireWakeLock / releaseWakeLock /
// onVisibilityForWake used to be declared *inside* initializeTerminal, so the
// module-scope onBeforeUnmount hook threw `ReferenceError: onVisibilityForWake
// is not defined` on every unmount. They are now module-scope; these tests mount
// and unmount the real component to ensure a future refactor can't reintroduce
// that crash.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { i18n } from '@/i18n';

// xterm + addons need a real DOM with measurement APIs jsdom doesn't provide.
vi.mock('@xterm/xterm', () => {
  class MockTerminal {
    constructor(opts = {}) {
      this.options = opts;
      this.rows = 24;
      this.cols = 80;
    }
    loadAddon() {}
    open() {}
    write() {}
    writeln() {}
    focus() {}
    clear() {}
    scrollToBottom() {}
    refresh() {}
    getSelection() { return ''; }
    hasSelection() { return false; }
    clearSelection() {}
    onData() {}
    onResize() {}
    attachCustomKeyEventHandler() { return true; }
    dispose() {}
  }
  return { Terminal: MockTerminal };
});

vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }));
vi.mock('@xterm/addon-search', () => ({
  SearchAddon: class {
    onDidChangeResults() {}
    findNext() {}
    findPrevious() {}
    clearActiveSearch() {}
  },
}));

vi.mock('@/services/sshWebSocketService', () => ({
  default: class {
    connect() {}
    disconnect() {}
    sendMessage() {}
    getReadyState() { return 3; } // CLOSED
  },
}));

// Keep the real token helpers but never hit the network from the test.
vi.mock('@/utils/api', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, apiFetch: () => Promise.reject(new Error('network disabled in tests')) };
});

import TerminalDisplay from '@/components/terminal/TerminalDisplay.vue';

const nodeConfig = {
  id: 'conn_test',
  name: 'test-host',
  host: '192.0.2.1',
  port: 22,
  username: 'root',
  auth_type: 'password',
  auth_value: 'secret',
  protocol: 'ssh',
};

function mountTerminal() {
  return mount(TerminalDisplay, {
    props: { nodeConfig },
    global: { plugins: [i18n] },
  });
}

describe('TerminalDisplay wake-lock lifecycle', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    sessionStorage.clear();
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  it('unmounts without throwing after a normal SSH mount', async () => {
    const wrapper = mountTerminal();
    // Let initializeTerminal's `await nextTick()` (and any trailing microtasks)
    // settle so the full mount path — including the visibilitychange listener —
    // has run before we tear the component down.
    await flushPromises();
    await nextTick();

    expect(() => wrapper.unmount()).not.toThrow();
  });

  it('registers the wake-lock listener on mount and removes it on unmount', async () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const wrapper = mountTerminal();
    await flushPromises();
    await nextTick();

    expect(addSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

    wrapper.unmount();
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
