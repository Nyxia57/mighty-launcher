const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const https = require('https')
const http  = require('http')
const { URL } = require('url')
const { autoUpdater } = require('electron-updater')

// ── AUTO-UPDATER ─────────────────────────────────────────────────────
autoUpdater.autoDownload = true          // télécharge en arrière-plan
autoUpdater.autoInstallOnAppQuit = true  // installe quand l'app se ferme

autoUpdater.on('checking-for-update', () => {
  console.log('[Updater] Vérification des mises à jour...')
})
autoUpdater.on('update-available', (info) => {
  console.log('[Updater] Mise à jour disponible :', info.version)
  mainWindow?.webContents.send('update-available', info)
})
autoUpdater.on('update-not-available', () => {
  console.log('[Updater] Aucune mise à jour.')
})
autoUpdater.on('download-progress', (progress) => {
  mainWindow?.webContents.send('update-progress', progress)
})
autoUpdater.on('update-downloaded', (info) => {
  console.log('[Updater] Mise à jour téléchargée :', info.version)
  mainWindow?.webContents.send('update-downloaded', info)
})
autoUpdater.on('error', (err) => {
  console.error('[Updater] Erreur :', err.message)
})

// IPC — le renderer peut demander d'installer maintenant
ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall()
})

// ── OPTIMISATION RAM ─────────────────────────────────────────────────
// Limiter la mémoire V8 du process principal
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128')
// Désactiver le rendu GPU inutile (économise ~30-50Mo)
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-software-rasterizer')
// Réduire la mémoire du renderer
app.commandLine.appendSwitch('renderer-process-limit', '1')
app.commandLine.appendSwitch('disable-background-networking')
// Pas de logs de crash inutiles
app.commandLine.appendSwitch('disable-crash-reporter')

// ═══════════════════════════════════════
// MIGHTY — AUTH MICROSOFT / MINECRAFT
//
// On utilise le Client ID officiel de l'app Minecraft (Xbox)
// C'est exactement ce que font Prism Launcher, MultiMC, etc.
// Aucune app Azure à créer, aucun secret nécessaire.
// ═══════════════════════════════════════

// Client ID officiel de l'app "Minecraft Launcher" de Microsoft
// Utilisé par tous les launchers tiers légitimes
const MS_CLIENT_ID = '00000000402b5328'
const MS_REDIRECT  = 'https://login.live.com/oauth20_desktop.srf'
const MS_SCOPE     = 'service::user.auth.xboxlive.com::MBI_SSL'

let mainWindow = null
let authWindow = null
let authServer = null

// ─── FENÊTRE PRINCIPALE ───
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 800,
    frame: false,
    backgroundColor: '#08070f',
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,   // ralentir quand en arrière-plan
      spellcheck: false,            // pas de correcteur orthographique
      enableWebSQL: false,          // désactiver WebSQL inutile
      v8CacheOptions: 'bypassHeuristics', // cache V8 agressif
    },
    show: false,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
  })
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'))
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => { mainWindow = null })

  // Libérer la mémoire quand Minecraft est lancé et la fenêtre minimisée
  mainWindow.on('minimize', () => {
    if (global.gameRunning) mainWindow.webContents.setBackgroundThrottling(true)
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (!mainWindow) createWindow() })
  // Vérifier les mises à jour 3s après le démarrage
  setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 3000)
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// ─── WINDOW CONTROLS ───
ipcMain.on('minimize', () => mainWindow?.minimize())
ipcMain.on('maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize())
ipcMain.on('close',    () => mainWindow?.close())

ipcMain.on('open-log', () => {
  const logPath = path.join(app.getPath('userData'), 'launch.log')
  if (require('fs').existsSync(logPath)) shell.openPath(logPath)
})

// ═══════════════════════════════════════
// FLUX AUTH COMPLET
// Méthode MSA legacy (login.live.com) — même méthode que Prism/MultiMC
// Pas besoin d'app Azure personnelle
// ═══════════════════════════════════════
ipcMain.handle('ms-login', async () => {
  try {
    console.log('[Auth] Étape 1 : ouverture fenêtre Microsoft...')
    const { code, redirectUrl } = await getMicrosoftCode()

    console.log('[Auth] Étape 2 : échange code → token Microsoft...')
    const msToken = await exchangeCodeForToken(code, redirectUrl)
    console.log('[Auth] Token MS ok, expires_in:', msToken.expires_in)

    console.log('[Auth] Étape 3 : token MS → Xbox Live...')
    const xbl = await getXboxLiveToken(msToken.access_token)
    console.log('[Auth] XBL ok, uhs:', xbl.uhs)

    console.log('[Auth] Étape 4 : XBL → XSTS...')
    const xsts = await getXSTSToken(xbl.token)
    console.log('[Auth] XSTS ok')

    console.log('[Auth] Étape 5 : XSTS → token Minecraft...')
    const mcToken = await getMinecraftToken(xsts.token, xsts.uhs)
    console.log('[Auth] MC token ok')

    console.log('[Auth] Étape 6 : profil Minecraft...')
    const profile = await getMinecraftProfile(mcToken)

    console.log('[Auth] ✅ Connecté :', profile.name)
    return {
      success: true,
      username: profile.name,
      uuid: profile.id,
      accessToken: mcToken,
      type: 'Microsoft Premium',
      premium: true,
    }
  } catch (err) {
    console.error('[Auth] ❌', err.message)
    return { success: false, error: err.message }
  }
})

// ─── ÉTAPE 1 : Ouvre la fenêtre login.live.com, intercepte le redirect ───
// Pas de serveur local — on intercepte directement l'URL de redirect
// dans la fenêtre Electron (méthode utilisée par Prism Launcher)
function getMicrosoftCode() {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      client_id:     MS_CLIENT_ID,
      response_type: 'code',
      redirect_uri:  MS_REDIRECT,
      scope:         MS_SCOPE,
      prompt:        'select_account',
    })

    const authUrl = `https://login.live.com/oauth20_authorize.srf?${params.toString()}`
    console.log('[Auth] URL:', authUrl)

    authWindow = new BrowserWindow({
      width: 500,
      height: 650,
      parent: mainWindow,
      modal: true,
      resizable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
      title: 'Connexion Microsoft — Mighty',
      backgroundColor: '#ffffff',
      autoHideMenuBar: true,
    })

    authWindow.loadURL(authUrl)

    // Intercepte chaque navigation pour détecter le redirect de fin d'auth
    authWindow.webContents.on('will-redirect', (event, url) => {
      handleRedirect(url, resolve, reject)
    })

    // Certaines versions d'Electron utilisent did-navigate
    authWindow.webContents.on('did-navigate', (event, url) => {
      if (url.startsWith('https://login.live.com/oauth20_desktop.srf')) {
        handleRedirect(url, resolve, reject)
      }
    })

    authWindow.on('closed', () => {
      authWindow = null
      reject(new Error('Fenêtre fermée avant la fin de la connexion'))
    })
  })
}

