/* ============================================================
   skin-cape.js — Skins avec skinview3d WebGL
   Mighty Client v2.0.0
   ============================================================ */
'use strict';

// ── Constantes API ────────────────────────────────────────────
const CRAFATAR_SKIN  = 'https://crafatar.com/skins/';
const SKINVIEW3D_CDN = 'https://cdn.jsdelivr.net/npm/skinview3d@3.4.1/bundles/skinview3d.bundle.js';

// ── État ─────────────────────────────────────────────────────
let _sc = {
    currentSkinData: null,
    pendingSkinData: null,
    selectedSkinId:  null,
    importedSkins:   [],
    animMode:        'idle',
    viewer:          null,   // instance skinview3d
    libLoaded:       false,
};

// ── Init ──────────────────────────────────────────────────────
async function initSkinCapePage() {
    _loadSkinCapeData();
    _renderSkinPage();
    // Charger la tête via Electron (sans CORS) après le rendu
    _loadHeadImage();
    await _loadSkinView3D();
    _initViewer();
}

async function _loadHeadImage() {
    const img = document.getElementById('scHeadImg');
    if (!img) return;
    const uuid = window._activeProfile?.uuid;
    if (!uuid) return;
    if (window.electronAPI?.fetchPlayerHead) {
        try {
            const b64 = await window.electronAPI.fetchPlayerHead(uuid);
            if (b64 && img) img.src = b64;
        } catch(e) { console.warn('[SkinCape] fetchPlayerHead:', e); }
    }
}

function _loadSkinCapeData() {
    try {
        const saved = localStorage.getItem('mighty-skincape');
        if (saved) {
            const d = JSON.parse(saved);
            _sc.importedSkins   = d.importedSkins  || [];
            _sc.currentSkinData = d.currentSkinData || null;
            _sc.selectedSkinId  = d.selectedSkinId  || null;
        }
    } catch(e) { console.warn('[SkinCape] load error:', e); }
}

function _saveSkinCapeData() {
    try {
        localStorage.setItem('mighty-skincape', JSON.stringify({
            importedSkins:   _sc.importedSkins,
            currentSkinData: _sc.currentSkinData,
            selectedSkinId:  _sc.selectedSkinId,
        }));
    } catch(e) {}
}

// ── Chargement dynamique de skinview3d ────────────────────────
function _loadSkinView3D() {
    return new Promise((resolve) => {
        if (window.skinview3d) { _sc.libLoaded = true; resolve(); return; }
        const script = document.createElement('script');
        script.src = SKINVIEW3D_CDN;
        script.onload  = () => { _sc.libLoaded = true; resolve(); };
        script.onerror = () => { console.error('[SkinCape] skinview3d CDN failed'); resolve(); };
        document.head.appendChild(script);
    });
}

// ── Rendu de la page ─────────────────────────────────────────
function _renderSkinPage() {
    const page = document.getElementById('page-skincape');
    if (!page) return;

    const profile    = window._activeProfile;
    const playerName = profile?.name || 'Joueur';
    const playerUUID = profile?.uuid || '';

    page.innerHTML = `
    <div class="sc-layout">
        <!-- GAUCHE : viewer 3D -->
        <div class="sc-left">
            <div class="sc-viewer-card">
                <div class="sc-viewer-header">
                    <img id="scHeadImg" width="28" height="28"
                        src=""
                        style="border-radius:4px;image-rendering:pixelated;background:#1a1a2e;">
                    <div>
                        <div class="sc-player-name">${_escSC(playerName)}</div>
                        <div class="sc-player-uuid">${playerUUID ? playerUUID.substring(0,8)+'...' : 'Non connecté'}</div>
                    </div>
                </div>

                <!-- Viewer WebGL skinview3d -->
                <div class="sc-canvas-wrap" id="scCanvasWrap">
                    <canvas id="scCanvas"></canvas>
                    <div class="sc-canvas-hint" id="scHint">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        Chargement...
                    </div>
                </div>

                <div class="sc-anim-btns">
                    <button class="sc-anim-btn sc-anim-active" onclick="setSCaAnim('idle',this)">Immobile</button>
                    <button class="sc-anim-btn" onclick="setSCaAnim('walk',this)">Marche</button>
                    <button class="sc-anim-btn" onclick="setSCaAnim('run',this)">Course</button>
                </div>
            </div>
        </div>

        <!-- DROITE : contrôles -->
        <div class="sc-right">
            <div class="sc-section">
                <div class="sc-section-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                    Skin du joueur
                </div>
                <div class="sc-skin-grid-wrap">
                    <div class="sc-skin-grid" id="scImportedGrid">${_renderImportedGrid()}</div>
                    <div class="sc-import-drop" id="scDropZone"
                        onclick="document.getElementById('scFileInput').click()"
                        ondragover="event.preventDefault();this.classList.add('sc-drop-hover')"
                        ondragleave="this.classList.remove('sc-drop-hover')"
                        ondrop="handleSCDrop(event)">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        <span>Importer un skin (PNG 64×64)</span>
                    </div>
                    <input type="file" id="scFileInput" accept=".png" style="display:none" onchange="handleSCFile(this.files[0])">
                </div>
            </div>

            <button class="sc-apply-btn" onclick="applySCChanges()">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                Appliquer les changements
            </button>
        </div>
    </div>`;
}

