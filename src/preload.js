const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize:     () => ipcRenderer.send('minimize'),
  maximize:     () => ipcRenderer.send('maximize'),
  close:        () => ipcRenderer.send('close'),
  launch:       (profile, settings) => ipcRenderer.invoke('launch-minecraft', profile, settings),
  msLogin:      () => ipcRenderer.invoke('ms-login'),
  onDeviceCode: (cb) => ipcRenderer.on('ms-device-code', (_, data) => cb(data)),
  openLog:      () => ipcRenderer.send('open-log'),
});
