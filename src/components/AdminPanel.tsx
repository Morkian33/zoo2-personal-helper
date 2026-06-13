import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { AnimalEntry } from '../lib/types'

type FieldType = 'text' | 'number' | 'date' | 'bool'
interface Field {
  key: string
  label: string
  type: FieldType
  percent?: boolean // stored as a fraction, edited as a percentage
}

// Raw catalog fields (computed metrics are never stored, so not editable here).
const FIELDS: Field[] = [
  { key: 'name_en', label: 'Nom EN *', type: 'text' },
  { key: 'name_fr', label: 'Nom FR', type: 'text' },
  { key: 'biome', label: 'Biome', type: 'text' },
  { key: 'shelter_lvl', label: 'Shelter lvl', type: 'number' },
  { key: 'variant', label: 'Variant', type: 'bool' },
  { key: 'price_value', label: 'Prix', type: 'number' },
  { key: 'price_unit', label: 'Devise (Coins/Diamonds)', type: 'text' },
  { key: 'size', label: 'Taille', type: 'number' },
  { key: 'breed_proba', label: 'Proba élevage (%)', type: 'number', percent: true },
  { key: 'breed_cost', label: 'Coût élevage', type: 'number' },
  { key: 'breed_duration', label: 'Durée élevage (ex. 12h)', type: 'text' },
  { key: 'xp_feeding_value', label: 'XP nourrissage', type: 'number' },
  { key: 'xp_feeding_time', label: 'Temps nourrissage (ex. 14h 20m)', type: 'text' },
  { key: 'xp_playing_value', label: 'XP jeu', type: 'number' },
  { key: 'xp_playing_time', label: 'Temps jeu', type: 'text' },
  { key: 'xp_cleaning_value', label: 'XP nettoyage', type: 'number' },
  { key: 'xp_cleaning_time', label: 'Temps nettoyage', type: 'text' },
  { key: 'max_animal_per_enclosure', label: 'Max / enclos', type: 'number' },
  { key: 'popularity', label: 'Popularité', type: 'number' },
  { key: 'base_selling_price', label: 'Prix de vente', type: 'number' },
  { key: 'feed_x2_cost', label: 'Coût feed x2 (pièces)', type: 'number' },
  { key: 'release_date', label: 'Date de sortie', type: 'date' },
  { key: 'wiki_title', label: 'Titre wiki', type: 'text' },
  { key: 'url', label: 'URL wiki', type: 'text' },
]

type FormState = Record<string, string | boolean>

function emptyForm(): FormState {
  const f: FormState = {}
  for (const fl of FIELDS) f[fl.key] = fl.type === 'bool' ? false : ''
  return f
}

function entryToForm(e: AnimalEntry): FormState {
  const f: FormState = {}
  const raw = e as unknown as Record<string, unknown>
  for (const fl of FIELDS) {
    const v = raw[fl.key]
    if (fl.type === 'bool') f[fl.key] = Boolean(v)
    else if (v == null) f[fl.key] = ''
    else if (fl.percent) f[fl.key] = String(+(Number(v) * 100).toFixed(4))
    else f[fl.key] = String(v)
  }
  return f
}

export function AdminPanel({
  entries,
  onSaved,
}: {
  entries: AnimalEntry[]
  onSaved: () => void
}) {
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const matches = search.trim()
    ? entries
        .filter((e) =>
          `${e.name_fr ?? ''} ${e.name_en}`.toLowerCase().includes(search.trim().toLowerCase()),
        )
        .slice(0, 12)
    : []

  function loadEntry(e: AnimalEntry) {
    setEditingId(e.id)
    setForm(entryToForm(e))
    setStatus(null)
    setSearch('')
  }

  function newAnimal() {
    setEditingId(null)
    setForm(emptyForm())
    setStatus(null)
  }

  async function save(ev: FormEvent) {
    ev.preventDefault()
    setBusy(true)
    setStatus(null)

    const payload: Record<string, unknown> = {}
    for (const fl of FIELDS) {
      const raw = form[fl.key]
      if (fl.type === 'bool') payload[fl.key] = Boolean(raw)
      else if (raw === '') payload[fl.key] = null
      else if (fl.percent) payload[fl.key] = Number(raw) / 100
      else if (fl.type === 'number') payload[fl.key] = Number(raw)
      else payload[fl.key] = raw
    }
    if (!payload.name_en) {
      setStatus('Le nom EN est requis')
      setBusy(false)
      return
    }

    try {
      const res = editingId
        ? await supabase.from('animals').update(payload).eq('id', editingId)
        : await supabase.from('animals').insert(payload)
      if (res.error) throw res.error
      setStatus('Enregistré ✔')
      onSaved()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin">
      <div className="admin-search">
        <input
          type="search"
          placeholder="Chercher un animal à modifier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="small" onClick={newAnimal}>
          + Nouvel animal
        </button>
        {matches.length > 0 && (
          <ul className="admin-matches">
            {matches.map((e) => (
              <li key={e.id}>
                <button className="link" onClick={() => loadEntry(e)}>
                  {e.name_fr ?? e.name_en} <span className="muted">({e.name_en})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={save}>
        <p className="muted">{editingId ? `Édition : ${form.name_en as string}` : 'Nouvel animal'}</p>
        <div className="admin-form">
          {FIELDS.map((fl) =>
            fl.type === 'bool' ? (
              <label key={fl.key} className="admin-check">
                <input
                  type="checkbox"
                  checked={Boolean(form[fl.key])}
                  onChange={(e) => setForm((f) => ({ ...f, [fl.key]: e.target.checked }))}
                />
                {fl.label}
              </label>
            ) : (
              <label key={fl.key}>
                {fl.label}
                <input
                  type={fl.type === 'number' ? 'number' : fl.type === 'date' ? 'date' : 'text'}
                  step="any"
                  value={form[fl.key] as string}
                  onChange={(e) => setForm((f) => ({ ...f, [fl.key]: e.target.value }))}
                />
              </label>
            ),
          )}
        </div>
        <div className="admin-actions">
          <button type="submit" disabled={busy}>
            {busy ? '…' : editingId ? 'Mettre à jour' : 'Créer'}
          </button>
          {status && <span className="status">{status}</span>}
        </div>
      </form>
    </div>
  )
}
