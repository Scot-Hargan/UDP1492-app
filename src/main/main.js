const { app, BrowserWindow, ipcMain } = require('electron');
const { fork } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const APP_ID = 'com.udp1492.desktop';
const USER_DATA_DIR_NAME = 'UDP 1492 Desktop';
const isTestMode = process.env.UDP1492_TEST_MODE === '1';
const useMockHost = isTestMode && process.env.UDP1492_TEST_MOCK_HOST === '1';
const customUserDataPath = process.env.UDP1492_USER_DATA_DIR;
const hostScriptPath = path.join(__dirname, '..', 'host', 'udp_audio1492_host.js');
let mainWindow = null;
let adminWindow = null;
let latestAdminState = null;
let storageWriteQueue = Promise.resolve();
let quitRequested = false;
let quitPromise = null;
const defaultUserDataPath = app.getPath('userData');

function sanitizeManagedBackendUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function sanitizeManagedRequestTimeoutMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 10000;
  return Math.max(1000, Math.min(60000, Math.trunc(parsed)));
}

function sanitizeManagedLocalAddresses(values) {
  const ordered = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const address = String(value || '').trim();
    if (!address || seen.has(address)) continue;
    seen.add(address);
    ordered.push(address);
  }
  return ordered;
}

function getManagedLocalAddresses() {
  const envValue = process.env.UDP1492_MANAGED_LOCAL_ADDRESSES;
  if (typeof envValue === 'string' && envValue.trim()) {
    return sanitizeManagedLocalAddresses(envValue.split(','));
  }

  const interfaces = os.networkInterfaces();
  const preferred = [];
  const fallback = [];
  for (const entries of Object.values(interfaces)) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      const family = typeof entry?.family === 'string' ? entry.family : String(entry?.family || '');
      if (family !== 'IPv4') continue;
      if (!entry?.address) continue;
      if (entry.internal) {
        fallback.push(entry.address);
      } else {
        preferred.push(entry.address);
      }
    }
  }
  return sanitizeManagedLocalAddresses(preferred.length ? preferred : fallback);
}

function getRuntimeConfig() {
  return {
    managedBackendUrl: sanitizeManagedBackendUrl(process.env.UDP1492_MANAGED_BACKEND_URL),
    managedRequestTimeoutMs: sanitizeManagedRequestTimeoutMs(process.env.UDP1492_MANAGED_REQUEST_TIMEOUT_MS),
    managedLocalAddresses: getManagedLocalAddresses()
  };
}

app.setPath(
  'userData',
  customUserDataPath
    ? path.resolve(customUserDataPath)
    : path.join(app.getPath('appData'), USER_DATA_DIR_NAME)
);
app.setAppUserModelId(APP_ID);

function getStorageDirectories() {
  if (customUserDataPath) {
    return [app.getPath('userData')];
  }

  return Array.from(new Set([
    defaultUserDataPath,
    path.join(app.getPath('appData'), 'udp-1492-app'),
    path.join(app.getPath('appData'), APP_ID),
    path.join(app.getPath('appData'), USER_DATA_DIR_NAME),
    app.getPath('userData')
  ].filter(Boolean)));
}

function getStoragePath(dirPath) {
  return path.join(dirPath, 'storage.json');
}

function logStorageIssue(action, storagePath, error) {
  const message = error?.message || String(error);
  console.error(`[storage] ${action} ${storagePath}: ${message}`);
}

function mergePeerLists(baseList = [], incomingList = []) {
  const merged = new Map();
  for (const peer of baseList) {
    if (!peer?.ip || !peer?.port) continue;
    merged.set(`${peer.ip}:${peer.port}`, peer);
  }
  for (const peer of incomingList) {
    if (!peer?.ip || !peer?.port) continue;
    merged.set(`${peer.ip}:${peer.port}`, peer);
  }
  return Array.from(merged.values());
}

function mergeLastPeerLists(baseList = [], incomingList = []) {
  const ordered = [];
  const seen = new Set();
  for (const key of [...baseList, ...incomingList]) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ordered.push(key);
  }
  return ordered;
}

