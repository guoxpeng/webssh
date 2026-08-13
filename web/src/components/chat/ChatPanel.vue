<template>
  <div class="chat-panel">
    <div class="panel-header">
      <h3 class="panel-title"><MessageSquare :size="16"/> {{ t('chat.title') }}</h3>
      <div class="panel-tabs">
        <button class="tab-btn" :class="{ 'is-active': tab === 'messages' }" @click="tab = 'messages'">{{ t('chat.messages') }}</button>
        <button class="tab-btn" :class="{ 'is-active': tab === 'ai' }" @click="tab = 'ai'">AI</button>
      </div>
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
            <label class="toggle-row"><input type="checkbox" v-model="store.config.qq.enabled" @change="onConfigChange"/> {{ t('chat.enabled') }}</label>
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

    <!-- Platform Messages Tab -->
    <template v-if="tab === 'messages'">
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
    </template>

    <!-- AI Chat Tab -->
    <template v-if="tab === 'ai'">
      <div class="chat-messages" ref="aiMsgContainer">
        <div v-if="aiMessages.length === 0" class="chat-empty">
          <Brain :size="32" class="empty-icon"/>
          <p>{{ t('chat.aiEmpty') }}</p>
        </div>
        <div v-for="msg in aiMessages" :key="msg.id" class="chat-msg" :class="`is-${msg.direction} is-${msg.platform}`">
          <div class="msg-header">
            <span class="msg-from">{{ msg.from }}</span>
            <span class="msg-time">{{ timeAgo(msg.timestamp) }}</span>
          </div>
          <div class="msg-body" v-if="!msg.meta?.execResults">{{ msg.text }}</div>
          <div class="msg-body" v-else>
            <div class="msg-text">{{ msg.text.split('\n\n```')[0] }}</div>
            <div class="exec-results">
              <div v-for="(r, i) in msg.meta.execResults" :key="i" class="exec-item">
                <div class="exec-cmd"><Terminal :size="12"/> $ {{ r.command }}</div>
                <pre v-if="r.stdout" class="exec-output">{{ r.stdout }}</pre>
                <pre v-if="r.stderr" class="exec-err">{{ r.stderr }}</pre>
                <div v-if="r.error" class="exec-err">{{ r.error }}</div>
              </div>
            </div>
          </div>
        </div>
        <div v-if="aiLoading" class="chat-msg is-in is-ai">
          <div class="msg-header"><span class="msg-from">AI</span></div>
          <div class="msg-body"><span class="typing-dots">...</span></div>
        </div>
      </div>
      <div class="chat-input-area">
        <div class="input-row">
          <select v-model="aiServerId" class="platform-select ai-server-select">
            <option value="">{{ t('chat.noServer') }}</option>
            <option v-for="s in savedServers" :key="s.id" :value="s.id">{{ s.name || s.host }}</option>
          </select>
        </div>
        <div class="input-row">
          <input type="text" v-model="aiInputText" class="chat-input" :placeholder="t('chat.aiPlaceholder')" @keydown.enter="onAiSend" :disabled="aiLoading"/>
          <button class="send-btn" @click="onAiSend" :disabled="!aiInputText.trim() || aiLoading">
            <Send :size="14"/>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useChatStore } from '@/stores/chatStore';
import { MessageSquare, Settings, Send, Radio, Brain, X, Terminal } from 'lucide-vue-next';
import { apiFetch } from '@/utils/api';
import { useConnectionStore } from '@/stores/connectionStore';

const { t } = useI18n();
const store = useChatStore();
const connStore = useConnectionStore();

const showConfig = ref(false);
const tab = ref('messages');
const inputText = ref('');
const aiInputText = ref('');
const activePlatform = ref('');
const aiServerId = ref('');
const msgContainer = ref(null);
const aiMsgContainer = ref(null);
const adminIdsText = ref('');
const aiMessages = ref([]);
const aiLoading = ref(false);

const savedServers = computed(() => connStore.savedConnections);

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

