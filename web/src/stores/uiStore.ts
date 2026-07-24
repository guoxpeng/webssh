import { defineStore } from 'pinia';
import { ref } from 'vue';

interface ThemePreset {
  label: string;
  colors: Record<string, string>;
}

const THEME_PRESETS: Record<string, ThemePreset> = {
  light: {
    label: 'Light',
    colors: {
      '--bulma-scheme-h': '221',
      '--bulma-scheme-s': '14%',
      '--bulma-scheme-main-l': '100%',
      '--bulma-body-background-color': '#f5f6fa',
      '--bulma-scheme-main': '#ffffff',
      '--bulma-text': 'hsl(235, 15%, 23%)',
      '--bulma-text-light': 'hsl(235, 12%, 40%)',
      '--bulma-text-strong': 'hsl(235, 20%, 15%)',
      '--bulma-background': '#f8f9fc',
      '--bulma-border': 'hsl(225, 15%, 86%)',
      '--bulma-border-light': 'hsl(225, 20%, 93%)',
      '--bulma-scheme-main-bis': 'hsl(225, 25%, 97%)',
      '--bulma-scheme-main-ter': 'hsl(225, 20%, 95%)',
      '--bulma-box-background-color': 'rgba(255,255,255,0.85)',
      '--bulma-card-background-color': 'rgba(255,255,255,0.85)',
      '--bulma-input-background-color': 'white',
      '--bulma-input-border-color': 'hsl(225, 15%, 86%)',
    },
  },
  dark: {
    label: 'Dark',
    colors: {
      '--bulma-scheme-h': '240',
      '--bulma-scheme-s': '12%',
      '--bulma-scheme-main-l': '14%',
      '--bulma-body-background-color': 'hsl(240, 15%, 8%)',
      '--bulma-scheme-main': 'hsl(240, 12%, 14%)',
      '--bulma-text': 'hsl(225, 15%, 88%)',
      '--bulma-text-light': 'hsl(225, 10%, 62%)',
      '--bulma-text-strong': 'hsl(225, 15%, 95%)',
      '--bulma-background': 'hsl(240, 15%, 8%)',
      '--bulma-border': 'hsl(240, 10%, 25%)',
      '--bulma-border-light': 'hsl(240, 10%, 18%)',
      '--bulma-scheme-main-bis': 'hsl(240, 12%, 13%)',
      '--bulma-scheme-main-ter': 'hsl(240, 10%, 11%)',
      '--bulma-box-background-color': 'rgba(20,20,30,0.75)',
      '--bulma-card-background-color': 'rgba(20,20,30,0.75)',
      '--bulma-input-background-color': 'hsl(240, 10%, 16%)',
      '--bulma-input-border-color': 'hsl(240, 10%, 25%)',
    },
  },
  dracula: {
    label: 'Dracula',
    colors: {
      '--bulma-scheme-h': '231',
      '--bulma-scheme-s': '15%',
      '--bulma-scheme-main-l': '18%',
      '--bulma-body-background-color': '#1a1b26',
      '--bulma-scheme-main': '#282a36',
      '--bulma-text': '#f8f8f2',
      '--bulma-text-light': '#6272a4',
      '--bulma-text-strong': '#ffffff',
      '--bulma-background': '#1a1b26',
      '--bulma-primary': '#bd93f9',
      '--bulma-link': '#8be9fd',
      '--bulma-success': '#50fa7b',
      '--bulma-warning': '#ffb86c',
      '--bulma-danger': '#ff5555',
      '--bulma-info': '#8be9fd',
      '--bulma-border': '#44475a',
      '--bulma-border-light': '#383a4a',
      '--bulma-scheme-main-bis': '#21222c',
      '--bulma-scheme-main-ter': '#1c1d26',
      '--bulma-box-background-color': 'rgba(40,42,54,0.85)',
      '--bulma-card-background-color': 'rgba(40,42,54,0.85)',
      '--bulma-input-background-color': '#1c1d26',
      '--bulma-input-border-color': '#44475a',
    },
  },
  nord: {
    label: 'Nord',
    colors: {
      '--bulma-scheme-h': '220',
      '--bulma-scheme-s': '16%',
      '--bulma-scheme-main-l': '23%',
      '--bulma-body-background-color': '#242933',
      '--bulma-scheme-main': '#2e3440',
      '--bulma-text': '#d8dee9',
      '--bulma-text-light': '#81a1c1',
      '--bulma-text-strong': '#eceff4',
      '--bulma-background': '#242933',
      '--bulma-primary': '#88c0d0',
      '--bulma-link': '#81a1c1',
      '--bulma-success': '#a3be8c',
      '--bulma-warning': '#ebcb8b',
      '--bulma-danger': '#bf616a',
      '--bulma-info': '#88c0d0',
      '--bulma-border': '#434c5e',
      '--bulma-border-light': '#3b4252',
      '--bulma-scheme-main-bis': '#3b4252',
      '--bulma-scheme-main-ter': '#313745',
      '--bulma-box-background-color': 'rgba(46,52,64,0.85)',
      '--bulma-card-background-color': 'rgba(46,52,64,0.85)',
      '--bulma-input-background-color': '#313745',
      '--bulma-input-border-color': '#434c5e',
    },
  },
};

