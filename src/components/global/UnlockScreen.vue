<template>
  <div v-if="locked" class="unlock-overlay">
    <div class="unlock-card">
      <div class="unlock-icon">
        <KeyRound v-if="isSetup" :size="48"/>
        <Lock v-else :size="48"/>
      </div>
      <h2 class="unlock-title">{{ isSetup ? t('unlock.setPassword') : t('unlock.enterPassword') }}</h2>
      <p class="unlock-desc" v-if="isSetup">{{ t('unlock.description') }}</p>

      <div class="unlock-form">
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
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { setupMasterPassword, verifyMasterPassword, STORAGE_VERIFY_KEY } from '@/utils/crypto';
import { KeyRound, Lock, Eye, EyeOff } from 'lucide-vue-next';

const { t } = useI18n();
const emit = defineEmits(['unlocked']);

const locked = ref(true);
const isSetup = ref(!localStorage.getItem(STORAGE_VERIFY_KEY));
const password = ref('');
const confirmPw = ref('');
const showPw = ref(false);
const error = ref('');
const loading = ref(false);
const inputRef = ref(null);

const canSubmit = computed(() => {
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

function onInput() {
  error.value = '';
}

async function trySubmit() {
  if (!canSubmit.value || loading.value) return;
  error.value = '';
  loading.value = true;
  try {
    if (isSetup.value) {
      await setupMasterPassword(password.value);
      sessionStorage.setItem('haossh_master', password.value);
      locked.value = false;
      emit('unlocked', password.value);
    } else {
      const ok = await verifyMasterPassword(password.value);
      if (ok) {
        sessionStorage.setItem('haossh_master', password.value);
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
</style>
