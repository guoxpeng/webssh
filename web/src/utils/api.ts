// Auth token resolution:
// 1. VITE_AUTH_TOKEN baked in at build time (Docker/VPS deployments), else
// 2. a runtime token: injected into index.html by the Node server
//    (window.__WEBSSH_AUTH_TOKEN__) or handed over via `?token=...` on the
//    startup URL (desktop shell), else
// 3. a token the user stored for a runtime-configured (remote) backend —
//    required on native apps that point at their own webssh server.
import { STORAGE_KEYS, storageGet, storageSet, storageRemove } from './storage';
// Re-exported for backward compatibility (see constants.ts).
export const BACKEND_TOKEN_KEY = STORAGE_KEYS.backendToken.key;

export function getBackendToken(): string {
  return storageGet('backendToken') || '';
}
export function setBackendToken(token: string): void {
  if (token) storageSet('backendToken', token);
  else storageRemove('backendToken');
}

function resolveRuntimeToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    const injected = (window as unknown as Record<string, unknown>).__WEBSSH_AUTH_TOKEN__;
    const fromUrl = new URLSearchParams(window.location.search).get('token');
    if (fromUrl) storageSet('runtimeToken', fromUrl);
    if (typeof injected === 'string' && injected) return injected;
    if (fromUrl) return fromUrl;
    return getBackendToken() || storageGet('runtimeToken') || '';
  } catch {
    return '';
  }
}

export function getAuthToken(): string {
  return import.meta.env.VITE_AUTH_TOKEN || resolveRuntimeToken();
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.headers) {
    Object.assign(headers, options.headers);
  }
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers });
}
