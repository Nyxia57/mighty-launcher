/* ============================================================
   navigation.js — Navigation & Contrôles fenêtre
   Mighty Client v2.0.0
   ============================================================ */

'use strict';

// ── TOAST NOTIFICATIONS ──────────────────────────────────────

let _toastTimer = null;

function showToast(message, type = 'info') {
    let toast = document.getElementById('mightyToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'mightyToast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }

    // Icône selon le type
    const icons = {
        success: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
        error:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
        info:    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    };

    const colors = { success: '#4ade80', error: '#f87171', info: '#93c5fd' };
    const color = colors[type] || colors.info;

    toast.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
    toast.style.borderColor = `${color}33`;
    toast.style.boxShadow = `0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px ${color}22`;

    clearTimeout(_toastTimer);
    toast.classList.add('show');
    _toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

window.showToast = showToast;


/**
 * Affiche la page correspondant à pageId et met à jour les onglets.
 * @param {string} pageId - 'home' | 'profils' | 'addons' | 'settings' | 'support'
 */
function showPage(pageId) {
    // Masquer toutes les pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    // Afficher la page cible
    const target = document.getElementById('page-' + pageId);
    if (target) {
        target.classList.add('active');
    }

    // Mettre à jour les onglets de navigation (sidebar ou nav-tabs)
    document.querySelectorAll('.nav-tab, .nav-item').forEach(tab => {
        tab.classList.remove('active');
        if (tab.getAttribute('data-page') === pageId) {
            tab.classList.add('active');
        }
    });

    // Fermer le panneau de détail Modrinth si on change de page
    const detailPanel = document.getElementById('mrDetailPanel');
    if (detailPanel) {
        detailPanel.style.display = 'none';
    }

    // ── FIX : Re-render les paramètres à chaque fois qu'on ouvre la page ──
    // Corrige le bug où le contenu n'apparaît pas au premier clic
    if (pageId === 'settings' && typeof renderSettings === 'function') {
        renderSettings();
    }

    // ── FIX : Re-render la vue addons à chaque ouverture ──
    // Corrige le bug où la liste "Installés" reste vide au premier chargement
    if (pageId === 'addons' && typeof renderInstalledAddons === 'function') {
        renderInstalledAddons();
    }

    // ── Skin & Cape : initialiser/stopper le renderer 3D ──
    if (pageId === 'skincape' && typeof initSkinCapePage === 'function') {
        initSkinCapePage();
    } else if (pageId !== 'skincape' && typeof stopSkin3D === 'function') {
        stopSkin3D();
    }

    // ── Discord Rich Presence : notifier le changement de page ──
    if (window.electronAPI?.discordUpdate) {
        window.electronAPI.discordUpdate({ page: pageId, server: null });
    }
}

// ── CONTRÔLES FENÊTRE ELECTRON ───────────────────────────────

function winMinimize() {
    if (window.electronAPI?.minimize) {
        window.electronAPI.minimize();
    }
}

function winMaximize() {
    if (window.electronAPI?.maximize) {
        window.electronAPI.maximize();
    }
}

function winClose() {
    if (window.electronAPI?.close) {
        window.electronAPI.close();
    }
}

// ── INIT AU CHARGEMENT ───────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

    // Synchronisation de l'icône maximize/restore avec l'état de la fenêtre
    if (window.electronAPI?.onMaximized) {
        window.electronAPI.onMaximized((isMaximized) => {
            const btn = document.getElementById('winMaxBtn');
            if (!btn) return;
            if (isMaximized) {
                btn.title = 'Restaurer';
                btn.innerHTML = `
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <rect x="2.5" y="0.6" width="6.9" height="6.9" fill="none" stroke="currentColor" stroke-width="1.2"/>
                        <rect x="0.6" y="2.5" width="6.9" height="6.9" fill="var(--bg-main,#18181b)" stroke="currentColor" stroke-width="1.2"/>
                    </svg>`;
            } else {
                btn.title = 'Plein écran';
                btn.innerHTML = `
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <rect x="0.6" y="0.6" width="8.8" height="8.8" fill="none" stroke="currentColor" stroke-width="1.2"/>
                    </svg>`;
            }
        });
    }

    // S'assurer que la page active par défaut est bien visible
    const firstActive = document.querySelector('.nav-tab.active, .nav-item.active');
    if (!firstActive) {
        const firstTab = document.querySelector('.nav-tab[data-page], .nav-item[data-page]');
        if (firstTab) showPage(firstTab.getAttribute('data-page'));
    } else {
        const activePage = firstActive.getAttribute('data-page');
        if (activePage) showPage(activePage);
    }
});
