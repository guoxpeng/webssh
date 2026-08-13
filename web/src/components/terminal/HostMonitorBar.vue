<template>
  <div class="host-monitor-bar" v-if="stats">
    <div class="hm-item" :title="t('terminal.monitor.cpuTip')">
      <span class="hm-label">CPU</span>
      <svg class="hm-spark" viewBox="0 0 60 18" preserveAspectRatio="none" aria-hidden="true">
        <polyline :points="spark('cpu')" :class="'spark-line ' + level(stats.cpu)"/>
      </svg>
      <span class="hm-value">{{ stats.cpu.toFixed(0) }}%</span>
      <span class="hm-sub" v-if="stats.cores">{{ stats.cores }}{{ t('terminal.monitor.cores') }}</span>
    </div>
    <div class="hm-item" :title="t('terminal.monitor.memTip')">
      <span class="hm-label">{{ t('terminal.monitor.mem') }}</span>
      <svg class="hm-spark" viewBox="0 0 60 18" preserveAspectRatio="none" aria-hidden="true">
        <polyline :points="spark('mem')" :class="'spark-line ' + level(memPct)"/>
      </svg>
      <span class="hm-value">{{ fmtBytes(stats.memUsed) }}/{{ fmtBytes(stats.memTotal) }}</span>
    </div>
    <div class="hm-item" :title="t('terminal.monitor.loadTip')">
      <span class="hm-label">{{ t('terminal.monitor.load') }}</span>
      <span class="hm-value">{{ stats.load.map((l) => l.toFixed(2)).join(' / ') }}</span>
    </div>
    <div class="hm-item" :title="t('terminal.monitor.diskTip')">
      <span class="hm-label">{{ t('terminal.monitor.disk') }}</span>
      <div class="hm-bar"><div class="hm-bar-fill" :class="level(stats.diskPct)" :style="{ width: stats.diskPct + '%' }"></div></div>
      <span class="hm-value">{{ stats.diskPct }}%</span>
    </div>
    <div class="hm-item" :title="t('terminal.monitor.netTip')">
      <span class="hm-label hm-net-up">&#8593;</span>
      <span class="hm-value">{{ fmtRate(stats.txRate) }}</span>
      <span class="hm-label hm-net-down">&#8595;</span>
      <span class="hm-value">{{ fmtRate(stats.rxRate) }}</span>
    </div>
    <div class="hm-item hm-uptime" v-if="stats.uptime" :title="t('terminal.monitor.uptimeTip')">
      <span class="hm-label">{{ t('terminal.monitor.uptime') }}</span>
      <span class="hm-value">{{ fmtUptime(stats.uptime) }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const props = defineProps({
  stats: { type: Object, default: null },
  // Rolling samples [{cpu, mem}] from the terminal component.
  history: { type: Array, default: () => [] },
});

const memPct = computed(() => {
  if (!props.stats?.memTotal) return 0;
  return Math.round((props.stats.memUsed / props.stats.memTotal) * 100);
});

// Build SVG polyline points for a 60×18 sparkline from the history buffer.
function spark(key) {
  const pts = props.history;
  if (!pts || pts.length < 2) return '';
  const w = 60, h = 18;
  const step = w / (pts.length - 1);
  return pts.map((p, i) => {
    const v = Math.max(0, Math.min(100, p[key] || 0));
    const x = (i * step).toFixed(1);
    const y = (h - 1 - (v / 100) * (h - 2)).toFixed(1);
    return `${x},${y}`;
  }).join(' ');
}

function level(pct) {
  if (pct >= 90) return 'is-critical';
  if (pct >= 70) return 'is-warning';
  return 'is-normal';
}

function fmtBytes(n) {
  if (!n) return '0B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return (i === 0 ? v : v.toFixed(1)) + units[i];
}

function fmtRate(bps) {
  return fmtBytes(bps) + '/s';
}

function fmtUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}${t('terminal.monitor.day')} ${h}${t('terminal.monitor.hour')}`;
  if (h > 0) return `${h}${t('terminal.monitor.hour')} ${m}${t('terminal.monitor.min')}`;
  return `${m}${t('terminal.monitor.min')}`;
}
</script>

<style lang="scss" scoped>
.host-monitor-bar {
  display: none;
  align-items: center;
  gap: 1rem;
  flex: 0 0 auto;
  padding: 0.3rem 0.75rem;
  background: var(--term-bg, #0f172a);
  border-top: 1px solid var(--term-border, rgba(255, 255, 255, 0.08));
  color: var(--term-text-dim, #94a3b8);
  font-size: 0.72rem;
  font-family: inherit;
  white-space: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
  /* FinalShell-style status strip: desktop only, phones keep the full term */
  @media screen and (min-width: 1024px) { display: flex; }
}

.hm-item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex: 0 0 auto;
}

.hm-label {
  opacity: 0.75;
  letter-spacing: 0.03em;
}

.hm-sub { opacity: 0.55; }

.hm-bar {
  width: 56px;
  height: 5px;
  border-radius: 3px;
  background: rgba(148, 163, 184, 0.18);
  overflow: hidden;
}

.hm-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.6s ease;
  &.is-normal { background: #22c55e; }
  &.is-warning { background: #f59e0b; }
  &.is-critical { background: #ef4444; }
}

/* Live history sparkline (last ~2 minutes) */
.hm-spark { width: 60px; height: 18px; flex-shrink: 0; opacity: 0.95; }
.spark-line {
  fill: none; stroke-width: 1.4;
  stroke-linejoin: round; stroke-linecap: round;
  &.is-normal { stroke: #22c55e; }
  &.is-warning { stroke: #f59e0b; }
  &.is-critical { stroke: #ef4444; }
}

.hm-value {
  color: var(--term-text, #e2e8f0);
  font-variant-numeric: tabular-nums;
}

.hm-net-up { color: #f87171; }
.hm-net-down { color: #4ade80; }
</style>