export function applyThemePreset(presetId: string): void {
  const preset = THEME_PRESETS[presetId];
  if (!preset) return;
  const root = document.documentElement;
  const isDark = presetId === 'dark' || presetId === 'dracula' || presetId === 'nord';
  root.classList.toggle('is-dark-mode', isDark);
  root.style.setProperty('color-scheme', isDark ? 'dark' : 'light');

  for (const [key, value] of Object.entries(preset.colors)) {
    root.style.setProperty(key, value);
  }

  root.style.setProperty('--theme-primary', presetId === 'light' ? '#6366f1' : '#818cf8');
  (window as any).__themePreset = presetId;
}

interface Notification {
  id: number;
  message: string;
  type: string;
  duration: number;
}

export const useUiStore = defineStore('ui', () => {
  const currentTheme = ref<string>(localStorage.getItem('appTheme') || 'light');
  const currentPreset = ref<string>(localStorage.getItem('appThemePreset') || 'light');
  const notifications = ref<Notification[]>([]);
  let notificationIdCounter = 0;

  function initializeTheme(): void {
    const saved = localStorage.getItem('appThemePreset');
    if (saved && THEME_PRESETS[saved]) {
      currentPreset.value = saved;
      currentTheme.value = (saved === 'light') ? 'light' : 'dark';
    } else if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      currentPreset.value = 'dark';
      currentTheme.value = 'dark';
    }
    applyThemePreset(currentPreset.value);
  }

  function setThemePreset(presetId: string): void {
    if (!THEME_PRESETS[presetId]) return;
    currentPreset.value = presetId;
    currentTheme.value = (presetId === 'light') ? 'light' : 'dark';
    localStorage.setItem('appThemePreset', presetId);
    localStorage.setItem('appTheme', currentTheme.value);
    applyThemePreset(presetId);
  }

  function toggleTheme(): void {
    setThemePreset(currentTheme.value === 'light' ? 'dark' : 'light');
  }

  function addNotification({ message, type = 'info', duration = 5000 }: { message: string; type?: string; duration?: number }): void {
    const id = notificationIdCounter++;
    notifications.value.push({ id, message, type, duration });
    if (duration > 0) {
      setTimeout(() => removeNotification(id), duration);
    }
  }

  function removeNotification(id: number): void {
    notifications.value = notifications.value.filter(n => n.id !== id);
  }

  return {
    currentTheme, currentPreset, notifications,
    initializeTheme, setThemePreset, toggleTheme, addNotification, removeNotification,
  };
});
