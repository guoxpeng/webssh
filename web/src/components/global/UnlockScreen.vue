<template>
    <div v-if="locked" class="unlock-overlay">
    <div class="unlock-card">
      <div v-if="checking" class="unlock-loading">
        <div class="btn-loading"></div>
      </div>
      <template v-else>
      <div class="unlock-icon">
        <KeyRound v-if="isSetup" :size="48"/>
        <Lock v-else :size="48"/>
      </div>
      <h2 class="unlock-title">{{ isSetup ? t('unlock.setPassword') : t('unlock.enterPassword') }}</h2>
      <p class="unlock-desc" v-if="isSetup">{{ t('unlock.description') }}</p>
      <div v-if="isSetup && isElectron" class="unlock-exe-warn">
        <Info :size="16"/>
        <span>{{ t('unlock.exePasswordWarn') }}</span>
      </div>

      <div v-if="showBackendConfig" class="unlock-backend-box">
        <input type="text" v-model="backendUrl" class="unlock-backend-input"
               :placeholder="t('unlock.backendUrlPlaceholder')"
               autocomplete="off" spellcheck="false" @keydown.enter="saveBackendConfig"/>
        <input type="password" v-model="backendToken" class="unlock-backend-input"
               :placeholder="t('unlock.backendToken')"
               autocomplete="off" @keydown.enter="saveBackendConfig"/>
        <button class="unlock-btn unlock-backend-save" :disabled="checking" @click="saveBackendConfig">
          <Server :size="13"/> {{ t('unlock.backendSaveRetry') }}
        </button>
        <p v-if="backendMsg" class="unlock-backend-msg" :class="backendMsgType === 'ok' ? 'is-ok' : 'is-error'">
          {{ backendMsg }}
        </p>
      </div>

      <div v-if="cloudState === 'auth' && !forceLocalSetup" class="unlock-auth-gate">
        <div class="unlock-cloud-warn">
          <AlertTriangle :size="15"/>
          <span>{{ t('unlock.cloudWarn') }}</span>
        </div>
        <button class="unlock-btn" @click="showBackendConfig = !showBackendConfig">
          <Server :size="14"/>
          {{ showBackendConfig ? t('unlock.backendHide') : t('unlock.backendConfig') }}
        </button>
        <button class="forgot-link" @click="forceLocalSetup = true">{{ t('unlock.localSetup') }}</button>
      </div>

      <div v-else class="unlock-form">
        <div class="unlock-input-wrap">
          <input ref="inputRef" :type="showPw ? 'text' : 'password'" v-model="password"
                 :placeholder="isSetup ? t('unlock.choosePassword') : t('unlock.enterPassword')"
                 class="unlock-input" autocomplete="off" spellcheck="false"
                 @input="onInput" @keydown.enter.prevent="trySubmit"/>
          <button type="button" class="unlock-toggle" @click="showPw = !showPw">
            <EyeOff v-if="showPw" :size="16"/>
            <Eye v-else :size="16"/>
          </button>
        </div>

        <div v-if="isSetup" class="unlock-input-wrap">
          <input :type="showPw ? 'text' : 'password'" v-model="confirmPw"
                 :placeholder="t('unlock.confirmPassword')" class="unlock-input"
                 autocomplete="off" @input="onInput" @keydown.enter.prevent="trySubmit"/>
        </div>

        <div v-if="matchMsg" class="match-msg" :class="matchMsgType">{{ matchMsg }}</div>
        <p v-if="error" class="unlock-error">{{ error }}</p>

        <button class="unlock-btn" :class="{ 'is-disabled': !canSubmit }" @click="trySubmit">
          <span v-if="loading" class="btn-loading"></span>
          {{ btnText }}
        </button>

        <label v-if="!isElectron" class="remember-device">
          <input type="checkbox" v-model="rememberDevice"/>
          <span>{{ t('unlock.rememberDevice') }}</span>
        </label>
        <p v-if="!isElectron && rememberDevice" class="remember-hint">{{ t('unlock.rememberHint') }}</p>

        <div v-if="!isSetup" class="unlock-forgot">
          <button class="forgot-link" @click="clearConfirmVisible = true">
            {{ t('unlock.forgotPassword') }}
          </button>
        </div>
      </div>

      <div class="unlock-backend-toggle" v-if="!isElectron && cloudState !== 'auth'">
        <button class="forgot-link" @click="showBackendConfig = !showBackendConfig">
          <Server :size="13"/>
          {{ showBackendConfig ? t('unlock.backendHide') : t('unlock.backendConfig') }}
        </button>
      </div>
    </template>
    </div>
  </div>

  <ConfirmDialog
    :visible="clearConfirmVisible"
    :title="t('unlock.clearConfirmTitle')"
    :message="t('unlock.clearConfirmMsg')"
    :confirm-text="t('unlock.clearConfirmBtn')"
    :cancel-text="t('common.cancel')"
    @confirm="clearAllData"
    @cancel="clearConfirmVisible = false"
  />
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { setupMasterPassword, verifyMasterPassword } from '@/utils/crypto';
import { storageGet, storageSet, storageRemove } from '@/utils/storage';
import { apiFetch, setBackendToken, getBackendToken } from '@/utils/api';
import { setRuntimeBackendBase, getRuntimeBackendBase } from '@/utils/constants';
import { KeyRound, Lock, Eye, EyeOff, Info, AlertTriangle, Server } from 'lucide-vue-next';
import ConfirmDialog from '@/components/global/ConfirmDialog.vue';

