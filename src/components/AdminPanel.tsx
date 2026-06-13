import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { fetchWikiAnimal, type WikiVariant } from '../lib/wiki'
import { upsertVariants } from '../lib/catalog'
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

// Converts a DB-shaped value into the form representation for a given field.
function toFormValue(fl: Field, v: unknown): string | boolean {
  if (fl.type === 'bool') return Boolean(v)
  if (v == null) return ''
  if (fl.percent) return String(+(Number(v) * 100).toFixed(4))
  return String(v)
}

function entryToForm(e: AnimalEntry): FormState {
  const f: FormState = {}
  const raw = e as unknown as Record<string, unknown>
  for (const fl of FIELDS) f[fl.key] = toFormValue(fl, raw[fl.key])
  return f
}

export function AdminPanel({
  entries,
  onSaved,
  editRequest,
}: {
  entries: AnimalEntry[]
  onSaved: () => void
  // External request to load a given animal (e.g. from the FR-labels tab). The
  // nonce lets the same animal be re-requested.
  editRequest?: { id: number; nonce: number } | null
}) {
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [wikiBusy, setWikiBusy] = useState(false)
  // Per-field old→new changes from the last wiki pre-fill.
  const [diffs, setDiffs] = useState<Record<string, { from: string; to: string }>>({})
  // Variants found by the last wiki pre-fill, persisted on save.
  const [scrapedVariants, setScrapedVariants] = useState<WikiVariant[]>([])

  const knownBiomes = useMemo(
    () => [...new Set(entries.map((e) => e.biome).filter(Boolean))] as string[],
    [entries],
  )

  // Load the animal requested from another tab.
  useEffect(() => {
    if (!editRequest) return
    const e = entries.find((x) => x.id === editRequest.id)
    if (e) loadEntry(e)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest])

  async function fromWiki() {
    const url = String(form.url ?? '').trim()
    if (!url) {
      setStatus("Renseigne d'abord l'URL wiki")
      return
    }
    setWikiBusy(true)
    setStatus(null)
    try {
      const { animal: data, variants } = await fetchWikiAnimal(url, knownBiomes)
      setScrapedVariants(variants)
      // Rebase on the matching animal's current DB state (avoids mixing with a
      // previously edited animal), then apply the wiki values on top.
      const nameEn = data.name_en ? String(data.name_en).toLowerCase() : null
      const match = nameEn ? entries.find((e) => e.name_en.toLowerCase() === nameEn) : undefined
      const base: FormState = match ? entryToForm(match) : emptyForm()
      base.url = url

      const changed: Record<string, { from: string; to: string }> = {}
      const next: FormState = { ...base }
      for (const fl of FIELDS) {
        if (!(fl.key in data)) continue
        const nv = toFormValue(fl, (data as Record<string, unknown>)[fl.key])
        if (String(base[fl.key] ?? '') !== String(nv)) {
          changed[fl.key] = { from: String(base[fl.key] ?? ''), to: String(nv) }
        }
        next[fl.key] = nv
      }

      setEditingId(match ? match.id : null)
      setForm(next)
      setDiffs(changed)
      const vSuffix = variants.length ? ` · ${variants.length} variant(s)` : ''
      setStatus(
        match
          ? `Animal : ${match.name_en} — ${Object.keys(changed).length} champ(s) modifié(s)${vSuffix}. Vérifie puis enregistre.`
          : `Animal absent du catalogue → création${vSuffix}. Vérifie puis enregistre.`,
      )
    } catch (err) {
      setStatus('Wiki : ' + (err instanceof Error ? err.message : 'erreur'))
    } finally {
      setWikiBusy(false)
    }
  }

  const editingVariants =
    editingId != null ? (entries.find((e) => e.id === editingId)?.variants ?? []) : []

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
    setDiffs({})
    setScrapedVariants([])
    setSearch('')
  }

  function newAnimal() {
    setEditingId(null)
    setForm(emptyForm())
    setStatus(null)
    setDiffs({})
    setScrapedVariants([])
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
      let animalId = editingId
      if (editingId) {
        const { error } = await supabase.from('animals').update(payload).eq('id', editingId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('animals').insert(payload).select('id').single()
        if (error) throw error
        animalId = data.id as number
      }
      if (animalId != null && scrapedVariants.length > 0) {
        await upsertVariants(animalId, scrapedVariants)
      }
      setStatus(
        `Enregistré ✔${scrapedVariants.length ? ` (+${scrapedVariants.length} variants)` : ''}`,
      )
      setDiffs({})
      setScrapedVariants([])
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
        <div className="wiki-bar">
          <button type="button" className="small" onClick={fromWiki} disabled={wikiBusy}>
            {wikiBusy ? '…' : '⟳ Pré-remplir depuis le wiki'}
          </button>
          <span className="muted">
            Remplis l'URL wiki puis clique. Tout est récupéré sauf le nom FR. Vérifie avant
            d'enregistrer.
          </span>
        </div>
        {editingId != null && (
          <div className="variant-list">
            <span className="muted">
              Coats ({editingVariants.length})
              {scrapedVariants.length > 0 && ` · ${scrapedVariants.length} trouvés au wiki`} :
            </span>
            {editingVariants.length > 0 ? (
              <span>
                {editingVariants
                  .map((v) => (v.coat_name_fr ? `${v.coat_name} (${v.coat_name_fr})` : v.coat_name))
                  .join(', ')}
              </span>
            ) : (
              <span className="muted">aucun</span>
            )}
          </div>
        )}
        <div className="admin-form">
          {FIELDS.map((fl) => {
            const diff = diffs[fl.key]
            return fl.type === 'bool' ? (
              <label key={fl.key} className={`admin-check${diff ? ' changed' : ''}`}>
                <input
                  type="checkbox"
                  checked={Boolean(form[fl.key])}
                  onChange={(e) => setForm((f) => ({ ...f, [fl.key]: e.target.checked }))}
                />
                {fl.label}
                {diff && (
                  <span className="diff">
                    {diff.from || '∅'} → {diff.to || '∅'}
                  </span>
                )}
              </label>
            ) : (
              <label key={fl.key} className={diff ? 'changed' : undefined}>
                {fl.label}
                <input
                  type={fl.type === 'number' ? 'number' : fl.type === 'date' ? 'date' : 'text'}
                  step="any"
                  value={form[fl.key] as string}
                  onChange={(e) => setForm((f) => ({ ...f, [fl.key]: e.target.value }))}
                />
                {diff && (
                  <span className="diff">
                    {diff.from || '∅'} → {diff.to || '∅'}
                  </span>
                )}
              </label>
            )
          })}
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
