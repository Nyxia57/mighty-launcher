const { app, BrowserWindow, ipcMain, shell } = require('electron')
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
  const ramMin  = profile.ramMin || settings.ramMin || 512
  const ramMax  = profile.ramMax || settings.ramMax || 2048

  const versionDir = path2.join(mcDir, 'versions', version)
  const vJar       = path2.join(versionDir, `${version}.jar`)
  const vJson      = path2.join(versionDir, `${version}.json`)

  if (!fs.existsSync(vJar))  throw new Error(`Version ${version} non installée.\n\nLancez d'abord le launcher Mojang officiel pour télécharger cette version.`)
  if (!fs.existsSync(vJson)) throw new Error(`Manifeste manquant pour ${version}.`)

  const manifest = JSON.parse(fs.readFileSync(vJson, 'utf8'))
  const libDir   = path2.join(mcDir, 'libraries')

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

  // ── Game args — filter out empty-value optional args ────────────────
  const rawGameArgs = buildGameArgs(manifest, vars)
  // Remove pairs where value is empty (e.g. --quickPlayPath "")
  const gameArgs = []
  for (let i = 0; i < rawGameArgs.length; i++) {
    const arg = rawGameArgs[i]
    const next = rawGameArgs[i + 1]
    // If next arg is empty string, skip both this flag and its empty value
    if (next === '' || next === undefined) {
      if (arg.startsWith('--')) { i++; continue } // skip flag + empty value
    }
    if (arg === '') continue  // skip standalone empty args (like --demo with no value)
    gameArgs.push(arg)
  }

  // ── Final args: JVM + -cp + mainClass + game ─────────────────────
  // NOTE: -cp appears exactly ONCE here
  const fullArgs = [...jvmArgs, '-cp', cp, manifest.mainClass, ...gameArgs]

  // ── Java: use Minecraft's bundled JRE (correct version for this MC) ──
  const javaPath = settings.javaPath || findJavaForVersion(version, mcDir)

  // ── Log ────────────────────────────────────────────────────────────
  const logPath = path2.join(app.getPath('userData'), 'launch.log')
  try {
    fs.writeFileSync(logPath, [
      `=== Mighty Launch Log — ${new Date().toISOString()} ===`,
      `Version: ${version}`,
      `Java: ${javaPath}`,
      `Java exists: ${fs.existsSync(javaPath)}`,
      `mcDir: ${mcDir}`,
      `Natives: ${nativesDir}`,
      `MainClass: ${manifest.mainClass}`,
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

    const timeout = setTimeout(() => {
      // Still running after 4s = game launched successfully
      try { fs.appendFileSync(logPath, `\nGame started (pid ${mc.pid})\n`) } catch(e) {}
      mc.unref()
      resolve()
    }, 4000)

    mc.on('exit', (code) => {
      clearTimeout(timeout)
      if (code !== 0) {
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

function findJavaForVersion(mcVersion, mcDir) {
  const parts = mcVersion.split('.')
  const minor = parseInt(parts[1] || '0')

  // Minecraft bundles its own JRE in .minecraft/runtime/
  // This is ALWAYS the right Java — it's exactly what Mojang chose for this version
  const runtimeDir = path2.join(mcDir, 'runtime')

  if (fs.existsSync(runtimeDir)) {
    // Runtime component names per MC version:
    // 1.21+    → java-runtime-delta  (Java 21)
    // 1.18-1.20→ java-runtime-gamma  (Java 17)
    // 1.17     → java-runtime-alpha  (Java 16)
    // < 1.17   → jre-legacy          (Java 8)
    const runtimePriority =
      minor >= 21 ? ['java-runtime-delta', 'java-runtime-gamma']
    : minor >= 18 ? ['java-runtime-gamma', 'java-runtime-delta']
    : minor >= 17 ? ['java-runtime-alpha', 'java-runtime-gamma']
    :               ['jre-legacy', 'java-runtime-alpha']

    const platform =
      process.platform === 'win32' ? 'windows-x64'
    : process.platform === 'darwin' ? 'mac-os'
    : 'linux'

    for (const rt of runtimePriority) {
      const candidates = [
        path2.join(runtimeDir, rt, platform, rt, 'bin', 'javaw.exe'),   // Windows
        path2.join(runtimeDir, rt, platform, rt, 'bin', 'java'),        // Linux/Mac
        path2.join(runtimeDir, rt, 'windows-x64', rt, 'bin', 'javaw.exe'),
        path2.join(runtimeDir, rt, 'windows-x86', rt, 'bin', 'javaw.exe'),
        path2.join(runtimeDir, rt, 'mac-os', rt, 'jre.bundle', 'Contents', 'Home', 'bin', 'java'),
        path2.join(runtimeDir, rt, 'linux', rt, 'bin', 'java'),
      ]
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          console.log(`[Java] Using Minecraft bundled JRE (${rt}): ${c}`)
          return c
        }
      }
      // Try listing the directory to find actual subfolder name
      const rtBase = path2.join(runtimeDir, rt)
      if (fs.existsSync(rtBase)) {
        try {
          const subdirs = fs.readdirSync(rtBase)
          for (const sub of subdirs) {
            const javaw = path2.join(rtBase, sub, rt, 'bin', 'javaw.exe')
            const java  = path2.join(rtBase, sub, rt, 'bin', 'java')
            if (fs.existsSync(javaw)) { console.log('[Java] Found via subdir scan:', javaw); return javaw }
            if (fs.existsSync(java))  { console.log('[Java] Found via subdir scan:', java);  return java  }
          }
        } catch(e) {}
      }
    }
  }

  // Fallback: system Java (may be wrong version — warn)
  console.warn(`[Java] ⚠️  No bundled JRE found! Falling back to system Java. MC ${mcVersion} needs Java ${minor >= 21 ? 21 : minor >= 17 ? 17 : 8}`)

  if (process.platform === 'win32') {
    // Try to find a recent system Java
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
        .sort().reverse()  // prefer newer versions
      for (const d of dirs) {
        const exe = path2.join(base, d, 'bin', 'javaw.exe')
        if (fs.existsSync(exe)) {
          console.log('[Java] Using system Java:', exe)
          return exe
        }
      }
    }
    return 'javaw'
  }
  return 'java'
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
  if (process.platform === 'win32') return path2.join(h, 'AppData', 'Roaming', '.minecraft')
  if (process.platform === 'darwin') return path2.join(h, 'Library', 'Application Support', 'minecraft')
  return path2.join(h, '.minecraft')
}
function genUUID(name) {
  let h = 0
  for (const c of 'OfflinePlayer:'+(name||'Player')) { h = ((h<<5)-h)+c.charCodeAt(0); h|=0 }
  return `00000000-0000-0000-0000-${Math.abs(h).toString(16).padStart(12,'0')}`
}
