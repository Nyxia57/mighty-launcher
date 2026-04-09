/* ============================================================
   settings.js — Paramètres du launcher
   Mighty Client v2.0.0
   ============================================================
   Onglets : Général · Java & RAM · Graphismes · Réseau · Dossiers · À propos
   ============================================================ */

'use strict';

// ── ÉTAT DES PARAMÈTRES ──────────────────────────────────────

const DEFAULT_SETTINGS = {
    // Général
    language:           'fr',
    theme:              'dark',
    autoUpdate:         true,
    closeOnLaunch:      false,
    keepLogs:           true,
    discordRpc:         true,
    showNews:           true,
    animationsEnabled:  true,

    // Java & RAM
    ramMin:             2,
    ramMax:             4,
    javaPath:           '',
    jvmArgs:            '',
    autoDetectJava:     true,
    useCustomJvmArgs:   false,

    // Graphismes / Fenêtre
    resolutionPreset:   'default',
    resolutionW:        854,
    resolutionH:        480,
    fullscreen:         false,
    customResolution:   false,
    renderDistance:     8,
    maxFps:             0,
    vsync:              false,
    fancyGraphics:      true,

    // Réseau
    proxyEnabled:       false,
    proxyHost:          '',
    proxyPort:          8080,
    proxyAuth:          false,
    proxyUser:          '',
    proxyPass:          '',
    launchTimeout:      60,

    // Dossiers
    installPath:        '',
    screenshotPath:     '',
    backupEnabled:      false,
    backupPath:         '',
    clearCacheOnLaunch: false,
};

let _settings    = { ...DEFAULT_SETTINGS };
let _currentTab  = 'general';

// ── CHARGEMENT / SAUVEGARDE ──────────────────────────────────

async function loadSettings() {
    try {
        if (window.electronAPI?.loadConfig) {
            const cfg = await window.electronAPI.loadConfig();
            if (cfg && typeof cfg === 'object') {
                const saved = cfg.settings && typeof cfg.settings === 'object' ? cfg.settings : cfg;
                _settings = { ...DEFAULT_SETTINGS, ...saved };
            }
        } else {
            const saved = localStorage.getItem('mighty-settings');
            if (saved) _settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        }
    } catch (e) {
        console.warn('[Settings] Chargement échoué :', e);
    }
}

async function saveSettings() {
    try {
        const settingsOnly = {};
        Object.keys(DEFAULT_SETTINGS).forEach(k => {
            settingsOnly[k] = _settings[k] !== undefined ? _settings[k] : DEFAULT_SETTINGS[k];
        });

        if (window.electronAPI?.saveConfig) {
            await window.electronAPI.saveConfig({ settings: settingsOnly });
        } else {
            localStorage.setItem('mighty-settings', JSON.stringify(settingsOnly));
        }
        showToast('Paramètres sauvegardés', 'success');
    } catch (e) {
        console.warn('[Settings] Sauvegarde échouée :', e);
        showToast('Erreur lors de la sauvegarde', 'error');
    }
}

function getSetting(key) {
    return _settings[key] !== undefined ? _settings[key] : DEFAULT_SETTINGS[key];
}

function setSetting(key, value) {
    _settings[key] = value;
}

// ── NAVIGATION ENTRE ONGLETS ─────────────────────────────────

function switchSettingsTab(tabId, el) {
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    else {
        const target = document.querySelector(`.settings-tab[data-tab="${tabId}"]`);
        if (target) target.classList.add('active');
    }
    _currentTab = tabId;
    renderSettings(tabId);
}

// ── RENDU ────────────────────────────────────────────────────

function renderSettings(tabId) {
    const container = document.getElementById('settingsContent');
    if (!container) return;
    _currentTab = tabId || _currentTab;
    container.innerHTML = '';

    switch (_currentTab) {
        case 'general':   container.innerHTML = renderGeneral();   break;
        case 'java':      container.innerHTML = renderJava();      break;
        case 'graphics':  container.innerHTML = renderGraphics();  break;
        case 'network':   container.innerHTML = renderNetwork();   break;
        case 'folders':   container.innerHTML = renderFolders();   break;
        case 'about':     container.innerHTML = renderAbout();     break;
    }

    bindSettingsEvents();
}

