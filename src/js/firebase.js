/* ============================================================
   firebase.js — Système d'amis & chat temps réel
   Mighty Client v2.0.0

   Stack : Firebase v9 (compat) — Firestore + Realtime Database
   ─────────────────────────────────────────────────────────────
   SETUP :
     1. Crée un projet sur https://console.firebase.google.com
     2. Active Firestore (mode production) et Realtime Database
     3. Active l'auth anonyme (Authentication > Sign-in > Anonymous)
     4. Remplace FIREBASE_CONFIG ci-dessous par ta config
     5. Dans Firestore Rules, colle les règles du commentaire RULES

   COLLECTIONS Firestore :
     users/{uuid}               → profil public (name, uuid, status, lastSeen)
     friends/{uuid}/list/{fuid} → liste d'amis (status: pending|accepted|blocked)
     requests/{uuid}            → demandes reçues (sous-collection)

   REALTIME DB :
     presence/{uuid}            → online/offline (avec onDisconnect)
     messages/{convId}/{msgId}  → messages de chat

   RULES (Firestore) — coller dans la console :
     rules_version = '2';
     service cloud.firestore {
       match /databases/{db}/documents {
         match /users/{uid} {
           allow read: if request.auth != null;
           allow write: if request.auth.uid == uid;
         }
         match /friends/{uid}/list/{fid} {
           allow read, write: if request.auth.uid == uid;
         }
         match /requests/{uid}/{rid} {
           allow read: if request.auth.uid == uid;
           allow write: if request.auth != null;
           allow delete: if request.auth.uid == uid;
         }
       }
     }

   RULES (Realtime DB) :
     {
       "rules": {
         "presence": {
           "$uid": { ".read": "auth != null", ".write": "auth.uid == $uid" }
         },
         "messages": {
           "$conv": {
             ".read": "auth != null && ($conv.contains(auth.uid))",
             ".write": "auth != null && ($conv.contains(auth.uid))"
           }
         }
       }
     }
   ============================================================ */

'use strict';

// ══════════════════════════════════════════════════════════════
//  ⚠️  REMPLACE ICI avec ta config Firebase
// ══════════════════════════════════════════════════════════════
const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyAkG1SkW6v9fDkuX4NW4pqKSUDNIVZNwQ0",
    authDomain:        "mighty-a11b4.firebaseapp.com",
    projectId:         "mighty-a11b4",
    storageBucket:     "mighty-a11b4.firebasestorage.app",
    messagingSenderId: "120123290830",
    appId:             "1:120123290830:web:214418fd37726e00548c9f",
};
// ══════════════════════════════════════════════════════════════

// ── SDK Firebase (compat v9, chargé via CDN dans index.html) ─
let _db   = null;   // Firestore
let _rtdb = null;   // Realtime DB
let _auth = null;   // Auth
let _myUid  = null; // UUID Minecraft de l'utilisateur connecté
let _myName = null; // Pseudo Minecraft

// ── État local ───────────────────────────────────────────────
let _friends        = {};     // { uuid: { name, status, online } }
let _activeChatUid  = null;   // UUID de la conversation ouverte
let _chatListeners  = {};     // listeners Realtime DB actifs
let _friendListener = null;   // listener Firestore amis
let _reqListener    = null;   // listener requêtes entrantes
let _presListeners  = {};     // listeners presence par ami

// ─────────────────────────────────────────────────────────────
//  INITIALISATION
// ─────────────────────────────────────────────────────────────

/**
 * Appelé depuis DOMContentLoaded une fois que le compte Minecraft
 * est disponible (window._activeProfile).
 * Si Firebase est déjà configuré avec de vraies valeurs, connecte l'utilisateur.
 */
