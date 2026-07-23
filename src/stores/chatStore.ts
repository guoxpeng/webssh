import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { apiFetch } from '@/utils/api';

export interface ChatMessage {
  id: string;
  platform: 'telegram' | 'wechat' | 'qq' | 'ai' | 'webssh';
  direction: 'in' | 'out';
  from: string;
  text: string;
  timestamp: number;
  meta?: any;
}

export interface BotConfig {
  telegram: { enabled: boolean; token: string; adminIds: number[] };
  wechat: { enabled: boolean; apiUrl: string; apiKey: string };
  qq: { enabled: boolean; apiUrl: string; apiKey: string };
  ai: { enabled: boolean; apiUrl: string; apiKey: string; model: string; systemPrompt: string; temperature: number };
}

const DEFAULT_CONFIG: BotConfig = {
  telegram: { enabled: false, token: '', adminIds: [] },
  wechat: { enabled: false, apiUrl: '', apiKey: '' },
  qq: { enabled: false, apiUrl: '', apiKey: '' },
  ai: { enabled: false, apiUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini', systemPrompt: 'You are a helpful SSH operations assistant.', temperature: 0.7 },
};

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([]);
  const config = ref<BotConfig>({ ...DEFAULT_CONFIG });
  const configLoaded = ref(false);
  const lastFetchTime = ref(0);
  const pollTimer = ref<any>(null);

  const activePlatforms = computed(() => {
    const platforms: string[] = [];
    if (config.value.telegram.enabled) platforms.push('telegram');
    if (config.value.wechat.enabled) platforms.push('wechat');
    if (config.value.qq.enabled) platforms.push('qq');
    return platforms;
  });

  async function loadConfig() {
    try {
      const res = await apiFetch('/api/chat/config');
      if (res.ok) {
        config.value = await res.json();
        configLoaded.value = true;
      }
    } catch {}
  }

  async function saveConfig() {
    try {
      await apiFetch('/api/chat/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config.value) });
    } catch {}
  }

  async function fetchMessages() {
    try {
      const res = await apiFetch('/api/chat/messages', { headers: { 'X-Since': String(lastFetchTime.value) } });
      if (res.ok) {
        const data = await res.json();
        for (const msg of data.messages) {
          if (!messages.value.find(m => m.id === msg.id)) {
            messages.value.push(msg);
          }
        }
        if (data.messages.length > 0) {
          lastFetchTime.value = Date.now();
        }
      }
    } catch {}
  }

  async function sendMessage(platform: string, text: string, meta?: any) {
    const msg: ChatMessage = {
      id: `chat_out_${Date.now()}`,
      platform: platform as any,
      direction: 'out',
      from: 'Admin',
      text,
      timestamp: Date.now(),
      meta,
    };
    messages.value.push(msg);
    try {
      await apiFetch('/api/chat/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform, text, meta }) });
    } catch {}
  }

  function startPolling() {
    stopPolling();
    loadConfig();
    fetchMessages();
    pollTimer.value = setInterval(() => fetchMessages(), 2000);
  }

  function stopPolling() {
    if (pollTimer.value) { clearInterval(pollTimer.value); pollTimer.value = null; }
  }

  return {
    messages, config, configLoaded, lastFetchTime, activePlatforms,
    loadConfig, saveConfig, fetchMessages, sendMessage, startPolling, stopPolling,
  };
});
