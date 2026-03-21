// ═══════════════════════════════════════════════════════
// MODRINTH — Recherche, Grille, Détail, Picker
// ═══════════════════════════════════════════════════════

const MODRINTH = 'https://api.modrinth.com/v2';

// ─── RECHERCHE ───────────────────────────────────────
async function searchModrinth(reset = true) {
  if (reset) modrinthOffset = 0;
  const q    = document.getElementById('mod-search').value.trim();
  const ver  = document.getElementById('mod-version-filter').value;
  const sort = document.getElementById('mod-sort').value;

  const params = new URLSearchParams({
    query:  q || '',
    facets: JSON.stringify([[`project_type:${modrinthFacet}`], ...(ver ? [[`versions:${ver}`]] : [])]),
    index:  sort || 'relevance',
    offset: modrinthOffset,
    limit:  20,
  });

  if (reset) document.getElementById('mods-grid').innerHTML = '<div class="loading-grid"><div class="spinner"></div></div>';

  try {
    const res  = await fetch(`${MODRINTH}/search?${params}`);
    const data = await res.json();
    modrinthTotal = data.total_hits || 0;
    if (reset) renderModGrid(data.hits || []);
    else       appendModGrid(data.hits || []);
  } catch (e) {
    document.getElementById('mods-grid').innerHTML = `<div class="empty" style="grid-column:1/-1">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <p>Impossible de contacter Modrinth.<br>Vérifiez votre connexion Internet.</p>
    </div>`;
  }
}

function renderModGrid(hits) {
  const installedIds = getInstalledModIds();
  const html = hits.map(h => modCardHTML(h, installedIds)).join('');
  const hasMore = modrinthOffset + 20 < modrinthTotal;
  document.getElementById('mods-grid').innerHTML = html + (hasMore
    ? `<button class="load-more-btn" onclick="loadMore()">Charger plus de résultats (${modrinthTotal} au total)</button>`
    : '');
}

function appendModGrid(hits) {
  const installedIds  = getInstalledModIds();
  const grid          = document.getElementById('mods-grid');
  const loadMoreBtn   = grid.querySelector('.load-more-btn');
  const html          = hits.map(h => modCardHTML(h, installedIds)).join('');
  if (loadMoreBtn) loadMoreBtn.insertAdjacentHTML('beforebegin', html);
  else             grid.insertAdjacentHTML('beforeend', html);
  const hasMore = modrinthOffset + 20 < modrinthTotal;
  if (loadMoreBtn) {
    if (!hasMore) loadMoreBtn.remove();
    else loadMoreBtn.textContent = `Charger plus de résultats (${modrinthTotal} au total)`;
  }
}

