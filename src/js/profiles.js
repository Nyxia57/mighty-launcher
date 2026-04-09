/* ============================================================
   profiles.js — Gestion des profils Minecraft
   Mighty Client v2.0.0
   ============================================================ */
'use strict';

// ── VERSIONS GROUPÉES PAR ÈRE ─────────────────────────────────
// Versions Fabric (1.14 → 1.21.11) + Vanilla (< 1.14)
const MC_VERSION_GROUPS = [
  { label: 'Récentes — Fabric (1.21.x)', loader: 'fabric', versions: [
    '1.21.11','1.21.10','1.21.9','1.21.8','1.21.7','1.21.6','1.21.5',
    '1.21.4','1.21.3','1.21.2','1.21.1','1.21',
  ] },
  { label: 'Modernes — Fabric (1.17 – 1.20)', loader: 'fabric', versions: [
    '1.20.6','1.20.5','1.20.4','1.20.3','1.20.2','1.20.1','1.20',
    '1.19.4','1.19.3','1.19.2','1.19.1','1.19',
    '1.18.2','1.18.1','1.18',
    '1.17.1','1.17',
  ] },
  { label: 'Caves & Cliffs — Fabric (1.14 – 1.16)', loader: 'fabric', versions: [
    '1.16.5','1.16.4','1.16.3','1.16.2','1.16.1','1.16',
    '1.15.2','1.15.1','1.15',
    '1.14.4','1.14.3','1.14.2','1.14.1','1.14',
  ] },
  { label: 'Classique — Vanilla (1.8 – 1.13)', loader: 'vanilla', versions: [
    '1.13.2','1.13.1','1.13',
    '1.12.2','1.12.1','1.12',
    '1.11.2','1.11.1','1.11',
    '1.10.2','1.10','1.9.4','1.9.2','1.9',
    '1.8.9','1.8.8','1.8',
  ] },
  { label: 'Ancien — Vanilla (1.0 – 1.7)', loader: 'vanilla', versions: [
    '1.7.10','1.7.9','1.7.2',
    '1.6.4','1.6.2',
    '1.5.2','1.5',
    '1.4.7','1.4.2',
    '1.3.2','1.2.5','1.1','1.0',
  ] },
];

// ── IMAGE PAR ÉPOQUE ─────────────────────────────────────────
// On utilise des dégradés + une image de biome Minecraft selon la version
// Images officielles Minecraft par mise à jour (sources minecraft.net + wiki)
const VERSION_IMAGES = {
    '1.21': 'https://www.minecraft.net/content/dam/games/minecraft/key-art/MC-Tricky-Trials_KeyArt_1170x500.jpg',
    '1.20': 'https://www.minecraft.net/content/dam/games/minecraft/key-art/MC_Java-Bedrock_Trails-and-Tales_KeyArt_1170x500.jpg',
    '1.19': 'https://www.minecraft.net/content/dam/games/minecraft/key-art/wild-update-key-art_1170x500.jpg',
    '1.18': 'https://www.minecraft.net/content/dam/games/minecraft/key-art/Minecraft-Java-Edition--Caves---Cliffs--Part-II_KeyArt_1170x500.jpg',
    '1.17': 'https://www.minecraft.net/content/dam/games/minecraft/key-art/Minecraft-Java-Edition--Caves---Cliffs_KeyArt_1170x500.jpg',
    '1.16': 'https://www.minecraft.net/content/dam/games/minecraft/key-art/nether-update-key-art_1170x500.jpg',
    '1.15': 'https://www.minecraft.net/content/dam/games/minecraft/key-art/Minecraft-Java-Edition-Buzzy-Bees_KeyArt_1170x500.jpg',
    '1.14': 'https://www.minecraft.net/content/dam/games/minecraft/key-art/Minecraft-Java-Edition_Village-and-Pillage_KeyArt_1170x500.jpg',
    '1.13': 'https://www.minecraft.net/content/dam/games/minecraft/key-art/Minecraft-Java-Edition--Update-Aquatic_KeyArt_1170x500.jpg',
    '1.12': 'https://www.minecraft.net/content/dam/games/minecraft/key-art/Minecraft-Java-Edition--World-of-Color_KeyArt_1170x500.jpg',
    '1.9':  'https://www.minecraft.net/content/dam/games/minecraft/key-art/MC_Java_CombatUpdate_KeyArt.jpg',
    '1.8':  'https://www.minecraft.net/content/dam/games/minecraft/key-art/MC_Java_1-8_BountifulUpdate_KeyArt.jpg',
};

