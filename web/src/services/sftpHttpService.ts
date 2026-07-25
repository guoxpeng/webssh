import { apiFetch } from '@/utils/api';
import { getApiBaseUrl } from '@/utils/constants';

type Callbacks = {
  onStatus?: (status: string, error?: string) => void;
};

class SftpHttpService {
  private config: Record<string, any> | null = null;
  private _connected = false;
  private _error = '';
  private destroyed = false;
  private seq = 0;

  get connected() { return this._connected; }
  get error() { return this._error; }

  connect(config: Record<string, any>, callbacks: Callbacks = {}) {
    this.destroyed = false;
    this.config = config;
    this._error = '';

    this.testConnection(callbacks);
  }

  getConfig() {
    return this.config;
  }

  private async testConnection(callbacks: Callbacks) {
    const mySeq = ++this.seq;
    try {
      const resp = await apiFetch(`${getApiBaseUrl()}/sftp/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...this.config, path: '/' }),
      });

      if (this.destroyed || mySeq !== this.seq) return;

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      if (data.error) throw new Error(data.error);

      this._connected = true;
      callbacks.onStatus?.('connected');
    } catch (e: any) {
      if (this.destroyed || mySeq !== this.seq) return;
      this._connected = false;
      this._error = e.message || 'Connection failed';
      callbacks.onStatus?.('error', this._error);
    }
  }

  async send(action: string, params: Record<string, any> = {}): Promise<any> {
    if (!this.config) throw new Error('SFTP not connected');
    if (this.destroyed) throw new Error('Disconnected');
    const reqSeq = this.seq;

    const resp = await apiFetch(`${getApiBaseUrl()}/sftp/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...this.config, ...params }),
    });

    if (this.destroyed) throw new Error('Disconnected');
    if (reqSeq !== this.seq) return;

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
      throw new Error(data.error || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  disconnect() {
    this.destroyed = true;
    this._connected = false;
    this.config = null;
  }
}

export default SftpHttpService;
