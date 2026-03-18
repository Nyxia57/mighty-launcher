const { contextBridge, ipcRenderer } = require('electron')

// ═══════════════════════════════════════
// ZENITHMC PRELOAD
// Expose seulement les APIs nécessaires au renderer
// via contextBridge (sécurisé, pas d'accès Node direct)
// ═══════════════════════════════════════
contextBridge.exposeInMainWorld('zenith', {

  // ─── Window controls ───
  minimize: () => ipcRenderer.send('win-minimize'),
  maximize: () => ipcRenderer.send('win-maximize'),
  close:    () => ipcRenderer.send('win-close'),

  // ─── Microsoft Auth ───
  // Déclenche tout le flux OAuth2 → Xbox → Minecraft
  loginMicrosoft: () => ipcRenderer.invoke('ms-login'),

  // ─── Modrinth API (passé par le main pour éviter CORS) ───
  searchModrinth: (params) => ipcRenderer.invoke('modrinth-search', params),

  // ─── Platform info ───
  platform: process.platform,
})
