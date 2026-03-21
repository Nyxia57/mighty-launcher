// ═══════════════════════════════════════════════════════
// NAVIGATION, PLAY PAGE, LAUNCH & HERO BACKGROUND
// ═══════════════════════════════════════════════════════

// ─── PARTICLES ───────────────────────────────────────
(()=>{
  const c = document.getElementById('particles');
  if (!c) return;
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.setProperty('--d', (6 + Math.random() * 8) + 's');
    p.style.setProperty('--delay', (Math.random() * 8) + 's');
    p.style.setProperty('--dx', (Math.random() * 60 - 30) + 'px');
    c.appendChild(p);
  }
})();

// ─── NAVIGATION ──────────────────────────────────────
function navPage(id, el) {
  document.querySelectorAll('.tb-nav-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  else {
    const nb = document.querySelector(`[data-page="${id}"]`);
    if (nb) nb.classList.add('active');
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id + '-page').classList.add('active');
  if (id === 'play')     renderPlay();
  if (id === 'mods')     { if (!document.querySelector('#mods-grid .mod-card')) searchModrinth(); else refreshAllModGridButtons(); }
  if (id === 'profiles') renderProfiles();
  if (id === 'settings') loadG();
  // Masquer le bandeau si on quitte la page mods sans passer par returnToProfileEdit
  if (id !== 'mods') {
    const banner = document.getElementById('profile-edit-banner');
    if (banner) banner.style.display = 'none';
  }
}

// ─── PLAY PAGE ───────────────────────────────────────
function renderPlay() {
  const active = P.find(p => p.active) || P[0];
  const heroSub     = document.getElementById('hero-sub');
  const launchLabel = document.getElementById('launch-loader-label');
  const profileLabel = document.getElementById('launch-profile-label');
  updateUserChip();

  if (active) {
    heroSub.textContent = `${active.name} — Minecraft ${active.version} · ${cap(active.loader)}`;
    launchLabel.textContent = cap(active.loader);
    profileLabel.textContent = active.name;
    applyHeroBg(active.version);
    const vbadge = document.getElementById('hero-ver-badge');
    if (vbadge) {
      vbadge.textContent = `Minecraft ${active.version}${VERSION_NAMES[active.version] ? ' — ' + VERSION_NAMES[active.version] : ''}`;
      vbadge.style.display = 'block';
    }
  } else {
    heroSub.textContent = 'Aucun profil sélectionné — créez un profil pour commencer';
    launchLabel.textContent = 'FABRIC';
    profileLabel.textContent = 'Changer de profil';
    const vbadge = document.getElementById('hero-ver-badge');
    if (vbadge) vbadge.style.display = 'none';
    applyHeroBg('1.21');
  }
  renderFriends();
}

// ─── AMIS ────────────────────────────────────────────
function renderFriends() {
  const el = document.getElementById('friends-list'); if (!el) return;
  const friends = JSON.parse(localStorage.getItem('mighty_friends') || '[]');
  if (!friends.length) {
    el.innerHTML = `<div class="empty" style="padding:28px 20px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      <p>Aucun ami — cliquez sur "+ Ajouter"</p>
    </div>`;
    return;
  }
  el.innerHTML = friends.map((f, i) => `
    <div class="server-row">
      <div class="srv-icon" style="overflow:hidden;border-radius:6px">
        <img src="https://mc-heads.net/avatar/${esc(f.uuid || f.name)}/22" onerror="this.style.display='none'" style="width:22px;height:22px;display:block">
      </div>
      <span class="srv-name">${esc(f.name)}</span>
      <div style="display:flex;align-items:center;gap:6px">
        ${f.note ? `<span style="font-size:10px;color:var(--text2)">${esc(f.note)}</span>` : ''}
        <button class="pic-btn del" onclick="removeFriend(${i})" style="width:22px;height:22px;flex-shrink:0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>`).join('');
}

function openAddFriend() {
  const name = prompt('Pseudo Minecraft de l\'ami :');
  if (!name || !name.trim()) return;
  const note = prompt('Note / description (optionnel) :', '') || '';
  const friends = JSON.parse(localStorage.getItem('mighty_friends') || '[]');
  friends.push({ name: name.trim(), note: note.trim(), uuid: name.trim() });
  localStorage.setItem('mighty_friends', JSON.stringify(friends));
  renderFriends();
}
function removeFriend(i) {
  const friends = JSON.parse(localStorage.getItem('mighty_friends') || '[]');
  friends.splice(i, 1);
  localStorage.setItem('mighty_friends', JSON.stringify(friends));
  renderFriends();
}

