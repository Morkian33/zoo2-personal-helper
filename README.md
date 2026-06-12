# zoo2-personal-helper

Petite app web (React + Vite + TypeScript) avec authentification Supabase.

## Modèle d'authentification

- À l'arrivée, une **session anonyme** est créée automatiquement → l'app est utilisable sans inscription.
- Un formulaire **« Sécuriser mon compte »** convertit ce compte anonyme en compte permanent : `identifiant` + `mot de passe` + `email` (optionnel).
- L'identifiant est l'ancrage du login. Supabase exigeant un email pour un compte mot de passe, on dérive un email interne stable (`identifiant@users.zoo2.local`). L'email réel optionnel est conservé en metadata (`recovery_email`) pour la **récupération de mot de passe à terme**.

## Prérequis Supabase

Dans le dashboard du projet Supabase :

1. **Authentication → Sign In / Providers → Anonymous sign-ins** : activer.
2. **Authentication → Sign In / Providers → Email** : **désactiver « Confirm email »** (l'upgrade utilise un email interne non délivrable, qui doit s'appliquer sans confirmation).
3. **Project Settings → API** : récupérer `Project URL` et `anon public key`.

## Lancer en local

```bash
cp .env.example .env   # renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## Déploiement (GitHub Pages)

Le workflow `.github/workflows/deploy.yml` build et publie sur Pages à chaque push sur `main`.

1. **Settings → Pages → Build and deployment → Source : GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables** : ajouter les *repository variables*
   `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (l'anon key est publique par design, protégée par la RLS Supabase).

URL publiée : `https://morkian33.github.io/zoo2-personal-helper/`