const { t } = useI18n();
const emit = defineEmits(['unlocked']);

const isElectron = typeof window !== 'undefined' && window.navigator.userAgent.includes('Electron');
const locked = ref(true);
const isSetup = ref(false);
const checking = ref(true);  // true while checking R2 for existing verify data
const password = ref('');
const confirmPw = ref('');
const showPw = ref(false);
const error = ref('');
const loading = ref(false);
const inputRef = ref(null);
const clearConfirmVisible = ref(false);
// Device-level auto-unlock (opt-in). LAN/desktop clients can skip typing the
// password on every launch; the master password is kept in localStorage.
const rememberDevice = ref(false);

// Cloud check outcome: 'exists' = a master password hash is in R2; 'none' =
// nothing stored yet (legitimate first-time setup); 'auth' = the backend
// rejected us (401/403/503) so we CANNOT tell — the user must configure the
// backend connection instead of blindly setting a new password; 'error' =
// network/reachability failure (fall back to local setup).
const cloudState = ref('checking');
// Auth-gate guard: when 'auth', the setup form is hidden behind an explicit
// "set local-only password anyway" choice so a fresh device can never silently
// overwrite the cloud verify hash with a brand-new password.
const forceLocalSetup = ref(false);

const showBackendConfig = ref(false);
const backendUrl = ref(getRuntimeBackendBase());
const backendToken = ref(getBackendToken());
const backendMsg = ref('');
const backendMsgType = ref('ok');

