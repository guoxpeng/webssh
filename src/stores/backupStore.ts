import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { NodeConfig } from './connectionStore';
import { encryptBackupData, decryptBackupData } from '@/utils/crypto';

export const BACKUP_VERSION = 2;

export interface BackupInventory {
  connectionCount: number;
  credentialCount: number;
  snippetCount: number;
  hasCredentials: boolean;
  encrypted: boolean;
}

export interface BackupEntry {
  id: string;
  label: string;
  createdAt: number;
  size: number;
  encrypted: boolean;
  version: number;
  checksum: string;
  inventory: BackupInventory;
  connections: NodeConfig[];
  credentials: Record<string, string>;
  snippets: any[];
  settings: {
    themePreset: string;
    recentCommands: string[];
  };
}

export interface SchedulerConfig {
  enabled: boolean;
  interval: 'daily' | 'weekly' | 'manual';
  maxBackups: number;
  includeCredentials: boolean;
  lastBackupAt: number;
}

export interface CloudTarget {
  url: string;
  token: string;
  enabled: boolean;
  autoSync: boolean;
  syncInterval: number; // minutes, 0 = manual only
  lastSyncAt: number;
  lastSyncOk: boolean;
}

const STORAGE_KEY = 'haossh_backups';
const SCHEDULER_KEY = 'haossh_backup_schedule';
const CLOUD_KEY = 'haossh_backup_cloud';

function loadBackups(): BackupEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveBackups(backups: BackupEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(backups));
}

