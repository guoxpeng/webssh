import { getAuthToken } from './api';
import { isAndroidApp, getNativeSshPort } from './nativeSsh';

export const ConnectionStatus = Object.freeze({
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
} as const);

export type ConnectionStatusType = (typeof ConnectionStatus)[keyof typeof ConnectionStatus];

export const AuthType = Object.freeze({
  PASSWORD: 'password',
  KEY: 'key',
} as const);

export type AuthTypeType = (typeof AuthType)[keyof typeof AuthType];

export const SESSION_STORAGE_CRED_PREFIX = 'sshWebAppCred_';
export const LOCAL_STORAGE_CRED_PREFIX = 'sshWebAppCredLocal_';
export const SESSION_STORAGE_CONNECTIONS_KEY = 'sshWebAppConnections_configs';

// ── Runtime backend address ─────────────────────────────────────────────────
// Mobile/desktop clients have no embedded Node server — the user must point
// them at a remote webssh gateway. Stored at runtime (Settings panel) so the
// same APK build works against any backend.
const BACKEND_URL_KEY = 'webssh_backend_url';

export function getRuntimeBackendBase(): string {
  try {
    const raw = (localStorage.getItem(BACKEND_URL_KEY) || '').trim();
    if (!raw) return '';
    // Normalize: scheme required; strip trailing slash
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    const u = new URL(withScheme);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

export function setRuntimeBackendBase(url: string): boolean {
  try {
    const raw = (url || '').trim();
    if (!raw) {
      localStorage.removeItem(BACKEND_URL_KEY);
      return true;
    }
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    const u = new URL(withScheme); // throws on invalid host
    localStorage.setItem(BACKEND_URL_KEY, `${u.protocol}//${u.host}`);
    return true;
  } catch {
    return false;
  }
}

// ── Built-in SSH gateway (Android APK) ──────────────────────────────────────
// The APK embeds a Java WebSocket→SSH gateway; when enabled the terminal and
// SFTP sockets point at ws://127.0.0.1:<port> and need no remote backend or
// access token.
const BUILTIN_SSH_KEY = 'webssh_builtin_ssh';

export function isBuiltinSshEnabled(): boolean {
  try {
    return localStorage.getItem(BUILTIN_SSH_KEY) === '1';
  } catch {
    return false;
  }
}

export function setBuiltinSshEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(BUILTIN_SSH_KEY, '1');
    else localStorage.removeItem(BUILTIN_SSH_KEY);
  } catch {
    // storage unavailable — nothing sensible to do
  }
}

/** True when sockets should target the in-APK gateway (Android APK only). */
export function useBuiltinSsh(): boolean {
  return isBuiltinSshEnabled() && isAndroidApp();
}

function appendToken(url: string): string {
  const token = getAuthToken();
  if (!token) return url;
  return url + (url.includes('?') ? '&' : '?') + `token=${encodeURIComponent(token)}`;
}

function buildWsUrl(pathSuffix: string): string {
  // Built-in gateway inside the Android APK: always loopback, no token needed.
  if (useBuiltinSsh()) {
    return `ws://127.0.0.1:${getNativeSshPort()}${pathSuffix}`;
  }
  // SECURITY: the auth token is NOT part of the WS URL (it would leak into
  // proxy/access logs). It travels via the Sec-WebSocket-Protocol header —
  // see wsAuthProtocols() below. Legacy servers that only accept ?token=
  // are covered by the fallback in the WS services.
  // 1. Runtime-configured backend (Settings panel; required on native apps)
  const runtimeBase = getRuntimeBackendBase();
  if (runtimeBase) {
    const wsProto = runtimeBase.startsWith('https://') ? 'wss://' : 'ws://';
    return `${wsProto}${runtimeBase.slice(runtimeBase.indexOf('://') + 3)}${pathSuffix}`;
  }
  // 2. Build-time override
  if (import.meta.env.VITE_WS_BASE_URL) {
    let url = import.meta.env.VITE_WS_BASE_URL;
    // A configured base usually points at the SSH endpoint — swap the path
    // segment for other endpoints instead of a blind string replace downstream.
    if (pathSuffix !== '/ws/ssh' && url.includes('/ws/ssh')) {
      url = url.replace('/ws/ssh', pathSuffix);
    }
    return url;
  }
  // 3. Same origin (web deployment / desktop shell)
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${pathSuffix}`;
}

// Subprotocol list carrying the auth token for `new WebSocket(url, protocols)`.
// The marker name goes first; the token itself is the second entry.
export function wsAuthProtocols(): string[] | undefined {
  // The in-APK gateway runs on loopback and authenticates nothing.
  if (useBuiltinSsh()) return undefined;
  const token = getAuthToken();
  return token ? ['webssh-auth', token] : undefined;
}

// Legacy fallback for gateways that only accept a ?token= query parameter.
export function withLegacyToken(url: string): string {
  return appendToken(url);
}

export function getWsBaseUrl(): string {
  return buildWsUrl('/ws/ssh');
}

export function getWsSftpUrl(): string {
  return buildWsUrl('/ws/sftp');
}

export function getGuacWsUrl(): string {
  return buildWsUrl('/ws/guacd');
}

export function getApiBaseUrl(): string {
  const runtimeBase = getRuntimeBackendBase();
  if (runtimeBase) return `${runtimeBase}/api`;
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
  return '/api';
}
