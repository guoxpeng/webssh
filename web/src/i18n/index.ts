import { createI18n } from 'vue-i18n';
import enUS from '@/locales/en-US';
import zhCN from '@/locales/zh-CN';

const defaultLocale = localStorage.getItem('appLocale') || (navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US');

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
  i18n.global.locale.value = locale;
  localStorage.setItem('appLocale', locale);
}

export function getLocale(): string {
  return i18n.global.locale.value as string;
}
