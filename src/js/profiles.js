// ═══════════════════════════════════════════════════════
// PROFILS — CRUD, Versions MC, Import/Export, Bannières
// ═══════════════════════════════════════════════════════

// ─── RENDER PROFILES ─────────────────────────────────
function renderProfiles() {
  const g = document.getElementById('pgrid');
  g.innerHTML = `<div class="add-pcard" onclick="openCreateProfile()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Créer un profil</span></div>`
    + P.map(p => pCardHTML(p)).join('');
}

function pCardHTML(p) {
  const lt = p.loader !== 'vanilla'
    ? `<span class="ptag ptag-${p.loader}">${cap(p.loader)}</span>`
    : `<span class="ptag ptag-vanilla">Vanilla</span>`;
  const mc = (p.mods || []).length > 0 ? `<span class="ptag ptag-mods">${(p.mods || []).length} mod(s)</span>` : '';
  return `<div class="pcard${p.active ? ' active' : ''}">
    <div class="pcard-banner"><div class="pcard-banner-bg" style="background:${p.banner || 'linear-gradient(135deg,#0d2a3d,#1a3a1d)'}"></div>${p.active ? '<span class="pcard-badge">ACTIF</span>' : ''}<span class="pcard-ver">${p.version}</span></div>
    <div class="pcard-body">
      <div class="pcard-nm">${esc(p.name)}</div>
      <div class="pcard-meta">${cap(p.loader)}${p.lver ? ' ' + esc(p.lver) : ''}</div>
      <div class="pcard-tags">${lt}${mc}</div>
      <div class="pcard-actions">
        <button class="pcard-play" onclick="launchProfile('${p.id}',event)"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>JOUER</button>
        <button class="pic-btn" title="Modifier" onclick="openEditProfile('${p.id}',event)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="pic-btn del" title="Supprimer" onclick="delProfile('${p.id}',event)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
      </div>
    </div>
  </div>`;
}

