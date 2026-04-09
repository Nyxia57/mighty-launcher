/* ============================================================
   main.js — Electron Main Process
   Mighty Client — avec auth Microsoft/Minecraft OAuth
   ============================================================ */

const { app, BrowserWindow, ipcMain, dialog, shell, net } = require('electron');
const path = require('path');
const { URL } = require('url');
const fs   = require('fs');
const os   = require('os');
const https = require('https');
const http  = require('http');
const { execFile, spawn } = require('child_process');
const crypto = require('crypto');
const dns    = require('dns');

// ── DISCORD RICH PRESENCE ────────────────────────────────────
// Client ID de l'application Discord (https://discord.com/developers/applications)
const DISCORD_CLIENT_ID = '1234567890123456789'; // <-- remplace par ton Client ID
let discordRPC = null;
let discordReady = false;
let _discordState = { page: 'home', profile: null, server: null };
const _discordStartTime = Math.floor(Date.now() / 1000); // fixé au démarrage, ne se remet jamais à zéro
let   _discordGameStart = null; // timestamp quand le jeu est lancé

// ── CHEMINS & CONFIG ─────────────────────────────────────────
const CONFIG_PATH = path.join(app.getPath('userData'), 'mighty-config.json');

function loadConfig() {
    try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
    catch { return {}; }
}
function saveConfig(cfg) {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

// ── MIGRATION : normalise les anciens chemins d'installation ─
function migrateConfig() {
    const cfg = loadConfig();
    if (!cfg.installPath) return;

    let changed = false;

    // Ancien chemin hardcodé avec nom d'utilisateur générique "Joueur"
    if (cfg.installPath.includes('Joueur')) {
        cfg.installPath = path.join(app.getPath('appData'), 'mighty-client');
        changed = true;
    }

    // Ancien suffixe .mighty (avec point) → mighty-client
    if (cfg.installPath.match(/[\\/]\.mighty$/)) {
        cfg.installPath = cfg.installPath.replace(/[\\/]\.mighty$/, path.sep + 'mighty-client');
        changed = true;
    }

    // Ancien suffixe /mighty-launcher → mighty-client (migration rebrand)
    if (cfg.installPath.endsWith('mighty-launcher')) {
        cfg.installPath = cfg.installPath.replace(/mighty-launcher$/, 'mighty-client');
        changed = true;
    }

    // Ancien suffixe /mighty (sans point, sans -launcher/-client) → mighty-client
    if (cfg.installPath.match(/[\\/]mighty$/) && !cfg.installPath.endsWith('mighty-client')) {
        cfg.installPath = cfg.installPath.replace(/[\\/]mighty$/, path.sep + 'mighty-client');
        changed = true;
    }

    if (changed) {
        // Vérifier si les fichiers existent déjà dans le nouveau chemin avant de reset installed
        const mcVer = cfg.version || '1.21.4';
        const jarPath = path.join(cfg.installPath, 'versions', mcVer, mcVer + '.jar');
        if (!fs.existsSync(jarPath)) {
            // Fichiers absents dans le nouveau chemin → forcer réinstallation
            cfg.installed = false;
        }
        // Si le jar existe, on conserve cfg.installed tel quel
        saveConfig(cfg);
        console.log('[Migration] Chemin corrige vers :', cfg.installPath, '| installed =', cfg.installed);
    }
}


// ── Ping TCP d'un serveur Minecraft ──────────────────────────
function pingMinecraftServer(host, port) {
    return new Promise((resolve) => {
        const net2 = require('net');
        const sock = new net2.Socket();
        const timeout = 4000;

        sock.setTimeout(timeout);
        const start = Date.now();

        sock.connect(port, host, () => {
            const latency = Date.now() - start;
            // Envoyer un paquet handshake minimal (status request)
            // Format: length + packetId(0x00) + protocol(-1) + host + port + nextState(1)
            const hostBuf = Buffer.from(host, 'utf8');
            const handshake = Buffer.alloc(7 + hostBuf.length);
            let offset = 0;
            offset = handshake.writeUInt8(0x00, offset); // packet id
            // VarInt: protocol version -1 (0xFF,0xFF,0xFF,0xFF,0x0F)
            offset = handshake.writeUInt8(0xFF, offset);
            offset = handshake.writeUInt8(0xFF, offset);
            offset = handshake.writeUInt8(0xFF, offset);
            offset = handshake.writeUInt8(0xFF, offset);
            offset = handshake.writeUInt8(0x0F, offset);
            handshake.writeUInt8(hostBuf.length, offset);
            // On envoie juste assez pour que le serveur réponde
            sock.write(handshake);
            sock.destroy();
            resolve({ online: true, latency });
        });

        sock.on('timeout', () => { sock.destroy(); resolve({ online: false, latency: null }); });
        sock.on('error', () => { sock.destroy(); resolve({ online: false, latency: null }); });
    });
}



// ── IPC : PING SERVEUR MINECRAFT ─────────────────────────────

ipcMain.handle('ping-server', async (_, { host, port }) => {
    const p = parseInt(port) || 25565;
    return pingMinecraftServer(host, p);
});


ipcMain.handle('save-config', async (_, cfg) => {
    const existing = loadConfig();
    saveConfig({ ...existing, ...cfg });
    return true;
});

ipcMain.handle('load-config', async () => loadConfig());

// ── IPC : SAUVEGARDE DES PROFILS ─────────────────────────────
ipcMain.handle('save-profiles', async (_, profiles) => {
    const cfg = loadConfig();
    cfg.profiles = profiles;
    saveConfig(cfg);
    return true;
});

ipcMain.handle('load-profiles', async () => {
    const cfg = loadConfig();
    return cfg.profiles || null;
});

// ── IPC : SAUVEGARDE DES SERVEURS ────────────────────────────
ipcMain.handle('save-servers', async (_, servers) => {
    const cfg = loadConfig();
    cfg.servers = servers;
    saveConfig(cfg);
    return true;
});

ipcMain.handle('load-servers', async () => {
    const cfg = loadConfig();
    return cfg.servers || null;
});

// ── IPC : SYNCHRONISATION FICHIERS ADDONS ────────────────────
/**
 * Retourne la liste des fichiers présents dans le dossier
 * d'un type d'addon (mods / resourcepacks / shaderpacks) pour un profil.
 * Renvoie un tableau de noms de fichiers (sans chemin).
 */
// ── IPC : INSTALLATION D'UN ADDON (téléchargement vers le bon dossier) ──
/**
 * Télécharge un fichier addon (mod / resourcepack / shader) dans le dossier
 * approprié du profil Minecraft sélectionné.
 *
 * Paramètres :
 *   fileUrl        {string} URL du fichier à télécharger (depuis Modrinth)
 *   fileName       {string} Nom du fichier de destination
 *   addonType      {string} 'mod' | 'resourcepack' | 'shader'
 *   profileVersion {string} Version MC du profil (ex: '1.21.4')
 */
ipcMain.handle('install-addon', async (_, { fileUrl, fileName, addonType, profileVersion }) => {
    try {
        if (!fileUrl || !fileName) throw new Error('fileUrl et fileName sont requis.');

        const cfg = loadConfig();
        if (!cfg.installPath) throw new Error('Chemin d\'installation non configuré.');

        const mcVer   = profileVersion || cfg.version || '';
        const gameDir = mcVer && mcVer !== cfg.version
            ? path.join(cfg.installPath, 'profiles', mcVer, 'gamedata')
            : path.join(cfg.installPath, 'gamedata');

        const folderMap = {
            mod:          'mods',
            resourcepack: 'resourcepacks',
            shader:       'shaderpacks',
        };
        const folder  = folderMap[addonType] || 'mods';
        const destDir = path.join(gameDir, folder);

        // Créer le dossier destination si nécessaire
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

        const destPath = path.join(destDir, fileName);

        // Téléchargement
        await downloadFile(fileUrl, destPath, null);

        return { success: true, path: destPath };
    } catch (err) {
        console.error('[install-addon]', err.message);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('list-addon-files', async (_, { profileId, addonType, profileVersion }) => {
    try {
        const cfg = loadConfig();
        if (!cfg.installPath) return [];

        const mcVer   = profileVersion || cfg.version || '';
        const gameDir = mcVer && mcVer !== cfg.version
            ? path.join(cfg.installPath, 'profiles', mcVer, 'gamedata')
            : path.join(cfg.installPath, 'gamedata');

        const folderMap = {
            mod:          'mods',
            resourcepack: 'resourcepacks',
            shader:       'shaderpacks',
        };
        const folder = folderMap[addonType] || 'mods';
        const dirPath = path.join(gameDir, folder);

        if (!fs.existsSync(dirPath)) return [];

        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        return entries
            .filter(e => e.isFile() && !e.name.startsWith('.'))
            .map(e => e.name);
    } catch (err) {
        console.error('[list-addon-files]', err.message);
        return [];
    }
});

// ── IPC : TÉLÉCHARGEMENT TÊTE DU JOUEUR ──────────────────────
// ── IPC : Récupère le PNG du skin (sans CORS) ────────────────
ipcMain.handle('fetch-skin-texture', async (_, uuid) => {
    if (!uuid) return null;
    const cleanUUID = uuid.replace(/-/g, '');

    const sources = [
        `https://crafatar.com/skins/${cleanUUID}`,
        `https://mc-heads.net/skin/${cleanUUID}`,
        `https://minotar.net/skin/${cleanUUID}`,
        `https://crafatar.com/skins/MHF_Steve`,
    ];

    for (const url of sources) {
        try {
            const base64 = await new Promise((resolve, reject) => {
                const lib = url.startsWith('https') ? https : http;
                lib.get(url, (res) => {
                    if (res.statusCode === 301 || res.statusCode === 302) {
                        const redirLib = res.headers.location?.startsWith('https') ? https : http;
                        redirLib.get(res.headers.location, (res2) => {
                            if (res2.statusCode !== 200) { reject(new Error('HTTP ' + res2.statusCode)); return; }
                            const chunks = [];
                            res2.on('data', c => chunks.push(c));
                            res2.on('end', () => resolve('data:image/png;base64,' + Buffer.concat(chunks).toString('base64')));
                            res2.on('error', reject);
                        }).on('error', reject);
                        return;
                    }
                    if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
                    const chunks = [];
                    res.on('data', c => chunks.push(c));
                    res.on('end', () => resolve('data:image/png;base64,' + Buffer.concat(chunks).toString('base64')));
                    res.on('error', reject);
                }).on('error', reject);
            });
            return base64;
        } catch (_) {}
    }
    return null;
});

ipcMain.handle('fetch-player-head', async (_, uuid) => {
    if (!uuid) return null;
    const cleanUUID = uuid.replace(/-/g, '');

    const sources = [
        `https://crafatar.com/avatars/${cleanUUID}?size=64&overlay`,
        `https://mc-heads.net/avatar/${cleanUUID}/64`,
        `https://minotar.net/avatar/${cleanUUID}/64`,
    ];

    for (const url of sources) {
        try {
            const base64 = await new Promise((resolve, reject) => {
                const lib = url.startsWith('https') ? https : http;
                lib.get(url, (res) => {
                    if (res.statusCode === 301 || res.statusCode === 302) {
                        const redirLib = res.headers.location?.startsWith('https') ? https : http;
                        redirLib.get(res.headers.location, (res2) => {
                            if (res2.statusCode !== 200) { reject(new Error('HTTP ' + res2.statusCode)); return; }
                            const chunks = [];
                            res2.on('data', c => chunks.push(c));
                            res2.on('end', () => resolve('data:image/png;base64,' + Buffer.concat(chunks).toString('base64')));
                            res2.on('error', reject);
                        }).on('error', reject);
                        return;
                    }
                    if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
                    const chunks = [];
                    res.on('data', c => chunks.push(c));
                    res.on('end', () => resolve('data:image/png;base64,' + Buffer.concat(chunks).toString('base64')));
                    res.on('error', reject);
                }).on('error', reject);
            });
            return base64;
        } catch (_) {}
    }
    return null;
});

// ── FETCH IMAGE (contourne la CSP du renderer) ───────────────
ipcMain.handle('fetch-image', async (_, url) => {
    if (!url) return null;
    try {
        return await new Promise((resolve, reject) => {
            const lib = url.startsWith('https') ? https : http;
            lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    const redirLib = res.headers.location?.startsWith('https') ? https : http;
                    redirLib.get(res.headers.location, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res2) => {
                        if (res2.statusCode !== 200) { reject(new Error('HTTP ' + res2.statusCode)); return; }
                        const ct = res2.headers['content-type'] || 'image/jpeg';
                        const chunks = [];
                        res2.on('data', c => chunks.push(c));
                        res2.on('end', () => resolve('data:' + ct + ';base64,' + Buffer.concat(chunks).toString('base64')));
                        res2.on('error', reject);
                    }).on('error', reject);
                    return;
                }
                if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
                const ct = res.headers['content-type'] || 'image/jpeg';
                const chunks = [];
                res.on('data', c => chunks.push(c));
                res.on('end', () => resolve('data:' + ct + ';base64,' + Buffer.concat(chunks).toString('base64')));
                res.on('error', reject);
            }).on('error', reject);
        });
    } catch (_) { return null; }
});