function getVersionImg(version) {
    for (const [prefix, url] of Object.entries(VERSION_IMAGES)) {
        if (version.startsWith(prefix)) return url;
    }
    // fallback générique Minecraft
    return 'https://www.minecraft.net/content/dam/games/minecraft/screenshots/1.20-key-art.jpg';
}

// Chargement direct des images (src URL ou via electronAPI si disponible)
const _vImgCache = {};
function _loadVersionImg(version, imgEl) {
    const url = getVersionImg(version);
    if (_vImgCache[url]) { imgEl.src = _vImgCache[url]; return; }
    if (window.electronAPI?.fetchImage) {
        window.electronAPI.fetchImage(url).then(b64 => {
            if (b64) { _vImgCache[url] = b64; imgEl.src = b64; }
        }).catch(() => { imgEl.src = url; });
    } else {
        // Chargement direct (navigateur / dev)
        imgEl.src = url;
        _vImgCache[url] = url;
    }
}

function getVersionTheme(version) {
  if (version.startsWith('1.21') || version.startsWith('1.20'))
    return { bg: 'background:#0f2233', label: 'Tricky Trials / Trails', img: getVersionImg(version) };
  if (version.startsWith('1.19') || version.startsWith('1.18'))
    return { bg: 'background:#0a1a0a', label: 'Wild Update / Caves', img: getVersionImg(version) };
  if (version.startsWith('1.17'))
    return { bg: 'background:#1a0a2a', label: 'Caves & Cliffs', img: getVersionImg(version) };
  if (version.startsWith('1.16'))
    return { bg: 'background:#2a0a00', label: 'Nether Update', img: getVersionImg(version) };
  if (version.startsWith('1.15') || version.startsWith('1.14'))
    return { bg: 'background:#1a2a0a', label: 'Bees / Village', img: getVersionImg(version) };
  if (version.startsWith('1.13'))
    return { bg: 'background:#05102a', label: 'Update Aquatic', img: getVersionImg(version) };
  if (version.startsWith('1.12') || version.startsWith('1.11') || version.startsWith('1.10'))
    return { bg: 'background:#0f1a2a', label: 'World of Color', img: getVersionImg(version) };
  if (version.startsWith('1.9') || version.startsWith('1.8'))
    return { bg: 'background:#0f0f1a', label: 'Ere PvP', img: getVersionImg(version) };
  return { bg: 'background:#1a1a0f', label: 'Classic', img: getVersionImg(version) };
}

// ── ÉTAT ─────────────────────────────────────────────────────
let _profiles         = [];
let _activeProfileId  = null;
let _editingProfileId = null;
let _detailProfileId  = null;

// ── PERSISTANCE ───────────────────────────────────────────────
async function loadProfiles() {
  try {
    if (window.electronAPI?.loadConfig) {
      const cfg = await window.electronAPI.loadConfig();
      if (cfg?.profiles && Array.isArray(cfg.profiles)) { _profiles = cfg.profiles; }
      if (cfg?.activeProfileId) _activeProfileId = cfg.activeProfileId;
      return;
    }
    const saved = localStorage.getItem('mighty-profiles');
    if (saved) { const d = JSON.parse(saved); _profiles = d.profiles||[]; _activeProfileId = d.activeProfileId||null; }
  } catch(e) { console.warn('[Profiles] load error:', e); }
}

async function saveProfiles() {
  try {
    if (window.electronAPI?.saveConfig)
      await window.electronAPI.saveConfig({ profiles: _profiles, activeProfileId: _activeProfileId });
    else
      localStorage.setItem('mighty-profiles', JSON.stringify({ profiles: _profiles, activeProfileId: _activeProfileId }));
  } catch(e) { console.warn('[Profiles] save error:', e); }
}

