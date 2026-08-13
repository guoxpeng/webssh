// Thin wrapper around the native SshBridge Capacitor plugin (Android APK only).
// On web/desktop the plugin does not exist — every call degrades to a no-op so
// nothing breaks outside the APK.
export interface NativeSshStatus {
  ok?: boolean;
  running: boolean;
  port: number;
  listenLan: boolean;
}

const DEFAULT_PORT = 8725;

let cached: NativeSshStatus | null = null;

function plugin(): any {
  try {
    const cap = (window as any).Capacitor;
    return cap?.isNativePlatform?.() ? cap?.Plugins?.SshBridge ?? null : null;
  } catch {
    return null;
  }
}

export function isNativePlatform(): boolean {
  try {
    return !!(window as any).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/** True only inside the Android APK — the SshBridge plugin is Android-only. */
export function isAndroidApp(): boolean {
  try {
    return (window as any).Capacitor?.getPlatform?.() === 'android';
  } catch {
    return false;
  }
}

export async function refreshNativeSshStatus(): Promise<NativeSshStatus | null> {
  const p = plugin();
  if (!p) return null;
  try {
    cached = await p.getStatus();
    return cached;
  } catch {
    return cached;
  }
}

/** Port of the in-APK gateway (cached after refresh; default 8725). */
export function getNativeSshPort(): number {
  return cached?.port || DEFAULT_PORT;
}

// Warm the cache at import time so the port is known before the first connect.
refreshNativeSshStatus();
