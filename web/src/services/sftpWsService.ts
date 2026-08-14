import { getWsSftpUrl, getRuntimeBackendBase, wsAuthProtocols, withLegacyToken } from '@/utils/constants';

type Callbacks = {
  onStatus?: (status: string, error?: string) => void;
  onResult?: (id: number, result: any) => void;
  onError?: (id: number, error: string) => void;
};

class SftpWsService {
  private ws: WebSocket | null = null;
  private msgId = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private callbacks: Callbacks = {};
  private config: any = null;
  private _connected = false;
  private _error = '';
  private closed = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private connTimeout: ReturnType<typeof setTimeout> | null = null;
  // One-shot fallback when a legacy gateway rejects the subprotocol handshake.
  private legacyRetried = false;

  get connected() { return this._connected; }
  get error() { return this._error; }

  connect(config: any, callbacks: Callbacks) {
    // Retry safety: tear down any previous socket before opening a new one so
    // a re-connect can never leak a stale connection or its timers/promises.
    if (this.ws) {
      try { this.ws.onclose = null; this.ws.onerror = null; this.ws.close(); } catch {}
      this.ws = null;
    }
    if (this.connTimeout) { clearTimeout(this.connTimeout); this.connTimeout = null; }
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    for (const [, p] of this.pending) p.reject(new Error('Reconnecting'));
    this.pending.clear();

    this.closed = false;
    this.config = config;
    this.callbacks = callbacks;
    this._error = '';
    this.legacyRetried = false;
    this.createSocket();
  }

  private createSocket(legacyAuth: boolean = false) {
    // Auth token rides in Sec-WebSocket-Protocol, not the URL (no log leaks).
    // Legacy gateways that can't negotiate subprotocols → one retry with ?token=.
    const protocols = legacyAuth ? undefined : wsAuthProtocols();
    const url = legacyAuth ? withLegacyToken(getWsSftpUrl()) : getWsSftpUrl();
    let opened = false;
    try {
      this.ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url);
    } catch {
      this._error = 'Failed to create WebSocket';
      this.callbacks.onStatus?.('error', this._error);
      return;
    }

    this.ws.onopen = () => {
      opened = true;
      this.connTimeout = setTimeout(() => {
        if (!this._connected) {
          this.closed = true;
          this._error = 'Connection timeout';
          this.callbacks.onStatus?.('error', 'Connection timeout');
          if (this.ws) { try { this.ws.close(1000); } catch {} this.ws = null; }
        }
      }, 15000);
      try {
        this.ws!.send(JSON.stringify(this.config));
        this.heartbeatTimer = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'ping' }));
        }, 30000);
      } catch {
        if (this.connTimeout) { clearTimeout(this.connTimeout); this.connTimeout = null; }
        this._error = 'Failed to send config';
        this.callbacks.onStatus?.('error', this._error);
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'status') {
          if (this.connTimeout) { clearTimeout(this.connTimeout); this.connTimeout = null; }
          this._connected = msg.status === 'connected';
          this._error = msg.status === 'error' ? (msg.error || '') : '';
          this.callbacks.onStatus?.(msg.status, msg.error);
        } else if (msg.id !== undefined) {
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            if (msg.error) p.reject(new Error(msg.error));
            else p.resolve(msg.result);
          }
        }
      } catch {}
    };

    this.ws.onclose = () => {
      // Subprotocol handshake rejected by a legacy gateway → retry once with
      // the old ?token= query parameter.
      if (!opened && !legacyAuth && !this.legacyRetried && !this.closed) {
        this.legacyRetried = true;
        this.ws = null;
        this.createSocket(true);
        return;
      }
      this._connected = false;
      if (!this.closed) {
        this.callbacks.onStatus?.('disconnected');
      }
      this.ws = null;
      for (const [, p] of this.pending) p.reject(new Error('Connection closed'));
      this.pending.clear();
    };

    this.ws.onerror = () => {
      // Pre-open errors are handled by the close-time legacy retry.
      if (!opened && !legacyAuth && !this.legacyRetried) return;
      let host = '';
      try { host = new URL(url).host; } catch { host = url; }
      const runtimeBase = getRuntimeBackendBase();
      this._error = runtimeBase
        ? `WebSocket 错误（目标 ${host}；当前后端网关地址为 ${runtimeBase}，请到 设置 → 后端网关地址 检查或清空）`
        : `WebSocket 错误（目标 ${host}；请到 设置 检查后端访问密码，并确认代理/加速器/杀毒未拦截 WebSocket）`;
      this.callbacks.onStatus?.('error', this._error);
    };
  }

  async send(action: string, params: Record<string, any> = {}): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('SFTP not connected');
    }
    const id = ++this.msgId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify({ id, action, ...params }));
      setTimeout(() => {
        const p = this.pending.get(id);
        if (p) { this.pending.delete(id); reject(new Error('Request timeout')); }
      }, 30000);
    });
  }

  disconnect() {
    this.closed = true;
    if (this.connTimeout) { clearTimeout(this.connTimeout); this.connTimeout = null; }
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.ws) {
      this.ws.close(1000, 'disconnect');
      this.ws = null;
    }
    this._connected = false;
    for (const [, p] of this.pending) p.reject(new Error('Disconnected'));
    this.pending.clear();
  }
}

export default SftpWsService;
