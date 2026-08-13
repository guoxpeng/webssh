<template>
  <div class="page-view">
    <header class="page-head">
      <h1 class="page-title"><HistoryIcon :size="20"/> {{ t('history.title') }}</h1>
      <p class="page-desc">{{ t('history.desc') }}</p>
    </header>

    <div class="page-actions" v-if="historyStore.entries.length">
      <button class="pw-btn minor" @click="historyStore.clear()">
        <Trash2Icon :size="13"/> {{ t('history.clearAll') }}
      </button>
    </div>

    <div class="hist-list" v-if="historyStore.entries.length">
      <div class="hist-item" v-for="e in historyStore.entries" :key="e.id">
        <span class="hist-dot" :class="e.status"></span>
        <div class="hist-main">
          <div class="hist-name">{{ e.name }}</div>
          <div class="hist-meta">
            {{ e.protocol }}://{{ e.username ? e.username + '@' : '' }}{{ e.host }}:{{ e.port }}
            <span v-if="e.error" class="hist-err" :title="e.error">· {{ e.error }}</span>
          </div>
        </div>
        <span class="hist-time">{{ fmtTime(e.time) }}</span>
        <button class="hist-del" :title="t('common.remove')" @click="historyStore.remove(e.id)">&times;</button>
      </div>
    </div>

    <div class="page-empty" v-else>
      <HistoryIcon :size="38" class="empty-icon"/>
      <p>{{ t('history.empty') }}</p>
    </div>
  </div>
</template>

<script setup>
import { useHistoryStore } from '@/stores/historyStore';
import { History as HistoryIcon, Trash2 as Trash2Icon } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const historyStore = useHistoryStore();

function fmtTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = d.toTimeString().slice(0, 5);
  if (sameDay) return hm;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}
</script>

<style scoped>
.page-view { max-width: 900px; margin: 0 auto; padding: 32px 24px 80px; }
.page-head { margin-bottom: 22px; }
.page-title { display: flex; align-items: center; gap: 9px; font-size: 19px; font-weight: 600; color: var(--app-text); letter-spacing: .2px; }
.page-desc { margin-top: 6px; font-size: 13px; color: var(--app-text-dim); }
.page-actions { display: flex; justify-content: flex-end; margin-bottom: 12px; }
.hist-list { display: flex; flex-direction: column; gap: 8px; }
.hist-item {
  display: flex; align-items: center; gap: 12px;
  background: var(--app-surface); border: 1px solid var(--app-border);
  border-radius: 10px; padding: 12px 14px;
  transition: background .12s;
}
.hist-item:hover { background: var(--app-surface-hover); }
.hist-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.hist-dot.success { background: #22c55e; }
.hist-dot.failed { background: #ef4444; }
.hist-main { flex: 1; min-width: 0; }
.hist-name { font-size: 14px; font-weight: 500; color: var(--app-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hist-meta { font-size: 12px; color: var(--app-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hist-err { color: #ef4444; opacity: .85; }
.hist-time { font-size: 12px; color: var(--app-text-dim); flex: none; }
.hist-del { border: none; background: none; color: var(--app-text-dim); font-size: 17px; cursor: pointer; padding: 2px 7px; border-radius: 6px; }
.hist-del:hover { color: #ef4444; background: rgba(239,68,68,.1); }
.page-empty { text-align: center; padding: 70px 0; color: var(--app-text-dim); font-size: 14px; }
.empty-icon { opacity: .35; margin-bottom: 12px; }
.pw-btn.minor { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--app-border); background: var(--app-surface); color: var(--app-text-dim); cursor: pointer; }
.pw-btn.minor:hover { background: var(--app-surface-hover); color: var(--app-text); }
</style>
