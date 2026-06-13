import { useState, type FormEvent } from 'react'
import { login } from '../lib/auth'

export function LoginForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setStatus(null)
    try {
      await login(username, password)
      // onAuthStateChange (SIGNED_IN) switches the UI to the signed-in state.
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Identifiant ou mot de passe invalide')
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
          autoComplete="current-password"
        />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? '…' : 'Se connecter'}
      </button>
      {status && <p className="status error">{status}</p>}
    </form>
  )
}