// ─── LAUNCH ──────────────────────────────────────────
function doLaunch() {
  const active = P.find(p => p.active) || P[0];
  if (!active) { navPage('profiles', null); return; }
  const dot  = document.getElementById('sdot');
  const txt  = document.getElementById('stext');
  const bar  = document.getElementById('sprogbar');
  const prog = document.getElementById('sprog');

  dot.className = 'sdot load';
  prog.style.display = 'block';
  bar.style.width = '5%';
  txt.textContent = 'Préparation du lancement…';

  if (!window.electronAPI?.launch) {
    // Mode navigateur — simulation
    let p = 5;
    const sim = setInterval(() => {
      p = Math.min(p + Math.random() * 8, 95);
      bar.style.width = p + '%';
      if (p > 90) { clearInterval(sim); dot.className = 'sdot run'; txt.textContent = 'Minecraft lancé (simulation)'; prog.style.display = 'none'; }
    }, 300);
    return;
  }

  window.electronAPI.onProgress(data => {
    txt.textContent = data.msg || '…';
    if (data.pct != null) { bar.style.width = data.pct + '%'; }
  });
  window.electronAPI.onGameExit && window.electronAPI.onGameExit(() => {
    dot.className = 'sdot';
    prog.style.display = 'none';
    bar.style.width = '0%';
    txt.textContent = 'Prêt';
  });

  window.electronAPI.launch(active, {
    username:    (MS && MS.name)        || 'Joueur',
    accessToken: (MS && MS.accessToken) || '0',
    uuid:        (MS && MS.uuid)        || '00000000-0000-0000-0000-000000000000',
    premium:     !!(MS && MS.premium),
    ramMin:  active.ramMin  || G.rmin || 512,
    ramMax:  active.ramMax  || G.rmax || 2048,
    jvmArgs: active.jvmArgs || '',
    javaPath: G.java || ''
  }).then(res => {
    if (res && res.success) {
      dot.className = 'sdot run';
      bar.style.width = '100%';
      txt.textContent = `Minecraft ${active.version} lancé !`;
      setTimeout(() => { prog.style.display = 'none'; }, 1500);
    } else {
      dot.className = 'sdot err';
      prog.style.display = 'none';
      const firstLine = ((res && res.error) || 'Erreur inconnue').split('\n')[0].substring(0, 120);
      txt.innerHTML = `Erreur : ${firstLine} <span style="color:var(--accent);cursor:pointer;text-decoration:underline" onclick="window.electronAPI?.openLog&&window.electronAPI.openLog()">Voir log</span>`;
    }
  }).catch(() => {
    dot.className = 'sdot err';
    prog.style.display = 'none';
    txt.textContent = 'Erreur de communication avec le launcher';
  });
}

function getUsername()    { return (MS && MS.name)        || 'Joueur'; }
function getAccessToken() { return (MS && MS.accessToken) || '0'; }