// ── CONSTANTES OAUTH ─────────────────────────────────────────
const MS_CLIENT_ID    = '00000000402b5328';
const MS_REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf';
const MS_AUTH_URL     = 'https://login.live.com/oauth20_authorize.srf';
const MS_TOKEN_URL    = 'https://login.live.com/oauth20_token.srf';
const XBL_URL         = 'https://user.auth.xboxlive.com/user/authenticate';
const XSTS_URL        = 'https://xsts.auth.xboxlive.com/xsts/authorize';
const MC_AUTH_URL     = 'https://api.minecraftservices.com/authentication/login_with_xbox';
const MC_PROFILE_URL  = 'https://api.minecraftservices.com/minecraft/profile';

// ── FENÊTRE PRINCIPALE ───────────────────────────────────────
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1050,
        height: 660,
        minWidth: 960,
        minHeight: 600,
        frame: false,
        transparent: false,
        resizable: true,
        title: 'Mighty Client',
        icon: path.join(__dirname, 'src', 'assets', 'icons', 'icon.png'),
        backgroundColor: '#0f0f12',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webSecurity: false,  // Permet le chargement d'images externes (Minecraft, Modrinth, etc.)
        },
    });

    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.on('maximize',   () => mainWindow.webContents.send('window-maximized', true));
    mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false));
}

app.setName('Mighty Client');
if (process.platform === 'win32') app.setAppUserModelId('Mighty Client');