// ── PROFIL ACTIF ─────────────────────────────────────────────
function setActiveProfile(id) {
  _activeProfileId = id;
  saveProfiles();
  renderProfiles();
  const p = _profiles.find(x => x.id === id);
  if (p && typeof showToast === 'function') showToast('Profil actif : ' + p.name, 'success');
  if (typeof updateLaunchCard === 'function') updateLaunchCard();
  if (typeof syncLoaderFromProfile === 'function') syncLoaderFromProfile();
}

// ── RENDU GRILLE ─────────────────────────────────────────────
function renderProfiles() {
  const grid = document.getElementById('profilesGrid');
  if (!grid) return;
  grid.innerHTML = '';

  _profiles.forEach(p => {
    const isActive = p.id === _activeProfileId;
    const theme    = getVersionTheme(p.version);
    const card     = document.createElement('div');
    card.className = 'profile-card' + (isActive ? ' active-profile' : '');

    card.innerHTML =
      '<div class="profile-card-thumb" style="' + theme.bg + ';position:relative;overflow:hidden;">' +
        '<img data-vimg="' + p.version + '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.65;transition:opacity .3s;">' +
        '<div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.8) 0%,rgba(0,0,0,0.05) 55%);"></div>' +
        '<div style="position:absolute;top:8px;left:8px;width:10px;height:10px;border-radius:50%;background:' + p.color + ';box-shadow:0 0 0 2px rgba(0,0,0,.5),0 0 8px ' + p.color + '99;"></div>' +
        (isActive ? '<div class="profile-active-badge">Actif</div>' : '') +
        '<div style="position:absolute;bottom:8px;left:10px;font-size:10px;font-weight:800;color:rgba(255,255,255,0.95);letter-spacing:.5px;text-shadow:0 1px 6px rgba(0,0,0,1);">' + p.version + '</div>' +
        '<div style="position:absolute;bottom:6px;right:8px;">' +
          '<button onclick="event.stopPropagation();openProfileDetail(\'' + p.id + '\')" style="background:rgba(0,0,0,.65);border:1px solid rgba(255,255,255,.2);color:#fff;padding:3px 9px;border-radius:5px;font-size:9px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;letter-spacing:.5px;">GÉRER</button>' +
        '</div>' +
      '</div>' +
      '<div class="profile-card-body">' +
        '<div class="profile-card-name">' + escHtml(p.name) + '</div>' +
        '<div style="font-size:9px;color:var(--text-muted);margin-top:1px;">' + (p.mods||[]).length + ' mod · ' + (p.resourcepacks||[]).length + ' RP · ' + (p.shaders||[]).length + ' shader</div>' +
      '</div>' +
      '<div class="profile-card-actions">' +
        '<button class="profile-btn-secondary" onclick="event.stopPropagation();openEditProfile(\'' + p.id + '\')" title="Modifier">Modifier</button>' +
        (isActive
          ? '<button class="profile-btn-play" style="cursor:default;opacity:.6;" disabled>Actif</button>'
          : '<button class="profile-btn-play" onclick="event.stopPropagation();setActiveProfile(\'' + p.id + '\')">Choisir</button>'
        ) +
        '<button class="profile-btn-secondary" style="color:#f87171;border-color:rgba(248,113,113,.2);flex:0;padding:5px 7px;" onclick="event.stopPropagation();confirmDeleteProfile(\'' + p.id + '\')" title="Supprimer">X</button>' +
      '</div>';

    card.addEventListener('click', () => openProfileDetail(p.id));
    grid.appendChild(card);
    const vimg = card.querySelector('[data-vimg]');
    if (vimg) _loadVersionImg(p.version, vimg);
  });

  // Carte "Nouveau profil"
  const addCard = document.createElement('div');
  addCard.className = 'profile-card profile-card-add';
  addCard.onclick = openCreateProfile;
  addCard.innerHTML =
    '<div style="width:26px;height:26px;border-radius:6px;border:2px solid rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:16px;color:rgba(255,255,255,.25);font-weight:300;">+</div>' +
    '<div style="font-size:10px;color:var(--text-muted);font-weight:600;margin-top:6px;">Nouveau profil</div>';
  grid.appendChild(addCard);
}

