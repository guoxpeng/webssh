const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onQuickConnect: (callback) => ipcRenderer.on('quick-connect', () => callback()),
  onCloseTab: (callback) => ipcRenderer.on('close-tab', () => callback()),
  getPlatform: () => process.platform,
});
