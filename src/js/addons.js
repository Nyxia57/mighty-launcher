/* ============================================================
   addons.js — Mods & Add-ons avec API Modrinth
   Mighty Client v2.0.0
   ============================================================ */
'use strict';

// ══════════════════════════════════════════════════════════════
//  ÉTAT GLOBAL
// ══════════════════════════════════════════════════════════════

let _installedAddons  = [];          // mods installés (persistés)
let _currentAddonType = 'mod';       // 'mod' | 'resourcepack' | 'shader'
let _currentAddonView = 'installed'; // 'installed' | 'browse'

// Modrinth browse state
let _mrPage       = 0;
let _mrTotalHits  = 0;
let _mrPageSize   = 20;
let _mrLastQuery  = '';
let _mrDebounce   = null;
let _mrDetailMod  = null;            // mod actuellement affiché dans le panneau détail

// ══════════════════════════════════════════════════════════════
//  PERSISTANCE
// ══════════════════════════════════════════════════════════════

async function loadAddons() {
    try {
        if (window.electronAPI?.loadConfig) {
            const cfg = await window.electronAPI.loadConfig();
            if (cfg?.installedAddons && Array.isArray(cfg.installedAddons))
                _installedAddons = cfg.installedAddons;
            return;
        }
        const saved = localStorage.getItem('mighty-addons');
        if (saved) _installedAddons = JSON.parse(saved) || [];
    } catch(e) { console.warn('[Addons] load error:', e); }
}

async function saveAddons() {
    try {
        if (window.electronAPI?.saveConfig)
            await window.electronAPI.saveConfig({ installedAddons: _installedAddons });
        else
            localStorage.setItem('mighty-addons', JSON.stringify(_installedAddons));
    } catch(e) { console.warn('[Addons] save error:', e); }
}

// ══════════════════════════════════════════════════════════════
//  VUE — NAVIGATION (Installés / Explorer)
// ══════════════════════════════════════════════════════════════

