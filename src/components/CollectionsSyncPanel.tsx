import { useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  fetchCollectionsWikitext,
  parseCollections,
  resolveCollections,
  type ResolvedCollection,
  type Unresolved,
} from '../lib/collections'
import type { AnimalEntry } from '../lib/types'

type Phase = 'idle' | 'analyzing' | 'review' | 'applying' | 'done'

const reqKey = (r: { animal_id: number; variant_id: number | null; required_level: number }) =>
  `${r.animal_id}|${r.variant_id ?? ''}|${r.required_level}`

export function CollectionsSyncPanel({
  entries,
  onApplied,
}: {
  entries: AnimalEntry[]
  onApplied: () => Promise<void>
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [newCols, setNewCols] = useState<{ name: string; count: number }[]>([])
  const [changed, setChanged] = useState<{ name: string; added: number; removed: number }[]>([])
  const [unresolved, setUnresolved] = useState<Unresolved[]>([])
  const [toApply, setToApply] = useState<ResolvedCollection[]>([])
  const [doneMsg, setDoneMsg] = useState('')

  async function analyze() {
    setPhase('analyzing')
    setNewCols([])
    setChanged([])
    setUnresolved([])
    try {
      const wt = await fetchCollectionsWikitext()
      const { collections: resolved, unresolved: unres } = resolveCollections(parseCollections(wt), entries)

      const [{ data: dbCols }, { data: dbReqs }] = await Promise.all([
        supabase.from('collections').select('id, name, sector, star'),
        supabase.from('collection_requirements').select('collection_id, animal_id, variant_id, required_level'),
      ])
      const colByName = new Map((dbCols ?? []).map((c) => [c.name as string, c]))
      const reqsByCol = new Map<number, Set<string>>()
      for (const r of dbReqs ?? []) {
        const k = reqKey({ animal_id: r.animal_id as number, variant_id: r.variant_id as number | null, required_level: r.required_level as number })
        ;(reqsByCol.get(r.collection_id as number) ?? reqsByCol.set(r.collection_id as number, new Set()).get(r.collection_id as number)!).add(k)
      }

      const nw: { name: string; count: number }[] = []
      const ch: { name: string; added: number; removed: number }[] = []
      const apply: ResolvedCollection[] = []

      for (const rc of resolved) {
        const keys = new Set(rc.requirements.map(reqKey))
        const existing = colByName.get(rc.name)
        if (!existing) {
          nw.push({ name: rc.name, count: keys.size })
          apply.push(rc)
          continue
        }
        const exKeys = reqsByCol.get(existing.id as number) ?? new Set<string>()
        const added = [...keys].filter((k) => !exKeys.has(k)).length
        const removed = [...exKeys].filter((k) => !keys.has(k)).length
        const metaChanged = (existing.sector ?? '') !== rc.sector || (existing.star ?? null) !== rc.star
        if (added || removed || metaChanged) {
          ch.push({ name: rc.name, added, removed })
          apply.push(rc)
        }
      }

      setNewCols(nw)
      setChanged(ch)
      setUnresolved(unres)
      setToApply(apply)
      setPhase('review')
    } catch (e) {
      setDoneMsg('Erreur : ' + (e instanceof Error ? e.message : 'inconnue'))
      setPhase('done')
    }
  }

  async function apply() {
    setPhase('applying')
    try {
      for (const rc of toApply) {
        const { data: col, error } = await supabase
          .from('collections')
          .upsert({ name: rc.name, sector: rc.sector, star: rc.star, sort: rc.sort }, { onConflict: 'name' })
          .select('id')
          .single()
        if (error) throw error
        const cid = col.id as number
        const del = await supabase.from('collection_requirements').delete().eq('collection_id', cid)
        if (del.error) throw del.error
        if (rc.requirements.length) {
          const ins = await supabase.from('collection_requirements').insert(
            rc.requirements.map((r) => ({
              collection_id: cid,
              animal_id: r.animal_id,
              variant_id: r.variant_id,
              required_level: r.required_level,
            })),
          )
          if (ins.error) throw ins.error
        }
      }
      await onApplied()
      setDoneMsg(`${toApply.length} collection(s) écrite(s).`)
      setPhase('done')
    } catch (e) {
      setDoneMsg('Erreur : ' + (e instanceof Error ? e.message : 'inconnue'))
      setPhase('done')
    }
  }

  return (
    <div className="sync">
      <h2>Synchroniser les collections (wiki)</h2>

      {phase === 'idle' && (
        <>
          <p className="muted">
            Importe / met à jour les collections depuis la page wiki « Collections » (parse + résolution
            vers ton catalogue). Rien n'est écrit avant validation.
          </p>
          <button onClick={analyze}>Analyser</button>
        </>
      )}
      {phase === 'analyzing' && <p className="muted">Analyse de la page Collections…</p>}

      {(phase === 'review' || phase === 'applying' || phase === 'done') && (
        <>
          <p>
            <strong>{newCols.length}</strong> nouvelle(s) · <strong>{changed.length}</strong> modifiée(s) ·{' '}
            <strong>{unresolved.length}</strong> exigence(s) non résolue(s)
          </p>

          {newCols.length > 0 && (
            <details open>
              <summary>Nouvelles collections</summary>
              <div className="sync-list">
                {newCols.map((c) => (
                  <div key={c.name}>
                    {c.name} <span className="muted">({c.count} exigences)</span>
                  </div>
                ))}
              </div>
            </details>
          )}
          {changed.length > 0 && (
            <details>
              <summary>Collections modifiées</summary>
              <div className="sync-list">
                {changed.map((c) => (
                  <div key={c.name}>
                    {c.name} <span className="diff">+{c.added} / -{c.removed}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
          {unresolved.length > 0 && (
            <details>
              <summary>Exigences non résolues (ignorées)</summary>
              <div className="sync-list">
                {unresolved.map((u, i) => (
                  <div key={i} className="muted">
                    [{u.collection}] {u.target}
                    {u.coat ? ` (${u.coat})` : ''}
                  </div>
                ))}
              </div>
            </details>
          )}

          {phase === 'review' &&
            (toApply.length ? (
              <button onClick={apply}>Appliquer ({toApply.length})</button>
            ) : (
              <p className="status">Rien à appliquer — déjà à jour.</p>
            ))}
          {phase === 'applying' && <p className="muted">Écriture…</p>}
          {phase === 'done' && <p className="status">{doneMsg}</p>}
        </>
      )}
    </div>
  )
}
