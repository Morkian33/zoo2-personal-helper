import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { ensureAnonymousSession } from './lib/auth'
import { AccountBar } from './components/AccountBar'
import { CatalogView } from './components/CatalogView'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))

    ensureAnonymousSession()
      .catch((e) => console.error('Anonymous sign-in failed', e))
      .finally(() => setReady(true))

    return () => subscription.unsubscribe()
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>zoo2 · personal helper</h1>
        <AccountBar session={session} />
      </header>

      <main>
        {ready ? (
          <CatalogView userId={session?.user?.id ?? null} />
        ) : (
          <p className="muted">Initialisation…</p>
        )}
      </main>
    </div>
  )
}