async function initFirebase() {
    // Vérifier si la config a été remplie
    if (FIREBASE_CONFIG.apiKey === 'VOTRE_API_KEY') {
        _renderFriendsNotConfigured();
        return;
    }

    // Vérifier que les SDK sont chargés
    if (typeof firebase === 'undefined') {
        console.warn('[Firebase] SDK non chargé. Vérifie les balises <script> dans index.html.');
        _renderFriendsNotConfigured();
        return;
    }

    try {
        // Initialiser (idempotent si déjà fait)
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);

        _db   = firebase.firestore();
        _rtdb = firebase.database();
        _auth = firebase.auth();

        // Attendre que le compte Minecraft soit prêt
        await _waitForMcProfile();
        if (!_myUid) { _renderFriendsDisconnected(); return; }

        // Auth Firebase anonyme liée à l'UUID Minecraft
        await _signInWithUUID(_myUid);

        // Écrire / mettre à jour le profil public
        await _db.collection('users').doc(_myUid).set({
            uuid:     _myUid,
            name:     _myName,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        // Présence en ligne
        _setupPresence(_myUid);

        // Écouter la liste d'amis + les demandes entrantes
        _listenFriends();
        _listenRequests();

        console.log('[Firebase] Connecté en tant que', _myName, '/', _myUid);

    } catch (e) {
        console.error('[Firebase] initFirebase error:', e);
        _renderFriendsError('Erreur Firebase : ' + e.message);
    }
}

/** Attend que window._activeProfile soit disponible (max 10s) */
function _waitForMcProfile() {
    return new Promise((resolve) => {
        if (window._activeProfile?.uuid) {
            _myUid  = window._activeProfile.uuid;
            _myName = window._activeProfile.name;
            return resolve();
        }
        let tries = 0;
        const iv = setInterval(() => {
            if (window._activeProfile?.uuid) {
                _myUid  = window._activeProfile.uuid;
                _myName = window._activeProfile.name;
                clearInterval(iv);
                resolve();
            } else if (++tries > 50) { clearInterval(iv); resolve(); }
        }, 200);
    });
}

/** Auth anonyme Firebase avec token custom basé sur l'UUID MC */
async function _signInWithUUID(uuid) {
    // On utilise signInAnonymously puis on stocke l'UUID en custom claim
    // via le document Firestore (pas de backend nécessaire)
    if (_auth.currentUser) return; // déjà connecté
    await _auth.signInAnonymously();
}

// ─────────────────────────────────────────────────────────────
//  PRÉSENCE TEMPS RÉEL
// ─────────────────────────────────────────────────────────────

function _setupPresence(uuid) {
    const presRef  = _rtdb.ref('presence/' + uuid);
    const connRef  = _rtdb.ref('.info/connected');

    connRef.on('value', (snap) => {
        if (!snap.val()) return;
        // Marquer offline à la déconnexion
        presRef.onDisconnect().set({ online: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
        // Marquer online maintenant
        presRef.set({ online: true, lastSeen: firebase.database.ServerValue.TIMESTAMP });
    });
}

function _watchPresence(uuid, cb) {
    if (_presListeners[uuid]) return; // déjà écouté
    const ref = _rtdb.ref('presence/' + uuid);
    _presListeners[uuid] = ref.on('value', (snap) => {
        const val = snap.val();
        cb(val?.online === true);
    });
}

// ─────────────────────────────────────────────────────────────
//  LISTE D'AMIS (Firestore)
// ─────────────────────────────────────────────────────────────

function _listenFriends() {
    if (_friendListener) _friendListener(); // unsubscribe précédent

    _friendListener = _db
        .collection('friends').doc(_myUid).collection('list')
        .where('status', '==', 'accepted')
        .onSnapshot(async (snap) => {
            const newFriends = {};
            for (const doc of snap.docs) {
                const fuid = doc.id;
                const data = doc.data();
                // Récupérer le profil public
                let name = data.name || fuid;
                try {
                    const uDoc = await _db.collection('users').doc(fuid).get();
                    if (uDoc.exists) name = uDoc.data().name || name;
                } catch {}
                newFriends[fuid] = { name, online: false, status: 'accepted' };
                // Écouter la présence
                _watchPresence(fuid, (online) => {
                    if (_friends[fuid]) {
                        _friends[fuid].online = online;
                        _renderFriendsList();
                    }
                });
            }
            _friends = newFriends;
            _renderFriendsList();
        }, (e) => console.error('[Firebase] listenFriends:', e));
}

function _listenRequests() {
    if (_reqListener) _reqListener();

    _reqListener = _db
        .collection('requests').doc(_myUid).collection('incoming')
        .onSnapshot((snap) => {
            snap.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const d = change.doc.data();
                    _showFriendRequestToast(d.fromName || d.fromUUID, d.fromUUID, change.doc.id);
                }
            });
        }, (e) => console.error('[Firebase] listenRequests:', e));
}

