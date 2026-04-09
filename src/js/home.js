/* ============================================================
   home.js — Actualités & page d'accueil
   Mighty Client v2.0.0
   ============================================================ */
'use strict';

const NEWS_DATA = [
    {
        tag: 'MISE À JOUR',
        title: 'Java 26.1.2 — Tiny Takeover Hotfix',
        desc: 'Correctifs post-Tiny Takeover, stabilité générale',
        date: '9 avr. 2026',
        accent: '#a3e635',

        imgBg: 'linear-gradient(135deg,#0a1f00,#1a3d00)',
        url: 'https://www.minecraft.net/en-us/article/minecraft-java-edition-26-1-2',
    },
    {
        tag: 'MISE À JOUR',
        title: 'Java 26.1 — Tiny Takeover',
        desc: 'Bébés mobs redessinés, pissenlit doré, name tags craftables',
        date: '24 mars 2026',
        accent: '#fbbf24',

        imgBg: 'linear-gradient(135deg,#1a1200,#3d2c00)',
        url: 'https://www.minecraft.net/en-us/article/minecraft-java-edition-26-1',
    },
    {
        tag: 'À VENIR',
        title: 'Java 26.2 — Chaos Cubed',
        desc: 'Sulfur Caves, Sulfur Cube, blocs Soufre & Cinabre — Q2 2026',
        date: 'Q2 2026',
        accent: '#f97316',

        imgBg: 'linear-gradient(135deg,#1f0a00,#3d1a00)',
        url: 'https://minecraft.wiki/w/Chaos_Cubed',
    },
    {
        tag: 'SODIUM',
        title: 'Sodium 0.8.9 — Support 26.1.1',
        desc: 'Compatibilité Minecraft 26.1–26.1.1, correctifs divers',
        date: '3 avr. 2026',
        accent: '#fb923c',

        imgBg: 'linear-gradient(135deg,#1f0d00,#5c2d00)',
        url: 'https://modrinth.com/mod/sodium',
    },
    {
        tag: 'IRIS SHADERS',
        title: 'Iris 1.10.9 — Support 26.1.1',
        desc: 'Shaders optimisés pour Minecraft 26.1 & Sodium 0.8.9',
        date: '3 avr. 2026',
        accent: '#38bdf8',

        imgBg: 'linear-gradient(135deg,#001a2e,#002d4a)',
        url: 'https://modrinth.com/mod/iris',
    },
    {
        tag: 'FABRIC',
        title: 'Fabric Loader 0.19.0 — Stable',
        desc: 'Support Minecraft 26.1, Java 25 requis, mixin amélioré',
        date: '1 avr. 2026',
        accent: '#c4a4e0',

        imgBg: 'linear-gradient(135deg,#1a1a2e,#0f3460)',
        url: 'https://fabricmc.net',
    },
    {
        tag: 'NEOFORGE',
        title: 'NeoForge 26.1.1 — Pour Minecraft 26.1',
        desc: 'Support officiel MC 26.1, nouveau format de version',
        date: '2 avr. 2026',
        accent: '#f59e0b',

        imgBg: 'linear-gradient(135deg,#1a0d00,#3d2000)',
        url: 'https://neoforged.net',
    },
    {
        tag: 'ANNONCE',
        title: 'Minecraft Dungeons II — Annoncé',
        desc: "Action-RPG coopératif jusqu'à 4 joueurs, sortie en 2026",
        date: 'mars 2026',
        accent: '#f87171',

        imgBg: 'linear-gradient(135deg,#1a0000,#3d0000)',
        url: 'https://www.minecraft.net/en-us/article/mclive_march2026_recap',
    },
    {
        tag: 'MOD SPOTLIGHT',
        title: 'Create — Support Minecraft 26.1',
        desc: 'Trains, contraptions et mécanismes pour Minecraft 26.1',
        date: 'avr. 2026',
        accent: '#818cf8',

        imgBg: 'linear-gradient(135deg,#0d0d1a,#1a1a3d)',
        url: 'https://modrinth.com/mod/create',
    },
];

const LAYOUT_SEQUENCE = [
    { type: 'full',   count: 1 },
    { type: 'left',   count: 2 },
    { type: 'three',  count: 3 },
    { type: 'right',  count: 2 },
    { type: 'full',   count: 1 },
];

