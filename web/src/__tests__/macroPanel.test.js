// @vitest-environment jsdom
// Component tests for MacroPanel: add/validate/insert-snippet/remove/duplicate/
// favorite. Store-level behavior (persistence, schedule math, import/export) is
// covered separately by the store tests; this locks the UI wiring.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';
import MacroPanel from '@/components/macro/MacroPanel.vue';
import { useMacroStore } from '@/stores/macroStore';
import { useSnippetStore } from '@/stores/snippetStore';
import { useUiStore } from '@/stores/uiStore';

// BatchExecutionDialog pulls in terminal wiring; the panel's own behavior is
// under test here, so stub it out.
vi.mock('@/components/macro/BatchExecutionDialog.vue', () => ({
  default: { name: 'BatchExecutionDialog', template: '<div class="batch-stub"></div>' },
}));

function mountPanel() {
  return mount(MacroPanel, { global: { plugins: [i18n], stubs: { teleport: true } } });
}

function buttonByTitle(wrapper, title) {
  return wrapper.find(`button[title="${title}"]`);
}

function inputByPlaceholder(wrapper, ph) {
  return wrapper.find(`input[placeholder*="${ph}"]`);
}

describe('MacroPanel', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'zh-CN';
    setActivePinia(createPinia());
    localStorage.clear();
    sessionStorage.clear();
  });

  it('shows the empty state when there are no macros', () => {
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain('还没有宏，点击 + 创建一个。');
  });

  it('creates a macro from the add form', async () => {
    const wrapper = mountPanel();
    await buttonByTitle(wrapper, '新建宏').trigger('click');

    await inputByPlaceholder(wrapper, '宏名称').setValue('deploy');
    await inputByPlaceholder(wrapper, '输入命令').setValue('npm run build');
    await wrapper.find('.add-btn').trigger('click');

    const store = useMacroStore();
    expect(store.macros).toHaveLength(1);
    expect(store.macros[0].name).toBe('deploy');
    expect(store.macros[0].steps[0].command).toBe('npm run build');
    expect(wrapper.find('.macro-item').exists()).toBe(true);
    expect(wrapper.text()).toContain('deploy');
  });

  it('rejects a macro with an empty name or empty steps', async () => {
    const wrapper = mountPanel();
    await buttonByTitle(wrapper, '新建宏').trigger('click');

    // Fill only the name, leave the step command empty.
    await inputByPlaceholder(wrapper, '宏名称').setValue('empty-steps');
    await wrapper.find('.add-btn').trigger('click');

    // Validation errors surface as a toast (rendered outside the panel).
    expect(useUiStore().notifications.some(n => n.message.includes('名称和至少一个命令不能为空'))).toBe(true);
    expect(useMacroStore().macros).toHaveLength(0);
    expect(wrapper.find('.add-form').exists()).toBe(true); // form stays open
  });

  it('inserts a favorited snippet as a step via the picker', async () => {
    const snippetStore = useSnippetStore();
    snippetStore.addSnippet({ title: 'disk check', command: 'df -h', tags: [], favorite: true });

    const wrapper = mountPanel();
    await buttonByTitle(wrapper, '新建宏').trigger('click');
    await buttonByTitle(wrapper, '插入收藏代码').trigger('click');

    // The picker lists only favorited snippets.
    expect(wrapper.text()).toContain('disk check');
    await wrapper.find('.snippet-pick-item').trigger('click');

    // The snippet is appended as a NEW step (the first row stays empty).
    const stepInputs = wrapper.findAll('input[placeholder*="输入命令"]');
    expect(stepInputs[stepInputs.length - 1].element.value).toBe('df -h');

    await inputByPlaceholder(wrapper, '宏名称').setValue('disk');
    await wrapper.find('.add-btn').trigger('click');

    const store = useMacroStore();
    expect(store.macros).toHaveLength(1);
    expect(store.macros[0].steps[0].command).toBe('df -h');
  });

  it('shows the no-favorites hint when the picker has nothing to offer', async () => {
    const wrapper = mountPanel();
    await buttonByTitle(wrapper, '新建宏').trigger('click');
    await buttonByTitle(wrapper, '插入收藏代码').trigger('click');

    expect(wrapper.text()).toContain('暂无收藏代码');
    expect(wrapper.findAll('.snippet-pick-item')).toHaveLength(0);
  });

  it('deletes a macro', async () => {
    const store = useMacroStore();
    store.addMacro({ name: 'gone', description: '', steps: [{ command: 'ls', delay: 300 }], tags: [], favorite: false });

    const wrapper = mountPanel();
    expect(wrapper.findAll('.macro-item')).toHaveLength(1);
    await buttonByTitle(wrapper, '删除').trigger('click');

    expect(store.macros).toHaveLength(0);
    expect(wrapper.text()).toContain('还没有宏');
  });

  it('duplicates a macro and toggles its favorite flag', async () => {
    const store = useMacroStore();
    store.addMacro({ name: 'orig', description: '', steps: [{ command: 'ls', delay: 300 }], tags: [], favorite: false });

    const wrapper = mountPanel();
    await buttonByTitle(wrapper, '复制').trigger('click');
    expect(store.macros).toHaveLength(2);
    // addMacro unshifts, so the fresh copy lands at index 0.
    expect(store.macros[0].name).toBe('orig (copy)');
    expect(store.macros[1].name).toBe('orig');

    await buttonByTitle(wrapper, '收藏').trigger('click');
    expect(store.macros[0].favorite).toBe(true);
  });
});
