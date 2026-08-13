import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.webssh.app',
  appName: 'WebSSH',
  // vite.config.mjs outputs the built frontend to dist/client
  webDir: 'dist/client',
  server: {
    // androidScheme https is safe: Capacitor's Bridge.java sets
    // MIXED_CONTENT_ALWAYS_ALLOW, so http/ws backends still work.
    androidScheme: 'https',
    // NOTE: no iosScheme here on purpose. 'https' would make WKWebView
    // hard-block mixed content (ws:// or http:// backends from an https
    // origin) with no opt-out. The default capacitor:// scheme is a
    // trusted scheme and does not trigger mixed-content blocking.

  },
  ios: {
    contentInset: 'always',
    preferredContentMode: 'mobile',
    backgroundColor: '#0f172a',
  },
  android: {
    backgroundColor: '#0f172a',
  },
  plugins: {
    Keyboard: {
      resize: 'body',
      style: 'DARK',
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#6366f1',
    },
  },
};

export default config;
