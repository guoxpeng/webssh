import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface MacroStep {
  command: string;
  delay: number;
}

export interface Macro {
  id: string;
  name: string;
  description: string;
  steps: MacroStep[];
  tags: string[];
  favorite: boolean;
  createdAt: number;
  runCount: number;
}

export type ScheduleRepeat = 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'interval';

export interface ScheduledTask {
  id: string;
  macroId: string;
  name: string;
  repeat: ScheduleRepeat;
  intervalMinutes?: number;
  enabled: boolean;
  lastRunAt: number | null;
  nextRunAt: number;
  connectionIds: string[];
  createdAt: number;
}

const STORAGE_KEY = 'webssh_macros';
const SCHEDULE_KEY = 'webssh_macro_schedules';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function save<T>(key: string, data: T): void {
  localStorage.setItem(key, JSON.stringify(data));
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;
}

export const useMacroStore = defineStore('macros', () => {
  const macros = ref<Macro[]>(load(STORAGE_KEY, []));
  const schedules = ref<ScheduledTask[]>(load(SCHEDULE_KEY, []));
  const searchQuery = ref('');

  const filteredMacros = computed(() => {
    const q = searchQuery.value.toLowerCase().trim();
    if (!q) return macros.value;
    return macros.value.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.tags.some(t => t.toLowerCase().includes(q))
    );
  });

  const favorites = computed(() => macros.value.filter(m => m.favorite));

  function persistMacros() { save(STORAGE_KEY, macros.value); }
  function persistSchedules() { save(SCHEDULE_KEY, schedules.value); }

  function addMacro(data: Omit<Macro, 'id' | 'createdAt' | 'runCount'>): Macro {
    const macro: Macro = {
      ...data,
      id: genId('mac'),
      createdAt: Date.now(),
      runCount: 0,
    };
    macros.value.unshift(macro);
    persistMacros();
    return macro;
  }

  function updateMacro(id: string, data: Partial<Macro>): void {
    const idx = macros.value.findIndex(m => m.id === id);
    if (idx === -1) return;
    macros.value[idx] = { ...macros.value[idx], ...data };
    persistMacros();
  }

  function removeMacro(id: string): void {
    macros.value = macros.value.filter(m => m.id !== id);
    schedules.value = schedules.value.filter(s => s.macroId !== id);
    persistMacros();
    persistSchedules();
  }

  function toggleFavorite(id: string): void {
    const m = macros.value.find(x => x.id === id);
    if (m) { m.favorite = !m.favorite; persistMacros(); }
  }

  function incrementRunCount(id: string): void {
    const m = macros.value.find(x => x.id === id);
    if (m) { m.runCount++; persistMacros(); }
  }

  function duplicateMacro(id: string): Macro | null {
    const src = macros.value.find(m => m.id === id);
    if (!src) return null;
    return addMacro({
      name: `${src.name} (copy)`,
      description: src.description,
      steps: JSON.parse(JSON.stringify(src.steps)),
      tags: [...src.tags],
      favorite: false,
    });
  }

  function importMacros(json: string): number {
    try {
      const data = JSON.parse(json);
      if (!Array.isArray(data)) return 0;
      let count = 0;
      for (const item of data) {
        if (item.name && Array.isArray(item.steps)) {
          addMacro({
            name: item.name,
            description: item.description || '',
            steps: item.steps,
            tags: item.tags || [],
            favorite: item.favorite || false,
          });
          count++;
        }
      }
      return count;
    } catch { return 0; }
  }

  function exportMacros(): string {
    return JSON.stringify(macros.value, null, 2);
  }

  function addSchedule(data: Omit<ScheduledTask, 'id' | 'createdAt'>): ScheduledTask {
    const task: ScheduledTask = {
      ...data,
      id: genId('sch'),
      createdAt: Date.now(),
    };
    schedules.value.push(task);
    persistSchedules();
    return task;
  }

  function updateSchedule(id: string, data: Partial<ScheduledTask>): void {
    const idx = schedules.value.findIndex(s => s.id === id);
    if (idx === -1) return;
    schedules.value[idx] = { ...schedules.value[idx], ...data };
    persistSchedules();
  }

  function removeSchedule(id: string): void {
    schedules.value = schedules.value.filter(s => s.id !== id);
    persistSchedules();
  }

  function computeNextRun(repeat: ScheduleRepeat, intervalMinutes?: number): number {
    const now = Date.now();
    switch (repeat) {
      case 'once': return 0;
      case 'hourly': return now + 3600000;
      case 'daily': return now + 86400000;
      case 'weekly': return now + 604800000;
      case 'monthly': return now + 2592000000;
      case 'interval': return now + (intervalMinutes || 60) * 60000;
      default: return 0;
    }
  }

  function markScheduleRun(id: string): void {
    const s = schedules.value.find(x => x.id === id);
    if (!s) return;
    s.lastRunAt = Date.now();
    s.nextRunAt = computeNextRun(s.repeat, s.intervalMinutes);
    if (s.repeat === 'once') s.enabled = false;
    persistSchedules();
  }

  return {
    macros, schedules, searchQuery, filteredMacros, favorites,
    addMacro, updateMacro, removeMacro, toggleFavorite,
    incrementRunCount, duplicateMacro, importMacros, exportMacros,
    addSchedule, updateSchedule, removeSchedule, markScheduleRun,
    computeNextRun, persistSchedules,
  };
});
