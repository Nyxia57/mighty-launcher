// ═══════════════════════════════════════════════════════
// COMPTES — Microsoft Auth, Multi-compte, Paramètres
// ═══════════════════════════════════════════════════════

// ─── ÉTAT COMPTES ────────────────────────────────────
let ACCOUNTS = JSON.parse(localStorage.getItem('mighty_accounts') || '[]');
let MS = ACCOUNTS.find(a => a.active) || null;

// ─── SAUVEGARDE ──────────────────────────────────────
function saveAccounts() { localStorage.setItem('mighty_accounts', JSON.stringify(ACCOUNTS)); }

// ─── COMPTE ACTIF ────────────────────────────────────
function setActiveAccount(idx) {
  ACCOUNTS.forEach((a, i) => a.active = i === idx);
  MS = ACCOUNTS[idx] || null;
  saveAccounts(); updateUserChip(); renderAccountsDropdown(); renderPlay();
}

function removeAccount(idx, e) {
  if (e) e.stopPropagation();
  ACCOUNTS.splice(idx, 1);
  MS = ACCOUNTS.find(a => a.active) || ACCOUNTS[0] || null;
  if (MS && !MS.active) MS.active = true;
  saveAccounts(); updateUserChip(); renderAccountsDropdown(); renderPlay();
}

function addAccount(acct) {
  const exists = ACCOUNTS.findIndex(a => a.uuid === acct.uuid && a.name === acct.name);
  if (exists > -1) { ACCOUNTS[exists] = { ...ACCOUNTS[exists], ...acct, active: true }; }
  else { ACCOUNTS.forEach(a => a.active = false); acct.active = true; ACCOUNTS.push(acct); }
  MS = ACCOUNTS.find(a => a.active) || ACCOUNTS[0] || null;
  saveAccounts(); updateUserChip(); renderAccountsDropdown(); renderPlay(); renderAccountSection();
}

function logoutMS() {
  const idx = ACCOUNTS.findIndex(a => a.active);
  if (idx > -1) ACCOUNTS.splice(idx, 1);
  MS = ACCOUNTS[0] || null;
  if (MS) MS.active = true;
  saveAccounts(); updateUserChip(); renderAccountsDropdown(); closeOv('ov-mslogin'); renderPlay(); renderAccountSection();
}

// ─── DROPDOWN MULTI-COMPTE ───────────────────────────
function toggleAcctDD(e) {
  if (e) e.stopPropagation();
  const dd = document.getElementById('acct-dd'); if (!dd) return;
  if (dd.classList.contains('open')) { closeAcctDD(); return; }
  renderAccountsDropdown();
  dd.classList.add('open');
  setTimeout(() => document.addEventListener('click', closeAcctDDOutside, { once: true }), 0);
}
function closeAcctDD() { document.getElementById('acct-dd')?.classList.remove('open'); }
function closeAcctDDOutside(e) {
  const dd = document.getElementById('acct-dd');
  if (dd && !dd.contains(e.target)) closeAcctDD();
  else if (dd && dd.classList.contains('open')) document.addEventListener('click', closeAcctDDOutside, { once: true });
}

