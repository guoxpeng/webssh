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

    <div class="form-section">
      <div class="form-section-title">{{ t('form.sectionBasic') }}</div>
      <div class="form-grid">
      <div class="form-field span-2">
        <label for="scf-name">{{ t('form.label') }}</label>
        <div class="input-wrap">
          <FileText :size="15"/>
          <input id="scf-name" v-model.trim="form.name" :placeholder="t('form.label')" required/>
        </div>
      </div>

      <div class="form-field span-2">
        <label for="scf-group">{{ t('form.group') }}</label>
        <div class="input-wrap">
          <Folder :size="15"/>
          <input id="scf-group" v-model="form.group" list="group-suggestions"
                 :placeholder="t('form.groupPlaceholder')"/>
        </div>
        <datalist id="group-suggestions">
          <option v-for="g in existingGroups" :key="g" :value="g"/>
        </datalist>
      </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">{{ t('form.sectionConnection') }}</div>
      <div class="form-grid">
      <div class="form-field span-2">
        <label for="scf-host">{{ t('form.host') }}</label>
        <div class="input-wrap">
          <ServerIcon :size="15"/>
          <input id="scf-host" v-model.trim="form.host" :placeholder="t('form.hostPlaceholder')" required/>
        </div>
      </div>

      <div class="form-field">
        <label for="scf-port">{{ t('form.port') }}</label>
        <div class="input-wrap">
          <Network :size="15"/>
          <input id="scf-port" v-model.number="form.port" type="number" min="1" max="65535" required/>
        </div>
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


      <template v-if="form.protocol === 'serial'">
        <div class="form-field">
          <label>{{ t('protocol.serialPort') }}</label>
          <div class="input-wrap">
            <Cable :size="15"/>
            <input v-model="form.serial_port" placeholder="COM1 (e.g. COM1, /dev/ttyUSB0)" required class="serial-port-input"/>
          </div>
        </div>
        <div class="form-field">
          <label>{{ t('protocol.serialBaud') }}</label>
          <select v-model.number="form.serial_baud" class="input-sm">
            <option v-for="b in [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]" :key="b" :value="b">{{ b }}</option>
          </select>
        </div>
        <div class="form-field">
          <label>{{ t('protocol.serialDataBits') }}</label>
          <select v-model.number="form.serial_dataBits" class="input-sm">
            <option v-for="b in [5, 6, 7, 8]" :key="b" :value="b">{{ b }}</option>
          </select>
        </div>
        <div class="form-field">
          <label>{{ t('protocol.serialStopBits') }}</label>
          <select v-model.number="form.serial_stopBits" class="input-sm">
            <option v-for="b in [1, 2]" :key="b" :value="b">{{ b }}</option>
          </select>
        </div>
        <div class="form-field">
          <label>{{ t('protocol.serialParity') }}</label>
          <select v-model="form.serial_parity" class="input-sm">
            <option value="none">None</option>
            <option value="even">Even</option>
            <option value="odd">Odd</option>
            <option value="mark">Mark</option>
            <option value="space">Space</option>
          </select>
        </div>
      </template>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">{{ t('form.sectionAuth') }}</div>
      <div class="form-grid">
      <div class="form-field span-2" v-if="form.protocol !== 'serial'">
        <label for="scf-user">{{ t('form.username') }}</label>
        <div class="input-wrap">
          <User :size="15"/>
          <input id="scf-user" v-model.trim="form.username" :placeholder="t('form.username')" :required="form.protocol !== 'serial'"/>
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
                 :placeholder="t('form.passwordPlaceholder')" :required="authValueRequired" autocomplete="new-password"
                 @focus="preloadTerminal"/>
          <div v-if="form.auth_type === 'key'" class="key-actions" ref="keyActionsRef">
            <button type="button" class="key-upload-btn" @click="triggerKeyFileInput" :title="t('form.keyFileUpload')">
              <Upload :size="14"/>
            </button>
            <button type="button" class="key-upload-btn" @click="toggleKeyPicker" :title="t('form.pickFromKeychain')">
              <KeyRound :size="14"/>
            </button>
            <input type="file" ref="keyFileInputRef" accept=".pem,.ppk,.key,.cer,.id_rsa,.id_ecdsa,.id_ed25519" style="display:none" @change="onKeyFileSelect"/>
            <div v-if="showKeyPicker" class="keychain-picker">
              <div v-if="keychainKeys.length === 0" class="keychain-picker-empty">{{ t('form.keychainEmpty') }}</div>
              <button v-for="k in keychainKeys" :key="k.id" type="button" class="keychain-pick-item" @click="pickKey(k)">
                <KeyRound :size="13"/> {{ k.name }}
              </button>
            </div>
          </div>
        </div>
        <div v-if="form.auth_type === 'key' && keyFileInfo" class="key-info">
          <span class="key-info-badge" :class="'is-' + keyFileInfo.type">{{ keyFileInfo.label }}</span>
          <span class="key-info-detail">{{ keyFileInfo.detail }}</span>
        </div>
        <p v-if="willUseRememberedCredentialForSubmit" class="form-hint is-success">
          <CheckCircle :size="12"/> {{ t('form.usingRemembered') }}
        </p>
      </div>
      </div>
    </div>


    <div class="form-actions">
      <button type="button" class="btn btn-outlined" @click="onSaveSubmit" :disabled="isLoading">
        <CheckCircle :size="15"/> {{ t('form.save') }}
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
import { FileText, Folder, Network, Server as ServerIcon, User, KeyRound, TerminalSquare, RotateCcw, CheckCircle, Upload, Terminal, Monitor, Video, Wifi, Cable } from 'lucide-vue-next';
import { useNotifications } from '@/composables/useNotifications';
import { loadKeychain } from '@/utils/keychain';

