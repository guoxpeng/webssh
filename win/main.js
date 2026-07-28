const { app, dialog, Menu, Tray, shell } = require('electron');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { pathToFileURL } = require('url');

let tray = null;
let httpServer = null;
const PORT = 9627;

app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-default-apps');
app.commandLine.appendSwitch('disable-extensions');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess,AudioServiceSandbox,NetworkService,TranslateService,TranslateUI,AutofillServerCommunication,MediaRouter,OptimizationHints,BackForwardCache');
app.commandLine.appendSwitch('single-process');

app.disableHardwareAcceleration();

function waitForPort(port, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const s = new net.Socket();
      s.connect(port, '127.0.0.1', () => { s.destroy(); resolve(); });
      s.on('error', () => {
        if (Date.now() - start > timeout) reject(new Error(`Port ${port} timeout`));
        else setTimeout(check, 300);
      });
    };
    check();
  });
}

app.whenReady().then(async () => {
  if (!app.userAgentFallback.includes('Electron')) {
    app.userAgentFallback += ' Electron';
  }

  const serverPath = path.join(process.resourcesPath, 'core', 'server', 'index.mjs');
  if (!fs.existsSync(serverPath)) {
    dialog.showErrorBox('File Missing', `core/server/index.mjs not found.\n\nExpected: ${serverPath}`);
    app.quit();
    return;
  }

  process.env.PORT = String(PORT);
  process.env.NODE_ENV = 'production';

  try {
    const serverUrl = pathToFileURL(serverPath).href;
    const mod = await import(serverUrl);
    httpServer = mod.server || null;
  } catch (err) {
    dialog.showErrorBox('Server Error', `Failed to start server:\nPath: ${serverPath}\nError: ${err.message}`);
    app.quit();
    return;
  }

  try {
    await waitForPort(PORT);
  } catch (err) {
    dialog.showErrorBox('Startup Failed', `Timeout: ${err.message}`);
    app.quit();
    return;
  }

  const trayIcon = path.join(process.resourcesPath, 'icon.ico');
  if (fs.existsSync(trayIcon)) {
    tray = new Tray(trayIcon);
    tray.setToolTip('WebSSH');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open', click: () => shell.openExternal(`http://localhost:${PORT}`) },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]));
    tray.on('double-click', () => shell.openExternal(`http://localhost:${PORT}`));
  }

  shell.openExternal(`http://localhost:${PORT}`);
  app.dock?.hide?.();
}).catch(err => {
  dialog.showErrorBox('Startup Error', err.message);
  app.quit();
});

function cleanupPort(port) {
  try {
    if (process.platform === 'win32') {
      execSync(`powershell -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"`, { stdio: 'ignore', timeout: 3000 });
    }
  } catch {}
}

function cleanup() {
  if (httpServer) {
    try { httpServer.close(); } catch {}
    httpServer = null;
  }
  cleanupPort(PORT);
}

app.on('before-quit', () => cleanup());
app.on('window-all-closed', (e) => { e.preventDefault(); });
process.on('exit', () => cleanup());

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) app.quit();
cleanupPort(PORT);
