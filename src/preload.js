const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize:     () => ipcRenderer.send('minimize'),
  maximize:     () => ipcRenderer.send('maximize'),
  close:        () => ipcRenderer.send('close'),
  launch:       (profile, settings) => ipcRenderer.invoke('launch-minecraft', profile, settings),
  msLogin:      () => ipcRenderer.invoke('ms-login'),
  onDeviceCode: (cb) => ipcRenderer.on('ms-device-code', (_, data) => cb(data)),
  onProgress:   (cb) => ipcRenderer.on('launch-progress', (_, data) => cb(data)),
  onGameExit:   (cb) => ipcRenderer.on('game-exit', (_, data) => cb(data)),
  getMCVersions: () => ipcRenderer.invoke('get-mc-versions'),
  openLog:      () => ipcRenderer.send('open-log'),
  // Auto-updater
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_, data) => cb(data)),
  onUpdateProgress:   (cb) => ipcRenderer.on('update-progress',   (_, data) => cb(data)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_, data) => cb(data)),
  installUpdate:      () => ipcRenderer.send('install-update'),
});
