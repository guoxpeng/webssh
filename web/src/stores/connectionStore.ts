import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { testSshConnection as apiTestSsh } from '@/services/apiService';
import SshWebSocketService from '@/services/sshWebSocketService';
import { ConnectionStatus, getApiBaseUrl } from '@/utils/constants';
import { storageGet, storageSet, storageRemove, storageGetJSON, storageSetJSON, storageGetPrefixed, storageSetPrefixed, storageRemovePrefixed, storageListPrefixed } from '@/utils/storage';
import type { ConnectionStatusType } from '@/utils/constants';
import { encrypt, decrypt } from '@/utils/cryptoService';
import { encryptCredential, decryptCredential } from '@/utils/crypto';
import { apiFetch } from '@/utils/api';

export interface NodeConfig {
  id?: string;
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  auth_type?: 'password' | 'key';
  auth_value?: string;
  rememberForSession?: boolean;
  protocol?: string;
  group?: string;
  pinned?: boolean;
  [key: string]: any;
}

interface Credential {
  auth_type: 'password' | 'key';
  auth_value: string;
  encrypted?: boolean;
}



interface TestResult {
  success: boolean;
  error?: string[];
  output?: string[];
  node?: NodeConfig;
  cmds?: string;
  time_elapsed?: number;
}

// Loads the saved connection list. The current key is LOCAL_STORAGE_CONNECTIONS_KEY;
// older builds stored it under LEGACY_CONNECTIONS_KEY, which is read as a
// fallback and migrated (write new, remove old) so existing installs keep
// their data. Never write to the legacy key.
function loadSavedConnections(): NodeConfig[] {
  try {
    const raw = storageGet('connections');
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
    const legacyRaw = storageGet('legacyConnections');
    if (legacyRaw !== null) {
      const parsed = JSON.parse(legacyRaw);
      if (Array.isArray(parsed)) {
        storageSet('connections', JSON.stringify(parsed));
        storageRemove('legacyConnections');
        return parsed;
      }
    }
  } catch {
    // Corrupted JSON — start with an empty list.
  }
  return [];
}

// Internal sentinel for the "failed to connect" pseudo-group. It is persisted
// as a connection's `group` field, so it must stay language-neutral — the
// display name is localized via t('server.failedGroup'). An older build used a
// literal Chinese value for this sentinel; LEGACY_FAILED_GROUP migrates it.
export const FAILED_GROUP = '__failed__';
// Legacy persisted value written by builds that predated the language-neutral
// sentinel. It only ever appears in already-persisted data and is never shown
// in the UI, hence the explicit i18n-ignore opt-out.
const LEGACY_FAILED_GROUP = '未成功连接'; // i18n-ignore: legacy data migration

