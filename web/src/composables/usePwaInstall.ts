import { ref, onMounted } from 'vue';

const deferredPrompt = ref(null);
const showInstall = ref(false);
const isInstalled = ref(false);

export function usePwaInstall() {
  onMounted(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      isInstalled.value = true;
      return;
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt.value = e;
      showInstall.value = true;
    });
    window.addEventListener('appinstalled', () => {
      isInstalled.value = true;
      showInstall.value = false;
    });
  });

  async function promptInstall() {
    const prompt = deferredPrompt.value;
    if (!prompt) return;
    prompt.prompt();
    const result = await prompt.userChoice;
    if (result.outcome === 'accepted') {
      isInstalled.value = true;
      showInstall.value = false;
    }
    deferredPrompt.value = null;
  }

  function dismissInstall() {
    showInstall.value = false;
  }

  return { showInstall, isInstalled, promptInstall, dismissInstall };
}
