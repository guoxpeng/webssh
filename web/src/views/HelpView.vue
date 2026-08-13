<template>
  <div class="page-view">
    <header class="page-head">
      <h1 class="page-title"><LifeBuoyIcon :size="20"/> {{ t('help.title') }}</h1>
      <p class="page-desc">{{ t('help.desc') }}</p>
    </header>

    <section class="help-card">
      <h3 class="help-h"><MonitorSmartphoneIcon :size="15"/> {{ t('help.modesTitle') }}</h3>
      <ul class="help-list">
        <li><b>{{ t('help.modeBuiltin') }}</b> — {{ t('help.modeBuiltinDesc') }}</li>
        <li><b>{{ t('help.modeGateway') }}</b> — {{ t('help.modeGatewayDesc') }}</li>
        <li><b>{{ t('help.modeCloud') }}</b> — {{ t('help.modeCloudDesc') }}</li>
      </ul>
    </section>

    <section class="help-card">
      <h3 class="help-h"><BookOpenIcon :size="15"/> {{ t('help.docsTitle') }}</h3>
      <ul class="help-list">
        <li><code>README.md</code> — {{ t('help.docReadme') }}</li>
        <li><code>REMOTE-ACCESS.md</code> — {{ t('help.docRemote') }}</li>
        <li><code>SECURITY.md</code> — {{ t('help.docSecurity') }}</li>
        <li><code>IOS-SIGNING.md</code> — {{ t('help.docIos') }}</li>
      </ul>
    </section>

    <section class="help-card">
      <h3 class="help-h"><MessageSquareIcon :size="15"/> {{ t('help.feedbackTitle') }}</h3>
      <p class="help-p">{{ t('help.feedbackDesc') }}</p>
      <a class="help-link" href="https://github.com/guoxpeng/webssh/issues" target="_blank" rel="noopener">
        GitHub Issues →
      </a>
    </section>

    <p class="help-version">WebSSH · {{ t('help.openSource') }}</p>
  </div>
</template>

<script setup>
import { LifeBuoy as LifeBuoyIcon, MonitorSmartphone as MonitorSmartphoneIcon, BookOpen as BookOpenIcon, MessageSquare as MessageSquareIcon } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
</script>

<style scoped>
.page-view { max-width: 900px; margin: 0 auto; padding: 32px 24px 80px; }
.page-head { margin-bottom: 22px; }
.page-title { display: flex; align-items: center; gap: 9px; font-size: 19px; font-weight: 600; color: var(--app-text); letter-spacing: .2px; }
.page-desc { margin-top: 6px; font-size: 13px; color: var(--app-text-dim); }
.help-card { background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 12px; padding: 18px 20px; margin-bottom: 14px; }
.help-h { display: flex; align-items: center; gap: 8px; font-size: 14.5px; font-weight: 600; color: var(--app-text); margin-bottom: 10px; }
.help-list { margin: 0; padding-left: 4px; display: flex; flex-direction: column; gap: 7px; font-size: 13px; color: var(--app-text-dim); list-style: none; }
.help-list b { color: var(--app-text); font-weight: 500; }
.help-list code { font-size: 12px; background: var(--app-surface-hover); padding: 1px 6px; border-radius: 5px; }
.help-p { font-size: 13px; color: var(--app-text-dim); margin: 0 0 10px; }
.help-link { font-size: 13px; color: var(--bulma-primary); text-decoration: none; }
.help-link:hover { text-decoration: underline; }
.help-version { text-align: center; font-size: 12px; color: var(--app-text-dim); opacity: .7; margin-top: 28px; }
</style>