function renderAccountsDropdown() {
  const list = document.getElementById('acct-list'); if (!list) return;
  if (!ACCOUNTS.length) {
    list.innerHTML = '<div class="empty" style="padding:14px 14px 8px"><p style="font-size:12px">Aucun compte — ajoutez-en un</p></div>';
    return;
  }
  list.innerHTML = ACCOUNTS.map((a, i) => `
    <div class="acct-item${a.active ? ' cur' : ''}" onclick="setActiveAccount(${i})">
      <div class="acct-av">
        ${a.avatar
          ? `<img src="${a.avatar}" onerror="this.style.display='none'">`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`}
      </div>
      <div class="acct-info">
        <div class="acct-nm">${esc(a.name)}</div>
        <div class="acct-tp">${a.premium ? '✓ Premium' : 'Hors-ligne'}</div>
      </div>
      ${a.active ? `<svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5" style="width:14px;height:14px;flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
      <button onclick="removeAccount(${i},event)" class="pic-btn del" style="width:20px;height:20px;flex-shrink:0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('');
}

// ─── CHIP UTILISATEUR (topbar) ───────────────────────
function updateUserChip() {
  const label  = document.getElementById('tb-user-label');
  const name   = document.getElementById('tb-username');
  const status = document.getElementById('tb-user-status');
  const avatar = document.getElementById('tb-avatar');
  if (!label) return;
  const count = ACCOUNTS.length;
  if (MS && MS.name) {
    label.textContent  = MS.premium ? 'Microsoft' : 'Hors-ligne';
    name.textContent   = MS.name + (count > 1 ? ` +${count - 1}` : '');
    status.className   = 'tb-user-status ' + (MS.premium ? 'premium' : 'offline-ms');
    status.textContent = MS.premium ? '✓ Premium' : 'Hors-ligne';
    if (avatar) avatar.innerHTML = MS.avatar
      ? `<img src="${MS.avatar}" onerror="this.style.display='none'" style="width:100%;height:100%;object-fit:cover;border-radius:3px">`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  } else {
    label.textContent  = 'Non connecté';
    name.textContent   = 'Aucun compte';
    status.className   = 'tb-user-status offline-ms';
    status.textContent = 'Cliquer pour ajouter';
    if (avatar) avatar.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  }
}

function onUserChipClick() { toggleAcctDD(null); }

// ─── CONNEXION MICROSOFT ─────────────────────────────
function openMSLogin() {
  document.getElementById('ms-modal-title').textContent = 'Connexion Microsoft';
  document.getElementById('ms-modal-body').innerHTML = `
    <div class="ms-login-box">
      <div class="ms-logo" style="background:#107c10">
        <svg viewBox="0 0 21 21" style="width:26px;height:26px"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
      </div>
      <div class="ms-login-title">Se connecter avec Microsoft</div>
      <div class="ms-login-sub">Connectez votre compte Microsoft pour jouer avec votre licence Minecraft Java Edition officielle.</div>
      <button class="btn-ms" onclick="startMSAuth()">
        <svg viewBox="0 0 21 21" style="width:14px;height:14px;flex-shrink:0"><rect x="1" y="1" width="9" height="9" fill="#fff"/><rect x="11" y="1" width="9" height="9" fill="#fff"/><rect x="1" y="11" width="9" height="9" fill="#fff"/><rect x="11" y="11" width="9" height="9" fill="#fff"/></svg>
        Se connecter avec Microsoft
      </button>
      <div style="font-size:11px;color:var(--text2)">Ou jouer <span style="color:var(--accent);cursor:pointer;font-weight:700" onclick="openOfflineModeModal()">en mode hors-ligne</span></div>
    </div>`;
  openOv('ov-mslogin');
}

async function startMSAuth() {
  const body = document.getElementById('ms-modal-body');
  body.innerHTML = '<div class="ms-loading"><div class="spinner"></div><p>Ouverture de la page Microsoft…</p><p style="font-size:11px;color:var(--text2);margin-top:6px">Connectez-vous dans la fenêtre qui s\'ouvre.</p></div>';
  if (window.electronAPI?.msLogin) {
    const result = await window.electronAPI.msLogin();
    if (result && result.success) {
      addAccount({ name: result.username, uuid: result.uuid, email: '', accessToken: result.accessToken, premium: true, avatar: `https://mc-heads.net/avatar/${result.uuid}/32` });
      closeOv('ov-mslogin'); return;
    }
    const errMsg = (result && result.error) ? result.error : 'Connexion échouée ou annulée.';
    body.innerHTML = `<div class="empty"><p style="color:var(--red);margin-bottom:12px">${errMsg}</p><button class="btn btn-ghost btn-sm" style="margin:0 auto" onclick="openMSLogin()">Réessayer</button></div>`;
    return;
  }
  body.innerHTML = '<div class="empty"><p style="color:var(--text1);text-align:center;padding:12px">La connexion Microsoft nécessite l\'application Electron.<br><span style="font-size:11px;color:var(--text2)">Lance le launcher avec npm start.</span></p></div>';
}

function openOfflineModeModal() {
  closeOv('ov-mslogin');
  const name = prompt('Pseudo Minecraft hors-ligne :', 'Joueur');
  if (!name || !name.trim()) return;
  addAccount({ name: name.trim(), email: '', uuid: 'offline-' + Date.now(), accessToken: '', premium: false, avatar: '' });
}

function openMSLoggedIn() { toggleAcctDD(null); }
function useOfflineMode()  { openOfflineModeModal(); }

