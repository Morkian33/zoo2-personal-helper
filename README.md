# zoo2-personal-helper

Companion app for **Zoo 2: Animal Park**: an animal catalog with decision metrics
(XP/hour per size, breeding & resale economics, fodder strategy…), collection
tracking with recommendations, and personal tracking (owned / level / favorites).
React + Vite + TypeScript, data and auth via Supabase.

The UI is in French; the codebase (and these docs) are in English.

## Features

- **Analyse** — sortable catalog table of decision metrics (XP/day, XP/h per adjusted
  size, optimal enclosure count & size, breeding attempts, newborn cost, resale deltas,
  feed×2 value, recommended fodder strategy). Per-column show/hide picker, favorites star
  + filter, persisted filters.
- **Mon zoo** — data entry: owned count, max level, variant coats owned, shelter levels.
  Star animals as favorites.
- **Collections** — completion tracking with a "reachable / blocked" status, a hide-done
  toggle, and recommendations of the top animals to level up / unlock to advance the most
  collections.
- **Élevage** — breeding planner valuing fodder strategies by "how much you'd pay to save
  one breeding cycle" (willingness-to-pay), accounting for the pity mechanic and the bonus
  park.
- **Events bar** — global toggles for in-game events (fodder at 10%, guaranteed
  twins/triplets, XP×2) that recompute the affected economics.
- **Admin** (admins only) — wiki sync (animals, variants, collections), per-animal editor,
  and FR-label editor (biomes, animal names, variant coats).

## Data & computations

- **Shared catalog** (readable by every account, written by admins via wiki sync / SQL):
  - `public.animals` (~480 base animals): raw game data.
  - `public.animal_variants` (~160 coats): variant coats per animal (`coat_name` +
    optional FR `coat_name_fr`, source, release date).
  - `public.collections` / `public.collection_requirements` (~71 collections): each
    requirement targets an animal or a specific variant at a required level.
  - `public.biome_labels`: EN→FR biome names.
- **Personal layer** (RLS on `auth.uid()`):
  - `public.user_animals`: `owned_count` (0 / 1 / 2+), `max_level`, `favorite`.
  - `public.user_variants`: `owned`, `max_level` per coat.
  - `public.user_shelters`: shelter level per biome.
- **Metrics recomputed in-app** from the raw data — no derived value is stored:
  - `src/lib/enclosure.ts`: enclosure optimization (tile = 16, enclosure ≥ 9 tiles,
    `size effective = T*16/N`).
  - `src/lib/breeding.ts` + `src/lib/breedingPlan.ts`: average breeding attempts
    (per-failure pity increment = `min(base, 10pts)`) and the fodder-strategy / WTP model.
  - `src/lib/metrics.ts`: the headline decision metrics, parameterised by the active
    `src/lib/events.ts` config.
  Models are verified identical to the original Google Sheet and to observed in-game data.

## Database setup (once)

In Supabase → **SQL Editor**, run in order:

1. `supabase/schema.sql` — core tables + RLS (animals, user_animals, user_variants,
   animal_variants, user_shelters, biome_labels, app_admins).
2. `supabase/migration_collections.sql` — the `collections` / `collection_requirements`
   tables (not folded into `schema.sql`).
3. `supabase/seed.sql` — catalog animals.
4. `supabase/seed_variants.sql` — variant coats (+ FR labels).

Then populate collections from the **Admin → Synchronisation** tab (wiki sync); there is
no collections seed. Variants and new animals are also kept up to date via the same admin
sync.

> The other `supabase/migration_*.sql` files (admin, shelters, variants, labels, favorite,
> extra fields, drop-variant) are the historical incremental migrations — already reflected
> in `schema.sql`. They are idempotent (`if not exists`), so re-running them is harmless,
> but a fresh DB only needs the four steps above.
>
> `seed_user_data.sql` / `seed_user_variants.sql` are personal inventory imports and are
> **not committed** (gitignored).

## Authentication model

- On arrival, an **anonymous session** is created automatically → the app is usable
  without signing up.
- A **"secure my account"** form upgrades the anonymous account to a permanent one:
  `username` + `password` + optional `email`.
- The username is the login anchor. Since Supabase requires an email for a password
  account, a stable internal email is derived (`username@users.zoo2.local`). The optional
  real email is kept in metadata (`recovery_email`) for **future password recovery**.

## Supabase prerequisites

In the Supabase project dashboard:

1. **Authentication → Sign In / Providers → Anonymous sign-ins**: enable.
2. **Authentication → Sign In / Providers → Email**: **disable "Confirm email"** (the
   upgrade uses a non-deliverable internal email that must apply without confirmation).
3. **Project Settings → API**: grab the `Project URL` and the publishable/anon key.

## Run locally

```bash
cp .env.example .env   # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

Build check (type-check + production build): `npm run build`.

## Deployment (GitHub Pages)

The `.github/workflows/deploy.yml` workflow builds and publishes to Pages on every push to `main`.

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**: add the repository variables
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the anon key is public by design,
   protected by Supabase RLS).

Published URL: `https://morkian33.github.io/zoo2-personal-helper/`
