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

export const useConnectionStore = defineStore('connection', () => {
  const currentNodeDetails = ref<NodeConfig | null>(null);
  const connectionStatus = ref<ConnectionStatusType>(ConnectionStatus.DISCONNECTED);
  const sshTestResult = ref<TestResult | null>(null);
  const sshTestLoading = ref<boolean>(false);
  const savedConnections = ref<NodeConfig[]>(JSON.parse(sessionStorage.getItem(SESSION_STORAGE_CONNECTIONS_KEY) || '[]'));
  const sessionRememberedCredentials = ref<Record<string, Credential>>({});
  const wsService = new SshWebSocketService();

  const isConnected = computed(() => connectionStatus.value === ConnectionStatus.CONNECTED);

  const groups = computed(() => {
    const gs = new Set<string>();
    gs.add('Ungrouped');
    for (const c of savedConnections.value) {
      if (c.group) gs.add(c.group);
    }
    return Array.from(gs).sort();
  });

  function connectionsByGroup(groupName: string): NodeConfig[] {
    if (groupName === 'Ungrouped') return savedConnections.value.filter(c => !c.group);
    return savedConnections.value.filter(c => c.group === groupName);
  }

  function generateConnectionId(): string {
    return `conn_${Date.now().toString(36)}${Math.random().toString(36).substring(2)}`;
  }

  async function loadCredentialsFromSessionStorage(): Promise<void> {
    const creds: Record<string, Credential> = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(SESSION_STORAGE_CRED_PREFIX)) {
        const serverId = key.substring(SESSION_STORAGE_CRED_PREFIX.length);
        const storedValue = sessionStorage.getItem(key);
        if (storedValue) {
          try {
            const parsed = JSON.parse(storedValue);
            if (parsed.encrypted) {
              parsed.auth_value = await decrypt(parsed.auth_value);
            }
            creds[serverId] = parsed;
          } catch {
            creds[serverId] = { auth_value: storedValue, auth_type: 'password' };
          }
        }
      }
    }
    sessionRememberedCredentials.value = creds;
  }

  async function saveCredentialToSessionStorage(serverId: string, authType: 'password' | 'key', authValue: string): Promise<void> {
    if (!serverId || !authValue || !authType) return;
    const encrypted = await encrypt(authValue);
    const key = `${SESSION_STORAGE_CRED_PREFIX}${serverId}`;
    sessionStorage.setItem(key, JSON.stringify({ auth_type: authType, auth_value: encrypted, encrypted: true }));
    sessionRememberedCredentials.value[serverId] = { auth_type: authType, auth_value: authValue };
  }

  async function getCredentialFromSessionStorage(serverId: string): Promise<Credential | null> {
    if (!serverId) return null;
    if (sessionRememberedCredentials.value[serverId]) {
      return sessionRememberedCredentials.value[serverId];
    }
    const key = `${SESSION_STORAGE_CRED_PREFIX}${serverId}`;
    const storedValue = sessionStorage.getItem(key);
    if (storedValue) {
      try {
        const parsed = JSON.parse(storedValue);
        if (parsed.encrypted) {
          parsed.auth_value = await decrypt(parsed.auth_value);
        }
        sessionRememberedCredentials.value[serverId] = parsed;
        return parsed;
      } catch {
        sessionRememberedCredentials.value[serverId] = { auth_value: storedValue, auth_type: 'password' };
        return sessionRememberedCredentials.value[serverId];
      }
    }
    return null;
  }

  function clearCredentialFromSessionStorage(serverId: string): void {
    if (!serverId) return;
    const key = `${SESSION_STORAGE_CRED_PREFIX}${serverId}`;
    sessionStorage.removeItem(key);
    delete sessionRememberedCredentials.value[serverId];
  }

  function clearAllSessionCredentials(): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(SESSION_STORAGE_CRED_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => sessionStorage.removeItem(key));
    sessionRememberedCredentials.value = {};
  }

  function _saveConnectionsToSessionStorage(): void {
    sessionStorage.setItem(SESSION_STORAGE_CONNECTIONS_KEY, JSON.stringify(savedConnections.value));
  }

  function addConnection(nodeConfigPassed: NodeConfig): NodeConfig {
    const configToSaveInSessionStorage: NodeConfig = { ...nodeConfigPassed };
    delete configToSaveInSessionStorage.auth_value;
    delete configToSaveInSessionStorage.rememberForSession;

    let definitiveId: string | undefined = configToSaveInSessionStorage.id;
    const existingById = definitiveId ? savedConnections.value.find(c => c.id === definitiveId) : null;
    const existingByName = savedConnections.value.find(c => c.name === configToSaveInSessionStorage.name);

    if (existingById) {
      const index = savedConnections.value.findIndex(c => c.id === definitiveId);
      savedConnections.value.splice(index, 1, { ...configToSaveInSessionStorage });
    } else if (existingByName) {
      definitiveId = existingByName.id;
      const index = savedConnections.value.findIndex(c => c.id === definitiveId);
      savedConnections.value.splice(index, 1, { ...configToSaveInSessionStorage, id: definitiveId });
    } else {
      if (!definitiveId) definitiveId = generateConnectionId();
      savedConnections.value.push({ ...configToSaveInSessionStorage, id: definitiveId });
    }

    _saveConnectionsToSessionStorage();
    return { ...nodeConfigPassed, id: definitiveId };
  }

  function removeConnection(id: string): void {
    const connIndex = savedConnections.value.findIndex(c => c.id === id);
    if (connIndex > -1) {
      savedConnections.value.splice(connIndex, 1);
      _saveConnectionsToSessionStorage();
      clearCredentialFromSessionStorage(id);
      if (currentNodeDetails.value && currentNodeDetails.value.id === id) {
        currentNodeDetails.value = null;
      }
    }
  }

  function loadConnectionForEditing(id: string): void {
    const conn = savedConnections.value.find(c => c.id === id);
    if (conn) {
      getCredentialFromSessionStorage(id).then(rememberedCred => {
        setCurrentNodeDetails({
          ...conn,
          auth_type: (rememberedCred ? rememberedCred.auth_type : (conn.auth_type || 'password')) as 'password' | 'key',
          auth_value: '',
          rememberForSession: !!rememberedCred
        });
      });
    }
  }

  function setCurrentNodeDetails(details: NodeConfig): void {
    currentNodeDetails.value = details;
  }

  function setConnectionStatus(status: ConnectionStatusType): void {
    connectionStatus.value = status;
  }

  async function testConnection(nodeConfig: NodeConfig, cmds: string[] = ["echo 'Connection test OK' && date"]): Promise<TestResult> {
    sshTestLoading.value = true;
    setConnectionStatus(ConnectionStatus.CONNECTING);

    let configForTest = { ...nodeConfig };
    let effectiveAuthValue = configForTest.auth_value;
    let effectiveAuthType = configForTest.auth_type;

    if (!effectiveAuthValue && configForTest.id && configForTest.rememberForSession) {
      const remembered = await getCredentialFromSessionStorage(configForTest.id);
      if (remembered && remembered.auth_value) {
        effectiveAuthValue = remembered.auth_value;
        effectiveAuthType = remembered.auth_type as 'password' | 'key';
      }
    }

    if (!effectiveAuthValue) {
      sshTestLoading.value = false;
      setConnectionStatus(ConnectionStatus.ERROR);
      const msg = "测试连接需要密码或私钥。";
      const nodeForError: NodeConfig = { ...configForTest, auth_value: '***', id: configForTest.id };
      sshTestResult.value = { success: false, error: [msg], output: [], node: nodeForError, cmds: cmds.join(' && '), time_elapsed: 0 };
      return sshTestResult.value;
    }

    const finalConfigForApi: NodeConfig = { ...configForTest, auth_type: effectiveAuthType!, auth_value: effectiveAuthValue! };

    try {
      const result: TestResult = await apiTestSsh(finalConfigForApi, cmds);
      const displayNode: NodeConfig = { ...(result.node || configForTest), auth_value: '***', id: configForTest.id || result.node?.id };
      sshTestResult.value = { ...result, node: displayNode };

      if (result.success) {
        setConnectionStatus(ConnectionStatus.DISCONNECTED);
      } else {
        setConnectionStatus(ConnectionStatus.ERROR);
      }
      return sshTestResult.value;
    } catch (error: any) {
      const errorMessage = error.message || 'API调用在测试连接时失败';
      sshTestResult.value = {
        success: false, error: [errorMessage], output: [], node: { ...configForTest, auth_value: '***', id: configForTest.id },
        cmds: cmds.join(' && '), time_elapsed: 0
      };
      setConnectionStatus(ConnectionStatus.ERROR);
      return sshTestResult.value;
    } finally {
      sshTestLoading.value = false;
    }
  }

  function connectToShell(nodeConfigFromForm: NodeConfig, terminalCallbacks: TerminalCallbacks): void {
    if (wsService.getReadyState() === WebSocket.OPEN) {
      wsService.disconnect(true);
    }

    let finalNodeConfig = { ...nodeConfigFromForm };

    const doConnect = async () => {
      if (!finalNodeConfig.auth_value && finalNodeConfig.id && finalNodeConfig.rememberForSession) {
        const remembered = await getCredentialFromSessionStorage(finalNodeConfig.id);
        if (remembered && remembered.auth_value) {
          finalNodeConfig.auth_value = remembered.auth_value;
          finalNodeConfig.auth_type = remembered.auth_type as 'password' | 'key';
        }
      }

      if (!finalNodeConfig.auth_value) {
        const msg = "连接 Shell 需要密码或私钥。";
        setConnectionStatus(ConnectionStatus.ERROR);
        if (terminalCallbacks.onError) terminalCallbacks.onError(new Error(msg));
        return;
      }

      if (finalNodeConfig.rememberForSession && !finalNodeConfig.id) {
        finalNodeConfig.id = generateConnectionId();
      }

      wsService.connect(finalNodeConfig, {
        onOpen: () => {
          setConnectionStatus(ConnectionStatus.CONNECTED);
          if (finalNodeConfig.rememberForSession && finalNodeConfig.id && finalNodeConfig.auth_value) {
            saveCredentialToSessionStorage(finalNodeConfig.id, finalNodeConfig.auth_type!, finalNodeConfig.auth_value);
          }
          if (terminalCallbacks.onOpen) terminalCallbacks.onOpen();
        },
        onMessage: (data) => {
          if (terminalCallbacks.onMessage) terminalCallbacks.onMessage(data);
        },
        onClose: (event, manualDisconnect) => {
          if (connectionStatus.value === ConnectionStatus.CONNECTED || connectionStatus.value === ConnectionStatus.CONNECTING) {
            setConnectionStatus(event.wasClean && manualDisconnect ? ConnectionStatus.DISCONNECTED : ConnectionStatus.ERROR);
          }
          if (terminalCallbacks.onClose) terminalCallbacks.onClose(event);
        },
        onError: (errorEventOrMessage) => {
          setConnectionStatus(ConnectionStatus.ERROR);
          if (terminalCallbacks.onError) terminalCallbacks.onError(errorEventOrMessage);
        }
      });
    };

    doConnect();
  }

  function sendShellData(data: string): void {
    if (isConnected.value) wsService.sendMessage(data);
  }

  function disconnectShell(): void {
    wsService.disconnect();
  }

  return {
    currentNodeDetails,
    connectionStatus,
    sshTestResult,
    sshTestLoading,
    savedConnections, groups, connectionsByGroup,
    sessionRememberedCredentials,
    isConnected,
    setCurrentNodeDetails,
    setConnectionStatus,
    testConnection,
    connectToShell,
    sendShellData,
    disconnectShell,
    addConnection,
    removeConnection,
    loadConnectionForEditing,
    getCredentialFromSessionStorage,
    saveCredentialToSessionStorage,
    clearAllSessionCredentials,
  };
});