async function onAiSend() {
  const text = aiInputText.value.trim();
  if (!text || aiLoading.value) return;
  aiInputText.value = '';
  aiMessages.value.push({ id: `ai_out_${Date.now()}`, platform: 'webssh', direction: 'out', from: 'Admin', text, timestamp: Date.now() });
  aiLoading.value = true;
  nextTick(() => { if (aiMsgContainer.value) aiMsgContainer.value.scrollTop = aiMsgContainer.value.scrollHeight; });
  try {
    let serverConfig = null;
    if (aiServerId.value) {
      const srv = connStore.savedConnections.find(s => s.id === aiServerId.value);
      if (srv) {
        // savedConnections never holds auth_value (stripped on save) — resolve
        // it from session/local credential storage, else AI SSH exec has no auth.
        let authValue = srv.auth_value;
        let authType = srv.auth_type;
        if (!authValue && srv.id) {
          const sessionCred = connStore.sessionRememberedCredentials[srv.id];
          const localCred = await connStore.getCredentialFromLocalStorage(srv.id);
          const cred = sessionCred?.auth_value ? sessionCred : localCred;
          if (cred?.auth_value) { authValue = cred.auth_value; authType = cred.auth_type || authType; }
        }
        serverConfig = { host: srv.host, port: srv.port, username: srv.username, auth_type: authType, auth_value: authValue };
      }
    }
    const res = await apiFetch('/api/chat/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, serverConfig }),
    });
    const data = await res.json();
    if (data.success) {
      aiMessages.value.push({ id: `ai_in_${Date.now()}`, platform: 'ai', direction: 'in', from: 'AI', text: data.reply, timestamp: Date.now(), meta: data.execResults?.length ? { execResults: data.execResults } : undefined });
    } else {
      aiMessages.value.push({ id: `ai_err_${Date.now()}`, platform: 'ai', direction: 'in', from: 'AI', text: `Error: ${data.error}`, timestamp: Date.now() });
    }
  } catch (e) {
    aiMessages.value.push({ id: `ai_err_${Date.now()}`, platform: 'ai', direction: 'in', from: 'AI', text: `Error: ${e.message}`, timestamp: Date.now() });
  } finally {
    aiLoading.value = false;
    nextTick(() => { if (aiMsgContainer.value) aiMsgContainer.value.scrollTop = aiMsgContainer.value.scrollHeight; });
  }
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
.panel-tabs { display: flex; gap: 0.15rem; background: var(--bulma-scheme-main-ter); border-radius: 8px; padding: 2px; }
.tab-btn { background: none; border: none; padding: 0.3rem 0.65rem; border-radius: 6px; font-size: 0.72em; cursor: pointer; color: var(--bulma-text-light); font-weight: 500; transition: all 0.12s; }
.tab-btn.is-active { background: var(--bulma-scheme-main); color: var(--bulma-text); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }

.chat-config { overflow-y: auto; border-bottom: 1px solid var(--bulma-border-light); max-height: 45%; flex-shrink: 0; }
.config-section { padding: 0.6rem 0.9rem; border-bottom: 1px solid var(--bulma-border-light); }
.config-title { font-size: 0.78em; font-weight: 600; color: var(--bulma-text); margin: 0 0 0.45rem; display: flex; align-items: center; gap: 0.35rem; }
.config-row { display: flex; gap: 0.45rem; margin-bottom: 0.35rem; font-size: 0.75em; }
.config-label { width: 60px; flex-shrink: 0; color: var(--bulma-text-light); padding-top: 0.35rem; }
.config-fields { flex: 1; display: flex; flex-direction: column; gap: 0.3rem; }
.toggle-row { display: flex; align-items: center; gap: 0.4rem; color: var(--bulma-text); cursor: pointer; input { accent-color: var(--bulma-primary); } }
/* Compact inputs inside config rows */
.config-fields .form-input, .config-fields .form-textarea { padding: 0.35rem 0.5rem; font-size: 0.9em; }

