import { getWsBaseUrl } from '@/utils/constants';

export interface Callbacks {
  onOpen?: () => void;
  onMessage?: (data: any) => void;
  onClose?: (event: CloseEvent, manualDisconnect: boolean) => void;
  onError?: (error: Error) => void;
  /** Called when server sends an [Error] or [Init Error] message */
  onServerError?: (message: string) => void;
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
  private nodeIdentifier: string = 'default-node';
  private manualDisconnect: boolean = false;
  private nodeInfo: NodeInfo | null = null;

  connect(nodeInfo: NodeInfo, callbacks: Callbacks): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.disconnect(true);
    }
    this.manualDisconnect = false;
    this.nodeIdentifier = nodeInfo.name || `node-${Date.now()}`;
    this.nodeInfo = nodeInfo;

    this.onOpenCallback = callbacks.onOpen || null;
    this.onMessageCallback = callbacks.onMessage || null;
    this.onCloseCallback = callbacks.onClose || null;
    this.onErrorCallback = callbacks.onError || null;
    this.onServerErrorCallback = callbacks.onServerError || null;

    this.createSocket();
  }

  private createSocket(): void {
    try {
      this.ws = new WebSocket(getWsBaseUrl());
    } catch (e) {
      if (this.onErrorCallback) this.onErrorCallback(e instanceof Error ? e : new Error('Failed to create WebSocket.'));
      return;
    }

    this.ws.onopen = () => {
      try {
        this.ws!.send(JSON.stringify(this.nodeInfo));
      } catch (e) {
        if (this.onErrorCallback) this.onErrorCallback(e instanceof Error ? e : new Error('Failed to send node info.'));
        this.disconnect(true);
      }
    };

    this.ws.onmessage = (event) => {
      const data = event.data;
      if (typeof data === 'string') {
        if (data.startsWith('{"type":"ssh_ready"')) {
          if (this.onOpenCallback) this.onOpenCallback();
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
      if (this.onCloseCallback) this.onCloseCallback(event, this.manualDisconnect);
      this.ws = null;
      this.manualDisconnect = false;
      // Reconnection is handled by the consumer (TerminalDisplay)
    };

    this.ws.onerror = () => {
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
