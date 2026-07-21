<template>
  <Teleport to="body">
    <div v-if="locked" class="unlock-overlay" role="dialog" aria-modal="true" aria-label="Unlock">
      <div class="unlock-card">
        <div class="unlock-icon">
          <component :is="isSetup ? 'KeyRound' : 'Lock'" :size="48"/>
        </div>
        <h2 class="unlock-title">{{ isSetup ? t('unlock.setPassword') : t('unlock.enterPassword') }}</h2>
        <p class="unlock-desc" v-if="isSetup">
          {{ t('unlock.description') }}
        </p>
        <form @submit.prevent="handleSubmit" class="unlock-form">
          <div class="unlock-input-wrap">
            <input
              ref="inputRef"
              :type="showPw ? 'text' : 'password'"
              v-model="password"
              :placeholder="isSetup ? t('unlock.choosePassword') : t('unlock.enterPassword')"
              class="unlock-input"
              autocomplete="off"
              spellcheck="false"
            />
            <button type="button" class="unlock-toggle" @click="showPw = !showPw" :aria-label="showPw ? t('unlock.hide') : t('unlock.show')">
              <component :is="showPw ? 'EyeOff' : 'Eye'" :size="16"/>
            </button>
          </div>
          <input v-if="isSetup"
            :type="showPw ? 'text' : 'password'"
            v-model="confirmPw"
            :placeholder="t('unlock.confirmPassword')"
            class="unlock-input"
            autocomplete="off"
          />
          <p v-if="error" class="unlock-error">{{ error }}</p>
          <button type="submit" class="unlock-btn" :disabled="!canSubmit || loading">
            {{ loading ? t('unlock.pleaseWait') : (isSetup ? t('unlock.setPasswordBtn') : t('unlock.unlock')) }}
          </button>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { setupMasterPassword, verifyMasterPassword, STORAGE_VERIFY_KEY } from '@/utils/crypto';

const { t } = useI18n();

const emit = defineEmits(['unlocked']);

const locked = ref(true);
const isSetup = ref(false);
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

onMounted(() => {
  const hasStored = localStorage.getItem(STORAGE_VERIFY_KEY);
  isSetup.value = !hasStored;
  nextTick(() => inputRef.value?.focus());
});

async function handleSubmit() {
  error.value = '';
  loading.value = true;
  try {
    if (isSetup.value) {
      if (password.value.length < 4) { error.value = t('unlock.minChars'); return; }
      if (password.value !== confirmPw.value) { error.value = t('unlock.passwordsNotMatch'); return; }
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
  } catch {
    error.value = t('unlock.errorOccurred');
  } finally {
    loading.value = false;
  }
}
</script>

<style lang="scss" scoped>
.unlock-overlay {
  position: fixed; inset: 0; z-index: 99999;
  background: var(--bulma-body-background-color);
  display: flex; align-items: center; justify-content: center;
}

.unlock-card {
  width: 360px; text-align: center;
}

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
  &:focus-within { border-color: var(--bulma-primary); box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
}

.unlock-input {
  flex: 1; border: none; background: none; outline: none; padding: 0.65rem 0.75rem;
  font-size: 0.95em; color: var(--bulma-text);
}

.unlock-toggle {
  background: none; border: none; padding: 0 0.75rem; cursor: pointer;
  color: var(--bulma-text-light); display: flex;
}

.unlock-error { color: var(--bulma-danger); font-size: 0.8em; }

.unlock-btn {
  margin-top: 0.5rem; padding: 0.6rem; border: none; border-radius: 10px;
  background: linear-gradient(135deg, hsl(235,40%,45%), hsl(235,50%,58%));
  color: white; font-size: 0.95em; font-weight: 600; cursor: pointer;
  transition: all 0.15s;
  &:hover { box-shadow: 0 4px 16px rgba(99,102,241,0.3); transform: translateY(-1px); }
  &:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
}
</style>
