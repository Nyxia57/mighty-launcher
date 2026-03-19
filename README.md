# ZenithMC Launcher

Launcher Minecraft moderne — plus besoin de créer une app Azure !

---

## Lancement

```bash
npm install
npm start
```

C'est tout. Clique "Continuer avec Microsoft" dans le launcher.

---

## Comment ça marche

ZenithMC utilise le **Client ID officiel de l'app Minecraft** (`00000000402b5328`),
exactement comme Prism Launcher, MultiMC, PolyMC et tous les grands launchers tiers.

Aucune app Azure à créer, aucun client secret, aucune permission à configurer.
La connexion s'ouvre directement sur login.live.com et intercepte le redirect
dans la fenêtre Electron.

---

## Flux d'auth

```
Clic "Microsoft"
  → fenêtre login.live.com  (Client ID Minecraft officiel)
  → redirect oauth20_desktop.srf?code=...  (intercepté par Electron)
  → login.live.com/oauth20_token.srf       →  access_token MS
  → user.auth.xboxlive.com                 →  token Xbox Live
  → xsts.auth.xboxlive.com                 →  token XSTS
  → api.minecraftservices.com/login_with_xbox  →  token Minecraft
  → api.minecraftservices.com/minecraft/profile  →  username + UUID ✅
```

---

## Builder

```bash
npm run build -- --win    # Windows .exe
npm run build -- --mac    # macOS .dmg
npm run build -- --linux  # Linux .AppImage
```

---

*ZenithMC v1.0.0*