app.whenReady().then(() => {
    migrateConfig();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ── DISCORD RPC : INIT ───────────────────────────────────────
async function initDiscordRPC() {
    try {
        const DiscordRPC = require('discord-rpc');
        DiscordRPC.register(DISCORD_CLIENT_ID);
        discordRPC = new DiscordRPC.Client({ transport: 'ipc' });

        discordRPC.on('ready', () => {
            discordReady = true;
            updateDiscordPresence();
        });

        discordRPC.on('disconnected', () => {
            discordReady = false;
            // Retente toutes les 30s si Discord se ferme
            setTimeout(initDiscordRPC, 30000);
        });

        await discordRPC.login({ clientId: DISCORD_CLIENT_ID });
    } catch (e) {
        // Discord non ouvert ou module absent — on réessaie plus tard
        setTimeout(initDiscordRPC, 30000);
    }
}

function updateDiscordPresence() {
    if (!discordRPC || !discordReady) return;

    const pageLabels = {
        home:     'Accueil',
        profiles: 'Gestion des profils',
        addons:   'Mods & Extensions',
        settings: 'Paramètres',
        accounts: 'Comptes',
    };

    const details = _discordState.server
        ? `Sur ${_discordState.server}`
        : (pageLabels[_discordState.page] || 'Mighty Client');

    const state = _discordState.profile
        ? `Profil : ${_discordState.profile}`
        : 'Prêt à jouer';

    // Si le jeu tourne, afficher le temps de jeu ; sinon le temps depuis ouverture du launcher
    const timestamp = _discordGameStart || _discordStartTime;

    const activity = {
        details,
        state,
        startTimestamp: timestamp,
        largeImageKey:  'logo',
        largeImageText: 'Mighty Client v2.0.0',
        instance: false,
    };

    // Petite icône seulement quand le jeu tourne
    if (_discordState.profile) {
        activity.smallImageKey  = 'mc_icon';
        activity.smallImageText = 'En jeu';
    }

    discordRPC.setActivity(activity).catch(() => {});
}

// IPC — le renderer notifie un changement de page / profil / serveur
ipcMain.on('discord-update', (_, data) => {
    if (data.page    !== undefined) _discordState.page    = data.page;
    if (data.server  !== undefined) _discordState.server  = data.server;

    if (data.profile !== undefined) {
        const hadProfile = !!_discordState.profile;
        _discordState.profile = data.profile;
        // Jeu lancé → démarrer le timer de session
        if (!hadProfile && data.profile) {
            _discordGameStart = Math.floor(Date.now() / 1000);
        }
        // Jeu fermé → remettre le timer au démarrage du launcher
        if (hadProfile && !data.profile) {
            _discordGameStart = null;
        }
    }

    updateDiscordPresence();
});

// Lance le RPC après que la fenêtre soit prête
app.whenReady().then(() => { setTimeout(initDiscordRPC, 2000); });

// ── IPC : Contrôles fenêtre ──────────────────────────────────
ipcMain.on('win-minimize', () => mainWindow?.minimize());
ipcMain.on('win-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.on('win-close',    () => mainWindow?.close());
ipcMain.on('open-external',(_, url) => shell.openExternal(url));

// ── IPC : Dialogues ──────────────────────────────────────────
ipcMain.handle('select-folder', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'], title: "Dossier d'installation" });
    return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('select-file', async (_, filters) => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: filters || [{ name: 'PNG', extensions: ['png'] }] });
    return r.canceled ? null : r.filePaths[0];
});

// ════════════════════════════════════════════════════════════
// AUTH MICROSOFT / MINECRAFT
// ════════════════════════════════════════════════════════════

function fetchJSON(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = net.request({ method: options.method || 'GET', url });
        if (options.headers) {
            Object.entries(options.headers).forEach(([k, v]) => req.setHeader(k, v));
        }
        let data = '';
        req.on('response', (res) => {
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { resolve(data); }
            });
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

function openOAuthWindow() {
    const authUrl = `${MS_AUTH_URL}?client_id=${MS_CLIENT_ID}`
        + `&response_type=code`
        + `&redirect_uri=${encodeURIComponent(MS_REDIRECT_URI)}`
        + `&scope=XboxLive.signin%20offline_access`
        + `&prompt=login`;

    return new Promise((resolve, reject) => {
        let settled = false;

        const authWin = new BrowserWindow({
            width: 500, height: 650,
            parent: mainWindow, modal: true, show: false,
            title: 'Connexion Microsoft',
            webPreferences: { nodeIntegration: false, contextIsolation: true },
        });

        authWin.once('ready-to-show', () => authWin.show());

        function done(v) {
            if (settled) return; settled = true;
            setImmediate(() => { if (!authWin.isDestroyed()) authWin.destroy(); });
            resolve(v);
        }
        function fail(e) {
            if (settled) return; settled = true;
            setImmediate(() => { if (!authWin.isDestroyed()) authWin.destroy(); });
            reject(e);
        }

        const onRedirect = (_, url) => {
            if (!url || !url.startsWith('https://login.live.com/oauth20_desktop.srf')) return;
            try {
                const parsed = new URL(url);
                const code   = parsed.searchParams.get('code');
                const error  = parsed.searchParams.get('error');
                if (error) { fail(new Error('AUTH_ERROR: ' + error)); return; }
                if (code)  { done(code); }
            } catch {}
        };

        authWin.webContents.on('will-redirect', onRedirect);
        authWin.webContents.on('will-navigate',  onRedirect);
        authWin.webContents.on('did-navigate',   onRedirect);
        authWin.on('closed', () => fail(new Error('AUTH_CANCELLED')));
        authWin.loadURL(authUrl);
    });
}

// ════════════════════════════════════════════════════════════
// SYSTÈME MULTI-COMPTES
// Structure cfg.accounts = [{ uuid, name, msRefreshToken, mcToken, addedAt }]
// cfg.activeAccountUUID = uuid du compte actif
// ════════════════════════════════════════════════════════════

// Helper : effectue le flux OAuth complet Microsoft → Minecraft et retourne { msRefreshToken, mcToken, profile }
async function _doFullMsAuth(send, msAccessToken, msRefreshToken) {
    send('xbl', 'Connexion Xbox Live...');
    const xblData = await fetchJSON(XBL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
            Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccessToken}` },
            RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT',
        }),
    });
    if (!xblData.Token) throw new Error('XBL auth failed');

    send('xsts', 'Vérification XSTS...');
    const xstsData = await fetchJSON(XSTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
            Properties: { SandboxId: 'RETAIL', UserTokens: [xblData.Token] },
            RelyingParty: 'rp://api.minecraftservices.com/', TokenType: 'JWT',
        }),
    });
    if (xstsData.XErr) {
        const xErrors = {
            2148916233: "Ce compte n'a pas de compte Xbox. Crée-en un sur xbox.com.",
            2148916235: "Xbox Live n'est pas disponible dans ton pays.",
            2148916238: "Compte enfant détecté. Ajoute-le à une famille Xbox.",
        };
        throw new Error(xErrors[xstsData.XErr] || `Erreur XSTS: ${xstsData.XErr}`);
    }
    if (!xstsData.Token) throw new Error('XSTS auth failed');
    const userHash = xstsData.DisplayClaims?.xui?.[0]?.uhs;

    send('mc_token', 'Connexion Minecraft...');
    const mcData = await fetchJSON(MC_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ identityToken: `XBL3.0 x=${userHash};${xstsData.Token}` }),
    });
    if (!mcData.access_token) throw new Error('Minecraft auth failed');

    send('profile', 'Récupération du profil...');
    const profileData = await fetchJSON(MC_PROFILE_URL, {
        headers: { 'Authorization': `Bearer ${mcData.access_token}` },
    });
    if (profileData.error || !profileData.id) {
        throw new Error(profileData.errorMessage || "Ce compte ne possède pas Minecraft Java Edition.");
    }

    // L'API Mojang retourne l'UUID sans tirets — on le normalise avec tirets
    const rawId = profileData.id || '';
    const normUUID = rawId.length === 32
        ? `${rawId.slice(0,8)}-${rawId.slice(8,12)}-${rawId.slice(12,16)}-${rawId.slice(16,20)}-${rawId.slice(20)}`
        : rawId;
    return { msRefreshToken, mcToken: mcData.access_token, profile: { uuid: normUUID, name: profileData.name, skins: profileData.skins || [] } };
}

// Ajoute ou met à jour un compte dans cfg.accounts et le rend actif
function _upsertAccount(cfg, { uuid, name, msRefreshToken, mcToken }) {
    if (!cfg.accounts) cfg.accounts = [];
    const idx = cfg.accounts.findIndex(a => a.uuid === uuid);
    const entry = { uuid, name, msRefreshToken, mcToken, addedAt: idx >= 0 ? cfg.accounts[idx].addedAt : new Date().toISOString() };
    if (idx >= 0) cfg.accounts[idx] = entry;
    else cfg.accounts.push(entry);
    cfg.activeAccountUUID = uuid;
    // Migration : nettoyer les anciens champs mono-compte
    delete cfg.msRefreshToken;
    delete cfg.lastLoginName;
    delete cfg.lastLoginUUID;
    return cfg;
}

// ── IPC : Connexion Microsoft (nouveau compte) ──────────────
ipcMain.handle('ms-login', async (event) => {
    const send = (step, msg) => event.sender.send('auth-progress', { step, msg });

    try {
        send('opening_browser', 'Ouverture du navigateur Microsoft...');
        let code;
        try {
            code = await openOAuthWindow();
        } catch (e) {
            if (e.message === 'AUTH_CANCELLED') return { success: false, error: 'auth_cancelled' };
            throw e;
        }

        send('ms_token', 'Authentification Microsoft...');
        const tokenBody = new URLSearchParams({
            client_id: MS_CLIENT_ID, code,
            grant_type: 'authorization_code', redirect_uri: MS_REDIRECT_URI,
        }).toString();
        const tokenData = await fetchJSON(MS_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenBody,
        });
        if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);

        const result = await _doFullMsAuth(send, tokenData.access_token, tokenData.refresh_token);

        send('done', 'Connecté !');
        const cfg = loadConfig();
        _upsertAccount(cfg, { uuid: result.profile.uuid, name: result.profile.name, msRefreshToken: result.msRefreshToken, mcToken: result.mcToken });
        saveConfig(cfg);

        return { success: true, mcToken: result.mcToken, profile: result.profile };

    } catch (err) {
        const knownErrors = { 'AUTH_CANCELLED': 'auth_cancelled', 'AUTH_TIMEOUT': 'auth_timeout' };
        return { success: false, error: knownErrors[err.message] || err.message };
    }
});

// ── IPC : Refresh silencieux du compte actif ────────────────
ipcMain.handle('ms-silent-login', async (event) => {
    const send = (step, msg) => event.sender.send('auth-progress', { step, msg });
    const cfg = loadConfig();

    // Migration : si ancien format mono-compte, convertir
    if (cfg.msRefreshToken && !cfg.accounts) {
        cfg.accounts = [{ uuid: cfg.lastLoginUUID || 'legacy', name: cfg.lastLoginName || 'Joueur', msRefreshToken: cfg.msRefreshToken, mcToken: null, addedAt: new Date().toISOString() }];
        cfg.activeAccountUUID = cfg.accounts[0].uuid;
        delete cfg.msRefreshToken; delete cfg.lastLoginName; delete cfg.lastLoginUUID;
        saveConfig(cfg);
    }

    if (!cfg.accounts || cfg.accounts.length === 0) return { success: false, reason: 'no_accounts' };
    const activeUUID = cfg.activeAccountUUID || cfg.accounts[0]?.uuid;
    const account = cfg.accounts.find(a => a.uuid === activeUUID) || cfg.accounts[0];
    if (!account?.msRefreshToken) return { success: false, reason: 'no_token' };

    try {
        const body = new URLSearchParams({
            client_id: MS_CLIENT_ID, refresh_token: account.msRefreshToken,
            grant_type: 'refresh_token', redirect_uri: MS_REDIRECT_URI,
        }).toString();
        const tokenData = await fetchJSON(MS_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        });
        if (tokenData.error) return { success: false, reason: 'refresh_failed' };

        const result = await _doFullMsAuth(send, tokenData.access_token, tokenData.refresh_token);

        const updatedCfg = loadConfig();
        _upsertAccount(updatedCfg, { uuid: result.profile.uuid, name: result.profile.name, msRefreshToken: result.msRefreshToken, mcToken: result.mcToken });
        saveConfig(updatedCfg);

        return { success: true, mcToken: result.mcToken, profile: result.profile };

    } catch (err) {
        return { success: false, reason: 'error', error: err.message };
    }
});

// ── IPC : Refresh d'un compte spécifique par UUID ───────────
ipcMain.handle('ms-refresh-account', async (event, uuid) => {
    const send = (step, msg) => event.sender.send('auth-progress', { step, msg });
    const cfg = loadConfig();
    const account = cfg.accounts?.find(a => a.uuid === uuid);
    if (!account?.msRefreshToken) return { success: false, reason: 'no_token' };

    try {
        const body = new URLSearchParams({
            client_id: MS_CLIENT_ID, refresh_token: account.msRefreshToken,
            grant_type: 'refresh_token', redirect_uri: MS_REDIRECT_URI,
        }).toString();
        const tokenData = await fetchJSON(MS_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        });
        if (tokenData.error) return { success: false, reason: 'refresh_failed' };

        const result = await _doFullMsAuth(send, tokenData.access_token, tokenData.refresh_token);

        const updatedCfg = loadConfig();
        _upsertAccount(updatedCfg, { uuid: result.profile.uuid, name: result.profile.name, msRefreshToken: result.msRefreshToken, mcToken: result.mcToken });
        // Ne change pas le compte actif
        updatedCfg.activeAccountUUID = cfg.activeAccountUUID;
        saveConfig(updatedCfg);

        return { success: true, mcToken: result.mcToken, profile: result.profile };

    } catch (err) {
        return { success: false, reason: 'error', error: err.message };
    }
});

// ── IPC : Liste tous les comptes ────────────────────────────
ipcMain.handle('accounts-list', async () => {
    const cfg = loadConfig();
    const accounts = (cfg.accounts || []).map(a => ({
        uuid: a.uuid,
        name: a.name,
        addedAt: a.addedAt,
        isActive: a.uuid === (cfg.activeAccountUUID || cfg.accounts?.[0]?.uuid),
    }));
    return { accounts, activeUUID: cfg.activeAccountUUID || cfg.accounts?.[0]?.uuid || null };
});

// ── IPC : Définir le compte actif ───────────────────────────
ipcMain.handle('accounts-set-active', async (event, uuid) => {
    const cfg = loadConfig();
    if (!cfg.accounts?.find(a => a.uuid === uuid)) return { success: false, reason: 'not_found' };
    cfg.activeAccountUUID = uuid;
    saveConfig(cfg);
    // Retourner le mcToken du compte sélectionné (peut être null si expiré)
    const account = cfg.accounts.find(a => a.uuid === uuid);
    return { success: true, uuid, name: account.name, mcToken: account.mcToken || null };
});

// ── IPC : Supprimer un compte ───────────────────────────────
ipcMain.handle('accounts-remove', async (_, uuid) => {
    const cfg = loadConfig();
    if (!cfg.accounts) return { success: false };
    cfg.accounts = cfg.accounts.filter(a => a.uuid !== uuid);
    if (cfg.activeAccountUUID === uuid) {
        cfg.activeAccountUUID = cfg.accounts[0]?.uuid || null;
    }
    saveConfig(cfg);
    return { success: true, newActiveUUID: cfg.activeAccountUUID };
});

// ── IPC : Récupérer le token MC du compte actif ─────────────
ipcMain.handle('get-active-mc-token', async () => {
    const cfg = loadConfig();
    const uuid = cfg.activeAccountUUID || cfg.accounts?.[0]?.uuid;
    const account = cfg.accounts?.find(a => a.uuid === uuid);
    return account ? { uuid: account.uuid, name: account.name, mcToken: account.mcToken || null } : null;
});

// ── IPC : Compatibilité legacy ──────────────────────────────
ipcMain.handle('ms-exchange-code', async (_, code) => {
    const body = new URLSearchParams({ client_id: MS_CLIENT_ID, code, grant_type: 'authorization_code', redirect_uri: MS_REDIRECT_URI }).toString();
    const data = await fetchJSON(MS_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (data.error) throw new Error(data.error_description || data.error);
    return { accessToken: data.access_token, refreshToken: data.refresh_token };
});

ipcMain.handle('xbl-auth', async (_, msAccessToken) => {
    const body = JSON.stringify({ Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccessToken}` }, RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT' });
    const data = await fetchJSON(XBL_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body });
    if (!data.Token) throw new Error('XBL auth failed');
    return { xblToken: data.Token, userHash: data.DisplayClaims?.xui?.[0]?.uhs };
});

