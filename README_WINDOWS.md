# TraceFood DZ v0.2 — Guide Windows (CMD) : backend + interface web React

> **Cette version ajoute l'interface web complète** (`client/`). Le backend reste le vôtre : **la base de données `tracefood_dz` n'est ni recréée ni modifiée** (le schéma Prisma est identique à la v0.1).
> **Honnêteté sur la vérification** : l'auteur n'a pas de réseau dans son environnement ; il a donc pu vérifier la compilation du code et la logique (voir `docs/STATUS.md`), mais **n'a pas pu lancer `npm install`, `vite build` ni ouvrir l'interface dans un navigateur**. Si une commande échoue, copiez le message complet : il sera corrigé. L'application Android n'est **pas** livrée.

Toutes les commandes ci-dessous sont à taper dans **Invite de commandes (cmd.exe)**. Remplacez `C:\projets` par votre dossier.

---

## A. Mise à jour depuis votre installation v0.1 (sans toucher à la base)

1. **Arrêtez** l'ancien serveur : dans son terminal, `Ctrl + C`. Laissez **MySQL (XAMPP) démarré**.
2. Dézippez `tracefood-dz.zip` dans un **nouveau dossier** : `C:\projets\tracefood-dz-v2` (le dossier contient `client`, `server`, `docs`, `scripts`…).
3. Ouvrez cmd et reprenez vos réglages et vos documents déjà téléversés :
```bat
copy C:\projets\tracefood-dz\server\.env C:\projets\tracefood-dz-v2\server\.env
xcopy /E /I /Y C:\projets\tracefood-dz\server\uploads C:\projets\tracefood-dz-v2\server\uploads
```
4. Installez les dépendances (backend **et** frontend) et générez le client Prisma (opération locale, **n'écrit rien dans MySQL**) :
```bat
cd C:\projets\tracefood-dz-v2
npm install
npm run db:generate -w server
```
5. ⚠️ **Ne lancez PAS** `npm run setup`, `npm run db:reset -w server` ni `db:push` : ils servent à une première installation. Vos données restent telles quelles.
6. Démarrez **API + interface** ensemble :
```bat
npm run dev
```
Vous devez voir dans la console `[api] ✅ TraceFood DZ API listening on http://localhost:4000` puis `[web] Local: http://localhost:5173/`.
7. Ouvrez **Chrome** : **http://localhost:5173**

### Première installation (si vous n'aviez pas la v0.1)
Suivez la section 1–5 de l'ancien guide (Node.js LTS, XAMPP/MySQL, création de la base `tracefood_dz` avec `CREATE DATABASE tracefood_dz CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`), puis :
```bat
cd C:\projets\tracefood-dz-v2
npm install
copy server\.env.example server\.env
notepad server\.env
npm run setup
npm run dev
```
(`JWT_SECRET` : générez-le avec `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.)

---

## B. Comptes de démonstration
Mot de passe de tous : valeur de `SEED_DEMO_PASSWORD` (par défaut `Demo@12345`). En mode développement, la page de connexion affiche des boutons « Comptes de démonstration » qui remplissent le formulaire.

| Compte | Espace affiché |
|---|---|
| `admin@tracefood.dz` | Super administrateur (sociétés, utilisateurs, certifications, offres, audit) |
| `admin@laiterie.demo` | Administrateur fabricant (production + qualité : peut libérer/bloquer) |
| `qualite@laiterie.demo` | Responsable qualité (libérer/bloquer, incidents, simulation de rappel, risques) |
| `operateur@laiterie.demo` | Production (réception, lots, expéditions ; **ne peut pas libérer un lot**) |
| `fournisseur@baraka.demo` | Fournisseur (offres, demandes, messages) |
| `transport@froid.demo` | Transporteur (enlèvement, relevés de température, livraison) |
| `distribution@alger.demo` | Distributeur (stock, expéditions, réception) |
| `magasin@elamel.demo` | Point de vente (réception, stock FEFO, ventes, promotions, recherche de lot) |
| `consommateur@demo.dz` | Consommateur (profil, avis/signalements) |
| `attente@nouvelle.demo` | Société **en attente** : montre l'écran « Compte en attente d'approbation » |

---

## C. Scénario de démonstration « yaourt » dans l'interface (≈ 10 min)

1. **Consommateur (sans compte)** : ouvrez http://localhost:5173 → collez l'identifiant QR d'un lot (voir étape 3) → page publique : fabricant, dates, magasins, promotion, formulaire d'avis.
2. **Fabricant** `operateur@laiterie.demo` → *Réceptions* → *Nouvelle réception* : fournisseur « Ferme El Baraka », matière « Lait cru », 200 L → les lots sont **En attente**.
3. Ouvrez *Lots finis → Nouveau lot fini* : le lot reçu **n'est pas proposé** (seuls les lots libérés le sont) ; et même par l'API, le serveur refuse un lot non libéré (`LOT_NOT_RELEASED`).
4. **Qualité** `qualite@laiterie.demo` → *Lots matières* → ouvrir le lot → *Nouveau contrôle* : température 11 → décision « Libéré » → **refusé** (hors limites configurées) ; température 4,5 → **Libéré**. *(Les limites de la démo sont marquées « démo — à valider ».)*
5. **Production** → *Lots finis → Nouveau lot fini* : choisissez le lot libéré, quantités, étapes → lot créé **En attente** → **Qualité** : *Nouveau contrôle* → Libéré → le **stock** et le **QR code** sont créés. Onglet du lot : *Imprimer l'étiquette* / *PNG* / *SVG*.
6. **Expédition** : *Expéditions → Nouvelle* (usine → « El Amel — Hydra »), quantité ≤ stock → le stock est **réservé** → *Expédier*.
7. **Transporteur** `transport@froid.demo` : ouvrir l'expédition (si le transporteur choisi est « Froid Express ») → *Relevé température* → *Confirmer la livraison*.
8. **Magasin** `magasin@elamel.demo` → ouvrir l'expédition → *Réceptionner* (indiquez reçus / endommagés) → le stock apparaît dans *Stock* (ordre FEFO).
9. **Qualité** → *Non-conformités → Nouvelle* sur le lot de lait (ou *Traçabilité* → rechercher `MP-DEMO-001` → *Ouvrir une non-conformité*) → *Lancer la simulation* : lots finis, expéditions, sites, quantités, **graphe interactif** (cliquez un nœud).
10. *Blocage préventif* (action réelle, confirmation + motif) → les lots passent **Bloqués**, la page QR publique affiche « en cours de vérification », les magasins reçoivent une notification. *Rapport* → *Imprimer*.
11. **Super admin** → *Journal d'audit* : toutes ces actions sont tracées.

---

## D. Commandes utiles (cmd)
| But | Commande |
|---|---|
| Lancer API + interface | `npm run dev` |
| Lancer seulement l'API | `npm run dev:server` |
| Lancer seulement l'interface | `npm run dev:client` |
| Tests logique (22) | `npm test` |
| Scénario e2e complet (MySQL requis, **modifie des données**) | `npm run test:e2e` |
| Vérifier les types de l'interface | `npm run typecheck` |
| Version de production de l'interface | `npm run build` puis `npm run preview -w client` |
| Contrôle « chaque appel du client existe côté serveur » *(Python requis, optionnel)* | `npm run check:contract` |
| Regénérer les traductions *(Python requis, optionnel)* | `npm run i18n` |
| Arrêter | `Ctrl + C` dans le terminal |

### Tester depuis un téléphone (même Wi-Fi)
1. `ipconfig` → notez l'adresse IPv4 (ex. `192.168.1.20`).
2. Dans `server\.env` : `PUBLIC_BASE_URL="http://192.168.1.20:5173"` et `CLIENT_ORIGIN="http://localhost:5173,http://192.168.1.20:5173"` ; relancez `npm run dev`.
3. Autorisez Node.js dans le pare-feu Windows (ports 5173 et 4000).
4. Sur le téléphone : `http://192.168.1.20:5173`. Les QR codes imprimés contiendront cette adresse.
5. L'application photo du téléphone ouvre directement le lien d'un QR. Le **scan intégré à la page** utilise la caméra : il exige **HTTPS ou localhost** et le navigateur doit connaître `BarcodeDetector` (Chrome Android). Sur PC Windows, saisissez l'identifiant.

---

## E. Dépannage
| Symptôme | Solution |
|---|---|
| `'vite' n'est pas reconnu` / `concurrently` introuvable | `npm install` n'a pas abouti : relancez-le à la racine du projet (pas dans `client`). |
| Page blanche | `F12` → onglet Console : copiez l'erreur. Vérifiez aussi que l'API tourne (`http://localhost:4000/api/health`). |
| `http proxy error … ECONNREFUSED 127.0.0.1:4000` | L'API n'est pas démarrée/plantée : regardez les lignes `[api]` ; MySQL (XAMPP) doit être démarré. |
| Connexion : « Serveur injoignable » | Même cause. |
| `EADDRINUSE :5173` ou `:4000` | Un ancien `npm run dev` tourne encore : fermez-le (`taskkill /F /IM node.exe` ferme **tous** les processus Node). |
| `P1001 Can't reach database` | Démarrez MySQL dans XAMPP. |
| `Unknown argument … Prisma` lors du démarrage | `npm run db:generate -w server` (client Prisma périmé). |
| Une page affiche « Accès non autorisé » | Normal : le rôle du compte n'a pas la permission (vérifiée par le serveur). Testez avec le bon compte. |
| 403 `COMPANY_NOT_ACTIVE` | La société du compte n'est pas approuvée : connectez-vous en Super admin → *Sociétés* → *Approuver*. |
| Interface en arabe mal alignée | Dites quel écran : la mise en page RTL n'a pas été vérifiée visuellement par l'auteur. |
| Je veux repartir de zéro | `npm run db:reset -w server` puis `npm run db:seed -w server` (⚠️ **efface** les données). |