function handleRedirect(url, resolve, reject) {
  try {
    const u = new URL(url)
    // La page de succès est oauth20_desktop.srf avec un code
    if (!u.href.startsWith('https://login.live.com/oauth20_desktop.srf')) return

    const code  = u.searchParams.get('code')
    const error = u.searchParams.get('error')
    const desc  = u.searchParams.get('error_description') || ''

    if (authWindow && !authWindow.isDestroyed()) authWindow.close()

    if (error) {
      reject(new Error(`Erreur Microsoft : ${error} — ${decodeURIComponent(desc)}`))
    } else if (code) {
      resolve({ code, redirectUrl: url.split('?')[0] })
    } else {
      reject(new Error('Aucun code dans le redirect'))
    }
  } catch (e) {
    // URL invalide, on ignore
  }
}

// ─── ÉTAPE 2 : Code → token Microsoft (sans client_secret) ───
// Le client ID officiel Minecraft n'a pas besoin de secret
function exchangeCodeForToken(code, redirectUrl) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      client_id:    MS_CLIENT_ID,
      code,
      grant_type:   'authorization_code',
      redirect_uri: MS_REDIRECT,
      scope:        MS_SCOPE,
    }).toString()

    const req = https.request({
      hostname: 'login.live.com',
      path:     '/oauth20_token.srf',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        console.log('[Auth] Token response status:', res.statusCode)
        console.log('[Auth] Token response:', data.slice(0, 300))
        try {
          const j = JSON.parse(data)
          if (j.error) reject(new Error(`Token MS : ${j.error} — ${j.error_description}`))
          else if (!j.access_token) reject(new Error('Pas d\'access_token : ' + data.slice(0, 300)))
          else resolve(j)
        } catch (e) { reject(new Error('Réponse token invalide : ' + data.slice(0, 200))) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ─── ÉTAPE 3 : MS token → Xbox Live ───
function getXboxLiveToken(accessToken) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      Properties: {
        AuthMethod: 'RPS',
        SiteName:   'user.auth.xboxlive.com',
        RpsTicket:  accessToken, // pas de préfixe "d=" avec le client ID officiel Minecraft
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType:    'JWT',
    })
    const req = https.request({
      hostname: 'user.auth.xboxlive.com',
      path:     '/user/authenticate',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Accept':         'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        console.log('[Auth] XBL status:', res.statusCode, data.slice(0, 200))
        try {
          const j = JSON.parse(data)
          if (!j.Token) reject(new Error('XBL sans token : ' + data.slice(0, 300)))
          else resolve({ token: j.Token, uhs: j.DisplayClaims?.xui?.[0]?.uhs })
        } catch (e) { reject(new Error('Réponse XBL invalide')) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ─── ÉTAPE 4 : XBL → XSTS ───
function getXSTSToken(xblToken) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      Properties:   { SandboxId: 'RETAIL', UserTokens: [xblToken] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType:    'JWT',
    })
    const req = https.request({
      hostname: 'xsts.auth.xboxlive.com',
      path:     '/xsts/authorize',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Accept':         'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        console.log('[Auth] XSTS status:', res.statusCode, data.slice(0, 200))
        try {
          const j = JSON.parse(data)
          if (j.XErr) {
            const msgs = {
              2148916233: 'Pas de compte Xbox. Va sur xbox.com pour en créer un (gratuit).',
              2148916235: 'Xbox Live non disponible dans ta région.',
              2148916236: 'Vérification d\'âge requise sur account.xbox.com.',
              2148916237: 'Vérification d\'âge requise sur account.xbox.com.',
              2148916238: 'Compte enfant : autorisation parentale requise sur xbox.com/family.',
            }
            reject(new Error(msgs[j.XErr] || `Xbox erreur XErr=${j.XErr}`))
          } else if (!j.Token) {
            reject(new Error('XSTS sans token : ' + data.slice(0, 300)))
          } else {
            resolve({ token: j.Token, uhs: j.DisplayClaims?.xui?.[0]?.uhs })
          }
        } catch (e) { reject(new Error('Réponse XSTS invalide')) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ─── ÉTAPE 5 : XSTS → Token Minecraft ───
function getMinecraftToken(xstsToken, uhs) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      identityToken: `XBL3.0 x=${uhs};${xstsToken}`,
    })
    const req = https.request({
      hostname: 'api.minecraftservices.com',
      path:     '/authentication/login_with_xbox',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Accept':         'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        console.log('[Auth] MC token status:', res.statusCode, data.slice(0, 300))
        try {
          const j = JSON.parse(data)
          if (j.errorMessage || j.error) {
            reject(new Error('Minecraft token : ' + (j.errorMessage || j.error)))
          } else if (!j.access_token) {
            reject(new Error('Pas d\'access_token MC : ' + data.slice(0, 300)))
          } else {
            resolve(j.access_token)
          }
        } catch (e) { reject(new Error('Réponse MC token invalide')) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ─── ÉTAPE 6 : Token → Profil Minecraft ───
function getMinecraftProfile(accessToken) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.minecraftservices.com',
      path:     '/minecraft/profile',
      method:   'GET',
      headers:  {
        'Authorization': `Bearer ${accessToken}`,
        'Accept':        'application/json',
      },
    }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        console.log('[Auth] Profil status:', res.statusCode, data.slice(0, 200))
        try {
          const j = JSON.parse(data)
          if (j.error) {
            reject(new Error(
              j.errorMessage?.includes('NOTFOUND')
                ? 'Ce compte Microsoft ne possède pas Minecraft Java Edition.'
                : `Profil : ${j.errorMessage || j.error}`
            ))
          } else {
            resolve({ id: j.id, name: j.name })
          }
        } catch (e) { reject(new Error('Réponse profil invalide')) }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

// ─── MC VERSIONS ───
ipcMain.handle('get-mc-versions', async () => {
  try {
    const data = await httpsGetJSON('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json')
    return { success: true, versions: data.versions || [] }
  } catch(e) {
    return { success: false, error: e.message }
  }
})

// ─── MODRINTH PROXY ───
ipcMain.handle('modrinth-search'
, async (_, params) => {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams(params).toString()
    const req = https.request({
      hostname: 'api.modrinth.com',
      path:     `/v2/search?${qs}`,
      method:   'GET',
      headers:  { 'User-Agent': 'Mighty/1.0', 'Accept': 'application/json' },
    }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch(e) { reject(e) } })
    })
    req.on('error', reject)
    req.end()
  })
})

// ─── MINECRAFT LAUNCH ───
const { spawn } = require('child_process')
const fs   = require('fs')
const os   = require('os')
const path2 = require('path')

ipcMain.handle('launch-minecraft', async (_, profile, settings) => {
  try { await launchMinecraft(profile, settings); return { success: true } }
  catch (err) { return { success: false, error: err.message } }
})

// ── Java Runtime Download ────────────────────────────────────────────
// Mojang hosts all Java runtimes at a known manifest URL.
// We download the right one for the current OS/version automatically.
const JAVA_MANIFEST_URL = 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json'

async function ensureJavaRuntime(component, mcDir) {
  const runtimeDir = path2.join(mcDir, 'runtime', component)

  // Check if already installed — look for javaw.exe / java
  const existing = findJavaBin(runtimeDir, component)
  if (existing) {
    console.log('[JavaDL] Already installed:', existing)
    return existing
  }

  console.log(`[JavaDL] Need to download Java runtime: ${component}`)

  // 1. Fetch the global Java runtime manifest
  mainWindow?.webContents.send('launch-progress', { step: 'java', msg: `Téléchargement Java (${component})…`, pct: 0 })

  const allManifest = await httpsGetJSON(JAVA_MANIFEST_URL)

  // 2. Pick the right platform key
  const platformKey = getPlatformKey()
  const platformRuntimes = allManifest[platformKey]
  if (!platformRuntimes) throw new Error(`Plateforme non supportée: ${platformKey}`)

  const runtimeEntry = platformRuntimes[component]
  if (!runtimeEntry || !runtimeEntry.length) {
    throw new Error(`Runtime Java "${component}" non trouvé pour ${platformKey}`)
  }

  const manifestUrl = runtimeEntry[0].manifest.url
  console.log('[JavaDL] Fetching file manifest from:', manifestUrl)

  // 3. Fetch the file manifest for this runtime
  const fileManifest = await httpsGetJSON(manifestUrl)
  const files = Object.entries(fileManifest.files || {})

  // Count downloadable files
  const downloadables = files.filter(([, f]) => f.type === 'file' && f.downloads?.raw)
  const total = downloadables.length
  console.log(`[JavaDL] ${total} files to download`)

  // 4. Download all files
  let done = 0
  const concurrency = 8  // parallel downloads
  const queue = [...downloadables]

  async function downloadWorker() {
    while (queue.length > 0) {
      const [filePath, fileInfo] = queue.shift()
      const dest = path2.join(runtimeDir, filePath.replace(/\//g, path2.sep))
      const dir = path2.dirname(dest)

      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      if (fs.existsSync(dest)) { done++; continue }  // skip if exists

      try {
        await httpsDownloadFile(fileInfo.downloads.raw.url, dest)
        // Make executable if it's a binary
        if (filePath.endsWith('/java') || filePath.endsWith('/javaw') || !path2.extname(filePath)) {
          try { fs.chmodSync(dest, 0o755) } catch(e) {}
        }
      } catch(e) {
        console.warn('[JavaDL] Failed to download:', filePath, e.message)
      }

      done++
      const pct = Math.round((done / total) * 100)
      if (done % 20 === 0 || done === total) {
        mainWindow?.webContents.send('launch-progress', {
          step: 'java',
          msg: `Java (${component}) : ${done}/${total} fichiers…`,
          pct
        })
      }
    }
  }

  // Run workers in parallel
  const workers = Array.from({ length: concurrency }, downloadWorker)
  await Promise.all(workers)

  mainWindow?.webContents.send('launch-progress', { step: 'java', msg: 'Java installé ✓', pct: 100 })

  // Find and return the java executable
  const javaBin = findJavaBin(runtimeDir, component)
  if (!javaBin) throw new Error(`Java installé mais exécutable introuvable dans ${runtimeDir}`)
  console.log('[JavaDL] Download complete:', javaBin)
  return javaBin
}

function getPlatformKey() {
  if (process.platform === 'win32') {
    return process.arch === 'x64' ? 'windows-x64' : 'windows-x86'
  } else if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'mac-os-arm64' : 'mac-os'
  } else {
    return process.arch === 'x64' ? 'linux' : 'linux-i386'
  }
}

function findJavaBin(runtimeDir, component) {
  if (!fs.existsSync(runtimeDir)) return null
  // Scan all subdirs for the javaw.exe / java binary
  try {
    const entries = fs.readdirSync(runtimeDir)
    for (const entry of entries) {
      const candidates = [
        path2.join(runtimeDir, entry, component, 'bin', 'javaw.exe'),
        path2.join(runtimeDir, entry, component, 'bin', 'java'),
        path2.join(runtimeDir, entry, 'bin', 'javaw.exe'),
        path2.join(runtimeDir, entry, 'bin', 'java'),
      ]
      for (const c of candidates) {
        if (fs.existsSync(c)) return c
      }
    }
    // Also check direct bin/ without subdirectory
    const direct = [
      path2.join(runtimeDir, 'bin', 'javaw.exe'),
      path2.join(runtimeDir, 'bin', 'java'),
    ]
    for (const c of direct) {
      if (fs.existsSync(c)) return c
    }
  } catch(e) {}
  return null
}

function httpsGetJSON(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const mod = u.protocol === 'https:' ? require('https') : require('http')
    mod.get(url, { headers: { 'User-Agent': 'mighty-launcher/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGetJSON(res.headers.location).then(resolve).catch(reject)
      }
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch(e) { reject(new Error('JSON parse error: ' + data.slice(0, 100))) }
      })
    }).on('error', reject)
  })
}

function httpsDownloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const mod = u.protocol === 'https:' ? require('https') : require('http')
    mod.get(url, { headers: { 'User-Agent': 'mighty-launcher/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsDownloadFile(res.headers.location, dest).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`)); return
      }
      const file = fs.createWriteStream(dest)
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
      file.on('error', reject)
    }).on('error', reject)
  })
}

// ── Télécharge le JSON de version depuis le manifest Mojang ──────────
async function downloadVersionJson(version, destJson) {
  // 1. Chercher l'URL dans le manifest global
  const manifest = await httpsGetJSON('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json')
  const entry = manifest.versions?.find(v => v.id === version)
  if (!entry) throw new Error(`Version "${version}" introuvable dans le manifest Mojang.`)

  // 2. Télécharger le JSON de cette version
  await httpsDownloadFile(entry.url, destJson)
  console.log(`[Version] JSON téléchargé : ${version}`)
}

// ── Télécharge le .jar client depuis le JSON de version ──────────────
async function downloadVersionJar(version, vJson, destJar) {
  if (!fs.existsSync(vJson)) throw new Error(`JSON de version manquant pour ${version}`)
  const vdata = JSON.parse(fs.readFileSync(vJson, 'utf8'))
  const clientUrl = vdata.downloads?.client?.url
  if (!clientUrl) throw new Error(`Pas d'URL client dans le JSON de ${version}`)

  console.log(`[Version] Téléchargement du jar : ${clientUrl}`)
  let lastPct = 10

  // Téléchargement avec progression
  await new Promise((resolve, reject) => {
    const u = new URL(clientUrl)
    const mod = require('https')
    mod.get(clientUrl, { headers: { 'User-Agent': 'Mighty/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsDownloadFile(res.headers.location, destJar).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }

      const total = parseInt(res.headers['content-length'] || '0')
      let received = 0
      const file = fs.createWriteStream(destJar)

      res.on('data', chunk => {
        received += chunk.length
        if (total > 0) {
          const pct = Math.round(10 + (received / total) * 60)
          if (pct !== lastPct) {
            lastPct = pct
            mainWindow?.webContents.send('launch-progress', {
              step: 'version',
              msg: `Minecraft ${version} : ${Math.round(received/1024/1024)}/${Math.round(total/1024/1024)} Mo…`,
              pct
            })
          }
        }
      })
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
      file.on('error', reject)
    }).on('error', reject)
  })

  // Vérifier le SHA1 si dispo
  const expectedSha = vdata.downloads?.client?.sha1
  if (expectedSha) {
    const crypto = require('crypto')
    const fileBuffer = fs.readFileSync(destJar)
    const actualSha = crypto.createHash('sha1').update(fileBuffer).digest('hex')
    if (actualSha !== expectedSha) {
      fs.unlinkSync(destJar)
      throw new Error(`SHA1 invalide pour ${version}.jar — téléchargement corrompu.`)
    }
  }

  mainWindow?.webContents.send('launch-progress', { step: 'version', msg: `Minecraft ${version} téléchargé ✓`, pct: 70 })
  console.log(`[Version] Jar téléchargé : ${version}`)
}

async function launchMinecraft(profile, settings) {
  const mcDir   = profile.gameDir || getDefaultMCDir()
  const version = profile.version
  const ramMin  = profile.ramMin || settings.ramMin || 512
  const ramMax  = profile.ramMax || settings.ramMax || 2048

  const versionDir = path2.join(mcDir, 'versions', version)
  const vJar       = path2.join(versionDir, `${version}.jar`)
  const vJson      = path2.join(versionDir, `${version}.json`)

  // ── Téléchargement automatique de la version si absente ──────────
  if (!fs.existsSync(versionDir)) fs.mkdirSync(versionDir, { recursive: true })

  if (!fs.existsSync(vJson)) {
    mainWindow?.webContents.send('launch-progress', { step: 'version', msg: `Récupération du manifeste ${version}…`, pct: 5 })
    await downloadVersionJson(version, vJson)
  }
  if (!fs.existsSync(vJar)) {
    mainWindow?.webContents.send('launch-progress', { step: 'version', msg: `Téléchargement de Minecraft ${version}…`, pct: 10 })
    await downloadVersionJar(version, vJson, vJar)
  }

  const manifest = JSON.parse(fs.readFileSync(vJson, 'utf8'))
  const libDir   = path2.join(mcDir, 'libraries')

  // ── Download missing libraries ───────────────────────────────────
  await downloadMissingLibraries(manifest, libDir)

  // ── Natives directory ─────────────────────────────────────────────
  let nativesDir = path2.join(versionDir, `${version}-natives`)
  if (!fs.existsSync(nativesDir)) {
    nativesDir = path2.join(versionDir, 'natives')
    if (!fs.existsSync(nativesDir)) fs.mkdirSync(nativesDir, { recursive: true })
    await extractNativesSimple(manifest, libDir, nativesDir)
  }

  // ── Classpath ─────────────────────────────────────────────────────
  const cp = buildCP(manifest, libDir, vJar)

  // ── Template vars ─────────────────────────────────────────────────
  const username    = settings.username || 'Player'
  const uuid        = settings.uuid    || genUUID(username)
  const accessToken = settings.accessToken || '0'
  const assetsDir   = path2.join(mcDir, 'assets')
  const assetIndex  = manifest.assetIndex?.id || version

  const vars = {
    auth_player_name:   username,
    auth_session:       accessToken,
    auth_access_token:  accessToken,
    auth_uuid:          uuid,
    auth_xuid:          '',           // not needed for offline / MS auth already done
    clientid:           '',           // not needed
    user_type:          settings.premium ? 'msa' : 'offline',
    user_properties:    '{}',
    version_name:       version,
    version_type:       manifest.type || 'release',
    game_directory:     mcDir,
    assets_root:        assetsDir,
    assets_index_name:  assetIndex,
    game_assets:        assetsDir,
    natives_directory:  nativesDir,
    launcher_name:      'mighty-launcher',
    launcher_version:   '1.0',
    classpath:          cp,
    // Resolution vars — omit by leaving empty so those args are filtered out
    resolution_width:   '',
    resolution_height:  '',
    // QuickPlay vars — empty so those args are filtered out
    quickPlayPath:         '',
    quickPlaySingleplayer: '',
    quickPlayMultiplayer:  '',
    quickPlayRealms:       '',
  }

  // ── JVM args from manifest ────────────────────────────────────────
  const jvmArgs = []
  if (manifest.arguments?.jvm) {
    for (const a of manifest.arguments.jvm) {
      if (typeof a === 'string') {
        const resolved = sub(a, vars)
        // Skip args that reference classpath — we add -cp ourselves below
        if (!resolved.includes('-cp') && !resolved.includes('${classpath}') && resolved !== cp)
          jvmArgs.push(resolved)
      } else if (a && typeof a === 'object' && a.rules && isAllowed(a.rules)) {
        const vals = Array.isArray(a.value) ? a.value : [a.value]
        vals.forEach(v => {
          const resolved = sub(v, vars)
          if (!resolved.includes('${classpath}') && resolved !== cp)
            jvmArgs.push(resolved)
        })
      }
    }
  } else {
    // Old format (pre-1.13)
    jvmArgs.push(`-Djava.library.path=${nativesDir}`)
    jvmArgs.push('-Dfml.ignoreInvalidMinecraftCertificates=true')
    jvmArgs.push('-Dfml.ignorePatchDiscrepancies=true')
  }

  // Memory
  jvmArgs.push(`-Xms${ramMin}m`, `-Xmx${ramMax}m`)

  // Extra JVM args from profile
  if (profile.jvmArgs && profile.jvmArgs.trim()) {
    jvmArgs.push(...profile.jvmArgs.trim().split(/\s+/).filter(Boolean))
  }

  // ── Game args — filter out empty-value optional args ─────────────────
  const rawGameArgs = buildGameArgs(manifest, vars)
  const gameArgs = []
  for (let i = 0; i < rawGameArgs.length; i++) {
    const arg = rawGameArgs[i]
    if (!arg || arg === '') continue

    // If this is a --flag, check if its value is empty or another --flag
    if (arg.startsWith('--')) {
      const nextArg = rawGameArgs[i + 1]
      // Check if next is a value (not another flag, not empty, not undefined)
      const hasValue = nextArg !== undefined && nextArg !== '' && !nextArg.startsWith('--')
      if (hasValue) {
        gameArgs.push(arg, nextArg)
        i++ // skip next since we consumed it
      } else if (nextArg === '' || (nextArg !== undefined && !nextArg.startsWith('--'))) {
        // Flag with empty value — skip both
        i++
      } else {
        // Standalone flag (like --demo) — skip it
        // --demo should never be passed as it locks the game to demo mode
        if (arg === '--demo') { continue }
        gameArgs.push(arg)
      }
    } else {
      gameArgs.push(arg)
    }
  }

  // ── Final args: JVM + -cp + mainClass + game ─────────────────────
  // NOTE: -cp appears exactly ONCE here
  const fullArgs = [...jvmArgs, '-cp', cp, manifest.mainClass, ...gameArgs]

  // ── Java: download if not present, use bundled JRE otherwise ─────────
  const component = manifest?.javaVersion?.component || guessRuntimeComponent(version)
  let javaPath
  if (settings.javaPath && fs.existsSync(settings.javaPath)) {
    javaPath = settings.javaPath
    console.log('[Java] Using custom path from settings:', javaPath)
  } else {
    // This downloads Java automatically if not present
    mainWindow?.webContents.send('launch-progress', { step: 'java-check', msg: `Vérification Java (${component})…`, pct: 0 })
    javaPath = await ensureJavaRuntime(component, mcDir)
  }

  // ── Log ────────────────────────────────────────────────────────────
  const logPath = path2.join(app.getPath('userData'), 'launch.log')

  // Scan runtime dir for debug info
  const runtimeDir = path2.join(mcDir, 'runtime')
  let runtimeInfo = 'runtime dir not found'
  if (fs.existsSync(runtimeDir)) {
    try {
      const components = fs.readdirSync(runtimeDir)
      runtimeInfo = components.map(comp => {
        const compPath = path2.join(runtimeDir, comp)
        try {
          const platforms = fs.readdirSync(compPath)
          return `  ${comp}/\n    ${platforms.join(', ')}`
        } catch(e) { return `  ${comp}/` }
      }).join('\n')
    } catch(e) { runtimeInfo = 'error reading: ' + e.message }
  }
  try {
    fs.writeFileSync(logPath, [
      `=== Mighty Launch Log — ${new Date().toISOString()} ===`,
      `Version: ${version}`,
      `Required Java component: ${manifest?.javaVersion?.component || 'unknown (guessed)'}`,
      `Java path used: ${javaPath}`,
      `Java exists: ${fs.existsSync(javaPath)}`,
      `mcDir: ${mcDir}`,
      `Natives: ${nativesDir}`,
      `MainClass: ${manifest.mainClass}`,
      ``,
      `Runtime directory (${runtimeDir}):`,
      runtimeInfo,
      ``,
      `Args count: ${fullArgs.length}`,
      `Full args:\n${fullArgs.map((a, i) => `  [${i}] ${a}`).join('\n')}`,
      '',
    ].join('\n'), 'utf8')
  } catch(e) {}

  console.log('[Launch] Java:', javaPath, '| exists:', fs.existsSync(javaPath))
  console.log('[Launch] MainClass:', manifest.mainClass)
  console.log('[Launch] Args count:', fullArgs.length)

  // ── Spawn ────────────────────────────────────────────────────────
  return new Promise((resolve, reject) => {
    const mc = spawn(javaPath, fullArgs, {
      cwd:   mcDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stderr = ''
    mc.stderr?.on('data', d => { stderr += d.toString() })
    mc.stdout?.on('data', d => { console.log('[MC stdout]', d.toString().trim()) })

    let launched = false
    const timeout = setTimeout(() => {
      // Still running after 4s = game launched successfully
      launched = true
      global.gameRunning = true
      try { fs.appendFileSync(logPath, `\nGame started (pid ${mc.pid})\n`) } catch(e) {}
      mc.unref()

      // ── OPTIMISATION RAM : minimiser le launcher pendant le jeu ──
      if (mainWindow && !mainWindow.isDestroyed()) {
        // Attendre 2s que MC soit bien lancé puis minimiser
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.minimize()
            // Vider le cache du renderer pour libérer la RAM
            mainWindow.webContents.session.clearCache()
          }
        }, 2000)
      }

      resolve()
    }, 4000)

    mc.on('exit', (code) => {
      clearTimeout(timeout)
      global.gameRunning = false
      if (launched) {
        // Jeu fermé — restaurer la fenêtre
        mainWindow?.webContents.send('game-exit', { code })
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.restore()
          mainWindow.focus()
        }
      } else if (code !== 0) {
        const errMsg = stderr ? stderr.substring(0, 1000) : `Java a quitté avec le code ${code}`
        try { fs.appendFileSync(logPath, `\nEXIT CODE ${code}\nSTDERR:\n${stderr}\n`) } catch(e) {}
        reject(new Error(errMsg))
      } else {
        resolve()
      }
    })

    mc.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`Impossible de lancer Java: ${err.message}\nPath: ${javaPath}`))
    })
  })
}