ipcMain.handle('xsts-auth', async (_, xblToken) => {
    const body = JSON.stringify({ Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] }, RelyingParty: 'rp://api.minecraftservices.com/', TokenType: 'JWT' });
    const data = await fetchJSON(XSTS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body });
    if (data.XErr) { const xErrors = { 2148916233: "Pas de compte Xbox.", 2148916235: "Xbox Live indisponible.", 2148916238: "Compte enfant." }; throw new Error(xErrors[data.XErr] || `Erreur XSTS: ${data.XErr}`); }
    if (!data.Token) throw new Error('XSTS auth failed');
    return { xstsToken: data.Token, userHash: data.DisplayClaims?.xui?.[0]?.uhs };
});

ipcMain.handle('mc-auth', async (_, { xstsToken, userHash }) => {
    const data = await fetchJSON(MC_AUTH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ identityToken: `XBL3.0 x=${userHash};${xstsToken}` }) });
    if (!data.access_token) throw new Error('Minecraft auth failed');
    return data.access_token;
});

ipcMain.handle('mc-profile', async (_, mcToken) => {
    const data = await fetchJSON(MC_PROFILE_URL, { headers: { 'Authorization': `Bearer ${mcToken}` } });
    if (data.error || !data.id) throw new Error(data.errorMessage || "Ce compte ne possède pas Minecraft Java Edition.");
    return { uuid: data.id, name: data.name, skins: data.skins || [] };
});