// ── MODAL CRÉATION / ÉDITION ─────────────────────────────────
function openCreateProfile() {
  _editingProfileId = null;
  document.getElementById('profileModalTitle').textContent = 'Nouveau profil';
  document.getElementById('profileNameInput').value = 'Nouveau Profil';
  if (document.getElementById('profileRamSelect')) document.getElementById('profileRamSelect').value = '4';
  if (document.getElementById('profileJvmInput'))  document.getElementById('profileJvmInput').value = '';
  if (document.getElementById('profileLoaderVersionInput')) document.getElementById('profileLoaderVersionInput').value = '';
  _populateVersionSelect('1.21.4');
  _updateVersionPreview('1.21.4');
  document.querySelectorAll('#profileColorGrid .color-opt').forEach((el,i) => el.classList.toggle('selected', i===0));
  switchModalTab('general', document.querySelector('.modal-tab-bar .modal-tab'));
  _resetModalLoader(null); // loader auto-détecté selon la version
  document.getElementById('profileModal').classList.add('open');
}

function openEditProfile(id) {
  const p = _profiles.find(x => x.id === id);
  if (!p) return;
  closeProfileDetail();
  _editingProfileId = id;
  document.getElementById('profileModalTitle').textContent = 'Modifier le profil';
  document.getElementById('profileNameInput').value = p.name;
  if (document.getElementById('profileRamSelect')) document.getElementById('profileRamSelect').value = String(p.ram || 4);
  if (document.getElementById('profileJvmInput'))  document.getElementById('profileJvmInput').value  = p.jvmExtra || '';
  if (document.getElementById('profileLoaderVersionInput')) document.getElementById('profileLoaderVersionInput').value = p.loaderVersion || '';
  _populateVersionSelect(p.version);
  _updateVersionPreview(p.version);
  document.querySelectorAll('#profileColorGrid .color-opt').forEach(el => el.classList.toggle('selected', el.dataset.color === p.color));
  switchModalTab('general', document.querySelector('.modal-tab-bar .modal-tab'));
  _resetModalLoader(p.loader || 'vanilla');
  document.getElementById('profileModal').classList.add('open');
}

function _populateVersionSelect(selected) {
  const el = document.getElementById('profileVersionSelect');
  if (!el) return;
  el.innerHTML = MC_VERSION_GROUPS.map(g =>
    '<optgroup label="' + g.label + '">' +
    g.versions.map(v => '<option value="' + v + '"' + (v===selected?' selected':'') + '>' + v + '</option>').join('') +
    '</optgroup>'
  ).join('');
  // Mettre à jour le preview et le loader automatiquement selon la version
  el.onchange = () => {
    _updateVersionPreview(el.value);
    _autoSelectLoaderForVersion(el.value);
    _updateLoaderBadge(el.value);
  };
}

function _updateVersionPreview(version) {
  const preview = document.getElementById('versionPreview');
  if (!preview) return;
  const theme = getVersionTheme(version);
  preview.style.cssText = theme.bg + ';position:relative;overflow:hidden;';
  preview.innerHTML =
    '<img data-vimg="' + version + '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.65;">' +
    '<div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.8) 0%,rgba(0,0,0,0.05) 60%);"></div>' +
    '<div style="position:absolute;bottom:0;left:0;right:0;padding:6px 10px;">' +
      '<div style="font-size:11px;font-weight:800;color:#fff;letter-spacing:.5px;text-shadow:0 1px 4px rgba(0,0,0,1);">Minecraft ' + version + '</div>' +
      '<div style="font-size:9px;color:rgba(255,255,255,.7);margin-top:1px;">' + theme.label + '</div>' +
    '</div>';
  const vimg = preview.querySelector('[data-vimg]');
  if (vimg) _loadVersionImg(version, vimg);
}

function closeProfileModal() {
  document.getElementById('profileModal').classList.remove('open');
  _editingProfileId = null;
}

