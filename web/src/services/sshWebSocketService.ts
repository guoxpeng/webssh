import { getWsBaseUrl, getApiBaseUrl, wsAuthProtocols, withLegacyToken, useBuiltinSsh } from '@/utils/constants';
import { apiFetch } from '@/utils/api';

export interface Callbacks {
  onOpen?: () => void;
  onMessage?: (data: any) => void;
  onClose?: (event: CloseEvent, manualDisconnect: boolean) => void;
  onError?: (error: Error) => void;
  /** Called when server sends an [Error] or [Init Error] message */
  onServerError?: (message: string) => void;
  /** Called with parsed host resource stats for the monitor panel */
  onHostStats?: (stats: Record<string, any>) => void;
}

export interface NodeInfo {
  name?: string;
  [key: string]: any;
}

class SshWebSocketService {
  private ws: WebSocket | null = null;
  private onOpenCallback: (() => void) | null = null;
  private onMessageCallback: ((data: any) => void) | null = null;
  private onCloseCallback: ((event: CloseEvent, manualDisconnect: boolean) => void) | null = null;
  private onErrorCallback: ((error: Error) => void) | null = null;
  private onServerErrorCallback: ((message: string) => void) | null = null;
  private onHostStatsCallback: ((stats: Record<string, any>) => void) | null = null;
  private nodeIdentifier: string = 'default-node';
  private manualDisconnect: boolean = false;
  private nodeInfo: NodeInfo | null = null;
  // Bumped on every connect() so callbacks from a superseded socket are ignored
  private generation: number = 0;
  // One-shot fallback flag: if a gateway rejects the subprotocol handshake we
  // retry exactly once with the legacy ?token= query parameter.
  private legacyRetried: boolean = false;

  connect(nodeInfo: NodeInfo, callbacks: Callbacks): void {
    // Tear down ANY live socket — including one still CONNECTING — so its
    // late callbacks cannot race the new connection's state.
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      const old = this.ws;
      old.onopen = old.onmessage = old.onclose = old.onerror = null;
      try { old.close(1000, 'replaced'); } catch {}
      this.ws = null;
    }
    this.manualDisconnect = false;
    this.nodeIdentifier = nodeInfo.name || `node-${Date.now()}`;
    this.nodeInfo = nodeInfo;

    this.onOpenCallback = callbacks.onOpen || null;
    this.onMessageCallback = callbacks.onMessage || null;
    this.onCloseCallback = callbacks.onClose || null;
    this.onErrorCallback = callbacks.onError || null;
    this.onServerErrorCallback = callbacks.onServerError || null;
    this.onHostStatsCallback = callbacks.onHostStats || null;