ipcMain.handle('ms-refresh', async (_, refreshToken) => {
    const body = new URLSearchParams({ client_id: MS_CLIENT_ID, refresh_token: refreshToken, grant_type: 'refresh_token', redirect_uri: MS_REDIRECT_URI }).toString();
    const data = await fetchJSON(MS_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (data.error) throw new Error(data.error_description || data.error);
    return { accessToken: data.access_token, refreshToken: data.refresh_token };
});

// ════════════════════════════════════════════════════════════════
//  SYSTÈME DE LANCEMENT MINECRAFT — MIGHTY CLIENT
//  Gère : Vanilla, Fabric, NeoForge, Forge
// ════════════════════════════════════════════════════════════════

const { net: electronNet } = require('electron');

// ── Chemins de jeu ────────────────────────────────────────────
function getGameDir(profileId) {
    const cfg = loadConfig();
    const base = cfg.installPath || path.join(app.getPath('appData'), 'mighty-client');
    return path.join(base, 'instances', profileId || 'default');
}

function getVersionsDir() {
    const cfg = loadConfig();
    const base = cfg.installPath || path.join(app.getPath('appData'), 'mighty-client');
    return path.join(base, 'versions');
}

function getLibsDir() {
    const cfg = loadConfig();
    const base = cfg.installPath || path.join(app.getPath('appData'), 'mighty-client');
    return path.join(base, 'libraries');
}

function getAssetsDir() {
    const cfg = loadConfig();
    const base = cfg.installPath || path.join(app.getPath('appData'), 'mighty-client');
    return path.join(base, 'assets');
}

function getNativesDir(version) {
    return path.join(getVersionsDir(), version, 'natives');
}

// ── Téléchargement HTTP avec progression ─────────────────────
async function downloadFile(url, dest, onProgress) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const req = protocol.get(url, { timeout: 30000 }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return downloadFile(res.headers.location, dest, onProgress).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} pour ${url}`));
            const total = parseInt(res.headers['content-length'] || '0');
            let received = 0;
            const ws = fs.createWriteStream(dest);
            res.on('data', chunk => {
                received += chunk.length;
                if (onProgress && total) onProgress(received, total);
            });
            res.pipe(ws);
            ws.on('finish', resolve);
            ws.on('error', reject);
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout: ' + url)); });
    });
}

// ── Fetch JSON ────────────────────────────────────────────────
async function fetchJsonLaunch(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const req = protocol.get(url, { timeout: 15000 }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302)
                return fetchJsonLaunch(res.headers.location).then(resolve).catch(reject);
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch(e) { reject(new Error('JSON invalide depuis ' + url)); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout JSON: ' + url)); });
    });
}

// ── Détection Java ────────────────────────────────────────────
// ── Détection de la version majeure Java ─────────────────────
async function getJavaMajorVersion(javaExePath) {
    return new Promise((resolve) => {
        const proc = spawn(javaExePath, ['-version'], { stdio: ['pipe','pipe','pipe'] });
        let out = '';
        proc.stderr.on('data', d => out += d.toString());
        proc.stdout.on('data', d => out += d.toString());
        proc.on('close', code => {
            if (code !== 0) return resolve(0);
            // "openjdk version \"21.0.3\" ..." ou "java version \"1.8.0_411\""
            const match = out.match(/version "(?:1\.)?(\d+)/);
            resolve(match ? parseInt(match[1]) : 0);
        });
        proc.on('error', () => resolve(0));
    });
}

// ── Téléchargement Java 21 via Adoptium ───────────────────────
async function downloadJava21(sendProgressFn) {
    const cfg = loadConfig();
    const base = cfg.installPath || path.join(app.getPath('appData'), 'mighty-client');
    const javaDir = path.join(base, 'runtime', 'java21');
    const isWin = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    const javaExe = isWin
        ? path.join(javaDir, 'bin', 'java.exe')
        : path.join(javaDir, 'bin', 'java');

    // Déjà installé ?
    if (fs.existsSync(javaExe)) {
        const v = await getJavaMajorVersion(javaExe);
        if (v >= 21) return javaExe;
    }

    // URL Adoptium API pour Java 21 LTS
    const arch    = process.arch === 'arm64' ? 'aarch64' : 'x64';
    const osName  = isWin ? 'windows' : isMac ? 'mac' : 'linux';
    const apiUrl  = `https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=${arch}&image_type=jdk&os=${osName}&vendor=eclipse`;

    if (sendProgressFn) sendProgressFn('download-progress', { name: 'Récupération de Java 21...', size: 0, pct: 2 });

    const meta = await fetchJsonLaunch(apiUrl);
    if (!meta || !meta[0]) throw new Error('Impossible de trouver Java 21 sur Adoptium.');

    const binary  = meta[0].binary;
    const dlUrl   = binary.package.link;
    const dlSize  = binary.package.size;
    const dlName  = binary.package.name;

    const archivePath = path.join(base, 'runtime', dlName);
    fs.mkdirSync(path.join(base, 'runtime'), { recursive: true });

    if (sendProgressFn) sendProgressFn('download-progress', { name: 'Téléchargement Java 21 (' + Math.round(dlSize/1048576) + ' Mo)...', size: dlSize, pct: 3 });

    await downloadFile(dlUrl, archivePath, (recv, total) => {
        if (sendProgressFn) sendProgressFn('download-progress', {
            name: 'Java 21 : ' + Math.round(recv/1048576) + '/' + Math.round(total/1048576) + ' Mo',
            size: total, pct: 3 + (recv/total) * 18
        });
    });

    if (sendProgressFn) sendProgressFn('download-progress', { name: 'Extraction de Java 21...', size: 0, pct: 21 });

    // Extraire l'archive
    if (dlName.endsWith('.zip')) {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(archivePath);
        const tmpDir = path.join(base, 'runtime', '_java21_tmp');
        fs.mkdirSync(tmpDir, { recursive: true });
        zip.extractAllTo(tmpDir, true);

        // Le zip contient un dossier racine comme jdk-21.0.7+6 → on le renomme
        const entries = fs.readdirSync(tmpDir);
        const jdkRoot = entries.find(e => e.startsWith('jdk') || e.startsWith('OpenJDK'));
        if (jdkRoot) {
            if (fs.existsSync(javaDir)) fs.rmSync(javaDir, { recursive: true, force: true });
            fs.renameSync(path.join(tmpDir, jdkRoot), javaDir);
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    } else {
        // .tar.gz sur Linux/Mac
        await new Promise((res, rej) => {
            const tmpDir = path.join(base, 'runtime', '_java21_tmp');
            fs.mkdirSync(tmpDir, { recursive: true });
            const tar = spawn('tar', ['-xzf', archivePath, '-C', tmpDir]);
            tar.on('close', code => {
                if (code !== 0) return rej(new Error('Extraction tar échouée'));
                const entries = fs.readdirSync(tmpDir);
                const jdkRoot = entries.find(e => e.startsWith('jdk') || e.startsWith('OpenJDK'));
                if (jdkRoot) {
                    if (fs.existsSync(javaDir)) fs.rmSync(javaDir, { recursive: true, force: true });
                    fs.renameSync(path.join(tmpDir, jdkRoot), javaDir);
                    fs.rmSync(tmpDir, { recursive: true, force: true });
                }
                res();
            });
            tar.on('error', rej);
        });
    }

    // Nettoyer l'archive
    try { fs.unlinkSync(archivePath); } catch {}

    if (!fs.existsSync(javaExe)) throw new Error('Java 21 extrait mais exécutable introuvable : ' + javaExe);
    if (!isWin) { try { fs.chmodSync(javaExe, '755'); } catch {} }

    return javaExe;
}

ipcMain.handle('check-java', async () => {
    const cfg = loadConfig();
    const base = cfg.installPath || path.join(app.getPath('appData'), 'mighty-client');
    const isWin = process.platform === 'win32';

    // 1. Java 21 géré par Mighty (priorité absolue)
    const managedJava = path.join(base, 'runtime', 'java21', 'bin', isWin ? 'java.exe' : 'java');
    if (fs.existsSync(managedJava)) {
        const v = await getJavaMajorVersion(managedJava);
        if (v >= 21) return { path: managedJava, version: 'Java ' + v + ' (géré par Mighty)', managed: true };
    }

    // 2. Chercher Java 21+ dans le PATH et emplacements courants
    const candidates = isWin ? [
        'java',
        path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Eclipse Adoptium', 'jdk-21.0.7.6-hotspot', 'bin', 'java.exe'),
        path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Java', 'jdk-21', 'bin', 'java.exe'),
        path.join(process.env['LOCALAPPDATA'] || '', 'Programs', 'Eclipse Adoptium', 'jdk-21.0.7.6-hotspot', 'bin', 'java.exe'),
    ] : [
        'java', '/usr/bin/java', '/usr/local/bin/java',
        '/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home/bin/java',
    ];

    for (const candidate of candidates) {
        try {
            const v = await getJavaMajorVersion(candidate);
            if (v >= 21) return { path: candidate, version: 'Java ' + v, managed: false };
        } catch {}
    }

    // 3. Java trouvé mais trop vieux
    for (const candidate of candidates) {
        try {
            const v = await getJavaMajorVersion(candidate);
            if (v > 0) return { path: candidate, version: 'Java ' + v + ' (trop ancien, Java 21 requis)', tooOld: true };
        } catch {}
    }

    return null;
});

// ── Variables de processus Minecraft ─────────────────────────
let _mcProcess   = null;
let _launchEvent = null;

function sendProgress(type, data) {
    if (_launchEvent) {
        try { _launchEvent.sender.send('launch-progress', { type, ...data }); } catch {}
    }
}

// ── Annulation du lancement ───────────────────────────────────
ipcMain.on('cancel-launch', () => {
    if (_mcProcess) { _mcProcess.kill('SIGTERM'); _mcProcess = null; }
    _launchEvent = null;
});

// ── Arrêt du jeu ─────────────────────────────────────────────
ipcMain.on('stop-game', () => {
    if (_mcProcess) { _mcProcess.kill('SIGTERM'); _mcProcess = null; }
});

// ── HANDLER PRINCIPAL : launch-game ───────────────────────────
ipcMain.handle('launch-game', async (event, opts) => {
    _launchEvent = event;
    const { version, loader, loaderVersion, ram, jvmArgs, javaPath, auth, profileId } = opts;
    const gameDir   = getGameDir(profileId);
    const verDir    = path.join(getVersionsDir(), version);
    const assetsDir = getAssetsDir();
    const libsDir   = getLibsDir();

    fs.mkdirSync(gameDir, { recursive: true });
    fs.mkdirSync(verDir,  { recursive: true });
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.mkdirSync(libsDir,   { recursive: true });

    try {
        // ── 1. Manifest des versions Mojang ─────────────────
        sendProgress('download-start', { total: 0 });
        const manifest = await fetchJsonLaunch('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
        const vEntry   = manifest.versions.find(v => v.id === version);
        if (!vEntry) throw new Error(`Version Minecraft ${version} introuvable dans le manifest Mojang.`);

        // ── 2. JSON de la version ────────────────────────────
        const vJsonPath = path.join(verDir, version + '.json');
        let vJson;
        if (fs.existsSync(vJsonPath)) {
            vJson = JSON.parse(fs.readFileSync(vJsonPath, 'utf8'));
        } else {
            sendProgress('download-progress', { name: version + '.json', size: 0, pct: 2 });
            vJson = await fetchJsonLaunch(vEntry.url);
            fs.writeFileSync(vJsonPath, JSON.stringify(vJson, null, 2));
        }

        // ── 3. Java 21 — vérification et téléchargement auto ───
        sendProgress('download-progress', { name: 'Vérification Java...', size: 0, pct: 1 });
        let resolvedJava = javaPath || null;

        if (!resolvedJava) {
            // Chercher Java 21 géré par Mighty en premier
            const cfg2 = loadConfig();
            const base2 = cfg2.installPath || path.join(app.getPath('appData'), 'mighty-client');
            const managedExe = path.join(base2, 'runtime', 'java21', 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
            if (fs.existsSync(managedExe)) {
                const mv = await getJavaMajorVersion(managedExe);
                if (mv >= 21) resolvedJava = managedExe;
            }
        }

        if (!resolvedJava) {
            // Chercher Java 21+ dans le système
            const sysCandidates = process.platform === 'win32'
                ? ['java',
                   path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Eclipse Adoptium', 'jdk-21.0.7.6-hotspot', 'bin', 'java.exe'),
                   path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Java', 'jdk-21', 'bin', 'java.exe')]
                : ['java', '/usr/bin/java', '/usr/local/bin/java'];

            for (const c of sysCandidates) {
                try {
                    const v = await getJavaMajorVersion(c);
                    if (v >= 21) { resolvedJava = c; break; }
                } catch {}
            }
        }

        if (!resolvedJava) {
            // Télécharger Java 21 automatiquement
            sendProgress('download-progress', { name: 'Java 21 requis — téléchargement automatique...', size: 0, pct: 1 });
            sendProgress('game-log', { msg: '[Java] Java 21 introuvable, téléchargement via Adoptium...\n' });
            try {
                resolvedJava = await downloadJava21(sendProgress);
                sendProgress('game-log', { msg: '[Java] Java 21 installé : ' + resolvedJava + '\n' });
            } catch(e) {
                throw new Error('Java 21 requis mais impossible à télécharger : ' + e.message + '\n\nInstalle Java 21 manuellement depuis : https://adoptium.net');
            }
        } else {
            const jv = await getJavaMajorVersion(resolvedJava);
            sendProgress('game-log', { msg: '[Java] Utilisation de Java ' + jv + ' : ' + resolvedJava + '\n' });
        }

        // ── 4. Client JAR ────────────────────────────────────
        const clientJar = path.join(verDir, version + '.jar');
        if (!fs.existsSync(clientJar)) {
            const dl = vJson.downloads?.client;
            if (!dl) throw new Error('Pas de téléchargement client dans le JSON de version.');
            sendProgress('download-progress', { name: `${version}.jar`, size: dl.size, pct: 5 });
            await downloadFile(dl.url, clientJar, (recv, total) => {
                sendProgress('download-progress', { name: `${version}.jar`, size: total, pct: 5 + (recv/total)*25 });
            });
        }

        // ── 4. Librairies ────────────────────────────────────
        const libs = vJson.libraries || [];
        let libIdx  = 0;
        const classpath = [clientJar];
        const nativeJarPaths = []; // JARs natives à extraire séparément

        for (const lib of libs) {
            libIdx++;
            // Filtrer par rules OS
            if (lib.rules) {
                const allow = lib.rules.some(r => {
                    if (r.action !== 'allow') return false;
                    if (!r.os) return true;
                    const osName = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
                    return r.os.name === osName;
                });
                if (!allow) continue;
            }

            const artifact = lib.downloads?.artifact;
            if (!artifact) continue;

            const libPath = path.join(libsDir, artifact.path);
            // Détecter les JARs natives (ne pas les mettre dans le classpath Java)
            const isNativeJar = artifact.path && (
                artifact.path.includes('natives-windows') ||
                artifact.path.includes('natives-linux') ||
                artifact.path.includes('natives-osx') ||
                artifact.path.includes('natives-macos')
            );

            if (isNativeJar) {
                // Toujours télécharger les natives, mais les garder de côté pour extraction
                nativeJarPaths.push(libPath);
            } else {
                classpath.push(libPath);
            }

            if (!fs.existsSync(libPath)) {
                fs.mkdirSync(path.dirname(libPath), { recursive: true });
                const pct = 30 + (libIdx / libs.length) * 25;
                sendProgress('download-progress', { name: path.basename(artifact.path), size: artifact.size || 0, pct });
                await downloadFile(artifact.url, libPath);
            }
        }

        sendProgress('download-done', {});

        // ── 5. Assets ────────────────────────────────────────
        const assetIndexInfo = vJson.assetIndex;
        if (assetIndexInfo) {
            const indexDir  = path.join(assetsDir, 'indexes');
            const indexFile = path.join(indexDir, assetIndexInfo.id + '.json');
            fs.mkdirSync(indexDir, { recursive: true });

            let assetIndex;
            if (!fs.existsSync(indexFile)) {
                assetIndex = await fetchJsonLaunch(assetIndexInfo.url);
                fs.writeFileSync(indexFile, JSON.stringify(assetIndex));
            } else {
                assetIndex = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
            }

            const objects = Object.values(assetIndex.objects || {});
            let assetIdx  = 0;
            for (const asset of objects.slice(0, 50)) { // on limite à 50 pour ne pas bloquer trop longtemps
                assetIdx++;
                const hash    = asset.hash;
                const subDir  = hash.substring(0, 2);
                const destP   = path.join(assetsDir, 'objects', subDir, hash);
                if (!fs.existsSync(destP)) {
                    fs.mkdirSync(path.dirname(destP), { recursive: true });
                    const url = `https://resources.download.minecraft.net/${subDir}/${hash}`;
                    try { await downloadFile(url, destP); } catch {}
                }
                if (assetIdx % 10 === 0) {
                    sendProgress('download-progress', { name: `assets (${assetIdx}/${objects.length})`, size: 0, pct: 55 + (assetIdx/Math.min(objects.length,50))*10 });
                }
            }
        }

        // ── 6. Loader (Fabric / NeoForge / Forge) ────────────
        let mainClass = vJson.mainClass;
        let loaderArgs = [];
        let loaderLibs = [];

        if (loader !== 'vanilla') {
            sendProgress('loader-install', { loader, version: loaderVersion || 'latest' });
            const loaderResult = await installLoader(loader, version, loaderVersion, libsDir, sendProgress);
            if (loaderResult.mainClass) mainClass = loaderResult.mainClass;
            if (loaderResult.libs)      loaderLibs = loaderResult.libs;
            if (loaderResult.args)      loaderArgs = loaderResult.args;
            sendProgress('loader-done', { loader });
        }

        // ── 7. Extraction des natives ─────────────────────────
        const nativesDir = getNativesDir(version);
        // Vider les natives pour forcer une re-extraction propre
        if (fs.existsSync(nativesDir)) {
            try { fs.rmSync(nativesDir, { recursive: true, force: true }); } catch {}
        }
        fs.mkdirSync(nativesDir, { recursive: true });

        const AdmZip = require('adm-zip');
        const isWinNative = process.platform === 'win32';
        const isMacNative = process.platform === 'darwin';
        const isLinuxNative = !isWinNative && !isMacNative;

        let nativesExtracted = 0;

        // Fonction utilitaire : extraire les .so/.dll/.dylib d'un JAR vers nativesDir
        const extractNativesFromJar = (jarPath) => {
            if (!fs.existsSync(jarPath)) return;
            try {
                const zip = new AdmZip(jarPath);
                zip.getEntries().forEach(entry => {
                    if (entry.isDirectory) return;
                    const ext = path.extname(entry.entryName).toLowerCase();
                    if (!['.dll', '.so', '.dylib'].includes(ext)) return;
                    const destFile = path.join(nativesDir, path.basename(entry.entryName));
                    try { fs.writeFileSync(destFile, entry.getData()); nativesExtracted++; } catch {}
                });
            } catch(e) { console.warn('[Natives] Erreur extraction:', jarPath, e.message); }
        };

        // Méthode 1 : JARs natives collectés lors du téléchargement des libs (1.13+, LWJGL 3)
        for (const jarPath of nativeJarPaths) {
            const jarName = path.basename(jarPath).toLowerCase();
            // Filtrer pour l'OS courant
            if (isWinNative && !jarName.includes('natives-windows')) continue;
            if (isMacNative && !jarName.includes('natives-osx') && !jarName.includes('natives-macos')) continue;
            if (isLinuxNative && !jarName.includes('natives-linux')) continue;
            // Exclure les variantes arm64/x86 sur x64
            if (process.arch !== 'arm64' && jarName.includes('arm64')) continue;
            if (process.arch === 'x64' && jarName.includes('-x86.jar')) continue;

            sendProgress('game-log', { msg: '[Natives] Extraction: ' + path.basename(jarPath) + '\n' });
            extractNativesFromJar(jarPath);
        }

        // Méthode 2 : classifiers (ancienne méthode < 1.13, LWJGL 2)
        if (nativesExtracted === 0) {
            for (const lib of vJson.libraries || []) {
                if (!lib.downloads?.classifiers) continue;
                const osKey = isWinNative ? 'natives-windows' : isMacNative ? 'natives-osx' : 'natives-linux';
                const native = lib.downloads.classifiers[osKey]
                            || (isWinNative ? lib.downloads.classifiers['natives-windows-64'] : null);
                if (!native?.path) continue;
                const nativePath = path.join(libsDir, native.path);
                if (!fs.existsSync(nativePath)) {
                    fs.mkdirSync(path.dirname(nativePath), { recursive: true });
                    try { await downloadFile(native.url, nativePath); } catch {}
                }
                extractNativesFromJar(nativePath);
            }
        }

        // Méthode 3 (fallback) : scanner toutes les libs pour l'OS courant
        if (nativesExtracted === 0) {
            sendProgress('game-log', { msg: '[Natives] Fallback: scan des libs pour natives...\n' });
            const nativeKeyword = isWinNative ? 'natives-windows' : isMacNative ? 'natives-osx' : 'natives-linux';
            const allLibFiles = [];
            const scanDir = (dir) => {
                try {
                    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
                        if (f.isDirectory()) scanDir(path.join(dir, f.name));
                        else if (f.name.toLowerCase().includes(nativeKeyword) && f.name.endsWith('.jar')) {
                            if (process.arch !== 'arm64' && f.name.includes('arm64')) continue;
                            if (process.arch === 'x64' && f.name.includes('-x86.')) continue;
                            allLibFiles.push(path.join(dir, f.name));
                        }
                    }
                } catch {}
            };
            scanDir(libsDir);
            for (const jarPath of allLibFiles) extractNativesFromJar(jarPath);
        }

        sendProgress('game-log', { msg: '[Natives] ' + nativesExtracted + ' fichier(s) extrait(s) dans ' + nativesDir + '\n' });

        // ── 8. Construction classpath & arguments ─────────────
        const sep = process.platform === 'win32' ? ';' : ':';

        // Dédupliquer le classpath : les libs du loader ont priorité sur celles de Mojang
        // On garde la version la plus récente quand un artéfact existe en double (ex: asm-9.6 vs asm-9.9)
        const dedupeClasspath = (mojangLibs, loaderLibs_) => {
            // Extraire le groupId:artifactId depuis un chemin (ex: org/ow2/asm/asm/9.6/asm-9.6.jar -> org.ow2.asm:asm)
            const getArtifactKey = (libPath) => {
                const normalized = libPath.replace(/\\/g, '/');
                const parts = normalized.split('/');
                // Format: ...libraries/group/path/artifact/version/artifact-version.jar
                // Remonter depuis la fin: jar, version, artifact, ...groupParts
                if (parts.length < 4) return libPath;
                const jarName = parts[parts.length - 1];           // asm-9.6.jar
                const version = parts[parts.length - 2];            // 9.6
                const artifact = parts[parts.length - 3];           // asm
                // group = tout ce qui précède artifact dans le chemin libraries/
                const libIdx = parts.indexOf('libraries');
                if (libIdx < 0) return libPath;
                const groupParts = parts.slice(libIdx + 1, parts.length - 3);
                return groupParts.join('.') + ':' + artifact;
            };

            // Index des libs loader par clé artifact
            const loaderIndex = new Map();
            for (const lib of loaderLibs_) {
                loaderIndex.set(getArtifactKey(lib), lib);
            }

            // Garder les libs Mojang sauf si le loader en fournit une version
            const filtered = mojangLibs.filter(lib => {
                const key = getArtifactKey(lib);
                return !loaderIndex.has(key);
            });

            return [...filtered, ...loaderLibs_];
        };

        const allLibs = dedupeClasspath(classpath, loaderLibs);
        const fullClasspath = allLibs.join(sep);

        // Sur Windows, utiliser javaw.exe (sans fenêtre console) si java.exe est détecté
        let javaExe = resolvedJava || javaPath || 'java';
        if (process.platform === 'win32' && javaExe.endsWith('java.exe')) {
            const javawExe = javaExe.replace('java.exe', 'javaw.exe');
            if (fs.existsSync(javawExe)) javaExe = javawExe;
        }
        const ramMb   = Math.round((ram || 4) * 1024);

        // Table de substitution complète
        const VARS = {
            '${auth_player_name}':  auth.name || 'Player',
            '${version_name}':      version,
            '${game_directory}':    gameDir,
            '${assets_root}':       assetsDir,
            '${game_assets}':       assetsDir,
            '${assets_index_name}': vJson.assetIndex?.id || version,
            '${auth_uuid}':         auth.uuid || '00000000-0000-0000-0000-000000000000',
            '${auth_access_token}': (auth.mcToken && auth.mcToken !== 'offline') ? auth.mcToken : '0',
            '${auth_session}':      (auth.mcToken && auth.mcToken !== 'offline') ? auth.mcToken : '0',
            '${user_type}':         (auth.mcToken && auth.mcToken !== 'offline') ? 'msa' : 'legacy',
            '${version_type}':      vJson.type || 'release',
            '${natives_directory}': nativesDir,
            '${library_directory}':  libsDir,
            '${classpath_separator}': sep,
            '${launcher_name}':     'MightyClient',
            '${launcher_version}':  '2.0.0',
            '${classpath}':         fullClasspath,
            '${clientid}':          '0',
            '${auth_xuid}':         '0',
            '${user_properties}':   '{}',
            '${resolution_width}':  '854',
            '${resolution_height}': '480',
        };

        const substituteArg = (s) => {
            if (typeof s !== 'string') return null;
            let result = s;
            for (const [k, v] of Object.entries(VARS)) {
                result = result.split(k).join(v);
            }
            // Supprimer les variables inconnues restantes mais garder l'arg
            result = result.replace(/\$\{[^}]+\}/g, '');
            return result;
        };

        // Évaluer les rules Mojang (OS filter)
        const checkRules = (rules) => {
            if (!rules || rules.length === 0) return true;
            let allow = false;
            for (const rule of rules) {
                const matches = !rule.os || (
                    (!rule.os.name  || rule.os.name  === (process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux')) &&
                    (!rule.os.arch  || rule.os.arch  === process.arch)
                );
                if (matches) allow = (rule.action === 'allow');
            }
            return allow;
        };

        // JVM args
        const jvmArgsArr = [];
        const mojangArgs = vJson.arguments || {};

        if (mojangArgs.jvm && mojangArgs.jvm.length > 0) {
            for (const a of mojangArgs.jvm) {
                if (typeof a === 'string') {
                    jvmArgsArr.push(a);
                } else if (a && checkRules(a.rules)) {
                    const vals = Array.isArray(a.value) ? a.value : [a.value];
                    jvmArgsArr.push(...vals);
                }
            }
        } else {
            // Fallback pour les vieilles versions
            jvmArgsArr.push(
                `-Djava.library.path=${nativesDir}`,
                `-Djna.tmpdir=${nativesDir}`,
                `-Dorg.lwjgl.system.SharedLibraryExtractPath=${nativesDir}`,
                `-Dio.netty.native.workdir=${nativesDir}`,
                `-Dminecraft.launcher.brand=MightyClient`,
                `-Dminecraft.launcher.version=2.0.0`,
                `-cp`, fullClasspath
            );
        }

        // S'assurer que -cp et le classpath sont toujours présents
        if (!jvmArgsArr.includes('-cp') && !jvmArgsArr.includes('-classpath')) {
            jvmArgsArr.push('-cp', fullClasspath);
        }

        // Game args
        const gameArgsArr = [];
        if (mojangArgs.game && mojangArgs.game.length > 0) {
            for (const a of mojangArgs.game) {
                if (typeof a === 'string') {
                    gameArgsArr.push(a);
                } else if (a && checkRules(a.rules)) {
                    const vals = Array.isArray(a.value) ? a.value : [a.value];
                    gameArgsArr.push(...vals);
                }
            }
        } else if (vJson.minecraftArguments) {
            gameArgsArr.push(...vJson.minecraftArguments.split(' '));
        }

        const finalJvmArgs = [
            `-Xmx${ramMb}m`,
            `-Xms${Math.min(512, ramMb)}m`,
        ];

        for (const a of jvmArgsArr) {
            const sub = substituteArg(a);
            if (sub !== null) finalJvmArgs.push(sub);
        }

        if (loaderArgs && loaderArgs.length > 0) finalJvmArgs.push(...loaderArgs);
        if (jvmArgs) finalJvmArgs.push(...jvmArgs.split(' ').filter(Boolean));

        // Construire les game args en filtrant les paires --option  (valeur vide)
        const rawGameArgs = [];
        for (const a of gameArgsArr) {
            const sub = substituteArg(a);
            if (sub !== null) rawGameArgs.push(sub);
        }

        // Supprimer les options avec valeur vide (ex: --quickPlayPath "")
        const finalGameArgs = [];
        for (let i = 0; i < rawGameArgs.length; i++) {
            const cur = rawGameArgs[i];
            if (cur.startsWith('--')) {
                const next = rawGameArgs[i + 1];
                // Si la valeur suivante est vide ou une autre option, skip les deux
                if (next !== undefined && !next.startsWith('--') && next.trim() === '') {
                    i++; // skip la valeur vide
                    continue;
                }
            }
            // Aussi filtrer --demo (désactive le mode démo forcé)
            if (cur === '--demo') continue;
            if (cur.trim() !== '') finalGameArgs.push(cur);
        }

        const fullArgs = [...finalJvmArgs, mainClass, ...finalGameArgs];

        // ── 9. Lancement ─────────────────────────────────────
        // Écrire la commande complète dans un fichier log pour débogage
        const logFile = path.join(gameDir, 'mighty-launch.log');
        const fullCmd = javaExe + ' ' + fullArgs.join(' ');
        fs.writeFileSync(logFile, '=== MIGHTY CLIENT LAUNCH LOG ===\n');
        fs.appendFileSync(logFile, 'Date: ' + new Date().toISOString() + '\n');
        fs.appendFileSync(logFile, 'Java: ' + javaExe + '\n');
        fs.appendFileSync(logFile, 'mainClass: ' + mainClass + '\n');
        fs.appendFileSync(logFile, 'gameDir: ' + gameDir + '\n');
        fs.appendFileSync(logFile, 'version: ' + version + '\n');
        fs.appendFileSync(logFile, 'loader: ' + loader + '\n');
        fs.appendFileSync(logFile, '\n--- JVM ARGS ---\n' + finalJvmArgs.join('\n') + '\n');
        fs.appendFileSync(logFile, '\n--- GAME ARGS ---\n' + finalGameArgs.join('\n') + '\n');
        fs.appendFileSync(logFile, '\n--- FULL COMMAND ---\n' + fullCmd + '\n\n--- OUTPUT ---\n');

        sendProgress('game-log', { msg: '[Launch] Commande: ' + javaExe + ' ' + fullArgs.slice(0,4).join(' ') + ' ...\n' });
        sendProgress('game-log', { msg: '[Launch] mainClass: ' + mainClass + '\n' });
        sendProgress('game-log', { msg: '[Launch] Log complet: ' + logFile + '\n' });

        sendProgress('game-start', {});

        _mcProcess = spawn(javaExe, fullArgs, {
            cwd: gameDir,
            detached: false,
            env: { ...process.env },
        });

        let _fullOutput = '';
        _mcProcess.stdout.on('data', d => {
            const msg = d.toString();
            _fullOutput += msg;
            fs.appendFileSync(logFile, msg);
            sendProgress('game-log', { msg });
        });
        _mcProcess.stderr.on('data', d => {
            const msg = d.toString();
            _fullOutput += msg;
            fs.appendFileSync(logFile, msg);
            sendProgress('game-log', { msg });
        });

        _mcProcess.on('close', (code) => {
            fs.appendFileSync(logFile, '\n=== EXIT CODE: ' + code + ' ===\n');
            // Si crash, envoyer les dernières lignes du log comme erreur résumée
            if (code !== 0 && code !== null) {
                const lines = _fullOutput.split('\n').filter(l => l.trim());
                const lastLines = lines.slice(-20).join('\n');
                sendProgress('game-error-detail', { log: lastLines, code });
            }
            sendProgress('game-close', { code });
            _mcProcess   = null;
            _launchEvent = null;
        });
        _mcProcess.on('error', (e) => {
            fs.appendFileSync(logFile, '\nSPAWN ERROR: ' + e.message + '\n');
            sendProgress('game-error', { msg: 'Impossible de lancer Java : ' + e.message + '\nVérifie que Java est installé et dans le PATH.' });
        });

        return { success: true };

    } catch(e) {
        console.error('[Launch] Erreur:', e);
        return { success: false, error: e.message };
    }
});