function saveProfileModal() {
  const name     = document.getElementById('profileNameInput').value.trim() || 'Profil';
  const version  = document.getElementById('profileVersionSelect').value;
  const ram = parseInt(document.getElementById('profileRamSelect')?.value || '4');
  const jvmExtra = document.getElementById('profileJvmInput')?.value || '';
  const javaPath = '';
  const colorEl  = document.querySelector('#profileColorGrid .color-opt.selected');
  const color    = colorEl ? colorEl.dataset.color : '#8B5CF6';

  // Loader choisi dans le modal
  const loaderEl      = document.querySelector('#profileModalLoaderGrid .pm-loader-opt.selected');
  const loader        = loaderEl ? loaderEl.dataset.loader : 'vanilla';
  const loaderVersion = document.getElementById('profileLoaderVersionInput')?.value?.trim() || null;

  if (_editingProfileId) {
    const idx = _profiles.findIndex(x => x.id === _editingProfileId);
    if (idx !== -1) _profiles[idx] = { ..._profiles[idx], name, version, ram, color, jvmExtra, javaPath, loader, loaderVersion };
  } else {
    const newId = 'p_' + Date.now();
    _profiles.push({ id:newId, name, version, ram, color, jvmExtra, javaPath, loader, loaderVersion, mods:[], resourcepacks:[], shaders:[], createdAt:new Date().toISOString() });
    if (_profiles.length === 1) _activeProfileId = newId;
  }
  saveProfiles(); renderProfiles(); closeProfileModal();
  if (typeof updateLaunchCard      === 'function') updateLaunchCard();
  if (typeof syncLoaderFromProfile === 'function') syncLoaderFromProfile();
  if (typeof showToast === 'function') showToast('Profil sauvegardé', 'success');
}

function confirmDeleteProfile(id) {
  const p = _profiles.find(x => x.id === id);
  if (!p) return;
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:9999;';
  ov.innerHTML =
    '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:26px 28px;max-width:340px;width:90%;text-align:center;">' +
      '<div style="font-size:15px;font-weight:700;color:var(--text-main);margin-bottom:8px;">Supprimer le profil ?</div>' +
      '<div style="font-size:12px;color:var(--text-muted);margin-bottom:22px;">&laquo; ' + escHtml(p.name) + ' &raquo; sera definitivement supprime.</div>' +
      '<div style="display:flex;gap:10px;justify-content:center;">' +
        '<button id="_cDel" style="background:var(--bg-card);border:1px solid var(--border);color:var(--text-muted);padding:8px 20px;border-radius:7px;font-family:Inter,sans-serif;font-size:13px;font-weight:600;cursor:pointer;">Annuler</button>' +
        '<button id="_oDel" style="background:#ef4444;border:none;color:#fff;padding:8px 20px;border-radius:7px;font-family:Inter,sans-serif;font-size:13px;font-weight:700;cursor:pointer;">Supprimer</button>' +
      '</div></div>';
  document.body.appendChild(ov);
  ov.querySelector('#_cDel').onclick = () => document.body.removeChild(ov);
  ov.querySelector('#_oDel').onclick = () => {
    _profiles = _profiles.filter(x => x.id !== id);
    if (_activeProfileId === id) _activeProfileId = _profiles[0]?.id || null;
    saveProfiles(); renderProfiles(); document.body.removeChild(ov);
    if (_detailProfileId === id) closeProfileDetail();
    if (typeof showToast === 'function') showToast('Profil supprime', 'info');
  };
}

// ── VUE DÉTAIL ────────────────────────────────────────────────
function openProfileDetail(id) {
  _detailProfileId = id;
  const p = _profiles.find(x => x.id === id);
  if (!p) return;
  let panel = document.getElementById('profileDetailPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'profileDetailPanel';
    panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;z-index:2000;';
    document.body.appendChild(panel);
  }
  panel.innerHTML = _buildDetailHTML(p);
  panel.style.display = 'flex';
  _switchDetailTab('mods');
  panel.onclick = e => { if (e.target === panel) closeProfileDetail(); };
}

function closeProfileDetail() {
  const panel = document.getElementById('profileDetailPanel');
  if (panel) panel.style.display = 'none';
  _detailProfileId = null;
}

