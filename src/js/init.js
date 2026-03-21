// ═══════════════════════════════════════════════════════
// OVERLAYS, CONFIRM & INITIALISATION
// ═══════════════════════════════════════════════════════

// ─── OVERLAYS ────────────────────────────────────────
function openOv(id)          { document.getElementById(id).classList.add('open'); }
function closeOv(id)         { document.getElementById(id).classList.remove('open'); }
function closeOvBg(e, id)    { if (e.target.id === id) closeOv(id); }

// ─── CONFIRM BOX ─────────────────────────────────────
function showCfm(t, m, cb) {
  document.getElementById('cfm-title').textContent = t;
  document.getElementById('cfm-msg').textContent   = m;
  cfmCb = cb;
  document.getElementById('cfm-ok').onclick = () => { closeOv('ov-cfm'); if (cfmCb) cfmCb(); };
  openOv('ov-cfm');
}

// ─── INITIALISATION ──────────────────────────────────
(()=>{
  updateUserChip();
  renderAccountsDropdown();
  loadG();
  renderPlay();
  const initActive = P.find(p => p.active) || P[0];
  applyHeroBg(initActive?.version || '1.21');
})();
