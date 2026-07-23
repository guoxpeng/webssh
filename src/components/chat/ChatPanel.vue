<template>
  <div class="chat-panel">
    <div class="panel-header">
      <h3 class="panel-title"><MessageSquare :size="16"/> {{ t('chat.title') }}</h3>
      <div class="panel-actions">
        <button class="panel-action-btn" @click="showConfig = !showConfig" :title="t('chat.config')">
          <Settings :size="14"/>
        </button>
        <button class="panel-action-btn" @click="$emit('close')">
          <X :size="14"/>
        </button>
      </div>
    </div>

    <!-- Config Section -->
    <div v-if="showConfig" class="chat-config">
      <div class="config-section">
        <h4 class="config-title"><Radio :size="13"/> {{ t('chat.platforms') }}</h4>
        <div class="config-row">
          <label class="config-label">Telegram</label>
          <div class="config-fields">
            <label class="toggle-row"><input type="checkbox" v-model="store.config.telegram.enabled" @change="onConfigChange"/> {{ t('chat.enabled') }}</label>
            <input type="password" v-model="store.config.telegram.token" :placeholder="t('chat.botToken')" class="form-input" @input="onConfigChange"/>
            <input type="text" v-model="adminIdsText" :placeholder="t('chat.adminIds')" class="form-input" @input="onAdminIdsChange"/>
          </div>
        </div>
        <div class="config-row">
          <label class="config-label">WeChat</label>
          <div class="config-fields">
            <label class="toggle-row"><input type="checkbox" v-model="store.config.wechat.enabled" @change="onConfigChange"/> {{ t('chat.enabled') }}</label>
            <input type="text" v-model="store.config.wechat.apiUrl" placeholder="ClawBot API URL" class="form-input" @input="onConfigChange"/>
            <input type="password" v-model="store.config.wechat.apiKey" :placeholder="t('chat.apiKey')" class="form-input" @input="onConfigChange"/>
          </div>
        </div>
        <div class="config-row">
          <label class="config-label">QQ</label>
          <div class="config-fields">
            <label class="toggle-row"><input type="checkbox" v-model="store.config.qq.enabled" @input="onConfigChange"/> {{ t('chat.enabled') }}</label>
            <input type="text" v-model="store.config.qq.apiUrl" placeholder="go-cqhttp HTTP API URL" class="form-input" @input="onConfigChange"/>
            <input type="password" v-model="store.config.qq.apiKey" :placeholder="t('chat.apiKey')" class="form-input" @input="onConfigChange"/>
          </div>
        </div>
      </div>
      <div class="config-section">
        <h4 class="config-title"><Brain :size="13"/> AI {{ t('chat.settings') }}</h4>
        <div class="config-row">
          <label class="config-label">OpenAI</label>
          <div class="config-fields">
            <label class="toggle-row"><input type="checkbox" v-model="store.config.ai.enabled" @change="onConfigChange"/> {{ t('chat.enabled') }}</label>
            <input type="text" v-model="store.config.ai.apiUrl" placeholder="API Base URL" class="form-input" @input="onConfigChange"/>
            <input type="password" v-model="store.config.ai.apiKey" :placeholder="t('chat.apiKey')" class="form-input" @input="onConfigChange"/>
            <input type="text" v-model="store.config.ai.model" placeholder="gpt-4o-mini" class="form-input" @input="onConfigChange"/>
            <textarea v-model="store.config.ai.systemPrompt" class="form-textarea" rows="2" :placeholder="t('chat.systemPrompt')" @input="onConfigChange"></textarea>
          </div>
        </div>
      </div>
    </div>

    <!-- Messages -->
    <div class="chat-messages" ref="msgContainer">
      <div v-if="store.messages.length === 0" class="chat-empty">
        <MessageSquare :size="32" class="empty-icon"/>
        <p>{{ t('chat.noMessages') }}</p>
      </div>
      <div v-for="msg in store.messages" :key="msg.id" class="chat-msg" :class="`is-${msg.direction} is-${msg.platform}`">
        <div class="msg-header">
          <span class="msg-from">{{ msg.from }}</span>
          <span class="msg-platform">{{ msg.platform }}</span>
          <span class="msg-time">{{ timeAgo(msg.timestamp) }}</span>
        </div>
        <div class="msg-body">{{ msg.text }}</div>
      </div>
    </div>

    <!-- Input -->
    <div class="chat-input-area">
      <select v-model="activePlatform" class="platform-select" v-if="store.activePlatforms.length > 0">
        <option v-for="p in store.activePlatforms" :key="p" :value="p">{{ p }}</option>
      </select>
      <div v-else class="platform-none">{{ t('chat.noPlatform') }}</div>
      <div class="input-row">
        <input type="text" v-model="inputText" class="chat-input" :placeholder="t('chat.inputPlaceholder')" @keydown.enter="onSend" :disabled="store.activePlatforms.length === 0"/>
        <button class="send-btn" @click="onSend" :disabled="!inputText.trim() || store.activePlatforms.length === 0">
          <Send :size="14"/>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useChatStore } from '@/stores/chatStore';
import { MessageSquare, Settings, Send, Radio, Brain, X } from 'lucide-vue-next';

const { t } = useI18n();
const store = useChatStore();

const showConfig = ref(false);
const inputText = ref('');
const activePlatform = ref('');
const msgContainer = ref(null);
const adminIdsText = ref('');

