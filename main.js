const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const https = require('https')
const http  = require('http')
const { URL } = require('url')

// ═══════════════════════════════════════
// ZENITHMC — AUTH MICROSOFT / MINECRAFT
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
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#08070f',
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
  })
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'))
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (!mainWindow) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// ─── WINDOW CONTROLS ───
ipcMain.on('minimize', () => mainWindow?.minimize())
ipcMain.on('maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize())
ipcMain.on('close',    () => mainWindow?.close())

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
      title: 'Connexion Microsoft — ZenithMC',
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

// ─── MODRINTH PROXY ───
ipcMain.handle('modrinth-search', async (_, params) => {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams(params).toString()
    const req = https.request({
      hostname: 'api.modrinth.com',
      path:     `/v2/search?${qs}`,
      method:   'GET',
      headers:  { 'User-Agent': 'ZenithMC/1.0', 'Accept': 'application/json' },
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

async function launchMinecraft(profile, settings) {
  const mcDir   = profile.gameDir || getDefaultMCDir()
  const version = profile.version
  const javaPath= settings.javaPath || findJava()
  const ramMin  = profile.ramMin || settings.ramMin || 512
  const ramMax  = profile.ramMax || settings.ramMax || 2048

  const vJar  = path2.join(mcDir, 'versions', version, `${version}.jar`)
  const vJson = path2.join(mcDir, 'versions', version, `${version}.json`)
  if (!fs.existsSync(vJar)) throw new Error(`Version ${version} non installée — lancez d'abord le launcher Mojang officiel.`)

  const manifest = JSON.parse(fs.readFileSync(vJson, 'utf8'))
  const cp        = buildCP(manifest, path2.join(mcDir, 'libraries'), vJar)
  const nativesDir= path2.join(mcDir, 'versions', version, `${version}-natives`)
  const vars = {
    auth_player_name:  settings.username || settings.name || 'Player',
    version_name:      version,
    game_directory:    mcDir,
    assets_root:       path2.join(mcDir, 'assets'),
    assets_index_name: manifest.assetIndex?.id || version,
    auth_uuid:         settings.uuid || genUUID(settings.username || settings.name),
    auth_access_token: settings.accessToken || '0',
    user_type:         settings.premium ? 'msa' : 'offline',
    version_type:      manifest.type || 'release',
  }
  const args = [
    `-Xms${ramMin}m`, `-Xmx${ramMax}m`,
    `-Djava.library.path=${nativesDir}`,
    '-cp', cp, manifest.mainClass,
    ...buildGameArgs(manifest, vars),
  ]
  if (profile.jvmArgs) args.push(...profile.jvmArgs.split(' ').filter(Boolean))
  const mc = spawn(javaPath, args, { cwd: mcDir, detached: true, stdio: 'ignore' })
  mc.unref()
}

function buildCP(manifest, libDir, jar) {
  const sep  = process.platform === 'win32' ? ';' : ':'
  const jars = [jar]
  for (const lib of manifest.libraries || []) {
    if (lib.rules && !isAllowed(lib.rules)) continue
    const p = lib.downloads?.artifact?.path
    if (!p) continue
    const full = path2.join(libDir, p.replace(/\//g, path2.sep))
    if (fs.existsSync(full)) jars.push(full)
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
  const sub = s => s.replace(/\$\{(\w+)\}/g, (_, k) => vars[k] || '')
  const args = []
  if (manifest.minecraftArguments) manifest.minecraftArguments.split(' ').forEach(a => args.push(sub(a)))
  else if (manifest.arguments?.game) {
    for (const a of manifest.arguments.game) {
      if (typeof a === 'string') args.push(sub(a))
      else if (a.rules && isAllowed(a.rules)) (Array.isArray(a.value) ? a.value : [a.value]).forEach(v => args.push(sub(v)))
    }
  }
  return args
}
function getDefaultMCDir() {
  const h = os.homedir()
  if (process.platform === 'win32') return path2.join(h, 'AppData', 'Roaming', '.minecraft')
  if (process.platform === 'darwin') return path2.join(h, 'Library', 'Application Support', 'minecraft')
  return path2.join(h, '.minecraft')
}
function findJava() {
  if (process.platform === 'win32') {
    for (const base of ['C:\\Program Files\\Java','C:\\Program Files\\Eclipse Adoptium']) {
      if (fs.existsSync(base)) {
        const dirs = fs.readdirSync(base).filter(d => /^jdk|^jre|^temurin/i.test(d)).sort()
        if (dirs.length) return path2.join(base, dirs[dirs.length-1], 'bin', 'javaw.exe')
      }
    }
    const mcJre = path2.join(os.homedir(), 'AppData', 'Roaming', '.minecraft', 'runtime')
    if (fs.existsSync(mcJre)) {
      for (const jrt of ['java-runtime-delta','java-runtime-gamma','java-runtime-alpha']) {
        const p = path2.join(mcJre, jrt, 'windows-x64', jrt, 'bin', 'javaw.exe')
        if (fs.existsSync(p)) return p
      }
    }
    return 'javaw'
  }
  return 'java'
}
function genUUID(name) {
  let h = 0
  for (const c of 'OfflinePlayer:'+(name||'Player')) { h = ((h<<5)-h)+c.charCodeAt(0); h|=0 }
  return `00000000-0000-0000-0000-${Math.abs(h).toString(16).padStart(12,'0')}`
}
