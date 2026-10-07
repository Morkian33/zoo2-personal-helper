# Synchronisation avec le jeu et étude de l'argent

Point d'étape pour reprendre le travail dans une nouvelle session : ce qui est en place, pourquoi, ce qu'on a appris des données du jeu, et la suite.
Dernière mise à jour : 7 octobre 2026.

---

## Pourquoi

Le joueur trouve le jeu chronophage, surtout à cause de la **collecte des pièces** : il faut revenir presque toutes les heures pour ne rien perdre. L'XP, elle, se gère en une fois par jour, et vient surtout du parc forêt plein de chauves-souris.

Décisions prises :

- **Pas d'automatisation des actions de jeu** (collecte, nourrissage…) : risque de ban (CGU upjers), et les requêtes portent un champ `hash` signé. Tout ce qu'on construit est **en lecture seule** vis-à-vis du jeu.
- À la place :
  1. **Synchroniser** le helper avec le vrai état du jeu, au lieu d'une saisie manuelle impossible à maintenir. C'est fait.
  2. **Comprendre comment l'argent se remplit**, pour revenir au bon moment plutôt que chaque heure, et savoir quelles améliorations espacent le plus les connexions. C'est en cours.

---

## 1. Import depuis le jeu (en place)

### Fonctionnement

- Le jeu est en Unity WebGL. Il parle au serveur en JSON-RPC : `POST https://zoo2app.upjers.com/jsonrpc.php`. Les corps sont souvent binaires (Blob / ArrayBuffer).
- **Userscript** `public/zoo2-helper-bridge.user.js` (servi par Pages, installé dans **Violentmonkey** sous Brave, `@inject-into page`). Il enveloppe XHR/fetch, lit les réponses sans rien modifier et affiche un petit panneau en bas à gauche du jeu :
  - **Envoyer au helper** : ouvre le helper avec `?from=game` et lui passe le JSON par `postMessage`. L'origine est vérifiée des deux côtés (`src/lib/gameBridge.ts`).
  - **Copier** : copie le JSON.
  - **Exporter relevés** : fichier de l'étude de l'argent (voir § 2).
  - **Exporter tout (debug)** : toutes les requêtes JSON-RPC de la session. La réponse `loginAction`, qui contient le jeton de session, est masquée.
- **Helper**, onglet « Mon zoo », bouton « Importer depuis le jeu » (`src/components/GameImportPanel.tsx`, `src/lib/gameImport.ts`). Il montre un aperçu des différences, puis « Appliquer » écrit en lot dans `user_animals` / `user_variants`.

### Données utilisées

| Source | Contenu |
|---|---|
| `park.getAllParksOfUser` → `result.parks[]` | 11 parcs (principal, zoo 2, terrarium, aquarium, jungle, savane, glace, océan, nocturne, volière, rehab) ; `animals[]` : `animal_id`, `variant_id`, `level`, `is_rehab`, `is_healed`, `is_shiny`, `adult_time` |
| `user.getUser` → `result.warehouse[]` | **Inventaire** (animaux non placés) : `product_id` = `product_<id espèce ou pelage>`, `count`, `info.level`. Les lignes `*_part` sont des **fragments** d'animal (collection), pas des animaux. Le reste de `getUser` (e-mail, etc.) n'est jamais conservé. |

Règles de l'import :

- Animaux en soins (`is_rehab && !is_healed`) ignorés.
- `owned_count` plafonné à 2 (« 2+ »). Le niveau max d'une espèce couvre tous ses pelages.
- **Additif par défaut** : l'import ne fait qu'ajouter ou monter (possédés, niveaux, pelages). Les retraits passent par une case à cocher.
- Correspondance des identifiants : d'abord `animals.game_id` / `animal_variants.game_id` (données dans `supabase/migration_game_ids.sql`, déjà appliquées en base), puis un repli par ensemble de mots (synonymes : afrikan, enchidna, ozelot, racoon, peccarie, armadilo, sengis, grey→gray, drapple→dapple). Un identifiant de l'inventaire est essayé comme espèce, puis comme pelage.
- Pièges connus :
  - `animal_jackal_striped` = Black-Backed Jackal (renommé dans le wiki).
  - `animal_manta` = Giant Oceanic Manta Ray (et non Reef).
  - Choix heuristiques à revérifier un jour : giraffe, ostrich, pig_bush, kangaroo_tree, fox_red_cross.

Statut : utilisé avec succès le 7 octobre 2026. Toutes les espèces du compte sont reconnues.

---

## 2. Étude de l'argent (en cours : collecte des données)

### Ce qu'on sait ou suppose

