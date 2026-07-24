<template>
  <Teleport to="body">
    <div v-if="visible" class="modal is-active" role="dialog" aria-modal="true" :aria-label="title || t('common.confirm')"
         @keydown.escape="onCancel" ref="dialogRef">
      <div class="modal-background" @click="onCancel"></div>
      <div class="modal-card" ref="cardRef">
        <header class="modal-card-head">
          <p class="modal-card-title">{{ title }}</p>
          <button class="delete" :aria-label="t('common.close')" @click="onCancel"></button>
        </header>
        <section class="modal-card-body">
          <p>{{ message }}</p>
        </section>
        <footer class="modal-card-foot is-justify-content-flex-end">
          <button class="button" @click="onCancel" ref="cancelBtn">{{ cancelText }}</button>
          <button class="button is-danger" @click="onConfirm" ref="confirmBtn">{{ confirmText }}</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: undefined },
  message: { type: String, default: undefined },
  confirmText: { type: String, default: undefined },
  cancelText: { type: String, default: undefined },
});

const emit = defineEmits(['confirm', 'cancel']);
const dialogRef = ref(null);
const cardRef = ref(null);
const cancelBtn = ref(null);
const confirmBtn = ref(null);

watch(() => props.visible, async (val) => {
  if (val) {
    await nextTick();
    cancelBtn.value?.focus();
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
});

function onConfirm() { emit('confirm'); }
function onCancel() { emit('cancel'); }
</script>
