// @vitest-environment jsdom
// Component tests for CodeNotePanel (历史代码): list/remove/clear-all/save-to-
// snippet/edit. The store layer (dedup on add, cap at 500) is separate; this
// locks the UI wiring and the destructive clear-all confirmation gate.
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import CodeNotePanel from '@/components/codeNotes/CodeNotePanel.vue';
import { useCodeNoteStore } from '@/stores/codeNoteStore';
import { useSnippetStore } from '@/stores/snippetStore';

function mountPanel() {
  return mount(CodeNotePanel, { global: { plugins: [i18n], stubs: { teleport: true } } });
}

function buttonByTitle(wrapper, title) {
  return wrapper.find(`button[title="${title}"]`);
}

describe('CodeNotePanel', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'zh-CN';
    setActivePinia(createPinia());
    localStorage.clear();
    sessionStorage.clear();
  });

  it('shows the empty state when there are no notes', () => {
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain('暂无代码笔记');
  });

  it('lists seeded notes', () => {
    const store = useCodeNoteStore();
    store.addNote('ls -la', 'terminal');
    store.addNote('df -h', 'manual');

    const wrapper = mountPanel();
    expect(wrapper.findAll('.note-item')).toHaveLength(2);
    expect(wrapper.text()).toContain('ls -la');
    expect(wrapper.text()).toContain('df -h');
  });

  it('removes a note', async () => {
    const store = useCodeNoteStore();
    store.addNote('rm -rf /tmp/x', 'terminal');

    const wrapper = mountPanel();
    await buttonByTitle(wrapper, '删除').trigger('click');

    expect(store.notes).toHaveLength(0);
    expect(wrapper.text()).toContain('暂无代码笔记');
  });

  it('clears all notes only after confirmation', async () => {
    const store = useCodeNoteStore();
    store.addNote('a', 'terminal');
    store.addNote('b', 'manual');

    const wrapper = mountPanel();
    await buttonByTitle(wrapper, '全部删除').trigger('click');

    // The confirm modal appears; nothing is deleted until we confirm.
    expect(wrapper.find('.modal-body').exists()).toBe(true);
    expect(store.notes).toHaveLength(2);

    await wrapper.find('.modal-body .modal-btn.is-danger').trigger('click');
    expect(store.notes).toHaveLength(0);
    expect(wrapper.text()).toContain('暂无代码笔记');
  });

  it('saves a note to the snippet store', async () => {
    const store = useCodeNoteStore();
    store.addNote('kubectl get pods', 'terminal');

    const wrapper = mountPanel();
    await buttonByTitle(wrapper, '加入收藏').trigger('click');

    const snippets = useSnippetStore().snippets;
    expect(snippets).toHaveLength(1);
    expect(snippets[0].command).toBe('kubectl get pods');
  });

  it('edits a note in place', async () => {
    const store = useCodeNoteStore();
    store.addNote('old command', 'manual');

    const wrapper = mountPanel();
    await buttonByTitle(wrapper, '编辑').trigger('click');

    await wrapper.find('.note-edit-form input[type="text"]').setValue('renamed');
    await wrapper.find('.note-edit-form textarea').setValue('new command');
    await wrapper.find('.note-edit-form .add-btn').trigger('click');

    expect(store.notes[0].name).toBe('renamed');
    expect(store.notes[0].command).toBe('new command');
  });
});
