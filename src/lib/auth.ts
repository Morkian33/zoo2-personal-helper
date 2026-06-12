import { supabase } from './supabase'

// L'identifiant choisi par l'utilisateur est l'ancrage du login. Supabase exige
// un email pour un compte mot de passe, donc on en dérive un email interne stable.
// L'email réel (optionnel) est conservé à part, pour la récupération « à terme ».
const INTERNAL_EMAIL_DOMAIN = 'users.zoo2.local'

export function usernameToEmail(username: string): string {
  const slug = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-')
  return `${slug}@${INTERNAL_EMAIL_DOMAIN}`
}

/** Garantit une session : crée un utilisateur anonyme si aucune session active. */
export async function ensureAnonymousSession(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session) return

  const { error } = await supabase.auth.signInAnonymously()
  if (error) throw error
}

/** Convertit l'utilisateur anonyme courant en compte permanent (identifiant + mot de passe). */
export async function secureAccount(opts: {
  username: string
  password: string
  recoveryEmail?: string
}): Promise<void> {
  const { error } = await supabase.auth.updateUser({
    email: usernameToEmail(opts.username),
    password: opts.password,
    data: {
      username: opts.username.trim(),
      recovery_email: opts.recoveryEmail?.trim() || null,
    },
  })
  if (error) throw error
}

/** Connexion d'un utilisateur existant via son identifiant + mot de passe. */
export async function login(username: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  })
  if (error) throw error
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut()
}