// ── HELPERS HTML ─────────────────────────────────────────────

function row(label, desc, control) {
    return `
    <div class="settings-row">
        <div>
            <div class="settings-row-label">${label}</div>
            ${desc ? `<div class="settings-row-desc">${desc}</div>` : ''}
        </div>
        <div class="settings-row-control">${control}</div>
    </div>`;
}

function toggle(key) {
    const checked = getSetting(key) ? 'checked' : '';
    return `<label class="toggle-switch">
        <input type="checkbox" data-key="${key}" ${checked}>
        <span class="toggle-track"></span>
        <span class="toggle-thumb"></span>
    </label>`;
}

function select(key, options) {
    const val = getSetting(key);
    const opts = options.map(([v, l]) =>
        `<option value="${v}" ${val == v ? 'selected' : ''}>${l}</option>`
    ).join('');
    return `<select class="settings-select" data-key="${key}">${opts}</select>`;
}

function numberInput(key, min, max, step = 1, suffix = '') {
    return `<div style="display:flex;align-items:center;gap:6px;">
        <input type="number" class="settings-input" data-key="${key}"
            value="${getSetting(key)}" min="${min}" max="${max}" step="${step}"
            style="width:70px;text-align:center;">
        ${suffix ? `<span style="font-size:11px;color:var(--text-muted)">${suffix}</span>` : ''}
    </div>`;
}

function slider(key, min, max, step, suffix = '') {
    const val = getSetting(key);
    return `<div style="display:flex;align-items:center;gap:8px;">
        <input type="range" class="settings-slider" data-key="${key}"
            value="${val}" min="${min}" max="${max}" step="${step}" style="width:130px;">
        <span class="settings-slider-val" data-val-for="${key}" style="font-size:11px;color:var(--text-sub);min-width:40px;text-align:right;">${val}${suffix}</span>
    </div>`;
}

function textInput(key, placeholder = '', width = '220px') {
    return `<input type="text" class="settings-input" data-key="${key}"
        value="${getSetting(key)}" placeholder="${placeholder}"
        style="width:${width};">`;
}

function section(title, ...rows) {
    return `<div class="settings-section" style="margin-bottom:16px;">
        <div class="settings-section-title">${title}</div>
        ${rows.join('')}
    </div>`;
}

function ramSlider(key, min, max) {
    const val = getSetting(key);
    return `<div style="display:flex;align-items:center;gap:8px;">
        <input type="range" class="settings-slider" data-key="${key}"
            value="${val}" min="${min}" max="${max}" step="0.5" style="width:130px;">
        <span class="settings-slider-val" data-val-for="${key}" style="font-size:12px;font-weight:700;color:var(--accent);min-width:48px;text-align:right;">${val} Go</span>
    </div>`;
}

function badge(text, color = '#7C5CBF') {
    return `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:${color}22;color:${color};border:1px solid ${color}33;">${text}</span>`;
}

