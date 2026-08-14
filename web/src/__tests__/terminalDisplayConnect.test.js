// @vitest-environment jsdom
// Component-level tests for the SSH terminal connection state machine in
// TerminalDisplay.vue — connect/open/close/error/reconnect paths driven through
// the real callbacks object wired by initializeTerminal:
//   - open → 'connected' status + history record
//   - server error → friendly classification, and NO auto-reconnect (auth
//     failures never fix themselves)
//   - unexpected close after a session → exponential backoff reconnects, capped
//     at MAX_RECONNECTS
//   - clean shell exit / manual disconnect → never reconnect
//   - onError → friendly timeout/refused classification + 'error' status
//
// Mounting note: initializeTerminal is async (awaits nextTick) and
// flushPromises() internally uses a real setTimeout(0), so fake timers must be
// enabled AFTER the mount has settled, otherwise the mount-time connect call is
// racy. Reconnect timers are created after the switch, so they stay faked.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

// Controllable service: captures the callbacks passed to connect() so the test
// can drive open/close/error/server-error events exactly like the gateway.
const { MockSshService } = vi.hoisted(() => {
  class MockSshService {
    static instances = [];
    constructor() {
      this.callbacks = null;
      MockSshService.instances.push(this);
    }
    connect(nodeInfo, callbacks) { this.callbacks = callbacks; }
    disconnect() {}
    sendMessage() {}
    getReadyState() { return 3; } // CLOSED
  }
  return { MockSshService };
});

vi.mock('@/services/sshWebSocketService', () => ({ default: MockSshService }));

// Keep the real token helpers but never hit the network from the test.
vi.mock('@/utils/api', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, apiFetch: () => Promise.reject(new Error('network disabled in tests')) };
});

import TerminalDisplay from '@/components/terminal/TerminalDisplay.vue';
import { useHistoryStore } from '@/stores/historyStore';

const nodeConfig = {
  id: 'conn_flow',
  name: 'flow-host',
  host: '192.0.2.10',
  port: 22,
  username: 'root',
  auth_type: 'password',
  auth_value: 'secret',
  protocol: 'ssh',
};

const unexpectedClose = { wasClean: false, code: 1006 };

function mountTerminal() {
  return mount(TerminalDisplay, {
    props: { nodeConfig },
    global: { plugins: [i18n] },
  });
}

/** Last service instance created by the component under test. */
function currentService() {
  const svc = MockSshService.instances[MockSshService.instances.length - 1];
  expect(svc.callbacks).not.toBeNull();
  return svc;
}

