<template>
  <div class="split-pane-terminal" ref="containerRef">
    <div class="pane-toolbar">
      <div class="pane-tabs">
        <button v-for="(pane, idx) in panes" :key="pane.id"
                class="pane-tab"
                :class="{ 'is-active': idx === activePane }"
                @click="activePane = idx">
          <ProtocolBadge :protocol="pane.protocol" class="mr-1"/>
          <span class="pane-tab-label">{{ pane.name }}</span>
          <span class="pane-tab-status" :class="`is-${pane.status}`"></span>
          <button class="pane-tab-close" @click.stop="closePane(idx)" v-if="panes.length > 1">&times;</button>
        </button>
      </div>
      <div class="pane-actions">
        <button class="pane-action-btn" @click="splitVertical" :title="t('terminal.splitVertical')" v-if="panes.length < 4">
          <div class="split-icon-col"><span></span><span></span></div>
        </button>
        <button class="pane-action-btn" @click="splitHorizontal" :title="t('terminal.splitHorizontal')" v-if="panes.length < 4">
          <div class="split-icon-row"><span></span><span></span></div>
        </button>
      </div>
    </div>
    <div class="pane-body" :style="gridStyle">
      <div v-for="(pane, idx) in panes" :key="pane.id"
           class="pane-content"
           :class="{ 'is-active': idx === activePane }">
        <TerminalDisplay :node-config="pane.config" v-if="pane.type === 'terminal'"/>
        <SftpBrowser v-else-if="pane.type === 'sftp'" @close="closePane(idx)"/>
        <DockerPanel v-else-if="pane.type === 'docker'" :session-id="pane.id" @close="closePane(idx)"/>
        <div v-else class="pane-empty">
          <component :is="protocolIcon(pane.protocol)" :size="32" class="pane-empty-icon"/>
          <p>{{ pane.protocol.toUpperCase() }} session: {{ pane.name }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import TerminalDisplay from './TerminalDisplay.vue';
import SftpBrowser from '@/components/sftp/SftpBrowser.vue';
import DockerPanel from '@/components/docker/DockerPanel.vue';
import ProtocolBadge from '@/components/global/ProtocolBadge.vue';
import { Terminal, Monitor, Video, Wifi, Plus } from 'lucide-vue-next';

const { t } = useI18n();
const panes = ref([{ id: 'pane-0', name: t('terminal.title'), protocol: 'ssh', type: 'terminal', config: null, status: 'disconnected' }]);
const activePane = ref(0);
const gridLayout = ref({ direction: 'none', splits: [] });

function protocolIcon(p) {
  const m = { ssh: Terminal, rdp: Monitor, vnc: Video, telnet: Wifi };
  return m[p] || Terminal;
}

const gridStyle = computed(() => {
  const n = panes.value.length;
  if (n <= 1) return {};
  if (n === 2) return { display: 'grid', gridTemplateColumns: '1fr 1fr' };
  if (n === 3) return { display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr',
    '& > :nth-child(1)': { gridColumn: '1 / -1' } };
  return { display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' };
});

function addPane(type, protocol) {
  const id = `pane-${Date.now()}`;
  panes.value.push({ id, name: `${protocol.toUpperCase()} ${panes.value.length + 1}`, protocol, type, config: null, status: 'disconnected' });
  activePane.value = panes.value.length - 1;
}

function closePane(idx) {
  if (panes.value.length <= 1) return;
  panes.value.splice(idx, 1);
  if (activePane.value >= panes.value.length) activePane.value = panes.value.length - 1;
}

function splitVertical() {
  const cur = panes.value[activePane.value];
  addPane(cur.type, cur.protocol);
}

function splitHorizontal() {
  splitVertical();
}

defineExpose({ panes, activePane, addPane });
</script>

<style lang="scss" scoped>
.split-pane-terminal {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.pane-toolbar {
  display: flex;
  align-items: center;
  background: var(--bulma-scheme-main-ter);
  border-bottom: 1px solid var(--bulma-border-light);
  min-height: 34px;
  flex-shrink: 0;
}

.pane-tabs {
  display: flex;
  align-items: stretch;
  flex: 1;
  overflow-x: auto;
  gap: 1px;
  padding: 0 0.25rem;
  &::-webkit-scrollbar { height: 2px; }
}

.pane-tab {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.6rem;
  font-size: 0.75em;
  border: none;
  background: transparent;
  color: var(--bulma-text-light);
  cursor: pointer;
  white-space: nowrap;
  border-bottom: 2px solid transparent;
  transition: all 0.1s;
  &:hover { color: var(--bulma-text); background: var(--bulma-scheme-main-bis); }
  &.is-active { color: var(--bulma-text-strong); border-bottom-color: var(--bulma-primary); font-weight: 500; }
}

.pane-tab-label { max-width: 100px; overflow: hidden; text-overflow: ellipsis; }

.pane-tab-status {
  width: 6px; height: 6px; border-radius: 50%;
  &.is-connected { background: var(--bulma-success); }
  &.is-connecting { background: var(--bulma-info); }
  &.is-error { background: var(--bulma-danger); }
  &.is-disconnected { background: var(--bulma-border); }
}

.pane-tab-close {
  background: none; border: none; font-size: 1.1em; line-height: 1; padding: 0 2px;
  color: var(--bulma-text-light); cursor: pointer; opacity: 0;
  .pane-tab:hover & { opacity: 1; }
  &:hover { color: var(--bulma-danger); }
}

.pane-actions {
  display: flex; gap: 2px; padding: 0 0.5rem; flex-shrink: 0;
}

.pane-action-btn {
  background: none; border: 1px solid var(--bulma-border-light); border-radius: 4px;
  padding: 3px; cursor: pointer; display: flex; align-items: center;
  &:hover { background: var(--bulma-scheme-main-bis); }
}

.split-icon-col, .split-icon-row {
  display: flex; gap: 2px;
  span { display: block; width: 6px; height: 6px; background: var(--bulma-text-light); border-radius: 1px; }
}
.split-icon-row { flex-direction: column; }

.pane-body {
  flex: 1; overflow: hidden;
}

.pane-content {
  height: 100%; overflow: hidden;
}

.pane-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; opacity: 0.4; gap: 0.5rem;
}
.pane-empty-icon { opacity: 0.3; }
</style>
