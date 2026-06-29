# Zoo 2 : Animal Park — Mécanismes du jeu

Ce fichier documente les règles du jeu telles qu'elles sont comprises et implémentées dans le helper. À mettre à jour dès qu'un mécanisme est clarifié ou corrigé.

---

## Élevage (Breeding)

### Prérequis

- Deux animaux de la **même espèce** (le variant est indifférent).
- Un **abri du bon biome** dont le niveau est ≥ `shelter_lvl` de l'espèce.
- Un **emplacement d'élevage** libre (nombre limité).

### Coût et durée

- Lancer un élevage coûte `breed_cost` pièces et dure `breed_duration` (dépendent de l'espèce).
- Après un succès ou un échec, les parents **et l'emplacement d'élevage** ont un repos de **8h** avant de pouvoir refaire un élevage (`COOLDOWN_HOURS = 8`).
  → En pratique, on relance presque toujours le même couple : il n'y a pas d'intérêt à utiliser l'emplacement pour un autre animal sauf si on veut délibérément élever une autre espèce.

### Probabilité de succès

- Chaque espèce a une probabilité de base `breed_proba` (ex : 4 % → 0.04).
- **Système de pitié** : en cas d'échec, la tentative suivante gagne un bonus de
  `increment = min(breed_proba, 0.10)`.
  Formule : `p_k = min(breed_proba + increment × (k−1), 1)` (k = numéro de la tentative).
- **Bonus de parc** : certains emplacements d'élevage accordent `+floor(breed_proba × 100 / 2) / 100`
  (≈ +50 % de la proba de base, tronqué au point de %) quand on élève un animal du biome correspondant.
  Biomes concernés : Forest, Ice, Plains, Savanna, Jungle, Water.
- **Fourrage pièces** : payer `breed_cost` pièces supplémentaires ajoute `+breed_proba` à la tentative.
- **Fourrage pub** : regarder une pub ajoute `+breed_proba` à la tentative (cumulable avec le fourrage pièces).

### Résultat en cas de succès — niveau du nouveau-né

```
niveau_naissance = floor((niveau_parent_A + niveau_parent_B) / 2) + 1
```

- Le **niveau maximum** d'un animal est **20**.
- Cas rare : un animal **scintillant** peut naître au niveau 40.
  Un parent de niveau 40 produit toujours des enfants de niveau 20, peu importe l'autre parent.
  Formule complète : `min(floor((min(A, 40) + min(B, 40)) / 2) + 1, 20)`

### Ordre de validation des élevages parallèles

Quand plusieurs élevages de la **même espèce** sont en cours simultanément et que plusieurs résultats sont prêts en même temps :

- Le résultat (succès / échec) est **tiré au sort au moment de la validation**, pas au lancement.
- Le compteur de pitié est **global par espèce** : partagé entre tous les élevages en cours de la même espèce (pas cross-espèce).
  - Succès → probabilité retombe à `breed_proba` (base).
  - Échec → probabilité augmente de `increment = min(breed_proba, 0.10)`.

**Seuil d'inversion** : valeur de la probabilité actuelle à partir de laquelle il vaut mieux valider les paires de haut niveau en premier.

```
seuil = racine positive de : p² − p × (breed_proba − inc) − inc = 0
      = [(breed_proba − inc) + √((breed_proba − inc)² + 4 × inc)] / 2
```

Cas simplifié (breed_proba ≤ 10%, donc inc = breed_proba) : `seuil = √breed_proba`
Exemple bats (4 %) : seuil = 20 %

**Règle** :
- `p_actuelle ≥ seuil` → valider d'abord les paires de **haut niveau** (bonne proba pour avoir l'offspring le plus haut)
- `p_actuelle < seuil` → valider d'abord les paires de **bas niveau** (laisser les bas niveaux échouer pour accumuler la pitié, puis l'utiliser sur les hauts niveaux)

### Événements temporaires (EventConfig)

| Événement | Effet |
|-----------|-------|
| `fodder10` | Le fourrage coûte 10 % du prix d'élevage au lieu de 100 % |
| `births` = 2 (jumeaux) | Chaque succès donne 2 nouveau-nés au lieu de 1 |
| `births` = 3 (triplés) | Chaque succès donne 3 nouveau-nés |
| `xp2` | Toutes les actions XP rapportent ×2 |

---

## Enclos

- 1 tuile = carré 4×4 = 16 unités de taille.
- Taille minimale : 9 tuiles, extensible tuile par tuile.
- Pour N animaux de taille `size` : `tiles = max(9, ceil(N × size / 16))`.
- "Taille effective" = `tiles × 16 / N` (espace réel par animal, gaspillage inclus).
- On cherche le N (≤ `max_animal_per_enclosure`) qui **minimise** la taille effective.

---

## Niveaux et XP

- Chaque action (nourrissage, jeu, nettoyage) rapporte des points XP selon la fiche de l'espèce.
- Le bonus `xp2` (event global) double tous les gains XP (nourrissage, jeu, nettoyage).
- Le **feed x2** (payant, `feed_x2_cost`) est distinct de l'event `xp2` : il ne double que l'XP d'**un nourrissage** et ne s'applique pas au jeu ni au nettoyage.
- Formule XP/h : `xp_value / parse_hours(xp_time)`.

---

## Prix et économie

- Acheter un animal coûte `price_value` pièces (si `price_unit` = 'Coins').
- Prix de revente d'un niveau 1 : `base_selling_price`.
- Prix de revente d'un niveau 20 : `base_selling_price × 1.95`.
- Delta économique d'élevage = `price_value − coût_moyen_naissance`.
