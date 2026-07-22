import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { testSshConnection as apiTestSsh } from '@/services/apiService';
import SshWebSocketService from '@/services/sshWebSocketService';
import { ConnectionStatus, SESSION_STORAGE_CRED_PREFIX, SESSION_STORAGE_CONNECTIONS_KEY } from '@/utils/constants';
import type { ConnectionStatusType } from '@/utils/constants';
import { encrypt, decrypt } from '@/utils/cryptoService';

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

interface TerminalCallbacks {
  onOpen?: () => void;
  onMessage?: (data: any) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (error: Error) => void;
}

interface TestResult {
  success: boolean;
  error?: string[];
  output?: string[];
  node?: NodeConfig;
  cmds?: string;
  time_elapsed?: number;
}

const GROUP_ORDER_KEY = 'haossh_group_order';
const GROUP_COLLAPSED_KEY = 'haossh_group_collapsed';

function loadJSON(key, fallback) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
}

export const useConnectionStore = defineStore('connection', () => {
  const currentNodeDetails = ref<NodeConfig | null>(null);
  const connectionStatus = ref<ConnectionStatusType>(ConnectionStatus.DISCONNECTED);
  const sshTestResult = ref<TestResult | null>(null);
  const sshTestLoading = ref<boolean>(false);
  const savedConnections = ref<NodeConfig[]>(JSON.parse(sessionStorage.getItem(SESSION_STORAGE_CONNECTIONS_KEY) || '[]'));
  const sessionRememberedCredentials = ref<Record<string, Credential>>({});
  const wsService = new SshWebSocketService();
  const pendingConnections = ref<NodeConfig[]>([]);

  const groupOrder = ref<string[]>(loadJSON(GROUP_ORDER_KEY, []));
  const groupCollapsed = ref<Set<string>>(new Set(loadJSON(GROUP_COLLAPSED_KEY, [])));

  function persistGroupOrder() {
    localStorage.setItem(GROUP_ORDER_KEY, JSON.stringify(groupOrder.value));
  }
  function persistGroupCollapsed() {
    localStorage.setItem(GROUP_COLLAPSED_KEY, JSON.stringify(Array.from(groupCollapsed.value)));
  }

  const isConnected = computed(() => connectionStatus.value === ConnectionStatus.CONNECTED);

  const groups = computed(() => {
    const gs = new Set<string>();
    gs.add('Ungrouped');
    for (const c of savedConnections.value) {
      if (c.group) gs.add(c.group);
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
    if (!name || name === 'Ungrouped') return false;
    if (groups.value.includes(name)) return false;
    groupOrder.value.push(name);
    persistGroupOrder();
    return true;
  }

  function renameGroup(oldName, newName) {
    if (!newName || newName === 'Ungrouped' || oldName === 'Ungrouped') return false;
    for (const c of savedConnections.value) {
      if (c.group === oldName) c.group = newName;
    }
    const idx = groupOrder.value.indexOf(oldName);
    if (idx !== -1) { groupOrder.value[idx] = newName; persistGroupOrder(); }
    _saveConnectionsToSessionStorage();
    return true;
  }

  function deleteGroup(name) {
    if (name === 'Ungrouped') return false;
    for (const c of savedConnections.value) {
      if (c.group === name) c.group = '';
    }
    groupOrder.value = groupOrder.value.filter(g => g !== name);
    persistGroupOrder();
    _saveConnectionsToSessionStorage();
    return true;
  }

  function moveConnectionToGroup(connId, newGroup) {
    const conn = savedConnections.value.find(c => c.id === connId);
    if (!conn) return;
    conn.group = newGroup || '';
    _saveConnectionsToSessionStorage();
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
    _saveConnectionsToSessionStorage();
  }

  async function loadCredentialsFromSessionStorage() {
    const creds = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(SESSION_STORAGE_CRED_PREFIX)) {
        const serverId = key.substring(SESSION_STORAGE_CRED_PREFIX.length);
        const storedValue = sessionStorage.getItem(key);
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
    }
    sessionRememberedCredentials.value = creds;
  }

  async function saveCredentialToSessionStorage(serverId, authType, authValue) {
    if (!serverId || !authValue || !authType) return;
    const encrypted = await encrypt(authValue);
    sessionStorage.setItem(`${SESSION_STORAGE_CRED_PREFIX}${serverId}`, JSON.stringify({ auth_type: authType, auth_value: encrypted, encrypted: true }));
    sessionRememberedCredentials.value[serverId] = { auth_type: authType, auth_value: authValue };
  }

  async function getCredentialFromSessionStorage(serverId) {
    if (!serverId) return null;
    if (sessionRememberedCredentials.value[serverId]) return sessionRememberedCredentials.value[serverId];
    const key = `${SESSION_STORAGE_CRED_PREFIX}${serverId}`;
    const storedValue = sessionStorage.getItem(key);
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

  function clearCredentialFromSessionStorage(serverId) {
    if (!serverId) return;
    sessionStorage.removeItem(`${SESSION_STORAGE_CRED_PREFIX}${serverId}`);
    delete sessionRememberedCredentials.value[serverId];
  }

  function clearAllSessionCredentials() {
    const keysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(SESSION_STORAGE_CRED_PREFIX)) keysToRemove.push(key);
    }
    keysToRemove.forEach(key => sessionStorage.removeItem(key));
    sessionRememberedCredentials.value = {};
  }

  function _saveConnectionsToSessionStorage() {
    sessionStorage.setItem(SESSION_STORAGE_CONNECTIONS_KEY, JSON.stringify(savedConnections.value));
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

    _saveConnectionsToSessionStorage();
    return { ...nodeConfigPassed, id: definitiveId };
  }

  function removeConnection(id) {
    const idx = savedConnections.value.findIndex(c => c.id === id);
    if (idx > -1) {
      savedConnections.value.splice(idx, 1);
      _saveConnectionsToSessionStorage();
      clearCredentialFromSessionStorage(id);
      if (currentNodeDetails.value && currentNodeDetails.value.id === id) currentNodeDetails.value = null;
    }
  }

  function loadConnectionForEditing(id) {
    const conn = savedConnections.value.find(c => c.id === id);
    if (conn) {
      getCredentialFromSessionStorage(id).then(remembered => {
        setCurrentNodeDetails({
          ...conn,
          auth_type: remembered ? remembered.auth_type : (conn.auth_type || 'password'),
          auth_value: remembered?.auth_value || '',
          rememberForSession: !!remembered
        });
      });
    }
  }

  function setCurrentNodeDetails(details) { currentNodeDetails.value = details; }
  function setConnectionStatus(status) { connectionStatus.value = status; }

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

  async function getConnectionsWithCredentials() {
    const result = [];
    for (const c of savedConnections.value) {
      const entry = { ...c };
      try {
        const cred = await getCredentialFromSessionStorage(c.id);
        if (cred?.auth_value) {
          entry.auth_value = cred.auth_value;
          entry.auth_type = cred.auth_type || 'password';
        }
      } catch {}
      result.push(entry);
    }
    return result;
  }

  return {
    currentNodeDetails, connectionStatus, sshTestResult, sshTestLoading,
    savedConnections, groups, connectionsByGroup, groupOrder, groupCollapsed,
    pinnedConnections, sessionRememberedCredentials, isConnected, pendingConnections,
    setCurrentNodeDetails, setConnectionStatus, testConnection,
    connectToShell, sendShellData, setOnCommandSentCallback, disconnectShell,
    addConnection, removeConnection, loadConnectionForEditing,
    getCredentialFromSessionStorage, saveCredentialToSessionStorage, loadCredentialsFromSessionStorage, clearAllSessionCredentials,
    getConnectionsWithCredentials,
    createGroup, renameGroup, deleteGroup, moveConnectionToGroup,
    toggleGroupCollapsed, isGroupCollapsed, togglePinConnection,
  };
});