onMounted(() => { store.startPolling(); });
onBeforeUnmount(() => { store.stopPolling(); });

function onConfigChange() {
  store.saveConfig();
}

function onAdminIdsChange() {
  store.config.telegram.adminIds = adminIdsText.value.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  store.saveConfig();
}

async function onSend() {
  const text = inputText.value.trim();
  if (!text || !activePlatform.value) return;
  await store.sendMessage(activePlatform.value, text);
  inputText.value = '';
  nextTick(() => { if (msgContainer.value) msgContainer.value.scrollTop = msgContainer.value.scrollHeight; });
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return t('common.justNow');
  if (min < 60) return t('common.minutesAgo', { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('common.hoursAgo', { n: h });
  return t('common.daysAgo', { n: Math.floor(h / 24) });
}
</script>

<style lang="scss" scoped>
.chat-panel { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.panel-header { display: flex; align-items: center; padding: 0.7rem 0.85rem; gap: 0.5rem; border-bottom: 1px solid var(--bulma-border-light); flex-shrink: 0; }
.panel-title { flex: 1; font-size: 0.82em; font-weight: 600; display: flex; align-items: center; gap: 0.4rem; color: var(--bulma-text); }
.panel-actions { display: flex; gap: 0.25rem; }
.panel-action-btn { background: none; border: none; cursor: pointer; padding: 0.3rem; border-radius: 4px; color: var(--bulma-text-light); display: flex; align-items: center; }
.panel-action-btn:hover { background: var(--bulma-scheme-main-ter); color: var(--bulma-text); }

.chat-config { overflow-y: auto; border-bottom: 1px solid var(--bulma-border-light); max-height: 45%; flex-shrink: 0; }
.config-section { padding: 0.5rem 0.85rem; border-bottom: 1px solid var(--bulma-border-light); }
.config-title { font-size: 0.75em; font-weight: 600; color: var(--bulma-text); margin: 0 0 0.4rem; display: flex; align-items: center; gap: 0.3rem; }
.config-row { display: flex; gap: 0.4rem; margin-bottom: 0.3rem; font-size: 0.72em; }
.config-label { width: 60px; flex-shrink: 0; color: var(--bulma-text-light); padding-top: 0.3rem; }
.config-fields { flex: 1; display: flex; flex-direction: column; gap: 0.25rem; }
.toggle-row { display: flex; align-items: center; gap: 0.3rem; color: var(--bulma-text); cursor: pointer; input { accent-color: var(--bulma-primary); } }
.form-input, .form-textarea { width: 100%; padding: 0.3rem 0.4rem; border: 1px solid var(--bulma-border); border-radius: 3px; font-size: 0.72em; background: var(--bulma-scheme-main); color: var(--bulma-text); outline: none; }
.form-input:focus, .form-textarea:focus { border-color: var(--bulma-primary); }
.form-textarea { resize: vertical; font-family: monospace; }

.chat-messages { flex: 1; overflow-y: auto; padding: 0.4rem; }
.chat-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--bulma-text-light); gap: 0.4rem; }
.chat-empty .empty-icon { opacity: 0.3; }
.chat-empty p { font-size: 0.78em; }
.chat-msg { padding: 0.35rem 0.5rem; margin-bottom: 0.25rem; border-radius: 6px; font-size: 0.75em; background: var(--bulma-scheme-main-ter); }
.chat-msg.is-out { background: var(--bulma-primary-bis); border-left: 3px solid var(--bulma-primary); }
.chat-msg.is-in { border-left: 3px solid var(--bulma-border); }
.chat-msg.is-telegram { border-left-color: #0088cc; }
.chat-msg.is-wechat { border-left-color: #07c160; }
.chat-msg.is-qq { border-left-color: #12b7f5; }
.chat-msg.is-ai { border-left-color: #a855f7; }
.msg-header { display: flex; gap: 0.4rem; margin-bottom: 0.15rem; }
.msg-from { font-weight: 600; color: var(--bulma-text-strong); }
.msg-platform { font-size: 0.65em; color: var(--bulma-text-light); text-transform: uppercase; }
.msg-time { margin-left: auto; font-size: 0.65em; color: var(--bulma-text-light); }
.msg-body { color: var(--bulma-text); word-break: break-word; white-space: pre-wrap; }

.chat-input-area { flex-shrink: 0; border-top: 1px solid var(--bulma-border-light); padding: 0.4rem; display: flex; flex-direction: column; gap: 0.3rem; }
.platform-select { width: 100%; padding: 0.3rem; border: 1px solid var(--bulma-border); border-radius: 4px; font-size: 0.72em; background: var(--bulma-scheme-main); color: var(--bulma-text); outline: none; }
.platform-none { font-size: 0.72em; color: var(--bulma-text-light); text-align: center; padding: 0.2rem; }
.input-row { display: flex; gap: 0.3rem; }
.chat-input { flex: 1; padding: 0.4rem 0.5rem; border: 1px solid var(--bulma-border); border-radius: 4px; font-size: 0.75em; background: var(--bulma-scheme-main); color: var(--bulma-text); outline: none; }
.chat-input:focus { border-color: var(--bulma-primary); }
.send-btn { background: var(--bulma-primary); color: white; border: none; border-radius: 4px; padding: 0.35rem 0.6rem; cursor: pointer; display: flex; align-items: center; }
.send-btn:disabled { opacity: 0.4; cursor: default; }
</style>