const { t } = useI18n();

const props = defineProps({ initialData: { type: Object, default: null } });
const emit = defineEmits(['connect', 'save-connection', 'form-cleared']);

const connectionStore = useConnectionStore();
const formElement = ref(null);
const keyFileInputRef = ref(null);
const keyFileInfo = ref(null);
const { showError } = useNotifications();

const KEY_TYPE_MAP = {
  'OPENSSH':    { label: 'OpenSSH',   class: 'openssh' },
  'RSA':        { label: 'RSA',       class: 'rsa' },
  'EC':         { label: 'ECDSA',     class: 'ecdsa' },
  'DSA':        { label: 'DSA',       class: 'dsa' },
  'SSH2':       { label: 'SSH2',      class: 'ssh2' },
  'PUTTY':      { label: 'PuTTY PPK', class: 'putty' },
  'PRIVATE KEY':{ label: 'Private Key', class: 'generic' },
};

function detectKeyType(content) {
  if (!content || typeof content !== 'string') return null;
  const trimmed = content.trim();
  const firstLine = trimmed.split('\n')[0].trim();
  for (const [marker, info] of Object.entries(KEY_TYPE_MAP)) {
    if (firstLine.includes(marker) || firstLine.includes(`BEGIN ${marker}`)) {
      return info;
    }
  }
  if (trimmed.startsWith('PuTTY-User-Key-File')) return KEY_TYPE_MAP.PUTTY;
  return null;
}

function triggerKeyFileInput() {
  keyFileInputRef.value?.click();
}

// ── Keychain picker ──
const showKeyPicker = ref(false);
const keychainKeys = ref([]);
const keyActionsRef = ref(null);

function toggleKeyPicker() {
  showKeyPicker.value = !showKeyPicker.value;
  if (showKeyPicker.value) {
    keychainKeys.value = loadKeychain();
    setTimeout(() => document.addEventListener('click', onDocClickClosePicker, { once: true }), 0);
  }
}
function onDocClickClosePicker(e) {
  if (keyActionsRef.value && !keyActionsRef.value.contains(e.target)) {
    showKeyPicker.value = false;
  }
}
function pickKey(k) {
  form.value.auth_value = k.content;
  showKeyPicker.value = false;
  keyFileInfo.value = detectKeyType(k.content);
}

