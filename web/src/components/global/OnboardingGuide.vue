<template>
  <Teleport to="body">
    <div class="modal-overlay onboarding-overlay">
      <div class="modal-body onboarding-card">
        <div class="onboarding-logo"><TerminalSquare :size="26"/></div>
        <h3 class="onboarding-title">{{ t('onboarding.title') }}</h3>
        <div class="onboarding-steps">
          <div class="onboarding-step">
            <div class="step-num">1</div>
            <div class="step-body">
              <p class="step-title">{{ t('onboarding.step1Title') }}</p>
              <p class="step-desc">{{ t('onboarding.step1Desc') }}</p>
            </div>
          </div>
          <div class="onboarding-step">
            <div class="step-num">2</div>
            <div class="step-body">
              <p class="step-title">{{ t('onboarding.step2Title') }}</p>
              <p class="step-desc">{{ t('onboarding.step2Desc') }}</p>
            </div>
          </div>
          <div class="onboarding-step">
            <div class="step-num">3</div>
            <div class="step-body">
              <p class="step-title">{{ t('onboarding.step3Title') }}</p>
              <p class="step-desc">{{ t('onboarding.step3Desc') }}</p>
            </div>
          </div>
        </div>
        <button class="modal-btn is-primary onboarding-go" @click="dismiss">
          {{ t('onboarding.start') }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { useI18n } from 'vue-i18n';
import { TerminalSquare } from 'lucide-vue-next';

const { t } = useI18n();
const emit = defineEmits(['dismiss']);
function dismiss() { emit('dismiss'); }
</script>

<style lang="scss" scoped>
.onboarding-overlay { z-index: 10001; }
.onboarding-card {
  width: 440px; max-width: 94vw;
  padding: 1.6rem 1.7rem 1.4rem;
  text-align: center;
}
.onboarding-logo {
  width: 56px; height: 56px; margin: 0 auto 0.7rem;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--bulma-primary), var(--bulma-link, var(--bulma-primary)));
  color: #fff; display: flex; align-items: center; justify-content: center;
}
.onboarding-title { margin: 0 0 1.1rem; font-size: 1.12em; font-weight: 700; }
.onboarding-steps { display: flex; flex-direction: column; gap: 0.75rem; text-align: left; }
.onboarding-step { display: flex; gap: 0.7rem; align-items: flex-start; }
.step-num {
  flex: 0 0 auto; width: 24px; height: 24px; border-radius: 50%;
  background: var(--bulma-scheme-main-ter); color: var(--bulma-primary);
  font-size: 0.78em; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--bulma-border-light);
}
.step-body { min-width: 0; }
.step-title { margin: 0; font-size: 0.88em; font-weight: 650; }
.step-desc { margin: 0.15rem 0 0; font-size: 0.76em; color: var(--bulma-text-light); line-height: 1.55; }
.onboarding-go { width: 100%; justify-content: center; margin-top: 1.2rem; min-height: 42px; }
</style>