function switchAddonView(view, el) {
    _currentAddonView = view;

    // Active tab topbar
    document.querySelectorAll('.addons-view-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');

    // Bascule les vues
    document.querySelectorAll('.addon-view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById('view-' + view);
    if (target) target.classList.add('active');

    // Bascule les toolbars
    const tbInstalled = document.getElementById('toolbar-installed');
    const tbBrowse    = document.getElementById('toolbar-browse');
    if (tbInstalled) tbInstalled.style.display = view === 'installed' ? 'flex' : 'none';
    if (tbBrowse)    tbBrowse.style.display    = view === 'browse'    ? 'flex' : 'none';

    // Fermer le détail
    closeMrDetail();

    if (view === 'installed') renderInstalledAddons();
    if (view === 'browse')    searchModrinth();
}

function switchAddonType(type, el) {
    _currentAddonType = type;

    document.querySelectorAll('.addon-type-tab').forEach(t => t.classList.remove('active-type'));
    if (el) el.classList.add('active-type');

    if (_currentAddonView === 'installed') renderInstalledAddons();
    if (_currentAddonView === 'browse')   searchModrinth();
}

// ══════════════════════════════════════════════════════════════
//  VUE — INSTALLÉS
// ══════════════════════════════════════════════════════════════

function renderInstalledAddons(filter = '') {
    const list = document.getElementById('addonList');
    if (!list) return;

    const filtered = _installedAddons.filter(a =>
        a.name.toLowerCase().includes(filter.toLowerCase()) ||
        (a.description || '').toLowerCase().includes(filter.toLowerCase())
    );

    // Mettre à jour le compteur topbar
    const counter = document.getElementById('sideCount-installed');
    if (counter) counter.textContent = _installedAddons.length;

    if (filtered.length === 0) {
        list.innerHTML = `<div class="addon-empty" style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:40px 0;grid-column:1/-1;">
            
            <div style="font-size:13px;color:var(--text-muted);font-weight:600;">Aucun contenu installé</div>
            <div style="font-size:11px;color:var(--text-muted);">Explore Modrinth pour en ajouter</div>
            <button class="mr-install-btn" style="margin-top:4px;" onclick="switchAddonView('browse', document.querySelector('[data-cat=browse]'))">
                Explorer Modrinth
            </button>
        </div>`;
        return;
    }

    list.innerHTML = filtered.map(addon => _renderInstalledCard(addon)).join('');
}

function _renderInstalledCard(addon) {
    const iconStyle = addon.iconUrl
        ? `background-image:url('${addon.iconUrl}');background-size:cover;background-position:center;`
        : `background:${_colorForType(addon.type)};`;

    const initials = addon.name.substring(0, 2).toUpperCase();

    return `<div class="addon-item" id="addon-${addon.id}">
        <div class="addon-icon" style="${iconStyle}">${addon.iconUrl ? '' : initials}</div>
        <div class="addon-info">
            <div class="addon-name">
                ${_escHtml(addon.name)}
                <span class="addon-badge">${addon.version || 'installé'}</span>
                ${addon.loader ? `<span class="mr-loader-pill">${addon.loader}</span>` : ''}
            </div>
            <div class="addon-meta">${_escHtml(addon.description || '')} · <span style="color:var(--text-muted);">${addon.mcVersion || ''}</span></div>
            ${addon.profiles && addon.profiles.length ? `<div style="margin-top:3px;display:flex;gap:3px;flex-wrap:wrap;">
                ${addon.profiles.map(p => {
                    const label = typeof p === 'object' ? p.name : p;
                    return `<span style="font-size:9px;padding:1px 6px;border-radius:10px;background:rgba(124,92,191,0.12);color:#9b7dd4;border:1px solid rgba(124,92,191,0.2);">${_escHtml(label)}</span>`;
                }).join('')}
            </div>` : ''}
        </div>
        <div class="addon-item-actions">
            <button title="Activer / Désactiver" onclick="toggleAddonEnabled('${addon.id}',event)"
                style="background:${addon.enabled !== false ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)'};border:1px solid ${addon.enabled !== false ? 'rgba(34,197,94,0.25)' : 'var(--border)'};color:${addon.enabled !== false ? '#4ade80' : 'var(--text-muted)'};width:28px;height:28px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <button title="Supprimer" onclick="removeAddon('${addon.id}',event)"
                style="background:rgba(220,38,38,0.08);border:1px solid rgba(220,38,38,0.15);color:#f87171;width:28px;height:28px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s;" onmouseover="this.style.background='rgba(220,38,38,0.18)'" onmouseout="this.style.background='rgba(220,38,38,0.08)'">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            </button>
        </div>
    </div>`;
}

function filterInstalledAddons(val) {
    renderInstalledAddons(val);
}

function filterChipAll(el) {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active-chip'));
    el.classList.add('active-chip');
    renderInstalledAddons(document.getElementById('addonSearch')?.value || '');
}

function filterChipActive(el) {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active-chip'));
    el.classList.add('active-chip');
    const list = document.getElementById('addonList');
    if (!list) return;
    const actives = _installedAddons.filter(a => a.enabled !== false);
    if (actives.length === 0) {
        list.innerHTML = `<div class="addon-empty" style="grid-column:1/-1;"><span>Aucun contenu actif</span></div>`;
        return;
    }
    list.innerHTML = actives.map(a => _renderInstalledCard(a)).join('');
}

function toggleAddonEnabled(id, e) {
    e && e.stopPropagation();
    const addon = _installedAddons.find(a => a.id === id);
    if (!addon) return;
    addon.enabled = addon.enabled === false ? true : false;
    saveAddons();
    renderInstalledAddons(document.getElementById('addonSearch')?.value || '');
    showToast(`${addon.name} ${addon.enabled ? 'activé' : 'désactivé'}`, addon.enabled ? 'success' : 'info');
}

function removeAddon(id, e) {
    e && e.stopPropagation();
    const idx = _installedAddons.findIndex(a => a.id === id);
    if (idx === -1) return;
    const name = _installedAddons[idx].name;
    _installedAddons.splice(idx, 1);
    saveAddons();
    renderInstalledAddons(document.getElementById('addonSearch')?.value || '');
    showToast(`${name} supprimé`, 'info');
}

// ══════════════════════════════════════════════════════════════
//  MODRINTH API — RECHERCHE
// ══════════════════════════════════════════════════════════════

const MR_BASE = 'https://api.modrinth.com/v2';

// Récupère le loader du profil actif (fabric, neoforge, forge, vanilla...)
function _getActiveLoader() {
    const profiles = window._getProfiles ? window._getProfiles() : [];
    const activeId = window._getActiveProfileId ? window._getActiveProfileId() : null;
    const profile  = profiles.find(p => p.id === activeId) || profiles[0];
    return profile?.loader || 'fabric';
}

function _getActiveMcVersion() {
    const profiles = window._getProfiles ? window._getProfiles() : [];
    const activeId = window._getActiveProfileId ? window._getActiveProfileId() : null;
    const profile  = profiles.find(p => p.id === activeId) || profiles[0];
    return profile?.version || '';
}
const MR_HEADERS = { 'User-Agent': 'MightyLauncher/2.0.0' };

function debouncedModrinthSearch(val) {
    clearTimeout(_mrDebounce);
    _mrDebounce = setTimeout(() => {
        _mrPage = 0;
        searchModrinth();
    }, 420);
}

async function searchModrinth() {
    const query    = document.getElementById('modrinthSearch')?.value?.trim() || '';
    const version  = document.getElementById('mrVersionFilter')?.value || '';
    const loader   = document.getElementById('mrLoaderFilter')?.value || '';
    const sort     = document.getElementById('mrSortFilter')?.value || 'relevance';

    _mrLastQuery = query;

    // Type → facet Modrinth
    const projectType = _currentAddonType === 'resourcepack'
        ? 'resourcepack'
        : _currentAddonType === 'shader'
            ? 'shader'
            : 'mod';

    const facets = [[`project_type:${projectType}`]];
    if (version) facets.push([`versions:${version}`]);
    if (loader)  facets.push([`categories:${loader}`]);

    const params = new URLSearchParams({
        query,
        facets: JSON.stringify(facets),
        index: sort,
        offset: _mrPage * _mrPageSize,
        limit: _mrPageSize,
    });

    const list = document.getElementById('modrinthList');
    if (!list) return;

    // Skeleton loading
    list.innerHTML = Array(6).fill(0).map(() => `
        <div class="mr-skeleton">
            <div class="sk-icon"></div>
            <div class="sk-lines">
                <div class="sk-line med"></div>
                <div class="sk-line short"></div>
                <div class="sk-line" style="width:80%"></div>
            </div>
        </div>`).join('');

    try {
        const res  = await fetch(`${MR_BASE}/search?${params}`, { headers: MR_HEADERS });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        _mrTotalHits = data.total_hits || 0;
        _renderModrinthResults(data.hits || []);
        _updatePagination();
    } catch(err) {
        list.innerHTML = `<div class="mr-welcome">
            <div class="mr-welcome-icon">!</div>
            <div class="mr-welcome-title">Erreur de connexion</div>
            <div class="mr-welcome-sub">${err.message}</div>
            <button class="btn btn-login" style="margin-top:10px;" onclick="searchModrinth()">Réessayer</button>
        </div>`;
    }
}

function _renderModrinthResults(hits) {
    const list = document.getElementById('modrinthList');
    if (!list) return;

    if (hits.length === 0) {
        list.innerHTML = `<div class="mr-welcome">
            <div class="mr-welcome-icon">?</div>
            <div class="mr-welcome-title">Aucun résultat</div>
            <div class="mr-welcome-sub">Essaie d'autres mots-clés ou filtres</div>
        </div>`;
        return;
    }

    list.innerHTML = hits.map(hit => _renderMrCard(hit)).join('');
}

function _renderMrCard(hit) {
    const isInstalled = _installedAddons.some(a => a.id === hit.project_id || a.slug === hit.slug);
    const dlFmt  = _formatNum(hit.downloads);
    const flwFmt = _formatNum(hit.follows);

    const iconHtml = hit.icon_url
        ? `<img src="${hit.icon_url}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='${(hit.title||'?').substring(0,2).toUpperCase()}'">`
        : `<span>${(hit.title || '?').substring(0, 2).toUpperCase()}</span>`;

    const categories = (hit.categories || []).slice(0, 2).map(c =>
        `<span class="mr-category-pill">${c}</span>`).join('');

    const loaders = (hit.loaders || []).slice(0, 2).map(l =>
        `<span class="mr-loader-pill">${l}</span>`).join('');

    return `<div class="mr-card" data-project-id="${hit.project_id}" onclick="openMrDetail('${hit.project_id}', '${_escAttr(hit.title)}')">
        <div class="mr-card-icon">${iconHtml}</div>
        <div class="mr-card-body">
            <div class="mr-card-title">
                ${_escHtml(hit.title)}
                ${hit.featured ? '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(251,191,36,0.12);color:#fbbf24;border:1px solid rgba(251,191,36,0.2);">Vedette</span>' : ''}
            </div>
            <div class="mr-card-author">par ${_escHtml(hit.author)}</div>
            <div class="mr-card-desc">${_escHtml(hit.description || '')}</div>
            <div class="mr-card-meta">
                <span class="mr-stat">${dlFmt} téléch.</span>
                <span class="mr-stat">${flwFmt} suivis</span>
                ${categories}${loaders}
            </div>
        </div>
        <div class="mr-card-actions">
            <button class="mr-install-btn ${isInstalled ? 'installed' : ''}"
                onclick="event.stopPropagation(); ${isInstalled ? 'void(0)' : `openMrDetail('${hit.project_id}', '${_escAttr(hit.title)}')`}"
                ${isInstalled ? 'disabled' : ''}>
                ${isInstalled ? 'Installé' : 'Installer'}
            </button>
        </div>
    </div>`;
}

function _updatePagination() {
    const pg   = document.getElementById('mrPagination');
    const info = document.getElementById('mrPageInfo');
    const prev = document.getElementById('mrPrevBtn');
    const next = document.getElementById('mrNextBtn');
    if (!pg) return;

    const totalPages = Math.ceil(_mrTotalHits / _mrPageSize);
    if (totalPages <= 1) { pg.style.display = 'none'; return; }

    pg.style.display = 'flex';
    if (info) info.textContent = `Page ${_mrPage + 1} / ${totalPages}`;
    if (prev) prev.disabled = _mrPage === 0;
    if (next) next.disabled = _mrPage >= totalPages - 1;
}

function mrChangePage(dir) {
    _mrPage = Math.max(0, _mrPage + dir);
    searchModrinth();
    document.getElementById('view-browse')?.scrollTo(0, 0);
}

// ══════════════════════════════════════════════════════════════
//  MODRINTH API — DÉTAIL D'UN MOD
// ══════════════════════════════════════════════════════════════

async function openMrDetail(projectId, title) {
    const panel = document.getElementById('mrDetailPanel');
    if (!panel) return;

    // Afficher le panel vide d'abord
    panel.style.display = 'flex';
    document.getElementById('mrDetailName').textContent   = title || 'Chargement...';
    document.getElementById('mrDetailAuthor').textContent = '';
    document.getElementById('mrDetailIcon').innerHTML     = '<div style="width:44px;height:44px;border-radius:9px;background:rgba(255,255,255,0.05);animation:shimmer 1.4s infinite;"></div>';
    document.getElementById('mrDetailStats').innerHTML    = '';
    document.getElementById('mrDetailDesc').textContent   = 'Chargement...';
    document.getElementById('mrDetailVersions').innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:8px 0;">Chargement des versions...</div>';

    try {
        // Charger le projet + versions en parallèle
        const [projRes, versRes] = await Promise.all([
            fetch(`${MR_BASE}/project/${projectId}`, { headers: MR_HEADERS }),
            fetch(`${MR_BASE}/project/${projectId}/version`, { headers: MR_HEADERS }),
        ]);

        if (!projRes.ok) throw new Error('Projet introuvable');
        const proj = await projRes.json();
        const vers = versRes.ok ? await versRes.json() : [];

        _mrDetailMod = { proj, vers };

        // Icône
        const iconEl = document.getElementById('mrDetailIcon');
        if (iconEl) {
            iconEl.innerHTML = proj.icon_url
                ? `<img src="${proj.icon_url}" style="width:100%;height:100%;object-fit:cover;border-radius:9px;" onerror="this.parentElement.textContent='${(proj.title||'?').substring(0,2).toUpperCase()}'">`
                : (proj.title || '?').substring(0, 2).toUpperCase();
        }

        // Titre & auteur
        document.getElementById('mrDetailName').textContent   = proj.title   || '';
        document.getElementById('mrDetailAuthor').textContent = 'par ' + (proj.team || proj.slug || '');

        // Stats
        const statsEl = document.getElementById('mrDetailStats');
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="mr-detail-stat"><div class="mr-detail-stat-label">Téléchargements</div><div class="mr-detail-stat-value">${_formatNum(proj.downloads)}</div></div>
                <div class="mr-detail-stat"><div class="mr-detail-stat-label">Followers</div><div class="mr-detail-stat-value">${_formatNum(proj.followers)}</div></div>
                <div class="mr-detail-stat"><div class="mr-detail-stat-label">Versions</div><div class="mr-detail-stat-value">${vers.length}</div></div>
                <div class="mr-detail-stat"><div class="mr-detail-stat-label">Licence</div><div class="mr-detail-stat-value">${(proj.license?.id || 'N/A')}</div></div>
            `;
        }

        // Description
        const descEl = document.getElementById('mrDetailDesc');
        if (descEl) descEl.textContent = proj.description || '';

        // Versions
        const versEl = document.getElementById('mrDetailVersions');
        if (versEl) {
            const activeLoader = _getActiveLoader();
            const compatVers   = vers.filter(v => (v.loaders || []).some(l => l.toLowerCase() === activeLoader.toLowerCase()));
            const displayVers  = compatVers.length > 0 ? compatVers : vers;
            const isFiltered   = compatVers.length > 0 && compatVers.length < vers.length;
            if (vers.length === 0) {
                versEl.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:8px 0;">Aucune version disponible</div>';
            } else {
                const filterBanner = compatVers.length === 0
                    ? `<div style="font-size:10px;color:#fb923c;margin-bottom:6px;">⚠ Aucune version compatible avec ${activeLoader}</div>`
                    : isFiltered
                        ? `<div style="font-size:10px;color:#9b7dd4;margin-bottom:6px;">✦ Filtré pour ${activeLoader} — ${compatVers.length} version(s) sur ${vers.length}</div>`
                        : '';
                versEl.innerHTML = filterBanner + displayVers.slice(0, 20).map(v => {
                    const isCompat = (v.loaders || []).some(l => l.toLowerCase() === activeLoader.toLowerCase());
                    const btnAttrs = isCompat
                        ? `onclick="openInstallModal('${projectId}', '${_escAttr(v.id)}', '${_escAttr(v.name || v.version_number)}', '${_escAttr((v.game_versions||['?'])[0])}', '${_escAttr((v.loaders||['?'])[0])}')" `
                        : 'disabled style="opacity:0.4;cursor:not-allowed;" ';
                    return `
                    <div class="mr-version-row" style="${!isCompat ? 'opacity:0.5;' : ''}">
                        <div style="flex:1;min-width:0;">
                            <div class="mr-version-name">${_escHtml(v.name || v.version_number)}</div>
                            <div class="mr-version-meta">
                                ${(v.game_versions || []).slice(0,3).join(', ')}
                                · ${(v.loaders || []).join(', ')}
                                · <span style="color:${v.version_type === 'release' ? '#4ade80' : v.version_type === 'beta' ? '#fb923c' : '#93c5fd'}">${v.version_type || 'release'}</span>
                            </div>
                        </div>
                        <button class="mr-version-dl-btn" ${btnAttrs}>
                            ${isCompat ? 'Installer' : 'Incompatible'}
                        </button>
                    </div>`;
                }).join('');
            }
        }

        // Bouton installer (dernière version)
        const installBtn = document.getElementById('mrDetailInstallBtn');
        if (installBtn) {
            const isInstalled = _installedAddons.some(a => a.id === projectId || a.slug === proj.slug);
            if (isInstalled) {
                installBtn.textContent = 'Installer';
                installBtn.disabled = false;
                installBtn.style.display = '';
                installBtn.style.background = '';
                installBtn.style.color = '';
                installBtn.style.border = '';
                installBtn.style.cursor = '';
                installBtn.onclick = installFromDetail;
            } else {
                installBtn.textContent = 'Installer';
                installBtn.disabled = false;
                installBtn.style.display = '';
                installBtn.style.background = '';
                installBtn.style.color = '';
                installBtn.style.border = '';
                installBtn.style.cursor = '';
                installBtn.onclick = installFromDetail;
            }
        }

    } catch(err) {
        document.getElementById('mrDetailDesc').textContent = 'Erreur : ' + err.message;
    }
}

function closeMrDetail() {
    const panel = document.getElementById('mrDetailPanel');
    if (panel) panel.style.display = 'none';
    _mrDetailMod = null;
}

// Bouton "Installer" dans le header du détail → prend la première version
function installFromDetail() {
    if (!_mrDetailMod) return;
    const { proj, vers } = _mrDetailMod;
    if (!vers || vers.length === 0) { showToast('Aucune version disponible', 'error'); return; }
    // Prendre la première version compatible avec le loader actif
    const activeLoader = _getActiveLoader();
    const compatV = vers.find(v => (v.loaders || []).some(l => l.toLowerCase() === activeLoader.toLowerCase()));
    const v = compatV || vers[0];
    if (!compatV) showToast(`Aucune version compatible avec ${activeLoader} — installation annulée`, 'error');
    if (!compatV) return;
    openInstallModal(
        proj.project_id || proj.id,
        v.id,
        v.name || v.version_number,
        (v.game_versions || ['?'])[0],
        (v.loaders || ['?'])[0]
    );
}

// ══════════════════════════════════════════════════════════════
//  MODAL — INSTALLATION (sélection profil + dépendances)
// ══════════════════════════════════════════════════════════════

let _pendingInstall = null;

async function openInstallModal(projectId, versionId, versionName, mcVersion, loader) {
    // Récupère les profils disponibles
    const profiles = (typeof _profiles !== 'undefined' ? _profiles : []);
    // Toujours utiliser la version MC du profil actif, pas celle du mod
    const profileMcVersion = _getActiveMcVersion() || mcVersion;
    mcVersion = profileMcVersion;
    loader    = _getActiveLoader();

    // Récupère les dépendances de la version
    let dependencies = [];
    try {
        const res = await fetch(`${MR_BASE}/version/${versionId}`, { headers: MR_HEADERS });
        if (res.ok) {
            const v = await res.json();
            // Filtrer uniquement les dépendances requises qui ne sont pas déjà installées
            dependencies = (v.dependencies || []).filter(d =>
                d.dependency_type === 'required' &&
                !_installedAddons.some(a => a.id === d.project_id)
            );
        }
    } catch(e) {}

    _pendingInstall = { projectId, versionId, versionName, mcVersion, loader, dependencies };

    // Construire le modal
    const existing = document.getElementById('installModal');
    if (existing) existing.remove();

    const profileOptions = profiles.length > 0
        ? profiles.map(p => `<option value="${p.id}">${_escHtml(p.name)} (${p.version || 'N/A'})</option>`).join('')
        : '<option value="default">Profil par défaut</option>';

    const depsHtml = dependencies.length > 0 ? `
        <div style="margin-top:12px;">
            <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;">
                Dépendances requises (${dependencies.length})
            </div>
            <div id="depsList" style="display:flex;flex-direction:column;gap:4px;">
                ${dependencies.map(d => `
                    <div id="dep-${d.project_id}" style="display:flex;align-items:center;gap:8px;background:var(--bg-inner);border:1px solid var(--border);border-radius:7px;padding:7px 10px;">
                        <div style="width:28px;height:28px;border-radius:6px;background:rgba(124,92,191,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9b7dd4" stroke-width="2" stroke-linecap="round"><path d="M21 16V8l-9-5-9 5v8l9 5z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div class="dep-name" style="font-size:11px;font-weight:700;color:var(--text-main);">Chargement...</div>
                            <div style="font-size:10px;color:var(--text-muted);">Dépendance requise</div>
                        </div>
                        <div class="dep-status" style="font-size:10px;">
                            <span style="color:#fb923c;">En attente</span>
                        </div>
                    </div>`).join('')}
            </div>
        </div>` : '';

    // Supprimer tout modal existant AVANT de créer le nouveau
    document.querySelectorAll('#installModal').forEach(m => m.remove());

    const modal = document.createElement('div');
    modal.id = 'installModal';
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-box" style="width:460px;">
            <div class="modal-head">
                <div class="modal-title">Installer un ${_typeLabel(_currentAddonType)}</div>
                <button class="modal-close" onclick="closeInstallModal()">×</button>
            </div>
            <div class="modal-body" style="display:flex;flex-direction:column;gap:0;">
                <!-- Info version -->
                <div style="background:rgba(124,92,191,0.08);border:1px solid rgba(124,92,191,0.2);border-radius:8px;padding:10px 12px;margin-bottom:14px;display:flex;align-items:center;gap:10px;">
                    <div style="width:32px;height:32px;border-radius:7px;background:rgba(124,92,191,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <span style="font-size:14px;">${_typeEmoji(_currentAddonType)}</span>
                    </div>
                    <div>
                        <div style="font-size:12px;font-weight:700;color:var(--text-main);" id="installModName">Chargement...</div>
                        <div style="font-size:10px;color:var(--text-muted);">${_escHtml(versionName)} · MC ${mcVersion} · ${loader || 'N/A'}</div>
                    </div>
                </div>

                <!-- Sélection profil -->
                <div style="margin-bottom:12px;">
                    <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;">
                        Ajouter au profil
                    </div>
                    ${profiles.length === 0 ? `
                        <div style="background:rgba(251,146,60,0.08);border:1px solid rgba(251,146,60,0.2);border-radius:7px;padding:8px 12px;font-size:11px;color:#fb923c;">
                            Aucun profil trouvé. <span onclick="showPage('profils')" style="cursor:pointer;text-decoration:underline;">Créer un profil</span>
                        </div>
                    ` : `
                        <select id="installProfileSelect" style="width:100%;background:var(--bg-card);border:1px solid var(--border);border-radius:7px;padding:8px 10px;color:var(--text-main);font-family:'Inter',sans-serif;font-size:12px;outline:none;cursor:pointer;">
                            <option value="">— Sélectionner un profil —</option>
                            ${profileOptions}
                        </select>
                    `}
                </div>

                ${depsHtml}
            </div>
            <div class="modal-footer">
                <button onclick="closeInstallModal()" style="background:var(--bg-card);border:1px solid var(--border);color:var(--text-muted);padding:8px 18px;border-radius:7px;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;cursor:pointer;">Annuler</button>
                <button id="confirmInstallBtn" onclick="confirmInstall()" style="background:var(--accent);border:none;color:#fff;padding:8px 20px;border-radius:7px;font-family:'Inter',sans-serif;font-size:13px;font-weight:700;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#9B7DD4'" onmouseout="this.style.background='var(--accent)'">
                    Installer${dependencies.length > 0 ? ` + ${dependencies.length} dép.` : ''}
                </button>
            </div>
        </div>`;

    document.querySelector('.launcher-container').appendChild(modal);

    // Charger le nom du projet
    fetch(`${MR_BASE}/project/${projectId}`, { headers: MR_HEADERS })
        .then(r => r.json())
        .then(p => {
            const nameEl = document.getElementById('installModName');
            if (nameEl) nameEl.textContent = p.title || projectId;
        }).catch(() => {});

    // Charger les noms des dépendances
    dependencies.forEach(async dep => {
        try {
            const res = await fetch(`${MR_BASE}/project/${dep.project_id}`, { headers: MR_HEADERS });
            if (!res.ok) return;
            const p = await res.json();
            const row = document.getElementById(`dep-${dep.project_id}`);
            if (row) {
                const nameEl = row.querySelector('.dep-name');
                if (nameEl) nameEl.textContent = p.title || dep.project_id;
                const isAlreadyInstalled = _installedAddons.some(a => a.id === dep.project_id);
                const statusEl = row.querySelector('.dep-status');
                if (statusEl) {
                    statusEl.innerHTML = isAlreadyInstalled
                        ? '<span style="color:#4ade80;">Déjà installé</span>'
                        : '<span style="color:#fb923c;">À installer</span>';
                }
            }
        } catch(e) {}
    });
}

function closeInstallModal() {
    const m = document.getElementById('installModal');
    if (m) m.remove();
    _pendingInstall = null;
}

async function confirmInstall() {
    if (!_pendingInstall) return;

    const profileSelect = document.getElementById('installProfileSelect');
    const profileId     = profileSelect ? profileSelect.value : '';

    if (!profileId) { showToast('Sélectionne un profil', 'error'); return; }

    // Récupérer l'objet profil réel depuis _profiles (variable globale de profiles.js)
    const profiles  = (typeof _profiles !== 'undefined' ? _profiles : []);
    const foundProf = profiles.find(p => p.id === profileId);
    if (!foundProf) { showToast('Profil introuvable', 'error'); return; }
    const profileName = foundProf.name;

    const btn = document.getElementById('confirmInstallBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Installation...'; }

    const { projectId, versionId, versionName, mcVersion, loader, dependencies } = _pendingInstall;

    try {
        // Charger les infos du projet principal
        const projRes = await fetch(`${MR_BASE}/project/${projectId}`, { headers: MR_HEADERS });
        if (!projRes.ok) throw new Error('Projet introuvable sur Modrinth');
        const proj    = await projRes.json();
        const projType = proj.project_type || 'mod';

        // ── 1. Ajouter dans le bon tableau du profil (mods / resourcepacks / shaders) ──
        const arrKey = projType === 'resourcepack' ? 'resourcepacks' : projType === 'shader' ? 'shaders' : 'mods';
        if (!foundProf[arrKey]) foundProf[arrKey] = [];
        if (!foundProf[arrKey].some(m => m.id === projectId)) {
            foundProf[arrKey].push({
                id:        projectId,
                slug:      proj.slug || projectId,
                name:      proj.title || projectId,
                iconUrl:   proj.icon_url || '',
                version:   versionName,
                versionId: versionId,
                mcVersion: mcVersion,
                loader:    loader,
                enabled:   true,
            });
        }

        // ── 2. Ajouter dans _installedAddons (liste globale) ──
        const alreadyIdx = _installedAddons.findIndex(a => a.id === projectId);
        if (alreadyIdx === -1) {
            _installedAddons.push({
                id:          projectId,
                slug:        proj.slug || projectId,
                name:        proj.title || projectId,
                description: proj.description || '',
                iconUrl:     proj.icon_url || '',
                type:        projType,
                version:     versionName,
                versionId:   versionId,
                mcVersion:   mcVersion,
                loader:      loader,
                enabled:     true,
                installedAt: Date.now(),
                profiles:    [profileId],
            });
        } else {
            const ex = _installedAddons[alreadyIdx];
            if (!ex.profiles) ex.profiles = [];
            if (!ex.profiles.includes(profileId)) ex.profiles.push(profileId);
        }

        // ── 3. Dépendances requises ──
        for (const dep of dependencies) {
            try {
                const depRes = await fetch(`${MR_BASE}/project/${dep.project_id}`, { headers: MR_HEADERS });
                if (!depRes.ok) continue;
                const depProj = await depRes.json();
                const depType = depProj.project_type || 'mod';
                const depKey  = depType === 'resourcepack' ? 'resourcepacks' : depType === 'shader' ? 'shaders' : 'mods';

                if (!foundProf[depKey]) foundProf[depKey] = [];
                if (!foundProf[depKey].some(m => m.id === dep.project_id)) {
                    foundProf[depKey].push({
                        id:           dep.project_id,
                        slug:         depProj.slug || dep.project_id,
                        name:         depProj.title || dep.project_id,
                        iconUrl:      depProj.icon_url || '',
                        version:      'latest',
                        versionId:    dep.version_id || '',
                        mcVersion:    mcVersion,
                        loader:       loader,
                        enabled:      true,
                        isDependency: true,
                    });
                }

                if (!_installedAddons.some(a => a.id === dep.project_id)) {
                    _installedAddons.push({
                        id:           dep.project_id,
                        slug:         depProj.slug || dep.project_id,
                        name:         depProj.title || dep.project_id,
                        description:  depProj.description || '',
                        iconUrl:      depProj.icon_url || '',
                        type:         depType,
                        version:      'latest',
                        mcVersion:    mcVersion,
                        loader:       loader,
                        enabled:      true,
                        installedAt:  Date.now(),
                        profiles:     [profileId],
                        isDependency: true,
                    });
                }
            } catch(e) { console.warn('[Addons] dep error:', e); }
        }

        // ── 4. Télécharger les fichiers .jar via l'API Modrinth (dépendances incluses) ──
        if (window.electronAPI?.installAddon) {
            try {
                // Étape A : trouver la meilleure version du mod compatible avec MC + loader
                async function findBestVersion(pid) {
                    const p = new URLSearchParams({
                        loaders:       JSON.stringify([loader]),
                        game_versions: JSON.stringify([mcVersion]),
                    });
                    const r = await fetch(`${MR_BASE}/project/${pid}/version?${p}`, { headers: MR_HEADERS });
                    if (!r.ok) return null;
                    const list = await r.json();
                    if (!list.length) return null;
                    return list.find(v => v.version_type === 'release')
                        || list.find(v => v.version_type === 'beta')
                        || list[0];
                }

                const mainVer = await findBestVersion(projectId);
                if (!mainVer) throw new Error(`Aucune version compatible avec MC ${mcVersion} + ${loader} pour ce mod`);

                // Étape B : collecter toutes les dépendances requises récursivement
                // On utilise les dépendances de la version ET l'endpoint /dependencies
                const toInstall = new Map(); // versionId → verObject, pour dédupliquer
                toInstall.set(mainVer.id, mainVer);

                async function resolveDeps(ver) {
                    // Source 1 : dépendances dans les métadonnées de la version
                    const directDeps = (ver.dependencies || []).filter(d => d.dependency_type === 'required');

                    // Source 2 : endpoint /dependencies (retourne versions + projects résolus)
                    let apiVersions = [];
                    let apiProjects = [];
                    try {
                        const depsRes = await fetch(`${MR_BASE}/version/${ver.id}/dependencies`, { headers: MR_HEADERS });
                        if (depsRes.ok) {
                            const depsData = await depsRes.json();
                            apiVersions = depsData.versions || [];
                            apiProjects = depsData.projects || [];
                        }
                    } catch(e) {}

                    // Traiter les versions retournées par /dependencies
                    for (const depVer of apiVersions) {
                        if (toInstall.has(depVer.id)) continue;
                        const compatMC     = (depVer.game_versions || []).includes(mcVersion);
                        const compatLoader = (depVer.loaders || []).some(l => l.toLowerCase() === loader.toLowerCase())
                                          || (depVer.loaders || []).length === 0;
                        if (compatMC && compatLoader) {
                            toInstall.set(depVer.id, depVer);
                            await resolveDeps(depVer);
                        } else {
                            // Version incompatible → chercher la bonne via project_id
                            const pid = depVer.project_id;
                            if (pid) {
                                const best = await findBestVersion(pid);
                                if (best && !toInstall.has(best.id)) {
                                    toInstall.set(best.id, best);
                                    await resolveDeps(best);
                                }
                            }
                        }
                    }

                    // Traiter les projects sans version fixée (ex: Sodium dans Iris)
                    for (const dep of directDeps) {
                        const pid = dep.project_id;
                        if (!pid) continue;
                        // Vérifier si ce projet est déjà dans toInstall
                        const alreadyQueued = [...toInstall.values()].some(v => v.project_id === pid);
                        if (alreadyQueued) continue;
                        // Vérifier si déjà installé
                        if (_installedAddons.some(a => a.id === pid)) continue;
                        const best = dep.version_id
                            ? await fetch(`${MR_BASE}/version/${dep.version_id}`, { headers: MR_HEADERS }).then(r => r.ok ? r.json() : null).catch(() => null)
                            : await findBestVersion(pid);
                        if (best && !toInstall.has(best.id)) {
                            toInstall.set(best.id, best);
                            await resolveDeps(best);
                        }
                    }

                    // Aussi chercher via les projects retournés par /dependencies
                    for (const proj of apiProjects) {
                        const alreadyQueued = [...toInstall.values()].some(v => v.project_id === proj.id);
                        if (alreadyQueued) continue;
                        if (_installedAddons.some(a => a.id === proj.id)) continue;
                        const best = await findBestVersion(proj.id);
                        if (best && !toInstall.has(best.id)) {
                            toInstall.set(best.id, best);
                            await resolveDeps(best);
                        }
                    }
                }

                await resolveDeps(mainVer);

                // Étape C : télécharger tout
                console.log(`[Addons] ${toInstall.size} fichier(s) à installer (mod + dépendances)`);
                for (const ver of toInstall.values()) {
                    const file = ver.files?.find(f => f.primary) || ver.files?.[0];
                    if (!file) continue;
                    if (_installedAddons.some(a => a.versionId === ver.id)) {
                        console.log('[Addons] Déjà installé, skip:', file.filename);
                        continue;
                    }
                    console.log('[Addons] Téléchargement:', file.filename);
                    const result = await window.electronAPI.installAddon({
                        fileUrl:        file.url,
                        fileName:       file.filename,
                        addonType:      'mod',
                        profileVersion: mcVersion,
                        profileId:      profileId,
                    });
                    if (!result?.success) console.warn('[Addons] Échec:', file.filename, result?.error);
                    else console.log('[Addons] OK:', file.filename);
                }

            } catch(e) {
                console.error('[Addons] Erreur installation:', e.message);
                showToast('Erreur : ' + e.message, 'error');
                if (btn) { btn.disabled = false; btn.textContent = 'Réessayer'; }
                return;
            }
        }

        // ── 5. Sauvegarder les deux stores ──
        await saveAddons();
        if (typeof saveProfiles === 'function') await saveProfiles();

        // ── 6. Mettre à jour le bouton immédiatement sans re-render ──
        _markCardAsInstalled(projectId);

        closeInstallModal();

        const depsMsg = dependencies.length > 0 ? ` + ${dependencies.length} dép.` : '';
        showToast(`${proj.title} ajouté à "${profileName}"${depsMsg}`, 'success');

    } catch(err) {
        if (btn) { btn.disabled = false; btn.textContent = 'Réessayer'; }
        showToast('Erreur : ' + err.message, 'error');
    }
}

// Met à jour visuellement les boutons sans re-fetch/re-render
function _markCardAsInstalled(projectId) {
    // Carte dans la liste browse via data-project-id
    const card = document.querySelector(`.mr-card[data-project-id="${projectId}"]`);
    if (card) {
        const btn = card.querySelector('.mr-install-btn');
        if (btn) {
            btn.textContent = 'Installé';
            btn.disabled = true;
            btn.classList.add('installed');
            btn.style.background = 'rgba(34,197,94,0.12)';
            btn.style.color = '#4ade80';
            btn.style.border = '1px solid rgba(34,197,94,0.25)';
            btn.style.cursor = 'default';
            btn.setAttribute('onclick', 'event.stopPropagation();void(0)');

            setTimeout(() => {
                btn.textContent = 'Installer';
                btn.disabled = false;
                btn.classList.remove('installed');
                btn.style.background = '';
                btn.style.color = '';
                btn.style.border = '';
                btn.style.cursor = '';
                btn.setAttribute('onclick', `event.stopPropagation(); openMrDetail('${projectId}', '')`);
            }, 2000);
        }
    }
    // Detail panel header
    const detailBtn = document.getElementById('mrDetailInstallBtn');
    if (detailBtn && _mrDetailMod) {
        detailBtn.textContent = 'Installé';
        detailBtn.disabled = true;
        detailBtn.style.background = 'rgba(34,197,94,0.12)';
        detailBtn.style.color = '#4ade80';
        detailBtn.style.border = '1px solid rgba(34,197,94,0.25)';
        detailBtn.style.cursor = 'default';
        detailBtn.onclick = null;

        setTimeout(() => {
            detailBtn.textContent = 'Installer';
            detailBtn.disabled = false;
            detailBtn.style.background = '';
            detailBtn.style.color = '';
            detailBtn.style.border = '';
            detailBtn.style.cursor = '';
            detailBtn.onclick = installFromDetail;
        }, 2000);
    }
}

// ══════════════════════════════════════════════════════════════
//  UTILITAIRES
// ══════════════════════════════════════════════════════════════

function _typeLabel(type) {
    return type === 'resourcepack' ? 'resource pack' : type === 'shader' ? 'shader' : 'mod';
}
function _typeLabelPlural(type) {
    return type === 'resourcepack' ? 'packs' : type === 'shader' ? 'shaders' : 'mods';
}
function _typeEmoji(type) {
    return '';
}
function _colorForType(type) {
    return type === 'resourcepack'
        ? 'linear-gradient(135deg,#0a3a1a,#16a34a)'
        : type === 'shader'
            ? 'linear-gradient(135deg,#3b0f6b,#db2777)'
            : 'linear-gradient(135deg,#1e3a5f,#2563eb)';
}
function _formatNum(n) {
    if (!n) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
    return String(n);
}
function _escHtml(str) {
    return String(str || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _escAttr(str) {
    return String(str || '').replace(/'/g,"\\'").replace(/"/g,'\\"');
}

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════

async function initAddons() {
    await loadAddons();
    searchModrinth();
}

// Exposer globalement pour l'HTML inline
window.switchAddonView       = switchAddonView;
window.switchAddonType       = switchAddonType;
window.filterInstalledAddons = filterInstalledAddons;
window.filterChipAll         = filterChipAll;
window.filterChipActive      = filterChipActive;
window.toggleAddonEnabled    = toggleAddonEnabled;
window.removeAddon           = removeAddon;
window.debouncedModrinthSearch = debouncedModrinthSearch;
window.searchModrinth        = searchModrinth;
window.mrChangePage          = mrChangePage;
window.openMrDetail          = openMrDetail;
window.closeMrDetail         = closeMrDetail;
window.installFromDetail     = installFromDetail;
window.openInstallModal      = openInstallModal;
window.closeInstallModal     = closeInstallModal;
window.confirmInstall        = confirmInstall;
window.renderInstalledAddons = renderInstalledAddons;
window.initAddons            = initAddons;