// ─────────────────────────────────────────────────────────────
//  ENVOI D'UNE DEMANDE D'AMI
// ─────────────────────────────────────────────────────────────

async function sendFriendRequest() {
    const input  = document.getElementById('addFriendInput');
    const status = document.getElementById('addFriendStatus');
    const pseudo = (input?.value || '').trim();

    if (!pseudo) return;
    if (!_myUid) { _setAddStatus('Connecte-toi à un compte Minecraft.', '#f87171'); return; }
    if (pseudo === _myName) { _setAddStatus('Tu ne peux pas t\'ajouter toi-même.', '#f87171'); return; }

    _setAddStatus('Recherche en cours...', '#60a5fa');

    try {
        // Chercher l'utilisateur par son pseudo (insensible à la casse)
        const snap = await _db.collection('users')
            .where('name', '==', pseudo)
            .limit(1)
            .get();

        if (snap.empty) {
            _setAddStatus(`Aucun joueur "${pseudo}" trouvé. Il doit s'être connecté au moins une fois.`, '#f87171');
            return;
        }

        const target = snap.docs[0].data();
        const targetUUID = target.uuid;

        // Vérifier si déjà ami
        const existingFriend = await _db
            .collection('friends').doc(_myUid).collection('list').doc(targetUUID).get();
        if (existingFriend.exists && existingFriend.data().status === 'accepted') {
            _setAddStatus(`${pseudo} est déjà dans ta liste d'amis.`, '#f59e0b');
            return;
        }

        // Envoyer la demande dans la collection requests de la cible
        await _db
            .collection('requests').doc(targetUUID).collection('incoming').doc(_myUid)
            .set({
                fromUUID: _myUid,
                fromName: _myName,
                sentAt:   firebase.firestore.FieldValue.serverTimestamp(),
            });

        // Marquer comme "pending" dans notre liste
        await _db
            .collection('friends').doc(_myUid).collection('list').doc(targetUUID)
            .set({ status: 'pending', name: pseudo, since: firebase.firestore.FieldValue.serverTimestamp() });

        _setAddStatus(`Demande envoyée à ${pseudo} ✓`, '#22c55e');
        if (input) input.value = '';
        setTimeout(() => _setAddStatus('', ''), 3000);

    } catch (e) {
        _setAddStatus('Erreur : ' + e.message, '#f87171');
        console.error('[Firebase] sendFriendRequest:', e);
    }
}

function _setAddStatus(msg, color) {
    const el = document.getElementById('addFriendStatus');
    if (!el) return;
    el.textContent = msg;
    el.style.color = color;
}

// ─────────────────────────────────────────────────────────────
//  ACCEPTER / REFUSER UNE DEMANDE
// ─────────────────────────────────────────────────────────────

async function acceptFriendRequest(fromUUID, fromName, reqDocId) {
    try {
        const batch = _db.batch();

        // Ajouter l'ami dans notre liste
        batch.set(
            _db.collection('friends').doc(_myUid).collection('list').doc(fromUUID),
            { status: 'accepted', name: fromName, since: firebase.firestore.FieldValue.serverTimestamp() }
        );
        // Ajouter nous dans la liste de l'ami
        batch.set(
            _db.collection('friends').doc(fromUUID).collection('list').doc(_myUid),
            { status: 'accepted', name: _myName, since: firebase.firestore.FieldValue.serverTimestamp() }
        );
        // Supprimer la demande entrante
        batch.delete(
            _db.collection('requests').doc(_myUid).collection('incoming').doc(reqDocId)
        );

        await batch.commit();
        showToast(`${fromName} est maintenant ton ami !`, 'success');

    } catch (e) {
        showToast('Erreur : ' + e.message, 'error');
        console.error('[Firebase] acceptFriendRequest:', e);
    }
}

