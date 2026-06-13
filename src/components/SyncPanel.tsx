import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { upsertVariants } from '../lib/catalog'
import {
  fetchWikiAnimal,
  listAnimalPages,
  diffAnimal,
  urlForEntry,
  urlForTitle,
  sleep,
  SYNC_NUM,
  SYNC_STR,
  type FieldDiff,
} from '../lib/wikiSync'
import type { AnimalEntry } from '../lib/types'
import type { WikiAnimal, WikiVariant } from '../lib/wiki'

type Phase = 'idle' | 'analyzing' | 'review' | 'applying' | 'done'

interface UpdateItem {
  id: number
  name: string
  diff: FieldDiff
  variants: WikiVariant[]
}
interface NewItem {
  title: string
  name: string
  wiki: WikiAnimal
  variants: WikiVariant[]
  selected: boolean
}

const THROTTLE_MS = 1100

export function SyncPanel({ entries, onApplied }: { entries: AnimalEntry[]; onApplied: () => Promise<void> }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [includeNew, setIncludeNew] = useState(true)
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' })
  const [updates, setUpdates] = useState<UpdateItem[]>([])
  const [news, setNews] = useState<NewItem[]>([])
  const [errors, setErrors] = useState<{ name: string; reason: string }[]>([])
  const [doneMsg, setDoneMsg] = useState('')

  const knownBiomes = useMemo(
    () => [...new Set(entries.map((e) => e.biome).filter(Boolean))] as string[],
    [entries],
  )

  async function analyze() {
    setPhase('analyzing')
    setUpdates([])
    setNews([])
    setErrors([])
    const byName = new Map(entries.map((e) => [e.name_en.toLowerCase(), e]))

    let candidates: string[] = []
    if (includeNew) {
      setProgress({ done: 0, total: 0, label: 'Liste des animaux du wiki…' })
      try {
        const titles = await listAnimalPages()
        const known = new Set<string>()
        for (const e of entries) {
          known.add(e.name_en.toLowerCase())
          if (e.wiki_title) known.add(e.wiki_title.toLowerCase())
        }
        candidates = titles.filter((t) => !known.has(t.toLowerCase()))
      } catch (e) {
        setErrors((x) => [...x, { name: 'Catégorie wiki', reason: e instanceof Error ? e.message : 'erreur' }])
      }
    }

    const total = entries.length + candidates.length
    const upd: UpdateItem[] = []
    const nw: NewItem[] = []
    const errs: { name: string; reason: string }[] = []
    let done = 0

    const handle = async (label: string, url: string, existing?: AnimalEntry) => {
      setProgress({ done, total, label })
      try {
        const { animal: w, variants } = await fetchWikiAnimal(url, knownBiomes)
        const match = existing ?? (w.name_en ? byName.get(String(w.name_en).toLowerCase()) : undefined)
        if (match) {
          const diff = diffAnimal(match, w)
          if (Object.keys(diff).length || variants.length) {
            upd.push({ id: match.id, name: match.name_en, diff, variants })
          }
        } else {
          nw.push({ title: label, name: String(w.name_en ?? label), wiki: w, variants, selected: true })
        }
      } catch (e) {
        errs.push({ name: label, reason: e instanceof Error ? e.message : 'erreur' })
      }
      done++
      await sleep(THROTTLE_MS)
    }

    for (const e of entries) await handle(e.name_en, urlForEntry(e), e)
    for (const t of candidates) await handle(t, urlForTitle(t))

    setUpdates(upd)
    setNews(nw)
    setErrors((x) => [...x, ...errs])
    setProgress({ done, total, label: '' })
    setPhase('review')
  }

  function buildInsertRow(w: WikiAnimal, title: string): Record<string, unknown> {
    const row: Record<string, unknown> = {
      name_en: w.name_en ?? title,
      variant: false,
      wiki_title: w.name_en ?? title,
      url: urlForTitle(title),
    }
    for (const f of [...SYNC_NUM, ...SYNC_STR]) if (w[f] != null) row[f] = w[f]
    return row
  }

  async function apply() {
    setPhase('applying')
    let updated = 0
    let added = 0
    try {
      for (const u of updates) {
        if (Object.keys(u.diff).length) {
          const payload: Record<string, unknown> = {}
          for (const [f, { to }] of Object.entries(u.diff)) payload[f] = to
          const { error } = await supabase.from('animals').update(payload).eq('id', u.id)
          if (error) throw error
          updated++
        }
        if (u.variants.length) await upsertVariants(u.id, u.variants)
      }
      for (const n of news.filter((x) => x.selected)) {
        const { data, error } = await supabase
          .from('animals')
          .insert(buildInsertRow(n.wiki, n.title))
          .select('id')
          .single()
        if (error) throw error
        if (n.variants.length) await upsertVariants(data.id as number, n.variants)
        added++
      }
      await onApplied()
      setDoneMsg(`${updated} animal(aux) mis à jour, ${added} ajouté(s).`)
      setPhase('done')
    } catch (e) {
      setDoneMsg('Erreur : ' + (e instanceof Error ? e.message : 'inconnue'))
      setPhase('done')
    }
  }

  const selectedNew = news.filter((n) => n.selected).length

  return (
    <div className="sync">
      <h2>Synchroniser depuis le wiki</h2>

      {phase === 'idle' && (
        <>
          <label className="admin-check">
            <input type="checkbox" checked={includeNew} onChange={(e) => setIncludeNew(e.target.checked)} />
            Chercher aussi les nouveaux animaux (énumère la catégorie du wiki)
          </label>
          <p className="muted">
            Resynchronise les {entries.length} animaux existants depuis le wiki et propose un récap avant
            d'écrire. ~1 requête/s, donc plusieurs minutes. name_fr et coat_name_fr sont préservés.
          </p>
          <button onClick={analyze}>Analyser</button>
        </>
      )}

      {phase === 'analyzing' && (
        <p className="muted">
          Analyse… {progress.done}/{progress.total} {progress.label && `· ${progress.label}`}
        </p>
      )}

      {(phase === 'review' || phase === 'applying' || phase === 'done') && (
        <>
          <p>
            <strong>{updates.length}</strong> existant(s) à modifier · <strong>{news.length}</strong> nouveau(x)
            détecté(s) ({selectedNew} sélectionné(s)) · <strong>{errors.length}</strong> erreur(s)
          </p>

          {news.length > 0 && (
            <details open>
              <summary>Nouveaux animaux (décoche le doublon renommé éventuel)</summary>
              <div className="sync-list">
                {news.map((n, i) => (
                  <label key={n.title} className="admin-check">
                    <input
                      type="checkbox"
                      checked={n.selected}
                      disabled={phase !== 'review'}
                      onChange={(e) =>
                        setNews((list) => list.map((x, j) => (j === i ? { ...x, selected: e.target.checked } : x)))
                      }
                    />
                    {n.name} <span className="muted">({n.title})</span>
                  </label>
                ))}
              </div>
            </details>
          )}

          {updates.length > 0 && (
            <details>
              <summary>Changements sur les existants</summary>
              <div className="sync-list">
                {updates.map((u) => (
                  <div key={u.id} className="sync-upd">
                    <strong>{u.name}</strong>
                    {Object.entries(u.diff).map(([f, { from, to }]) => (
                      <span key={f} className="diff">
                        {f}: {String(from ?? '∅')} → {String(to)}
                      </span>
                    ))}
                    {!Object.keys(u.diff).length && <span className="muted"> (variants seulement)</span>}
                  </div>
                ))}
              </div>
            </details>
          )}

          {errors.length > 0 && (
            <details>
              <summary>Erreurs</summary>
              <div className="sync-list">
                {errors.map((e, i) => (
                  <div key={i} className="muted">
                    {e.name} : {e.reason}
                  </div>
                ))}
              </div>
            </details>
          )}

          {phase === 'review' && (
            <button onClick={apply}>
              Appliquer ({updates.length} maj, {selectedNew} ajout{selectedNew > 1 ? 's' : ''})
            </button>
          )}
          {phase === 'applying' && <p className="muted">Écriture en cours…</p>}
          {phase === 'done' && <p className="status">{doneMsg}</p>}
        </>
      )}
    </div>
  )
}
