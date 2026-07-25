const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const kill = require('tree-kill');

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

function createLoadingWindow() {
  const win = new BrowserWindow({
    width: 420, height: 220,
    frame: false, transparent: true, alwaysOnTop: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    show: false,
  });
  win.loadURL(`data:text/html;charset=utf-8,
    <html style="background:transparent;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui;">
    <div style="background:rgba(255,255,255,0.95);padding:40px 60px;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,0.3);text-align:center;">
      <h2 style="margin:0 0 12px 0;color:#2c3e50;">WebSSH</h2>
      <div style="width:40px;height:40px;margin:16px auto;border:4px solid #e0e0e0;border-top-color:#3498db;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
      <p style="margin:16px 0 0 0;color:#7f8c8d;font-size:14px;">Starting SSH service...</p>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg);}}</style>
    </html>
  `);
  win.once('ready-to-show', () => win.show());
  return win;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    show: false,
  });
  mainWindow.loadURL(`http://localhost:${PORT}`);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  const loadingWin = createLoadingWindow();

  const serverEntry = path.join(APP_ROOT, 'core', 'server', 'index.mjs');
  if (!fs.existsSync(serverEntry)) {
    dialog.showErrorBox('File Missing', 'core/server/index.mjs not found.\n\nExpected: ' + serverEntry);
    app.quit();
    return;
  }

  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: APP_ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' },
    stdio: 'ignore',
    detached: false,
  });

  serverProcess.on('exit', (code) => {
    if (mainWindow) {
      dialog.showErrorBox('Service Stopped', `SSH service exited (code ${code}).`);
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

  loadingWin.close();
  createMainWindow();
});

app.on('window-all-closed', () => {
  if (serverProcess && serverProcess.pid) {
    kill(serverProcess.pid, 'SIGTERM', () => {});
  }
  if (process.platform !== 'darwin') app.quit();
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) app.quit();