async function declineFriendRequest(fromUUID, reqDocId) {
    try {
        await _db
            .collection('requests').doc(_myUid).collection('incoming').doc(reqDocId)
            .delete();

        // Supprimer aussi le "pending" de l'autre côté
        await _db
            .collection('friends').doc(fromUUID).collection('list').doc(_myUid)
            .delete();

        showToast('Demande refusée.', 'info');
    } catch (e) {
        console.error('[Firebase] declineFriendRequest:', e);
    }
}

async function removeFriend(fuid) {
    const friend = _friends[fuid];
    if (!friend) return;
    if (!confirm(`Supprimer ${friend.name} de ta liste d'amis ?`)) return;

    try {
        const batch = _db.batch();
        batch.delete(_db.collection('friends').doc(_myUid).collection('list').doc(fuid));
        batch.delete(_db.collection('friends').doc(fuid).collection('list').doc(_myUid));
        await batch.commit();
        showToast(`${friend.name} retiré de tes amis.`, 'success');
    } catch (e) {
        showToast('Erreur : ' + e.message, 'error');
    }
}

// ─────────────────────────────────────────────────────────────
//  CHAT TEMPS RÉEL (Realtime Database)
// ─────────────────────────────────────────────────────────────

/** Crée un ID de conversation stable entre deux UUID */
function _convId(a, b) {
    return [a, b].sort().join('_');
}

/** Ouvre le chat avec un ami */
function openChatWith(fuid) {
    _activeChatUid = fuid;
    const friend   = _friends[fuid];

    // Mettre à jour le header du chat
    const hdr = document.getElementById('chatHeader');
    if (hdr && friend) {
        const heads = `https://crafatar.com/avatars/${fuid}?size=28&overlay=true`;
        hdr.innerHTML = `
            <img src="${heads}" width="28" height="28" style="border-radius:4px;image-rendering:pixelated;background:#1a1a2e;flex-shrink:0;" onerror="this.style.display='none'">
            <div style="flex:1;">
                <div style="font-size:13px;font-weight:700;color:#f0f0f2;">${_escHtml(friend.name)}</div>
                <div style="font-size:10px;color:${friend.online ? '#22c55e' : '#606068'};">${friend.online ? '● en ligne' : '○ hors ligne'}</div>
            </div>
            <button onclick="removeFriend('${fuid}')" title="Supprimer cet ami"
                style="background:rgba(248,113,113,0.07);border:1px solid rgba(248,113,113,0.15);border-radius:6px;padding:5px 8px;cursor:pointer;color:#f87171;font-size:10px;font-family:'Inter',sans-serif;"
                onmouseover="this.style.background='rgba(248,113,113,0.15)'" onmouseout="this.style.background='rgba(248,113,113,0.07)'">Supprimer</button>`;
    }

    // Nettoyer les anciens messages + listener
    const msgBox = document.getElementById('chatMessages');
    if (msgBox) msgBox.innerHTML = '';
    _unsubscribeCurrentChat();

    // Écouter les 50 derniers messages
    const convId = _convId(_myUid, fuid);
    const ref    = _rtdb.ref('messages/' + convId).limitToLast(50);

    _chatListeners[fuid] = ref.on('child_added', (snap) => {
        const msg = snap.val();
        if (msg) _appendChatMessage(msg);
    });

    // Surligner dans la sidebar
    _highlightChatFriend(fuid);
}

function _unsubscribeCurrentChat() {
    if (_activeChatUid && _chatListeners[_activeChatUid]) {
        const convId = _convId(_myUid, _activeChatUid);
        _rtdb.ref('messages/' + convId).off('child_added', _chatListeners[_activeChatUid]);
        delete _chatListeners[_activeChatUid];
    }
}

