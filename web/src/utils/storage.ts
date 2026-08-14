// ── Storage registry + helpers ──────────────────────────────────────────────
// Single source of truth for EVERY key webssh reads/writes in localStorage or
// sessionStorage. Two hard rules, enforced by scripts/check-storage.mjs (wired
// into `npm run lint` + CI):
//
//   1. THIS file is the only module allowed to touch localStorage/sessionStorage
//      directly. Every other module must import helpers from here.
//   2. A new storage key must be registered here with its REAL storage area.
//      The historical bug — a key named SESSION_STORAGE_* that actually lived
//      in localStorage — is impossible to reintroduce: the area is declared in
//      the registry, and the helpers route to it automatically.
//
// Keys are grouped by feature. `area` is the ground truth: 'local' persists
// across restarts, 'session' clears when the tab closes.

export type StorageArea = 'local' | 'session';

export interface StorageKeyDef {
  /** The literal key written to the browser storage API. */
  key: string;
  /** Which storage API this key really uses. */
  area: StorageArea;
  /** Why the key exists / what it holds (audit trail). */
  purpose: string;
  /** Key is a prefix; real keys are `${prefix}${suffix}` (e.g. per-server credentials). */
  prefix?: boolean;
}

export const STORAGE_KEYS = {
  // ── Connection registry ──
  connections: { key: 'webssh_local_connections', area: 'local', purpose: 'Saved server list (metadata only)' },
  legacyConnections: { key: 'sshWebAppConnections_configs', area: 'local', purpose: 'Legacy key read once and migrated — never written' },
  groupOrder: { key: 'webssh_group_order', area: 'local', purpose: 'Server group display order' },
  groupCollapsed: { key: 'webssh_group_collapsed', area: 'local', purpose: 'Which server groups are collapsed' },

  // ── Credentials (per-server, prefix keys) ──
  sessionCredPrefix: { key: 'sshWebAppCred_', area: 'session', purpose: 'Session-remembered credentials (cleared on tab close)', prefix: true },
  localCredPrefix: { key: 'sshWebAppCredLocal_', area: 'local', purpose: 'Persistent credentials encrypted with the master password', prefix: true },

  // ── Master password / unlock ──
  sessionMaster: { key: 'webssh_master', area: 'session', purpose: 'Master password for the current session (never persisted)' },
  exeMaster: { key: 'webssh_exe_master', area: 'local', purpose: 'Desktop-shell persisted master password' },
  savedMaster: { key: 'webssh_saved_master', area: 'local', purpose: 'Remember-on-this-device master password' },
  verifyHash: { key: 'webssh_verify', area: 'local', purpose: 'Marked verify hash for master-password checks' },
  verifySalt: { key: 'webssh_verify_salt', area: 'local', purpose: 'Salt for the master-password verify hash' },

  // ── Backend / auth ──
  backendUrl: { key: 'webssh_backend_url', area: 'local', purpose: 'Runtime-configured backend address (native apps)' },
  builtinSsh: { key: 'webssh_builtin_ssh', area: 'local', purpose: 'APK embedded SSH gateway toggle' },
  backendToken: { key: 'webssh_backend_token', area: 'local', purpose: 'Token for a runtime-configured (remote) backend' },
  runtimeToken: { key: 'webssh_runtime_token', area: 'session', purpose: 'Token handed over via ?token= on the startup URL' },
  modelSync: { key: 'webssh_model_sync', area: 'local', purpose: 'Opt-in server-side model registry sync toggle' },
  cfLanWarned: { key: 'webssh_cf_lan_warned', area: 'local', purpose: 'One-time LAN-address warning on CF deployments' },

  // ── UI preferences ──
  theme: { key: 'appTheme', area: 'local', purpose: 'Light/dark theme' },
  themePreset: { key: 'appThemePreset', area: 'local', purpose: 'Theme preset id (light/dark/dracula/nord)' },
  locale: { key: 'appLocale', area: 'local', purpose: 'UI language' },
  fontSize: { key: 'appFontSize', area: 'local', purpose: 'Terminal font size' },
  fontBold: { key: 'termFontBold', area: 'local', purpose: 'Terminal bold font toggle' },
  animations: { key: 'appAnimations', area: 'local', purpose: 'UI animations toggle' },
  cursorStyle: { key: 'termCursorStyle', area: 'local', purpose: 'Terminal cursor style' },
  cursorBlink: { key: 'termCursorBlink', area: 'local', purpose: 'Terminal cursor blink toggle' },
  scrollback: { key: 'termScrollback', area: 'local', purpose: 'Terminal scrollback lines' },
  termBgColor: { key: 'termBgColor', area: 'local', purpose: 'Custom terminal background color' },
  sidebarWidth: { key: 'webssh_sidebar_width', area: 'local', purpose: 'Left sidebar width' },
  onboarded: { key: 'webssh_onboarded_v3', area: 'local', purpose: 'Onboarding wizard shown flag' },

  // ── Feature data ──
  keychain: { key: 'webssh_keychain', area: 'local', purpose: 'SSH keychain entries' },
  backups: { key: 'webssh_backups', area: 'local', purpose: 'Local backup list' },
  backupScheduler: { key: 'webssh_backup_schedule', area: 'local', purpose: 'Backup scheduler config' },
  backupCloud: { key: 'webssh_backup_cloud', area: 'local', purpose: 'Cloud backup target config' },
  codeNotes: { key: 'webssh_code_notes', area: 'local', purpose: 'Code notes (terminal command history annotations)' },
  history: { key: 'webssh_conn_history', area: 'local', purpose: 'Connection history (Termius-style)' },
  macros: { key: 'webssh_macros', area: 'local', purpose: 'Automation macros' },
  macroSchedules: { key: 'webssh_macro_schedules', area: 'local', purpose: 'Scheduled macro runs' },
  mcpClients: { key: 'webssh_mcp_clients', area: 'local', purpose: 'MCP client configurations' },
  snippets: { key: 'webssh_snippets', area: 'local', purpose: 'Favorite command snippets' },
  recentCommands: { key: 'webssh_recent_commands', area: 'local', purpose: 'Recent commands typed in the terminal' },

  // ── Terminal sessions (session-only; never persisted across restarts) ──
  sessions: { key: 'webssh_saved_sessions', area: 'session', purpose: 'Open terminal sessions for this tab' },
  paneConfigs: { key: 'webssh_pane_configs', area: 'session', purpose: 'Split-pane layout for this tab' },
} as const satisfies Record<string, StorageKeyDef>;

