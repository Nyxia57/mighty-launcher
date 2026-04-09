/* ============================================================
   accounts.js — Gestion multi-comptes Microsoft/Minecraft
   Mighty Client v2.0.0

   Flux :
   - Au démarrage : msSilentLogin() pour refresher le compte actif
   - handleLogin() → ouvre le modal si déjà connecté, sinon flux OAuth
   - openAccountsModal() → affiche la liste, switcher, ajouter, supprimer
   ============================================================ */
'use strict';

// ── État global ───────────────────────────────────────────────
window._activeMcToken  = null;   // token MC du compte actif (en mémoire)
window._activeProfile  = null;   // { uuid, name } du compte actif

// ── Initialisation au démarrage ──────────────────────────────
async function initAccounts() {
    if (!window.electronAPI) {
        // Mode dev/browser : simuler un état déconnecté
        _updateUserZone(null);
        return;
    }

    // Écouter la progression de l'auth (pour afficher les étapes dans le futur)
    window.electronAPI.onAuthProgress((data) => {
        if (data.step === 'done') return;
        // Optionnel : afficher dans la console pour debug
        console.log('[Auth]', data.step, data.msg);
    });

    // Tenter un refresh silencieux du compte actif
    try {
        const result = await window.electronAPI.msSilentLogin();
        if (result.success) {
            window._activeMcToken = result.mcToken;
            window._activeProfile = result.profile;
            _updateUserZone(result.profile);
        } else {
            // Vérifier quand même s'il y a des comptes en config (sans refresh)
            const list = await window.electronAPI.accountsList();
            if (list.accounts.length > 0) {
                const active = list.accounts.find(a => a.isActive) || list.accounts[0];
                window._activeProfile = { uuid: active.uuid, name: active.name };
                // Token expiré mais on affiche quand même le nom
                _updateUserZone(window._activeProfile, true);
            } else {
                _updateUserZone(null);
            }
        }
    } catch (e) {
        console.warn('[Accounts] initAccounts error:', e);
        _updateUserZone(null);
    }
}

function _updateUserZone(profile, tokenExpired = false) {
    const zone = document.getElementById('userZone');
    if (!zone) return;

    if (!profile) {
        zone.innerHTML = `<button class="btn btn-login" id="loginBtn" onclick="handleLogin()">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="margin-right:5px;">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
            Connexion</button>`;
        return;
    }

    const uuid = profile.uuid || 'steve'; // Sécurité si l'UUID est manquant
    const name = _esc(profile.name);
    
    // DEBUG : Ouvre la console (Ctrl+Maj+I) pour voir ce qui s'affiche ici
    console.log("[Accounts] Affichage tête pour UUID:", uuid);

    // Utilisation de Minotar comme alternative si Crafatar a du mal
    const headUrl = `https://minotar.net/helm/${uuid}/24.png`;

    zone.innerHTML = `
        <button id="accountBtn" onclick="openAccountsModal()"
            style="display:flex;align-items:center;gap:7px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:4px 10px 4px 5px;cursor:pointer;transition:background 0.15s;font-family:'Inter',sans-serif;color:var(--text-main);">
            <img src="${headUrl}" width="24" height="24" 
                 style="border-radius:3px;image-rendering:pixelated;background:#1a1a2e;display:block;" 
                 onerror="this.src='https://minotar.net/helm/char/24.png'">
            <span style="font-size:12px;font-weight:600;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span>
            ${tokenExpired ? `<span title="Session expirée" style="color:#f59e0b;font-size:9px;margin-left:4px;">⚠</span>` : ''}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="opacity:0.5;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg>
        </button>`;
}

// ── handleLogin : point d'entrée depuis le bouton Login ──────
async function handleLogin() {
    if (!window.electronAPI) { showToast('Electron requis pour la connexion.', 'error'); return; }

    // S'il y a déjà des comptes, ouvrir le modal de gestion
    try {
        const list = await window.electronAPI.accountsList();
        if (list.accounts.length > 0) {
            openAccountsModal();
            return;
        }
    } catch {}

    // Sinon, lancer directement le flux OAuth
    await _startMsLoginFlow();
}