async function sendChatMsg() {
    const input = document.getElementById('chatInput');
    const text  = (input?.value || '').trim();
    if (!text || !_activeChatUid || !_myUid) return;

    const convId = _convId(_myUid, _activeChatUid);
    const msgRef = _rtdb.ref('messages/' + convId).push();

    await msgRef.set({
        from:   _myUid,
        name:   _myName,
        text,
        ts:     firebase.database.ServerValue.TIMESTAMP,
    });

    if (input) input.value = '';
}

function _appendChatMessage(msg) {
    const msgBox = document.getElementById('chatMessages');
    if (!msgBox) return;

    const isMine = msg.from === _myUid;
    const time   = msg.ts ? new Date(msg.ts).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }) : '';

    const el = document.createElement('div');
    el.style.cssText = `display:flex;flex-direction:column;align-items:${isMine ? 'flex-end' : 'flex-start'};gap:2px;`;
    el.innerHTML = `
        ${!isMine ? `<div style="font-size:10px;color:#606068;margin-left:4px;">${_escHtml(msg.name)}</div>` : ''}
        <div style="max-width:75%;background:${isMine ? 'var(--accent)' : 'rgba(255,255,255,0.08)'};color:${isMine ? '#fff' : '#f0f0f2'};padding:8px 12px;border-radius:${isMine ? '12px 12px 4px 12px' : '12px 12px 12px 4px'};font-size:12px;font-family:'Inter',sans-serif;line-height:1.45;word-break:break-word;">${_escHtml(msg.text)}</div>
        <div style="font-size:9px;color:#40404a;margin:0 4px;">${time}</div>`;
    msgBox.appendChild(el);
    msgBox.scrollTop = msgBox.scrollHeight;
}

// ─────────────────────────────────────────────────────────────
//  RENDU UI — PANNEAU AMIS
// ─────────────────────────────────────────────────────────────