function sub(str, vars) {
  return str.replace(/\$\{(\w+)\}/g, (_, k) => vars[k] !== undefined ? vars[k] : `\${${k}}`)
}

// Simple native extraction using Node's built-in zlib (no external tools needed)
async function extractNativesSimple(manifest, libDir, nativesDir) {
  const os_key = process.platform === 'win32' ? 'windows'
               : process.platform === 'darwin' ? 'osx' : 'linux'

  for (const lib of manifest.libraries || []) {
    if (lib.rules && !isAllowed(lib.rules)) continue

    const classifier = lib.natives?.[os_key]
    if (!classifier) continue

    const nativePath = lib.downloads?.classifiers?.[classifier]?.path
    if (!nativePath) continue

    const nativeJar = path2.join(libDir, nativePath.replace(/\//g, path2.sep))
    if (!fs.existsSync(nativeJar)) {
      console.warn('[Natives] Missing jar:', nativeJar)
      continue
    }

    // Use PowerShell on Windows to extract .dll files from the jar (which is a ZIP)
    if (process.platform === 'win32') {
      try {
        const { execSync } = require('child_process')
        const ps = `Add-Type -Assembly System.IO.Compression.FileSystem; ` +
          `$z=[System.IO.Compression.ZipFile]::OpenRead('${nativeJar.replace(/\\/g,'/')}'); ` +
          `foreach($e in $z.Entries){if($e.Name -match '\\.(dll|so|dylib)$' -and $e.Name -notmatch 'META'){` +
          `$d='${nativesDir.replace(/\\/g,'/')}'+'/'+$e.Name; ` +
          `[System.IO.Compression.ZipFileExtensions]::ExtractToFile($e,$d,$true)}};$z.Dispose()`
        execSync(`powershell -NoProfile -NonInteractive -Command "${ps}"`, { timeout: 10000 })
        console.log('[Natives] Extracted:', path2.basename(nativeJar))
      } catch(e) {
        console.warn('[Natives] Extract failed:', e.message?.substring(0, 100))
      }
    } else {
      try {
        const { execSync } = require('child_process')
        execSync(`cd "${nativesDir}" && unzip -o -q "${nativeJar}" "*.so" "*.dylib" 2>/dev/null; true`)
      } catch(e) {}
    }
  }
}

function findJavaForVersion(mcVersion, mcDir, manifest) {
  // ── Method 1: Read javaVersion.component from the version manifest ──
  // This is the MOST reliable way — Mojang tells us exactly which JRE to use
  const component = manifest?.javaVersion?.component || guessRuntimeComponent(mcVersion)
  console.log(`[Java] Version manifest requires component: "${component}"`)

  const runtimeBase = path2.join(mcDir, 'runtime', component)

  if (fs.existsSync(runtimeBase)) {
    // Scan all subdirectories (platform folders: windows-x64, windows-x86, etc.)
    try {
      const platformDirs = fs.readdirSync(runtimeBase)
      for (const platformDir of platformDirs) {
        const candidates = [
          // Standard structure: runtime/<component>/<platform>/<component>/bin/javaw.exe
          path2.join(runtimeBase, platformDir, component, 'bin', 'javaw.exe'),
          path2.join(runtimeBase, platformDir, component, 'bin', 'java'),
          // Sometimes no intermediate component folder
          path2.join(runtimeBase, platformDir, 'bin', 'javaw.exe'),
          path2.join(runtimeBase, platformDir, 'bin', 'java'),
        ]
        for (const c of candidates) {
          if (fs.existsSync(c)) {
            console.log(`[Java] ✅ Found bundled JRE: ${c}`)
            return c
          }
        }
      }
    } catch(e) {
      console.warn('[Java] Could not scan runtime dir:', e.message)
    }
  } else {
    console.warn(`[Java] Bundled JRE dir not found: ${runtimeBase}`)
    // List what IS in the runtime dir to help debug
    const runtimeDir = path2.join(mcDir, 'runtime')
    if (fs.existsSync(runtimeDir)) {
      try {
        const dirs = fs.readdirSync(runtimeDir)
        console.log('[Java] Available runtime components:', dirs.join(', '))
        // Try any of the available components
        for (const dir of dirs) {
          const base = path2.join(runtimeDir, dir)
          const platformDirs = fs.readdirSync(base)
          for (const pd of platformDirs) {
            const candidates = [
              path2.join(base, pd, dir, 'bin', 'javaw.exe'),
              path2.join(base, pd, dir, 'bin', 'java'),
              path2.join(base, pd, 'bin', 'javaw.exe'),
            ]
            for (const c of candidates) {
              if (fs.existsSync(c)) {
                console.log(`[Java] ✅ Found fallback bundled JRE: ${c}`)
                return c
              }
            }
          }
        }
      } catch(e) {}
    } else {
      console.warn('[Java] No runtime directory at all:', runtimeDir)
    }
  }

  // ── Fallback: system Java ──────────────────────────────────────────
  console.warn('[Java] ⚠️  No bundled JRE found, using system Java (may be wrong version!)')
  if (process.platform === 'win32') {
    const bases = [
      'C:\\Program Files\\Java',
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\Microsoft',
      'C:\\Program Files\\Zulu',
      process.env.JAVA_HOME ? path2.dirname(process.env.JAVA_HOME) : '',
    ].filter(Boolean)
    for (const base of bases) {
      if (!fs.existsSync(base)) continue
      const dirs = fs.readdirSync(base)
        .filter(d => /^(jdk|jre|temurin|zulu)/i.test(d))
        .sort((a, b) => {
          // Extract version number (e.g. jdk-21.0.1 → 21, jre1.8.0_471 → 8)
          const va = parseInt((a.match(/(\d+)/) || [0, 0])[1])
          const vb = parseInt((b.match(/(\d+)/) || [0, 0])[1])
          return vb - va  // newest first
        })
      console.log('[Java] System Java candidates:', dirs)
      for (const d of dirs) {
        const exe = path2.join(base, d, 'bin', 'javaw.exe')
        if (fs.existsSync(exe)) { console.log('[Java] System Java:', exe); return exe }
      }
    }
    return 'javaw'
  }
  return 'java'
}

function guessRuntimeComponent(mcVersion) {
  const minor = parseInt(mcVersion.split('.')[1] || '0')
  if (minor >= 21) return 'java-runtime-delta'
  if (minor >= 18) return 'java-runtime-gamma'
  if (minor >= 17) return 'java-runtime-alpha'
  return 'jre-legacy'
}

// ── Download missing libraries from Mojang ────────────────────────
async function downloadMissingLibraries(manifest, libDir) {
  const missing = []

  for (const lib of manifest.libraries || []) {
    if (lib.rules && !isAllowed(lib.rules)) continue

    // Only download libs that have a downloads.artifact.url
    const artifact = lib.downloads?.artifact
    if (!artifact?.url || !artifact?.path) continue

    const dest = path2.join(libDir, artifact.path.replace(/\//g, path2.sep))
    if (fs.existsSync(dest)) continue  // already present

    missing.push({ url: artifact.url, dest, name: lib.name || artifact.path })
  }

  if (missing.length === 0) {
    console.log('[Libs] All libraries present ✓')
    return
  }

  console.log(`[Libs] Downloading ${missing.length} missing libraries…`)
  mainWindow?.webContents.send('launch-progress', {
    step: 'libs',
    msg: `Téléchargement des bibliothèques (0/${missing.length})…`,
    pct: 0
  })

  let done = 0
  const concurrency = 6
  const queue = [...missing]

  async function worker() {
    while (queue.length > 0) {
      const { url, dest, name } = queue.shift()
      try {
        const dir = path2.dirname(dest)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        await httpsDownloadFile(url, dest)
        console.log(`[Libs] ✓ ${name}`)
      } catch(e) {
        console.warn(`[Libs] ✗ Failed: ${name} — ${e.message}`)
      }
      done++
      if (done % 3 === 0 || done === missing.length) {
        const pct = Math.round((done / missing.length) * 100)
        mainWindow?.webContents.send('launch-progress', {
          step: 'libs',
          msg: `Bibliothèques : ${done}/${missing.length}…`,
          pct
        })
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))

  mainWindow?.webContents.send('launch-progress', {
    step: 'libs',
    msg: `Bibliothèques téléchargées ✓`,
    pct: 100
  })
  console.log(`[Libs] Done — ${done} libraries downloaded`)
}

function buildCP(manifest, libDir, jar) {
  const sep  = process.platform === 'win32' ? ';' : ':'
  const jars = [jar]
  for (const lib of manifest.libraries || []) {
    if (lib.rules && !isAllowed(lib.rules)) continue

    // Method 1: downloads.artifact.path (standard modern format)
    const p = lib.downloads?.artifact?.path
    if (p) {
      const full = path2.join(libDir, p.replace(/\//g, path2.sep))
      if (fs.existsSync(full)) { jars.push(full); continue }
    }

    // Method 2: derive path from lib.name (group:artifact:version)
    // e.g. "com.mojang:logging:1.2.7" -> com/mojang/logging/1.2.7/logging-1.2.7.jar
    if (lib.name) {
      const parts = lib.name.split(':')
      if (parts.length >= 3) {
        const [group, artifact, version, ...rest] = parts
        const groupPath = group.replace(/\./g, path2.sep)
        const classifier = rest.length ? `-${rest.join('-')}` : ''
        const fileName = `${artifact}-${version}${classifier}.jar`
        const full = path2.join(libDir, groupPath, artifact, version, fileName)
        if (fs.existsSync(full)) { jars.push(full); continue }
        console.warn(`[CP] Missing library: ${lib.name} -> ${full}`)
      }
    }
  }
  return jars.join(sep)
}

function isAllowed(rules) {
  let ok = false
  const m = { windows: 'win32', osx: 'darwin', linux: 'linux' }
  for (const r of rules) {
    const a = r.action === 'allow'
    if (!r.os) { ok = a; continue }
    if (m[r.os.name] === process.platform) ok = a
  }
  return ok
}

function buildGameArgs(manifest, vars) {
  const args = []
  // Old format (pre-1.13): minecraftArguments string
  if (manifest.minecraftArguments) {
    manifest.minecraftArguments.split(' ').forEach(a => args.push(sub(a, vars)))
  }
  // New format (1.13+): arguments.game array
  else if (manifest.arguments?.game) {
    for (const a of manifest.arguments.game) {
      if (typeof a === 'string') {
        args.push(sub(a, vars))
      } else if (a?.rules && isAllowed(a.rules)) {
        const vals = Array.isArray(a.value) ? a.value : [a.value]
        vals.forEach(v => args.push(sub(v, vars)))
      }
    }
  }
  return args
}
function getDefaultMCDir() {
  const h = os.homedir()
  if (process.platform === 'win32') return path2.join(h, 'AppData', 'Roaming', 'Mighty')
  if (process.platform === 'darwin') return path2.join(h, 'Library', 'Application Support', 'Mighty')
  return path2.join(h, '.mighty')
}
function genUUID(name) {
  let h = 0
  for (const c of 'OfflinePlayer:'+(name||'Player')) { h = ((h<<5)-h)+c.charCodeAt(0); h|=0 }
  return `00000000-0000-0000-0000-${Math.abs(h).toString(16).padStart(12,'0')}`
}