function mergeStorageData(base = {}, incoming = {}) {
  const merged = { ...base, ...incoming };

  if (Array.isArray(base.udp1492_peers) || Array.isArray(incoming.udp1492_peers)) {
    merged.udp1492_peers = mergePeerLists(base.udp1492_peers, incoming.udp1492_peers);
  }
  if (Array.isArray(base.udp1492_last_peers) || Array.isArray(incoming.udp1492_last_peers)) {
    merged.udp1492_last_peers = mergeLastPeerLists(base.udp1492_last_peers, incoming.udp1492_last_peers);
  }

  return merged;
}

async function readStorageFileAt(storagePath) {
  try {
    const raw = await fs.readFile(storagePath, 'utf8');
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return {};
    if (error instanceof SyntaxError) {
      logStorageIssue('Ignoring malformed storage file', storagePath, error);
      return {};
    }
    throw error;
  }
}

async function readMergedStorageFile() {
  let merged = {};
  for (const dirPath of getStorageDirectories()) {
    const storagePath = getStoragePath(dirPath);
    try {
      const next = await readStorageFileAt(storagePath);
      merged = mergeStorageData(merged, next);
    } catch (error) {
      logStorageIssue('Failed to read storage file', storagePath, error);
    }
  }
  return merged;
}

async function readStorageFile() {
  return readMergedStorageFile();
}

async function writeStorageFileAt(storagePath, data) {
  await fs.mkdir(path.dirname(storagePath), { recursive: true });
  await fs.writeFile(storagePath, JSON.stringify(data, null, 2), 'utf8');
}

async function writeStorageFile(data) {
  let writesCompleted = 0;
  let lastError = null;

  for (const dirPath of getStorageDirectories()) {
    const storagePath = getStoragePath(dirPath);
    try {
      await writeStorageFileAt(storagePath, data);
      writesCompleted += 1;
    } catch (error) {
      lastError = error;
      logStorageIssue('Failed to write storage file', storagePath, error);
    }
  }

  if (writesCompleted === 0 && lastError) {
    throw lastError;
  }
}

async function syncStorageCopies() {
  const merged = await readMergedStorageFile();
  if (!Object.keys(merged).length) return;
  await writeStorageFile(merged);
}

async function storageGet(keys) {
  const data = await readStorageFile();
  if (keys == null) return data;
  if (typeof keys === 'string') return { [keys]: data[keys] };
  if (Array.isArray(keys)) {
    const result = {};
    for (const key of keys) result[key] = data[key];
    return result;
  }
  if (typeof keys === 'object') {
    const result = {};
    for (const [key, fallback] of Object.entries(keys)) {
      result[key] = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : fallback;
    }
    return result;
  }
  return {};
}

async function storageSet(values) {
  storageWriteQueue = storageWriteQueue
    .catch(() => {})
    .then(async () => {
      const current = await readStorageFile();
      const next = { ...current, ...values };
      await writeStorageFile(next);
    });

  return storageWriteQueue;
}

class HostBridge {
  constructor() {
    this.child = null;
    this.webContents = null;
    this.stopTimer = null;
    this.stopPromise = null;
    this.stopResolve = null;
  }

  start(webContents) {
    if (this.child) {
      this.webContents = webContents;
      return;
    }

    this.webContents = webContents;
    this.child = fork(hostScriptPath, [], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });

    this.child.on('message', (message) => {
      if (!this.webContents || this.webContents.isDestroyed()) return;
      this.webContents.send('udp1492:host-message', message);
    });

