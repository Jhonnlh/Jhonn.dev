const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

let backendProcess;
let ownsBackendProcess = false;

function isBackendRunning() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 3000 });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

async function startBackendIfNeeded() {
  if (await isBackendRunning()) return;

  const nodeExecutable = process.platform === 'win32'
    ? 'C:\\Program Files\\nodejs\\node.exe'
    : 'node';
  backendProcess = spawn(nodeExecutable, [path.join(__dirname, '..', 'backend', 'server.js')], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, JHONN_CONFIG_DIR: app.getPath('userData') },
    windowsHide: true,
    stdio: 'ignore'
  });
  ownsBackendProcess = true;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 650,
    backgroundColor: '#f4f4f2',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  startBackendIfNeeded().finally(createWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (ownsBackendProcess && backendProcess && !backendProcess.killed) backendProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (ownsBackendProcess && backendProcess && !backendProcess.killed) backendProcess.kill();
});