function _buildDetailHTML(p) {
  const theme    = getVersionTheme(p.version);
  const isActive = p.id === _activeProfileId;
  return '<div style="background:var(--bg-main);border:1px solid var(--border);border-radius:14px;width:680px;max-width:96vw;max-height:86vh;display:flex;flex-direction:column;overflow:hidden;">' +
    // Header avec preview de version en fond
    '<div style="position:relative;display:flex;align-items:center;gap:14px;padding:18px 20px;border-bottom:1px solid var(--border);flex-shrink:0;overflow:hidden;">' +
      '<div style="position:absolute;inset:0;' + theme.bg + ';opacity:.35;"></div>' +
      '<div style="position:absolute;inset:0;background:repeating-linear-gradient(45deg,' + p.color + '06 0,transparent 8px);"></div>' +
      '<div style="position:relative;width:44px;height:44px;border-radius:10px;background:' + p.color + ';flex-shrink:0;box-shadow:0 4px 14px ' + p.color + '55;"></div>' +
      '<div style="position:relative;flex:1;">' +
        '<div style="font-size:16px;font-weight:800;color:var(--text-main);">' + escHtml(p.name) + '</div>' +
        '<div style="font-size:11px;color:' + p.color + ';font-weight:700;margin-top:2px;">Minecraft ' + p.version + ' &nbsp;&middot;&nbsp; <span style="color:var(--text-muted);font-weight:500;">' + theme.label + '</span></div>' +
      '</div>' +
      (isActive
        ? '<div style="position:relative;background:var(--accent);color:#fff;font-size:9px;font-weight:800;letter-spacing:1px;padding:4px 10px;border-radius:20px;text-transform:uppercase;margin-right:8px;">Actif</div>'
        : '<button onclick="setActiveProfile(\'' + p.id + '\')" style="position:relative;background:rgba(124,92,191,.2);border:1px solid rgba(124,92,191,.4);color:var(--accent);padding:6px 14px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;margin-right:8px;">Choisir</button>'
      ) +
      '<button onclick="openEditProfile(\'' + p.id + '\')" style="position:relative;background:var(--bg-card);border:1px solid var(--border);color:var(--text-sub);padding:6px 13px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;margin-right:6px;">Modifier</button>' +
      '<button onclick="closeProfileDetail()" style="position:relative;background:none;border:none;color:var(--text-muted);font-size:22px;cursor:pointer;line-height:1;padding:2px 6px;border-radius:5px;">&times;</button>' +
    '</div>' +
    // Onglets
    '<div style="display:flex;border-bottom:1px solid var(--border);flex-shrink:0;padding:0 20px;">' +
      _dtBtn('mods','Mods',(p.mods||[]).length) +
      _dtBtn('resourcepacks','Resource Packs',(p.resourcepacks||[]).length) +
      _dtBtn('shaders','Shaders',(p.shaders||[]).length) +
    '</div>' +
    '<div id="profileDetailBody" style="flex:1;overflow-y:auto;padding:16px 20px;"></div>' +
  '</div>';
}

function _dtBtn(id, label, count) {
  return '<button id="dtab_' + id + '" onclick="_switchDetailTab(\'' + id + '\')" style="background:none;border:none;border-bottom:2px solid transparent;color:var(--text-muted);font-family:Inter,sans-serif;font-size:11px;font-weight:700;letter-spacing:.5px;padding:10px 16px;cursor:pointer;transition:color .15s,border-color .15s;margin-bottom:-1px;">' +
    label + ' <span style="background:rgba(255,255,255,.07);border-radius:10px;padding:1px 7px;font-size:10px;margin-left:5px;">' + count + '</span>' +
  '</button>';
}

function _switchDetailTab(tabId) {
  ['mods','resourcepacks','shaders'].forEach(t => {
    const b = document.getElementById('dtab_' + t);
    if (!b) return;
    b.style.color             = t===tabId ? 'var(--text-main)' : 'var(--text-muted)';
    b.style.borderBottomColor = t===tabId ? 'var(--accent)'    : 'transparent';
  });
  const p = _profiles.find(x => x.id === _detailProfileId);
  if (!p) return;
  const body = document.getElementById('profileDetailBody');
  if (!body) return;
  const items  = p[tabId] || [];
  const labels = { mods:'mod', resourcepacks:'resource pack', shaders:'shader' };
  const colors = { mods:'#3b82f6', resourcepacks:'#22c55e', shaders:'#ec4899' };
  const typeMap = { mods:'mod', resourcepacks:'resourcepack', shaders:'shader' };
  const c = colors[tabId]; const t = typeMap[tabId];

  body.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">' +
      '<div style="font-size:11px;color:var(--text-muted);font-weight:600;">' + items.length + ' ' + labels[tabId] + (items.length>1?'s':'') + ' installe' + (items.length>1?'s':'') + '</div>' +
      '<button onclick="goToAddonsPage(\'' + t + '\',\'' + p.id + '\')" style="background:' + c + '18;border:1px solid ' + c + '40;color:' + c + ';padding:7px 16px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;" onmouseover="this.style.background=\'' + c + '2e\'" onmouseout="this.style.background=\'' + c + '18\'">+ Ajouter</button>' +
    '</div>' +
    '<div id="addonItemsList">' +
      (items.length===0 ? _emptyState(labels[tabId],c,t,p.id) : items.map((item,idx) => _addonRow(item,idx,tabId,c)).join('')) +
    '</div>';
}