    this.child.stdout?.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) console.log(`[udp1492-host] ${text}`);
    });

    this.child.stderr?.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) console.error(`[udp1492-host] ${text}`);
    });

    this.child.on('exit', (code, signal) => {
      this.child = null;
      if (this.stopTimer) {
        clearTimeout(this.stopTimer);
        this.stopTimer = null;
      }
      const resolveStop = this.stopResolve;
      this.stopPromise = null;
      this.stopResolve = null;
      if (resolveStop) resolveStop();
      if (!this.webContents || this.webContents.isDestroyed()) return;
      this.webContents.send('udp1492:host-disconnect', { code, signal });
    });
  }

  send(message) {
    if (!this.child) throw new Error('Host process is not running.');
    this.child.send(message);
  }

  stop() {
    if (!this.child) return Promise.resolve();
    if (this.stopPromise) return this.stopPromise;

    const child = this.child;
    this.stopPromise = new Promise((resolve) => {
      this.stopResolve = resolve;
    });

    try {
      child.send({ type: 'disconnect' });
    } catch {
      try {
        child.kill();
      } catch {}
      return this.stopPromise;
    }

    this.stopTimer = setTimeout(() => {
      if (this.child === child) {
        try {
          child.kill();
        } catch {}
      }
    }, 1000);

    return this.stopPromise;
  }

  emit(message, webContents = this.webContents) {
    if (!webContents || webContents.isDestroyed()) return;
    webContents.send('udp1492:host-message', message);
  }

  emitDisconnect(payload = {}, webContents = this.webContents) {
    if (!webContents || webContents.isDestroyed()) return;
    webContents.send('udp1492:host-disconnect', payload);
  }

  getSentMessages() {
    return [];
  }
}

class MockHostBridge {
  constructor() {
    this.started = false;
    this.webContents = null;
    this.sentMessages = [];
  }

  start(webContents) {
    this.started = true;
    this.webContents = webContents;
  }

  send(message) {
    if (!this.started) throw new Error('Host process is not running.');
    this.sentMessages.push(message);
    if (!this.webContents || this.webContents.isDestroyed()) return;

    if (message?.type === 'version') {
      this.emit({ type: 'version', version: message.version || 'mock-host' });
      return;
    }

    if (message?.type === 'configure') {
      this.emit({
        type: 'state',
        latched: false,
        encryptionEnabled: !!message.encryptionEnabled
      });
    }
  }

  stop() {
    if (!this.started) return Promise.resolve();
    this.started = false;
    const webContents = this.webContents;
    this.webContents = null;
    this.emitDisconnect({ code: 0, signal: null, mock: true }, webContents);
    return Promise.resolve();
  }

  emit(message, webContents = this.webContents) {
    if (!webContents || webContents.isDestroyed()) return;
    webContents.send('udp1492:host-message', message);
  }

  emitDisconnect(payload = {}, webContents = this.webContents) {
    if (!webContents || webContents.isDestroyed()) return;
    webContents.send('udp1492:host-disconnect', payload);
  }

  getSentMessages() {
    return this.sentMessages.slice();
  }
}

const hostBridge = useMockHost ? new MockHostBridge() : new HostBridge();

function requestAppQuit() {
  if (quitRequested) return quitPromise || Promise.resolve();

  quitRequested = true;
  quitPromise = Promise.resolve()
    .then(() => hostBridge.stop())
    .catch((error) => {
      console.error('[app] Failed to stop host bridge during quit', error);
    })
    .finally(() => {
      if (adminWindow && !adminWindow.isDestroyed()) {
        try {
          adminWindow.destroy();
        } catch (error) {
          console.error('[app] Failed to destroy admin window during quit', error);
        }
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.destroy();
        } catch (error) {
          console.error('[app] Failed to destroy main window during quit', error);
        }
      }
      app.exit(0);
    });

  return quitPromise;
}