// ─── PROFILE CRUD ────────────────────────────────────
function openCreateProfile() {
  editId = null; tmpMods = []; tmpRP = []; tmpShaders = [];
  tmpBanner = 'linear-gradient(135deg,#0d2a3d,#1a3a1d)';
  document.getElementById('pm-title').textContent = 'Créer un profil';
  ['pm-name','pm-lver','pm-jvm','pm-gamedir'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('pm-rmin').value = '';
  document.getElementById('pm-rmax').value = '';
  document.getElementById('pm-loader').value = 'fabric';
  document.querySelectorAll('.bsw').forEach((b, i) => b.style.border = i === 0 ? '2px solid #fff' : '2px solid transparent');
  mTab('gen', document.querySelector('.mtab'));
  renderTmpLists();
  openOv('ov-profile');
  if (MC_VERSIONS.length === 0) MC_VERSIONS = FALLBACK_VERSIONS.slice();
  const firstVer = MC_VERSIONS[0]?.id || '1.21.11';
  document.getElementById('pm-ver').value = firstVer;
  document.getElementById('pm-ver-search').value = firstVer;
  loadMCVersions();
}

function openEditProfile(id, e) {
  if (e) e.stopPropagation();
  const p = P.find(x => x.id === id); if (!p) return;
  editId = id;
  tmpMods    = JSON.parse(JSON.stringify(p.mods    || []));
  tmpRP      = JSON.parse(JSON.stringify(p.rp      || []));
  tmpShaders = JSON.parse(JSON.stringify(p.shaders || []));
  tmpBanner  = p.banner || 'linear-gradient(135deg,#0d2a3d,#1a3a1d)';
  document.getElementById('pm-title').textContent   = 'Modifier le profil';
  document.getElementById('pm-name').value          = p.name;
  document.getElementById('pm-loader').value        = p.loader;
  document.getElementById('pm-lver').value          = p.lver    || '';
  document.getElementById('pm-rmin').value          = p.ramMin  || '';
  document.getElementById('pm-rmax').value          = p.ramMax  || '';
  document.getElementById('pm-jvm').value           = p.jvmArgs || '';
  document.getElementById('pm-gamedir').value       = p.gameDir || '';
  document.querySelectorAll('.bsw').forEach(b => b.style.border = b.dataset.c === tmpBanner ? '2px solid #fff' : '2px solid transparent');
  mTab('gen', document.querySelector('.mtab'));
  renderTmpLists();
  openOv('ov-profile');
  if (MC_VERSIONS.length === 0) MC_VERSIONS = FALLBACK_VERSIONS.slice();
  document.getElementById('pm-ver').value        = p.version || '';
  document.getElementById('pm-ver-search').value = p.version || '';
  loadMCVersions();
}

function saveProfile() {
  const name = document.getElementById('pm-name').value.trim();
  if (!name) { flash('pm-name'); return; }
  const prof = {
    id: editId || Date.now().toString(), name,
    version: document.getElementById('pm-ver').value,
    loader: document.getElementById('pm-loader').value,
    lver: document.getElementById('pm-lver').value.trim(),
    banner: tmpBanner,
    mods:    JSON.parse(JSON.stringify(tmpMods)),
    rp:      JSON.parse(JSON.stringify(tmpRP)),
    shaders: JSON.parse(JSON.stringify(tmpShaders)),
    ramMin:  parseInt(document.getElementById('pm-rmin').value) || null,
    ramMax:  parseInt(document.getElementById('pm-rmax').value) || null,
    jvmArgs: document.getElementById('pm-jvm').value.trim(),
    gameDir: document.getElementById('pm-gamedir').value.trim(),
    active: false,
  };
  if (editId) { const i = P.findIndex(p => p.id === editId); if (i >= 0) { prof.active = P[i].active; P[i] = prof; } }
  else { if (P.length === 0) prof.active = true; P.push(prof); }
  saveP(); closeOv('ov-profile'); renderProfiles(); renderPlay();
  refreshAllModGridButtons();
}

function delProfile(id, e) {
  if (e) e.stopPropagation();
  const p = P.find(x => x.id === id); if (!p) return;
  showCfm('Supprimer le profil', `Supprimer "${esc(p.name)}" ? Cette action est irréversible.`, () => {
    P = P.filter(x => x.id !== id);
    if (p.active && P.length > 0) P[0].active = true;
    saveP(); renderProfiles(); renderPlay();
  });
}

function launchProfile(id, e) {
  if (e) e.stopPropagation();
  P.forEach(p => p.active = p.id === id);
  saveP(); renderProfiles(); renderPlay();
  navPage('play', document.querySelector('[data-page="play"]'));
  doLaunch();
}

function pickBanner(el) {
  document.querySelectorAll('.bsw').forEach(b => b.style.border = '2px solid transparent');
  el.style.border = '2px solid #fff';
  tmpBanner = el.dataset.c;
}

// ─── CONTENT DU PROFIL (mods/rp/shaders dans le modal) ─
function renderTmpLists() {
  renderTmpList('pm-mods-list', tmpMods, 'mod');
  renderTmpList('pm-rp-list',   tmpRP,   'rp');
  renderTmpList('pm-sh-list',   tmpShaders, 'shader');
}

function renderTmpList(cid, arr, type) {
  const c = document.getElementById(cid);
  if (!arr || !arr.length) { c.innerHTML = emptyHTML('Aucun élément'); return; }
  const svgs = {
    mod:    '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>',
    rp:     '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    shader: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  };
  c.innerHTML = arr.map((item, idx) => `
    <div class="irow">
      <div class="ithumb">${item.icon && !item.icon.startsWith('#') ? `<img src="${item.icon}" alt="" onerror="this.style.display='none'">` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${svgs[type] || ''}</svg>`}</div>
      <div class="iinfo">
        <div class="iname">${esc(item.name)}</div>
        <div class="imeta">${item.author ? esc(item.author) + ' · ' : ''}${item.version ? 'v' + esc(item.version) : ''}</div>
      </div>
      <span class="ibadge ${item.enabled !== false ? 'ibadge-ok' : 'ibadge-off'}">${item.enabled !== false ? 'Actif' : 'Inactif'}</span>
      <span class="ipill ${item.enabled !== false ? 'on' : 'off'}" onclick="toggleTmp('${type}',${idx})">${item.enabled !== false ? 'Actif' : 'Inactif'}</span>
      <button class="pic-btn del" onclick="removeTmp('${type}',${idx},event)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
    </div>`).join('');
}

function toggleTmp(type, idx) {
  const arr = type === 'mod' ? tmpMods : type === 'rp' ? tmpRP : tmpShaders;
  arr[idx].enabled = arr[idx].enabled === false;
  renderTmpList(type === 'mod' ? 'pm-mods-list' : type === 'rp' ? 'pm-rp-list' : 'pm-sh-list', arr, type);
}
function removeTmp(type, idx, e) {
  if (e) e.stopPropagation();
  const arr = type === 'mod' ? tmpMods : type === 'rp' ? tmpRP : tmpShaders;
  const removed = arr.splice(idx, 1)[0];
  renderTmpList(type === 'mod' ? 'pm-mods-list' : type === 'rp' ? 'pm-rp-list' : 'pm-sh-list', arr, type);
  if (removed?.modrinthId) refreshModGridButton(removed.modrinthId, false);
}

function openAddItemInModal(type) {
  itemCtx = 'modal'; itemType = type;
  const labels = { mod: 'Ajouter un mod', rp: 'Ajouter un Resource Pack', shader: 'Ajouter un Shader' };
  document.getElementById('item-title').textContent = labels[type];
  ['item-name','item-desc','item-ver','item-author'].forEach(id => document.getElementById(id).value = '');
  openOv('ov-item');
}

function confirmAddItem() {
  const name = document.getElementById('item-name').value.trim();
  if (!name) { flash('item-name'); return; }
  const item = {
    name,
    desc:    document.getElementById('item-desc').value.trim(),
    version: document.getElementById('item-ver').value.trim(),
    author:  document.getElementById('item-author').value.trim(),
    enabled: true,
  };
  if (itemType === 'mod')    tmpMods.push(item);
  if (itemType === 'rp')     tmpRP.push(item);
  if (itemType === 'shader') tmpShaders.push(item);
  closeOv('ov-item');
  renderTmpLists();
}

function mTab(name, el) {
  document.querySelectorAll('.mtab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.tpane').forEach(t => t.classList.remove('active'));
  document.getElementById('tp-' + name).classList.add('active');
}

// ─── NAVIGATION PROFIL → MODS ────────────────────────
function goToModsFromProfile(facet) {
  pendingProfileEdit = {
    editId,
    name:    document.getElementById('pm-name').value,
    version: document.getElementById('pm-ver').value,
    loader:  document.getElementById('pm-loader').value,
    lver:    document.getElementById('pm-lver').value,
    banner:  tmpBanner,
    mods:    JSON.parse(JSON.stringify(tmpMods)),
    rp:      JSON.parse(JSON.stringify(tmpRP)),
    shaders: JSON.parse(JSON.stringify(tmpShaders)),
    ramMin:  document.getElementById('pm-rmin').value,
    ramMax:  document.getElementById('pm-rmax').value,
    jvmArgs: document.getElementById('pm-jvm').value,
    gameDir: document.getElementById('pm-gamedir').value,
  };
  closeOv('ov-profile');
  modrinthFacet = facet;
  document.querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  const facetMap = { mod: 0, resourcepack: 1, shader: 2 };
  const tabs = document.querySelectorAll('.ftab');
  if (tabs[facetMap[facet]]) tabs[facetMap[facet]].classList.add('active');
  navPage('mods', document.querySelector('[data-page="mods"]'));
  searchModrinth();
  showProfileEditBanner();
}

function showProfileEditBanner() {
  let banner = document.getElementById('profile-edit-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'profile-edit-banner';
    banner.style.cssText = `
      position:fixed;bottom:0;left:0;right:0;z-index:800;
      background:var(--accent);color:#051a0a;
      padding:10px 20px;display:flex;align-items:center;justify-content:space-between;
      font-size:13px;font-weight:700;box-shadow:0 -4px 20px rgba(74,222,128,.3);
    `;
    document.body.appendChild(banner);
  }
  const profileName = pendingProfileEdit?.name || 'profil';
  banner.innerHTML = `
    <span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;display:inline;margin-right:6px"><rect x="2" y="3" width="20" height="14" rx="2"/></svg>
      Tu es en train d'ajouter des mods au profil <strong>"${esc(profileName)}"</strong> — clique sur + pour les ajouter
    </span>
    <button onclick="returnToProfileEdit()" style="
      background:#051a0a;color:var(--accent);border:none;padding:6px 14px;
      border-radius:6px;font-weight:800;font-size:12px;cursor:pointer;font-family:var(--font)
    ">← Retour au profil</button>
  `;
  banner.style.display = 'flex';
}

function returnToProfileEdit() {
  const banner = document.getElementById('profile-edit-banner');
  if (banner) banner.style.display = 'none';
  if (!pendingProfileEdit) return;
  editId     = pendingProfileEdit.editId;
  tmpMods    = pendingProfileEdit.mods;
  tmpRP      = pendingProfileEdit.rp;
  tmpShaders = pendingProfileEdit.shaders;
  tmpBanner  = pendingProfileEdit.banner;
  document.getElementById('pm-title').textContent        = editId ? 'Modifier le profil' : 'Créer un profil';
  document.getElementById('pm-name').value               = pendingProfileEdit.name    || '';
  document.getElementById('pm-loader').value             = pendingProfileEdit.loader  || 'fabric';
  document.getElementById('pm-lver').value               = pendingProfileEdit.lver    || '';
  document.getElementById('pm-rmin').value               = pendingProfileEdit.ramMin  || '';
  document.getElementById('pm-rmax').value               = pendingProfileEdit.ramMax  || '';
  document.getElementById('pm-jvm').value                = pendingProfileEdit.jvmArgs || '';
  document.getElementById('pm-gamedir').value            = pendingProfileEdit.gameDir || '';
  document.getElementById('pm-ver').value                = pendingProfileEdit.version || '';
  document.getElementById('pm-ver-search').value         = pendingProfileEdit.version || '';
  document.querySelectorAll('.bsw').forEach(b => b.style.border = b.dataset.c === tmpBanner ? '2px solid #fff' : '2px solid transparent');
  mTab('mods-t', document.querySelectorAll('.mtab')[1]);
  renderTmpLists();
  openOv('ov-profile');
  navPage('profiles', document.querySelector('[data-page="profiles"]'));
}

// ─── IMPORT / EXPORT ─────────────────────────────────
function exportProfiles() {
  const data = { version: 1, profiles: P, exported: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'mighty-profiles.json'; a.click();
  URL.revokeObjectURL(url);
}

function importProfiles() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json,.mrpack';
  input.onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    file.name.endsWith('.mrpack') ? importMrpack(file) : importJSON(file);
  };
  input.click();
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data     = JSON.parse(ev.target.result);
      const incoming = data.profiles || data;
      if (!Array.isArray(incoming)) { alert('Format invalide'); return; }
      if (!confirm(`Importer ${incoming.length} profil(s) ? Les profils existants seront conservés.`)) return;
      let added = 0;
      for (const p of incoming) { if (!P.find(x => x.id === p.id)) { P.push({ ...p, active: false }); added++; } }
      saveP(); renderProfiles(); renderPlay();
      alert(`${added} profil(s) importé(s) avec succès.`);
    } catch (e) { alert('Erreur lecture JSON : ' + e.message); }
  };
  reader.readAsText(file);
}

async function importMrpack(file) {
  try {
    await ensureJSZip();
    const zip       = await JSZip.loadAsync(file);
    const indexFile = zip.file('modrinth.index.json');
    if (!indexFile) throw new Error('modrinth.index.json introuvable dans ce .mrpack');
    const index     = JSON.parse(await indexFile.async('text'));
    const name      = index.name || file.name.replace('.mrpack', '');
    const mcVersion = index.dependencies?.minecraft || '';
    const loader    = detectLoader(index.dependencies);
    const lver      = detectLoaderVersion(index.dependencies);
    const mods      = (index.files || [])
      .filter(f => f.path?.startsWith('mods/'))
      .map(f => ({
        name: f.path.split('/').pop().replace(/\.jar$/, ''),
        modrinthId: f.downloads?.[0]?.match(/modrinth\.com\/data\/([^/]+)/)?.[1] || '',
        enabled: true, version: '', author: '', desc: '', icon: '',
      }));
    const profile = { id: Date.now().toString(), name, version: mcVersion, loader, lver,
      banner: 'linear-gradient(135deg,#0d2a3d,#1a3a1d)', mods, rp: [], shaders: [],
      ramMin: null, ramMax: null, jvmArgs: '', gameDir: '', active: false };
    if (!confirm(`Importer le modpack "${name}" ?\n• MC ${mcVersion}\n• ${cap(loader)} ${lver}\n• ${mods.length} mod(s)`)) return;
    P.push(profile); saveP(); renderProfiles(); renderPlay();
    alert(`Modpack "${name}" importé avec ${mods.length} mod(s) !`);
  } catch (e) { alert('Erreur import .mrpack : ' + e.message); console.error(e); }
}

function detectLoader(deps) {
  if (!deps) return 'vanilla';
  if (deps['fabric-loader']) return 'fabric';
  if (deps['forge'])         return 'forge';
  if (deps['neoforge'])      return 'neoforge';
  if (deps['quilt-loader'])  return 'quilt';
  return 'vanilla';
}
function detectLoaderVersion(deps) {
  if (!deps) return '';
  return deps['fabric-loader'] || deps['forge'] || deps['neoforge'] || deps['quilt-loader'] || '';
}
function ensureJSZip() {
  return new Promise((resolve, reject) => {
    if (window.JSZip) return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload  = resolve;
    s.onerror = () => reject(new Error('Impossible de charger JSZip'));
    document.head.appendChild(s);
  });
}

// ─── VERSIONS MC ─────────────────────────────────────
// (FALLBACK_VERSIONS déclaré dans versions.js)
let MC_VERSIONS = [];

async function loadMCVersions() {
  if (MC_VERSIONS.length === 0) MC_VERSIONS = FALLBACK_VERSIONS.slice();
  const sel = document.getElementById('pm-ver');
  if (sel) populateVersionSelect(sel);
  if (!window.electronAPI?.getMCVersions) return;
  try {
    const result = await window.electronAPI.getMCVersions();
    if (result?.success && Array.isArray(result.versions) && result.versions.length > 0) {
      MC_VERSIONS = result.versions;
      const s = document.getElementById('pm-ver');
      if (s) populateVersionSelect(s, s.value);
    }
  } catch (e) { console.warn('[Versions] IPC échoué, fallback conservé:', e.message); }
}

function openVerDropdown() {
  if (MC_VERSIONS.length === 0) MC_VERSIONS = FALLBACK_VERSIONS.slice();
  document.getElementById('pm-ver-search').value = '';
  renderVerDropdown();
  const dd    = document.getElementById('ver-dropdown');
  const input = document.getElementById('pm-ver-search');
  const rect  = input.getBoundingClientRect();
  dd.style.top     = (rect.bottom + 4) + 'px';
  dd.style.left    = rect.left + 'px';
  dd.style.width   = Math.max(rect.width, 260) + 'px';
  dd.style.display = 'block';
}
function closeVerDropdown() {
  const dd = document.getElementById('ver-dropdown');
  if (dd) dd.style.display = 'none';
  const hidden = document.getElementById('pm-ver');
  const search = document.getElementById('pm-ver-search');
  if (hidden && search && hidden.value && search.value === '') search.value = hidden.value;
}
function selectVersion(id) {
  document.getElementById('pm-ver').value        = id;
  document.getElementById('pm-ver-search').value = id;
  document.getElementById('ver-dropdown').style.display = 'none';
}
function filterVerDropdown() { renderVerDropdown(); document.getElementById('ver-dropdown').style.display = 'block'; }
function filterVersions()    { filterVerDropdown(); }
function renderVerDropdown() {
  if (MC_VERSIONS.length === 0) MC_VERSIONS = FALLBACK_VERSIONS.slice();
  const typeFilter = document.getElementById('pm-ver-type')?.value || 'all';
  const q    = (document.getElementById('pm-ver-search')?.value || '').toLowerCase().trim();
  const list = document.getElementById('ver-dropdown-list');
  if (!list) return;
  const filtered = MC_VERSIONS.filter(v => {
    if (typeFilter === 'release' && v.type !== 'release') return false;
    if (q && !v.id.toLowerCase().includes(q)) return false;
    return true;
  });
  if (!filtered.length) { list.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--text2)">Aucun résultat</div>'; return; }
  const curVal = document.getElementById('pm-ver')?.value || '';
  list.innerHTML = filtered.map(v => {
    const isSel  = v.id === curVal;
    const label  = v.type !== 'release' ? `${v.id} <span style="font-size:10px;color:var(--text2)">(${v.type.replace('old_', '')})</span>` : v.id;
    return `<div onclick="selectVersion('${v.id}')" style="
      padding:7px 14px;font-size:13px;cursor:pointer;
      background:${isSel ? 'var(--accent-dim)' : 'transparent'};
      color:${isSel ? 'var(--accent)' : 'var(--text0)'};
      border-left:2px solid ${isSel ? 'var(--accent)' : 'transparent'};
      transition:.1s;font-family:var(--mono);"
      onmouseover="this.style.background='var(--bg3)'"
      onmouseout="this.style.background='${isSel ? 'var(--accent-dim)' : 'transparent'}'">
      ${label}
    </div>`;
  }).join('');
}
function populateVersionSelect(sel, keepValue) {
  if (MC_VERSIONS.length === 0) MC_VERSIONS = FALLBACK_VERSIONS.slice();
  const search = document.getElementById('pm-ver-search');
  const hidden = document.getElementById('pm-ver');
  if (!hidden) return;
  const target = keepValue || (MC_VERSIONS[0]?.id) || '1.21.11';
  hidden.value  = target;
  if (search) search.value = target;
}
