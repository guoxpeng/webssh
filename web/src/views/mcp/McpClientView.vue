<template>
  <div class="page-view">
    <header class="page-head">
      <div class="head-row">
        <div>
          <h1 class="page-title"><BlocksIcon :size="20"/> {{ t('mcp.clientTitle') }}</h1>
          <p class="page-desc">{{ t('mcp.clientDesc') }}</p>
        </div>
        <div class="head-actions">
          <button class="pw-btn minor" @click="showImport = true">
            <FileJsonIcon :size="13"/> {{ t('mcp.importJson') }}
          </button>
          <button class="pw-btn primary" @click="openForm(null)">
            <PlusIcon :size="13"/> {{ t('mcp.addClient') }}
          </button>
        </div>
      </div>
    </header>

    <div class="client-list" v-if="store.clients.length">
      <div class="client-card" v-for="c in store.clients" :key="c.id" :class="{ 'is-disabled': !c.enabled }">
        <div class="client-head">
          <div class="client-id">
            <span class="client-name">{{ c.name }}</span>
            <span class="transport-badge">{{ c.transport === 'stdio' ? t('mcp.stdio') : t('mcp.sse') }}</span>
            <span class="status-badge" :class="statusClass(c)">
              <span class="status-dot"></span>{{ statusLabel(c) }}
            </span>
          </div>
          <div class="client-actions">
            <button class="switch" :class="{ 'is-active': c.enabled }" @click="toggle(c.id)"
                    :title="c.enabled ? t('common.on') : t('common.off')">
              <span class="switch-slider"></span>
            </button>
            <button class="icon-btn" :disabled="testingId === c.id" @click="test(c.id)" :title="t('mcp.test')">
              <RefreshCwIcon :size="15" :class="{ spin: testingId === c.id }"/>
            </button>
            <button class="icon-btn" @click="openForm(c)" :title="t('mcp.edit')">
              <PencilIcon :size="15"/>
            </button>
            <button class="icon-btn is-danger" @click="confirmDelete(c)" :title="t('mcp.delete')">
              <Trash2Icon :size="15"/>
            </button>
          </div>
        </div>

        <div class="client-meta">
          <code class="client-endpoint">{{ endpointOf(c) }}</code>
          <span v-if="c.toolCount != null" class="tool-count">{{ t('mcp.toolCount', { count: c.toolCount }) }}</span>
          <button class="link-btn" @click="expandedId = expandedId === c.id ? null : c.id">
            {{ expandedId === c.id ? t('common.collapse') : t('mcp.tools') }}
            <ChevronDownIcon :size="13" :class="{ 'is-open': expandedId === c.id }"/>
          </button>
        </div>

        <div class="client-error" v-if="c.lastError && c.lastStatus === 'disconnected'">
          <AlertTriangleIcon :size="13"/> {{ c.lastError }}
        </div>

        <div class="client-tools" v-if="expandedId === c.id">
          <div class="tool-empty" v-if="!c.tools || c.tools.length === 0">{{ t('mcp.noTools') }}</div>
          <div class="tool-item" v-for="tool in c.tools" :key="tool.name">
            <div class="tool-main">
              <code class="tool-name">{{ tool.name }}</code>
              <span class="tool-desc" v-if="tool.description">{{ tool.description }}</span>
            </div>
            <button class="icon-btn is-primary" @click="openCall(c, tool)" :title="t('mcp.run')">
              <PlayIcon :size="14"/>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="page-empty" v-else>
      <BlocksIcon :size="38" class="empty-icon"/>
      <p>{{ t('mcp.noClients') }}</p>
    </div>

    <!-- Add / edit form modal -->
    <div class="modal-overlay" v-if="showForm" @click.self="showForm = false">
      <div class="modal-body" style="width: 480px;">
        <div class="modal-header">
          <span>{{ editingId ? t('mcp.edit') : t('mcp.addClient') }}</span>
          <button class="modal-close" @click="showForm = false">&times;</button>
        </div>

        <input class="form-input" v-model="form.name" :placeholder="t('mcp.name')"/>
        <select class="form-select" v-model="form.transport" style="width: 100%;">
          <option value="stdio">{{ t('mcp.stdio') }}</option>
          <option value="sse">{{ t('mcp.sse') }}</option>
        </select>

        <template v-if="form.transport === 'stdio'">
          <input class="form-input" v-model="form.command" :placeholder="t('mcp.commandPlaceholder')"/>
          <textarea class="form-textarea" v-model="form.argsText" rows="2" :placeholder="t('mcp.argsHint')"></textarea>
          <textarea class="form-textarea" v-model="form.envText" rows="2" :placeholder="t('mcp.envHint')"></textarea>
        </template>
        <template v-else>
          <input class="form-input" v-model="form.url" :placeholder="t('mcp.urlPlaceholder')"/>
          <textarea class="form-textarea" v-model="form.headersText" rows="2" :placeholder="t('mcp.headersHint')"></textarea>
        </template>

        <label class="toggle-label">
          <input type="checkbox" v-model="form.enabled"/> {{ t('mcp.enabled') }}
        </label>

        <div class="modal-actions">
          <button class="modal-btn" @click="showForm = false">{{ t('common.cancel') }}</button>
          <button class="modal-btn is-primary" @click="save">{{ t('mcp.save') }}</button>
        </div>
      </div>
    </div>

    <!-- Import JSON modal -->
    <div class="modal-overlay" v-if="showImport" @click.self="showImport = false">
      <div class="modal-body" style="width: 480px;">
        <div class="modal-header">
          <span>{{ t('mcp.importJson') }}</span>
          <button class="modal-close" @click="showImport = false">&times;</button>
        </div>
        <p class="info-text">{{ t('mcp.importPlaceholder') }}</p>
        <textarea class="form-textarea" v-model="importText" rows="8"></textarea>
        <div class="modal-actions">
          <button class="modal-btn" @click="showImport = false">{{ t('common.cancel') }}</button>
          <button class="modal-btn is-primary" @click="doImport">{{ t('mcp.importBtn') }}</button>
        </div>
      </div>
    </div>

    <!-- Call tool modal -->
    <div class="modal-overlay" v-if="callTarget" @click.self="callTarget = null">
      <div class="modal-body" style="width: 520px;">
        <div class="modal-header">
          <span><code style="font-size: .85em;">{{ callTarget.tool.name }}</code></span>
          <button class="modal-close" @click="callTarget = null">&times;</button>
        </div>
        <p class="info-text">{{ t('mcp.argsLabel') }}</p>
        <textarea class="form-textarea" v-model="callArgs" rows="5" placeholder="{}"></textarea>
        <div class="modal-actions">
          <button class="modal-btn" @click="callTarget = null">{{ t('common.cancel') }}</button>
          <button class="modal-btn is-primary" :disabled="callLoading" @click="runCall">
            <span v-if="callLoading" class="loading-spinner"></span>
            <PlayIcon v-else :size="13"/>
            {{ t('mcp.run') }}
          </button>
        </div>
        <div class="call-result" v-if="callResult !== '' || callError">
          <div class="call-result-head">{{ t('mcp.callResult') }}</div>
          <pre class="call-result-pre" :class="{ 'is-err': callError }">{{ callError || callResult }}</pre>
        </div>
      </div>
    </div>

    <!-- Delete confirm modal -->
    <div class="modal-overlay" v-if="deleteTarget" @click.self="deleteTarget = null">
      <div class="modal-body">
        <div class="modal-header">
          <span>{{ t('mcp.delete') }}</span>
          <button class="modal-close" @click="deleteTarget = null">&times;</button>
        </div>
        <p class="info-text">{{ t('mcp.deleteConfirm', { name: deleteTarget.name }) }}</p>
        <div class="modal-actions">
          <button class="modal-btn" @click="deleteTarget = null">{{ t('common.cancel') }}</button>
          <button class="modal-btn is-danger" @click="doDelete">{{ t('common.confirm') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Blocks as BlocksIcon, Plus as PlusIcon, RefreshCw as RefreshCwIcon, Pencil as PencilIcon, Trash2 as Trash2Icon, ChevronDown as ChevronDownIcon, Play as PlayIcon, AlertTriangle as AlertTriangleIcon, FileJson as FileJsonIcon } from 'lucide-vue-next';
import { useMcpStore } from '@/stores/mcpStore';
import { useNotifications } from '@/composables/useNotifications';

const { t } = useI18n();
const { showSuccess, showError } = useNotifications();
const store = useMcpStore();

const showForm = ref(false);
const showImport = ref(false);
const importText = ref('');
const editingId = ref(null);
const expandedId = ref(null);
const testingId = ref(null);
const deleteTarget = ref(null);
const callTarget = ref(null);
const callArgs = ref('{}');
const callResult = ref('');
const callError = ref('');
const callLoading = ref(false);

const blankForm = () => ({
  name: '',
  transport: 'stdio',
  command: '',
  argsText: '',
  url: '',
  envText: '',
  headersText: '',
  enabled: true,
});
const form = reactive(blankForm());

function linesToArr(text) {
  return String(text || '').split('\n').map((s) => s.trim()).filter(Boolean);
}
function textToMap(text) {
  const map = {};
  for (const line of linesToArr(text)) {
    const idx = line.indexOf('=');
    if (idx > 0) map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return Object.keys(map).length ? map : undefined;
}
function mapToText(map) {
  if (!map || typeof map !== 'object') return '';
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('\n');
}
function endpointOf(c) {
  if (c.transport === 'stdio') {
    const args = Array.isArray(c.args) && c.args.length ? ' ' + c.args.join(' ') : '';
    return `${c.command || '?'}${args}`;
  }
  return c.url || '';
}

function statusClass(c) {
  if (c.lastStatus === 'connected') return 'ok';
  if (c.lastStatus === 'disconnected') return 'bad';
  return 'untested';
}
function statusLabel(c) {
  if (c.lastStatus === 'connected') return t('mcp.connected');
  if (c.lastStatus === 'disconnected') return t('mcp.disconnected');
  return t('mcp.untested');
}

function openForm(client) {
  if (client) {
    Object.assign(form, {
      name: client.name,
      transport: client.transport,
      command: client.command || '',
      argsText: Array.isArray(client.args) ? client.args.join('\n') : '',
      url: client.url || '',
      envText: mapToText(client.env),
      headersText: mapToText(client.headers),
      enabled: client.enabled,
    });
    editingId.value = client.id;
  } else {
    Object.assign(form, blankForm());
    editingId.value = null;
  }
  showForm.value = true;
}

function save() {
  const name = form.name.trim();
  if (!name) { showError(t('mcp.nameRequired')); return; }
  if (form.transport === 'stdio' && !form.command.trim()) { showError(t('mcp.commandRequired')); return; }
  if (form.transport === 'sse' && !form.url.trim()) { showError(t('mcp.urlRequired')); return; }
  const data = {
    name,
    transport: form.transport,
    command: form.command.trim(),
    args: linesToArr(form.argsText),
    url: form.url.trim(),
    env: textToMap(form.envText),
    headers: textToMap(form.headersText),
    enabled: form.enabled,
  };
  if (editingId.value) {
    store.updateClient(editingId.value, data);
  } else {
    store.addClient({ ...data, lastStatus: 'untested' });
  }
  showSuccess(t('mcp.saved'));
  showForm.value = false;
}

function toggle(id) {
  const c = store.clients.find((x) => x.id === id);
  if (c) store.updateClient(id, { enabled: !c.enabled });
}

async function test(id) {
  const c = store.clients.find((x) => x.id === id);
  if (!c || testingId.value) return;
  testingId.value = id;
  try {
    const r = await store.testClient(c);
    if (r.ok) {
      store.updateClient(id, { lastStatus: 'connected', toolCount: r.tools.length, tools: r.tools, lastError: '', lastChecked: Date.now() });
      showSuccess(t('mcp.testOk', { count: r.tools.length }));
    } else {
      store.updateClient(id, { lastStatus: 'disconnected', lastError: r.error || '', lastChecked: Date.now() });
      showError(t('mcp.testFailed', { error: r.error || '' }));
    }
  } finally {
    testingId.value = null;
  }
}

function confirmDelete(c) { deleteTarget.value = c; }
function doDelete() {
  if (deleteTarget.value) {
    store.removeClient(deleteTarget.value.id);
    showSuccess(t('mcp.removed'));
  }
  deleteTarget.value = null;
}

function doImport() {
  const n = store.importClients(importText.value);
  if (n > 0) {
    showSuccess(t('mcp.imported', { count: n }));
    showImport.value = false;
    importText.value = '';
  } else {
    showError(t('mcp.importFailed'));
  }
}

function openCall(client, tool) {
  callTarget.value = { client, tool };
  callArgs.value = '{}';
  callResult.value = '';
  callError.value = '';
}

async function runCall() {
  let args;
  try { args = JSON.parse(callArgs.value || '{}'); } catch { showError(t('mcp.invalidJson')); return; }
  callLoading.value = true;
  callError.value = '';
  callResult.value = '';
  try {
    const r = await store.callTool(callTarget.value.client, callTarget.value.tool.name, args);
    if (r.success) callResult.value = r.result ?? '';
    else callError.value = r.error || 'Failed';
  } catch (e) {
    callError.value = e.message;
  } finally {
    callLoading.value = false;
  }
}
</script>

<style scoped>
.page-view { max-width: 900px; margin: 0 auto; padding: 32px 24px 80px; }
.page-head { margin-bottom: 22px; }
.head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.page-title { display: flex; align-items: center; gap: 9px; font-size: 19px; font-weight: 600; color: var(--app-text); letter-spacing: .2px; }
.page-desc { margin-top: 6px; font-size: 13px; color: var(--app-text-dim); }
.head-actions { display: flex; gap: 8px; flex: none; }
.page-empty { text-align: center; padding: 70px 0; color: var(--app-text-dim); font-size: 14px; }
.empty-icon { opacity: .35; margin-bottom: 12px; }

.pw-btn { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; padding: 7px 14px; border-radius: 8px; border: 1px solid var(--app-border); background: var(--app-surface); color: var(--app-text-dim); cursor: pointer; }
.pw-btn:hover { background: var(--app-surface-hover); color: var(--app-text); }
.pw-btn.primary { background: linear-gradient(135deg, var(--bulma-primary), var(--bulma-link, var(--bulma-primary))); border: none; color: white; }
.pw-btn.primary:hover { box-shadow: 0 3px 10px rgba(99, 102, 241, 0.3); }

.client-list { display: flex; flex-direction: column; gap: 12px; }
.client-card { background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 12px; padding: 14px 16px; transition: opacity .15s; }
.client-card.is-disabled { opacity: .6; }
.client-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.client-id { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.client-name { font-size: 14px; font-weight: 600; color: var(--app-text); }
.transport-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: var(--app-surface-hover); color: var(--app-text-dim); text-transform: uppercase; letter-spacing: .04em; }
.client-actions { display: flex; align-items: center; gap: 6px; flex: none; }

.status-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; padding: 3px 10px; border-radius: 999px; }
.status-badge .status-dot { width: 7px; height: 7px; border-radius: 50%; }
.status-badge.ok { background: rgba(34, 197, 94, .12); color: #22c55e; }
.status-badge.ok .status-dot { background: #22c55e; }
.status-badge.bad { background: rgba(239, 68, 68, .12); color: #ef4444; }
.status-badge.bad .status-dot { background: #ef4444; }
.status-badge.untested { background: var(--app-surface-hover); color: var(--app-text-dim); }
.status-badge.untested .status-dot { background: var(--app-text-dim); }

.switch { position: relative; width: 38px; height: 22px; flex-shrink: 0; border-radius: 11px; background: var(--app-border); border: none; cursor: pointer; padding: 0; transition: background .2s; }
.switch.is-active { background: var(--bulma-primary); }
.switch-slider { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--app-surface); box-shadow: 0 1px 3px rgba(0,0,0,.15); transition: transform .2s cubic-bezier(.34,1.56,.64,1); }
.switch.is-active .switch-slider { transform: translateX(16px); }

.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; background: none; border: none; border-radius: 7px; color: var(--app-text-dim); cursor: pointer; transition: background .12s, color .12s; }
.icon-btn:hover:not(:disabled) { background: var(--app-surface-hover); color: var(--app-text); }
.icon-btn:disabled { opacity: .4; cursor: not-allowed; }
.icon-btn.is-danger:hover:not(:disabled) { color: #ef4444; }
.icon-btn.is-primary:hover:not(:disabled) { color: var(--bulma-primary); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.client-meta { display: flex; align-items: center; gap: 12px; margin-top: 8px; font-size: 12px; }
.client-endpoint { font-family: var(--bulma-family-monospace); font-size: 12px; color: var(--app-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.tool-count { color: var(--app-text-dim); flex: none; }
.link-btn { display: inline-flex; align-items: center; gap: 3px; background: none; border: none; color: var(--bulma-primary); font-size: 12px; cursor: pointer; padding: 0; }
.link-btn svg { transition: transform .15s; }
.link-btn svg.is-open { transform: rotate(180deg); }

.client-error { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 12px; color: #ef4444; }

.client-tools { margin-top: 10px; border-top: 1px solid var(--app-border); padding-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.tool-empty { font-size: 12.5px; color: var(--app-text-dim); padding: 6px 2px; }
.tool-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--app-border); border-radius: 8px; }
.tool-main { flex: 1; min-width: 0; }
.tool-name { font-family: var(--bulma-family-monospace); font-size: 12.5px; color: var(--bulma-primary); }
.tool-desc { display: block; font-size: 12px; color: var(--app-text-dim); margin-top: 2px; }

.call-result { border-top: 1px solid var(--app-border); padding-top: 10px; }
.call-result-head { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--app-text-dim); font-weight: 700; margin-bottom: 6px; }
.call-result-pre { margin: 0; padding: 10px; background: var(--app-surface-hover); border-radius: 8px; font-family: var(--bulma-family-monospace); font-size: 12px; white-space: pre-wrap; word-break: break-all; color: var(--app-text); max-height: 240px; overflow-y: auto; }
.call-result-pre.is-err { color: #ef4444; }
</style>
