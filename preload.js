/* ============================================================
   preload.js — Electron Preload Script
   Expose les APIs Electron + Auth Microsoft/Minecraft
   ============================================================ */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {

    // ── Contrôles fenêtre ─────────────────────────────────
    minimize:    () => ipcRenderer.send('win-minimize'),
    maximize:    () => ipcRenderer.send('win-maximize'),
    close:       () => ipcRenderer.send('win-close'),
    onMaximized: (cb) => ipcRenderer.on('window-maximized', (_, v) => cb(v)),

    // ── Liens / dialogues ─────────────────────────────────
    openExternal: (url) => ipcRenderer.send('open-external', url),
    selectFolder: ()      => ipcRenderer.invoke('select-folder'),
    selectFile:   (f)     => ipcRenderer.invoke('select-file', f),

    // ── Installation & Config ─────────────────────────────
    fetchImage:         (url)  => ipcRenderer.invoke('fetch-image', url),
    fetchPlayerHead:    (uuid) => ipcRenderer.invoke('fetch-player-head', uuid),
    fetchSkinTexture:   (uuid) => ipcRenderer.invoke('fetch-skin-texture', uuid),
    saveConfig:         (cfg)  => ipcRenderer.invoke('save-config', cfg),
    loadConfig:         ()     => ipcRenderer.invoke('load-config'),

    // ── Profils & Serveurs (persistance) ──────────────────
    saveProfiles: (profiles) => ipcRenderer.invoke('save-profiles', profiles),
    loadProfiles: ()         => ipcRenderer.invoke('load-profiles'),
    saveServers:  (servers)  => ipcRenderer.invoke('save-servers', servers),
    loadServers:  ()         => ipcRenderer.invoke('load-servers'),

    // ── Ping serveur Minecraft ────────────────────────────
    pingServer: (opts) => ipcRenderer.invoke('ping-server', opts),


    // ── Synchronisation & installation fichiers addons ───────────────────
    listAddonFiles: (opts) => ipcRenderer.invoke('list-addon-files', opts),
    installAddon:   (opts) => ipcRenderer.invoke('install-addon', opts),

    // ── Auth Microsoft / Minecraft ────────────────────────
    msLogin:            ()       => ipcRenderer.invoke('ms-login'),
    msSilentLogin:      ()       => ipcRenderer.invoke('ms-silent-login'),
    onAuthProgress:     (cb)     => ipcRenderer.on('auth-progress', (_, d) => cb(d)),
    msExchangeCode:     (code)   => ipcRenderer.invoke('ms-exchange-code', code),
    msRefresh:          (rt)     => ipcRenderer.invoke('ms-refresh', rt),
    xblAuth:            (token)  => ipcRenderer.invoke('xbl-auth', token),
    xstsAuth:           (token)  => ipcRenderer.invoke('xsts-auth', token),
    mcAuth:             (data)   => ipcRenderer.invoke('mc-auth', data),
    mcProfile:          (token)  => ipcRenderer.invoke('mc-profile', token),

    // ── Gestion multi-comptes ─────────────────────────────
    accountsList:       ()       => ipcRenderer.invoke('accounts-list'),
    accountsSetActive:  (uuid)   => ipcRenderer.invoke('accounts-set-active', uuid),
    accountsRemove:     (uuid)   => ipcRenderer.invoke('accounts-remove', uuid),
    msRefreshAccount:   (uuid)   => ipcRenderer.invoke('ms-refresh-account', uuid),
    getActiveMcToken:   ()       => ipcRenderer.invoke('get-active-mc-token'),

    // ── Discord Rich Presence ─────────────────────────────
    discordUpdate: (data) => ipcRenderer.send('discord-update', data),

    // ── Lancement du jeu ─────────────────────────────────
    checkJava:          ()       => ipcRenderer.invoke('check-java'),
    launchGame:         (opts)   => ipcRenderer.invoke('launch-game', opts),
    cancelLaunch:       ()       => ipcRenderer.send('cancel-launch'),
    stopGame:           ()       => ipcRenderer.send('stop-game'),
    onLaunchProgress:   (cb)     => ipcRenderer.on('launch-progress', (_, data) => cb(data)),
    onGameClose:        (cb)     => ipcRenderer.on('launch-progress', (_, data) => {
        if (data.type === 'game-close') cb(data);
    }),

});