// ── Flux OAuth Microsoft complet ─────────────────────────────
async function _startMsLoginFlow() {
    const modal = document.getElementById('accountsModal');
    _setAuthStatus('loading', 'Connexion en cours...');

    try {
        const result = await window.electronAPI.msLogin();

        if (!result.success) {
            if (result.error === 'auth_cancelled') {
                _setAuthStatus('idle');
                return;
            }
            _setAuthStatus('error', result.error || 'Erreur inconnue');
            showToast('Connexion échouée : ' + (result.error || 'erreur inconnue'), 'error');
            return;
        }

        window._activeMcToken = result.mcToken;
        window._activeProfile = result.profile;
        _updateUserZone(result.profile);
        _setAuthStatus('idle');
        showToast(`Connecté en tant que ${result.profile.name} !`, 'success');

        // Rafraîchir la liste dans le modal si ouvert
        if (modal && modal.classList.contains('open')) {
            await _renderAccountsList();
        }

    } catch (e) {
        _setAuthStatus('error', e.message);
        showToast('Erreur de connexion : ' + e.message, 'error');
    }
}

// ── Ouvrir le modal de gestion des comptes ───────────────────
async function openAccountsModal() {
    let modal = document.getElementById('accountsModal');
    if (!modal) {
        modal = _createAccountsModal();
        document.body.appendChild(modal);
    }
    modal.classList.add('open');
    await _renderAccountsList();
}

function closeAccountsModal() {
    const modal = document.getElementById('accountsModal');
    if (modal) modal.classList.remove('open');
}