export const useBackupStore = defineStore('backup', () => {
  const backups = ref<BackupEntry[]>(loadBackups());
  const scheduler = ref<SchedulerConfig>(loadScheduler());
  const cloud = ref<CloudTarget>(loadCloudTarget());
  const creating = ref(false);
  const restoring = ref(false);

  const sortedBackups = computed(() =>
    [...backups.value].sort((a, b) => b.createdAt - a.createdAt)
  );

  const totalSize = computed(() =>
    backups.value.reduce((sum, b) => sum + b.size, 0)
  );

  const inventory = computed<BackupInventory>(() => {
    try {
      const connStore = (window as any).__app_connStore;
      const snipStore = (window as any).__app_snipStore;
      return {
        connectionCount: connStore?.savedConnections?.length || 0,
        credentialCount: connStore ? Object.keys(connStore.sessionRememberedCredentials || {}).length : 0,
        snippetCount: snipStore?.snippets?.length || 0,
        hasCredentials: connStore ? Object.keys(connStore.sessionRememberedCredentials || {}).length > 0 : false,
        encrypted: !!sessionStorage.getItem('haossh_master'),
      };
    } catch { return { connectionCount: 0, credentialCount: 0, snippetCount: 0, hasCredentials: false, encrypted: false }; }
  });

  function persist() { saveBackups(backups.value); }
  function persistScheduler() { localStorage.setItem(SCHEDULER_KEY, JSON.stringify(scheduler.value)); }
  function persistCloud() { localStorage.setItem(CLOUD_KEY, JSON.stringify(cloud.value)); }

  function generateId(): string {
    return `bak_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
  }

  function estimateDataSize(data: any): number {
    return new Blob([JSON.stringify(data)]).size;
  }

  async function computeChecksum(data: any): Promise<string> {
    const json = JSON.stringify(data);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
    return btoa(String.fromCharCode(...new Uint8Array(hash)));
  }

  async function createBackup(label: string, includeCredentials = false): Promise<BackupEntry> {
    creating.value = true;
    try {
      const { useConnectionStore } = await import('./connectionStore');
      const { useSnippetStore } = await import('./snippetStore');
      const { useUiStore } = await import('./uiStore');
      const { useTerminalStore } = await import('./terminalStore');

      const connStore = useConnectionStore();
      const snipStore = useSnippetStore();
      const uiStore = useUiStore();
      const termStore = useTerminalStore();

      const rawConns = JSON.parse(JSON.stringify(connStore.savedConnections));
      const connections = rawConns.map(c => { delete c.auth_value; return c; });

      let credentials: Record<string, string> = {};
      if (includeCredentials) {
        const master = sessionStorage.getItem('haossh_master');
        if (master) {
          for (const [serverId, cred] of Object.entries(connStore.sessionRememberedCredentials)) {
            const c = cred as any;
            credentials[serverId] = await encryptBackupData(c, master);
          }
        }
      }

      const snippets = JSON.parse(JSON.stringify(snipStore.snippets));

      const backupData = {
        connections,
        credentials,
        snippets,
        settings: {
          themePreset: uiStore.currentPreset || 'light',
          recentCommands: [...termStore.recentCommands],
        },
      };

      const checksum = await computeChecksum(backupData);
      const size = estimateDataSize(backupData);
      const isEncrypted = includeCredentials && !!sessionStorage.getItem('haossh_master');

      const entry: BackupEntry = {
        id: generateId(),
        label: label || `Backup ${new Date().toLocaleDateString()}`,
        createdAt: Date.now(),
        size,
        encrypted: isEncrypted,
        version: BACKUP_VERSION,
        checksum,
        inventory: {
          connectionCount: connections.length,
          credentialCount: Object.keys(credentials).length,
          snippetCount: snippets.length,
          hasCredentials: Object.keys(credentials).length > 0,
          encrypted: isEncrypted,
        },
        ...backupData,
      };

      backups.value.push(entry);
      persist();
      scheduler.value.lastBackupAt = Date.now();
      persistScheduler();

      // Auto-sync to cloud if enabled
      if (cloud.value.enabled && cloud.value.autoSync && cloud.value.url) {
        uploadToCloud(entry.id).then(ok => {
          if (ok) {
            cloud.value.lastSyncAt = Date.now();
            cloud.value.lastSyncOk = true;
            persistCloud();
          }
        }).catch(() => {});
      }

      return entry;
    } finally {
      creating.value = false;
    }
  }

  async function restoreBackup(id: string, restoreCredentials = true): Promise<number> {
    restoring.value = true;
    try {
      const entry = backups.value.find(b => b.id === id);
      if (!entry) throw new Error('Backup not found');

      if (entry.checksum) {
        const currentChecksum = await computeChecksum({
          connections: entry.connections,
          credentials: entry.credentials,
          snippets: entry.snippets,
          settings: entry.settings,
        });
        if (currentChecksum !== entry.checksum) {
          console.warn('Backup checksum mismatch - data may be tampered');
        }
      }

      const { useConnectionStore } = await import('./connectionStore');
      const { useSnippetStore } = await import('./snippetStore');

      const connStore = useConnectionStore();
      const snipStore = useSnippetStore();

      const existingIds = connStore.savedConnections.map(c => c.id);
      const existingNames = connStore.savedConnections.map(c => c.name);

      let restored = 0;
      for (const conn of entry.connections) {
        const isDuplicate = existingIds.includes(conn.id) || existingNames.includes(conn.name);
        if (!isDuplicate) {
          connStore.addConnection(conn);
          restored++;
        }
      }

      for (const snip of entry.snippets) {
        snipStore.addSnippet({
          title: snip.title, command: snip.command,
          tags: snip.tags || [], favorite: snip.favorite || false,
        });
      }

      if (restoreCredentials && entry.credentials && Object.keys(entry.credentials).length > 0) {
        const master = sessionStorage.getItem('haossh_master');
        if (master) {
          for (const [serverId, ciphertext] of Object.entries(entry.credentials)) {
            const decrypted = await decryptBackupData(ciphertext, master);
            if (decrypted) {
              const c = decrypted.data;
              connStore.sessionRememberedCredentials[serverId] = c;
              if (c.auth_value) {
                connStore.saveCredentialToSessionStorage(serverId, c.auth_type, c.auth_value);
              }
            }
          }
        }
      }

      if (entry.settings) {
        const { useUiStore } = await import('./uiStore');
        const uiStore = useUiStore();
        uiStore.setThemePreset(entry.settings.themePreset);
        const termStore = useTerminalStore();
        if (entry.settings.recentCommands) {
          termStore.recentCommands = [...entry.settings.recentCommands];
        }
      }

      return restored;
    } finally {
      restoring.value = false;
    }
  }

  function deleteBackup(id: string): void {
    backups.value = backups.value.filter(b => b.id !== id);
    persist();
  }

  function exportBackup(id: string): string | null {
    const entry = backups.value.find(b => b.id === id);
    if (!entry) return null;
    return JSON.stringify(entry, null, 2);
  }

  function importBackup(jsonStr: string): boolean {
    try {
      const data = JSON.parse(jsonStr);
      if (!data.connections && !data.snippets) return false;
      const entry: BackupEntry = {
        id: generateId(),
        label: data.label || `Imported ${new Date().toLocaleDateString()}`,
        createdAt: data.createdAt || Date.now(),
        size: estimateDataSize(data),
        encrypted: !!data.encrypted,
        version: data.version || 1,
        checksum: data.checksum || '',
        inventory: data.inventory || { connectionCount: 0, credentialCount: 0, snippetCount: 0, hasCredentials: false, encrypted: false },
        connections: data.connections || [],
        credentials: data.credentials || {},
        snippets: data.snippets || [],
        settings: data.settings || { themePreset: 'light', recentCommands: [] },
      };
      backups.value.push(entry);
      persist();
      return true;
    } catch { return false; }
  }

  function updateScheduler(config: Partial<SchedulerConfig>): void {
    scheduler.value = { ...scheduler.value, ...config };
    persistScheduler();
  }

  function shouldAutoBackup(): boolean {
    if (!scheduler.value.enabled || scheduler.value.interval === 'manual') return false;
    const now = Date.now();
    const last = scheduler.value.lastBackupAt;
    const msDay = 86400000;
    if (scheduler.value.interval === 'daily' && now - last >= msDay) return true;
    if (scheduler.value.interval === 'weekly' && now - last >= 7 * msDay) return true;
    return false;
  }

  function cleanupOldBackups(): void {
    const max = scheduler.value.maxBackups;
    if (backups.value.length <= max) return;
    const sorted = [...backups.value].sort((a, b) => b.createdAt - a.createdAt);
    const toRemove = sorted.slice(max);
    toRemove.forEach(b => deleteBackup(b.id));
  }

  function updateCloud(config: Partial<CloudTarget>): void {
    cloud.value = { ...cloud.value, ...config };
    persistCloud();
  }

  async function uploadToCloud(backupId: string): Promise<boolean> {
    if (!cloud.value.url || !cloud.value.enabled) return false;
    const entry = backups.value.find(b => b.id === backupId);
    if (!entry) return false;
    try {
      const blob = new Blob([JSON.stringify(entry)], { type: 'application/json' });
      const resp = await fetch(cloud.value.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cloud.value.token ? { Authorization: `Bearer ${cloud.value.token}` } : {}),
          'X-Backup-Id': entry.id,
          'X-Backup-Label': encodeURIComponent(entry.label),
        },
        body: blob,
      });
      if (resp.ok) {
        cloud.value.lastSyncAt = Date.now();
        persistCloud();
        return true;
      }
      return false;
    } catch { return false; }
  }

  async function downloadFromCloud(): Promise<boolean> {
    if (!cloud.value.url || !cloud.value.enabled) return false;
    try {
      const resp = await fetch(cloud.value.url, {
        method: 'GET',
        headers: { ...(cloud.value.token ? { Authorization: `Bearer ${cloud.value.token}` } : {}) },
      });
      if (!resp.ok) return false;
      const data = await resp.json();
      if (Array.isArray(data)) {
        for (const item of data) { importBackup(JSON.stringify(item)); }
      } else { importBackup(JSON.stringify(data)); }
      cloud.value.lastSyncAt = Date.now();
      persistCloud();
      return true;
    } catch { return false; }
  }

  return {
    backups, sortedBackups, totalSize, inventory, creating, restoring,
    scheduler, cloud,
    createBackup, restoreBackup, deleteBackup,
    exportBackup, importBackup,
    updateScheduler, shouldAutoBackup, cleanupOldBackups,
    updateCloud, uploadToCloud, downloadFromCloud,
  };
});

function loadScheduler(): SchedulerConfig {
  try {
    const raw = localStorage.getItem(SCHEDULER_KEY);
    return raw ? { ...{ enabled: false, interval: 'manual', maxBackups: 10, includeCredentials: false, lastBackupAt: 0 }, ...JSON.parse(raw) } : { enabled: false, interval: 'manual', maxBackups: 10, includeCredentials: false, lastBackupAt: 0 };
  } catch { return { enabled: false, interval: 'manual', maxBackups: 10, includeCredentials: false, lastBackupAt: 0 }; }
}

function loadCloudTarget(): CloudTarget {
  try {
    const raw = localStorage.getItem(CLOUD_KEY);
    return raw ? { url: '', token: '', enabled: false, autoSync: false, syncInterval: 60, lastSyncAt: 0, lastSyncOk: true, ...JSON.parse(raw) } : { url: '', token: '', enabled: false, autoSync: false, syncInterval: 60, lastSyncAt: 0, lastSyncOk: true };
  } catch { return { url: '', token: '', enabled: false, autoSync: false, syncInterval: 60, lastSyncAt: 0, lastSyncOk: true }; }
}
