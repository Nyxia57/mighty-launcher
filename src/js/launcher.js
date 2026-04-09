/* ============================================================
   launcher.js — Système de lancement complet
   Mighty Client v2.0.0
   Gère : Vanilla, Fabric, NeoForge, Forge
   ============================================================ */
'use strict';

// ── ÉTAT DU LANCEMENT ─────────────────────────────────────────
let _isLaunching  = false;
let _gameRunning  = false;
let _launchLogs   = [];
let _progressVal  = 0;
let _currentStep  = '';

// ── COULEURS DES LOADERS ──────────────────────────────────────
const LOADER_META = {
    vanilla: { label: 'Vanilla', color: '#4ade80', icon: '⬡', desc: 'Minecraft Vanilla — versions < 1.14' },
    fabric:  { label: 'Fabric',  color: '#c4a4e0', icon: 'F',  desc: 'Fabric — 1.14 à 1.21.11' },
};

// Retourne le bon loader selon la version
function getDefaultLoaderForVersion(version) {
    const v = version ? parseFloat(version) : 0;
    const isOld = v < 1.14 || version.startsWith('1.13') || version.startsWith('1.12') ||
                  version.startsWith('1.11') || version.startsWith('1.10') || version.startsWith('1.9') ||
                  version.startsWith('1.8') || version.startsWith('1.7') || version.startsWith('1.6') ||
                  version.startsWith('1.5') || version.startsWith('1.4') || version.startsWith('1.3') ||
                  version.startsWith('1.2') || version.startsWith('1.1') || version === '1.0';
    return isOld ? 'vanilla' : 'fabric';
}