function _renderCard(item) {
    // Build background: gradient + centered icon (no cover images)
    const bg = item.imgBg || '#0a0a12';
    let bgInner = `<div style="position:absolute;inset:0;background:${bg};"></div>`;


    return `<div class="nf-item" onclick="_openNewsLink('${item.url}')">
        <div class="nf-item-bg" style="position:absolute;inset:0;overflow:hidden;">${bgInner}</div>
        <div class="nf-item-overlay"></div>
        <div class="nf-item-content">
            <div class="nf-item-tag" style="color:${item.accent};background:${item.accent}18;border:1px solid ${item.accent}33;border-radius:3px;padding:1px 6px;display:inline-block;font-size:7.5px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;margin-bottom:4px;">${item.tag}</div>
            <div class="nf-item-title">${item.title}</div>
            ${item.desc ? `<div class="nf-item-desc" style="font-size:9px;color:rgba(255,255,255,.5);margin-top:2px;line-height:1.4;">${item.desc}</div>` : ''}
            <div class="nf-item-date">${item.date}</div>
        </div>
    </div>`;
}

function renderNews() {
    const feed = document.getElementById('newsFeed');
    if (!feed) return;
    feed.innerHTML = '';

    let idx = 0;
    for (const layout of LAYOUT_SEQUENCE) {
        if (idx >= NEWS_DATA.length) break;
        const row = document.createElement('div');
        row.className = `news-row layout-${layout.type}`;
        row.innerHTML = NEWS_DATA.slice(idx, idx + layout.count).map(_renderCard).join('');
        idx += layout.count;
        feed.appendChild(row);
    }

    while (idx < NEWS_DATA.length) {
        const slice = NEWS_DATA.slice(idx, idx + 2);
        const row = document.createElement('div');
        row.className = `news-row layout-${slice.length === 1 ? 'full' : 'two'}`;
        row.innerHTML = slice.map(_renderCard).join('');
        idx += slice.length;
        feed.appendChild(row);
    }
}

function _openNewsLink(url) {
    if (!url) return;
    if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url);
    else window.open(url, '_blank');
}

// ── ACTUALITÉS DYNAMIQUES (Modrinth + Minecraft) ────────────────
// Mise à jour automatique des news depuis les sources officielles

async function _fetchModrinthUpdates() {
    try {
        // Sodium
        const sodiumRes = await fetch('https://api.modrinth.com/v2/project/AANobbMI/version?limit=1');
        if (sodiumRes.ok) {
            const [v] = await sodiumRes.json();
            if (v) {
                const idx = NEWS_DATA.findIndex(n => n.tag === 'SODIUM');
                if (idx !== -1) {
                    NEWS_DATA[idx].title = `Sodium ${v.version_number}`;
                    NEWS_DATA[idx].desc  = v.name || NEWS_DATA[idx].desc;
                    const d = new Date(v.date_published);
                    NEWS_DATA[idx].date = d.toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' });
                }
            }
        }
        // Iris
        const irisRes = await fetch('https://api.modrinth.com/v2/project/YL57xq9U/version?limit=1');
        if (irisRes.ok) {
            const [v] = await irisRes.json();
            if (v) {
                const idx = NEWS_DATA.findIndex(n => n.tag === 'IRIS SHADERS');
                if (idx !== -1) {
                    NEWS_DATA[idx].title = `Iris ${v.version_number}`;
                    NEWS_DATA[idx].desc  = v.name || NEWS_DATA[idx].desc;
                    const d = new Date(v.date_published);
                    NEWS_DATA[idx].date = d.toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' });
                }
            }
        }
        // Fabric Loader
        const fabricRes = await fetch('https://meta.fabricmc.net/v2/versions/loader?limit=1');
        if (fabricRes.ok) {
            const [v] = await fabricRes.json();
            if (v) {
                const idx = NEWS_DATA.findIndex(n => n.tag === 'FABRIC');
                if (idx !== -1) {
                    NEWS_DATA[idx].title = `Fabric Loader ${v.version} — Stable`;
                }
            }
        }
    } catch(e) {
        // silencieux, les données statiques restent
    }
}

async function initNews() {
    // Rafraîchit les versions en arrière-plan sans bloquer l'affichage
    renderNews(); // affichage immédiat avec données statiques
    _fetchModrinthUpdates().then(() => renderNews()); // mise à jour silencieuse
}

window.renderNews    = renderNews;
window._openNewsLink = _openNewsLink;
window.initNews = initNews;