function _emptyState(label, color, addonType, profileId) {
  return '<div style="text-align:center;padding:44px 20px;color:var(--text-muted);">' +
    '<div style="width:40px;height:40px;border-radius:10px;background:' + color + '12;border:1.5px dashed ' + color + '40;margin:0 auto 16px;"></div>' +
    '<div style="font-size:13px;font-weight:600;color:var(--text-sub);margin-bottom:6px;">Aucun ' + label + '</div>' +
    '<div style="font-size:11px;margin-bottom:18px;">Ajoute un ' + label + ' depuis la page Mods.</div>' +
    '<button onclick="goToAddonsPage(\'' + addonType + '\',\'' + profileId + '\')" style="background:' + color + '18;border:1px solid ' + color + '40;color:' + color + ';padding:8px 20px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;">Aller sur la page Mods</button>' +
  '</div>';
}

function _addonRow(item, idx, tabId, color) {
  return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;margin-bottom:6px;">' +
    '<div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:' + (item.enabled?color:'var(--text-muted)') + ';"></div>' +
    '<div style="flex:1;overflow:hidden;">' +
      '<div style="font-size:12px;font-weight:700;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHtml(item.name) + '</div>' +
      (item.version?'<div style="font-size:10px;color:var(--text-muted);">v'+escHtml(item.version)+'</div>':'') +
    '</div>' +
    '<label style="display:flex;align-items:center;gap:5px;cursor:pointer;flex-shrink:0;">' +
      '<input type="checkbox" ' + (item.enabled?'checked':'') + ' onchange="_toggleAddon(\'' + tabId + '\',' + idx + ',this.checked)" style="accent-color:' + color + ';width:14px;height:14px;cursor:pointer;">' +
      '<span style="font-size:10px;color:var(--text-muted);">Actif</span>' +
    '</label>' +
    '<button onclick="_removeAddon(\'' + tabId + '\',' + idx + ')" style="background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);color:#f87171;padding:4px 10px;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;flex-shrink:0;">Retirer</button>' +
  '</div>';
}

// ── PAGE ADDONS ───────────────────────────────────────────────
function goToAddonsPage(addonType, profileId) {
  closeProfileDetail();
  if (typeof showPage === 'function') showPage('addons');
  setTimeout(() => {
    switchAddonType(addonType, document.querySelector('.addon-tab[data-type="' + addonType + '"]'));
    switchAddonView('browse',  document.querySelector('.addon-tab[data-cat="browse"]'));
  }, 60);
}

function _toggleAddon(tabId, idx, enabled) {
  const p = _profiles.find(x => x.id === _detailProfileId);
  if (!p || !p[tabId]?.[idx]) return;
  p[tabId][idx].enabled = enabled;
  saveProfiles();
}

function _removeAddon(tabId, idx) {
  const p = _profiles.find(x => x.id === _detailProfileId);
  if (!p || !p[tabId]) return;
  p[tabId].splice(idx, 1);
  saveProfiles(); _switchDetailTab(tabId); renderProfiles();
}

function switchAddonView(viewId, el) {
  document.querySelectorAll('.addon-view').forEach(v => v.classList.remove('active'));
  const t = document.getElementById('view-' + viewId);
  if (t) t.classList.add('active');
  document.querySelectorAll('.addon-tab[data-cat]').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  else { const x = document.querySelector('.addon-tab[data-cat="' + viewId + '"]'); if (x) x.classList.add('active'); }
}

