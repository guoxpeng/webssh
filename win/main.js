const { app, dialog, Menu, Tray, shell } = require('electron');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

let tray = null;
let httpServer = null;
const PORT = 9627;

// SECURITY: the embedded server refuses all API/WS traffic without AUTH_TOKEN.
// The desktop shell generates a fresh random token per launch and hands it to
// the frontend via the startup URL (localhost only).
process.env.AUTH_TOKEN = process.env.AUTH_TOKEN || crypto.randomBytes(24).toString('base64url');
const appUrl = () => `http://localhost:${PORT}/?token=${encodeURIComponent(process.env.AUTH_TOKEN)}`;

// Single-instance lock FIRST: a second launch must quit immediately and must
// NOT run cleanupPort() — that would kill the port owned by the running
// instance and drop all of its live SSH sessions.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256');
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

// PERF: prefer the server's own 'listening' event over port polling —
// the window opens as soon as the embedded server is actually ready.
function waitForServer(server, port, timeout = 15000) {
  if (server && typeof server.listening === 'boolean') {
    if (server.listening) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Port ${port} timeout`)), timeout);
      server.once('listening', () => { clearTimeout(timer); resolve(); });
      server.once('error', (err) => { clearTimeout(timer); reject(err); });
    });
  }
  return waitForPort(port, timeout);
}

// Relaunch while already running → bring the user back to the app.
app.on('second-instance', () => { shell.openExternal(appUrl()); });

app.whenReady().then(async () => {
  if (!app.userAgentFallback.includes('Electron')) {
    app.userAgentFallback += ' Electron';
  }

  // Prefer the self-contained bundle (packaged builds ship without
  // node_modules); fall back to the source tree for dev checkouts.
  const bundlePath = path.join(process.resourcesPath, 'core', 'server', 'index.bundle.mjs');
  const sourcePath = path.join(process.resourcesPath, 'core', 'server', 'index.mjs');
  const serverPath = fs.existsSync(bundlePath) ? bundlePath : sourcePath;
  if (!fs.existsSync(serverPath)) {
    dialog.showErrorBox('File Missing', `core/server/index.mjs not found.\n\nExpected: ${serverPath}`);
    app.quit();
    return;
  }

  // The bundle resolves DIST_DIR from its own location — point it at the
  // packaged frontend explicitly.
  const distCandidate = path.join(process.resourcesPath, 'dist', 'client');
  if (fs.existsSync(distCandidate)) process.env.WEBSSH_DIST_DIR = distCandidate;

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
    await waitForServer(httpServer, PORT);
  } catch (err) {
    dialog.showErrorBox('Startup Failed', `Timeout: ${err.message}`);
    app.quit();
    return;
  }

  // macOS tray requires a PNG (Template image adapts to light/dark menu bar);
  // Windows uses the .ico.
  const trayIcon = process.platform === 'darwin'
    ? path.join(process.resourcesPath, 'iconTemplate.png')
    : path.join(process.resourcesPath, 'icon.ico');
  if (fs.existsSync(trayIcon)) {
    tray = new Tray(trayIcon);
    tray.setToolTip('WebSSH');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open', click: () => shell.openExternal(appUrl()) },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]));
    tray.on('double-click', () => shell.openExternal(appUrl()));
  }

  shell.openExternal(appUrl());
  app.dock?.hide?.();
}).catch(err => {
  dialog.showErrorBox('Startup Error', err.message);
  app.quit();
});

function cleanupPort(port) {
  try {
    if (process.platform === 'win32') {
      execSync(`powershell -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"`, { stdio: 'ignore', timeout: 3000 });
    } else if (process.platform === 'darwin') {
      // Kill stale processes still holding the port (crash leftovers).
      execSync(`lsof -ti tcp:${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore', timeout: 3000, shell: '/bin/sh' });
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

// Only the lock holder may clear the port (stale process from a crash).
cleanupPort(PORT);
