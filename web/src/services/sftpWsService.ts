import { getWsBaseUrl } from '@/utils/constants';

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

  get connected() { return this._connected; }
  get error() { return this._error; }

  connect(config: any, callbacks: Callbacks) {
    this.closed = false;
    this.config = config;
    this.callbacks = callbacks;
    this._error = '';
    this.createSocket();
  }

  private createSocket() {
    try {
      const url = getWsBaseUrl().replace('/ws/ssh', '/ws/sftp');
      this.ws = new WebSocket(url);
    } catch {
      this._error = 'Failed to create WebSocket';
      this.callbacks.onStatus?.('error', this._error);
      return;
    }

    this.ws.onopen = () => {
      try {
        this.ws!.send(JSON.stringify(this.config));
      } catch {
        this._error = 'Failed to send config';
        this.callbacks.onStatus?.('error', this._error);
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'status') {
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
      this._connected = false;
      if (!this.closed) {
        this.callbacks.onStatus?.('disconnected');
      }
      this.ws = null;
      for (const [, p] of this.pending) p.reject(new Error('Connection closed'));
      this.pending.clear();
    };

    this.ws.onerror = () => {
      this._error = 'WebSocket error';
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
