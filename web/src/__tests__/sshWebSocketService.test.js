// @vitest-environment jsdom
// Regression tests for SshWebSocketService — the WebSocket layer behind the SSH
// terminal. jsdom has no WebSocket, so a controllable mock drives the lifecycle:
//   - preflight auth gate (401/503/network failure) before any socket opens
//   - node info sent on open; ssh_ready drives onOpen
//   - [Error]/[Init Error] messages route to onServerError (not onMessage)
//   - host_stats drives onHostStats
//   - legacy gateways get one ?token= retry before surfacing onClose
//   - generation bump: a superseded socket's late callbacks are ignored
//   - sendMessage / disconnect / self-diagnostic onerror paths
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import SshWebSocketService from '@/services/sshWebSocketService';
import { apiFetch } from '@/utils/api';
import { getRuntimeBackendBase } from '@/utils/constants';
import { setLocale } from '@/i18n';

vi.mock('@/utils/constants', () => ({
  getWsBaseUrl: () => 'ws://ssh.test/ws/ssh',
  getApiBaseUrl: () => 'http://api.test',
  getRuntimeBackendBase: vi.fn(() => ''),
  wsAuthProtocols: () => ['webssh-auth', 'tok'],
  withLegacyToken: (url) => url + '?token=tok',
  useBuiltinSsh: () => false,
}));

vi.mock('@/utils/api', () => ({ apiFetch: vi.fn() }));

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  static instances = [];
  static last = null;

  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = MockWebSocket.CONNECTING;
    this.sent = [];
    this.close = vi.fn((_code, _reason) => { this.readyState = MockWebSocket.CLOSED; });
    MockWebSocket.instances.push(this);
    MockWebSocket.last = this;
  }
  send(msg) { this.sent.push(String(msg)); }
}
vi.stubGlobal('WebSocket', MockWebSocket);

const NODE = { id: 'conn1', name: 'prod-01', host: '10.0.0.1', port: 22, username: 'root', auth_type: 'password', auth_value: 'secret', protocol: 'ssh' };

/** Flush the async preflight so the socket gets created (if the gate passed). */
async function flushPreflight() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function connectAndOpen(service, callbacks = {}) {
  service.connect(NODE, callbacks);
  await flushPreflight();
  const ws = MockWebSocket.last;
  expect(ws).toBeTruthy();
  ws.readyState = MockWebSocket.OPEN;
  ws.onopen();
  return ws;
}

