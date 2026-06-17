import { useMemo, useState } from 'react'
import { canBreed } from '../lib/catalog'
import { norm } from '../lib/format'
import type { AnimalEntry, ShelterLevels } from '../lib/types'
import type { CollectionRow, CollectionRequirementRow } from '../lib/collections'

type Filter = 'all' | 'incomplete' | 'reachable'
type Status = 'complete' | 'reachable' | 'blocked'

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

  const { animalById, variantMax, reqsByCol } = useMemo(() => {
    const animalById = new Map(entries.map((e) => [e.id, e]))
    const variantMax = new Map<number, { label: string; max: number | null }>()
    for (const e of entries) {
      const base = e.name_fr ?? e.name_en
      for (const v of e.variants) {
        variantMax.set(v.id, { label: `${base} (${v.coat_name_fr ?? v.coat_name})`, max: v.max_level })
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
  } {
    const a = animalById.get(r.animal_id)
    const breedable = a ? canBreed(a, shelters) : false
    if (r.variant_id != null) {
      const v = variantMax.get(r.variant_id)
      const your = v?.max ?? null
      return { label: v?.label ?? '(variant ?)', your, met: your != null && your >= r.required_level, breedable }
    }
    const your = a?.max_level ?? null
    return {
      label: a ? (a.name_fr ?? a.name_en) : '(animal ?)',
      your,
      met: your != null && your >= r.required_level,
      breedable,
    }
  }

  const sectors = useMemo(
    () => [...new Set(collections.map((c) => c.sector).filter(Boolean))] as string[],
    [collections],
  )

  const rows = useMemo(() => {
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
      .filter((x) => {
        if (filter === 'incomplete') return x.status !== 'complete'
        if (filter === 'reachable') return x.status === 'reachable'
        return true
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collections, reqsByCol, sector, search, filter, animalById, variantMax, shelters])

  const completeCount = rows.filter((r) => r.status === 'complete').length
  const reachableCount = rows.filter((r) => r.status === 'reachable').length

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
          <option value="incomplete">Masquer les complètes</option>
          <option value="reachable">À ta portée (tout élevable)</option>
        </select>
        <span className="count">
          {completeCount} complètes · {reachableCount} à ta portée
        </span>
      </div>

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
                const { label, your, met: ok, breedable } = reqInfo(r)
                const kind = r.variant_id != null ? 'variant' : 'animal'
                const id = r.variant_id ?? r.animal_id
                return (
                  <div key={i} className={`coll-req ${ok ? 'ok' : breedable ? 'work' : ''}`}>
                    <span>{ok ? '✓' : breedable ? '↑' : '○'}</span>
                    <span>{label}</span>
                    <span className="muted req-need">
                      Lv {r.required_level}
                      {!ok && !breedable ? ' · non élevable' : ''}
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
