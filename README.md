# TraceFood DZ  (v0.2)
Plateforme de traçabilité alimentaire, gestion qualité et prévention des risques — filière laitière, Algérie.

| Partie | État |
|---|---|
| `server/` Express + TypeScript + Prisma/MySQL (≈ 140 routes), moteur de traçabilité bidirectionnelle testé | ✅ livré |
| `client/` React + Vite + TypeScript + Tailwind : 7 espaces (fabricant, qualité, fournisseur, transport, point de vente/distribution, Super admin, consommateur + page QR publique), FR/AR (RTL), thème clair/sombre | ✅ livré — **jamais affiché dans un navigateur par l'auteur** (voir `docs/STATUS.md`) |
| `android/` | ❌ non réalisé |

**Démarrage Windows (CMD)** : voir [`README_WINDOWS.md`](README_WINDOWS.md) · **État honnête et limites** : [`docs/STATUS.md`](docs/STATUS.md) · API : [`docs/API.md`](docs/API.md), [`docs/ROUTES.txt`](docs/ROUTES.txt) · Base : [`docs/ER.md`](docs/ER.md)

```bat
npm install
copy server\.env.example server\.env
npm run setup        :: première installation uniquement (crée tables + données de démo)
npm run dev          :: API http://localhost:4000 + interface http://localhost:5173
npm test             :: 22 tests de logique
```
Production (principes) : MySQL géré + sauvegardes ; `NODE_ENV=production` (le seed refuse de s'exécuter) ; `JWT_SECRET` fort ; HTTPS derrière un reverse-proxy ; `CLIENT_ORIGIN` restreint ; `npm run build` puis servir `client/dist` (avec proxy `/api` vers l'API) ; dossier `uploads` hors racine web et sauvegardé ; migrations versionnées ; e-mails à brancher ; jeton en cookie HttpOnly recommandé.