    this.generation += 1;
    this.legacyRetried = false;
    const gen = this.generation;
    // Preflight: verify the backend access token BEFORE opening the terminal
    // socket. A failed WebSocket handshake exposes no HTTP status, so without
    // this users just see an opaque "WebSocket error" when the token is
    // missing or wrong.
    this.preflightAuth().then((authError) => {
      if (gen !== this.generation) return;
      if (authError) {
        if (this.onErrorCallback) this.onErrorCallback(new Error(authError));
        return;
      }
      this.createSocket(gen);
    });
  }

  /** Returns an actionable error message when auth is broken, else null. */
  private async preflightAuth(): Promise<string | null> {
    // The in-APK gateway runs on loopback and needs no access token.
    if (useBuiltinSsh()) return null;
    try {
      const res = await apiFetch(`${getApiBaseUrl()}/chat/config`);
      if (res.status === 401 || res.status === 403) {
        return '后端访问密码未填写或不正确：打开 设置 → 后端访问密码，填入部署时设置的密码（环境变量 AUTH_TOKEN 的值）后保存重试';
      }
      if (res.status === 503) {
        return '后端未配置访问密码：请先在部署的环境变量里设置 AUTH_TOKEN 后重新部署';
      }
      return null; // gate accepted the token (route-level errors don't matter here)
    } catch {
      return null; // offline/network error — let the socket attempt report it
    }
  }

  private createSocket(gen: number, legacyAuth: boolean = false): void {
    // Auth: the token travels in Sec-WebSocket-Protocol (never in the URL, so
    // it cannot leak into logs). Legacy gateways that don't negotiate
    // subprotocols cause a handshake failure → one retry with ?token=.
    const protocols = legacyAuth ? undefined : wsAuthProtocols();
    const wsUrl = legacyAuth ? withLegacyToken(getWsBaseUrl()) : getWsBaseUrl();
    let opened = false;
    try {
      this.ws = protocols ? new WebSocket(wsUrl, protocols) : new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer';
    } catch (e) {
      if (this.onErrorCallback) this.onErrorCallback(e instanceof Error ? e : new Error('Failed to create WebSocket.'));
      return;
    }

    this.ws.onopen = () => {
      if (gen !== this.generation) return;
      opened = true;
      try {
        this.ws!.send(JSON.stringify(this.nodeInfo));
      } catch (e) {
        if (this.onErrorCallback) this.onErrorCallback(e instanceof Error ? e : new Error('Failed to send node info.'));
        this.disconnect(true);
      }
    };

    this.ws.onmessage = (event) => {
      if (gen !== this.generation) return;
      const data = event.data;
      if (typeof data === 'string') {
        if (data.startsWith('{"type":"ssh_ready"')) {
          if (this.onOpenCallback) this.onOpenCallback();
          return;
        }
        if (data.startsWith('{"type":"host_stats"')) {
          if (this.onHostStatsCallback) {
            try { this.onHostStatsCallback(JSON.parse(data).data || {}); } catch {}
          }
          return;
        }
        // Detect server error messages, route to onServerError and SKIP onMessage
        if ((data.includes('[Error]') || data.includes('[Init Error]') || data.includes('[Shell Error]') || data.includes('[SSH Error]')) && this.onServerErrorCallback) {
          const clean = data.replace(/\x1b\[[0-9;]*m/g, '').trim();
          const rawMsg = clean.replace(/^\[(Error|Init Error|Shell Error|SSH Error)\]\s*/, '');
          this.onServerErrorCallback(rawMsg);
          return;
        }
      }
      if (this.onMessageCallback) this.onMessageCallback(data);
    };

    this.ws.onclose = (event) => {
      if (gen !== this.generation) return;
      // Subprotocol handshake rejected by a legacy gateway → one-shot retry
      // using the old ?token= query parameter (keeps CF/old servers working).
      if (!opened && !legacyAuth && !this.legacyRetried) {
        this.legacyRetried = true;
        this.ws = null;
        this.createSocket(gen, true);
        return;
      }
      if (this.onCloseCallback) this.onCloseCallback(event, this.manualDisconnect);
      this.ws = null;
      this.manualDisconnect = false;
      // Reconnection is handled by the consumer (TerminalDisplay)
    };

    this.ws.onerror = () => {
      if (gen !== this.generation) return;
      // Suppress pre-open errors while the legacy retry is still possible;
      // the close handler performs the retry.
      if (!opened && !legacyAuth && !this.legacyRetried) return;
      const error = new Error(`WebSocket error: ${this.nodeIdentifier}`);
      if (this.onErrorCallback) this.onErrorCallback(error);
    };
  }

  sendMessage(data: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(data); } catch (e) {
        if (this.onErrorCallback) this.onErrorCallback(e instanceof Error ? e : new Error('Failed to send.'));
      }
    } else {
      if (this.onErrorCallback) this.onErrorCallback(new Error('WebSocket not connected.'));
    }
  }

  disconnect(forReconnect: boolean = false): void {
    if (this.ws) {
      this.manualDisconnect = !forReconnect;
      this.ws.close(1000, 'disconnect');
    }
  }

  getReadyState(): number {
    return this.ws ? this.ws.readyState : WebSocket.CLOSED;
  }
}

export default SshWebSocketService;