// ── Créer la structure HTML du modal ─────────────────────────
function _createAccountsModal() {
    const modal = document.createElement('div');
    modal.id = 'accountsModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-box" style="width:420px;max-height:560px;display:flex;flex-direction:column;">
            <div class="modal-head">
                <div class="modal-title">Comptes Minecraft</div>
                <button class="modal-close" onclick="closeAccountsModal()">×</button>
            </div>
            <div id="accountsAuthStatus" style="display:none;padding:10px 18px;font-size:12px;"></div>
            <div id="accountsList" style="flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:8px;min-height:80px;"></div>
            <div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px;">
                <button onclick="closeAccountsModal();showPage('skincape')"
                    class="sc-nav-btn"
                    style="width:100%;justify-content:center;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                    Skins &amp; Capes
                </button>
                <button id="addAccountBtn" onclick="_startMsLoginFlow()"
                    style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;background:var(--accent);border:none;color:#fff;padding:10px;border-radius:8px;font-family:'Inter',sans-serif;font-size:13px;font-weight:700;cursor:pointer;transition:background 0.15s;"
                    onmouseover="this.style.background='#9B7DD4'" onmouseout="this.style.background='var(--accent)'">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Ajouter un compte Microsoft
                </button>
            </div>
        </div>`;

    // Fermer en cliquant sur le fond
    modal.addEventListener('click', (e) => { if (e.target === modal) closeAccountsModal(); });
    return modal;
}

// ── Afficher/rafraîchir la liste des comptes ─────────────────
async function _renderAccountsList() {
    const listEl = document.getElementById('accountsList');
    if (!listEl) return;

    if (!window.electronAPI) {
        listEl.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px;">Electron requis</div>`;
        return;
    }

    listEl.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px;">Chargement...</div>`;

    try {
        const { accounts, activeUUID } = await window.electronAPI.accountsList();

        if (accounts.length === 0) {
            listEl.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:24px 0;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;opacity:0.4;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Aucun compte connecté</div>`;
            return;
        }

        listEl.innerHTML = '';
        for (const acc of accounts) {
            const card = _buildAccountCard(acc, activeUUID);
            listEl.appendChild(card);
        }

    } catch (e) {
        listEl.innerHTML = `<div style="color:#f87171;font-size:12px;padding:12px;">Erreur : ${_esc(e.message)}</div>`;
    }
}

// ── Construire une carte de compte ───────────────────────────
function _buildAccountCard(acc, activeUUID) {
    const isActive = acc.uuid === activeUUID;
    // Utilisation de mc-heads.net (plus stable pour Electron)
    const heads    = `https://mc-heads.net/avatar/${acc.uuid}/36`; 
    const added    = acc.addedAt ? new Date(acc.addedAt).toLocaleDateString('fr-FR') : '';

    const card = document.createElement('div');
    card.id = `acc-card-${acc.uuid}`;
    card.style.cssText = `
        display:flex;align-items:center;gap:12px;
        background:${isActive ? 'rgba(139,92,246,0.12)' : 'var(--bg-card)'};
        border:1px solid ${isActive ? 'rgba(139,92,246,0.4)' : 'var(--border)'};
        border-radius:10px;padding:10px 12px;
        transition:border-color 0.15s,background 0.15s;`;

    card.innerHTML = `
        <img src="${heads}" width="36" height="36"
            style="border-radius:5px;image-rendering:pixelated;background:#1a1a2e;flex-shrink:0;"
            onerror="this.src='https://mc-heads.net/avatar/steve/36'">
        <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:700;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(acc.name)}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:1px;">
                ${added ? 'Ajouté le ' + added : ''}
                ${isActive ? '<span style="color:#8B5CF6;font-weight:600;margin-left:4px;">· Actif</span>' : ''}
            </div>
        </div>
        <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;">
            ${isActive
                ? `<span style="font-size:10px;font-weight:700;color:#8B5CF6;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);border-radius:5px;padding:3px 8px;">ACTIF</span>`
                : `<button onclick="_switchAccount('${acc.uuid}')"
                    style="font-size:11px;font-weight:600;color:var(--text-main);background:var(--bg-inner);border:1px solid var(--border);border-radius:6px;padding:5px 10px;cursor:pointer;font-family:'Inter',sans-serif;transition:background 0.15s;"
                    onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='var(--bg-inner)'">Activer</button>`
            }
            <button onclick="_refreshAccount('${acc.uuid}')" title="Reconnecter"
                style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:5px 7px;cursor:pointer;color:var(--text-muted);display:flex;align-items:center;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </button>
            <button onclick="_removeAccount('${acc.uuid}', '${_esc(acc.name)}')" title="Supprimer"
                style="background:rgba(248,113,113,0.05);border:1px solid rgba(248,113,113,0.15);border-radius:6px;padding:5px 7px;cursor:pointer;color:#f87171;display:flex;align-items:center;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
        </div>`;

    return card;
}

// ── Switcher de compte actif ─────────────────────────────────
async function _switchAccount(uuid) {
    if (!window.electronAPI) return;
    _setAuthStatus('loading', 'Changement de compte...');

    try {
        const result = await window.electronAPI.accountsSetActive(uuid);
        if (!result.success) { _setAuthStatus('error', 'Compte introuvable'); return; }

        // Tenter un refresh du token pour ce compte
        const refreshResult = await window.electronAPI.msRefreshAccount(uuid);
        if (refreshResult.success) {
            window._activeMcToken = refreshResult.mcToken;
            window._activeProfile = refreshResult.profile;
            _updateUserZone(refreshResult.profile);
            showToast(`Compte actif : ${refreshResult.profile.name}`, 'success');
        } else {
            // Token expiré : afficher le nom mais token null
            window._activeMcToken = null;
            window._activeProfile = { uuid, name: result.name };
            _updateUserZone(window._activeProfile, true);
            showToast(`Compte changé : ${result.name} (session expirée, reconnectez)`, 'info');
        }

        _setAuthStatus('idle');
        await _renderAccountsList();

    } catch (e) {
        _setAuthStatus('error', e.message);
    }
}

// ── Reconnecter un compte spécifique ─────────────────────────
async function _refreshAccount(uuid) {
    if (!window.electronAPI) return;

    const card = document.getElementById(`acc-card-${uuid}`);
    if (card) card.style.opacity = '0.5';
    _setAuthStatus('loading', 'Reconnexion en cours...');

    try {
        const result = await window.electronAPI.msRefreshAccount(uuid);
        if (result.success) {
            // Si c'était le compte actif, mettre à jour le token en mémoire
            const list = await window.electronAPI.accountsList();
            if (list.activeUUID === uuid) {
                window._activeMcToken = result.mcToken;
                window._activeProfile = result.profile;
                _updateUserZone(result.profile);
            }
            showToast(`${result.profile.name} reconnecté !`, 'success');
        } else {
            // Refresh token expiré → relancer l'OAuth complet
            showToast('Session expirée. Reconnexion nécessaire...', 'info');
            setTimeout(() => _startMsLoginFlow(), 800);
        }
        _setAuthStatus('idle');
        await _renderAccountsList();
    } catch (e) {
        _setAuthStatus('error', e.message);
        if (card) card.style.opacity = '1';
    }
}

// ── Supprimer un compte ──────────────────────────────────────
async function _removeAccount(uuid, name) {
    if (!window.electronAPI) return;
    if (!confirm(`Supprimer le compte "${name}" ?`)) return;

    try {
        const result = await window.electronAPI.accountsRemove(uuid);

        // Si c'était le compte actif, mettre à jour le header
        if (window._activeProfile?.uuid === uuid) {
            window._activeMcToken = null;
            window._activeProfile = null;

            if (result.newActiveUUID) {
                // Il reste un autre compte — essayer de le refresher
                const refreshResult = await window.electronAPI.msSilentLogin();
                if (refreshResult.success) {
                    window._activeMcToken = refreshResult.mcToken;
                    window._activeProfile = refreshResult.profile;
                    _updateUserZone(refreshResult.profile);
                } else {
                    const list = await window.electronAPI.accountsList();
                    const newActive = list.accounts.find(a => a.isActive);
                    if (newActive) {
                        window._activeProfile = { uuid: newActive.uuid, name: newActive.name };
                        _updateUserZone(window._activeProfile, true);
                    } else {
                        _updateUserZone(null);
                    }
                }
            } else {
                _updateUserZone(null);
            }
        }

        showToast(`Compte "${name}" supprimé`, 'success');
        await _renderAccountsList();

    } catch (e) {
        showToast('Erreur : ' + e.message, 'error');
    }
}

// ── Afficher un statut dans le modal ─────────────────────────
function _setAuthStatus(type, msg = '') {
    const el = document.getElementById('accountsAuthStatus');
    if (!el) return;

    if (type === 'idle') { el.style.display = 'none'; return; }

    el.style.display = 'block';
    const colors = { loading: '#a0a0aa', error: '#f87171', success: '#22c55e', info: '#60a5fa' };
    el.style.color = colors[type] || '#a0a0aa';

    if (type === 'loading') {
        el.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border:2px solid rgba(160,160,170,0.3);border-top-color:#a0a0aa;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:8px;vertical-align:middle;"></span>${_esc(msg)}`;
    } else {
        el.textContent = msg;
    }
}

