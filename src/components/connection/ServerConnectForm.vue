<template>
  <form @submit.prevent="onConnectSubmit" class="server-form" ref="formElement">
    <div class="form-header">
      <div class="form-header-left">
        <TerminalSquare :size="20" stroke-width="1.5"/>
        <span>{{ t('form.serverDetails') }}</span>
      </div>
      <button type="button" class="form-reset-btn" @click="clearForm" :title="t('form.clearForm')">
        <RotateCcw :size="13"/> {{ t('form.reset') }}
      </button>
    </div>

    <div class="form-grid">
      <div class="form-field span-2">
        <label for="scf-name">{{ t('form.label') }}</label>
        <div class="input-wrap">
          <Tag :size="15"/>
          <input id="scf-name" v-model.trim="form.name" :placeholder="t('form.label')" required/>
        </div>
      </div>

      <div class="form-field span-2">
        <label for="scf-group">{{ t('form.group') }}</label>
        <input id="scf-group" v-model="form.group" list="group-suggestions"
               :placeholder="t('form.groupPlaceholder')" class="input-sm"/>
        <datalist id="group-suggestions">
          <option v-for="g in existingGroups" :key="g" :value="g"/>
        </datalist>
      </div>

      <div class="form-field span-2">
        <label for="scf-host">{{ t('form.host') }}</label>
        <div class="input-wrap">
          <ServerIcon :size="15"/>
          <input id="scf-host" v-model.trim="form.host" :placeholder="t('form.hostPlaceholder')" required/>
        </div>
      </div>

      <div class="form-field">
        <label for="scf-port">{{ t('form.port') }}</label>
        <input id="scf-port" v-model.number="form.port" type="number" min="1" max="65535" class="input-sm" required/>
      </div>

      <div class="form-field">
        <label>{{ t('form.protocol') }}</label>
        <div class="protocol-selector">
          <button v-for="p in protocols" :key="p.id"
                  class="proto-btn" :class="{ 'is-selected': form.protocol === p.id }"
                  @click="form.protocol = p.id" :title="p.label">
            <component :is="p.icon" :size="18"/>
            <span>{{ p.id.toUpperCase() }}</span>
          </button>
        </div>
      </div>

      <div class="form-field span-2">
        <label for="scf-user">{{ t('form.username') }}</label>
        <div class="input-wrap">
          <User :size="15"/>
          <input id="scf-user" v-model.trim="form.username" placeholder="root" required/>
        </div>
      </div>

      <div class="form-field span-2">
        <label for="scf-auth">{{ t('form.authType') }}</label>
        <div class="auth-tabs">
          <button class="auth-tab" :class="{ 'is-active': form.auth_type === 'password' }"
                  @click="form.auth_type = 'password'; form.auth_value = ''">{{ t('form.password') }}</button>
          <button class="auth-tab" :class="{ 'is-active': form.auth_type === 'key' }"
                  @click="form.auth_type = 'key'; form.auth_value = ''">{{ t('form.privateKey') }}</button>
        </div>
      </div>

      <div class="form-field span-2">
        <label>{{ form.auth_type === 'password' ? t('form.password') : t('form.privateKey') }}</label>
        <div class="input-wrap" :class="{ 'is-textarea': form.auth_type === 'key' }">
          <KeyRound :size="15"/>
          <textarea v-if="form.auth_type === 'key'" v-model="form.auth_value"
                    :placeholder="t('form.keyPlaceholder')" rows="4" :required="authValueRequired"
                    class="key-input"/>
          <input v-else v-model="form.auth_value" type="password"
                 :placeholder="t('form.passwordPlaceholder')" :required="authValueRequired" autocomplete="new-password"/>
        </div>
        <p v-if="willUseRememberedCredentialForSubmit" class="form-hint is-success">
          <CheckCircle :size="12"/> {{ t('form.usingRemembered') }}
        </p>
      </div>

      <div class="form-field span-2">
        <label class="checkbox-label">
          <input type="checkbox" v-model="form.rememberForSession"/>
          <span>{{ t('form.rememberSession') }}</span>
          <HelpCircle :size="13" class="hint-icon" :title="t('form.rememberHint')"/>
        </label>
      </div>
    </div>

    <div class="form-actions">
      <button type="button" class="btn btn-outlined" @click="onTestSubmit"
              :class="{ 'is-loading': isTesting }" :disabled="isLoading">
        <ShieldCheck :size="15"/> {{ t('form.test') }}
      </button>
      <button type="submit" class="btn btn-primary" :class="{ 'is-loading': isConnecting }" :disabled="isLoading">
        <TerminalSquare :size="15"/> {{ t('form.connect') }}
      </button>
    </div>
  </form>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConnectionStore } from '@/stores/connectionStore';
