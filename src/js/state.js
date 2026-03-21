// ═══════════════════════════════════════════════════════
// STATE, CONSTANTES & UTILITAIRES
// ═══════════════════════════════════════════════════════

// ─── VERSION NAMES ───────────────────────────────────
const VERSION_NAMES = {
  '1.21.11':'The Garden Awakens','1.21.4':'Pale Garden','1.21.3':'Pale Garden','1.21.2':'Pale Garden','1.21.1':'Tricky Trials','1.21':'Tricky Trials',
  '1.20.6':'Trails & Tales','1.20.5':'Trails & Tales','1.20.4':'Trails & Tales','1.20.3':'Trails & Tales',
  '1.20.2':'Trails & Tales','1.20.1':'Trails & Tales','1.20':'Trails & Tales',
  '1.19.4':'The Wild Update','1.19.3':'The Wild Update','1.19.2':'The Wild Update','1.19.1':'The Wild Update','1.19':'The Wild Update',
  '1.18.2':'Caves & Cliffs Pt.2','1.18.1':'Caves & Cliffs Pt.2','1.18':'Caves & Cliffs Pt.2',
  '1.17.1':'Caves & Cliffs Pt.1','1.17':'Caves & Cliffs Pt.1',
  '1.16.5':'Nether Update','1.16.4':'Nether Update','1.16.3':'Nether Update','1.16.2':'Nether Update','1.16.1':'Nether Update','1.16':'Nether Update',
  '1.15.2':'Buzzy Bees','1.15.1':'Buzzy Bees','1.15':'Buzzy Bees',
  '1.14.4':'Village & Pillage','1.14.3':'Village & Pillage','1.14.2':'Village & Pillage','1.14.1':'Village & Pillage','1.14':'Village & Pillage',
  '1.13.2':'Update Aquatic','1.13.1':'Update Aquatic','1.13':'Update Aquatic',
  '1.12.2':'World of Color','1.12.1':'World of Color','1.12':'World of Color',
  '1.11.2':'Exploration Update','1.11':'Exploration Update','1.10.2':'Frostburn Update','1.10':'Frostburn Update',
  '1.9.4':'Combat Update','1.9.2':'Combat Update','1.9':'Combat Update',
  '1.8.9':'Bountiful Update','1.8.8':'Bountiful Update','1.8.4':'Bountiful Update','1.8':'Bountiful Update',
  '1.7.10':'Changed the World','1.7.9':'Changed the World','1.7.2':'Changed the World',
  '1.6.4':'Horse Update','1.6.2':'Horse Update','1.6.1':'Horse Update',
  '1.5.2':'Redstone Update','1.5.1':'Redstone Update',
  '1.4.7':'Pretty Scary Update','1.4.5':'Pretty Scary Update',
  '1.3.2':'Easy Update','1.2.5':'Moar Stacked','1.1':'Adventure','1.0':'Release',
};

// ─── STATE ───────────────────────────────────────────
let P = JSON.parse(localStorage.getItem('z_p') || '[]');
let G = JSON.parse(localStorage.getItem('z_g') || '{"user":"Joueur","rmin":512,"rmax":2048,"java":"","closeOnLaunch":true,"verify":true}');
let editId = null, tmpMods = [], tmpRP = [], tmpShaders = [], tmpBanner = 'linear-gradient(135deg,#0d2a3d,#1a3a1d)';
let itemCtx = null, itemType = null;
let cfmCb = null;
let searchTimer = null;
let modrinthOffset = 0, modrinthFacet = 'mod', modrinthTotal = 0;
let currentMod = null;
let pendingMod = null, pickedPid = null;
let pendingProfileEdit = null;

// ─── UTILITAIRES ─────────────────────────────────────
function saveP() { localStorage.setItem('z_p', JSON.stringify(P)); }
function cap(s)  { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function esc(s)  { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtNum(n) { if(n>=1e6) return (n/1e6).toFixed(1)+'M'; if(n>=1e3) return (n/1e3).toFixed(1)+'K'; return n; }
function flash(id) {
  const e = document.getElementById(id);
  e.style.borderColor = 'var(--red)';
  e.focus();
  setTimeout(() => e.style.borderColor = '', 1500);
}
function emptyHTML(m) {
  return `<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><p>${m}</p></div>`;
}