// ── INJECTION CSS DE L'OVERLAY ────────────────────────────────
(function _injectLauncherCSS() {
    if (document.getElementById('launcher-css')) return;
    const s = document.createElement('style');
    s.id = 'launcher-css';
    s.textContent = `
    /* ── BOUTON JOUER ── */
    #playBtn {
        width: 100%;
        padding: 13px 0;
        border-radius: 10px;
        border: none;
        font-family: 'Inter', sans-serif;
        font-size: 15px;
        font-weight: 800;
        letter-spacing: 1.5px;
        cursor: pointer;
        transition: all 0.18s;
        position: relative;
        overflow: hidden;
        margin-top: 10px;
        text-transform: uppercase;
    }
    #playBtn.state-play {
        background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%);
        color: #fff;
        box-shadow: 0 4px 20px rgba(124,58,237,0.55);
    }
    #playBtn.state-play:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 28px rgba(124,58,237,0.7);
    }
    #playBtn.state-play:active { transform: translateY(0); }
    #playBtn.state-loading {
        background: rgba(255,255,255,0.06);
        color: #a0a0aa;
        cursor: not-allowed;
    }
    #playBtn.state-running {
        background: rgba(239,68,68,0.15);
        border: 1px solid rgba(239,68,68,0.3);
        color: #f87171;
        cursor: pointer;
    }
    #playBtn.state-running:hover { background: rgba(239,68,68,0.25); }

    /* Sélecteur loader sous le bouton */
    #loaderSelector {
        display: flex;
        gap: 5px;
        margin-top: 8px;
    }
    .loader-opt {
        flex: 1;
        padding: 6px 4px;
        border-radius: 7px;
        border: 1.5px solid var(--border);
        background: var(--bg-card);
        color: var(--text-muted);
        font-family: 'Inter', sans-serif;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .4px;
        cursor: pointer;
        text-align: center;
        transition: all 0.15s;
    }
    .loader-opt:hover { border-color: rgba(255,255,255,0.25); color: var(--text-main); }
    .loader-opt.active { color: #fff; border-color: transparent; }
    .loader-opt.active.lo-vanilla { background: rgba(74,222,128,0.25); border-color: #4ade8055; color: #4ade80; }
    .loader-opt.active.lo-fabric  { background: rgba(196,164,224,0.25); border-color: #c4a4e055; color: #c4a4e0; }

    /* ── OVERLAY DE LANCEMENT ── */
    #launchOverlay {
        position: fixed;
        inset: 0;
        z-index: 3000;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.85);
        backdrop-filter: blur(12px);
        border-radius: 14px;
    }
    #launchOverlay.visible { display: flex; }
    #launchPanel {
        width: 540px;
        max-width: 95vw;
        background: #18181c;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 14px;
        overflow: hidden;
        box-shadow: 0 30px 80px rgba(0,0,0,0.9);
        display: flex;
        flex-direction: column;
    }
    /* Header coloré */
    #launchHeader {
        padding: 20px 24px 16px;
        display: flex;
        align-items: center;
        gap: 14px;
        border-bottom: 1px solid rgba(255,255,255,0.07);
        position: relative;
        overflow: hidden;
    }
    #launchHeaderBg {
        position: absolute;
        inset: 0;
        opacity: 0.3;
        transition: background 0.5s;
    }
    #launchLoaderIcon {
        position: relative;
        width: 46px; height: 46px;
        border-radius: 12px;
        display: flex; align-items: center; justify-content: center;
        font-size: 20px; font-weight: 900;
        flex-shrink: 0;
    }
    #launchTitle {
        position: relative;
        flex: 1;
    }
    #launchTitle .lt-name {
        font-size: 16px; font-weight: 800; color: #f0f0f2; letter-spacing: .5px;
    }
    #launchTitle .lt-sub {
        font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 2px;
    }
    /* Étape courante */
    #launchStepRow {
        padding: 14px 24px 8px;
        display: flex;
        align-items: center;
        gap: 10px;
    }
    #launchSpinner {
        width: 16px; height: 16px;
        border: 2px solid rgba(255,255,255,0.1);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: lc-spin 0.7s linear infinite;
        flex-shrink: 0;
    }
    @keyframes lc-spin { to { transform: rotate(360deg); } }
    #launchStepText {
        font-size: 12px; font-weight: 600; color: #a0a0aa; flex: 1;
    }
    #launchPct {
        font-size: 11px; font-weight: 700; color: var(--accent);
    }
    /* Barre de progression */
    #launchProgressTrack {
        margin: 0 24px 14px;
        height: 6px;
        background: rgba(255,255,255,0.07);
        border-radius: 6px;
        overflow: hidden;
    }
    #launchProgressBar {
        height: 100%;
        border-radius: 6px;
        background: linear-gradient(90deg, #8B5CF6, #7C3AED);
        width: 0%;
        transition: width 0.3s ease;
    }
    /* Sous-étapes */
    #launchSteps {
        padding: 0 24px 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .ls-step {
        display: flex; align-items: center; gap: 8px;
        font-size: 11px; color: var(--text-muted);
    }
    .ls-step .ls-dot {
        width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
        background: rgba(255,255,255,0.12);
    }
    .ls-step.done .ls-dot   { background: #4ade80; }
    .ls-step.active .ls-dot { background: var(--accent); box-shadow: 0 0 6px var(--accent); animation: lc-pulse 1s infinite; }
    .ls-step.done   { color: rgba(255,255,255,0.5); }
    .ls-step.active { color: #f0f0f2; font-weight: 600; }
    @keyframes lc-pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
    /* Console logs */
    #launchLogsToggle {
        margin: 0 24px 8px;
        background: none; border: none;
        color: rgba(255,255,255,0.3); font-size: 10px; font-weight: 600;
        cursor: pointer; text-align: left; font-family: 'Inter', sans-serif;
        letter-spacing: .5px; text-transform: uppercase; padding: 0;
    }
    #launchLogsToggle:hover { color: rgba(255,255,255,0.6); }
    #launchLogsBox {
        margin: 0 24px 16px;
        background: rgba(0,0,0,0.4);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 8px;
        height: 120px;
        overflow-y: auto;
        padding: 8px 10px;
        display: none;
        scrollbar-width: thin;
    }
    .log-line {
        font-family: 'Consolas', 'Courier New', monospace;
        font-size: 10px;
        line-height: 1.6;
        color: rgba(255,255,255,0.45);
        white-space: pre-wrap;
        word-break: break-all;
    }
    .log-line.log-error { color: #f87171; }
    .log-line.log-warn  { color: #fbbf24; }
    .log-line.log-ok    { color: #4ade80; }
    /* Bouton annuler */
    #launchFooter {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 10px 24px 18px;
        gap: 10px;
    }
    #launchCancelBtn {
        padding: 8px 18px;
        border-radius: 8px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        color: rgba(255,255,255,0.4);
        font-family: 'Inter', sans-serif;
        font-size: 12px; font-weight: 600;
        cursor: pointer; transition: all 0.15s;
    }
    #launchCancelBtn:hover { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #f87171; }
    /* Écran succès */
    #launchSuccess {
        display: none;
        flex-direction: column;
        align-items: center;
        padding: 36px 24px;
        text-align: center;
    }
    #launchSuccess .ls-icon {
        width: 56px; height: 56px; border-radius: 14px;
        background: rgba(74,222,128,0.1);
        border: 1.5px solid rgba(74,222,128,0.25);
        display: flex; align-items: center; justify-content: center;
        margin-bottom: 14px;
    }
    #launchSuccess .ls-title { font-size: 18px; font-weight: 800; color: #f0f0f2; margin-bottom: 6px; }
    #launchSuccess .ls-sub   { font-size: 12px; color: var(--text-muted); }
    `;
    document.head.appendChild(s);
})();

