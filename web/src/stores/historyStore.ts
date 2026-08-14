import { defineStore } from 'pinia';
import { ref } from 'vue';
import { storageGetJSON, storageSetJSON } from '@/utils/storage';

export interface HistoryEntry {
  id: string;
  time: number;
  name: string;
  host: string;
  port: number;
  protocol: string;
  status: 'success' | 'failed';
  error?: string;
}

const MAX_HISTORY = 100;

/**
 * Local connection history (Termius-style History section). Records are kept
 * in localStorage, newest first, capped at MAX_HISTORY entries.
 */
export const useHistoryStore = defineStore('history', () => {
  const entries = ref<HistoryEntry[]>(load());

  function load(): HistoryEntry[] {
    try {
      const arr = storageGetJSON('history', []);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function persist() {
    storageSetJSON('history', entries.value);
  }

  function record(config: { name?: string; host?: string; port?: number; protocol?: string },
                  status: 'success' | 'failed', error?: string) {
    if (!config?.host) return;
    // Collapse duplicates: same host:port in a row just refreshes the entry.
    const top = entries.value[0];
    if (top && top.host === config.host && top.port === (config.port || 22)
        && top.status === status && Date.now() - top.time < 60_000) {
      top.time = Date.now();
      top.name = config.name || top.name;
      persist();
      return;
    }
    entries.value.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      time: Date.now(),
      name: config.name || config.host,
      host: config.host,
      port: config.port || 22,
      protocol: config.protocol || 'ssh',
      status,
      error: error ? String(error).slice(0, 300) : undefined,
    });
    if (entries.value.length > MAX_HISTORY) entries.value.length = MAX_HISTORY;
    persist();
  }

  function remove(id: string) {
    entries.value = entries.value.filter((e) => e.id !== id);
    persist();
  }

  function clear() {
    entries.value = [];
    persist();
  }

  return { entries, record, remove, clear };
});
