// @vitest-environment jsdom
// Component tests for SnippetPanel: add/validate/pin/send-to-macro/remove/edit.
// Store-level persistence is covered elsewhere; this locks the UI wiring.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import SnippetPanel from '@/components/snippets/SnippetPanel.vue';
import { useSnippetStore } from '@/stores/snippetStore';
import { useMacroStore } from '@/stores/macroStore';
import { useUiStore } from '@/stores/uiStore';

vi.mock('@/components/macro/BatchExecutionDialog.vue', () => ({
  default: { name: 'BatchExecutionDialog', template: '<div class="batch-stub"></div>' },
}));

function mountPanel() {
  return mount(SnippetPanel, { global: { plugins: [i18n], stubs: { teleport: true } } });
}

function buttonByTitle(wrapper, title) {
  return wrapper.find(`button[title="${title}"]`);
}

describe('SnippetPanel', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'zh-CN';
    setActivePinia(createPinia());
    localStorage.clear();
    sessionStorage.clear();
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  it('shows the empty state when there are no snippets', () => {
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain('还没有代码便签，点击 + 添加一个。');
  });

  it('adds a snippet from the form', async () => {
    const wrapper = mountPanel();
    await buttonByTitle(wrapper, '添加片段').trigger('click');

    await wrapper.find('.add-form input[type="text"]').setValue('check disk');
    await wrapper.find('.add-form textarea').setValue('df -h');
    await wrapper.find('.add-form .add-btn').trigger('click');

    const store = useSnippetStore();
    expect(store.snippets).toHaveLength(1);
    expect(store.snippets[0].title).toBe('check disk');
    expect(store.snippets[0].command).toBe('df -h');
    expect(wrapper.text()).toContain('check disk');
  });

  it('rejects a snippet with an empty title or command', async () => {
    const wrapper = mountPanel();
    await buttonByTitle(wrapper, '添加片段').trigger('click');
    await wrapper.find('.add-form .add-btn').trigger('click');

    expect(useUiStore().notifications.some(n => n.message.includes('标题和命令不能为空'))).toBe(true);
    expect(useSnippetStore().snippets).toHaveLength(0);
  });

  it('pins a snippet to the top', async () => {
    const store = useSnippetStore();
    store.addSnippet({ title: 'a', command: 'ls', tags: [], favorite: false });

    const wrapper = mountPanel();
    await buttonByTitle(wrapper, '置顶').trigger('click');

    expect(store.snippets[0].favorite).toBe(true);
    expect(wrapper.find('.snippet-item').classes()).toContain('is-pinned');
  });

  it('sends a snippet to the macro panel as a new macro', async () => {
    const store = useSnippetStore();
    store.addSnippet({ title: 'deploy', command: 'npm run build', tags: [], favorite: false });

    const wrapper = mountPanel();
    await buttonByTitle(wrapper, '添加到宏').trigger('click');

    const macros = useMacroStore().macros;
    expect(macros).toHaveLength(1);
    expect(macros[0].name).toBe('deploy');
    expect(macros[0].steps[0].command).toBe('npm run build');
  });

  it('removes a snippet', async () => {
    const store = useSnippetStore();
    store.addSnippet({ title: 'gone', command: 'rm -rf', tags: [], favorite: false });

    const wrapper = mountPanel();
    await buttonByTitle(wrapper, '删除').trigger('click');

    expect(store.snippets).toHaveLength(0);
    expect(wrapper.text()).toContain('还没有代码便签');
  });

  it('edits a snippet in place', async () => {
    const store = useSnippetStore();
    store.addSnippet({ title: 'old title', command: 'old cmd', tags: [], favorite: false });

    const wrapper = mountPanel();
    await buttonByTitle(wrapper, '编辑').trigger('click');

    await wrapper.find('.edit-form input[type="text"]').setValue('new title');
    await wrapper.find('.edit-form textarea').setValue('new cmd');
    await wrapper.find('.edit-form .add-btn').trigger('click');

    expect(store.snippets[0].title).toBe('new title');
    expect(store.snippets[0].command).toBe('new cmd');
  });
});
