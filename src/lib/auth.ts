import { supabase } from './supabase'
import { getCaptchaToken } from './captcha'

// The username chosen by the user is the login anchor. Supabase requires an email
// for a password account, so we derive a stable internal email from it. The optional
// real email is kept separately, for future password recovery.
const INTERNAL_EMAIL_DOMAIN = 'users.zoo2.local'

export function usernameToEmail(username: string): string {
  const slug = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-')
  return `${slug}@${INTERNAL_EMAIL_DOMAIN}`
}

// Ensures a session exists: creates an anonymous user if there is none.
export async function ensureAnonymousSession(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session) return

  const captchaToken = await getCaptchaToken()
  const { error } = await supabase.auth.signInAnonymously({ options: { captchaToken } })
  if (error) throw error
}

// Upgrades the current (anonymous) user to a permanent account (username + password).
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

// Signs in an existing user with their username + password.
export async function login(username: string, password: string): Promise<void> {
  const captchaToken = await getCaptchaToken()
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
    options: { captchaToken },
  })
  if (error) throw error
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut()
}
