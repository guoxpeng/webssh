<template>
  <div class="tunnel-manager">
    <div class="tunnel-header">
      <h4 class="tunnel-title"><GitBranch :size="16"/> {{ t('tunnel.title') }}</h4>
      <button class="button is-small is-primary" @click="showForm = true">{{ t('tunnel.newTunnel') }}</button>
    </div>

    <div v-if="showForm" class="tunnel-form">
      <div class="field">
        <label class="label is-small">{{ t('tunnel.type') }}</label>
        <div class="select is-small is-fullwidth">
          <select v-model="form.type">
            <option value="local">{{ t('tunnel.local') }}</option>
            <option value="remote">{{ t('tunnel.remote') }}</option>
            <option value="dynamic">{{ t('tunnel.dynamic') }}</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label class="label is-small">{{ form.type === 'local' ? t('tunnel.localPort') : t('tunnel.bindPort') }}</label>
        <input class="input is-small" type="number" v-model.number="form.bindPort" placeholder="8080"/>
      </div>
      <template v-if="form.type !== 'dynamic'">
        <div class="field">
          <label class="label is-small">{{ t('tunnel.targetHost') }}</label>
          <input class="input is-small" v-model="form.targetHost" placeholder="localhost"/>
        </div>
        <div class="field">
          <label class="label is-small">{{ t('tunnel.targetPort') }}</label>
          <input class="input is-small" type="number" v-model.number="form.targetPort" placeholder="3306"/>
        </div>
      </template>
      <div class="field is-grouped is-grouped-right">
        <button class="button is-small" @click="showForm = false">{{ t('tunnel.cancel') }}</button>
        <button class="button is-small is-primary" @click="createTunnel">{{ t('tunnel.create') }}</button>
      </div>
    </div>

    <div class="tunnel-list" v-if="tunnels.length > 0">
      <div v-for="tun in tunnels" :key="tun.id" class="tunnel-item">
        <div class="tunnel-info">
          <span class="tunnel-type" :class="`is-${tun.type}`">{{ typeLabel(tun.type) }}</span>
          <span class="tunnel-desc">{{ tun.bindPort }} → {{ tun.targetHost }}:{{ tun.targetPort }}</span>
        </div>
        <div class="tunnel-status">
          <span class="status-dot" :class="`is-${tun.status}`"></span>
          <button class="button is-small is-text" @click="deleteTunnel(tun.id)" title="Delete tunnel">&times;</button>
        </div>
      </div>
    </div>
    <div v-else class="tunnel-empty">
      <p class="is-size-7 has-text-grey">No tunnels configured</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { GitBranch } from 'lucide-vue-next';

const tunnels = ref([]);
const showForm = ref(false);
const form = ref({ type: 'local', bindPort: 8080, targetHost: 'localhost', targetPort: 3306 });

function typeLabel(type) {
  return { local: '-L', remote: '-R', dynamic: '-D' }[type] || type;
}

function createTunnel() {
  tunnels.value.push({
    id: `tun-${Date.now()}`,
    type: form.value.type,
    bindPort: form.value.bindPort,
    targetHost: form.value.targetHost,
    targetPort: form.value.targetPort,
    status: 'active',
  });
  showForm.value = false;
}

function deleteTunnel(id) {
  tunnels.value = tunnels.value.filter(t => t.id !== id);
}
</script>

<style lang="scss" scoped>
.tunnel-manager {
  padding: 0.5rem;
  border-left: 1px solid var(--bulma-border-light);
  background: var(--bulma-scheme-main-bis);
  min-width: 260px;
  overflow-y: auto;
}

.tunnel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.tunnel-title {
  font-size: 0.8em;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.tunnel-form {
  background: var(--bulma-box-background-color);
  padding: 0.5rem;
  border-radius: 8px;
  margin-bottom: 0.5rem;
  .field { margin-bottom: 0.35rem; }
  .label { font-size: 0.7em; }
}

.tunnel-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  font-size: 0.8em;
  &:hover { background: var(--bulma-scheme-main-ter); }
}

.tunnel-info {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.tunnel-type {
  font-size: 0.7em;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  &.is-local { background: hsl(155, 30%, 92%); color: hsl(155, 55%, 30%); }
  &.is-remote { background: hsl(40, 30%, 92%); color: hsl(40, 55%, 30%); }
  &.is-dynamic { background: hsl(210, 30%, 92%); color: hsl(210, 55%, 30%); }
}

.tunnel-desc {
  font-family: var(--bulma-family-monospace);
  font-size: 0.9em;
  color: var(--bulma-text);
}

.tunnel-status {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.status-dot {
  width: 6px; height: 6px; border-radius: 50%;
  &.is-active { background: var(--bulma-success); }
  &.is-error { background: var(--bulma-danger); }
}

.tunnel-empty {
  padding: 1rem;
  text-align: center;
}
</style>