async function cloudApi(action, payload = {}) {
  try {
    // apiFetch attaches the AUTH_TOKEN (kept separately from the master
    // password, so it is already available on the lock screen).
    const resp = await apiFetch('/api/cloud/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
    if (!resp.ok) return { ok: false, status: resp.status, data: null };
    return { ok: true, status: resp.status, data: await resp.json() };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

async function checkCloudVerify() {
  const r = await cloudApi('getVerify');
  if (!r.ok) {
    // 401/403: token missing or wrong. 503: backend has no AUTH_TOKEN at all.
    // Either way we cannot know whether a master password exists in the cloud.
    if (r.status === 401 || r.status === 403 || r.status === 503) return 'auth';
    return 'error';
  }
  const data = r.data;
  if (data && data.exists && data.verifyKey && data.salt) {
    storageSet('verifyHash', data.verifyKey);
    storageSet('verifySalt', data.salt);
    return 'exists';
  }
  return 'none';
}

async function saveBackendConfig() {
  const url = backendUrl.value.trim();
  if (url && !setRuntimeBackendBase(url)) {
    backendMsg.value = t('unlock.backendInvalid');
    backendMsgType.value = 'err';
    return;
  }
  if (!url) setRuntimeBackendBase('');
  setBackendToken(backendToken.value.trim());
  window.dispatchEvent(new CustomEvent('backend-config-changed'));
  // Re-run the cloud check with the new credentials.
  checking.value = true;
  showBackendConfig.value = false;
  const state = await checkCloudVerify();
  cloudState.value = state;
  forceLocalSetup.value = false;
  isSetup.value = state !== 'exists';
  checking.value = false;
  if (state === 'exists') {
    backendMsg.value = t('unlock.backendSaved');
    backendMsgType.value = 'ok';
  } else if (state === 'auth') {
    backendMsg.value = t('unlock.backendStillFails');
    backendMsgType.value = 'err';
  }
}

async function pushVerifyToCloud() {
  const verifyKey = storageGet('verifyHash');
  const salt = storageGet('verifySalt');
  if (verifyKey && salt) {
    await cloudApi('saveVerify', { verifyKey, salt });
  }
}

// Determine if password needs to be set up or entered
onMounted(async () => {
  // Electron: auto-unlock if master password was persisted
  if (isElectron) {
    const storedMaster = storageGet('exeMaster');
    if (storedMaster) {
      storageSet('sessionMaster', storedMaster);
      locked.value = false;
      checking.value = false;
      emit('unlocked', storedMaster);
      return;
    }
  }

  // Device-level auto-unlock (user opted in with "remember this device")
  const savedMaster = storageGet('savedMaster');
  if (savedMaster) {
    storageSet('sessionMaster', savedMaster);
    locked.value = false;
    checking.value = false;
    emit('unlocked', savedMaster);
    return;
  }

  // Check localStorage first, then fall back to R2
  if (storageGet('verifyHash')) {
    isSetup.value = false;
    cloudState.value = 'exists';
  } else {
    cloudState.value = await checkCloudVerify();
    // 'auth' hides the setup form behind an explicit local-only choice; all
    // other outcomes (none / error) fall through to the normal setup screen.
    isSetup.value = cloudState.value !== 'exists';
  }
  checking.value = false;
});

const canSubmit = computed(() => {
  if (checking.value) return false;
  if (isSetup.value) return password.value.length >= 4 && password.value === confirmPw.value;
  return password.value.length > 0;
});

const matchMsg = computed(() => {
  if (!isSetup.value || !confirmPw.value) return '';
  if (password.value.length < 4) return t('unlock.minChars');
  if (password.value !== confirmPw.value) return t('unlock.passwordsNotMatch');
  return '';
});

const matchMsgType = computed(() => {
  if (!matchMsg.value) return 'is-ok';
  return 'is-error';
});

const btnText = computed(() => {
  if (loading.value) return t('unlock.pleaseWait');
  return isSetup.value ? t('unlock.setPasswordBtn') : t('unlock.unlock');
});

let _preloaded = false;
function onInput() {
  error.value = '';
  if (!_preloaded) { _preloaded = true; import('@/views/TerminalView.vue').catch(() => {}); }
}

// Opt-in device-level auto-unlock: keep (or drop) the master password so the
// next launch skips the password screen. Only used outside Electron, which
// already persists its own copy.
function persistRemember(master) {
  if (rememberDevice.value) storageSet('savedMaster', master);
  else storageRemove('savedMaster');
}

async function trySubmit() {
  if (!canSubmit.value || loading.value) return;
  error.value = '';
  loading.value = true;
  try {
    if (isSetup.value) {
      await setupMasterPassword(password.value);
      storageSet('sessionMaster', password.value);
      if (isElectron) storageSet('exeMaster', password.value);
      persistRemember(password.value);
      // Sync verify data to R2 so it persists across deployments
      pushVerifyToCloud().catch(() => {});
      locked.value = false;
      emit('unlocked', password.value);
    } else {
      const ok = await verifyMasterPassword(password.value);
      if (ok) {
        storageSet('sessionMaster', password.value);
        if (isElectron) storageSet('exeMaster', password.value);
        persistRemember(password.value);
        locked.value = false;
        emit('unlocked', password.value);
      } else {
        error.value = t('unlock.incorrectPassword');
      }
    }
  } catch (e) {
    error.value = t('unlock.errorOccurred') + ' ' + (e.message || '');
  } finally {
    loading.value = false;
  }
}

function clearAllData() {
  clearConfirmVisible.value = false;
  // Full reset: wipe every webssh-owned key so the next launch behaves like a
  // fresh install. This removes saved servers, all credentials, backups,
  // snippets, macros, notes and the password verifier — nothing recoverable.
  for (const store of [localStorage, sessionStorage]) {
    const keys = Object.keys(store);
    for (const key of keys) {
      if (key.startsWith('sshWebApp') || key.startsWith('webssh_')) {
        store.removeItem(key);
      }
    }
  }
  window.location.reload();
}
</script>

<style scoped>
.unlock-overlay {
  position: fixed; inset: 0; z-index: 99999;
  background: var(--bulma-body-background-color);
  display: flex; align-items: center; justify-content: center;
}
.unlock-card { width: 360px; text-align: center; }
.unlock-icon {
  width: 80px; height: 80px; margin: 0 auto 1rem;
  border-radius: 20px;
  background: linear-gradient(135deg, hsl(235,40%,45%), hsl(235,50%,58%));
  color: white; display: flex; align-items: center; justify-content: center;
}
.unlock-title { font-size: 1.3em; font-weight: 700; margin: 0 0 0.35rem; }
.unlock-desc { font-size: 0.8em; color: var(--bulma-text-light); margin-bottom: 1rem; }
.unlock-exe-warn {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.5rem 0.65rem; margin-bottom: 0.75rem;
  border-radius: 8px; font-size: 0.78em;
  background: rgba(245, 158, 11, 0.12); color: #d97706;
  border: 1px solid rgba(245, 158, 11, 0.25);
  text-align: left; line-height: 1.4;
}
.unlock-loading { display: flex; align-items: center; justify-content: center; min-height: 200px; }
.unlock-form { display: flex; flex-direction: column; gap: 0.5rem; }
.unlock-input-wrap {
  display: flex; align-items: center;
  border: 1.5px solid var(--bulma-border); border-radius: 10px;
  background: var(--bulma-input-background-color); overflow: hidden;
}
.unlock-input {
  flex: 1; border: none; background: none; outline: none; padding: 0.65rem 0.75rem;
  font-size: 0.95em; color: var(--bulma-text);
}
.unlock-toggle {
  background: none; border: none; padding: 0 0.75rem; cursor: pointer;
  color: var(--bulma-text-light); display: flex;
}
.match-msg { font-size: 0.8em; }
.is-ok { color: var(--bulma-success); }
.is-error { color: var(--bulma-warning); }
.unlock-error { color: var(--bulma-danger); font-size: 0.8em; }
.unlock-btn {
  margin-top: 0.5rem; padding: 0.6rem; border: none; border-radius: 10px;
  background: linear-gradient(135deg, hsl(235,40%,45%), hsl(235,50%,58%));
  color: white; font-size: 0.95em; font-weight: 600; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 0.4rem;
}
.unlock-btn:hover { box-shadow: 0 4px 16px rgba(99,102,241,0.3); transform: translateY(-1px); }
.unlock-btn.is-disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
.btn-loading {
  width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white; border-radius: 50%; animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.unlock-forgot { margin-top: 1rem; }
.remember-device {
  display: flex; align-items: center; justify-content: center; gap: 0.45rem;
  margin-top: 0.7rem; font-size: 0.8em; cursor: pointer; user-select: none;
  color: var(--bulma-text-light);
  input { accent-color: hsl(235, 50%, 52%); width: 15px; height: 15px; }
}
.remember-hint {
  margin: 0.2rem auto 0; max-width: 320px;
  font-size: 0.68em; color: var(--bulma-text-light); opacity: 0.85; line-height: 1.5;
}
.forgot-link {
  background: none; border: none; cursor: pointer;
  color: var(--bulma-text-light); font-size: 0.78em;
  text-decoration: underline; text-underline-offset: 2px;
}
.forgot-link:hover { color: var(--bulma-danger); }

/* ── Backend connection config + cloud auth gate ── */
.unlock-backend-box {
  margin: 0.75rem 0 0.25rem;
  padding: 0.65rem 0.7rem;
  border: 1px solid var(--bulma-border); border-radius: 10px;
  background: var(--bulma-scheme-main-bis);
  display: flex; flex-direction: column; gap: 0.45rem;
}
.unlock-backend-input {
  width: 100%; box-sizing: border-box;
  padding: 0.5rem 0.65rem; border: 1.5px solid var(--bulma-border);
  border-radius: 8px; font-size: 0.8em; outline: none;
  background: var(--bulma-input-background-color); color: var(--bulma-text);
  font-family: var(--bulma-family-monospace);
  &:focus { border-color: var(--bulma-primary); }
}
.unlock-backend-save {
  margin-top: 0; padding: 0.45rem 0.8rem; font-size: 0.78em;
}
.unlock-backend-msg {
  margin: 0; font-size: 0.75em; line-height: 1.4; text-align: left;
  &.is-ok { color: var(--bulma-success); }
  &.is-error { color: var(--bulma-danger); }
}
.unlock-auth-gate {
  margin-top: 0.85rem;
  display: flex; flex-direction: column; gap: 0.6rem;
}
.unlock-cloud-warn {
  display: flex; align-items: flex-start; gap: 0.45rem;
  padding: 0.55rem 0.65rem; border-radius: 8px;
  font-size: 0.75em; line-height: 1.5; text-align: left;
  background: rgba(245, 158, 11, 0.12); color: #d97706;
  border: 1px solid rgba(245, 158, 11, 0.25);
  .lucide { flex-shrink: 0; margin-top: 1px; }
}
.unlock-backend-toggle { margin-top: 0.75rem; }
</style>