describe('SshWebSocketService', () => {
  beforeEach(() => {
    setLocale('zh-CN'); // the diagnostic messages are asserted in Chinese
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    MockWebSocket.last = null;
    getRuntimeBackendBase.mockReturnValue('');
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockResolvedValue({ status: 200 });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    // NOTE: do NOT vi.unstubAllGlobals() here — WebSocket is stubbed at module
    // scope and must survive across tests in this file.
  });

  it('opens a socket with auth subprotocols and sends node info on open', async () => {
    const service = new SshWebSocketService();
    const opened = vi.fn();
    const ws = await connectAndOpen(service, { onOpen: opened });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(ws.url).toBe('ws://ssh.test/ws/ssh');
    expect(ws.protocols).toEqual(['webssh-auth', 'tok']);
    expect(JSON.parse(ws.sent[0])).toMatchObject({ host: '10.0.0.1', port: 22, username: 'root' });
    expect(opened).not.toHaveBeenCalled();

    // ssh_ready is the server-side "session established" signal
    ws.onmessage({ data: '{"type":"ssh_ready"}' });
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('preflight 401 reports the token problem and never opens a socket', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ status: 401 });
    const service = new SshWebSocketService();
    const errors = [];
    service.connect(NODE, { onError: (e) => errors.push(e.message) });
    await flushPreflight();

    expect(MockWebSocket.instances).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('后端访问密码');
  });

  it('preflight 503 reports the missing AUTH_TOKEN env', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ status: 503 });
    const service = new SshWebSocketService();
    const errors = [];
    service.connect(NODE, { onError: (e) => errors.push(e.message) });
    await flushPreflight();

    expect(MockWebSocket.instances).toHaveLength(0);
    expect(errors[0]).toContain('AUTH_TOKEN');
  });

  it('preflight network failure surfaces the runtime gateway hint', async () => {
    getRuntimeBackendBase.mockReturnValue('http://gw.local:9627');
    vi.mocked(apiFetch).mockRejectedValue(new Error('fetch failed'));
    const service = new SshWebSocketService();
    const errors = [];
    service.connect(NODE, { onError: (e) => errors.push(e.message) });
    await flushPreflight();

    expect(MockWebSocket.instances).toHaveLength(0);
    expect(errors[0]).toContain('http://gw.local:9627');
    expect(errors[0]).toContain('后端网关地址');
  });

  it('routes [Error]/[Init Error] messages to onServerError, never onMessage', async () => {
    const service = new SshWebSocketService();
    const serverErrors = [];
    const messages = [];
    const ws = await connectAndOpen(service, { onServerError: (m) => serverErrors.push(m), onMessage: (d) => messages.push(d) });

    ws.onmessage({ data: '\x1b[31m[Error]\x1b[0m authentication failed' });
    ws.onmessage({ data: '{"type":"ssh_ready"}' });
    ws.onmessage({ data: '[Init Error] no pty allocated' });

    expect(serverErrors).toEqual(['authentication failed', 'no pty allocated']);
    // ssh_ready is consumed as a control message, not forwarded
    expect(messages).toEqual([]);
  });

  it('routes host_stats to onHostStats with parsed data', async () => {
    const service = new SshWebSocketService();
    const stats = [];
    const ws = await connectAndOpen(service, { onHostStats: (s) => stats.push(s) });

    ws.onmessage({ data: JSON.stringify({ type: 'host_stats', data: { cpu: 12, memUsed: 100, memTotal: 512 } }) });
    expect(stats).toEqual([{ cpu: 12, memUsed: 100, memTotal: 512 }]);
  });

  it('falls back to a legacy ?token= socket when the handshake is rejected before open', async () => {
    const service = new SshWebSocketService();
    const closed = vi.fn();
    service.connect(NODE, { onClose: closed });
    await flushPreflight();
    const first = MockWebSocket.last;
    first.onclose({ wasClean: false, code: 1006 }); // closed before ever opening

    expect(MockWebSocket.instances).toHaveLength(2);
    const second = MockWebSocket.last;
    expect(second.url).toContain('?token=tok');
    expect(second.protocols).toBeUndefined();
    expect(closed).not.toHaveBeenCalled();

    second.onclose({ wasClean: false, code: 1006 }); // legacy socket also fails → surface
    expect(closed).toHaveBeenCalledTimes(1);
    expect(service.getReadyState()).toBe(WebSocket.CLOSED);
  });

  it('suppresses pre-open onerror while the legacy retry is still possible', async () => {
    const service = new SshWebSocketService();
    const errors = [];
    service.connect(NODE, { onError: (e) => errors.push(e.message) });
    await flushPreflight();
    MockWebSocket.last.onerror();

    expect(errors).toHaveLength(0); // the close handler owns the retry
    MockWebSocket.last.onclose({ wasClean: false, code: 1006 });
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('a superseded socket is detached and its late callbacks are ignored', async () => {
    const service = new SshWebSocketService();
    const opened = vi.fn();
    const closed = vi.fn();
    // Real callers reuse the same callbacks object across connects.
    const shared = { onOpen: opened, onClose: closed };
    const ws1 = await connectAndOpen(service, shared);
    // Capture the handlers while the socket is still alive — the service nulls
    // them on supersede, so we invoke the captured references to simulate a
    // late event arriving from the dead socket.
    const lateMessage = ws1.onmessage;
    const lateClose = ws1.onclose;

    // Second connect() replaces the first socket entirely
    await connectAndOpen(service, shared);
    expect(ws1.onopen).toBeNull();
    expect(ws1.onmessage).toBeNull();
    expect(ws1.onclose).toBeNull();
    expect(ws1.onerror).toBeNull();
    expect(ws1.close).toHaveBeenCalledWith(1000, 'replaced');

    // Late events from the dead socket must not reach the callbacks
    lateMessage({ data: '{"type":"ssh_ready"}' });
    lateClose({ wasClean: false, code: 1006 });
    expect(opened).not.toHaveBeenCalled();
    expect(closed).not.toHaveBeenCalled();
  });

  it('onerror after open reports a self-diagnostic message with the target host', async () => {
    getRuntimeBackendBase.mockReturnValue('http://gw.local:9627');
    const service = new SshWebSocketService();
    const errors = [];
    const ws = await connectAndOpen(service, { onError: (e) => errors.push(e.message) });
    ws.onerror();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('WebSocket error');
    expect(errors[0]).toContain('ssh.test'); // URL.host — no scheme
    expect(errors[0]).toContain('http://gw.local:9627');
  });

  it('sendMessage while disconnected reports WebSocket not connected', async () => {
    const service = new SshWebSocketService();
    const errors = [];
    service.connect(NODE, { onError: (e) => errors.push(e.message) });
    await flushPreflight();
    service.sendMessage('echo hi');

    expect(errors).toContain('WebSocket not connected.');
  });

  it('disconnect closes the socket cleanly', async () => {
    const service = new SshWebSocketService();
    const ws = await connectAndOpen(service);

    service.disconnect();
    expect(ws.close).toHaveBeenCalledWith(1000, 'disconnect');
  });
});