export const useConnectionStore = defineStore('connection', () => {
  const currentNodeDetails = ref<NodeConfig | null>(null);
  const connectionStatus = ref<ConnectionStatusType>(ConnectionStatus.DISCONNECTED);
  const sshTestResult = ref<TestResult | null>(null);
  const sshTestLoading = ref<boolean>(false);
  // Persisted across restarts in localStorage (see loadSavedConnections for
  // the legacy-key migration).
  const savedConnections = ref<NodeConfig[]>(loadSavedConnections());
  const sessionRememberedCredentials = ref<Record<string, Credential>>({});
  const wsService = new SshWebSocketService();
  const pendingConnections = ref<NodeConfig[]>([]);

  const groupOrder = ref<string[]>(storageGetJSON('groupOrder', []));
  const groupCollapsed = ref<Set<string>>(new Set(storageGetJSON('groupCollapsed', [])));

  // Migrate the legacy Chinese failed-group sentinel to the language-neutral
  // value so persisted lists round-trip regardless of UI language.
  (function migrateLegacyFailedGroup() {
    const legacy = LEGACY_FAILED_GROUP;
    let dirty = false;
    for (const c of savedConnections.value) {
      if (c.group === legacy) { c.group = FAILED_GROUP; dirty = true; }
    }
    const gi = groupOrder.value.indexOf(legacy);
    if (gi !== -1) { groupOrder.value[gi] = FAILED_GROUP; dirty = true; }
    if (groupCollapsed.value.delete(legacy)) {
      groupCollapsed.value.add(FAILED_GROUP);
      dirty = true;
    }
    if (dirty) {
      storageSetJSON('connections', savedConnections.value);
      storageSetJSON('groupOrder', groupOrder.value);
      storageSetJSON('groupCollapsed', Array.from(groupCollapsed.value));
    }
  })();

  function persistGroupOrder() {
    storageSetJSON('groupOrder', groupOrder.value);
  }
  function persistGroupCollapsed() {
    storageSetJSON('groupCollapsed', Array.from(groupCollapsed.value));
  }

  // ── Server-side connection sync (Cloudflare R2) ──
  // On CF the saved connection list (metadata only — never credentials) is
  // mirrored to R2 so it survives deployments and fresh browser origins.
  // On backends without /api/cloud/backup (self-hosted, APK) this stays off.
  const cloudSyncAvailable = ref(false);
  let cloudSyncTimer = null;

  function stripCredentials(list) {
    return (list || []).map((c) => {
      const { auth_value, ...rest } = c || {};
      return rest;
    });
  }

  async function probeCloudConnections() {
    try {
      const res = await apiFetch(`${getApiBaseUrl()}/cloud/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getConnections' }),
      });
      if (!res.ok) { cloudSyncAvailable.value = false; return; }
      const data = await res.json();
      cloudSyncAvailable.value = true;
      // Hydrate from R2 only when the local list is empty (fresh origin /
      // browser). If we already have local data, local wins and is pushed up.
      if (savedConnections.value.length === 0 && data.exists && Array.isArray(data.connections) && data.connections.length) {
        savedConnections.value = stripCredentials(data.connections);
        if (Array.isArray(data.groupOrder) && data.groupOrder.length) groupOrder.value = data.groupOrder;
        if (Array.isArray(data.groupCollapsed) && data.groupCollapsed.length) groupCollapsed.value = new Set(data.groupCollapsed);
        _saveConnectionsToLocalStorage();
      }
    } catch {
      cloudSyncAvailable.value = false;
    }
  }

  function queueCloudSync() {
    if (!cloudSyncAvailable.value) return;
    if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(() => {
      cloudSyncTimer = null;
      pushConnectionsToCloud();
    }, 800);
  }

  async function pushConnectionsToCloud() {
    try {
      await apiFetch(`${getApiBaseUrl()}/cloud/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'saveConnections',
          connections: stripCredentials(savedConnections.value),
          groupOrder: groupOrder.value,
          groupCollapsed: Array.from(groupCollapsed.value),
        }),
      });
    } catch {
      // Backend unreachable — the local copy stays authoritative; the next
      // mutation retries the push.
    }
  }

  const isConnected = computed(() => connectionStatus.value === ConnectionStatus.CONNECTED);

  const groups = computed(() => {
    const gs = new Set<string>();
    gs.add('Ungrouped');
    gs.add(FAILED_GROUP);
    for (const c of savedConnections.value) {
      if (c.group) gs.add(c.group);
    }
    // Also include groups from groupOrder that have no connections yet
    for (const g of groupOrder.value) {
      if (g) gs.add(g);
    }
    const all = Array.from(gs);
    const ordered = groupOrder.value.filter(g => all.includes(g));
    const remainder = all.filter(g => !groupOrder.value.includes(g));
    return [...ordered, ...remainder];
  });

  const pinnedConnections = computed(() =>
    savedConnections.value.filter(c => c.pinned)
  );

  function connectionsByGroup(groupName) {
    if (groupName === 'Ungrouped') return savedConnections.value.filter(c => !c.group);
    return savedConnections.value.filter(c => c.group === groupName);
  }

  function generateConnectionId() {
    return `conn_${Date.now().toString(36)}${Math.random().toString(36).substring(2)}`;
  }

  function createGroup(name) {
    if (!name || name === 'Ungrouped' || name === FAILED_GROUP) return false;
    if (groups.value.includes(name)) return false;
    groupOrder.value.push(name);
    persistGroupOrder();
    return true;
  }

  function renameGroup(oldName, newName) {
    if (!newName || newName === 'Ungrouped' || oldName === 'Ungrouped' || oldName === FAILED_GROUP) return false;
    for (const c of savedConnections.value) {
      if (c.group === oldName) c.group = newName;
    }
    const idx = groupOrder.value.indexOf(oldName);
    if (idx !== -1) { groupOrder.value[idx] = newName; persistGroupOrder(); }
    _saveConnectionsToLocalStorage();
    return true;
  }

  function deleteGroup(name) {
    if (name === 'Ungrouped') return false;
    for (const c of savedConnections.value) {
      if (c.group === name) c.group = '';
    }
    groupOrder.value = groupOrder.value.filter(g => g !== name);
    persistGroupOrder();
    _saveConnectionsToLocalStorage();
    return true;
  }

  function moveConnectionToGroup(connId, newGroup) {
    const conn = savedConnections.value.find(c => c.id === connId);
    if (!conn) return;
    const target = (newGroup && newGroup !== 'Ungrouped') ? newGroup : '';
    if ((conn.group || '') === target) return;
    conn.group = target;
    savedConnections.value = [...savedConnections.value];
    _saveConnectionsToLocalStorage();
  }

  function toggleGroupCollapsed(name) {
    if (groupCollapsed.value.has(name)) groupCollapsed.value.delete(name);
    else groupCollapsed.value.add(name);
    groupCollapsed.value = new Set(groupCollapsed.value);
    persistGroupCollapsed();
  }

  function isGroupCollapsed(name) {
    return groupCollapsed.value.has(name);
  }

  function togglePinConnection(id) {
    const conn = savedConnections.value.find(c => c.id === id);
    if (!conn) return;
    conn.pinned = !conn.pinned;
    _saveConnectionsToLocalStorage();
  }

  async function loadCredentialsFromSessionStorage() {
    const creds = {};
    for (const serverId of storageListPrefixed('sessionCredPrefix')) {
      const storedValue = storageGetPrefixed('sessionCredPrefix', serverId);
      if (storedValue) {
        try {
          const parsed = JSON.parse(storedValue);
          if (parsed.encrypted) parsed.auth_value = await decrypt(parsed.auth_value);
          creds[serverId] = parsed;
        } catch {
          creds[serverId] = { auth_value: storedValue, auth_type: 'password' };
        }
      }
    }
    sessionRememberedCredentials.value = creds;
  }

  async function saveCredentialToSessionStorage(serverId, authType, authValue) {
    if (!serverId || !authValue || !authType) return;
    const encrypted = await encrypt(authValue);
    storageSetPrefixed('sessionCredPrefix', serverId, JSON.stringify({ auth_type: authType, auth_value: encrypted, encrypted: true }));
    sessionRememberedCredentials.value[serverId] = { auth_type: authType, auth_value: authValue };
  }

  async function getCredentialFromSessionStorage(serverId) {
    if (!serverId) return null;
    if (sessionRememberedCredentials.value[serverId]) return sessionRememberedCredentials.value[serverId];
    const storedValue = storageGetPrefixed('sessionCredPrefix', serverId);
    if (storedValue) {
      try {
        const parsed = JSON.parse(storedValue);
        if (parsed.encrypted) parsed.auth_value = await decrypt(parsed.auth_value);
        sessionRememberedCredentials.value[serverId] = parsed;
        return parsed;
      } catch {
        sessionRememberedCredentials.value[serverId] = { auth_value: storedValue, auth_type: 'password' };
        return sessionRememberedCredentials.value[serverId];
      }
    }
    return null;
  }

  function _xorDeobfuscate(encoded, key) {
    try {
      const buf = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
      const keyBytes = new TextEncoder().encode(key);
      for (let i = 0; i < buf.length; i++) buf[i] ^= keyBytes[i % keyBytes.length];
      return new TextDecoder().decode(buf);
    } catch { return null; }
  }

  // Local (persistent) credentials are AES-GCM encrypted with the master
  // password (v2). Legacy v1 entries used XOR keyed by serverId — those are
  // decoded on read and transparently migrated to v2.
  async function saveCredentialToLocalStorage(serverId, authType, authValue) {
    if (!serverId || !authValue) return;
    const master = storageGet('sessionMaster') || '';
    if (!master) return; // locked — never persist plaintext fallbacks
    try {
      const enc = await encryptCredential(authValue, master);
      storageSetPrefixed('localCredPrefix', serverId, JSON.stringify({ auth_type: authType, auth_value: enc, enc: 'v2' }));
    } catch {}
  }

  async function getCredentialFromLocalStorage(serverId) {
    if (!serverId) return null;
    const raw = storageGetPrefixed('localCredPrefix', serverId);
    if (!raw) return null;
    const master = storageGet('sessionMaster') || '';
    try {
      const parsed = JSON.parse(raw);
      if (parsed.enc === 'v2') {
        if (!master) return null;
        const decoded = await decryptCredential(parsed.auth_value, master);
        if (decoded) return { auth_type: parsed.auth_type, auth_value: decoded };
        return null;
      }
      // Legacy v1 (XOR obfuscation) — decode, then migrate to AES in place.
      const decoded = _xorDeobfuscate(parsed.auth_value, serverId);
      if (decoded) {
        if (master) {
          encryptCredential(decoded, master)
            .then((enc) => storageSetPrefixed('localCredPrefix', serverId, JSON.stringify({ auth_type: parsed.auth_type, auth_value: enc, enc: 'v2' })))
            .catch(() => {});
        }
        return { auth_type: parsed.auth_type, auth_value: decoded };
      }
    } catch {}
    return null;
  }

  function clearCredentialFromLocalStorage(serverId) {
    if (!serverId) return;
    storageRemovePrefixed('localCredPrefix', serverId);
  }

  function clearCredentialFromSessionStorage(serverId) {
    if (!serverId) return;
    storageRemovePrefixed('sessionCredPrefix', serverId);
    delete sessionRememberedCredentials.value[serverId];
  }

  function clearAllSessionCredentials() {
    for (const serverId of storageListPrefixed('sessionCredPrefix')) {
      storageRemovePrefixed('sessionCredPrefix', serverId);
    }
    sessionRememberedCredentials.value = {};
  }

  // Remove every locally persisted credential (localStorage, XOR-obfuscated).
  function clearAllLocalCredentials() {
    const serverIds = storageListPrefixed('localCredPrefix');
    for (const serverId of serverIds) {
      storageRemovePrefixed('localCredPrefix', serverId);
    }
    return serverIds.length;
  }

  // Re-encrypt remembered session credentials after a master-password change.
  // They are AES-locked to the OLD password; without this rotation they would
  // silently fail to decrypt after the user changes the password.
  async function reencryptSessionCredentials(oldPassword: string, newPassword: string): Promise<number> {
    let moved = 0;
    for (const serverId of storageListPrefixed('sessionCredPrefix')) {
      try {
        const parsed = JSON.parse(storageGetPrefixed('sessionCredPrefix', serverId) || '');
        if (!parsed?.encrypted) continue;
        const plain = await decryptCredential(parsed.auth_value, oldPassword);
        parsed.auth_value = await encryptCredential(plain, newPassword);
        storageSetPrefixed('sessionCredPrefix', serverId, JSON.stringify(parsed));
        moved++;
      } catch { /* entry from another password generation — leave untouched */ }
    }
    return moved;
  }

  function isModelSyncEnabled(): boolean {
    return storageGet('modelSync') === 'true';
  }

  function setModelSyncEnabled(val: boolean) {
    if (val) storageSet('modelSync', 'true');
    else storageRemove('modelSync');
  }

  // Push saved connections (with locally stored credentials) to the server-side
  // model registry so the local-model API (/api/model/*) can log in and exec.
  // Opt-in only: does nothing unless the user enabled it in Settings.
  async function syncSavedServersToBackend(): Promise<{ success: boolean; synced?: number; error?: string }> {
    if (!isModelSyncEnabled()) return { success: false, error: 'model sync disabled' };
    const servers = [];
    for (const conn of savedConnections.value) {
      if (!conn.host || !conn.username) continue;
      if (conn.protocol && conn.protocol !== 'ssh') continue;
      let authValue = '';
      let authType = conn.auth_type || 'password';
      const localCred = conn.id ? await getCredentialFromLocalStorage(conn.id) : null;
      if (localCred?.auth_value) { authValue = localCred.auth_value; authType = localCred.auth_type; }
      else {
        const sessionCred = conn.id ? sessionRememberedCredentials.value[conn.id] : null;
        if (sessionCred?.auth_value) { authValue = sessionCred.auth_value; authType = sessionCred.auth_type; }
      }
      if (!authValue) continue; // only servers we can actually log in to
      servers.push({
        name: conn.name || `${conn.username}@${conn.host}`,
        host: conn.host, port: conn.port || 22, username: conn.username,
        auth_type: authType, auth_value: authValue,
      });
    }
    try {
      const res = await apiFetch(`${getApiBaseUrl()}/model/servers/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: data?.error || `HTTP ${res.status}` };
      // Guard against non-JSON 200 responses (e.g. SPA fallback on hosts without
      // the model API, like Cloudflare Workers) — treat as a failed sync.
      if (data?.success !== true) return { success: false, error: 'Model API not available on this backend' };
      return { success: true, synced: data.synced?.length ?? servers.length };
    } catch (e) { return { success: false, error: e.message }; }
  }

  // Wipe the server-side model registry (used when the sync toggle is turned off).
  async function clearBackendModelServers(): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await apiFetch(`${getApiBaseUrl()}/model/servers/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servers: [] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: data?.error || `HTTP ${res.status}` };
      if (data?.success !== true) return { success: false, error: 'Model API not available on this backend' };
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  }

  // Persists the saved server list to localStorage (the `connections` key in
  // the storage registry). Historically misnamed _...ToSessionStorage even
  // though it always wrote localStorage — renamed to match the real API.
  function _saveConnectionsToLocalStorage() {
    storageSetJSON('connections', savedConnections.value);
    queueCloudSync();
  }

  function addConnection(nodeConfigPassed) {
    const configToSave = { ...nodeConfigPassed };
    delete configToSave.auth_value;
    delete configToSave.rememberForSession;

    let definitiveId = configToSave.id;
    const existingById = definitiveId ? savedConnections.value.find(c => c.id === definitiveId) : null;
    const existingByName = savedConnections.value.find(c => c.name === configToSave.name);

    if (existingById) {
      const index = savedConnections.value.findIndex(c => c.id === definitiveId);
      savedConnections.value.splice(index, 1, { ...configToSave });
    } else if (existingByName) {
      definitiveId = existingByName.id;
      const index = savedConnections.value.findIndex(c => c.id === definitiveId);
      savedConnections.value.splice(index, 1, { ...configToSave, id: definitiveId });
    } else {
      if (!definitiveId) definitiveId = generateConnectionId();
      savedConnections.value.push({ ...configToSave, id: definitiveId });
    }

    _saveConnectionsToLocalStorage();
    void syncSavedServersToBackend();
    return { ...nodeConfigPassed, id: definitiveId };
  }

  function removeConnection(id) {
    const idx = savedConnections.value.findIndex(c => c.id === id);
    if (idx > -1) {
      savedConnections.value.splice(idx, 1);
      _saveConnectionsToLocalStorage();
      clearCredentialFromSessionStorage(id);
      clearCredentialFromLocalStorage(id);
      if (currentNodeDetails.value && currentNodeDetails.value.id === id) currentNodeDetails.value = null;
      void syncSavedServersToBackend();
    }
  }

  function loadConnectionForEditing(id) {
    const conn = savedConnections.value.find(c => c.id === id);
    if (!conn) return Promise.resolve();
    // Returns the promise so callers can await before reading currentNodeDetails
    return getCredentialFromSessionStorage(id).then(async remembered => {
      if (!remembered?.auth_value) {
        remembered = await getCredentialFromLocalStorage(id);
        if (remembered?.auth_value) {
          await saveCredentialToSessionStorage(id, remembered.auth_type, remembered.auth_value);
        }
      }
      setCurrentNodeDetails({
        ...conn,
        auth_type: remembered ? remembered.auth_type : (conn.auth_type || 'password'),
        auth_value: remembered?.auth_value || '',
        rememberForSession: !!remembered
      });
    });
  }

  function setCurrentNodeDetails(details) { currentNodeDetails.value = details; }
  function setConnectionStatus(status) { connectionStatus.value = status; }

  function saveFailedConnection(config: NodeConfig) {
    if (!config || (!config.host && !config.name)) return;
    if (!groups.value.includes(FAILED_GROUP)) {
      createGroup(FAILED_GROUP);
    }
    const displayName = config.name || `${config.username || ''}@${config.host || ''}:${config.port || 22}`;
    const exists = savedConnections.value.find(c =>
      c.host === config.host && c.port === config.port && c.username === config.username
    );
    if (exists) {
      if ((exists.group || '') !== FAILED_GROUP) {
        exists.group = FAILED_GROUP;
        savedConnections.value = [...savedConnections.value];
        _saveConnectionsToLocalStorage();
      }
      return;
    }
    const entry: NodeConfig = {
      id: generateConnectionId(),
      name: displayName,
      host: config.host,
      port: config.port || 22,
      username: config.username,
      protocol: config.protocol || 'ssh',
      group: FAILED_GROUP,
      auth_type: config.auth_type || 'password',
    };
    savedConnections.value.push(entry);
    _saveConnectionsToLocalStorage();
  }

  function moveConnectionOutOfFailedGroup(connId: string) {
    const conn = savedConnections.value.find(c => c.id === connId);
    if (conn && conn.group === FAILED_GROUP) {
      conn.group = '';
      savedConnections.value = [...savedConnections.value];
      _saveConnectionsToLocalStorage();
    }
  }

  async function testConnection(nodeConfig, cmds = ["echo 'Connection test OK' && date"]) {
    sshTestLoading.value = true;
    setConnectionStatus(ConnectionStatus.CONNECTING);

    let configForTest = { ...nodeConfig };
    let effectiveAuthValue = configForTest.auth_value;
    let effectiveAuthType = configForTest.auth_type;

    if (!effectiveAuthValue && configForTest.id && configForTest.rememberForSession) {
      const remembered = await getCredentialFromSessionStorage(configForTest.id);
      if (remembered?.auth_value) { effectiveAuthValue = remembered.auth_value; effectiveAuthType = remembered.auth_type; }
    }

    if (!effectiveAuthValue) {
      sshTestLoading.value = false;
      setConnectionStatus(ConnectionStatus.ERROR);
      const msg = 'Connection requires password or key.';
      const nodeForError = { ...configForTest, auth_value: '***', id: configForTest.id };
      sshTestResult.value = { success: false, error: [msg], output: [], node: nodeForError, cmds: cmds.join(' && '), time_elapsed: 0 };
      return sshTestResult.value;
    }

    const finalConfig = { ...configForTest, auth_type: effectiveAuthType, auth_value: effectiveAuthValue };

    try {
      const result = await apiTestSsh(finalConfig, cmds);
      const displayNode = { ...(result.node || configForTest), auth_value: '***', id: configForTest.id || result.node?.id };
      sshTestResult.value = { ...result, node: displayNode };
      setConnectionStatus(result.success ? ConnectionStatus.DISCONNECTED : ConnectionStatus.ERROR);
      return sshTestResult.value;
    } catch (error) {
      const msg = error.message || 'API call failed';
      sshTestResult.value = { success: false, error: [msg], output: [], node: { ...configForTest, auth_value: '***', id: configForTest.id }, cmds: cmds.join(' && '), time_elapsed: 0 };
      setConnectionStatus(ConnectionStatus.ERROR);
      return sshTestResult.value;
    } finally {
      sshTestLoading.value = false;
    }
  }

  let onCommandSentCallback = null;

  function connectToShell(nodeConfigFromForm, terminalCallbacks) {
    if (wsService.getReadyState() === WebSocket.OPEN) wsService.disconnect(true);
    setConnectionStatus(ConnectionStatus.CONNECTING);
    let finalNodeConfig = { ...nodeConfigFromForm };

    const doConnect = async () => {
      if (!finalNodeConfig.auth_value && finalNodeConfig.id && finalNodeConfig.rememberForSession) {
        const remembered = await getCredentialFromSessionStorage(finalNodeConfig.id);
        if (remembered?.auth_value) { finalNodeConfig.auth_value = remembered.auth_value; finalNodeConfig.auth_type = remembered.auth_type; }
      }

      if (finalNodeConfig.protocol !== 'serial' && !finalNodeConfig.auth_value) {
        setConnectionStatus(ConnectionStatus.ERROR);
        if (terminalCallbacks.onError) terminalCallbacks.onError(new Error('Connection requires password or key.'));
        return;
      }

      if (finalNodeConfig.rememberForSession && !finalNodeConfig.id) finalNodeConfig.id = generateConnectionId();

      wsService.connect(finalNodeConfig, {
        onOpen: () => {
          setConnectionStatus(ConnectionStatus.CONNECTED);
          if (finalNodeConfig.id && finalNodeConfig.auth_value) {
            saveCredentialToSessionStorage(finalNodeConfig.id, finalNodeConfig.auth_type, finalNodeConfig.auth_value);
          }
          if (terminalCallbacks.onOpen) terminalCallbacks.onOpen();
        },
        onMessage: (data) => { if (terminalCallbacks.onMessage) terminalCallbacks.onMessage(data); },
        onClose: (event, manual) => {
          if (connectionStatus.value === ConnectionStatus.CONNECTED || connectionStatus.value === ConnectionStatus.CONNECTING) {
            setConnectionStatus(event.wasClean && manual ? ConnectionStatus.DISCONNECTED : ConnectionStatus.ERROR);
          }
          if (terminalCallbacks.onClose) terminalCallbacks.onClose(event);
        },
        onError: (err) => { setConnectionStatus(ConnectionStatus.ERROR); if (terminalCallbacks.onError) terminalCallbacks.onError(err); }
      });
    };
    doConnect();
  }

  function sendShellData(data) {
    if (isConnected.value) {
      if (onCommandSentCallback) onCommandSentCallback(data);
      wsService.sendMessage(data);
    }
  }
  function setOnCommandSentCallback(cb) { onCommandSentCallback = cb; }
  function disconnectShell() { wsService.disconnect(); }

  // Initial cloud probe, plus re-probe when the backend address/token changes
  // (e.g. the user fills in AUTH_TOKEN in Settings after the first load).
  probeCloudConnections();
  if (typeof window !== 'undefined') {
    window.addEventListener('backend-config-changed', probeCloudConnections);
  }

  return {
    currentNodeDetails, connectionStatus, sshTestResult, sshTestLoading,
    savedConnections, groups, connectionsByGroup, groupOrder, groupCollapsed,
    pinnedConnections, sessionRememberedCredentials, isConnected, pendingConnections,
    setCurrentNodeDetails, setConnectionStatus, testConnection,
    connectToShell, sendShellData, setOnCommandSentCallback, disconnectShell,
    addConnection, removeConnection, loadConnectionForEditing,
    getCredentialFromSessionStorage, saveCredentialToSessionStorage, loadCredentialsFromSessionStorage, clearAllSessionCredentials,
    saveCredentialToLocalStorage, getCredentialFromLocalStorage, clearCredentialFromLocalStorage, clearAllLocalCredentials,
    reencryptSessionCredentials,
    createGroup, renameGroup, deleteGroup, moveConnectionToGroup, moveConnectionOutOfFailedGroup,
    saveFailedConnection, toggleGroupCollapsed, isGroupCollapsed, togglePinConnection,
    isModelSyncEnabled, setModelSyncEnabled, syncSavedServersToBackend, clearBackendModelServers,
    refreshCloudConnections: probeCloudConnections,
  };
});
