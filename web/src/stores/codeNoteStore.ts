import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { storageGetJSON, storageSetJSON, storageRemove } from '@/utils/storage';

export interface CodeNote {
  id: string;
  name: string;
  command: string;
  source: 'terminal' | 'manual' | 'macro';
  createdAt: number;
  updatedAt: number;
  useCount: number;
}

function load(): CodeNote[] {
  return storageGetJSON('codeNotes', []);
}

function save(notes: CodeNote[]): void {
  storageSetJSON('codeNotes', notes);
}

export const useCodeNoteStore = defineStore('codeNotes', () => {
  const notes = ref<CodeNote[]>(load());

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
    storageRemove('codeNotes');
  }

  return {
    notes, recentNotes,
    addNote, updateName, updateCommand, removeNote, clearAll,
  };
});
