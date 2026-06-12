import { useState, type FormEvent } from 'react'
import { secureAccount } from '../lib/auth'

export function SecureAccountForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setStatus(null)
    try {
      await secureAccount({ username, password, recoveryEmail: email || undefined })
      // onAuthStateChange (USER_UPDATED) bascule l'UI vers l'état connecté.
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <label>
        Identifiant
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          minLength={3}
          autoComplete="username"
        />
      </label>
      <label>
        Mot de passe
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
      </label>
      <label>
        Email <span className="muted">(optionnel — récupération future)</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? '…' : 'Sécuriser mon compte'}
      </button>
      {status && <p className="status error">{status}</p>}
    </form>
  )
}