- L'argent des guichets et des boutiques **s'accumule hors connexion**, jusqu'à un plafond (le joueur le confirme).
- Impression du joueur, aussi mentionnée sur le wiki anglais : ça se remplit **moins vite dans le parc où l'on est connecté**.
- Impression du joueur : quand certaines boutiques sont pleines, **les autres se remplissent plus vite**. Si c'est vrai, inutile de revenir avant que toutes les boutiques d'un parc soient pleines.
- Indices dans les données :
  - Chaque parc a un `purchase_info.purchase_types[]` (drink / ice / snack / souvenir) : une réserve d'achats partagée, par exemple 100 / 12 / 12 / 100 dans le parc principal et environ 1000 par type dans le zoo 2. Probablement la demande des visiteurs, répartie entre les boutiques du type. Ça collerait avec l'effet « boutique pleine ».
  - `last_sim_update` par parc : le serveur rattrape probablement la simulation au chargement.
  - Guichet : `ticket_office_info.money` / `max_money` (ex. 806 / 4500 dans le parc principal, niveau 5).
  - Boutiques : `store_info.money` / `money_cap`, plus `upgrade_stage` et `connected_to_entrance`.

### Collecte (userscript 1.2.0, déployé le 7 octobre 2026)

- À chaque chargement du jeu dans le navigateur, un **relevé** est ajouté dans le `localStorage` de la page du jeu (clé `zoo2-helper-money-snapshots`, 400 relevés au plus). Chaque relevé contient, par parc : guichet et boutiques (argent, plafond, niveau, reliée à l'entrée), `purchase_info`, `last_sim_update`, `pending_waste` et le nombre d'animaux.
- Entre deux chargements, les **actions du jeu** sont notées (clé `zoo2-helper-money-events`, 1500 au plus) : méthode, requête et réponse tronquées à 800 caractères, champs `hash` masqués. Ça sert à dater les collectes.
- Le joueur exporte **une seule fois à la fin** avec « Exporter relevés ». Le fichier `zoo2-releves-argent-….json` est à déposer dans `captures d'ecran - exemple/`, dossier ignoré par git.
- Conditions : toujours Brave, même profil, données du site non effacées. Viser au moins 20 à 30 relevés, idéalement juste avant et juste après une collecte. Exporter vers 10 jours si on veut une étude plus longue.
- **App mobile** : le joueur joue d'habitude sur mobile (app boguée en ce moment). Les sessions mobiles sont invisibles pour le script mais se repèrent : `last_sim_update` avance sans relevé navigateur, ou l'argent baisse sans action notée. On écartera ces intervalles.

### Prochaines étapes

1. **Attendre l'export** du joueur, prévu quelques jours après le 7 octobre 2026.
2. **Analyser** :
   - Vitesse de remplissage hors ligne par guichet ou boutique : pièces par heure, selon le type, le niveau, le parc et le nombre d'animaux.
   - Rôle de `purchase_info` : la réserve se vide-t-elle pendant que les boutiques se remplissent ? Que devient-elle quand une boutique est pleine ?
   - Effet « boutique pleine » sur les autres boutiques du même type.
   - Différence entre parc connecté et parc hors ligne.
   - Lire les actions notées pour identifier la méthode de collecte (probablement dans `executeBatch`).
3. Si des règles se dégagent, les consigner dans `GAME_MECHANICS.md`, puis ajouter au helper :
   - **« Quand revenir »** : l'heure à laquelle la première caisse sera pleine, éventuellement ajoutée à Google Agenda.
   - Le classement des **améliorations** (plafond des guichets et boutiques) qui espacent le plus les connexions.

---

## Notes opérationnelles

- **Base** : `npx supabase db query --linked "…"`. Depuis un worktree, ajouter `--workdir /home/paulin/morkian33-worktree/zoo2-personal-helper` (le lien Supabase est dans le dépôt principal). Ajouter `-o csv` pour une sortie compacte.
- **Déploiement** : chaque merge sur `main` déclenche `.github/workflows/deploy.yml` (Pages, environ 1 min). Le script est servi à `https://morkian33.github.io/zoo2-personal-helper/zoo2-helper-bridge.user.js`. Violentmonkey le met à jour via « Rechercher des mises à jour ».
- **Pas de lanceur de tests** : `npm run build` = `tsc --noEmit && vite build`. Le userscript a été testé dans Node avec XHR, DOM et localStorage simulés (script jetable, non versionné).
- **Sécurité** :
  - Ne jamais versionner de HAR ni d'export du jeu. Ils contiennent l'e-mail, et pour certains le jeton de session.
  - `.gitignore` couvre `*.har`, `captures d'ecran*/` et `zoo2-jsonrpc-*.json`.
  - Supprimer les fichiers d'export après analyse.
- **Historique des PR** :
  - #11 : import.
  - #12 : userscript.
  - #13, #14 : correctifs de capture.
  - #16 : import additif et export de debug.
  - #17 : inventaire.
  - #18 : relevés d'argent.