// ─── SECTION COMPTE (page Paramètres) ────────────────
function renderAccountSection() {
  const el = document.getElementById('account-section'); if (!el) return;
  if (ACCOUNTS.length) {
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:7px">
        ${ACCOUNTS.map((a, i) => `
          <div class="ms-user-info" style="${a.active ? 'border-color:rgba(74,222,128,.3)' : ''}">
            <div class="ms-avatar-big">
              ${a.avatar
                ? `<img src="${a.avatar}" onerror="this.style.display='none'">`
                : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`}
            </div>
            <div style="flex:1">
              <div class="ms-uname">${esc(a.name)}${a.active ? ' <span style="font-size:10px;color:var(--accent);font-weight:700">(actif)</span>' : ''}</div>
              <div class="ms-ustatus ${a.premium ? 'premium' : 'offline-ms'}">${a.premium ? '✓ Licence officielle' : 'Hors-ligne'}</div>
            </div>
            <div style="display:flex;gap:6px">
              ${!a.active ? `<button class="btn btn-ghost btn-sm" onclick="setActiveAccount(${i})">Activer</button>` : ''}
              <button class="btn btn-danger btn-sm" onclick="removeAccount(${i},event)">Supprimer</button>
            </div>
          </div>`).join('')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-ms" onclick="startMSAuth()" style="flex:1">
          <svg viewBox="0 0 21 21" style="width:13px;height:13px;flex-shrink:0"><rect x="1" y="1" width="9" height="9" fill="#fff"/><rect x="11" y="1" width="9" height="9" fill="#fff"/><rect x="1" y="11" width="9" height="9" fill="#fff"/><rect x="11" y="11" width="9" height="9" fill="#fff"/></svg>
          + Microsoft
        </button>
        <button class="btn btn-ghost" onclick="openOfflineModeModal()" style="flex:1">+ Hors-ligne</button>
      </div>`;
  } else {
    el.innerHTML = `
      <div class="ms-login-box">
        <div class="ms-logo" style="background:#107c10"><svg viewBox="0 0 21 21" style="width:24px;height:24px"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg></div>
        <div class="ms-login-title">Connexion Microsoft</div>
        <div class="ms-login-sub">Connectez votre compte Mojang pour jouer avec votre licence officielle.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
          <button class="btn-ms" onclick="openMSLogin()"><svg viewBox="0 0 21 21" style="width:13px;height:13px;flex-shrink:0"><rect x="1" y="1" width="9" height="9" fill="#fff"/><rect x="11" y="1" width="9" height="9" fill="#fff"/><rect x="1" y="11" width="9" height="9" fill="#fff"/><rect x="11" y="11" width="9" height="9" fill="#fff"/></svg>Connexion Microsoft</button>
          <button class="btn btn-ghost" onclick="openOfflineModeModal()">Hors-ligne</button>
        </div>
      </div>`;
  }
}

// ─── PARAMÈTRES GLOBAUX ──────────────────────────────
function loadG() {
  renderAccountSection();
  document.getElementById('g-rmin').value = G.rmin || 512;
  document.getElementById('g-rmax').value = G.rmax || 2048;
  document.getElementById('g-java').value = G.java || '';
  document.getElementById('sw-close').classList.toggle('on', G.closeOnLaunch !== false);
  document.getElementById('sw-verify').classList.toggle('on', G.verify !== false);
}
function saveG() {
  G = {
    rmin:          parseInt(document.getElementById('g-rmin').value) || 512,
    rmax:          parseInt(document.getElementById('g-rmax').value) || 2048,
    java:          document.getElementById('g-java').value,
    closeOnLaunch: document.getElementById('sw-close').classList.contains('on'),
    verify:        document.getElementById('sw-verify').classList.contains('on'),
  };
  localStorage.setItem('z_g', JSON.stringify(G));
}

// ─── AUTO-UPDATER ────────────────────────────────────
if (window.electronAPI) {
  window.electronAPI.onUpdateAvailable(info => showUpdateBanner(`Mise à jour ${info.version} disponible — téléchargement en cours...`, false));
  window.electronAPI.onUpdateProgress(progress => showUpdateBanner(`Téléchargement de la mise à jour... ${Math.round(progress.percent || 0)}%`, false));
  window.electronAPI.onUpdateDownloaded(info => showUpdateBanner(`Mise à jour ${info.version} prête — redémarrer pour installer`, true));
}

function showUpdateBanner(msg, showInstall) {
  let banner = document.getElementById('update-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.style.cssText = `
      position:fixed;top:var(--topbar);left:0;right:0;z-index:1000;
      background:#1a3a2a;border-bottom:1px solid rgba(74,222,128,.3);
      padding:8px 18px;display:flex;align-items:center;justify-content:space-between;
      font-size:12px;color:var(--accent);font-weight:600;animation:slideDown .3s ease;
    `;
    document.body.appendChild(banner);
  }
  banner.innerHTML = `
    <span style="display:flex;align-items:center;gap:8px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;flex-shrink:0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      ${msg}
    </span>
    ${showInstall ? `<button onclick="window.electronAPI.installUpdate()" style="
      background:var(--accent);color:#051a0a;border:none;padding:5px 14px;
      border-radius:5px;font-weight:800;font-size:11px;cursor:pointer;font-family:var(--font)
    ">Redémarrer & Installer</button>` : ''}
  `;
  banner.style.display = 'flex';
}
