# zoo2-personal-helper

Companion app for **Zoo 2: Animal Park**: an animal catalog with decision metrics
(XP/hour per size, breeding and resale economics…) and personal tracking
(owned / breeding unlocked). React + Vite + TypeScript, data and auth via Supabase.

The UI is in French; the codebase is in English.

## Data & computations

- **Shared catalog** (`public.animals`, ~478 base animals): raw game data, readable by
  every account, written via the SQL Editor (admin). Variants not included yet.
- **Personal layer** (`public.user_animals`): `owned` / `breeding_unlocked` per account
  (RLS on `auth.uid()`).
- **Metrics recomputed in-app** from the raw data — no derived value is stored:
  - `src/lib/enclosure.ts`: enclosure optimization (tile = 16, enclosure ≥ 9 tiles,
    `size effective = T*16/N`).
  - `src/lib/breeding.ts`: average number of attempts (failure increment = `min(base, 10pts)`).
  Both models are verified identical to the original Google Sheet.

## Database setup (once)

In Supabase → **SQL Editor**, run in order:
1. `supabase/schema.sql` — creates the `animals` / `user_animals` tables + RLS.
2. `supabase/seed.sql` — imports the catalog (~478 animals).

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

## Deployment (GitHub Pages)

The `.github/workflows/deploy.yml` workflow builds and publishes to Pages on every push to `main`.

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**: add the repository variables
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the anon key is public by design,
   protected by Supabase RLS).

Published URL: `https://morkian33.github.io/zoo2-personal-helper/`