export type StorageKeyName = keyof typeof STORAGE_KEYS;

function areaApi(area: StorageArea): Storage {
  return area === 'local' ? localStorage : sessionStorage;
}

function apiOf(name: StorageKeyName): Storage {
  return areaApi(STORAGE_KEYS[name].area);
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Read a registered key from its declared storage area. */
export function storageGet(name: StorageKeyName): string | null {
  try { return apiOf(name).getItem(STORAGE_KEYS[name].key); } catch { return null; }
}

/** Write a registered key to its declared storage area. */
export function storageSet(name: StorageKeyName, value: string): void {
  try { apiOf(name).setItem(STORAGE_KEYS[name].key, value); } catch { /* storage unavailable */ }
}

/** Remove a registered key from its declared storage area. */
export function storageRemove(name: StorageKeyName): void {
  try { apiOf(name).removeItem(STORAGE_KEYS[name].key); } catch { /* storage unavailable */ }
}

/** Read + JSON.parse a registered key, falling back when absent/corrupt. */
export function storageGetJSON<T>(name: StorageKeyName, fallback: T): T {
  try {
    const raw = storageGet(name);
    return raw !== null ? JSON.parse(raw) as T : fallback;
  } catch { return fallback; }
}

/** JSON.stringify + write a registered key. */
export function storageSetJSON(name: StorageKeyName, value: unknown): void {
  try { storageSet(name, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

/** Read a key derived from a registered prefix: `${prefix}${suffix}`. */
export function storageGetPrefixed(prefixName: StorageKeyName, suffix: string): string | null {
  try { return apiOf(prefixName).getItem(STORAGE_KEYS[prefixName].key + suffix); } catch { return null; }
}

/** Write a key derived from a registered prefix: `${prefix}${suffix}`. */
export function storageSetPrefixed(prefixName: StorageKeyName, suffix: string, value: string): void {
  try { apiOf(prefixName).setItem(STORAGE_KEYS[prefixName].key + suffix, value); } catch { /* storage unavailable */ }
}

/** Remove a key derived from a registered prefix: `${prefix}${suffix}`. */
export function storageRemovePrefixed(prefixName: StorageKeyName, suffix: string): void {
  try { apiOf(prefixName).removeItem(STORAGE_KEYS[prefixName].key + suffix); } catch { /* storage unavailable */ }
}

/** List the suffixes of all stored keys under a registered prefix. */
export function storageListPrefixed(prefixName: StorageKeyName): string[] {
  const def = STORAGE_KEYS[prefixName];
  const out: string[] = [];
  try {
    const api = apiOf(prefixName);
    for (let i = 0; i < api.length; i++) {
      const k = api.key(i);
      if (k && k.startsWith(def.key)) out.push(k.slice(def.key.length));
    }
  } catch { /* storage unavailable */ }
  return out;
}