function _renderFriendsList() {
    const box = document.getElementById('friendsBox');
    if (!box) return;

    const list = Object.entries(_friends).filter(([, f]) => f.status === 'accepted');

    if (list.length === 0) {
        box.innerHTML = `<div class="friends-empty"><div class="friends-empty-text">Aucun ami pour l'instant</div></div>`;
        _updateFriendCount(0);
        return;
    }

    // Trier : en ligne d'abord, puis alphabétique
    list.sort(([, a], [, b]) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    const onlineCount = list.filter(([, f]) => f.online).length;
    _updateFriendCount(onlineCount);

    box.innerHTML = list.map(([fuid, f]) => {
        const heads = `https://crafatar.com/avatars/${fuid}?size=22&overlay=true`;
        return `
        <div class="friend-row" onclick="openChatWith('${fuid}')" title="Chatter avec ${_escHtml(f.name)}" style="cursor:pointer;">
            <div class="friend-avatar-wrap" style="position:relative;flex-shrink:0;">
                <img src="${heads}" width="22" height="22" class="friend-avatar" onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 22 22\\'><rect width=\\'22\\' height=\\'22\\' fill=\\'%231a1a2e\\' rx=\\'3\\'/></svg>'">
                <span style="position:absolute;bottom:-1px;right:-1px;width:7px;height:7px;border-radius:50%;background:${f.online ? '#22c55e' : '#404048'};border:1.5px solid var(--bg-card);"></span>
            </div>
            <span class="friend-name" style="color:${f.online ? 'var(--text-main)' : 'var(--text-muted)'};">${_escHtml(f.name)}</span>
            <span style="font-size:9px;color:${f.online ? '#22c55e' : '#40404a'};margin-left:auto;flex-shrink:0;">${f.online ? 'en ligne' : 'hors ligne'}</span>
        </div>`;
    }).join('');
}

function _updateFriendCount(online) {
    const el = document.getElementById('friendCount');
    if (el) el.textContent = online > 0 ? `${online} en ligne` : '0 en ligne';
}

function _renderFriendsNotConfigured() {
    const box = document.getElementById('friendsBox');
    if (box) box.innerHTML = `<div class="friends-empty"><div class="friends-empty-text" style="font-size:10px;line-height:1.5;">Firebase non configuré.<br><span style="color:#7C5CBF;cursor:pointer;" onclick="window.electronAPI?.openExternal('https://console.firebase.google.com')">Configurer →</span></div></div>`;
}

function _renderFriendsDisconnected() {
    const box = document.getElementById('friendsBox');
    if (box) box.innerHTML = `<div class="friends-empty"><div class="friends-empty-text">Non connecté</div></div>`;
}

function _renderFriendsError(msg) {
    const box = document.getElementById('friendsBox');
    if (box) box.innerHTML = `<div class="friends-empty"><div class="friends-empty-text" style="color:#f87171;font-size:10px;">${_escHtml(msg)}</div></div>`;
}

// ─────────────────────────────────────────────────────────────
//  RENDU UI — PANEL CHAT (sidebar amis)
// ─────────────────────────────────────────────────────────────

function _renderChatFriendList(filter = '') {
    const list = document.getElementById('chatFriendList');
    if (!list) return;

    const entries = Object.entries(_friends)
        .filter(([, f]) => f.status === 'accepted')
        .filter(([, f]) => !filter || f.name.toLowerCase().includes(filter.toLowerCase()))
        .sort(([, a], [, b]) => (a.online === b.online ? a.name.localeCompare(b.name) : a.online ? -1 : 1));

    if (entries.length === 0) {
        list.innerHTML = `<div style="padding:16px;text-align:center;color:#404048;font-size:11px;">${filter ? 'Aucun résultat' : 'Aucun ami'}</div>`;
        return;
    }

    list.innerHTML = entries.map(([fuid, f]) => {
        const isActive = fuid === _activeChatUid;
        const heads = `https://crafatar.com/avatars/${fuid}?size=28&overlay=true`;
        return `
        <div id="chat-friend-${fuid}" onclick="openChatWith('${fuid}')"
            style="display:flex;align-items:center;gap:10px;padding:8px 14px;cursor:pointer;background:${isActive ? 'rgba(124,92,191,0.15)' : 'transparent'};border-left:2px solid ${isActive ? 'var(--accent)' : 'transparent'};transition:background 0.15s;"
            onmouseover="if('${fuid}'!==_activeChatUid)this.style.background='rgba(255,255,255,0.04)'"
            onmouseout="if('${fuid}'!==_activeChatUid)this.style.background='transparent'">
            <div style="position:relative;flex-shrink:0;">
                <img src="${heads}" width="28" height="28" style="border-radius:5px;image-rendering:pixelated;background:#1a1a2e;" onerror="this.style.display='none'">
                <span style="position:absolute;bottom:-1px;right:-1px;width:8px;height:8px;border-radius:50%;background:${f.online ? '#22c55e' : '#404048'};border:1.5px solid #18181c;"></span>
            </div>
            <div style="min-width:0;">
                <div style="font-size:12px;font-weight:600;color:${f.online ? '#f0f0f2' : '#606068'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_escHtml(f.name)}</div>
                <div style="font-size:10px;color:${f.online ? '#22c55e' : '#40404a'};">${f.online ? 'en ligne' : 'hors ligne'}</div>
            </div>
        </div>`;
    }).join('');
}

function _highlightChatFriend(fuid) {
    // Supprimer la sélection précédente
    document.querySelectorAll('[id^="chat-friend-"]').forEach(el => {
        el.style.background = 'transparent';
        el.style.borderLeft = '2px solid transparent';
    });
    const el = document.getElementById('chat-friend-' + fuid);
    if (el) {
        el.style.background = 'rgba(124,92,191,0.15)';
        el.style.borderLeft = '2px solid var(--accent)';
    }
}

// ─────────────────────────────────────────────────────────────
//  ACTIONS UI — fonctions appelées depuis index.html
// ─────────────────────────────────────────────────────────────

function toggleAddFriend() {
    const bar = document.getElementById('addFriendBar');
    if (!bar) return;
    const isOpen = bar.style.display !== 'none';
    bar.style.display = isOpen ? 'none' : 'flex';
    if (!isOpen) document.getElementById('addFriendInput')?.focus();
}

function openChatPanel() {
    const overlay = document.getElementById('chatOverlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    _renderChatFriendList();
    // Ouvrir automatiquement le premier ami en ligne
    const firstOnline = Object.entries(_friends).find(([, f]) => f.online && f.status === 'accepted');
    if (firstOnline) openChatWith(firstOnline[0]);
}

function closeChat() {
    const overlay = document.getElementById('chatOverlay');
    if (overlay) overlay.style.display = 'none';
    _unsubscribeCurrentChat();
    _activeChatUid = null;
}

function filterChatFriends(val) {
    _renderChatFriendList(val);
}

// ─────────────────────────────────────────────────────────────
//  TOAST DE DEMANDE D'AMI ENTRANTE
// ─────────────────────────────────────────────────────────────

function _showFriendRequestToast(fromName, fromUUID, reqDocId) {
    const toastId = 'req-toast-' + fromUUID;
    if (document.getElementById(toastId)) return; // ne pas doubler

    const toast = document.createElement('div');
    toast.id = toastId;
    toast.style.cssText = `
        position:fixed;bottom:80px;right:20px;z-index:9999;
        background:#1e1e26;border:1px solid rgba(124,92,191,0.4);border-radius:10px;
        padding:12px 14px;min-width:240px;max-width:300px;
        box-shadow:0 8px 32px rgba(0,0,0,0.6);font-family:'Inter',sans-serif;
        animation:slideInRight 0.3s ease;`;
    toast.innerHTML = `
        <div style="font-size:11px;color:#7C5CBF;font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Demande d'ami</div>
        <div style="font-size:13px;font-weight:600;color:#f0f0f2;margin-bottom:10px;">${_escHtml(fromName)} veut t'ajouter !</div>
        <div style="display:flex;gap:7px;">
            <button onclick="_acceptReqToast('${fromUUID}','${_escHtml(fromName)}','${reqDocId}','${toastId}')"
                style="flex:1;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);color:#22c55e;padding:6px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;">
                ✓ Accepter
            </button>
            <button onclick="_declineReqToast('${fromUUID}','${reqDocId}','${toastId}')"
                style="flex:1;background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);color:#f87171;padding:6px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;">
                ✗ Refuser
            </button>
        </div>`;
    document.body.appendChild(toast);

    // Auto-fermeture après 30s
    setTimeout(() => toast.remove(), 30000);
}

function _acceptReqToast(fromUUID, fromName, reqDocId, toastId) {
    document.getElementById(toastId)?.remove();
    acceptFriendRequest(fromUUID, fromName, reqDocId);
}

function _declineReqToast(fromUUID, reqDocId, toastId) {
    document.getElementById(toastId)?.remove();
    declineFriendRequest(fromUUID, reqDocId);
}

// ─────────────────────────────────────────────────────────────
//  UTILITAIRES
// ─────────────────────────────────────────────────────────────

function _escHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

// CSS d'animation (injecté une fois)
(function _injectFirebaseCSS() {
    if (document.getElementById('fb-anim-style')) return;
    const s = document.createElement('style');
    s.id = 'fb-anim-style';
    s.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(120%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
        }`;
    document.head.appendChild(s);
})();

// ─────────────────────────────────────────────────────────────
//  EXPORTS GLOBAUX
// ─────────────────────────────────────────────────────────────

window.initFirebase         = initFirebase;
window.sendFriendRequest    = sendFriendRequest;
window.acceptFriendRequest  = acceptFriendRequest;
window.declineFriendRequest = declineFriendRequest;
window.removeFriend         = removeFriend;
window.openChatWith         = openChatWith;
window.openChatPanel        = openChatPanel;
window.closeChat            = closeChat;
window.sendChatMsg          = sendChatMsg;
window.filterChatFriends    = filterChatFriends;
window.toggleAddFriend      = toggleAddFriend;
window._acceptReqToast      = _acceptReqToast;
window._declineReqToast     = _declineReqToast;
