const { contextBridge, ipcRenderer } = require('electron');
const isTestMode = process.env.UDP1492_TEST_MODE === '1';

contextBridge.exposeInMainWorld('udp1492', {
  storageGet: (keys) => ipcRenderer.invoke('udp1492:storage-get', keys),
  storageSet: (values) => ipcRenderer.invoke('udp1492:storage-set', values),
  getRuntimeConfig: () => ipcRenderer.invoke('udp1492:runtime-config'),
  openAdminWindow: () => ipcRenderer.invoke('udp1492:admin-open'),
  getAdminState: () => ipcRenderer.invoke('udp1492:admin-state-get'),
  publishAdminState: (snapshot) => ipcRenderer.send('udp1492:admin-state-publish', snapshot),
  requestAdminRefresh: (request) => ipcRenderer.invoke('udp1492:admin-refresh-request', request),
  onAdminState: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('udp1492:admin-state', handler);
    return () => ipcRenderer.removeListener('udp1492:admin-state', handler);
  },
  onAdminRefreshRequest: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('udp1492:admin-refresh-request', handler);
    return () => ipcRenderer.removeListener('udp1492:admin-refresh-request', handler);
  },
  startHost: () => ipcRenderer.invoke('udp1492:host-start'),
  sendHostMessage: (message) => ipcRenderer.invoke('udp1492:host-send', message),
  stopHost: () => ipcRenderer.invoke('udp1492:host-stop'),
  onHostMessage: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('udp1492:host-message', handler);
    return () => ipcRenderer.removeListener('udp1492:host-message', handler);
  },
  onHostDisconnect: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('udp1492:host-disconnect', handler);
    return () => ipcRenderer.removeListener('udp1492:host-disconnect', handler);
  }
});

if (isTestMode) {
  contextBridge.exposeInMainWorld('udp1492Test', {
    flags: {
      mockHost: process.env.UDP1492_TEST_MOCK_HOST === '1',
      skipAudioCapture: process.env.UDP1492_TEST_SKIP_AUDIO === '1'
    },
    emitHostMessage: (message) => ipcRenderer.invoke('udp1492:test:host-message', message),
    emitHostDisconnect: (payload) => ipcRenderer.invoke('udp1492:test:host-disconnect', payload),
    getSentHostMessages: () => ipcRenderer.invoke('udp1492:test:host-sent')
  });
}
