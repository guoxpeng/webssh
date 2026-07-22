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

const STORAGE_KEY = 'haossh_macros';

function load(): Macro[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function save(macros: Macro[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(macros));
}

function genId(): string {
  return `mac_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;
}

export const useMacroStore = defineStore('macros', () => {
  const macros = ref<Macro[]>(load());
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

  function addMacro(data: Omit<Macro, 'id' | 'createdAt' | 'runCount'>): Macro {
    const macro: Macro = {
      ...data,
      id: genId(),
      createdAt: Date.now(),
      runCount: 0,
    };
    macros.value.unshift(macro);
    save(macros.value);
    return macro;
  }

  function updateMacro(id: string, data: Partial<Macro>): void {
    const idx = macros.value.findIndex(m => m.id === id);
    if (idx === -1) return;
    macros.value[idx] = { ...macros.value[idx], ...data };
    save(macros.value);
  }

  function removeMacro(id: string): void {
    macros.value = macros.value.filter(m => m.id !== id);
    save(macros.value);
  }

  function toggleFavorite(id: string): void {
    const m = macros.value.find(x => x.id === id);
    if (m) { m.favorite = !m.favorite; save(macros.value); }
  }

  function incrementRunCount(id: string): void {
    const m = macros.value.find(x => x.id === id);
    if (m) { m.runCount++; save(macros.value); }
  }

  function duplicateMacro(id: string): Macro | null {
    const src = macros.value.find(m => m.id === id);
    if (!src) return null;
    return addMacro({
      name: `${src.name} (复制)`,
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

  return {
    macros, searchQuery, filteredMacros, favorites,
    addMacro, updateMacro, removeMacro, toggleFavorite,
    incrementRunCount, duplicateMacro, importMacros, exportMacros,
  };
});
