import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { encryptBackupData, decryptBackupData } from '@/utils/crypto';
import { useConnectionStore } from './connectionStore';
import { useSnippetStore } from './snippetStore';
import { useUiStore } from './uiStore';
import { useTerminalStore } from './terminalStore';
import { useMacroStore } from './macroStore';
import { useCodeNoteStore } from './codeNoteStore';
import { useChatStore } from './chatStore';

export const BACKUP_VERSION = 3;

export interface BackupInventory {
  connectionCount: number;
  snippetCount: number;
  macroCount: number;
  codeNoteCount: number;
  hasPassword: boolean;
}

export interface BackupEntry {
  id: string;
  label: string;
  createdAt: number;
  size: number;
  version: number;
  inventory: BackupInventory;
  /** New format: entire backup data encrypted with password */
  encryptedPayload?: string;
  /** Old format fields (kept for backward compat) */
  encrypted?: boolean;
  checksum?: string;
  connections?: any[];
  credentials?: Record<string, string>;
  snippets?: any[];
  macros?: any[];
  codeNotes?: any[];
  chatConfig?: any;
  groupOrder?: string[];
  groupCollapsed?: string[];
  settings?: { themePreset: string; recentCommands: string[] };
}

export interface SchedulerConfig {
  enabled: boolean;
  interval: 'daily' | 'weekly' | 'manual';
  maxBackups: number;
  lastBackupAt: number;
}

export interface CloudTarget {
  enabled: boolean;
  autoSync: boolean;
  syncInterval: number;
  lastSyncAt: number;
  lastSyncOk: boolean;
}

export interface CloudBackupMeta {
  id: string;
  label: string;
  createdAt: number;
  size: number;
  inventory: BackupInventory;
}

