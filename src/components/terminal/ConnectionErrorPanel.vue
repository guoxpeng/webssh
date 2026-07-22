<template>
  <div class="error-panel">
    <div class="error-card">
      <div class="error-icon-wrap">
        <div class="error-icon-circle">
          <AlertTriangle :size="32" stroke-width="1.5"/>
        </div>
      </div>

      <h3 class="error-title">{{ t('status.error') }}</h3>

      <div class="error-server-info">
        <span class="error-server-name">{{ config?.name || config?.host }}</span>
        <span class="error-server-addr">{{ config?.username }}@{{ config?.host }}:{{ config?.port }}</span>
      </div>

      <div class="error-message-box">
        <p class="error-message">{{ message || t('terminal.connectionError', { message: t('common.error') }) }}</p>
      </div>

      <div class="error-details" v-if="showDetails">
        <div class="error-detail-row">
          <span class="detail-label">{{ t('form.protocol') }}</span>
          <span class="detail-value">{{ config?.protocol?.toUpperCase() || 'SSH' }}</span>
        </div>
        <div class="error-detail-row" v-if="config?.host">
          <span class="detail-label">{{ t('form.host') }}</span>
          <span class="detail-value">{{ config.host }}:{{ config.port }}</span>
        </div>
        <div class="error-detail-row" v-if="config?.username">
          <span class="detail-label">{{ t('form.username') }}</span>
          <span class="detail-value">{{ config.username }}</span>
        </div>
      </div>

      <div class="error-suggestions">
        <div class="suggestion-item" v-for="(s, i) in suggestions" :key="i">
          <span class="suggestion-dot"></span>
          <span>{{ s }}</span>
        </div>
      </div>

      <div class="error-actions">
        <button class="error-btn is-primary" @click="$emit('retry')">
          <RotateCcw :size="16"/> {{ t('common.retry') }}
        </button>
        <button class="error-btn" @click="$emit('edit')">
          <Settings :size="16"/> {{ t('server.edit') }}
        </button>
        <button class="error-btn is-ghost" @click="$emit('close')">
          <X :size="16"/> {{ t('common.close') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { AlertTriangle, RotateCcw, Settings, X } from 'lucide-vue-next';

const { t } = useI18n();

const props = defineProps({
  config: { type: Object, default: null },
  message: { type: String, default: '' },
  showDetails: { type: Boolean, default: false },
});

defineEmits(['retry', 'edit', 'close']);

const suggestions = computed(() => {
  const msg = (props.message || '').toLowerCase();
  const list = [];
  if (msg.includes('refused') || msg.includes('拒绝') || msg.includes('connection refused')) {
    list.push(t('error.suggestionRefused') || 'Check if the service is running on the remote host');
    list.push(t('error.suggestionPort') || 'Verify the port number is correct');
  } else if (msg.includes('auth') || msg.includes('password') || msg.includes('permission') || msg.includes('认证') || msg.includes('密码')) {
    list.push(t('error.suggestionCreds') || 'Verify your username and password');
    list.push(t('error.suggestionKey') || 'Check if the private key path is correct');
  } else if (msg.includes('timeout') || msg.includes('超时')) {
    list.push(t('error.suggestionTimeout') || 'Check if the host is reachable');
    list.push(t('error.suggestionPort') || 'Verify the port is open on the remote firewall');
  } else if (msg.includes('dns') || msg.includes('resolve') || msg.includes('解析')) {
    list.push(t('error.suggestionDNS') || 'Check if the hostname resolves correctly');
    list.push(t('error.suggestionIP') || 'Try using the IP address directly');
  } else if (msg.includes('key') || msg.includes('密钥')) {
    list.push(t('error.suggestionKeyFormat') || 'Check if the key format is correct (PEM format required)');
    list.push(t('error.suggestionKeyPerm') || 'Ensure the key file has correct permissions');
  } else {
    list.push(t('error.suggestionGeneral1') || 'Verify the connection details are correct');
    list.push(t('error.suggestionGeneral2') || 'Check if the remote server allows your IP');
  }
  return list;
});
</script>

<style lang="scss" scoped>
.error-panel {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--bulma-scheme-main);
  overflow-y: auto; padding: 2rem;
}
.error-card {
  width: 100%; max-width: 440px;
  display: flex; flex-direction: column; align-items: center; gap: 1rem;
}
.error-icon-wrap { margin-bottom: 0.25rem; }
.error-icon-circle {
  width: 64px; height: 64px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: rgba(239, 68, 68, 0.1); color: var(--bulma-danger);
}
.error-title {
  font-size: 1.1em; font-weight: 700; margin: 0;
  color: var(--bulma-text-strong);
}
.error-server-info {
  text-align: center; line-height: 1.5;
}
.error-server-name {
  display: block; font-size: 0.95em; font-weight: 600; color: var(--bulma-text);
}
.error-server-addr {
  display: block; font-size: 0.8em; color: var(--bulma-text-light); font-family: monospace;
}
.error-message-box {
  width: 100%; padding: 0.65rem 0.85rem;
  background: rgba(239, 68, 68, 0.06);
  border: 1px solid rgba(239, 68, 68, 0.15);
  border-radius: 8px; box-sizing: border-box;
}
.error-message {
  margin: 0; font-size: 0.8em; color: var(--bulma-danger);
  text-align: center; word-break: break-word;
}
.error-details {
  width: 100%; border: 1px solid var(--bulma-border-light);
  border-radius: 8px; overflow: hidden;
}
.error-detail-row {
  display: flex; justify-content: space-between; padding: 0.4rem 0.65rem;
  font-size: 0.75em;
  & + & { border-top: 1px solid var(--bulma-border-light); }
}
.detail-label { color: var(--bulma-text-light); }
.detail-value { color: var(--bulma-text); font-family: monospace; font-weight: 500; }
.error-suggestions {
  width: 100%; display: flex; flex-direction: column; gap: 0.4rem;
}
.suggestion-item {
  display: flex; align-items: flex-start; gap: 0.4rem;
  font-size: 0.75em; color: var(--bulma-text-light); line-height: 1.4;
}
.suggestion-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--bulma-text-light); flex-shrink: 0; margin-top: 0.4em;
}
.error-actions {
  display: flex; gap: 0.5rem; width: 100%; margin-top: 0.5rem;
}
.error-btn {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;
  padding: 0.55rem 0.75rem; border-radius: 8px; font-size: 0.8em; font-weight: 500;
  border: 1px solid var(--bulma-border-light); cursor: pointer;
  background: var(--bulma-scheme-main-ter); color: var(--bulma-text);
  transition: all 0.12s; text-decoration: none;
  &.is-primary {
    background: var(--bulma-primary); color: white; border-color: transparent;
    &:hover { opacity: 0.9; box-shadow: 0 4px 12px rgba(99,102,241,0.25); }
  }
  &.is-ghost { background: none; border-color: transparent; color: var(--bulma-text-light); }
  &:hover:not(.is-ghost) { background: var(--bulma-scheme-main-bis); }
}
</style>