// ─── HERO BACKGROUND ─────────────────────────────────
const VERSION_IMG = {}; // Pas d'images externes — gradients uniquement
const VERSION_GRAD = {
  '1.21':'linear-gradient(160deg,#0a2e10 0%,#1a5228 40%,#0d2e14 100%)',
  '1.20':'linear-gradient(160deg,#2a1a05 0%,#52340a 45%,#2a1a05 100%)',
  '1.19':'linear-gradient(160deg,#051828 0%,#0e3a52 45%,#071e30 100%)',
  '1.18':'linear-gradient(160deg,#081828 0%,#103660 45%,#081a2e 100%)',
  '1.17':'linear-gradient(160deg,#0a1440 0%,#1a2e70 45%,#0c1848 100%)',
  '1.16':'linear-gradient(160deg,#2a0a00 0%,#6a1a00 45%,#2a0a00 100%)',
  '1.15':'linear-gradient(160deg,#142808 0%,#2e5210 45%,#142808 100%)',
  '1.14':'linear-gradient(160deg,#281808 0%,#503014 45%,#281808 100%)',
  '1.13':'linear-gradient(160deg,#04182a 0%,#0a3450 45%,#061e30 100%)',
  '1.12':'linear-gradient(160deg,#160840 0%,#341888 45%,#160840 100%)',
  '1.11':'linear-gradient(160deg,#1a1a10 0%,#3a3820 45%,#1a1a10 100%)',
  '1.10':'linear-gradient(160deg,#0c1420 0%,#20364a 45%,#0e1828 100%)',
  '1.9' :'linear-gradient(160deg,#1a0c0c 0%,#381818 45%,#1a0c0c 100%)',
  '1.8' :'linear-gradient(160deg,#0e0e10 0%,#242428 45%,#0e0e10 100%)',
  '1.7' :'linear-gradient(160deg,#0a1608 0%,#1c3016 45%,#0a1608 100%)',
  '1.6' :'linear-gradient(160deg,#201408 0%,#402c10 45%,#201408 100%)',
  '1.5' :'linear-gradient(160deg,#160e0e 0%,#2e1c1c 45%,#160e0e 100%)',
  '1.4' :'linear-gradient(160deg,#080808 0%,#1e1e30 45%,#080808 100%)',
  '1.3' :'linear-gradient(160deg,#101010 0%,#242424 45%,#101010 100%)',
  '1.2' :'linear-gradient(160deg,#0c0c0c 0%,#202020 45%,#0c0c0c 100%)',
  '1.1' :'linear-gradient(160deg,#0a0a0a 0%,#1c1c1c 45%,#0a0a0a 100%)',
  '1.0' :'linear-gradient(160deg,#080808 0%,#181818 45%,#080808 100%)',
};
function getVerGrad(ver) {
  for (const k of Object.keys(VERSION_GRAD)) { if (ver.startsWith(k)) return VERSION_GRAD[k]; }
  return 'linear-gradient(160deg,#070e12 0%,#0e1a26 50%,#070e12 100%)';
}
function applyHeroBg(ver) {
  const el = document.getElementById('hero-img'); if (!el) return;
  el.style.transition = 'opacity .35s';
  el.style.opacity = '0';
  setTimeout(() => {
    const grad = getVerGrad(ver);
    const url  = VERSION_IMG[ver];
    if (url) {
      const img = new Image();
      img.onload  = () => { el.style.cssText = 'position:absolute;inset:0;background-size:cover;background-position:center;background-image:url(' + url + ');transition:opacity .35s;opacity:1'; };
      img.onerror = () => { el.style.cssText = 'position:absolute;inset:0;background:' + grad + ';transition:opacity .35s;opacity:1'; };
      img.src = url;
    } else {
      el.style.cssText = 'position:absolute;inset:0;background:' + grad + ';transition:opacity .35s;opacity:1';
    }
  }, 200);
}

// ─── PROFILE DROPDOWN (play page) ────────────────────
function toggleProfileDropdown(e) {
  e.stopPropagation();
  const dd = document.getElementById('profile-dropdown'); if (!dd) return;
  const isOpen = dd.style.display !== 'none';
  if (isOpen) { closeProfileDropdown(); return; }
  renderProfileDropdown();
  dd.style.display = 'block';
  setTimeout(() => document.addEventListener('click', closeProfileDropdownOutside, { once: true }), 0);
}
function closeProfileDropdown() {
  const dd = document.getElementById('profile-dropdown');
  if (dd) dd.style.display = 'none';
}
function closeProfileDropdownOutside(e) {
  const dd = document.getElementById('profile-dropdown');
  if (dd && !dd.contains(e.target)) closeProfileDropdown();
  else if (dd && dd.style.display !== 'none') document.addEventListener('click', closeProfileDropdownOutside, { once: true });
}
function renderProfileDropdown() {
  const list = document.getElementById('profile-dropdown-list'); if (!list) return;
  if (!P.length) { list.innerHTML = '<div class="empty" style="padding:16px"><p>Aucun profil créé</p></div>'; return; }
  list.innerHTML = P.map(p => {
    const isActive = p.active;
    return `<div onclick="selectProfileFromDropdown('${p.id}')" style="
      display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;
      background:${isActive ? 'var(--accent-dim)' : 'transparent'};
      border-left:3px solid ${isActive ? 'var(--accent)' : 'transparent'};transition:.12s;">
      <div style="width:32px;height:32px;border-radius:7px;flex-shrink:0;overflow:hidden;
        background:${p.banner || 'var(--bg3)'};background-size:cover;border:1px solid var(--border2)"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${isActive ? 'var(--accent)' : 'var(--text0)'}">${esc(p.name)}</div>
        <div style="font-size:10px;color:var(--text2);font-family:var(--mono)">MC ${p.version} · ${cap(p.loader)}</div>
      </div>
      ${isActive ? '<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5" style="width:14px;height:14px;flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
    </div>`;
  }).join('');
}
function selectProfileFromDropdown(id) {
  P.forEach(p => p.active = p.id === id);
  saveP();
  closeProfileDropdown();
  renderPlay();
  renderProfiles();
}
