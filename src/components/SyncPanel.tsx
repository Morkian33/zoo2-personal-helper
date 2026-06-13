import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { upsertVariants } from '../lib/catalog'
import {
  fetchWikiBatch,
  listAnimalPages,
  diffAnimal,
  urlForTitle,
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

export function SyncPanel({ entries, onApplied }: { entries: AnimalEntry[]; onApplied: () => Promise<void> }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [mode, setMode] = useState<'insert' | 'update' | 'both'>('both')
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' })
  const [updates, setUpdates] = useState<UpdateItem[]>([])
  const [news, setNews] = useState<NewItem[]>([])
  const [errors, setErrors] = useState<{ name: string; reason: string }[]>([])
  const [doneMsg, setDoneMsg] = useState('')
  const [copyMsg, setCopyMsg] = useState('')

  function reportText(): string {
    const lines: string[] = [
      `Sync — ${updates.length} maj · ${news.length} nouveaux · ${errors.length} erreurs`,
      '',
    ]
    if (news.length) {
      lines.push('## Nouveaux')
      for (const n of news) lines.push(`- ${n.name} (${n.title})`)
      lines.push('')
    }
    if (updates.length) {
      lines.push('## Changements')
      for (const u of updates) {
        lines.push(u.name)
        const fields = Object.entries(u.diff)
        if (!fields.length) lines.push('  (variants seulement)')
        for (const [f, { from, to }] of fields) lines.push(`  ${f}: ${from ?? '∅'} → ${to}`)
      }
      lines.push('')
    }
    if (errors.length) {
      lines.push('## Erreurs')
      for (const e of errors) lines.push(`- ${e.name} : ${e.reason}`)
    }
    return lines.join('\n')
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(reportText())
      setCopyMsg('Copié ✔')
    } catch {
      setCopyMsg('Échec de la copie')
    }
  }

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
    const doExisting = mode !== 'insert'
    const doNew = mode !== 'update'

    let candidates: string[] = []
    if (doNew) {
      setProgress({ done: 0, total: 0, label: 'Liste des animaux du wiki…' })
      try {
        const titles = await listAnimalPages()
        const known = new Set<string>()
        for (const e of entries) {
          known.add(e.name_en.toLowerCase())
          if (e.wiki_title) known.add(e.wiki_title.toLowerCase())
        }
        candidates = titles
          .filter((t) => !known.has(t.toLowerCase()))
          // Drop non-animal meta pages from the category (templates, list pages…).
          .filter((t) => !/template/i.test(t) && t !== 'Animals')
      } catch (e) {
        setErrors((x) => [...x, { name: 'Catégorie wiki', reason: e instanceof Error ? e.message : 'erreur' }])
      }
    }

    const existingTitles = doExisting ? entries.map((e) => e.wiki_title ?? e.name_en) : []
    const existingSet = new Set(existingTitles.map((t) => t.toLowerCase()))
    const titles = [...existingTitles, ...candidates]
    const total = titles.length

    setProgress({ done: 0, total, label: 'Téléchargement par lots de 50…' })
    const items = await fetchWikiBatch(titles, knownBiomes, (d) =>
      setProgress({ done: d, total, label: '' }),
    )

    const upd: UpdateItem[] = []
    const nw: NewItem[] = []
    const errs: { name: string; reason: string }[] = []

    for (const it of items) {
      if (it.error || !it.result) {
        // Errors only matter for existing animals; meta/candidate pages are skipped.
        if (existingSet.has(it.title.toLowerCase())) errs.push({ name: it.title, reason: it.error ?? 'vide' })
        continue
      }
      const { animal: w, variants } = it.result
      const match = w.name_en ? byName.get(String(w.name_en).toLowerCase()) : undefined
      if (match) {
        if (mode !== 'insert') {
          const diff = diffAnimal(match, w)
          if (Object.keys(diff).length || variants.length) {
            upd.push({ id: match.id, name: match.name_en, diff, variants })
          }
        }
      } else if (mode !== 'update') {
        const nm = String(w.name_en ?? '').trim()
        if (nm && nm !== '??') nw.push({ title: it.title, name: nm, wiki: w, variants, selected: true })
      }
    }

    setUpdates(upd)
    setNews(nw)
    setErrors((x) => [...x, ...errs])
    setProgress({ done: total, total, label: '' })
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
          <label>
            Mode
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="both">Ajouter + mettre à jour</option>
              <option value="insert">Ajouter les nouveaux seulement</option>
              <option value="update">Mettre à jour les existants seulement</option>
            </select>
          </label>
          <p className="muted">
            {mode === 'insert'
              ? 'Énumère le wiki et ne télécharge que les pages absentes de ta base — idéal après une release.'
              : mode === 'update'
                ? `Retélécharge les ${entries.length} animaux existants pour les mettre à jour.`
                : `Les deux : ${entries.length} existants + les nouveaux du wiki.`}{' '}
            Récupération par lots de 50 pages (quelques secondes). Rien n'est écrit avant validation.
            name_fr / coat_name_fr préservés.
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
          <p>
            <button className="small" onClick={copyReport}>
              Copier le rapport
            </button>
            {copyMsg && <span className="muted"> {copyMsg}</span>}
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