// ── INJECTION HTML DE L'OVERLAY ───────────────────────────────
function _injectLaunchOverlay() {
    if (document.getElementById('launchOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'launchOverlay';
    overlay.innerHTML = `
    <div id="launchPanel">
        <!-- Header -->
        <div id="launchHeader">
            <div id="launchHeaderBg"></div>
            <div id="launchLoaderIcon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg></div>
            <div id="launchTitle">
                <div class="lt-name">Lancement en cours…</div>
                <div class="lt-sub" id="launchSubtitle">Minecraft 1.21.4 — Vanilla</div>
            </div>
        </div>
        <!-- Contenu principal -->
        <div id="launchMainContent">
            <!-- Étape courante -->
            <div id="launchStepRow">
                <div id="launchSpinner"></div>
                <div id="launchStepText">Initialisation…</div>
                <div id="launchPct">0%</div>
            </div>
            <!-- Barre -->
            <div id="launchProgressTrack">
                <div id="launchProgressBar"></div>
            </div>
            <!-- Étapes visuelles -->
            <div id="launchSteps">
                <div class="ls-step" id="lstep-auth"><div class="ls-dot"></div><span>Vérification du compte</span></div>
                <div class="ls-step" id="lstep-meta"><div class="ls-dot"></div><span>Récupération des métadonnées</span></div>
                <div class="ls-step" id="lstep-java"><div class="ls-dot"></div><span>Vérification Java 21 (téléchargement auto si absent)</span></div>
                <div class="ls-step" id="lstep-assets"><div class="ls-dot"></div><span>Téléchargement des assets &amp; librairies</span></div>
                <div class="ls-step" id="lstep-loader"><div class="ls-dot"></div><span>Installation du loader</span></div>
                <div class="ls-step" id="lstep-start"><div class="ls-dot"></div><span>Démarrage du jeu</span></div>
            </div>
            <!-- Logs -->
            <button id="launchLogsToggle" onclick="toggleLaunchLogs()">▸ Voir les logs</button>
            <div id="launchLogsBox"></div>
            <!-- Footer avec Annuler en bas à droite -->
            <div id="launchFooter">
                <button id="launchCancelBtn" onclick="cancelLaunch()">Annuler</button>
            </div>
        </div>
        <!-- Succès -->
        <div id="launchSuccess">
            <div class="ls-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            </div>
            <div class="ls-title">Minecraft lancé !</div>
            <div class="ls-sub" id="launchSuccessSub">Le jeu a démarré avec succès.</div>
        </div>
    </div>`;
    document.body.appendChild(overlay);
}

// ── BOUTON JOUER — déjà dans l'HTML, on branche juste les events ──────────
function _injectPlayButton() {
    // Le bouton et le sélecteur loader sont déjà dans index.html
    // On ne fait que s'assurer que les handlers sont en place
    const btn = document.getElementById('playBtn');
    if (btn) {
        btn.onclick = launchGame;
    }
    // Synchroniser les classes CSS du sélecteur loader
    syncLoaderFromProfile();
}

// ── SÉLECTION DU LOADER ───────────────────────────────────────
let _selectedLoader = 'vanilla';

function selectLoader(key) {
    _selectedLoader = key;
    document.querySelectorAll('.loader-opt').forEach(el => {
        el.classList.toggle('active', el.dataset.loader === key);
    });
    // Sauvegarder dans le profil actif
    const profiles = window._getProfiles ? window._getProfiles() : [];
    const activeId = window._getActiveProfileId ? window._getActiveProfileId() : null;
    const profile  = profiles.find(p => p.id === activeId);
    if (profile) {
        profile.loader = key;
        if (typeof saveProfiles === 'function') saveProfiles();
    }
}

// ── SYNC LOADER DEPUIS PROFIL ─────────────────────────────────
function syncLoaderFromProfile() {
    const profiles = window._getProfiles ? window._getProfiles() : [];
    const activeId = window._getActiveProfileId ? window._getActiveProfileId() : null;
    const profile  = profiles.find(p => p.id === activeId) || profiles[0];
    if (profile) {
        const loader = (profile.loader && LOADER_META[profile.loader])
            ? profile.loader
            : getDefaultLoaderForVersion(profile.version || '1.21.4');
        selectLoader(loader);
    } else {
        selectLoader('fabric');
    }
}

// ── MISE À JOUR DE L'OVERLAY ──────────────────────────────────
function _setStep(stepId, status) {
    // status: 'active' | 'done' | 'pending'
    const el = document.getElementById('lstep-' + stepId);
    if (!el) return;
    el.className = 'ls-step ' + status;
}

function _setProgress(pct, stepText) {
    _progressVal = pct;
    _currentStep = stepText || _currentStep;
    const bar  = document.getElementById('launchProgressBar');
    const pctEl = document.getElementById('launchPct');
    const stepEl = document.getElementById('launchStepText');
    if (bar)    bar.style.width = pct + '%';
    if (pctEl)  pctEl.textContent = Math.round(pct) + '%';
    if (stepEl) stepEl.textContent = stepText || _currentStep;
}

function _addLog(msg, type) {
    _launchLogs.push({ msg, type: type || 'info' });
    const box = document.getElementById('launchLogsBox');
    if (!box) return;
    const line = document.createElement('div');
    line.className = 'log-line' + (type === 'error' ? ' log-error' : type === 'warn' ? ' log-warn' : type === 'ok' ? ' log-ok' : '');
    line.textContent = msg;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
}

function toggleLaunchLogs() {
    const box = document.getElementById('launchLogsBox');
    const btn = document.getElementById('launchLogsToggle');
    if (!box || !btn) return;
    const visible = box.style.display === 'block';
    box.style.display = visible ? 'none' : 'block';
    btn.textContent   = visible ? '▸ Voir les logs' : '▾ Masquer les logs';
}

// ── AFFICHER / MASQUER L'OVERLAY ──────────────────────────────
function _showOverlay(profile, loader) {
    _injectLaunchOverlay();
    const meta = LOADER_META[loader] || LOADER_META.vanilla;

    // Reset
    _launchLogs = [];
    document.getElementById('launchLogsBox').innerHTML = '';
    document.getElementById('launchLogsToggle').textContent = '▸ Voir les logs';
    document.getElementById('launchLogsBox').style.display = 'none';
    document.getElementById('launchMainContent').style.display = 'block';
    document.getElementById('launchSuccess').style.display = 'none';
    _setProgress(0, 'Initialisation…');

    ['auth','meta','java','assets','loader','start'].forEach(s => _setStep(s, ''));

    // Couleur header
    document.getElementById('launchHeaderBg').style.background =
        `linear-gradient(135deg, ${meta.color}20, transparent)`;
    const LOADER_SVGS = {
        vanilla: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`,
        fabric:  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12h8M12 8v8"/></svg>`,
    };
    const iconEl = document.getElementById('launchLoaderIcon');
    iconEl.innerHTML = LOADER_SVGS[loader] || LOADER_SVGS.vanilla;
    iconEl.style.background = meta.color + '22';
    iconEl.style.color = meta.color;
    iconEl.style.border = `1.5px solid ${meta.color}44`;

    document.querySelector('#launchTitle .lt-name').textContent = 'Lancement en cours…';
    document.getElementById('launchSubtitle').textContent =
        `Minecraft ${profile?.version || '?'} — ${meta.label}`;

    document.getElementById('launchOverlay').classList.add('visible');
}

function _hideOverlay() {
    const ov = document.getElementById('launchOverlay');
    if (ov) ov.classList.remove('visible');
}

function _showSuccess(profile, loader) {
    const meta = LOADER_META[loader] || LOADER_META.vanilla;
    document.querySelector('#launchTitle .lt-name').textContent = 'Jeu lancé !';
    document.getElementById('launchMainContent').style.display = 'none';
    document.getElementById('launchSuccess').style.display = 'flex';
    document.getElementById('launchSuccessSub').textContent =
        `Minecraft ${profile?.version} · ${meta.label}`;
    setTimeout(_hideOverlay, 3500);
}

// ── ANNULER ───────────────────────────────────────────────────
function cancelLaunch() {
    if (window.electronAPI?.cancelLaunch) window.electronAPI.cancelLaunch();
    _isLaunching = false;
    _hideOverlay();
    _resetPlayBtn();
}

function _resetPlayBtn() {
    const btn = document.getElementById('playBtn');
    if (!btn) return;
    _gameRunning = false;
    _isLaunching = false;
    btn.className = 'state-play';
    btn.innerHTML = `<svg style="width:16px;height:16px;vertical-align:-3px;margin-right:8px;" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>JOUER`;
    btn.onclick = launchGame;
}

// ── VÉRIFICATION JAVA ─────────────────────────────────────────
async function _checkJava() {
    if (!window.electronAPI?.checkJava) return null;
    try { return await window.electronAPI.checkJava(); }
    catch { return null; }
}

// ── LANCEMENT PRINCIPAL ───────────────────────────────────────
async function launchGame() {
    if (_isLaunching || _gameRunning) return;

    // Récupérer profil actif
    const profiles = window._getProfiles ? window._getProfiles() : [];
    const activeId = window._getActiveProfileId ? window._getActiveProfileId() : null;
    const profile  = profiles.find(p => p.id === activeId) || profiles[0];

    if (!profile) {
        if (typeof showToast === 'function') showToast('Crée un profil avant de jouer !', 'error');
        if (typeof showPage  === 'function') showPage('profils');
        return;
    }

    _isLaunching = true;
    const loader = _selectedLoader || profile.loader || 'vanilla';

    // Changer état bouton
    const btn = document.getElementById('playBtn');
    if (btn) {
        btn.className = 'state-loading';
        btn.innerHTML = '<div style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.2);border-top-color:#fff;border-radius:50%;animation:lc-spin .7s linear infinite;vertical-align:-3px;margin-right:8px;"></div>CHARGEMENT…';
        btn.onclick = null;
    }

    _showOverlay(profile, loader);

    // ─── Étape 1 : Authentification ──
    _setStep('auth', 'active');
    _setProgress(5, 'Vérification du compte…');
    _addLog('[Auth] Récupération du token Minecraft…');

    let authData = null;
    try {
        if (window.electronAPI?.getActiveMcToken) {
            authData = await window.electronAPI.getActiveMcToken();
        }
    } catch(e) { _addLog('[Auth] Erreur: ' + e.message, 'warn'); }

    if (!authData?.mcToken) {
        // Mode offline / dev : on crée un faux token pour tester
        _addLog('[Auth] Aucun compte connecté — mode hors-ligne activé', 'warn');
        authData = {
            uuid: '00000000-0000-0000-0000-000000000000',
            name: 'Player',
            mcToken: 'offline',
        };
    } else {
        _addLog(`[Auth] Connecté en tant que ${authData.name}`, 'ok');
    }

    _setStep('auth', 'done');
    _setProgress(12, 'Récupération des métadonnées…');

    // ─── Étape 2 : Métadonnées ──
    _setStep('meta', 'active');
    _addLog(`[Meta] Version cible : Minecraft ${profile.version} — ${loader}`);

    await _sleep(300);
    _setStep('meta', 'done');
    _setProgress(22, 'Vérification Java…');

    // ─── Étape 3 : Java ──
    _setStep('java', 'active');
    _addLog('[Java] Recherche d\'un JRE compatible…');

    const javaInfo = await _checkJava();
    if (javaInfo?.path) {
        _addLog(`[Java] Trouvé : ${javaInfo.path} (${javaInfo.version})`, 'ok');
    } else {
        _addLog('[Java] Java non détecté localement — sera téléchargé automatiquement', 'warn');
    }

    _setStep('java', 'done');
    _setProgress(30, 'Téléchargement des fichiers…');

    // ─── Étape 4 : Assets & librairies ──
    _setStep('assets', 'active');
    _addLog(`[Download] Début du téléchargement pour ${profile.version}…`);

    // Déléguer au processus principal Electron
    let launchResult = null;
    try {
        if (window.electronAPI?.launchGame) {
            // Écouter la progression en temps réel
            window.electronAPI.onLaunchProgress((data) => {
                _handleLaunchProgress(data);
            });

            launchResult = await window.electronAPI.launchGame({
                version:       profile.version,
                loader:        loader,
                loaderVersion: profile.loaderVersion || null,
                ram:           profile.ram || 4,
                jvmArgs:       profile.jvmExtra || '',
                javaPath:      profile.javaPath  || null,
                auth:          authData,
                gameDir:       profile.gameDir   || null,
                profileId:     profile.id,
            });
        } else {
            // Pas d'Electron (mode navigateur) — simulation visuelle
            await _simulateLaunch(profile, loader);
            launchResult = { success: true, simulated: true };
        }
    } catch(e) {
        _addLog('[Erreur] ' + e.message, 'error');
        launchResult = { success: false, error: e.message };
    }

    if (launchResult?.success) {
        _setStep('assets', 'done');
        _setStep('loader', 'done');
        _setStep('start', 'done');
        _setProgress(100, 'Jeu lancé !');
        _addLog('[OK] Minecraft a démarré avec succès.', 'ok');

        _isLaunching = false;
        _gameRunning = !launchResult.simulated;

        if (btn && !launchResult.simulated) {
            btn.className = 'state-running';
            btn.innerHTML = `<svg style="width:14px;height:14px;vertical-align:-2px;margin-right:7px;" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>EN COURS — ARRÊTER`;
            btn.onclick = stopGame;
        }

        _showSuccess(profile, loader);
        if (typeof showToast === 'function') showToast('Minecraft lancé !', 'success');

        // ── Discord RPC : en jeu ──
        if (window.electronAPI?.discordUpdate) {
            window.electronAPI.discordUpdate({
                page: 'home',
                profile: profile.name + ' (' + profile.version + ')',
                server: null,
            });
        }
    } else {
        _addLog('[Erreur] Échec du lancement : ' + (launchResult?.error || 'Inconnue'), 'error');

        // Barre rouge
        const bar = document.getElementById('launchProgressBar');
        if (bar) { bar.style.background = '#ef4444'; bar.style.width = '100%'; }

        // Stopper le spinner
        const spinner = document.getElementById('launchSpinner');
        if (spinner) spinner.style.display = 'none';

        // Texte d'étape
        const stepEl = document.getElementById('launchStepText');
        if (stepEl) stepEl.textContent = 'Erreur — voir les logs ci-dessous';
        const pctEl = document.getElementById('launchPct');
        if (pctEl) pctEl.style.color = '#f87171';

        // Ouvrir les logs automatiquement
        const box = document.getElementById('launchLogsBox');
        const logBtn = document.getElementById('launchLogsToggle');
        if (box) box.style.display = 'block';
        if (logBtn) logBtn.textContent = '▾ Masquer les logs';

        // Bouton devient "Fermer" — l'overlay reste ouvert jusqu'au clic
        const cancelBtn = document.getElementById('launchCancelBtn');
        if (cancelBtn) {
            cancelBtn.textContent = 'Fermer';
            cancelBtn.style.background = 'rgba(239,68,68,0.1)';
            cancelBtn.style.borderColor = 'rgba(239,68,68,0.3)';
            cancelBtn.style.color = '#f87171';
        }

        _isLaunching = false;
        _resetPlayBtn();
        if (typeof showToast === 'function') showToast('Erreur de lancement — voir les logs', 'error');
    }
}

// ── GESTIONNAIRE DE PROGRESSION IPC ───────────────────────────
function _handleLaunchProgress(data) {
    switch(data.type) {
        case 'download-start':
            _setStep('assets', 'active');
            _addLog(`[Download] ${data.total || 0} fichier(s) à télécharger`);
            break;
        case 'download-progress':
            _setProgress(30 + (data.pct || 0) * 0.4, `Téléchargement : ${data.name || ''}…`);
            _addLog(`[DL] ${data.name} (${_formatBytes(data.size || 0)})`);
            break;
        case 'download-done':
            _setStep('assets', 'done');
            _setProgress(70, 'Vérification des fichiers…');
            _addLog('[Download] Tous les fichiers sont prêts.', 'ok');
            break;
        case 'loader-install':
            _setStep('loader', 'active');
            _setProgress(75, `Installation de ${data.loader}…`);
            _addLog(`[Loader] Installation de ${data.loader} ${data.version || ''}…`);
            break;
        case 'loader-done':
            _setStep('loader', 'done');
            _setProgress(88, 'Préparation du lancement…');
            _addLog(`[Loader] ${data.loader} installé.`, 'ok');
            break;
        case 'game-start':
            _setStep('start', 'active');
            _setProgress(95, 'Démarrage du jeu…');
            _addLog('[Game] Lancement du processus Minecraft…', 'ok');
            break;
        case 'game-log':
            _addLog('[MC] ' + data.msg);
            break;
        case 'game-error-detail':
            // Afficher un résumé lisible du crash
            _addLog('', 'error');
            _addLog('=== DERNIÈRES LIGNES DU CRASH ===', 'error');
            (data.log || '').split('\n').slice(-15).forEach(l => {
                if (l.trim()) _addLog(l, l.toLowerCase().includes('error') || l.toLowerCase().includes('exception') ? 'error' : 'info');
            });
            break;
        case 'game-error':
            _addLog('[Erreur] ' + data.msg, 'error');
            break;
        case 'game-close':
            _gameRunning = false;
            _resetPlayBtn();
            // Discord RPC : retour à l'accueil, effacer le profil actif
            if (window.electronAPI?.discordUpdate) {
                window.electronAPI.discordUpdate({ page: 'home', profile: null, server: null });
            }
            if (data.code !== 0 && data.code !== null) {
                // Crash ou erreur — garder l'overlay ouvert
                _addLog(`[Game] Minecraft s'est fermé avec le code ${data.code}`, 'error');
                const bar2 = document.getElementById('launchProgressBar');
                if (bar2) { bar2.style.background = '#ef4444'; bar2.style.width = '100%'; }
                const sp2 = document.getElementById('launchSpinner');
                if (sp2) sp2.style.display = 'none';
                const st2 = document.getElementById('launchStepText');
                if (st2) st2.textContent = `Minecraft s'est fermé (code ${data.code}) — voir les logs`;
                const box2 = document.getElementById('launchLogsBox');
                const lb2  = document.getElementById('launchLogsToggle');
                if (box2) box2.style.display = 'block';
                if (lb2) lb2.textContent = '▾ Masquer les logs';
                const cb2 = document.getElementById('launchCancelBtn');
                if (cb2) { cb2.textContent = 'Fermer'; cb2.style.color = '#f87171'; }
                if (typeof showToast === 'function') showToast(`Minecraft s'est fermé avec le code ${data.code}`, 'error');
            } else {
                _addLog('[Game] Minecraft fermé normalement.', 'ok');
                if (typeof showToast === 'function') showToast('Minecraft fermé.', 'info');
            }
            break;
    }
}

// ── SIMULATION (mode navigateur sans Electron) ────────────────
async function _simulateLaunch(profile, loader) {
    const steps = [
        { delay: 500,  pct: 35, step: 'assets', msg: `[Download] Téléchargement client ${profile.version}.jar…` },
        { delay: 700,  pct: 45, msg: '[Download] log4j-core.jar… (1.2 Mo)' },
        { delay: 500,  pct: 55, msg: '[Download] lwjgl-3.3.2.jar… (4.8 Mo)' },
        { delay: 600,  pct: 65, msg: '[Download] assets/indexes/14.json…' },
        { delay: 400,  pct: 70, stepDone: 'assets', msg: '[Download] Tous les fichiers téléchargés.', type: 'ok' },
    ];

    if (loader !== 'vanilla') {
        steps.push(
            { delay: 600, pct: 75, step: 'loader',     msg: `[Loader] Téléchargement ${loader}…` },
            { delay: 800, pct: 85, stepDone: 'loader', msg: `[Loader] ${LOADER_META[loader].label} installé.`, type: 'ok' }
        );
    } else {
        steps.push({ delay: 0, pct: 85, stepDone: 'loader', msg: '' });
    }

    steps.push(
        { delay: 600, pct: 93, step: 'start', msg: '[Game] Construction de la ligne de commande…' },
        { delay: 700, pct: 98, msg: `[Game] java -Xmx${profile.ram || 4}G -jar minecraft.jar --version ${profile.version}`, type: 'ok' }
    );

    for (const s of steps) {
        await _sleep(s.delay);
        if (s.msg)       _addLog(s.msg, s.type);
        if (s.pct)       _setProgress(s.pct, document.getElementById('launchStepText')?.textContent);
        if (s.step)      _setStep(s.step, 'active');
        if (s.stepDone)  _setStep(s.stepDone, 'done');
    }
    await _sleep(400);
}

// ── STOPPER LE JEU ────────────────────────────────────────────
function stopGame() {
    if (window.electronAPI?.stopGame) window.electronAPI.stopGame();
    _gameRunning = false;
    // Discord RPC : jeu arrêté manuellement
    if (window.electronAPI?.discordUpdate) {
        window.electronAPI.discordUpdate({ page: 'home', profile: null, server: null });
    }
    _resetPlayBtn();
    if (typeof showToast === 'function') showToast('Minecraft arrêté.', 'info');
}

// ── UTILITAIRES ───────────────────────────────────────────────
function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function _formatBytes(b) {
    if (b < 1024) return b + ' o';
    if (b < 1048576) return (b/1024).toFixed(1) + ' Ko';
    return (b/1048576).toFixed(1) + ' Mo';
}

// ── INIT ──────────────────────────────────────────────────────
function initLauncher() {
    _injectPlayButton();
    syncLoaderFromProfile();

    // Écouter les fermetures de jeu depuis Electron
    if (window.electronAPI?.onGameClose) {
        window.electronAPI.onGameClose(() => {
            _gameRunning = false;
            _resetPlayBtn();
            if (typeof showToast === 'function') showToast('Minecraft fermé.', 'info');
        });
    }
}

// ── EXPORTS ───────────────────────────────────────────────────
window.initLauncher         = initLauncher;
window.launchGame           = launchGame;
window.stopGame             = stopGame;
window.cancelLaunch         = cancelLaunch;
window.selectLoader         = selectLoader;
window.syncLoaderFromProfile = syncLoaderFromProfile;
window.toggleLaunchLogs     = toggleLaunchLogs;
window._handleLaunchProgress = _handleLaunchProgress;
