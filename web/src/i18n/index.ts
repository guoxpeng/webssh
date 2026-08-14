import { createI18n } from 'vue-i18n';
import enUS from '@/locales/en-US';
import zhCN from '@/locales/zh-CN';
import { storageGet, storageSet } from '@/utils/storage';

const defaultLocale = storageGet('locale') || (navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US');

export const i18n = createI18n({
  legacy: false,
  locale: defaultLocale,
  fallbackLocale: 'en-US',
  messages: {
    'en-US': enUS,
    'zh-CN': zhCN,
  },
});

export function setLocale(locale: string) {
  i18n.global.locale.value = locale as 'zh-CN' | 'en-US';
  storageSet('locale', locale);
}

