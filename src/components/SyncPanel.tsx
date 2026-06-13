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
  // 'create' = insert, 'skip' = ignore, number = link to an existing animal id (rename).
  action: 'create' | 'skip' | number
}

export function SyncPanel({ entries, onApplied }: { entries: AnimalEntry[]; onApplied: () => Promise<void> }) {
  const [phase, setPhase] = useState<Phase>('idle')
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
  const existingOptions = useMemo(
    () =>
      entries
        .map((e) => ({ id: e.id, label: e.name_fr ?? e.name_en }))
        .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
    [entries],
  )

  async function analyze() {
    setPhase('analyzing')
    setUpdates([])
    setNews([])
    setErrors([])
    // Match by the requested title (our row) first, then by the wiki's title1.
    const entryByTitle = new Map<string, AnimalEntry>()
    for (const e of entries) {
      entryByTitle.set(e.name_en.toLowerCase(), e)
      if (e.wiki_title) entryByTitle.set(e.wiki_title.toLowerCase(), e)
    }
    let candidates: string[] = []
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

    const existingTitles = entries.map((e) => e.wiki_title ?? e.name_en)
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
      const match =
        entryByTitle.get(it.requested.toLowerCase()) ??
        (it.result?.animal.name_en
          ? entryByTitle.get(String(it.result.animal.name_en).toLowerCase())
          : undefined)
      if (it.error || !it.result) {
        // Errors only matter for our catalog rows; meta/candidate pages are skipped.
        if (match) errs.push({ name: it.requested, reason: it.error ?? 'vide' })
        continue
      }
      const { animal: w, variants } = it.result
      if (match) {
        const diff = diffAnimal(match, w)
        // Only the variants whose source/date actually changed (or are new coats),
        // so re-syncing doesn't re-list every variant-bearing animal forever.
        const changedVariants = variants.filter((v) => {
          const ex = match.variants.find((x) => x.coat_name === v.coat_name)
          return (
            !ex ||
            (ex.obtained_from ?? '') !== (v.obtained_from ?? '') ||
            (ex.release_date ?? '') !== (v.release_date ?? '')
          )
        })
        if (Object.keys(diff).length || changedVariants.length) {
          upd.push({ id: match.id, name: match.name_en, diff, variants: changedVariants })
        }
      } else {
        const nm = String(w.name_en ?? '').trim()
        if (nm && nm !== '??') nw.push({ title: it.requested, name: nm, wiki: w, variants, action: 'create' })
      }
    }

    setUpdates(upd)
    setNews(nw)
    setErrors((x) => [...x, ...errs])
    setProgress({ done: total, total, label: '' })
    setPhase('review')
  }

  // Wiki-sourced fields for an animal row: identity (name_en, wiki_title, url) + stats.
  function wikiRow(w: WikiAnimal, title: string): Record<string, unknown> {
    const row: Record<string, unknown> = {
      name_en: w.name_en ?? title,
      wiki_title: title,
      url: urlForTitle(title),
    }
    for (const f of [...SYNC_NUM, ...SYNC_STR]) if (w[f] != null) row[f] = w[f]
    return row
  }

  async function apply() {
    setPhase('applying')
    let updated = 0
    let added = 0
    let renamed = 0
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
      for (const n of news) {
        if (n.action === 'skip') continue
        if (n.action === 'create') {
          const { data, error } = await supabase
            .from('animals')
            .insert(wikiRow(n.wiki, n.title))
            .select('id')
            .single()
          if (error) throw error
          if (n.variants.length) await upsertVariants(data.id as number, n.variants)
          added++
        } else {
          // Rename: update the linked existing row's name/url/fields, keeping its id.
          const id = n.action
          const { error } = await supabase.from('animals').update(wikiRow(n.wiki, n.title)).eq('id', id)
          if (error) throw error
          if (n.variants.length) await upsertVariants(id, n.variants)
          renamed++
        }
      }
      await onApplied()
      setDoneMsg(`${updated} mis à jour · ${added} ajouté(s) · ${renamed} renommé(s).`)
      setPhase('done')
    } catch (e) {
      setDoneMsg('Erreur : ' + (e instanceof Error ? e.message : 'inconnue'))
      setPhase('done')
    }
  }

  const selectedNew = news.filter((n) => n.action !== 'skip').length

  return (
    <div className="sync">
      <h2>Synchroniser depuis le wiki</h2>

      {phase === 'idle' && (
        <>
          <p className="muted">
            Met à jour les {entries.length} animaux existants depuis le wiki et détecte les nouveaux.
            Récupération par lots de 50 pages (quelques secondes). Rien n'est écrit avant validation ;
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
                  <div key={n.title} className="sync-new">
                    <select
                      value={typeof n.action === 'number' ? String(n.action) : n.action}
                      disabled={phase !== 'review'}
                      onChange={(e) => {
                        const v = e.target.value
                        const action: 'create' | 'skip' | number =
                          v === 'create' || v === 'skip' ? v : Number(v)
                        setNews((list) => list.map((x, j) => (j === i ? { ...x, action } : x)))
                      }}
                    >
                      <option value="create">➕ Créer : {n.name}</option>
                      <option value="skip">Ignorer</option>
                      <optgroup label="Lier à un existant (rename)">
                        {existingOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <span className="muted">({n.title})</span>
                  </div>
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
