# État d'avancement — v0.2 (honnête)

Légende : ✅ vérifié par exécution/analyse dans l'environnement de l'auteur · 🟡 écrit, **non exécuté** (à valider sur votre PC) · ❌ non réalisé

## Phases
| Phase | Contenu | État |
|---|---|---|
| 1–7 | Backend (auth, RBAC, isolation, réception, qualité, production, stocks, expéditions, incidents, rappel, QR, marché, documents) | 🟡 (v0.1 : vous l'avez démarré ; les routes n'ont pas toutes été exercées) · moteur de traçabilité + permissions ✅ **22/22 tests** |
| 7bis | **Ajouts backend v0.2** (aucun changement de schéma) : profil société, membres, certifications (+ vérification Super admin), annuaire des sociétés, supervision des offres, profil/historique consommateur, avis liés au compte, rapport de production, ids supplémentaires dans `/inventory`, résultats qualité dans `/batches/:id` | 🟡 |
| **8** | **Interface web React** (≈ 4028 lignes TS/TSX réparties en 31 fichiers ; lignes longues) : 7 espaces, FR/AR + RTL, thème clair/sombre, responsive | voir ci-dessous |
| 9 | Page publique QR (consommateur) + génération/téléchargement/impression des QR | 🟡 |
| 10 | Application Android (Expo) | ❌ **non réalisée** |
| 11 | Tests | ✅ 22 tests logique · 🟡 e2e `server/tests/e2e.test.ts` écrit, jamais exécuté (MySQL requis) · ❌ aucun test automatisé de l'interface |

## Interface web — ce qui a été vérifié
| Contrôle | Résultat |
|---|---|
| Compilation de **tout** le client avec esbuild (≈ 4028 lignes, 31 fichiers, JSX/TSX) | ✅ 0 erreur ; tous les imports/exports locaux se résolvent |
| Vérification de types (strict) avec bibliothèques tierces simulées | ✅ 0 erreur dans le code propre (6 messages restants = artefacts des simulations) |
| **Contrat client ↔ serveur** (`npm run check:contract`) : chaque appel API du client (méthode + chemin) existe côté Express | ✅ 121 appels distincts, **0 sans route** ; 131/140 routes utilisées par l'UI |
| Traductions (`npm run i18n`) : toute clé utilisée est définie en FR et en AR ; variables `{{x}}` identiques | ✅ 647 clés statiques, 0 manquante, 0 divergence |
| Aucun texte de langue dans les composants (tout passe par `t('clé')`) | ✅ |
| Rendu du **graphe de traçabilité** avec la sortie réelle du moteur (fixture yaourt) | ✅ 11 nœuds/14 liens (aval), 4/4 (amont) rendus |
| Tests unitaires (traçabilité 15 + permissions/qualité 7) | ✅ 22/22 |

## Non vérifié (à faire sur votre PC)
`npm install`, `vite build` (avec les vraies bibliothèques), **affichage réel dans Chrome**, tous les écrans en conditions réelles (les écrans n'ont jamais été affichés), les nouveaux endpoints backend v0.2, le scénario e2e, la mise en page arabe/RTL (écrite avec des propriétés logiques `ms-/me-/ps-/pe-/start-/end-` mais **jamais vue**), l'accessibilité clavier/lecteur d'écran (attributs ARIA présents, non testés), les performances.

## Fonctionnalités non terminées ou limitées (liste exhaustive connue)
1. **Application Android** : absente.
2. **Migrations SQL versionnées** : `prisma db push` est utilisé ; à créer avant un déploiement réel (`npm run db:migrate:dev -w server`).
3. **Alertes planifiées** (péremption, etc.) : pas de tâche de fond ; les alertes de péremption sont calculées à l'affichage (stock, tableaux de bord). Les notifications sont créées sur événements (blocage, incident transport, écart de température, écart de réception, demande fournisseur, signalement consommateur…).
4. **Réinitialisation du mot de passe par e-mail** : pas de fournisseur d'e-mail ; en local le jeton s'affiche dans la console du serveur ; l'interface propose la saisie du jeton.
5. **Gestion des utilisateurs d'une société** (ajout/retrait de collaborateurs, changement de rôle) : l'API n'a pas d'endpoint ; l'équipe est en lecture seule dans *Profil société*. Les nouveaux comptes passent par l'inscription d'entreprise.
6. **Pièces jointes d'une non-conformité** : l'API les supporte, l'interface ne propose le téléversement que pour lots matières, contrôles qualité et offres fournisseurs.
7. **Scan QR par caméra** : dépend de `BarcodeDetector` (Chrome Android) et d'un contexte sécurisé ; sinon saisie de l'identifiant ou appareil photo du téléphone.
8. **Reçus/lots reçus (distributeur, magasin)** : vue limitée volontairement (pas de données fournisseur/matières) ; pas de graphe pour ces rôles.
9. **Rapports** : l'impression passe par l'impression du navigateur (« Enregistrer en PDF ») ; pas d'export Excel/PDF généré côté serveur.
10. **Édition** : pas d'écran d'édition des recettes ni de changement de statut des ordres de fabrication ; pas de suppression (volontaire, traçabilité).
11. **Stockage du jeton de connexion** : `localStorage` (choix de simplicité locale ; un cookie `HttpOnly` + CSRF serait préférable en production).
12. **Pas de pagination côté serveur** pour : transporteurs/recettes/risques/notifications/réclamations/promotions (listes limitées en pratique).
13. **Test e2e** et **tests d'interface** : voir ci-dessus.

## Décisions d'ingénierie (rappel)
Aucun seuil réglementaire codé en dur (limites qualité configurables, valeurs de démo marquées « démo — à valider », validation par un rôle qualifié) · libération/blocage réservés à `quality:release` (testé) · Super admin sans accès aux données métier ni aux comptes consommateurs (testé) · stocks par SQL atomique gardé · simulation de rappel ≠ blocage (le blocage exige confirmation + motif + permissions) · page QR publique en liste blanche · autorisation **toujours décidée par le serveur** (l'interface masque seulement ce qui n'est pas permis).
