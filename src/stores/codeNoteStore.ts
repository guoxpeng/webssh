import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface CodeNote {
  id: string;
  name: string;
  command: string;
  source: 'terminal' | 'manual' | 'macro';
  createdAt: number;
  updatedAt: number;
  useCount: number;
}

const STORAGE_KEY = 'webssh_code_notes';

function load(): CodeNote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function save(notes: CodeNote[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export const useCodeNoteStore = defineStore('codeNotes', () => {
  const notes = ref<CodeNote[]>(load());
  const searchQuery = ref('');

  const filteredNotes = computed(() => {
    const q = searchQuery.value.toLowerCase().trim();
    if (!q) return notes.value;
    return notes.value.filter(n =>
      n.name.toLowerCase().includes(q) ||
      n.command.toLowerCase().includes(q)
    );
  });

  const recentNotes = computed(() =>
    [...notes.value].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50)
  );

  function addNote(cmd: string, source: CodeNote['source'] = 'terminal'): CodeNote {
    const existing = notes.value.find(n => n.command === cmd);
    if (existing) {
      existing.useCount++;
      existing.updatedAt = Date.now();
      save(notes.value);
      return existing;
    }
    const note: CodeNote = {
      id: `note_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`,
      name: cmd.length > 40 ? cmd.substring(0, 40) + '...' : cmd,
      command: cmd,
      source,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      useCount: 1,
    };
    notes.value.unshift(note);
    if (notes.value.length > 500) notes.value.pop();
    save(notes.value);
    return note;
  }

  function updateName(id: string, name: string): void {
    const n = notes.value.find(x => x.id === id);
    if (n) { n.name = name; n.updatedAt = Date.now(); save(notes.value); }
  }

  function updateCommand(id: string, command: string): void {
    const n = notes.value.find(x => x.id === id);
    if (n) { n.command = command; n.updatedAt = Date.now(); save(notes.value); }
  }

  function removeNote(id: string): void {
    notes.value = notes.value.filter(n => n.id !== id);
    save(notes.value);
  }

  function clearAll(): void {
    notes.value = [];
    localStorage.removeItem(STORAGE_KEY);
  }

  return {
    notes, searchQuery, filteredNotes, recentNotes,
    addNote, updateName, updateCommand, removeNote, clearAll,
  };
});