function folderRow(label, desc, key, placeholder) {
    const val = getSetting(key);
    return `<div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:8px;">
        <div>
            <div class="settings-row-label">${label}</div>
            ${desc ? `<div class="settings-row-desc">${desc}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;width:100%;">
            <input type="text" class="settings-input" data-key="${key}"
                value="${val}" placeholder="${placeholder}"
                style="flex:1;width:auto;">
            <button class="btn" style="font-size:11px;padding:5px 10px;flex-shrink:0;"
                onclick="pickFolder('${key}')">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                Parcourir
            </button>
        </div>
    </div>`;
}

function saveBtn() {
    return `<div style="display:flex;justify-content:flex-end;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">
        <button id="settingsSaveBtn" class="btn btn-login" style="padding:7px 22px;font-size:12px;display:flex;align-items:center;gap:7px;transition:all 0.2s;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Sauvegarder
        </button>
    </div>`;
}

// ── ONGLET GÉNÉRAL ───────────────────────────────────────────

function renderGeneral() {
    return section('Launcher',
        row('Langue', 'Langue de l\'interface',
            select('language', [['fr','Français'],['en','English'],['de','Deutsch'],['es','Español'],['pt','Português'],['nl','Nederlands']])
        ),
        row('Thème', 'Apparence du launcher',
            select('theme', [['dark','Sombre'],['light','Clair'],['midnight','Midnight'],['amoled','AMOLED']])
        ),
        row('Mise à jour automatique', 'Vérifie et installe les mises à jour au démarrage',
            toggle('autoUpdate')
        ),
        row('Fermer au lancement', 'Ferme le launcher quand Minecraft démarre',
            toggle('closeOnLaunch')
        ),
        row('Conserver les logs', 'Garde un historique des logs de lancement',
            toggle('keepLogs')
        ),
        row('Discord Rich Presence', 'Affiche ton activité Minecraft sur Discord',
            toggle('discordRpc')
        ),
        row('Afficher les actualités', 'Montre les news Minecraft sur l\'accueil',
            toggle('showNews')
        ),
        row('Animations de l\'interface', 'Active les transitions et animations visuelles',
            toggle('animationsEnabled')
        )
    ) + saveBtn();
}

// ── ONGLET JAVA & RAM ────────────────────────────────────────

function renderJava() {
    const totalRam = (() => {
        try { return window.electronAPI?.getTotalRam ? '(système : détection auto)' : ''; }
        catch { return ''; }
    })();

    return section('Mémoire RAM',
        `<div style="background:rgba(124,92,191,0.08);border:1px solid rgba(124,92,191,0.2);border-radius:10px;padding:14px 16px;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <div>
                    <div style="font-size:12px;font-weight:700;color:var(--text-main);">RAM minimum (Xms)</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">Mémoire allouée au démarrage de la JVM</div>
                </div>
                ${ramSlider('ramMin', 0.5, 8)}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <div style="font-size:12px;font-weight:700;color:var(--text-main);">RAM maximum (Xmx)</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">Plafond de mémoire pour Minecraft</div>
                </div>
                ${ramSlider('ramMax', 1, 32)}
            </div>
        </div>`,
        `<div style="display:flex;gap:6px;margin-bottom:4px;">
            ${[2,4,6,8,12,16].map(v => `<button class="btn ram-quick-btn" data-ram="${v}" style="flex:1;font-size:11px;font-weight:700;padding:5px 2px;transition:all 0.15s;" onclick="setRamQuick(${v})">${v} Go</button>`).join('')}
        </div>`
    ) +
    section('Java',
        row('Détection automatique', 'Utilise le Java intégré ou détecté sur le système',
            toggle('autoDetectJava')
        ),
        `<div id="javaPathRow" style="display:${getSetting('autoDetectJava') ? 'none' : 'block'};">
            ${folderRow('Chemin Java personnalisé', 'Pointe vers l\'exécutable java.exe ou java', 'javaPath', 'C:\\Program Files\\Java\\jdk-21\\bin\\java.exe')}
        </div>`,
        row('Arguments JVM personnalisés', 'Activer pour ajouter des flags JVM supplémentaires',
            toggle('useCustomJvmArgs')
        ),
        `<div id="jvmArgsRow" style="display:${getSetting('useCustomJvmArgs') ? 'block' : 'none'};">
            <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:8px;">
                <div class="settings-row-label">Arguments JVM</div>
                <div class="settings-row-desc">Flags additionnels passés à la JVM (ex: -XX:+UseG1GC -XX:+UnlockExperimentalVMOptions)</div>
                <textarea class="settings-input" data-key="jvmArgs" placeholder="-XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20"
                    style="width:100%;box-sizing:border-box;height:70px;resize:vertical;font-size:11px;font-family:monospace;line-height:1.5;">${getSetting('jvmArgs')}</textarea>
            </div>
        </div>`,
        `<div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;">
            <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;width:100%;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Presets JVM recommandés</div>
            <button class="btn" style="font-size:10px;padding:4px 10px;" onclick="applyJvmPreset('g1gc')">⚡ G1GC (recommandé)</button>
            <button class="btn" style="font-size:10px;padding:4px 10px;" onclick="applyJvmPreset('zgc')">🚀 ZGC (Java 15+)</button>
            <button class="btn" style="font-size:10px;padding:4px 10px;" onclick="applyJvmPreset('aikar')">🎮 Aikar (serveur)</button>
            <button class="btn" style="font-size:10px;padding:4px 10px;" onclick="applyJvmPreset('clear')">🗑 Effacer</button>
        </div>`
    ) + saveBtn();
}

// ── ONGLET GRAPHISMES ────────────────────────────────────────

function renderGraphics() {
    return section('Fenêtre de jeu',
        row('Plein écran au lancement', 'Lance Minecraft en mode plein écran',
            toggle('fullscreen')
        ),
        row('Résolution personnalisée', 'Définir la taille de la fenêtre Minecraft',
            toggle('customResolution')
        ),
        `<div id="resolutionInputs" style="display:${getSetting('customResolution') ? 'block' : 'none'};">
            <div class="settings-row">
                <div>
                    <div class="settings-row-label">Résolution</div>
                    <div class="settings-row-desc">Largeur × Hauteur en pixels</div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                    <input type="number" class="settings-input" data-key="resolutionW"
                        value="${getSetting('resolutionW')}" min="640" max="7680" step="1"
                        style="width:70px;text-align:center;">
                    <span style="font-size:12px;color:var(--text-muted);">×</span>
                    <input type="number" class="settings-input" data-key="resolutionH"
                        value="${getSetting('resolutionH')}" min="480" max="4320" step="1"
                        style="width:70px;text-align:center;">
                </div>
            </div>
            <div style="display:flex;gap:5px;margin-top:4px;flex-wrap:wrap;">
                <div style="font-size:10px;color:var(--text-muted);width:100%;margin-bottom:2px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Présets rapides</div>
                ${[['854×480','854','480'],['1280×720','1280','720'],['1920×1080','1920','1080'],['2560×1440','2560','1440'],['3840×2160','3840','2160']].map(([l,w,h]) =>
                    `<button class="btn" style="font-size:10px;padding:4px 10px;" onclick="setResolution(${w},${h})">${l}</button>`
                ).join('')}
            </div>
        </div>`
    ) +
    section('Performances',
        row('Distance de rendu', 'Chunks visibles en jeu (影响 performance)',
            slider('renderDistance', 2, 32, 1, ' chunks')
        ),
        row('FPS maximum', '0 = illimité — adapter selon ton matériel',
            `<div style="display:flex;align-items:center;gap:8px;">
                ${slider('maxFps', 0, 300, 5, getSetting('maxFps') === 0 ? ' ∞' : ' fps')}
            </div>`
        ),
        row('V-Sync', 'Synchronise les images sur le taux de rafraîchissement du moniteur',
            toggle('vsync')
        ),
        row('Graphismes avancés (Fancy)', 'Active les nuages, feuilles transparentes, etc.',
            toggle('fancyGraphics')
        )
    ) + saveBtn();
}

// ── ONGLET RÉSEAU ────────────────────────────────────────────

function renderNetwork() {
    return section('Proxy',
        row('Activer le proxy', 'Utilise un proxy HTTP/SOCKS pour les connexions',
            toggle('proxyEnabled')
        ),
        `<div id="proxyFields" style="display:${getSetting('proxyEnabled') ? 'block' : 'none'};">
            ${row('Hôte du proxy', 'Adresse IP ou domaine du proxy',
                textInput('proxyHost', '127.0.0.1 ou proxy.example.com', '180px')
            )}
            ${row('Port du proxy', 'Port de connexion',
                numberInput('proxyPort', 1, 65535, 1)
            )}
            ${row('Authentification', 'Le proxy nécessite un identifiant et mot de passe',
                toggle('proxyAuth')
            )}
            <div id="proxyAuthFields" style="display:${getSetting('proxyAuth') ? 'block' : 'none'};">
                ${row('Identifiant proxy', null,
                    textInput('proxyUser', 'Nom d\'utilisateur', '160px')
                )}
                ${row('Mot de passe proxy', null,
                    `<input type="password" class="settings-input" data-key="proxyPass"
                        value="${getSetting('proxyPass')}" placeholder="••••••••" style="width:160px;">`
                )}
            </div>
        </div>`
    ) +
    section('Lancement',
        row('Timeout de lancement', 'Secondes avant d\'abandonner si Minecraft ne démarre pas',
            numberInput('launchTimeout', 10, 300, 5, 'sec')
        )
    ) + saveBtn();
}

// ── ONGLET DOSSIERS ──────────────────────────────────────────

function renderFolders() {
    return section('Chemins d\'installation',
        folderRow('Dossier d\'installation', 'Racine où sont stockées les versions, les mods, etc.', 'installPath', 'C:\\Users\\...\\AppData\\Roaming\\mighty-client'),
        folderRow('Dossier des captures d\'écran', 'Destination des screenshots Minecraft (laissez vide pour défaut)', 'screenshotPath', 'Laisser vide = défaut Minecraft')
    ) +
    section('Sauvegarde',
        row('Activer les sauvegardes automatiques', 'Sauvegarde tes mondes avant chaque lancement',
            toggle('backupEnabled')
        ),
        `<div id="backupPathRow" style="display:${getSetting('backupEnabled') ? 'block' : 'none'};">
            ${folderRow('Dossier de sauvegarde', 'Où stocker les sauvegardes automatiques', 'backupPath', 'D:\\Backups\\Minecraft')}
        </div>`
    ) +
    section('Cache',
        row('Vider le cache au lancement', 'Supprime les fichiers temporaires avant de démarrer le jeu',
            toggle('clearCacheOnLaunch')
        ),
        `<div style="display:flex;justify-content:flex-end;margin-top:2px;">
            <button class="btn" style="font-size:11px;padding:5px 14px;display:flex;align-items:center;gap:6px;" onclick="clearCacheNow()">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                Vider le cache maintenant
            </button>
        </div>`
    ) + saveBtn();
}

// ── ONGLET À PROPOS ──────────────────────────────────────────

function renderAbout() {
    return `
    <div style="display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;align-items:center;gap:16px;padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;">
            <img src="assets/icons/icon.png" alt="Mighty Client" style="width:48px;height:48px;flex-shrink:0;border-radius:10px;"/>
            <div>
                <div style="font-size:16px;font-weight:800;letter-spacing:2px;color:#f0f0f2;">MIGHTY CLIENT</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">Version 2.0.0 — Build 2026</div>
            </div>
        </div>
        <div class="settings-section">
            <div class="settings-section-title">Informations</div>
            ${row('Version', null, '<span style="font-size:12px;color:var(--text-sub);font-weight:600;">2.0.0</span>')}
            ${row('Environnement', null, '<span style="font-size:12px;color:var(--text-sub);" id="aboutEnv">—</span>')}
            ${row('Minecraft supporté', null, '<span style="font-size:12px;color:var(--text-sub);">1.0 → 1.21.11</span>')}
        </div>
        <div class="settings-section">
            <div class="settings-section-title">Liens</div>
            ${row('Site officiel', null, `<button class="btn" onclick="(window.electronAPI?.openExternal||window.open)('https://mightylauncher.net')" style="font-size:11px;padding:5px 12px;">mightylauncher.net</button>`)}
            ${row('Code source', null, `<button class="btn" onclick="(window.electronAPI?.openExternal||window.open)('https://github.com/mighty-client')" style="font-size:11px;padding:5px 12px;">GitHub</button>`)}
            ${row('Discord', null, `<button class="btn" onclick="(window.electronAPI?.openExternal||window.open)('https://discord.gg/mighty')" style="font-size:11px;padding:5px 12px;">Rejoindre</button>`)}
        </div>
        <div style="padding:10px 0;text-align:center;">
            <div style="font-size:10px;color:var(--text-muted);">Fait avec soin pour la communauté Minecraft</div>
        </div>
    </div>`;
}

// ── FONCTIONS UTILITAIRES (appelées depuis le HTML inline) ────

window.setRamQuick = function(gb) {
    const min = Math.max(0.5, Math.round(gb / 2 * 2) / 2);
    setSetting('ramMin', min);
    setSetting('ramMax', gb);
    // Mettre à jour les sliders et labels
    ['ramMin', 'ramMax'].forEach(key => {
        const s = document.querySelector(`input[data-key="${key}"]`);
        const l = document.querySelector(`.settings-slider-val[data-val-for="${key}"]`);
        if (s) s.value = getSetting(key);
        if (l) l.textContent = getSetting(key) + ' Go';
    });
    // Highlight le bouton sélectionné
    document.querySelectorAll('.ram-quick-btn').forEach(b => {
        b.style.background = parseInt(b.dataset.ram) === gb ? 'rgba(124,92,191,0.25)' : '';
        b.style.borderColor = parseInt(b.dataset.ram) === gb ? 'rgba(124,92,191,0.5)' : '';
        b.style.color = parseInt(b.dataset.ram) === gb ? 'var(--accent)' : '';
    });
};

window.applyJvmPreset = function(preset) {
    const presets = {
        g1gc:  '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40',
        zgc:   '-XX:+UseZGC -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC',
        aikar: '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M',
        clear: ''
    };
    setSetting('useCustomJvmArgs', preset !== 'clear');
    setSetting('jvmArgs', presets[preset] || '');
    renderSettings(_currentTab);
};

window.setResolution = function(w, h) {
    setSetting('resolutionW', w);
    setSetting('resolutionH', h);
    const wEl = document.querySelector('input[data-key="resolutionW"]');
    const hEl = document.querySelector('input[data-key="resolutionH"]');
    if (wEl) wEl.value = w;
    if (hEl) hEl.value = h;
};

window.pickFolder = async function(key) {
    if (window.electronAPI?.selectFolder) {
        const result = await window.electronAPI.selectFolder();
        if (result) {
            setSetting(key, result);
            const el = document.querySelector(`input[data-key="${key}"]`);
            if (el) el.value = result;
        }
    } else {
        showToast('Sélection de dossier disponible uniquement en mode desktop', 'warning');
    }
};

window.clearCacheNow = async function() {
    if (window.electronAPI?.clearCache) {
        await window.electronAPI.clearCache();
        showToast('Cache vidé avec succès', 'success');
    } else {
        showToast('Fonction disponible en mode desktop uniquement', 'info');
    }
};

// ── BINDING DES ÉVÉNEMENTS ───────────────────────────────────

function bindSettingsEvents() {
    // Toggles
    document.querySelectorAll('#settingsContent input[type="checkbox"][data-key]').forEach(el => {
        el.addEventListener('change', () => {
            setSetting(el.dataset.key, el.checked);
            // Affichage conditionnel
            if (el.dataset.key === 'autoDetectJava') {
                const r = document.getElementById('javaPathRow');
                if (r) r.style.display = el.checked ? 'none' : 'block';
            }
            if (el.dataset.key === 'useCustomJvmArgs') {
                const r = document.getElementById('jvmArgsRow');
                if (r) r.style.display = el.checked ? 'block' : 'none';
            }
            if (el.dataset.key === 'customResolution') {
                const r = document.getElementById('resolutionInputs');
                if (r) r.style.display = el.checked ? 'block' : 'none';
            }
            if (el.dataset.key === 'proxyEnabled') {
                const r = document.getElementById('proxyFields');
                if (r) r.style.display = el.checked ? 'block' : 'none';
            }
            if (el.dataset.key === 'proxyAuth') {
                const r = document.getElementById('proxyAuthFields');
                if (r) r.style.display = el.checked ? 'block' : 'none';
            }
            if (el.dataset.key === 'backupEnabled') {
                const r = document.getElementById('backupPathRow');
                if (r) r.style.display = el.checked ? 'block' : 'none';
            }
        });
    });

    // Selects
    document.querySelectorAll('#settingsContent select[data-key]').forEach(el => {
        el.addEventListener('change', () => setSetting(el.dataset.key, el.value));
    });

    // Number inputs
    document.querySelectorAll('#settingsContent input[type="number"][data-key]').forEach(el => {
        el.addEventListener('input', () => {
            const v = parseFloat(el.value);
            if (!isNaN(v)) setSetting(el.dataset.key, v);
        });
    });

    // Sliders — mise à jour temps réel
    document.querySelectorAll('#settingsContent input[type="range"][data-key]').forEach(el => {
        el.addEventListener('input', () => {
            const v = parseFloat(el.value);
            setSetting(el.dataset.key, v);
            const label = document.querySelector(`.settings-slider-val[data-val-for="${el.dataset.key}"]`);
            if (label) {
                const isRam = el.dataset.key === 'ramMin' || el.dataset.key === 'ramMax';
                const isFps = el.dataset.key === 'maxFps';
                if (isRam) label.textContent = v + ' Go';
                else if (isFps) label.textContent = v === 0 ? '∞ fps' : v + ' fps';
                else {
                    const suffix = label.textContent.replace(/[\d.∞]/g, '').trim();
                    label.textContent = v + (suffix ? ' ' + suffix : '');
                }
            }
            // Highlight boutons RAM rapides
            if (el.dataset.key === 'ramMax') {
                document.querySelectorAll('.ram-quick-btn').forEach(b => {
                    const match = parseFloat(b.dataset.ram) === v;
                    b.style.background = match ? 'rgba(124,92,191,0.25)' : '';
                    b.style.borderColor = match ? 'rgba(124,92,191,0.5)' : '';
                    b.style.color = match ? 'var(--accent)' : '';
                });
            }
        });
    });

    // Text inputs & textarea
    document.querySelectorAll('#settingsContent input[type="text"][data-key], #settingsContent input[type="password"][data-key], #settingsContent textarea[data-key]').forEach(el => {
        el.addEventListener('input', () => setSetting(el.dataset.key, el.value));
    });

    // À propos
    const aboutEnv = document.getElementById('aboutEnv');
    if (aboutEnv) aboutEnv.textContent = window.electronAPI ? 'Electron (Desktop)' : 'Navigateur';

    // Bouton Sauvegarder
    const saveButton = document.getElementById('settingsSaveBtn');
    if (saveButton) {
        saveButton.addEventListener('click', async () => {
            saveButton.disabled = true;
            saveButton.innerHTML = `
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation:spin 0.6s linear infinite">
                    <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
                    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
                    <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
                    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
                </svg>
                Sauvegarde...`;
            saveButton.style.opacity = '0.7';

            await saveSettings();

            saveButton.innerHTML = `
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linecap="round">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                Sauvegardé !`;
            saveButton.style.opacity = '1';
            saveButton.style.background = 'rgba(74,222,128,0.2)';
            saveButton.style.borderColor = 'rgba(74,222,128,0.4)';
            saveButton.style.color = '#4ade80';

            setTimeout(() => {
                saveButton.disabled = false;
                saveButton.innerHTML = `
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                        <polyline points="17 21 17 13 7 13 7 21"/>
                        <polyline points="7 3 7 8 15 8"/>
                    </svg>
                    Sauvegarder`;
                saveButton.style.background = '';
                saveButton.style.borderColor = '';
                saveButton.style.color = '';
            }, 2000);
        });
    }
}

// ── INIT ─────────────────────────────────────────────────────

async function initSettings() {
    await loadSettings();
    renderSettings('general');
}

// ── EXPOSITION GLOBALE ────────────────────────────────────────
window.saveSettings      = saveSettings;
window.renderSettings    = renderSettings;
window.switchSettingsTab = switchSettingsTab;
window.initSettings      = initSettings;