import { ConnectionStatus } from '@/utils/constants';
import { Tag, Server as ServerIcon, User, KeyRound, TerminalSquare, ShieldCheck, RotateCcw, HelpCircle, CheckCircle, Terminal, Monitor, Video, Wifi } from 'lucide-vue-next';
import { useNotifications } from '@/composables/useNotifications';

const { t } = useI18n();

const props = defineProps({ initialData: { type: Object, default: null } });
const emit = defineEmits(['connect', 'test-connection', 'form-cleared']);

const connectionStore = useConnectionStore();
const formElement = ref(null);
const { showError } = useNotifications();

const protocols = [
  { id: 'ssh', label: 'SSH', icon: Terminal },
  { id: 'rdp', label: 'RDP', icon: Monitor },
  { id: 'vnc', label: 'VNC', icon: Video },
  { id: 'telnet', label: 'Telnet', icon: Wifi },
];

const existingGroups = computed(() => connectionStore.groups.filter(g => g !== 'Ungrouped'));

const defaultForm = () => ({
  id: null, name: 'My Server ' + (Date.now() % 10000),
  host: '', port: 22, username: '', protocol: 'ssh', group: '',
  auth_type: 'password', auth_value: '', rememberForSession: false,
});

const form = ref(defaultForm());
const isTesting = computed(() => connectionStore.sshTestLoading);
const isConnecting = computed(() => connectionStore.connectionStatus === ConnectionStatus.CONNECTING);
const isLoading = computed(() => isTesting.value || isConnecting.value);

const willUseRememberedCredentialForSubmit = computed(() =>
  !!(form.value.id && form.value.rememberForSession && !form.value.auth_value.trim() &&
    connectionStore.getCredentialFromSessionStorage(form.value.id)?.auth_value)
);

const authValueRequired = computed(() => {
  if (form.value.auth_value.trim()) return false;
  if (willUseRememberedCredentialForSubmit.value) return false;
  return true;
});

watch(() => props.initialData, (d) => {
  if (d) {
    form.value = { ...defaultForm(), ...d, auth_value: '', protocol: d.protocol || 'ssh' };
    nextTick(() => formElement.value?.querySelector('#scf-host')?.focus());
  } else clearForm();
}, { immediate: true });

function clearForm() {
  form.value = defaultForm();
  form.value.name = `My Server ${connectionStore.savedConnections.length + 1}`;
  connectionStore.sshTestResult = null;
  emit('form-cleared');
}

const HOST_RE = /^(\d{1,3}\.){3}\d{1,3}$|^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

function validate() {
  if (!form.value.name.trim()) { showError(t('form.nameRequired')); return false; }
  if (!form.value.host.trim()) { showError(t('form.hostRequired')); return false; }
  if (!HOST_RE.test(form.value.host.trim())) { showError(t('form.invalidHost')); return false; }
  if (form.value.host.split('.').some(p => { const n = Number(p); return n < 0 || n > 255; })) { showError(t('form.ipRange')); return false; }
  if (form.value.port < 1 || form.value.port > 65535) { showError(t('form.portRange')); return false; }
  if (!form.value.username.trim()) { showError(t('form.usernameRequired')); return false; }
  if (authValueRequired.value) { showError(t('form.credentialsRequired')); return false; }
  return true;
}

function submit(action) {
  if (!validate()) return;
  emit(action === 'connect' ? 'connect' : 'test-connection', { ...form.value });
  if (!willUseRememberedCredentialForSubmit.value) form.value.auth_value = '';
}

const onConnectSubmit = () => submit('connect');
const onTestSubmit = () => submit('test');
</script>

<style lang="scss" scoped>
.server-form {
  background: var(--bulma-box-background-color);
  backdrop-filter: blur(12px);
  border: 1px solid var(--bulma-border-light);
  border-radius: 12px;
  padding: 1.25rem;
  transition: box-shadow 0.2s;
  &:hover { box-shadow: var(--bulma-shadow-lg, 0 12px 40px rgba(30,25,60,0.08)); }
}

.form-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 1rem; font-size: 0.9em; font-weight: 600; color: var(--bulma-text-strong);
  gap: 0.5rem;
}

.form-header-left { display: flex; align-items: center; gap: 0.4rem; }