function modCardHTML(h, installedIds) {
  const installed = installedIds.includes(h.project_id || h.slug);
  const icon = h.icon_url
    ? `<img src="${h.icon_url}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`;
  const cats = (h.categories || []).slice(0, 2).map(c => `<span class="mod-cat">${c}</span>`).join('');
  return `
  <div class="mod-card${installed ? ' installed' : ''}" onclick="openModDetail('${h.project_id || h.slug}')">
    <div class="mod-icon">${icon}</div>
    <div class="mod-info">
      <div class="mod-name">${esc(h.title || h.slug)}</div>
      <div class="mod-author">par ${esc(h.author || '?')}</div>
      <div class="mod-desc">${esc(h.description || '')}</div>
      <div class="mod-footer">
        <span class="mod-dl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>${fmtNum(h.downloads || 0)}</span>
        ${cats}
      </div>
    </div>
    <div class="mod-actions">
      <button class="mod-add-btn${installed ? ' added' : ''}"
        data-mid="${h.project_id || h.slug}"
        data-mname="${esc(h.title || h.slug)}"
        data-mauthor="${esc(h.author || '')}"
        data-mdesc="${esc((h.description || '').substring(0, 120))}"
        data-micon="${h.icon_url || ''}"
        data-mfacet="${modrinthFacet}"
        title="${installed ? 'Déjà installé' : 'Ajouter à un profil'}">
        ${installed
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`
        }
      </button>
    </div>
  </div>`;
}

// ─── DÉTAIL MOD ──────────────────────────────────────
async function openModDetail(id) {
  document.getElementById('mod-detail-body').innerHTML = '<div class="loading-grid"><div class="spinner"></div></div>';
  openOv('ov-mod');
  try {
    const res  = await fetch(`${MODRINTH}/project/${id}`);
    currentMod = await res.json();
    document.getElementById('mod-detail-title').textContent = currentMod.title || id;
    document.getElementById('mod-detail-body').innerHTML = `
      <div class="mod-detail-banner">
        ${currentMod.icon_url
          ? `<img src="${currentMod.icon_url}" alt="" style="max-width:200px;max-height:140px;object-fit:contain;">`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="width:50px;height:50px;color:var(--border2)"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`}
      </div>
      <div class="mod-detail-hd">
        <div class="mod-detail-icon">
          ${currentMod.icon_url ? `<img src="${currentMod.icon_url}" alt="">` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`}
        </div>
        <div>
          <div class="mod-detail-title">${esc(currentMod.title)}</div>
          <div class="mod-detail-author">par ${esc(currentMod.team || '?')} · <a href="https://modrinth.com/mod/${currentMod.slug}" target="_blank" style="color:var(--accent);text-decoration:none">Modrinth</a></div>
        </div>
      </div>
      <div class="mod-stats">
        <div class="mod-stat"><div class="mod-stat-val">${fmtNum(currentMod.downloads || 0)}</div><div class="mod-stat-lbl">Téléchargements</div></div>
        <div class="mod-stat"><div class="mod-stat-val">${fmtNum(currentMod.followers || 0)}</div><div class="mod-stat-lbl">Abonnés</div></div>
        <div class="mod-stat"><div class="mod-stat-val">${(currentMod.game_versions || []).slice(-1)[0] || '?'}</div><div class="mod-stat-lbl">Dernière version</div></div>
      </div>
      <div class="mod-desc-full">${esc(currentMod.description || '')}</div>
      ${(currentMod.categories || []).length ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${(currentMod.categories || []).map(c => `<span class="ptag">${c}</span>`).join('')}</div>` : ''}
    `;
    document.getElementById('mod-detail-add-btn').onclick = () => addModToProfile(currentMod);
  } catch (e) {
    document.getElementById('mod-detail-body').innerHTML = '<div class="empty"><p>Impossible de charger les détails.</p></div>';
  }
}

function addModToProfile(mod) {
  closeOv('ov-mod');
  openProfilePickForMod({
    id:     mod.project_id || mod.id,
    name:   mod.title,
    author: mod.team || '',
    desc:   mod.description || '',
    icon:   mod.icon_url || '',
    facet:  modrinthFacet,
  }, null);
}

function quickAddMod(id, title, author, desc, icon) {
  openProfilePickForMod({ id, name: title, author, desc, icon, facet: modrinthFacet }, null);
}

// ─── UTILITAIRES GRILLE ──────────────────────────────
function getInstalledModIds() {
  return P.flatMap(p => (p.mods || []).filter(m => m.modrinthId).map(m => m.modrinthId));
}

function loadMore() {
  modrinthOffset += 20;
  searchModrinth(false);
}

function setFacet(f, el) {
  modrinthFacet = f;
  document.querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  searchModrinth();
}

function debounceSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => searchModrinth(), 400);
}

function refreshAllModGridButtons() {
  const installedIds = new Set(getInstalledModIds());
  document.querySelectorAll('.mod-add-btn[data-mid]').forEach(btn => {
    const mid = btn.dataset.mid;
    const installed = installedIds.has(mid);
    if (installed && !btn.classList.contains('added')) {
      btn.classList.add('added');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
      btn.title = 'Déjà installé';
    } else if (!installed && btn.classList.contains('added')) {
      btn.classList.remove('added');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
      btn.title = 'Ajouter à un profil';
    }
  });
}