function onKeyFileSelect(e) {
  const file = e.target?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const content = ev.target?.result;
    if (typeof content === 'string') {
      form.value.auth_value = content;
      const detected = detectKeyType(content);
      if (detected) {
        keyFileInfo.value = {
          type: detected.class,
          label: detected.label,
          detail: file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)',
        };
      } else {
        keyFileInfo.value = {
          type: 'generic',
          label: file.name,
          detail: (file.size / 1024).toFixed(1) + ' KB',
        };
      }
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

const protocols = [
  { id: 'ssh', label: 'SSH', icon: Terminal },
  { id: 'rdp', label: 'RDP', icon: Monitor },
  { id: 'vnc', label: 'VNC', icon: Video },
  { id: 'telnet', label: 'Telnet', icon: Wifi },
  { id: 'serial', label: 'Serial', icon: Cable },
];

const existingGroups = computed(() => connectionStore.groups.filter(g => g !== 'Ungrouped'));

const defaultForm = () => ({
  id: null, name: t('form.defaultName', { n: Date.now() % 10000 }),
  host: '', port: 22, username: '', protocol: 'ssh', group: '',
  auth_type: 'password', auth_value: '',
  serial_port: '', serial_baud: 115200, serial_dataBits: 8, serial_stopBits: 1, serial_parity: 'none',
});

const form = ref(defaultForm());
const isTesting = computed(() => connectionStore.sshTestLoading);
const isConnecting = computed(() => connectionStore.connectionStatus === ConnectionStatus.CONNECTING);
const isLoading = computed(() => isTesting.value || isConnecting.value);

const willUseRememberedCredentialForSubmit = computed(() =>
  !!(form.value.id && !form.value.auth_value.trim() &&
    connectionStore.sessionRememberedCredentials[form.value.id]?.auth_value)
);

const authValueRequired = computed(() => {
  if (form.value.protocol === 'telnet') return false;
  if (form.value.auth_value.trim()) return false;
  if (willUseRememberedCredentialForSubmit.value) return false;
  return true;
});

watch(() => props.initialData, (d) => {
  if (d) {
    form.value = { ...defaultForm(), ...d, auth_value: d.auth_value || '', protocol: d.protocol || 'ssh' };
    nextTick(() => formElement.value?.querySelector('#scf-host')?.focus());
  } else clearForm();
}, { immediate: true });

function clearForm() {
  form.value = defaultForm();
  form.value.name = t('form.defaultName', { n: connectionStore.savedConnections.length + 1 });
  connectionStore.sshTestResult = null;
  emit('form-cleared');
}

const HOST_RE = /^(\d{1,3}\.){3}\d{1,3}$|^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

function validate() {
  if (!form.value.name.trim()) { showError(t('form.nameRequired')); return false; }
  if (form.value.protocol === 'serial') {
    if (!form.value.serial_port.trim()) { showError(t('form.hostRequired')); return false; }
    return true;
  }
  if (!form.value.host.trim()) { showError(t('form.hostRequired')); return false; }
  if (!HOST_RE.test(form.value.host.trim())) { showError(t('form.invalidHost')); return false; }
  if (form.value.host.split('.').some(p => { const n = Number(p); return n < 0 || n > 255; })) { showError(t('form.ipRange')); return false; }
  if (form.value.port < 1 || form.value.port > 65535) { showError(t('form.portRange')); return false; }
  if (form.value.protocol !== 'telnet' && !form.value.username.trim()) { showError(t('form.usernameRequired')); return false; }
  if (authValueRequired.value) { showError(t('form.credentialsRequired')); return false; }
  return true;
}

let _preloaded = false;
function preloadTerminal() {
  if (_preloaded) return;
  _preloaded = true;
  import('@/views/TerminalView.vue').catch(() => {});
}

function submit(_action) {
  if (!validate()) return;
  emit('connect', { ...form.value });
}

const onConnectSubmit = () => submit('connect');
const onSaveSubmit = () => {
  if (!validate()) return;
  emit('save-connection', { ...form.value });
};
</script>

<style lang="scss" scoped>
.server-form {
  background: var(--bulma-box-background-color);
  backdrop-filter: blur(12px);
  border: 1px solid var(--bulma-border-light);
  border-radius: 14px;
  padding: 1.4rem;
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

.form-section { margin-bottom: 1.25rem; }
.form-section:last-of-type { margin-bottom: 0; }
.form-section-title {
  display: flex; align-items: center; gap: 0.55rem;
  font-size: 0.68em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.09em;
  color: var(--bulma-text-light); opacity: .8; margin-bottom: 0.6rem;
  &::after { content: ''; flex: 1; height: 1px; background: var(--bulma-border-light); }
}

.form-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem;
}

.form-field {
  label { display: block; font-size: 0.7em; font-weight: 500; color: var(--bulma-text-light); margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 0.03em; }
  &.span-2 { grid-column: 1 / -1; }
}

.input-wrap {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.48rem 0.65rem; border-radius: 10px;
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


.keychain-picker {
  position: absolute; right: 4px; top: calc(100% + 6px); z-index: 30;
  min-width: 210px; max-width: 300px; max-height: 240px; overflow: auto;
  background: var(--app-surface); border: 1px solid var(--app-border);
  border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.25);
  padding: 5px; display: flex; flex-direction: column; gap: 2px;
}
.keychain-picker-empty { padding: 12px 10px; font-size: 12.5px; color: var(--app-text-dim); text-align: center; }
.keychain-pick-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  border: none; background: none; color: var(--app-text);
  font-size: 13px; padding: 8px 10px; border-radius: 7px; cursor: pointer; text-align: left;
}
.keychain-pick-item:hover { background: var(--app-surface-hover); }