// ── INSTALLATION DES LOADERS ──────────────────────────────────
async function installLoader(loader, mcVersion, loaderVersion, libsDir, sendProgress) {
    if (loader === 'fabric') return installFabric(mcVersion, loaderVersion, libsDir, sendProgress);
    if (loader === 'neoforge') return installNeoForge(mcVersion, loaderVersion, libsDir, sendProgress);
    if (loader === 'forge')    return installForge(mcVersion, loaderVersion, libsDir, sendProgress);
    return {};
}

// ── FABRIC ───────────────────────────────────────────────────
async function installFabric(mcVersion, loaderVer, libsDir, sendProgress) {
    // Récupérer la dernière version du loader Fabric
    const loaderMeta = await fetchJsonLaunch('https://meta.fabricmc.net/v2/versions/loader');
    const fabricVer  = loaderVer || loaderMeta[0]?.version;
    if (!fabricVer) throw new Error('Impossible de trouver une version Fabric Loader.');

    // Profil Fabric complet (JSON de lancement)
    const launchMeta = await fetchJsonLaunch(
        `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(fabricVer)}/profile/json`
    );

    const libs = [];
    for (const lib of launchMeta.libraries || []) {
        if (!lib.name || !lib.url) continue;
        const [group, artifact, ver] = lib.name.split(':');
        if (!group || !artifact || !ver) continue;
        const groupPath = group.replace(/\./g, '/');
        const jarName   = `${artifact}-${ver}.jar`;
        const relPath   = `${groupPath}/${artifact}/${ver}/${jarName}`;
        const destPath  = path.join(libsDir, relPath);

        if (!fs.existsSync(destPath)) {
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
            const dlUrl = (lib.url || 'https://maven.fabricmc.net/') + relPath;
            sendProgress('download-progress', { name: jarName, size: 0, pct: 78 });
            try { await downloadFile(dlUrl, destPath); } catch(e) { console.warn('[Fabric] Skip', jarName, e.message); }
        }
        if (fs.existsSync(destPath)) libs.push(destPath);
    }

    return {
        mainClass: launchMeta.mainClass,
        libs,
        args: [],
    };
}