function refreshModGridButton(modrinthId, isInstalled) {
  document.querySelectorAll(`.mod-add-btn[data-mid="${modrinthId}"]`).forEach(btn => {
    if (isInstalled) {
      btn.classList.add('added');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
      btn.title = 'Déjà installé';
    } else {
      const stillInstalled = getInstalledModIds().includes(modrinthId);
      if (!stillInstalled) {
        btn.classList.remove('added');
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
        btn.title = 'Ajouter à un profil';
      }
    }
  });
}

// ─── PROFILE PICKER POUR MOD ─────────────────────────
function openProfilePickForMod(mod, e) {
  if (e) e.stopPropagation();
  pendingMod = mod; pickedPid = null;
  document.getElementById('pick-mod-name').textContent = mod.name;
  const grid  = document.getElementById('ppc-grid');
  const empty = document.getElementById('ppc-empty');
  if (!P || P.length === 0) {
    grid.innerHTML = ''; if (empty) empty.style.display = 'flex';
  } else {
    if (empty) empty.style.display = 'none';
    grid.innerHTML = P.map(p => {
      const already = (p.mods || []).some(m => m.modrinthId === mod.id);
      return `<div class="ppc${already ? ' sel' : ''}" id="ppc-${p.id}" onclick="selectPPC('${p.id}')">
        <div class="ppc-dot" id="ppcdot-${p.id}" style="background:${already ? 'var(--accent)' : 'var(--border2)'}"></div>
        <div style="min-width:0">
          <div class="ppc-name">${esc(p.name)}</div>
          <div class="ppc-meta">MC ${p.version} · ${cap(p.loader)}</div>
          ${already ? '<div class="ppc-already">Déjà installé</div>' : ''}
        </div>
      </div>`;
    }).join('');
    const active = P.find(p => p.active) || P[0];
    if (active) selectPPC(active.id);
  }
  openOv('ov-pick-profile');
}

function selectPPC(id) {
  pickedPid = id;
  document.querySelectorAll('.ppc').forEach(c => {
    const mine = c.id === 'ppc-' + id;
    c.classList.toggle('sel', mine);
    const dot = document.getElementById('ppcdot-' + c.id.replace('ppc-', ''));
    if (dot) dot.style.background = mine ? 'var(--accent)' : 'var(--border2)';
  });
}

function confirmPickProfile() {
  if (!pendingMod || !pickedPid) return;
  const p = P.find(x => x.id === pickedPid); if (!p) return;
  const facet = pendingMod.facet || modrinthFacet || 'mod';
  let targetArr;
  if (facet === 'resourcepack') { p.rp = p.rp || []; targetArr = p.rp; }
  else if (facet === 'shader')  { p.shaders = p.shaders || []; targetArr = p.shaders; }
  else                          { p.mods = p.mods || []; targetArr = p.mods; }
  if (!targetArr.find(m => m.modrinthId === pendingMod.id)) {
    targetArr.push({ name: pendingMod.name, author: pendingMod.author || '', desc: pendingMod.desc || '', icon: pendingMod.icon || '', modrinthId: pendingMod.id, enabled: true });
    saveP();
    document.querySelectorAll(`.mod-add-btn[data-mid="${pendingMod.id}"]`).forEach(btn => {
      btn.classList.add('added');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
    });
  }
  closeOv('ov-pick-profile');
  pendingMod = null; pickedPid = null;
}

// ─── EVENT DELEGATION — boutons add dans la grille ───
document.addEventListener('click', function(e) {
  const btn = e.target.closest('.mod-add-btn');
  if (!btn || btn.classList.contains('added')) return;
  e.stopPropagation();
  const mid     = btn.dataset.mid;
  const mname   = btn.dataset.mname;
  const mauthor = btn.dataset.mauthor || '';
  const mdesc   = btn.dataset.mdesc   || '';
  const micon   = btn.dataset.micon   || '';
  const mfacet  = btn.dataset.mfacet  || modrinthFacet || 'mod';
  if (mid && mname) openProfilePickForMod({ id: mid, name: mname, author: mauthor, desc: mdesc, icon: micon, facet: mfacet }, null);
});
