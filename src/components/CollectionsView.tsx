import { useEffect, useMemo, useState } from 'react'
import { canBreed, hasBreedingShelter } from '../lib/catalog'
import { norm } from '../lib/format'
import type { AnimalEntry, ShelterLevels } from '../lib/types'
import type { CollectionRow, CollectionRequirementRow } from '../lib/collections'

type Filter = 'all' | 'reachable'
type Status = 'complete' | 'reachable' | 'blocked'

// One recommended action toward completing collections.
interface Rec {
  key: string
  label: string
  your: number | null
  need: number
  cols: number // how many collections this advances
  completes: number // how many it would outright complete
  score: number
  owned: boolean
}

const HIDE_DONE_KEY = 'zoo2.collections.hideDone'

// Short "why recommended" note: how many collections this advances/completes.
function recoWhy(r: Rec): string {
  const cols = `${r.cols} collection${r.cols > 1 ? 's' : ''}`
  return r.completes > 0 ? `${cols} (en complète ${r.completes})` : cols
}

export function CollectionsView({
  entries,
  shelters,
  collections,
  requirements,
  editable,
  onLevelInput,
  onLevelCommit,
}: {
  entries: AnimalEntry[]
  shelters: ShelterLevels
  collections: CollectionRow[]
  requirements: CollectionRequirementRow[]
  editable: boolean
  onLevelInput: (kind: 'animal' | 'variant', id: number, level: number | null) => void
  onLevelCommit: (kind: 'animal' | 'variant', id: number) => void
}) {
  const [sector, setSector] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [hideComplete, setHideComplete] = useState(() => localStorage.getItem(HIDE_DONE_KEY) === '1')
  useEffect(() => localStorage.setItem(HIDE_DONE_KEY, hideComplete ? '1' : '0'), [hideComplete])

  const { animalById, variantMax, reqsByCol } = useMemo(() => {
    const animalById = new Map(entries.map((e) => [e.id, e]))
    const variantMax = new Map<number, { label: string; max: number | null; owned: boolean }>()
    for (const e of entries) {
      const base = e.name_fr ?? e.name_en
      for (const v of e.variants) {
        variantMax.set(v.id, {
          label: `${base} (${v.coat_name_fr ?? v.coat_name})`,
          max: v.max_level,
          owned: v.owned,
        })
      }
    }
    const reqsByCol = new Map<number, CollectionRequirementRow[]>()
    for (const r of requirements) {
      const list = reqsByCol.get(r.collection_id) ?? []
      list.push(r)
      reqsByCol.set(r.collection_id, list)
    }
    return { animalById, variantMax, reqsByCol }
  }, [entries, requirements])

  // For a requirement: your level, whether it's met, and whether the species is
  // breedable (so you can raise/produce it — needed to level up, per the game).
  function reqInfo(r: CollectionRequirementRow): {
    label: string
    your: number | null
    met: boolean
    breedable: boolean
    obtainable: boolean
  } {
    const a = animalById.get(r.animal_id)
    if (r.variant_id != null) {
      const v = variantMax.get(r.variant_id)
      const your = v?.max ?? null
      const met = your != null && your >= r.required_level
      // A variant you don't own can't be produced by breeding the base species —
      // it must be obtained first (event/quest). Only count it as workable once
      // you own it (then you can breed it up to the required level).
      const obtainable = !!v?.owned
      const breedable = obtainable && (a ? hasBreedingShelter(a, shelters) : false)
      return { label: v?.label ?? '(variant ?)', your, met, breedable, obtainable }
    }
    const breedable = a ? canBreed(a, shelters) : false
    const your = a?.max_level ?? null
    return {
      label: a ? (a.name_fr ?? a.name_en) : '(animal ?)',
      your,
      met: your != null && your >= r.required_level,
      breedable,
      obtainable: !!a && a.owned_count > 0,
    }
  }

  // Recommendations: rank the animals/coats whose progress unlocks the most
  // collection advancement. Each unmet requirement contributes 1/missing to its
  // target, so the last missing piece of a collection weighs a full point and
  // items needed by several near-complete collections rise to the top.
  const { levelUp, unlock } = useMemo(() => {
    const acc = new Map<string, Rec>()
    for (const c of collections) {
      const reqs = reqsByCol.get(c.id) ?? []
      const unmet = reqs.filter((r) => !reqInfo(r).met)
      const missing = unmet.length
      if (missing === 0) continue
      const w = 1 / missing
      for (const r of unmet) {
        const info = reqInfo(r)
        const key = r.variant_id != null ? `v${r.variant_id}` : `a${r.animal_id}`
        let e = acc.get(key)
        if (!e) {
          e = {
            key,
            label: info.label,
            your: info.your,
            need: r.required_level,
            cols: 0,
            completes: 0,
            score: 0,
            owned: info.obtainable,
          }
          acc.set(key, e)
        }
        e.cols++
        e.need = Math.max(e.need, r.required_level)
        if (missing === 1) e.completes++
        e.score += w
      }
    }
    const cmp = (a: Rec, b: Rec) =>
      b.score - a.score || b.completes - a.completes || b.cols - a.cols
    const arr = [...acc.values()]
    return {
      levelUp: arr.filter((e) => e.owned).sort(cmp).slice(0, 5),
      unlock: arr.filter((e) => !e.owned).sort(cmp).slice(0, 5),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collections, reqsByCol, animalById, variantMax])

  const sectors = useMemo(
    () => [...new Set(collections.map((c) => c.sector).filter(Boolean))] as string[],
    [collections],
  )

  // Scored collections (sector/search applied) — counts are derived from this,
  // independent of the complete/reachable visibility toggles.
  const scored = useMemo(() => {
    const q = norm(search.trim())
    return collections
      .filter((c) => (!sector || c.sector === sector) && (!q || norm(c.name).includes(q)))
      .map((c) => {
        const reqs = reqsByCol.get(c.id) ?? []
        let met = 0
        let workable = 0 // met, or breedable so you can finish it yourself
        for (const r of reqs) {
          const info = reqInfo(r)
          if (info.met) met++
          if (info.met || info.breedable) workable++
        }
        const status: Status =
          reqs.length > 0 && met === reqs.length
            ? 'complete'
            : reqs.length > 0 && workable === reqs.length
              ? 'reachable'
              : 'blocked'
        return { col: c, reqs, met, total: reqs.length, status }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collections, reqsByCol, sector, search, animalById, variantMax, shelters])

  const rows = scored.filter((x) => {
    if (hideComplete && x.status === 'complete') return false
    if (filter === 'reachable') return x.status === 'reachable'
    return true
  })

  const completeCount = scored.filter((r) => r.status === 'complete').length
  const reachableCount = scored.filter((r) => r.status === 'reachable').length

  if (collections.length === 0) {
    return (
      <p className="muted">
        Aucune collection en base. Lance « Synchroniser les collections » dans l'Admin.
      </p>
    )
  }

  return (
    <div className="collections">
      <div className="filters">
        <input
          type="search"
          placeholder="Rechercher une collection…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={sector} onChange={(e) => setSector(e.target.value)}>
          <option value="">Tous les secteurs</option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="all">Toutes</option>
          <option value="reachable">À ta portée (tout élevable)</option>
        </select>
        <button
          className={`fav-toggle small ${hideComplete ? 'active' : ''}`}
          onClick={() => setHideComplete((v) => !v)}
          title="Masquer les collections terminées"
        >
          ✓ Masquer les terminées
        </button>
        <span className="count">
          {completeCount} complètes · {reachableCount} à ta portée
        </span>
      </div>

      {(levelUp.length > 0 || unlock.length > 0) && (
        <details className="reco" open>
          <summary>Recommandations pour avancer les collections</summary>
          <div className="reco-grid">
            <div className="reco-card">
              <h3>⬆ Faire monter de niveau</h3>
              {levelUp.length === 0 ? (
                <p className="muted">Rien à monter pour l'instant.</p>
              ) : (
                <ol>
                  {levelUp.map((r) => (
                    <li key={r.key}>
                      <span className="reco-name">{r.label}</span>
                      <span className="muted">
                        {' '}
                        niv. {r.your ?? 0} → {r.need} · {recoWhy(r)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="reco-card">
              <h3>🔓 Débloquer en priorité</h3>
              {unlock.length === 0 ? (
                <p className="muted">Rien à débloquer.</p>
              ) : (
                <ol>
                  {unlock.map((r) => (
                    <li key={r.key}>
                      <span className="reco-name">{r.label}</span>
                      <span className="muted"> {recoWhy(r)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </details>
      )}

      <div className="coll-list">
        {rows.map(({ col, reqs, met, total, status }) => (
          <details key={col.id} className={`coll ${status}`}>
            <summary>
              <span className="coll-star">{'★'.repeat(col.star ?? 0)}</span> {col.name}
              {status === 'reachable' && <span className="badge">à ta portée</span>}
              <span className="coll-prog">
                {met}/{total}
                {status === 'complete' ? ' ✓' : ''}
              </span>
            </summary>
            <div className="coll-reqs">
              {reqs.map((r, i) => {
                const { label, your, met: ok, breedable, obtainable } = reqInfo(r)
                const kind = r.variant_id != null ? 'variant' : 'animal'
                const id = r.variant_id ?? r.animal_id
                return (
                  <div key={i} className={`coll-req ${ok ? 'ok' : breedable ? 'work' : ''}`}>
                    <span>{ok ? '✓' : breedable ? '↑' : '○'}</span>
                    <span>{label}</span>
                    <span className="muted req-need">
                      Lv {r.required_level}
                      {!ok && !breedable ? (obtainable ? ' · non élevable' : ' · à obtenir') : ''}
                    </span>
                    <input
                      className="lvl"
                      type="number"
                      min={0}
                      title="ton niveau max"
                      value={your ?? ''}
                      disabled={!editable}
                      onChange={(e) => onLevelInput(kind, id, e.target.value === '' ? null : Number(e.target.value))}
                      onBlur={() => onLevelCommit(kind, id)}
                    />
                  </div>
                )
              })}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}
