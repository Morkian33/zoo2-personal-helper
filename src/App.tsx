import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { ensureAnonymousSession, logout } from './lib/auth'
import { SecureAccountForm } from './components/SecureAccountForm'
import { LoginForm } from './components/LoginForm'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<'signup' | 'login'>('signup')

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))

    ensureAnonymousSession()
      .catch((e) => console.error('Échec de la session anonyme', e))
      .finally(() => setReady(true))

    return () => subscription.unsubscribe()
  }, [])

  if (!ready) {
    return (
      <main className="card">
        <p>Chargement…</p>
      </main>
    )
  }

  const user = session?.user
  const isAnonymous = user?.is_anonymous ?? true
  const username = (user?.user_metadata?.username as string | undefined) ?? null

  return (
    <main className="card">
      <h1>zoo2 · personal helper</h1>

      {isAnonymous ? (
        <>
          <p className="muted">
            Tu navigues en mode anonyme. Sécurise ton compte pour le retrouver plus tard.
          </p>

          {mode === 'signup' ? <SecureAccountForm /> : <LoginForm />}

          <button className="link" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
            {mode === 'signup'
              ? 'Déjà un compte ? Se connecter'
              : 'Créer / sécuriser un compte'}
          </button>
        </>
      ) : (
        <>
          <p>
            Connecté en tant que <strong>{username ?? 'utilisateur'}</strong>.
          </p>
          <button onClick={() => logout()}>Se déconnecter</button>
        </>
      )}
    </main>
  )
}