function attachWindowDiagnostics(targetWindow, label) {
  targetWindow.webContents.on('console-message', (event, details, levelArg, messageArg, lineArg, sourceIdArg) => {
    const isDetailsObject = details && typeof details === 'object' && Object.prototype.hasOwnProperty.call(details, 'message');
    const level = isDetailsObject ? details.level : levelArg;
    const message = isDetailsObject ? details.message : messageArg;
    const line = isDetailsObject ? details.lineNumber : lineArg;
    const sourceId = isDetailsObject ? details.sourceId : sourceIdArg;
    const prefix = sourceId ? `${sourceId}:${line}` : `${label}:${line}`;
    const stream = level >= 2 ? console.error : console.log;
    stream(`[renderer:${label}] ${prefix} ${message}`);
  });

  targetWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[renderer:${label}] render-process-gone`, details);
  });

  targetWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[renderer:${label}] did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
  });
}

function broadcastAdminState() {
  if (!adminWindow || adminWindow.isDestroyed()) return;
  adminWindow.webContents.send('udp1492:admin-state', latestAdminState);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: '#0b1018',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  attachWindowDiagnostics(mainWindow, 'main');

  mainWindow.on('close', (event) => {
    if (quitRequested) return;
    event.preventDefault();
    void requestAppQuit();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createAdminWindow() {
  if (adminWindow && !adminWindow.isDestroyed()) {
    if (adminWindow.isMinimized()) adminWindow.restore();
    adminWindow.show();
    adminWindow.focus();
    return adminWindow;
  }

  adminWindow = new BrowserWindow({
    width: 1120,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b1018',
    title: 'UDP 1492 Admin Surface',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  adminWindow.loadFile(path.join(__dirname, '..', 'renderer', 'admin.html'));
  attachWindowDiagnostics(adminWindow, 'admin');

  adminWindow.once('ready-to-show', () => {
    if (!adminWindow || adminWindow.isDestroyed()) return;
    adminWindow.show();
    broadcastAdminState();
  });

  adminWindow.webContents.on('did-finish-load', () => {
    broadcastAdminState();
  });

  adminWindow.on('closed', () => {
    adminWindow = null;
  });

  return adminWindow;
}

app.on('before-quit', (event) => {
  if (quitRequested) return;
  event.preventDefault();
  void requestAppQuit();
});

app.whenReady().then(async () => {
  try {
    await syncStorageCopies();
  } catch (error) {
    console.error('[storage] Startup sync failed', error);
  }

  ipcMain.handle('udp1492:storage-get', async (_event, keys) => storageGet(keys));
  ipcMain.handle('udp1492:storage-set', async (_event, values) => storageSet(values));
  ipcMain.handle('udp1492:runtime-config', async () => getRuntimeConfig());
  ipcMain.handle('udp1492:admin-open', async () => {
    createAdminWindow();
    return { ok: true };
  });
  ipcMain.handle('udp1492:admin-state-get', async () => latestAdminState);
  ipcMain.handle('udp1492:admin-refresh-request', async (_event, request) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      throw new Error('Main window is unavailable.');
    }
    mainWindow.webContents.send('udp1492:admin-refresh-request', request || {});
    return { ok: true };
  });
  ipcMain.on('udp1492:admin-state-publish', (event, snapshot) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return;
    latestAdminState = snapshot && typeof snapshot === 'object' ? snapshot : null;
    broadcastAdminState();
  });
  ipcMain.handle('udp1492:host-start', async (event) => {
    hostBridge.start(event.sender);
    return { ok: true };
  });
  ipcMain.handle('udp1492:host-send', async (_event, message) => {
    hostBridge.send(message);
    return { ok: true };
  });
  ipcMain.handle('udp1492:host-stop', async () => {
    hostBridge.stop();
    return { ok: true };
  });
  if (isTestMode) {
    ipcMain.handle('udp1492:test:host-message', async (event, message) => {
      hostBridge.emit(message, event.sender);
      return { ok: true };
    });
    ipcMain.handle('udp1492:test:host-disconnect', async (event, payload) => {
      hostBridge.emitDisconnect(payload || { code: 0, signal: null, test: true }, event.sender);
      return { ok: true };
    });
    ipcMain.handle('udp1492:test:host-sent', async () => hostBridge.getSentMessages());
  }

  createMainWindow();

  app.on('activate', () => {
    if (!quitRequested && (!mainWindow || mainWindow.isDestroyed())) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !quitRequested) {
    void requestAppQuit();
  }
});