// ── NEOFORGE ─────────────────────────────────────────────────
async function installNeoForge(mcVersion, loaderVer, libsDir, sendProgress) {
    // Liste des versions NeoForge via Maven
    const metaUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml`;
    let nfVersion = loaderVer;

    if (!nfVersion) {
        try {
            const xml = await new Promise((res, rej) => {
                https.get(metaUrl, { timeout: 10000 }, (r) => {
                    let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
                }).on('error', rej);
            });
            // Extraire la dernière version compatible
            const matches = xml.match(/<version>(\d+\.\d+\.\d+(?:\.\d+)?)<\/version>/g) || [];
            const mcMajor = mcVersion.split('.').slice(0, 2).join('.');
            const compatible = matches
                .map(m => m.replace(/<\/?version>/g, ''))
                .filter(v => v.startsWith(mcMajor.replace('1.', '')));
            nfVersion = compatible[compatible.length - 1];
        } catch(e) {
            console.warn('[NeoForge] Impossible de récupérer la liste des versions:', e.message);
        }
    }

    if (!nfVersion) throw new Error(`Aucune version NeoForge trouvée pour Minecraft ${mcVersion}.`);

    // Télécharger l'installeur NeoForge
    const installerUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${nfVersion}/neoforge-${nfVersion}-installer.jar`;
    const installerPath = path.join(libsDir, `neoforge-${nfVersion}-installer.jar`);

    if (!fs.existsSync(installerPath)) {
        sendProgress('download-progress', { name: `NeoForge ${nfVersion} installer`, size: 0, pct: 80 });
        await downloadFile(installerUrl, installerPath);
    }

    // Note: L'exécution de l'installeur NeoForge nécessite de lancer java -jar installer.jar --installClient
    // Pour simplifier, on retourne un objet vide et on log l'info
    sendProgress('game-log', { msg: `[NeoForge] Installeur téléchargé. Lance: java -jar ${installerPath} --installClient\n` });

    return {
        mainClass: null, // Sera dans le JSON généré par l'installeur
        libs: [],
        args: [],
    };
}