// ── Utilitaires ──────────────────────────────────────────────
function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Obtenir le mcToken actif (pour le lancement) ─────────────
async function getActiveMcToken() {
    if (window._activeMcToken) return window._activeMcToken;
    if (!window.electronAPI) return null;
    // Essayer un refresh silencieux si le token est absent
    try {
        const result = await window.electronAPI.msSilentLogin();
        if (result.success) {
            window._activeMcToken = result.mcToken;
            window._activeProfile = result.profile;
            _updateUserZone(result.profile);
            return result.mcToken;
        }
    } catch {}
    return null;
}

// ── Sélecteur de profil dans la launch card ──────────────────
function updateLaunchCard() {
    // Récupère les profils depuis profiles.js via les globals exposés
    const profiles  = window._getProfiles  ? window._getProfiles()  : [];
    const activeId  = window._getActiveProfileId ? window._getActiveProfileId() : null;
    const profile   = profiles.find(p => p.id === activeId) || profiles[0] || null;

    const nameEl  = document.getElementById('lcProfileName');
    const verEl   = document.getElementById('lcProfileVer');
    const dotEl   = document.getElementById('lcProfileDot');
    const chipEl  = document.getElementById('launchVersion');

    if (profile) {
        if (nameEl) nameEl.textContent = profile.name;
        // Afficher version + loader
        const loaderLabels = { vanilla:'Vanilla', fabric:'Fabric', neoforge:'NeoForge', forge:'Forge' };
        const loaderColors = { vanilla:'#4ade80', fabric:'#c4a4e0', neoforge:'#f59e0b', forge:'#e07040' };
        const ldr = profile.loader || 'vanilla';
        const ldrLabel = loaderLabels[ldr] || ldr;
        const ldrColor = loaderColors[ldr] || 'var(--accent)';
        if (verEl) verEl.innerHTML = `Minecraft ${profile.version} &nbsp;<span style="color:${ldrColor};font-weight:700;font-size:9px;background:${ldrColor}18;padding:1px 6px;border-radius:10px;border:1px solid ${ldrColor}33;">${ldrLabel}</span>`;
        if (dotEl)  dotEl.style.background = profile.color || 'var(--accent)';
        if (chipEl) chipEl.textContent = profile.version;
        // Fond dynamique selon version
        const bg = document.getElementById('lcVersionBg');
        if (bg) {
            const theme = typeof getVersionTheme === 'function' ? getVersionTheme(profile.version) : null;
            if (theme) { bg.style.background = theme.bg; bg.classList.add('visible'); }
        }
    } else {
        if (nameEl) nameEl.textContent = 'Aucun profil';
        if (verEl)  verEl.textContent  = 'Crée un profil d\'abord';
        if (dotEl)  dotEl.style.background = 'var(--text-muted)';
    }
}
window.updateLaunchCard = updateLaunchCard;

