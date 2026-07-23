import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { get as httpsGet } from 'https';

const __dirname = join(fileURLToPath(import.meta.url), '..', '..');
const CHAT_CONFIG_PATH = join(__dirname, 'chat-config.json');

let chatConfig = { telegram: { enabled: false, token: '', adminIds: [] }, wechat: { enabled: false, apiUrl: '', apiKey: '' }, qq: { enabled: false, apiUrl: '', apiKey: '' }, ai: { enabled: false, apiUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini', systemPrompt: 'You are a helpful SSH operations assistant.', temperature: 0.7 } };
let chatMessages = [];
let chatIdCounter = 0;

try { if (existsSync(CHAT_CONFIG_PATH)) chatConfig = JSON.parse(readFileSync(CHAT_CONFIG_PATH, 'utf8')); } catch {}

function saveChatConfig() { try { writeFileSync(CHAT_CONFIG_PATH, JSON.stringify(chatConfig, null, 2), 'utf8'); } catch (e) { console.error('[Chat] Failed to save config:', e.message); } }

function addChatMessage(msg) {
  const m = { id: `chat_${++chatIdCounter}`, ...msg, timestamp: msg.timestamp || Date.now() };
  chatMessages.push(m);
  if (chatMessages.length > 1000) chatMessages = chatMessages.slice(-1000);
  return m;
}

// Telegram bot polling
let telegramPollTimer = null;
let telegramLastUpdateId = 0;
function startTelegramPoll() {
  stopTelegramPoll();
  if (!chatConfig.telegram?.enabled || !chatConfig.telegram?.token) return;
  const base = `https://api.telegram.org/bot${chatConfig.telegram.token}`;
  const poll = () => {
    httpsGet(`${base}/getUpdates?offset=${telegramLastUpdateId + 1}&timeout=30&allowed_updates=["message"]`, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.ok && data.result) {
            for (const update of data.result) {
              const msg = update.message;
              if (!msg) continue;
              if (update.update_id > telegramLastUpdateId) telegramLastUpdateId = update.update_id;
              const chatId = msg.chat?.id;
              if (!chatId) continue;
              const text = msg.text || '';
              const from = msg.from?.username || msg.from?.first_name || 'User';
              if (!chatConfig.telegram.adminIds.includes(chatId)) {
                httpsGet(`${base}/sendMessage?chat_id=${chatId}&text=Srr, you are not authorized.`, () => {});
                continue;
              }
              addChatMessage({ platform: 'telegram', direction: 'in', from, text, meta: { chatId } });
              if (chatConfig.ai.enabled) handleAiResponse(text, 'telegram', chatId);
            }
          }
        } catch {}
        telegramPollTimer = setTimeout(poll, 1000);
      });
    }).on('error', () => { telegramPollTimer = setTimeout(poll, 5000); });
  };
  poll();
}
function stopTelegramPoll() { if (telegramPollTimer) { clearTimeout(telegramPollTimer); telegramPollTimer = null; } }

async function sendBotMessage(platform, text, meta = {}) {
  if (platform === 'telegram') {
    const cfg = chatConfig.telegram;
    if (!cfg?.enabled || !cfg?.token) return { success: false, error: 'Telegram not configured' };
    const chatId = meta?.chatId || (cfg.adminIds.length > 0 ? cfg.adminIds[0] : null);
    if (!chatId) return { success: false, error: 'No target chat ID' };
    return new Promise((resolve) => {
      const url = `https://api.telegram.org/bot${cfg.token}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(text)}&parse_mode=Markdown`;
      httpsGet(url, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => { try { const r = JSON.parse(body); resolve(r.ok ? { success: true } : { success: false, error: r.description }); } catch { resolve({ success: false }); } });
      }).on('error', (e) => resolve({ success: false, error: e.message }));
    });
  } else if (platform === 'wechat') {
    const cfg = chatConfig.wechat;
    if (!cfg?.enabled || !cfg?.apiUrl) return { success: false, error: 'WeChat not configured' };
    try {
      const res = await fetch(cfg.apiUrl + '/send_message', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cfg.apiKey ? { 'Authorization': `Bearer ${cfg.apiKey}` } : {}) }, body: JSON.stringify({ type: 'text', content: text, ...meta }) });
      return { success: res.ok };
    } catch (e) { return { success: false, error: e.message }; }
  } else if (platform === 'qq') {
    const cfg = chatConfig.qq;
    if (!cfg?.enabled || !cfg?.apiUrl) return { success: false, error: 'QQ not configured' };
    try {
      const target = meta?.groupId ? `group_id=${meta.groupId}` : `user_id=${meta.userId}`;
      const res = await fetch(`${cfg.apiUrl}/send_msg?message_type=${meta?.groupId ? 'group' : 'private'}&${target}&message=${encodeURIComponent(text)}`, { headers: { ...(cfg.apiKey ? { 'Authorization': `Bearer ${cfg.apiKey}` } : {}) } });
      return { success: res.ok };
    } catch (e) { return { success: false, error: e.message }; }
  }
  return { success: false, error: `Unknown platform: ${platform}` };
}

async function handleAiResponse(incomingText, platform, meta) {
  const cfg = chatConfig.ai;
  if (!cfg?.enabled || !cfg?.apiKey) return;
  try {
    const res = await fetch(`${cfg.apiUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model || 'gpt-4o-mini', messages: [{ role: 'system', content: cfg.systemPrompt || 'You are a helpful assistant.' }, { role: 'user', content: incomingText }], temperature: cfg.temperature || 0.7, max_tokens: 1000 }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content;
    if (!reply) return;
    addChatMessage({ platform: 'ai', direction: 'in', from: 'AI', text: reply });
    await sendBotMessage(platform, reply, meta);
  } catch (e) { console.error('[Chat] AI error:', e.message); }
}

function restartTelegramPoll() { startTelegramPoll(); }

function maskSecret(val) {
  if (!val || val.length < 8) return val;
  return val.slice(0, 3) + '****' + val.slice(-4);
}

export function createChatBot() {
  return {
    getConfig: () => chatConfig,
    getSanitizedConfig: () => {
      const c = JSON.parse(JSON.stringify(chatConfig));
      if (c.telegram?.token) c.telegram.token = maskSecret(c.telegram.token);
      if (c.wechat?.apiKey) c.wechat.apiKey = maskSecret(c.wechat.apiKey);
      if (c.qq?.apiKey) c.qq.apiKey = maskSecret(c.qq.apiKey);
      if (c.ai?.apiKey) c.ai.apiKey = maskSecret(c.ai.apiKey);
      return c;
    },
    getMessages: (since = 0) => since > 0 ? chatMessages.filter(m => m.timestamp > since) : chatMessages,
    updateConfig: (newConfig) => {
      Object.assign(chatConfig, newConfig);
      saveChatConfig();
      restartTelegramPoll();
    },
    sendMessage: async (platform, text, meta) => {
      addChatMessage({ platform, direction: 'out', from: 'Admin', text, meta });
      return await sendBotMessage(platform, text, meta);
    },
  };
}