// ── FORGE ─────────────────────────────────────────────────────
async function installForge(mcVersion, loaderVer, libsDir, sendProgress) {
    let forgeVersion = loaderVer;

    if (!forgeVersion) {
        // Essayer de trouver la version recommandée via l'API Forge
        try {
            const promoData = await fetchJsonLaunch('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
            const key = `${mcVersion}-recommended`;
            const fallback = `${mcVersion}-latest`;
            const fv = promoData.promos?.[key] || promoData.promos?.[fallback];
            if (fv) forgeVersion = `${mcVersion}-${fv}`;
        } catch(e) {
            console.warn('[Forge] Impossible de récupérer les promos Forge:', e.message);
        }
    }

    if (!forgeVersion) throw new Error(`Aucune version Forge trouvée pour Minecraft ${mcVersion}.`);

    const installerUrl  = `https://maven.minecraftforge.net/net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}-installer.jar`;
    const installerPath = path.join(libsDir, `forge-${forgeVersion}-installer.jar`);

    if (!fs.existsSync(installerPath)) {
        sendProgress('download-progress', { name: `Forge ${forgeVersion} installer`, size: 0, pct: 80 });
        await downloadFile(installerUrl, installerPath);
    }

    sendProgress('game-log', { msg: `[Forge] Installeur téléchargé. Lance: java -jar ${installerPath} --installClient\n` });

    return {
        mainClass: null,
        libs: [],
        args: [],
    };
}
