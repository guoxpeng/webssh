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
export const SESSION_STORAGE_CONNECTIONS_KEY = 'sshWebAppConnections_configs';

export function getWsBaseUrl(): string {
  if (import.meta.env.VITE_WS_BASE_URL) return import.meta.env.VITE_WS_BASE_URL;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/ssh`;
}

export function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
  return '/api';
}