const STORAGE_KEY = 'webssh_backups';
const SCHEDULER_KEY = 'webssh_backup_schedule';
const CLOUD_KEY = 'webssh_backup_cloud';

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
  const cloudBackups = ref<CloudBackupMeta[]>([]);
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
      const connStore = useConnectionStore();
      const snipStore = useSnippetStore();
      const macroStore = useMacroStore();
      const codeNoteStore = useCodeNoteStore();
      return {
        connectionCount: connStore.savedConnections.length,
        snippetCount: snipStore.snippets.length,
        macroCount: macroStore.macros?.length || 0,
        codeNoteCount: codeNoteStore.notes?.length || 0,
        hasPassword: false,
      };
    } catch { return { connectionCount: 0, snippetCount: 0, macroCount: 0, codeNoteCount: 0, hasPassword: false }; }
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

  /** Collect all data from stores (including credentials) */
  function collectAllData() {
    const connStore = useConnectionStore();
    const snipStore = useSnippetStore();
    const uiStore = useUiStore();
    const termStore = useTerminalStore();
    const macroStore = useMacroStore();
    const codeNoteStore = useCodeNoteStore();
    const chatStore = useChatStore();

    // Deep clone connections WITH auth_value
    const connections = JSON.parse(JSON.stringify(connStore.savedConnections));

    const snippets = JSON.parse(JSON.stringify(snipStore.snippets));
    const macros = JSON.parse(JSON.stringify(macroStore.macros || []));
    const codeNotes = JSON.parse(JSON.stringify(codeNoteStore.notes || []));
    let chatConfig = {};
    try {
      chatConfig = JSON.parse(JSON.stringify({ ai: chatStore.config.ai }));
    } catch {}

    return {
      connections,
      snippets,
      macros,
      codeNotes,
      chatConfig,
      groupOrder: [...connStore.groupOrder],
      groupCollapsed: Array.from(connStore.groupCollapsed || []),
      settings: {
        themePreset: uiStore.currentPreset || 'light',
        recentCommands: [...termStore.recentCommands],
      },
    };
  }

  async function createBackup(label: string, password: string): Promise<BackupEntry> {
    creating.value = true;
    try {
      const allData = collectAllData();
      const encryptedPayload = await encryptBackupData(allData, password);

      const entry: BackupEntry = {
        id: generateId(),
        label: label || (() => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `webssh-backup-${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`; })(),
        createdAt: Date.now(),
        size: estimateDataSize(allData),
        version: BACKUP_VERSION,
        inventory: {
          connectionCount: allData.connections.length,
          snippetCount: allData.snippets.length,
          macroCount: allData.macros.length,
          codeNoteCount: allData.codeNotes.length,
          hasPassword: true,
        },
        encryptedPayload,
      };

      backups.value.push(entry);
      persist();
      scheduler.value.lastBackupAt = Date.now();
      persistScheduler();

      if (cloud.value.enabled && cloud.value.autoSync) {
        uploadToCloud(entry.id).then(ok => {
          if (ok) { cloud.value.lastSyncAt = Date.now(); cloud.value.lastSyncOk = true; persistCloud(); }
        }).catch(() => {});
      }

      return entry;
    } finally {
      creating.value = false;
    }
  }

  /** Decrypt and return the data payload, or null if wrong password */
  async function decryptBackup(id: string, password: string): Promise<any | null> {
    const entry = backups.value.find(b => b.id === id);
    if (!entry) return null;
    if (entry.encryptedPayload) {
      const result = await decryptBackupData(entry.encryptedPayload, password);
      return result ? result.data : null;
    }
    // Old format: no password needed
    return entry;
  }

  async function restoreBackup(id: string, password: string): Promise<{ restored: number; error?: string }> {
    restoring.value = true;
    try {
      const entry = backups.value.find(b => b.id === id);
      if (!entry) return { restored: 0, error: 'Backup not found' };

      let allData: any;
      if (entry.encryptedPayload) {
        const decrypted = await decryptBackupData(entry.encryptedPayload, password);
        if (!decrypted) return { restored: 0, error: '密码错误或数据已损坏' };
        allData = decrypted.data;
      } else {
        allData = entry;
      }

      const connStore = useConnectionStore();
      const snipStore = useSnippetStore();
      const macroStore = useMacroStore();
      const codeNoteStore = useCodeNoteStore();
      const chatStore = useChatStore();

      const existingIds = connStore.savedConnections.map((c: any) => c.id);
      const existingNames = connStore.savedConnections.map((c: any) => c.name);

      let restored = 0;
      for (const conn of allData.connections || []) {
        if (!existingIds.includes(conn.id) && !existingNames.includes(conn.name)) {
          connStore.addConnection(conn);
          restored++;
        }
      }

      for (const snip of allData.snippets || []) {
        snipStore.addSnippet({
          title: snip.title, command: snip.command,
          tags: snip.tags || [], favorite: snip.favorite || false,
        });
      }

      for (const m of allData.macros || []) {
        try { macroStore.addMacro(m); } catch {}
      }

      for (const n of allData.codeNotes || []) {
        try { codeNoteStore.addNote(n.content, n.source || 'terminal'); } catch {}
      }

      if (allData.chatConfig?.ai) {
        try { chatStore.config.ai = { ...chatStore.config.ai, ...allData.chatConfig.ai }; } catch {}
      }

      if (allData.groupOrder?.length > 0) connStore.groupOrder = [...allData.groupOrder];
      if (allData.groupCollapsed?.length > 0) connStore.groupCollapsed = new Set(allData.groupCollapsed);

      if (allData.settings) {
        const uiStore = useUiStore();
        uiStore.setThemePreset(allData.settings.themePreset);
        const termStore = useTerminalStore();
        if (allData.settings.recentCommands) termStore.recentCommands = [...allData.settings.recentCommands];
      }

      return { restored };
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
      if (!data.encryptedPayload && !data.connections && !data.snippets) return false;
      const inv = data.inventory || {
        connectionCount: data.connections?.length || 0,
        snippetCount: data.snippets?.length || 0,
        macroCount: data.macros?.length || 0,
        codeNoteCount: data.codeNotes?.length || 0,
        hasPassword: !!data.encryptedPayload,
      };
      const entry: BackupEntry = {
        id: generateId(),
        label: data.label || `Imported ${new Date().toLocaleDateString()}`,
        createdAt: data.createdAt || Date.now(),
        size: data.size || estimateDataSize(data),
        version: data.version || 1,
        inventory: inv,
        encryptedPayload: data.encryptedPayload || undefined,
        connections: data.connections || undefined,
        snippets: data.snippets || undefined,
        macros: data.macros || undefined,
        codeNotes: data.codeNotes || undefined,
        chatConfig: data.chatConfig || undefined,
        groupOrder: data.groupOrder || undefined,
        groupCollapsed: data.groupCollapsed || undefined,
        settings: data.settings || undefined,
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
    sorted.slice(max).forEach(b => deleteBackup(b.id));
  }

  function updateCloud(config: Partial<CloudTarget>): void {
    cloud.value = { ...cloud.value, ...config };
    persistCloud();
  }

  function cloudApi(action: string, payload: any = {}): Promise<Response> {
    return fetch('/api/cloud/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
  }

  async function listCloudBackups(): Promise<boolean> {
    if (!cloud.value.enabled) return false;
    try {
      const resp = await cloudApi('list');
      if (!resp.ok) return false;
      const data = await resp.json();
      cloudBackups.value = data.backups || [];
      return true;
    } catch { return false; }
  }

  async function uploadToCloud(backupId: string): Promise<boolean> {
    if (!cloud.value.enabled) return false;
    const entry = backups.value.find(b => b.id === backupId);
    if (!entry) return false;
    try {
      const resp = await cloudApi('upload', { backup: entry });
      if (resp.ok) {
        cloud.value.lastSyncAt = Date.now(); cloud.value.lastSyncOk = true; persistCloud();
        listCloudBackups();
        return true;
      }
      return false;
    } catch { return false; }
  }

  async function downloadFromCloud(cloudId: string): Promise<boolean> {
    if (!cloud.value.enabled) return false;
    try {
      const resp = await cloudApi('download', { id: cloudId });
      if (!resp.ok) return false;
      const data = await resp.json();
      const ok = importBackup(JSON.stringify(data));
      if (ok) { cloud.value.lastSyncAt = Date.now(); persistCloud(); }
      return ok;
    } catch { return false; }
  }

  async function deleteFromCloud(cloudId: string): Promise<boolean> {
    try {
      const resp = await cloudApi('delete', { id: cloudId });
      if (resp.ok) { cloudBackups.value = cloudBackups.value.filter(b => b.id !== cloudId); return true; }
      return false;
    } catch { return false; }
  }

  return {
    backups, sortedBackups, totalSize, inventory, creating, restoring,
    scheduler, cloud, cloudBackups,
    createBackup, decryptBackup, restoreBackup, deleteBackup,
    exportBackup, importBackup,
    updateScheduler, shouldAutoBackup, cleanupOldBackups,
    updateCloud, listCloudBackups, uploadToCloud, downloadFromCloud, deleteFromCloud,
  };
});

function loadScheduler(): SchedulerConfig {
  try {
    const raw = localStorage.getItem(SCHEDULER_KEY);
    return raw ? { ...{ enabled: false, interval: 'manual', maxBackups: 10, lastBackupAt: 0 }, ...JSON.parse(raw) } : { enabled: false, interval: 'manual', maxBackups: 10, lastBackupAt: 0 };
  } catch { return { enabled: false, interval: 'manual', maxBackups: 10, lastBackupAt: 0 }; }
}

function loadCloudTarget(): CloudTarget {
  try {
    const raw = localStorage.getItem(CLOUD_KEY);
    return raw ? { enabled: false, autoSync: false, syncInterval: 60, lastSyncAt: 0, lastSyncOk: true, ...JSON.parse(raw) } : { enabled: false, autoSync: false, syncInterval: 60, lastSyncAt: 0, lastSyncOk: true };
  } catch { return { enabled: false, autoSync: false, syncInterval: 60, lastSyncAt: 0, lastSyncOk: true }; }
}
