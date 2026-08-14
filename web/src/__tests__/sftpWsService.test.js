// @vitest-environment jsdom
// Regression tests for SftpWsService — the WebSocket layer behind the SFTP file
// panel. jsdom has no WebSocket, so a controllable mock drives the lifecycle:
//   - connect() sends config with auth subprotocols
//   - reconnect tears down the previous socket + rejects pending requests
//   - legacy gateways get one ?token= retry before reporting disconnected
//   - status/error messages drive the connected flag + callbacks
//   - request timeout (30s) and clean disconnect
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import SftpWsService from '@/services/sftpWsService';
import { getRuntimeBackendBase } from '@/utils/constants';
import { setLocale } from '@/i18n';

vi.mock('@/utils/constants', () => ({
  getWsSftpUrl: () => 'ws://sftp.test/ws/sftp',
  getRuntimeBackendBase: vi.fn(() => ''),
  wsAuthProtocols: () => ['webssh-auth', 'tok'],
  withLegacyToken: (url) => url + '?token=tok',
}));

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

const CFG = { host: 'example.com', port: 22, username: 'root', auth_type: 'password', auth_value: 'secret' };

function openAndConnect(service, callbacks = {}) {
  service.connect(CFG, callbacks);
  const ws = MockWebSocket.last;
  ws.readyState = MockWebSocket.OPEN;
  ws.onopen();
  return ws;
}

function sendStatus(ws, status, error) {
  ws.onmessage({ data: JSON.stringify({ type: 'status', status, error }) });
}

describe('SftpWsService', () => {
  beforeEach(() => {
    setLocale('zh-CN'); // the self-diagnostic message is asserted in Chinese
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    MockWebSocket.last = null;
    getRuntimeBackendBase.mockReturnValue('');
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('opens a socket with auth subprotocols and sends the config on open', () => {
    const service = new SftpWsService();
    const statuses = [];
    const ws = openAndConnect(service, { onStatus: (s) => statuses.push(s) });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(ws.url).toBe('ws://sftp.test/ws/sftp');
    expect(ws.protocols).toEqual(['webssh-auth', 'tok']);
    expect(JSON.parse(ws.sent[0])).toMatchObject({ host: 'example.com', port: 22, username: 'root' });

    sendStatus(ws, 'connected');
    expect(service.connected).toBe(true);
    expect(statuses).toContain('connected');
  });

  it('reconnect closes the previous socket and rejects its pending requests', async () => {
    const service = new SftpWsService();
    const ws1 = openAndConnect(service);
    ws1.readyState = MockWebSocket.OPEN;
    const pending = service.send('list', { path: '/' });
    openAndConnect(service);

    expect(ws1.close).toHaveBeenCalled();
    expect(MockWebSocket.instances).toHaveLength(2);
    // Old socket's handlers are detached before close — no stray callbacks.
    expect(ws1.onclose).toBeNull();
    expect(ws1.onerror).toBeNull();
    await expect(pending).rejects.toThrow('Reconnecting');
  });

  it('falls back to a legacy ?token= socket when the handshake is rejected before open', () => {
    const service = new SftpWsService();
    const statuses = [];
    service.connect(CFG, { onStatus: (s) => statuses.push(s) });
    const first = MockWebSocket.last;
    first.onclose(); // closed before ever opening → legacy retry

    expect(MockWebSocket.instances).toHaveLength(2);
    const second = MockWebSocket.last;
    expect(second.url).toContain('?token=tok');
    expect(second.protocols).toBeUndefined();

    second.onclose(); // legacy socket also fails → surface as disconnected
    expect(statuses).toContain('disconnected');
    expect(service.connected).toBe(false);
  });

  it('a status error clears connected and forwards the message', () => {
    const service = new SftpWsService();
    const statuses = [];
    const ws = openAndConnect(service, { onStatus: (s, e) => statuses.push([s, e]) });
    sendStatus(ws, 'connected');
    sendStatus(ws, 'error', 'auth failed');

    expect(service.connected).toBe(false);
    expect(service.error).toBe('auth failed');
    expect(statuses).toContainEqual(['error', 'auth failed']);
  });

  it('onerror reports a self-diagnostic message (with the runtime backend hint)', () => {
    getRuntimeBackendBase.mockReturnValue('http://gw.local:9627');
    const service = new SftpWsService();
    const statuses = [];
    const ws = openAndConnect(service, { onStatus: (s, e) => statuses.push([s, e]) });
    ws.onerror();

    expect(service.error).toContain('WebSocket 错误');
    expect(service.error).toContain('后端网关地址');
    expect(statuses[0][0]).toBe('error');
  });

  it('send throws when not connected', async () => {
    const service = new SftpWsService();
    service.connect(CFG, {});
    await expect(service.send('list')).rejects.toThrow('SFTP not connected');
  });

  it('send rejects with a request timeout after 30s', async () => {
    const service = new SftpWsService();
    const ws = openAndConnect(service);
    sendStatus(ws, 'connected'); // clears the 15s connect timeout
    ws.readyState = MockWebSocket.OPEN;
    const pending = service.send('list', { path: '/' });
    // Attach the rejection handler BEFORE advancing timers so the reject that
    // fires inside setTimeout is never observed as an unhandled rejection.
    const expectation = expect(pending).rejects.toThrow('Request timeout');

    await vi.advanceTimersByTimeAsync(30000);
    await expectation;
  });

  it('disconnect rejects pending and closes the socket cleanly', async () => {
    const service = new SftpWsService();
    const ws = openAndConnect(service);
    sendStatus(ws, 'connected');
    ws.readyState = MockWebSocket.OPEN;
    const pending = service.send('read', { path: '/etc/hosts' });

    service.disconnect();
    expect(ws.close).toHaveBeenCalledWith(1000, 'disconnect');
    expect(service.connected).toBe(false);
    await expect(pending).rejects.toThrow('Disconnected');
  });
});
