const { app, BrowserWindow, dialog, Menu } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

let mainWindow = null;
let serverProcess = null;
const PORT = 9627;
const APP_ROOT = process.resourcesPath;

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

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    icon: path.join(APP_ROOT, 'icon.ico'),
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    show: false,
  });
  mainWindow.loadURL(`http://localhost:${PORT}`);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  // Electron 25+ no longer includes "Electron" in userAgent by default
  // Restore it so our renderer can detect Electron context
  if (!app.userAgentFallback.includes('Electron')) {
    app.userAgentFallback += ' Electron';
  }
  Menu.setApplicationMenu(null); // Remove default menu bar

  const serverEntry = path.join(APP_ROOT, 'core', 'server', 'index.mjs');
  if (!fs.existsSync(serverEntry)) {
    dialog.showErrorBox('File Missing', 'core/server/index.mjs not found.\n\nExpected: ' + serverEntry);
    app.quit();
    return;
  }

  const logPath = path.join(app.getPath('userData'), 'server.log');
  const logFd = fs.openSync(logPath, 'a');
  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: APP_ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production', ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', logFd, logFd],
    detached: false,
  });

  serverProcess.on('exit', (code) => {
    try { fs.closeSync(logFd); } catch {}
    if (mainWindow) {
      if (code !== 0) {
        const log = fs.readFileSync(logPath, 'utf8').trim().split('\n').slice(-10).join('\n');
        dialog.showErrorBox('Service Stopped', `SSH service exited (code ${code}).\n\nLast logs:\n${log}`);
      }
      app.quit();
    }
  });

  try {
    await waitForPort(PORT);
  } catch (err) {
    dialog.showErrorBox('Startup Failed', `Timeout: ${err.message}`);
    app.quit();
    return;
  }

  createMainWindow();
});

function killProcessTree(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /f /t /pid ${pid}`, { stdio: 'ignore', timeout: 3000 });
    } else {
      try { process.kill(-pid, 'SIGTERM'); } catch {}
      try { process.kill(pid, 'SIGTERM'); } catch {}
    }
  } catch {}
}

app.on('window-all-closed', () => {
  if (serverProcess && serverProcess.pid) killProcessTree(serverProcess.pid);
  if (process.platform !== 'darwin') app.quit();
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) app.quit();
