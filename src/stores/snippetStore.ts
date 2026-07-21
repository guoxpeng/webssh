import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface CommandSnippet {
  id: string;
  title: string;
  command: string;
  tags: string[];
  favorite: boolean;
  createdAt: number;
}

const STORAGE_KEY = 'haossh_snippets';

function loadSnippets(): CommandSnippet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSnippets(snippets: CommandSnippet[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
}

export const useSnippetStore = defineStore('snippets', () => {
  const snippets = ref<CommandSnippet[]>(loadSnippets());
  const searchQuery = ref('');

  const filteredSnippets = computed(() => {
    const q = searchQuery.value.toLowerCase().trim();
    if (!q) return snippets.value;
    return snippets.value.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.command.toLowerCase().includes(q) ||
      s.tags.some(t => t.toLowerCase().includes(q))
    );
  });

  const favorites = computed(() => snippets.value.filter(s => s.favorite));

  function addSnippet(snippet: Omit<CommandSnippet, 'id' | 'createdAt'>): CommandSnippet {
    const newSnippet: CommandSnippet = {
      ...snippet,
      id: `snip_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`,
      createdAt: Date.now(),
    };
    snippets.value.unshift(newSnippet);
    saveSnippets(snippets.value);
    return newSnippet;
  }

  function updateSnippet(id: string, data: Partial<CommandSnippet>): void {
    const idx = snippets.value.findIndex(s => s.id === id);
    if (idx === -1) return;
    snippets.value[idx] = { ...snippets.value[idx], ...data };
    saveSnippets(snippets.value);
  }

  function toggleFavorite(id: string): void {
    const s = snippets.value.find(x => x.id === id);
    if (s) { s.favorite = !s.favorite; saveSnippets(snippets.value); }
  }

  function removeSnippet(id: string): void {
    snippets.value = snippets.value.filter(s => s.id !== id);
    saveSnippets(snippets.value);
  }

  function importSnippets(json: string): number {
    try {
      const data = JSON.parse(json);
      if (!Array.isArray(data)) return 0;
      let count = 0;
      for (const item of data) {
        if (item.title && item.command) {
          addSnippet({ title: item.title, command: item.command, tags: item.tags || [], favorite: item.favorite || false });
          count++;
        }
      }
      return count;
    } catch { return 0; }
  }

  function exportSnippets(): string {
    return JSON.stringify(snippets.value, null, 2);
  }

  return {
    snippets, searchQuery, filteredSnippets, favorites,
    addSnippet, updateSnippet, toggleFavorite, removeSnippet, importSnippets, exportSnippets,
  };
});