// ── Initialisation skinview3d ─────────────────────────────────
function _initViewer() {
    const wrap   = document.getElementById('scCanvasWrap');
    const canvas = document.getElementById('scCanvas');
    const hint   = document.getElementById('scHint');
    if (!wrap || !canvas) return;

    // Dimensions canvas = conteneur - padding
    const W = wrap.clientWidth  - 20;
    const H = wrap.clientHeight - 20;

    if (!_sc.libLoaded || !window.skinview3d) {
        if (hint) hint.textContent = '⚠ skinview3d indisponible';
        return;
    }

    // Détruire le viewer précédent si existant
    if (_sc.viewer) { try { _sc.viewer.dispose(); } catch(e) {} _sc.viewer = null; }

    try {
        const viewer = new skinview3d.SkinViewer({
            canvas,
            width:  Math.max(W, 100),
            height: Math.max(H, 200),
        });

        // Fond transparent — méthode qui fonctionne avec skinview3d v3
        viewer.renderer.setClearColor(0x000000, 0);

        // Contrôles : rotation à la souris + zoom molette (API v3.x)
        viewer.controls.enableRotate = true;
        viewer.controls.enableZoom   = true;
        viewer.controls.enablePan    = false;
        viewer.controls.enableDamping = true;

        // Rotation initiale légèrement de côté
        viewer.playerObject.rotation.y = 0.4;

        // Éclairage
        viewer.globalLight.intensity  = 3;
        viewer.cameraLight.intensity  = 1.5;

        // Animation par défaut
        viewer.animation = null;

        _sc.viewer = viewer;

        // Charger le skin de façon async — une erreur réseau ne doit PAS crasher le viewer
        _applyViewerSkin().catch(e => console.warn('[SkinCape] _applyViewerSkin:', e));

        // Mettre à jour hint
        if (hint) {
            hint.innerHTML = `
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 3h6v6M14 10l6.1-6.1M9 21H3v-6M10 14l-6.1 6.1"/></svg>
                Glisser pour tourner · Molette pour zoomer`;
        }

        // Adapter la taille si le conteneur change
        new ResizeObserver(() => {
            if (!_sc.viewer) return;
            const r = wrap.getBoundingClientRect();
            const nw = Math.floor(r.width  - 20);
            const nh = Math.floor(r.height - 20);
            if (nw > 0 && nh > 0) {
                _sc.viewer.width  = nw;
                _sc.viewer.height = nh;
            }
        }).observe(wrap);

    } catch(err) {
        console.error('[SkinCape] skinview3d init error:', err);
        if (hint) hint.textContent = '⚠ Erreur viewer 3D';
    }
}

// ── Charger le skin dans le viewer ───────────────────────────
async function _applyViewerSkin() {
    const viewer = _sc.viewer;
    if (!viewer) return;

    // Skin importé en base64 → pas de réseau, toujours dispo
    if (_sc.currentSkinData) {
        try { await viewer.loadSkin(_sc.currentSkinData); } catch(e) { console.warn('[SkinCape] loadSkin base64:', e); }
        return;
    }

    const uuid = window._activeProfile?.uuid;

    // Priorité 1 : via Electron (pas de CORS, fallbacks intégrés dans main.js)
    if (uuid && window.electronAPI?.fetchSkinTexture) {
        try {
            const b64 = await window.electronAPI.fetchSkinTexture(uuid);
            if (b64) { await viewer.loadSkin(b64); return; }
        } catch(e) { console.warn('[SkinCape] fetchSkinTexture error:', e); }
    }

    // Priorité 2 : URL directe (fonctionne si pas de CORS ou si skin en cache)
    const urlsToTry = [
        uuid ? `${CRAFATAR_SKIN}${uuid}` : null,
        'https://mc-heads.net/skin/Steve',
        'https://minotar.net/skin/steve',
    ].filter(Boolean);

    for (const url of urlsToTry) {
        try { await viewer.loadSkin(url); return; } catch(e) { console.warn('[SkinCape] loadSkin URL failed:', url); }
    }
    // Tous échoués → viewer garde son skin par défaut, pas de crash
    console.warn('[SkinCape] Aucune source de skin disponible, skin par défaut utilisé.');
}