.form-reset-btn {
  background: none; border: none; color: var(--bulma-text-light); cursor: pointer;
  font-size: 0.8em; display: flex; align-items: center; gap: 0.25rem; padding: 0.2rem 0.5rem;
  border-radius: 6px; transition: all 0.12s;
  &:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); }
}

.form-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem;
}

.form-field {
  label { display: block; font-size: 0.7em; font-weight: 500; color: var(--bulma-text-light); margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 0.03em; }
  &.span-2 { grid-column: 1 / -1; }
}

.input-wrap {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.4rem 0.6rem; border-radius: 8px;
  border: 1.5px solid var(--bulma-border); background: var(--bulma-input-background-color);
  transition: border-color 0.15s, box-shadow 0.15s;
  &:focus-within { border-color: var(--bulma-primary); box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
  input { flex: 1; border: none; background: none; outline: none; font-size: 0.85em; color: var(--bulma-text); &::placeholder { color: var(--bulma-text-light); opacity: 0.5; } }
  .lucide { flex-shrink: 0; color: var(--bulma-text-light); }
  &.is-textarea { align-items: flex-start; }
}

.input-sm { width: 100%; padding: 0.4rem 0.6rem; border-radius: 8px; border: 1.5px solid var(--bulma-border); background: var(--bulma-input-background-color); font-size: 0.85em; color: var(--bulma-text); outline: none; transition: border-color 0.15s; &:focus { border-color: var(--bulma-primary); box-shadow: 0 0 0 3px rgba(99,102,241,0.12); } }

.key-input {
  flex: 1; border: none; background: none; outline: none; font-size: 0.8em;
  font-family: var(--bulma-family-monospace); resize: vertical; color: var(--bulma-text);
  min-height: 70px;
}

.protocol-selector {
  display: flex; gap: 3px;
}

.proto-btn {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 0.35rem 0; border: 1.5px solid var(--bulma-border);
  background: var(--bulma-input-background-color); border-radius: 8px;
  cursor: pointer; color: var(--bulma-text-light); font-size: 0.65em; font-weight: 600;
  transition: all 0.12s;
  &:hover { border-color: var(--bulma-primary); color: var(--bulma-primary); }
  &.is-selected { border-color: var(--bulma-primary); background: rgba(99,102,241,0.08); color: var(--bulma-primary); }
  .lucide { transition: none; }
}

.auth-tabs {
  display: flex; border-radius: 8px; overflow: hidden; border: 1.5px solid var(--bulma-border);
}

.auth-tab {
  flex: 1; padding: 0.35rem 0; border: none; background: var(--bulma-input-background-color);
  font-size: 0.8em; cursor: pointer; color: var(--bulma-text-light); transition: all 0.12s;
  &.is-active { background: var(--bulma-primary); color: white; font-weight: 500; }
  &:not(.is-active):hover { background: var(--bulma-scheme-main-ter); }
}

.checkbox-label {
  display: flex; align-items: center; gap: 0.35rem; font-size: 0.8em; cursor: pointer; color: var(--bulma-text);
  input[type="checkbox"] { accent-color: var(--bulma-primary); }
}

.hint-icon { color: var(--bulma-text-light); cursor: help; }

.form-hint {
  font-size: 0.7em; display: flex; align-items: center; gap: 0.25rem; margin-top: 0.2rem;
  &.is-success { color: var(--bulma-success); }
}

.form-actions {
  display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;
}

.btn {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.85em; font-weight: 500;
  border: none; cursor: pointer; transition: all 0.15s;
  &.btn-primary { background: linear-gradient(135deg, hsl(235,40%,45%), hsl(235,50%,58%)); color: white;
    &:hover { box-shadow: 0 4px 16px rgba(99,102,241,0.3); transform: translateY(-1px); }
  }
  &.btn-outlined { background: transparent; border: 1.5px solid var(--bulma-border); color: var(--bulma-text);
    &:hover { border-color: var(--bulma-primary); color: var(--bulma-primary); }
  }
  &.is-loading { opacity: 0.7; pointer-events: none; position: relative; &::after {
    content: ''; width: 14px; height: 14px; border: 2px solid transparent;
    border-top-color: currentColor; border-radius: 50%; animation: spin 0.6s linear infinite;
  } }
}

@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 768px) {
  .form-grid { grid-template-columns: 1fr; }
  .form-field.span-2 { grid-column: 1; }
  .form-actions { flex-direction: column; .btn { width: 100%; justify-content: center; } }
}
</style>