function switchAddonType(typeId, el) {
  document.querySelectorAll('.addon-tab[data-type]').forEach(t => t.classList.remove('active-type'));
  if (el) el.classList.add('active-type');
  else { const x = document.querySelector('.addon-tab[data-type="' + typeId + '"]'); if (x) x.classList.add('active-type'); }
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function selectProfileColor(el) {
  document.querySelectorAll('#profileColorGrid .color-opt').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
}

// ── Sélection du loader dans le modal ────────────────────────
const LOADER_COLORS = { vanilla:'#4ade80', fabric:'#c4a4e0' };

// Auto-sélectionne Fabric pour 1.14+ et Vanilla pour les versions antérieures (sans UI de choix)
function _autoSelectLoaderForVersion(version) {
  const group = MC_VERSION_GROUPS.find(g => g.versions.includes(version));
  const loader = group ? group.loader : 'fabric';
  // Mettre à jour le hidden grid pour que saveProfileModal() lise le bon loader
  document.querySelectorAll('#profileModalLoaderGrid .pm-loader-opt').forEach(e => {
    e.classList.toggle('selected', e.dataset.loader === loader);
  });
}

function _updateLoaderBadge(version) {
  const group = MC_VERSION_GROUPS.find(g => g.versions.includes(version));
  const loader = group ? group.loader : 'fabric';
  const badge = document.getElementById('loaderBadge');
  const badgeText = document.getElementById('loaderBadgeText');
  if (!badge || !badgeText) return;
  if (loader === 'fabric') {
    badge.style.background = 'rgba(196,164,224,0.12)';
    badge.style.border = '1px solid rgba(196,164,224,0.3)';
    badge.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#c4a4e0" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12h8M12 8v8"/></svg><span id="loaderBadgeText" style="font-size:10px;font-weight:700;color:#c4a4e0;">Fabric</span>';
  } else {
    badge.style.background = 'rgba(74,222,128,0.1)';
    badge.style.border = '1px solid rgba(74,222,128,0.25)';
    badge.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg><span id="loaderBadgeText" style="font-size:10px;font-weight:700;color:#4ade80;">Vanilla</span>';
  }
}

function selectModalLoader(el) {
  // Le loader est automatique — on met juste à jour la sélection dans le hidden grid
  document.querySelectorAll('#profileModalLoaderGrid .pm-loader-opt').forEach(e => e.classList.remove('selected'));
  if (el) el.classList.add('selected');
}
window.selectModalLoader = selectModalLoader;

function _resetModalLoader(loader) {
  // Mettre à jour le hidden grid
  document.querySelectorAll('#profileModalLoaderGrid .pm-loader-opt').forEach(e => {
    e.classList.toggle('selected', e.dataset.loader === (loader || 'fabric'));
  });
  // Mettre à jour le badge
  const version = document.getElementById('profileVersionSelect')?.value || '1.21.4';
  _updateLoaderBadge(version);
}

function switchModalTab(tabId, btn) {
  /* onglets Java/Graphismes supprimés */
}

async function initProfiles() { await loadProfiles(); renderProfiles(); if (typeof updateLaunchCard === 'function') updateLaunchCard(); }

// Getters pour accounts.js
window._getProfiles         = () => _profiles;
window._getActiveProfileId  = () => _activeProfileId;

// Globals
window.initProfiles=initProfiles; window.renderProfiles=renderProfiles;
window.createNewProfile=openCreateProfile; window.openCreateProfile=openCreateProfile;
window.openEditProfile=openEditProfile; window.closeProfileModal=closeProfileModal;
window.saveProfileModal=saveProfileModal; window.confirmDeleteProfile=confirmDeleteProfile;
window.openProfileDetail=openProfileDetail; window.closeProfileDetail=closeProfileDetail;
window.setActiveProfile=setActiveProfile;
window._switchDetailTab=_switchDetailTab; window._toggleAddon=_toggleAddon;
window._removeAddon=_removeAddon; window.goToAddonsPage=goToAddonsPage;
window.selectProfileColor=selectProfileColor; window.switchModalTab=switchModalTab;
window.switchAddonView=switchAddonView; window.switchAddonType=switchAddonType;
window._updateVersionPreview=_updateVersionPreview;