.chat-messages { flex: 1; overflow-y: auto; padding: 0.5rem 0.6rem; }
.chat-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--bulma-text-light); gap: 0.5rem; }
.chat-empty .empty-icon { opacity: 0.3; }
.chat-empty p { font-size: 0.8em; }
.chat-msg { padding: 0.45rem 0.6rem; margin-bottom: 0.35rem; border-radius: 8px; font-size: 0.78em; background: var(--bulma-scheme-main-ter); }
.chat-msg.is-out { background: var(--bulma-primary-bis); border-left: 3px solid var(--bulma-primary); }
.chat-msg.is-in { border-left: 3px solid var(--bulma-border); }
.chat-msg.is-telegram { border-left-color: #0088cc; }
.chat-msg.is-wechat { border-left-color: #07c160; }
.chat-msg.is-qq { border-left-color: #12b7f5; }
.chat-msg.is-ai { border-left-color: #a855f7; }
.msg-header { display: flex; gap: 0.4rem; margin-bottom: 0.2rem; }
.msg-from { font-weight: 600; color: var(--bulma-text-strong); }
.msg-platform { font-size: 0.65em; color: var(--bulma-text-light); text-transform: uppercase; }
.msg-time { margin-left: auto; font-size: 0.65em; color: var(--bulma-text-light); }
.msg-body { color: var(--bulma-text); word-break: break-word; white-space: pre-wrap; }

.chat-input-area { flex-shrink: 0; border-top: 1px solid var(--bulma-border-light); padding: 0.5rem 0.6rem; display: flex; flex-direction: column; gap: 0.35rem; }
.platform-select { width: 100%; padding: 0.4rem 0.5rem; border: 1px solid var(--bulma-border); border-radius: 8px; font-size: 0.78em; background: var(--bulma-input-background-color); color: var(--bulma-text); outline: none; &:focus { border-color: var(--bulma-primary); } }
.platform-none { font-size: 0.75em; color: var(--bulma-text-light); text-align: center; padding: 0.2rem; }
.input-row { display: flex; gap: 0.35rem; }
.chat-input { flex: 1; padding: 0.5rem 0.6rem; border: 1px solid var(--bulma-border); border-radius: 8px; font-size: 0.8em; background: var(--bulma-input-background-color); color: var(--bulma-text); outline: none; transition: border-color 0.15s, box-shadow 0.15s; }
.chat-input:focus { border-color: var(--bulma-primary); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12); }
.send-btn {
  background: linear-gradient(135deg, var(--bulma-primary), var(--bulma-link, var(--bulma-primary)));
  color: white; border: none; border-radius: 8px; padding: 0.45rem 0.7rem; cursor: pointer;
  display: flex; align-items: center; transition: box-shadow 0.12s;
  &:hover { box-shadow: 0 3px 10px rgba(99, 102, 241, 0.3); }
}
.send-btn:disabled { opacity: 0.4; cursor: default; box-shadow: none; }

.ai-server-select { margin-bottom: 0; }
.exec-results { margin-top: 0.5rem; border-top: 1px solid var(--bulma-border-light); padding-top: 0.4rem; }
.exec-item { margin-bottom: 0.4rem; }
.exec-cmd { font-family: monospace; font-size: 0.85em; color: var(--bulma-primary); display: flex; align-items: center; gap: 0.3rem; margin-bottom: 0.15rem; }
.exec-output { background: var(--bulma-scheme-main-ter); padding: 0.35rem; border-radius: 3px; font-size: 0.85em; font-family: monospace; white-space: pre-wrap; word-break: break-all; margin: 0; color: var(--bulma-text); }
.exec-err { background: var(--bulma-danger-bis); padding: 0.35rem; border-radius: 3px; font-size: 0.85em; font-family: monospace; white-space: pre-wrap; word-break: break-all; margin: 0; color: var(--bulma-danger); }
.typing-dots { animation: dotPulse 1.2s step-end infinite; }
@keyframes dotPulse { 0%, 20% { opacity: 0.3; } 50% { opacity: 1; } 80%, 100% { opacity: 0.3; } }
</style>
