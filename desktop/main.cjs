const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');

let backendProcess;

function startBackend() {
  const nodeExecutable = process.platform === 'win32'
    ? 'C:\\Program Files\\nodejs\\node.exe'
    : 'node';
  backendProcess = spawn(nodeExecutable, [path.join(__dirname, '..', 'backend', 'server.js')], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env },
    windowsHide: true,
    stdio: 'ignore'
  });
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
  startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (backendProcess && !backendProcess.killed) backendProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backendProcess && !backendProcess.killed) backendProcess.kill();
});