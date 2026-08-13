<template>
  <div class="page-view">
    <header class="page-head">
      <h1 class="page-title"><KeyRoundIcon :size="20"/> {{ t('keys.title') }}</h1>
      <p class="page-desc">{{ t('keys.desc') }}</p>
    </header>

    <div class="page-actions">
      <button class="pw-btn primary" @click="showAdd = !showAdd">
        <PlusIcon :size="13"/> {{ t('keys.add') }}
      </button>
    </div>

    <div class="key-form" v-if="showAdd">
      <input type="text" v-model="form.name" class="pw-input" :placeholder="t('keys.namePh')" autocomplete="off"/>
      <textarea v-model="form.content" class="pw-textarea" rows="6"
                :placeholder="t('keys.contentPh')" spellcheck="false"></textarea>
      <div class="key-form-btns">
        <button class="pw-btn minor" @click="cancelAdd">{{ t('common.cancel') }}</button>
        <button class="pw-btn primary" :disabled="!canSave" @click="saveKey">{{ t('common.save') }}</button>
      </div>
    </div>

    <div class="key-list" v-if="keys.length">
      <div class="key-item" v-for="k in keys" :key="k.id">
        <KeyIcon :size="17" class="key-icon"/>
        <div class="key-main">
          <div class="key-name">{{ k.name }}</div>
          <div class="key-meta">{{ keyType(k.content) }} · {{ k.content.length }} chars · {{ fmtDate(k.createdAt) }}</div>
        </div>
        <button class="key-act" :title="t('keys.show')" @click="k.show = !k.show">{{ k.show ? '🙈' : '👁' }}</button>
        <button class="key-act" :title="t('common.copy')" @click="copyKey(k)">⧉</button>
        <button class="key-act danger" :title="t('common.remove')" @click="removeKey(k.id)">&times;</button>
        <pre class="key-preview" v-if="k.show">{{ k.content }}</pre>
      </div>
    </div>

    <div class="page-empty" v-else-if="!showAdd">
      <KeyRoundIcon :size="38" class="empty-icon"/>
      <p>{{ t('keys.empty') }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive } from 'vue';
import { KeyRound as KeyRoundIcon, Key as KeyIcon, Plus as PlusIcon } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useUiStore } from '@/stores/uiStore';
import { loadKeychain, saveKeychain } from '@/utils/keychain';

const { t } = useI18n();
const uiStore = useUiStore();

const keys = ref(loadKeychain().map(k => ({ ...k, show: false })));
const showAdd = ref(false);
const form = reactive({ name: '', content: '' });

function persist() {
  saveKeychain(keys.value.map(({ show, ...rest }) => rest));
}

const canSave = computed(() => form.name.trim() && form.content.includes('---'));

function saveKey() {
  keys.value.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: form.name.trim(),
    content: form.content.trim(),
    createdAt: Date.now(),
    show: false,
  });
  persist();
  cancelAdd();
}
function cancelAdd() {
  showAdd.value = false;
  form.name = '';
  form.content = '';
}
function removeKey(id) {
  keys.value = keys.value.filter(k => k.id !== id);
  persist();
}
async function copyKey(k) {
  try {
    await navigator.clipboard.writeText(k.content);
    uiStore.addNotification({ message: t('keys.copied'), type: 'success', duration: 2500 });
  } catch {
    uiStore.addNotification({ message: t('keys.copyFail'), type: 'danger', duration: 2500 });
  }
}
function keyType(content) {
  if (content.includes('OPENSSH PRIVATE KEY')) return 'OpenSSH';
  if (content.includes('RSA PRIVATE KEY')) return 'RSA';
  if (content.includes('EC PRIVATE KEY')) return 'EC';
  if (content.includes('PRIVATE KEY')) return 'PEM';
  if (content.startsWith('ssh-')) return 'Public';
  return 'Key';
}
function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
</script>

<style scoped>
.page-view { max-width: 900px; margin: 0 auto; padding: 32px 24px 80px; }
.page-head { margin-bottom: 22px; }
.page-title { display: flex; align-items: center; gap: 9px; font-size: 19px; font-weight: 600; color: var(--app-text); letter-spacing: .2px; }
.page-desc { margin-top: 6px; font-size: 13px; color: var(--app-text-dim); }
.page-actions { display: flex; justify-content: flex-end; margin-bottom: 14px; }
.pw-btn { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; padding: 7px 14px; border-radius: 8px; cursor: pointer; border: 1px solid var(--app-border); background: var(--app-surface); color: var(--app-text); }
.pw-btn.primary { background: var(--bulma-primary); border-color: var(--bulma-primary); color: #fff; }
.pw-btn.primary:disabled { opacity: .5; cursor: not-allowed; }
.pw-btn.minor { color: var(--app-text-dim); }
.pw-btn:hover:not(:disabled) { filter: brightness(1.08); }
.key-form { background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 10px; padding: 14px; margin-bottom: 18px; display: flex; flex-direction: column; gap: 10px; }
.pw-input, .pw-textarea { width: 100%; background: var(--app-surface-hover); border: 1px solid var(--app-border); border-radius: 8px; color: var(--app-text); padding: 8px 10px; font-size: 13px; font-family: inherit; }
.pw-textarea { font-family: monospace; font-size: 12px; resize: vertical; }
.key-form-btns { display: flex; justify-content: flex-end; gap: 8px; }
.key-list { display: flex; flex-direction: column; gap: 8px; }
.key-item { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 10px; padding: 12px 14px; }
.key-icon { color: var(--app-text-dim); flex: none; }
.key-main { flex: 1; min-width: 140px; }
.key-name { font-size: 14px; font-weight: 500; color: var(--app-text); }
.key-meta { font-size: 12px; color: var(--app-text-dim); margin-top: 2px; }
.key-act { border: none; background: none; color: var(--app-text-dim); cursor: pointer; font-size: 14px; padding: 4px 8px; border-radius: 6px; }
.key-act:hover { background: var(--app-surface-hover); color: var(--app-text); }
.key-act.danger:hover { color: #ef4444; background: rgba(239,68,68,.1); }
.key-preview { width: 100%; margin: 6px 0 0; padding: 10px; background: var(--app-surface-hover); border-radius: 8px; font-size: 11px; color: var(--app-text-dim); white-space: pre-wrap; word-break: break-all; max-height: 180px; overflow: auto; }
.page-empty { text-align: center; padding: 70px 0; color: var(--app-text-dim); font-size: 14px; }
.empty-icon { opacity: .35; margin-bottom: 12px; }
</style>