describe('TerminalDisplay connection state machine', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('webssh_master', 'test-master');
    MockSshService.instances = [];
    i18n.global.locale.value = 'zh-CN';
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

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('emits connecting on mount and connected once the gateway opens the session', async () => {
    const wrapper = mountTerminal();
    await flushPromises();
    await nextTick();

    expect(wrapper.emitted('status-change')?.flat()).toContain('connecting');

    currentService().callbacks.onOpen();
    await nextTick();

    expect(wrapper.emitted('status-change')?.flat()).toContain('connected');
    expect(useHistoryStore().entries[0]).toMatchObject({ host: '192.0.2.10', status: 'success' });
  });

  it('a server auth error is friendly-classified and suppresses auto-reconnect', async () => {
    const wrapper = mountTerminal();
    await flushPromises();
    await nextTick();
    const svc = currentService();
    vi.useFakeTimers(); // reconnect window only — mount already settled
    const connectSpy = vi.spyOn(svc, 'connect');
    svc.callbacks.onOpen();

    svc.callbacks.onServerError('authentication failed for root');
    await nextTick();

    const statuses = wrapper.emitted('status-change')?.flat() || [];
    expect(statuses).toContain('error');
    expect(wrapper.emitted('error-message')?.flat()[0]).toContain('认证失败');

    // Auth failures never fix themselves: closing must NOT schedule a reconnect
    // (spy installed after mount, so any reconnect would count here)
    svc.callbacks.onClose(unexpectedClose, false);
    await vi.advanceTimersByTimeAsync(30000);
    expect(connectSpy).not.toHaveBeenCalled();
  });

  it('reconnects with exponential backoff after an unexpected drop, capped at MAX_RECONNECTS', async () => {
    const wrapper = mountTerminal();
    await flushPromises();
    await nextTick();
    const svc = currentService();
    vi.useFakeTimers();
    const connectSpy = vi.spyOn(svc, 'connect');
    svc.callbacks.onOpen(); // connectedEver = true — eligible for reconnect

    // attempt 1 → 2s
    svc.callbacks.onClose(unexpectedClose, false);
    await nextTick();
    expect(wrapper.emitted('status-change')?.flat()).toContain('connecting');
    await vi.advanceTimersByTimeAsync(1999);
    expect(connectSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(connectSpy).toHaveBeenCalledTimes(1);

    // Failing reconnects: no onOpen in between, so attempts climb 2..5 and the
    // backoff doubles each time (capped at 15s) → 4s, 8s, 15s, 15s.
    const cycle = [[2, 4000], [3, 8000], [4, 15000], [5, 15000]];
    for (const [n, delay] of cycle) {
      svc.callbacks.onClose(unexpectedClose, false);
      await vi.advanceTimersByTimeAsync(delay);
      expect(connectSpy).toHaveBeenCalledTimes(n);
    }

    // Attempt 6 gives up: MAX_RECONNECTS reached → no further timers
    svc.callbacks.onClose(unexpectedClose, false);
    await vi.advanceTimersByTimeAsync(30000);
    expect(connectSpy).toHaveBeenCalledTimes(5);
  });

  it('a successful reconnect resets the backoff counter back to 2s', async () => {
    mountTerminal();
    await flushPromises();
    await nextTick();
    const svc = currentService();
    vi.useFakeTimers();
    const connectSpy = vi.spyOn(svc, 'connect');
    svc.callbacks.onOpen();

    svc.callbacks.onClose(unexpectedClose, false); // attempt 1 → 2s
    await vi.advanceTimersByTimeAsync(2000);
    expect(connectSpy).toHaveBeenCalledTimes(1);

    svc.callbacks.onOpen(); // session re-established — counter resets to 0
    svc.callbacks.onClose(unexpectedClose, false);
    await vi.advanceTimersByTimeAsync(1500);
    expect(connectSpy).toHaveBeenCalledTimes(1); // not yet — still 2s, not 4s
    await vi.advanceTimersByTimeAsync(500);
    expect(connectSpy).toHaveBeenCalledTimes(2); // 2s again, proving the reset
  });

  it('a clean shell exit (wasClean + 1000) emits shell-exit and never reconnects', async () => {
    const wrapper = mountTerminal();
    await flushPromises();
    await nextTick();
    const svc = currentService();
    vi.useFakeTimers();
    const connectSpy = vi.spyOn(svc, 'connect');
    svc.callbacks.onOpen();

    svc.callbacks.onClose({ wasClean: true, code: 1000 }, false);
    await nextTick();

    expect(wrapper.emitted('shell-exit')).toBeTruthy();
    await vi.advanceTimersByTimeAsync(30000);
    expect(connectSpy).not.toHaveBeenCalled();
  });

  it('a manual disconnect never triggers auto-reconnect', async () => {
    const wrapper = mountTerminal();
    await flushPromises();
    await nextTick();
    const svc = currentService();
    vi.useFakeTimers();
    const connectSpy = vi.spyOn(svc, 'connect');
    svc.callbacks.onOpen();

    svc.callbacks.onClose(unexpectedClose, true); // manual = true
    await nextTick();

    expect(wrapper.emitted('status-change')?.flat()).toContain('disconnected');
    await vi.advanceTimersByTimeAsync(30000);
    expect(connectSpy).not.toHaveBeenCalled();
  });

  it('onError classifies timeout and refused messages into friendly copy', async () => {
    const wrapper = mountTerminal();
    await flushPromises();
    await nextTick();
    const svc = currentService();

    svc.callbacks.onError(new Error('connection timed out'));
    await nextTick();
    expect(wrapper.emitted('status-change')?.flat()).toContain('error');
    expect(wrapper.emitted('error-message')?.flat()[0]).toContain('连接超时');

    svc.callbacks.onError(new Error('ECONNREFUSED'));
    await nextTick();
    expect(wrapper.emitted('error-message')?.flat()[1]).toContain('连接被拒绝');
  });
});