.key-actions {
  position: relative;
  display: flex; flex-direction: column; gap: 2px; align-self: stretch;
  justify-content: flex-start; padding-top: 2px;
}

.key-upload-btn {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border: 1.5px solid var(--bulma-border);
  border-radius: 6px; background: var(--bulma-input-background-color);
  color: var(--bulma-text-light); cursor: pointer; transition: all 0.12s;
  &:hover { border-color: var(--bulma-primary); color: var(--bulma-primary); background: rgba(99,102,241,0.06); }
}

.key-info {
  display: flex; align-items: center; gap: 0.4rem; margin-top: 0.3rem;
}

.key-info-badge {
  font-size: 0.65em; font-weight: 600; padding: 1px 6px; border-radius: 4px;
  background: color-mix(in srgb, var(--bulma-text) 10%, transparent);
  color: var(--bulma-text-light);
  &.is-openssh { background: color-mix(in srgb, var(--bulma-success) 18%, transparent); color: var(--bulma-success); }
  &.is-rsa { background: color-mix(in srgb, var(--bulma-info) 18%, transparent); color: var(--bulma-info); }
  &.is-ecdsa { background: color-mix(in srgb, var(--bulma-primary) 18%, transparent); color: var(--bulma-primary); }
  &.is-dsa { background: color-mix(in srgb, var(--bulma-warning) 18%, transparent); color: var(--bulma-warning); }
  &.is-putty { background: color-mix(in srgb, var(--bulma-danger) 18%, transparent); color: var(--bulma-danger); }
  &.is-ssh2 { background: color-mix(in srgb, var(--bulma-info) 18%, transparent); color: var(--bulma-info); }
  &.is-generic { background: color-mix(in srgb, var(--bulma-text) 10%, transparent); color: var(--bulma-text-light); }
}
:root.is-dark-mode .key-info-badge {
  &.is-openssh { background: color-mix(in srgb, var(--bulma-success) 22%, transparent); color: color-mix(in srgb, var(--bulma-success) 80%, white); }
  &.is-rsa { background: color-mix(in srgb, var(--bulma-info) 22%, transparent); color: color-mix(in srgb, var(--bulma-info) 80%, white); }
  &.is-ecdsa { background: color-mix(in srgb, var(--bulma-primary) 22%, transparent); color: color-mix(in srgb, var(--bulma-primary) 80%, white); }
  &.is-putty { background: color-mix(in srgb, var(--bulma-danger) 22%, transparent); color: color-mix(in srgb, var(--bulma-danger) 80%, white); }
  &.is-ssh2 { background: color-mix(in srgb, var(--bulma-info) 22%, transparent); color: color-mix(in srgb, var(--bulma-info) 80%, white); }
}

.key-info-detail {
  font-size: 0.7em; color: var(--bulma-text-light);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.protocol-selector {
  display: flex; gap: 4px; padding: 4px; border-radius: 10px;
  background: color-mix(in srgb, var(--bulma-text) 6%, transparent);
}

.proto-btn {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 0.38rem 0; border: none;
  background: transparent; border-radius: 7px;
  cursor: pointer; color: var(--bulma-text-light); font-size: 0.65em; font-weight: 600;
  transition: all 0.12s;
  &:hover { color: var(--bulma-text); }
  &.is-selected {
    background: var(--bulma-box-background-color); color: var(--bulma-primary);
    box-shadow: 0 1px 5px rgba(0,0,0,0.12);
  }
  .lucide { transition: none; }
}

.auth-tabs {
  display: flex; gap: 4px; padding: 4px; border-radius: 10px;
  background: color-mix(in srgb, var(--bulma-text) 6%, transparent);
}

.auth-tab {
  flex: 1; padding: 0.42rem 0; border: none; background: transparent; border-radius: 7px;
  font-size: 0.8em; cursor: pointer; color: var(--bulma-text-light); transition: all 0.12s;
  &.is-active {
    background: var(--bulma-box-background-color); color: var(--bulma-primary);
    font-weight: 600; box-shadow: 0 1px 5px rgba(0,0,0,0.12);
  }
  &:not(.is-active):hover { color: var(--bulma-text); }
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
  display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.35rem;
}

.btn {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.55rem 1.15rem; border-radius: 10px; font-size: 0.85em; font-weight: 500;
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
  /* Prevent iOS zoom-on-focus; bigger touch targets for inputs/buttons */
  :deep(input), :deep(select), :deep(textarea) { font-size: 16px; }
  .btn { min-height: 44px; }
}
</style>