function toggleProfileDropdown() {
    const dd = document.getElementById('lcProfileDropdown');
    if (!dd) return;
    if (dd.style.display === 'none' || !dd.style.display) {
        _renderProfileDropdown();
        dd.style.display = 'block';
        // Fermer en cliquant ailleurs
        setTimeout(() => document.addEventListener('click', _closeDropdownOnOutside, { once: true }), 10);
    } else {
        dd.style.display = 'none';
    }
}

function _closeDropdownOnOutside(e) {
    const dd = document.getElementById('lcProfileDropdown');
    const sel = document.getElementById('lcProfileSelector');
    if (dd && !dd.contains(e.target) && !sel?.contains(e.target)) dd.style.display = 'none';
}

function _renderProfileDropdown() {
    const dd = document.getElementById('lcProfileDropdown');
    if (!dd) return;
    const profiles = window._getProfiles ? window._getProfiles() : [];
    const activeId = window._getActiveProfileId ? window._getActiveProfileId() : null;

    if (profiles.length === 0) {
        dd.innerHTML = '<div class="lc-pd-empty">Aucun profil — va dans l\'onglet Profils</div>';
        return;
    }
    dd.innerHTML = profiles.map(p => `
        <div class="lc-pd-item ${p.id === activeId ? 'active' : ''}" onclick="_selectProfileFromDropdown('${p.id}')">
            <div class="lc-pd-dot" style="background:${p.color || '#8B5CF6'};"></div>
            <span class="lc-pd-name">${p.name}</span>
            <span class="lc-pd-ver">${p.version}</span>
            ${p.id === activeId ? '<span class="lc-pd-check">✓</span>' : ''}
        </div>`).join('');
}
window._renderProfileDropdown = _renderProfileDropdown;

function _selectProfileFromDropdown(id) {
    if (typeof setActiveProfile === 'function') setActiveProfile(id);
    document.getElementById('lcProfileDropdown').style.display = 'none';
    updateLaunchCard();
}
window._selectProfileFromDropdown = _selectProfileFromDropdown;


// ── Injecter l'animation CSS spin si absent ──────────────────
(function _injectSpinCSS() {
    if (document.getElementById('acct-spin-style')) return;
    const s = document.createElement('style');
    s.id = 'acct-spin-style';
    s.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(s);
})();

// ── Exports globaux ──────────────────────────────────────────
window.initAccounts       = initAccounts;
window.handleLogin        = handleLogin;
window.openAccountsModal  = openAccountsModal;
window.closeAccountsModal = closeAccountsModal;
window.getActiveMcToken   = getActiveMcToken;
window._startMsLoginFlow  = _startMsLoginFlow;
window._switchAccount     = _switchAccount;
window._refreshAccount    = _refreshAccount;
window._removeAccount     = _removeAccount;