// ── Animation ─────────────────────────────────────────────────
function setSCaAnim(mode, btn) {
    _sc.animMode = mode;
    document.querySelectorAll('.sc-anim-btn').forEach(b => b.classList.remove('sc-anim-active'));
    btn?.classList.add('sc-anim-active');

    const viewer = _sc.viewer;
    if (!viewer || !window.skinview3d) return;

    if (mode === 'idle') {
        viewer.animation = null;
    } else if (mode === 'walk') {
        const anim = new skinview3d.WalkingAnimation();
        anim.speed = 0.8;
        viewer.animation = anim;
    } else if (mode === 'run') {
        const anim = new skinview3d.RunningAnimation();
        anim.speed = 1.4;
        viewer.animation = anim;
    }
}

// ── Import skin ───────────────────────────────────────────────
function handleSCDrop(e) {
    e.preventDefault();
    document.getElementById('scDropZone')?.classList.remove('sc-drop-hover');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleSCFile(file);
}

function handleSCFile(file) {
    if (!file || !file.name.endsWith('.png')) {
        showToast('Fichier invalide. PNG uniquement.', 'error'); return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
        const data = ev.target.result;
        const img  = new Image();
        img.onload = () => {
            const name = file.name.replace('.png', '');
            _sc.importedSkins.unshift({ name, data, width: img.width, height: img.height });
            _sc.pendingSkinData = data;
            _sc.selectedSkinId  = 'imported_0';
            _saveSkinCapeData();
            _refreshImportedGrid();
            // Prévisualiser immédiatement dans le viewer
            if (_sc.viewer) _sc.viewer.loadSkin(data).catch(console.warn);
            showToast('Skin "' + name + '" importé !', 'success');
        };
        img.src = data;
    };
    reader.readAsDataURL(file);
}

function _renderImportedGrid() {
    if (_sc.importedSkins.length === 0)
        return `<div class="sc-empty-skins">Aucun skin importé — glissez un PNG ci-dessous</div>`;
    return _sc.importedSkins.map((s, i) => `
        <div class="sc-skin-item ${_sc.selectedSkinId === 'imported_'+i ? 'sc-skin-selected' : ''}"
            onclick="selectImportedSkin(${i})" data-skin-id="imported_${i}">
            <img src="${s.data}" width="40" height="40"
                style="image-rendering:pixelated;border-radius:3px;background:#1a1a2e;">
            <span>${_escSC(s.name)}</span>
            <button class="sc-skin-delete" onclick="event.stopPropagation();deleteImportedSkin(${i})" title="Supprimer">×</button>
        </div>`).join('');
}

function _refreshImportedGrid() {
    const grid = document.getElementById('scImportedGrid');
    if (grid) grid.innerHTML = _renderImportedGrid();
}

function deleteImportedSkin(i) {
    _sc.importedSkins.splice(i, 1);
    if (_sc.selectedSkinId === 'imported_' + i) {
        _sc.selectedSkinId  = null;
        _sc.pendingSkinData = null;
        _applyViewerSkin(); // revenir au skin du profil
    }
    _saveSkinCapeData();
    _refreshImportedGrid();
    showToast('Skin supprimé.', 'success');
}

function selectImportedSkin(i) {
    _sc.selectedSkinId  = 'imported_' + i;
    _sc.pendingSkinData = _sc.importedSkins[i]?.data || null;
    _refreshImportedGrid();
    if (_sc.pendingSkinData && _sc.viewer)
        _sc.viewer.loadSkin(_sc.pendingSkinData).catch(console.warn);
}

// ── Appliquer ─────────────────────────────────────────────────
function applySCChanges() {
    if (_sc.pendingSkinData) _sc.currentSkinData = _sc.pendingSkinData;
    _saveSkinCapeData();
    showToast('Skin sauvegardé !', 'success');
}

// ── Stop (appelé lors du changement de page) ─────────────────
function stopSkin3D() {
    if (_sc.viewer) {
        try { _sc.viewer.dispose(); } catch(e) {}
        _sc.viewer = null;
    }
}

// ── Stub capes (supprimées) ───────────────────────────────────
function selectSCCape(_id) {}

// ── Utilitaire ────────────────────────────────────────────────
function _escSC(str) {
    return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Exports ──────────────────────────────────────────────────
window.initSkinCapePage   = initSkinCapePage;
window.stopSkin3D         = stopSkin3D;
window.setSCaAnim         = setSCaAnim;
window.handleSCDrop       = handleSCDrop;
window.handleSCFile       = handleSCFile;
window.selectImportedSkin = selectImportedSkin;
window.deleteImportedSkin = deleteImportedSkin;
window.selectSCCape       = selectSCCape;
window.applySCChanges     = applySCChanges;
