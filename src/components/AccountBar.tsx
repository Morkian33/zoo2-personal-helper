import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { logout } from '../lib/auth'
import { SecureAccountForm } from './SecureAccountForm'
import { LoginForm } from './LoginForm'

export function AccountBar({ session }: { session: Session | null }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'signup' | 'login'>('signup')

  const user = session?.user
  const isAnonymous = user?.is_anonymous ?? true
  const username = (user?.user_metadata?.username as string | undefined) ?? null

  if (!isAnonymous) {
    return (
      <div className="account-bar">
        <span>
          Connecté : <strong>{username ?? 'utilisateur'}</strong>
        </span>
        <button className="small" onClick={() => logout()}>
          Se déconnecter
        </button>
      </div>
    )
  }

  return (
    <div className="account-bar">
      <span className="muted">Mode anonyme — tes données sont sur ce navigateur uniquement.</span>
      <button className="small" onClick={() => setOpen((o) => !o)}>
        {open ? 'Fermer' : 'Sécuriser mon compte / Se connecter'}
      </button>

      {open && (
        <div className="account-panel">
          {mode === 'signup' ? <SecureAccountForm /> : <LoginForm />}
          <button className="link" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
            {mode === 'signup' ? 'Déjà un compte ? Se connecter' : 'Créer / sécuriser un compte'}
          </button>
        </div>
      )}
    </div>
  )
}
