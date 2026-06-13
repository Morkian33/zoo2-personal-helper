import { useMemo, useState } from 'react'
import type { AnimalEntry } from '../lib/types'
import type { CollectionRow, CollectionRequirementRow } from '../lib/collections'

type Filter = 'all' | 'incomplete' | 'levelable'
type Status = 'complete' | 'levelable' | 'needs'

export function CollectionsView({
  entries,
  collections,
  requirements,
}: {
  entries: AnimalEntry[]
  collections: CollectionRow[]
  requirements: CollectionRequirementRow[]
}) {
  const [sector, setSector] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const { animalById, variantById, reqsByCol } = useMemo(() => {
    const animalById = new Map(entries.map((e) => [e.id, e]))
    const variantById = new Map<number, { label: string; max: number | null; owned: boolean }>()
    for (const e of entries) {
      const base = e.name_fr ?? e.name_en
      for (const v of e.variants) {
        variantById.set(v.id, {
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
    return { animalById, variantById, reqsByCol }
  }, [entries, requirements])

  function reqInfo(r: CollectionRequirementRow): { label: string; your: number | null; owned: boolean } {
    if (r.variant_id != null) {
      const v = variantById.get(r.variant_id)
      return { label: v?.label ?? '(variant ?)', your: v?.max ?? null, owned: v?.owned ?? false }
    }
    const a = animalById.get(r.animal_id)
    return {
      label: a ? (a.name_fr ?? a.name_en) : '(animal ?)',
      your: a?.max_level ?? null,
      owned: (a?.owned_count ?? 0) > 0,
    }
  }

  const sectors = useMemo(
    () => [...new Set(collections.map((c) => c.sector).filter(Boolean))] as string[],
    [collections],
  )

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out = collections
      .filter((c) => (!sector || c.sector === sector) && (!q || c.name.toLowerCase().includes(q)))
      .map((c) => {
        const reqs = reqsByCol.get(c.id) ?? []
        let met = 0
        let owned = 0
        for (const r of reqs) {
          const info = reqInfo(r)
          if (info.your != null && info.your >= r.required_level) met++
          if (info.owned) owned++
        }
        const status: Status =
          reqs.length > 0 && met === reqs.length
            ? 'complete'
            : reqs.length > 0 && owned === reqs.length
              ? 'levelable'
              : 'needs'
        return { col: c, reqs, met, total: reqs.length, status }
      })
      .filter((x) => {
        if (filter === 'incomplete') return x.status !== 'complete'
        if (filter === 'levelable') return x.status === 'levelable'
        return true
      })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collections, reqsByCol, sector, search, filter, animalById, variantById])

  const completeCount = rows.filter((r) => r.status === 'complete').length
  const levelableCount = rows.filter((r) => r.status === 'levelable').length

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
          <option value="levelable">À niveau près (tout possédé)</option>
        </select>
        <span className="count">
          {completeCount} complètes · {levelableCount} à niveler
        </span>
      </div>

      <div className="coll-list">
        {rows.map(({ col, reqs, met, total, status }) => (
          <details key={col.id} className={`coll ${status}`}>
            <summary>
              <span className="coll-star">{'★'.repeat(col.star ?? 0)}</span> {col.name}
              {status === 'levelable' && <span className="badge">à niveler</span>}
              <span className="coll-prog">
                {met}/{total}
                {status === 'complete' ? ' ✓' : ''}
              </span>
            </summary>
            <div className="coll-reqs">
              {reqs.map((r, i) => {
                const { label, your, owned } = reqInfo(r)
                const ok = your != null && your >= r.required_level
                return (
                  <div key={i} className={`coll-req ${ok ? 'ok' : ''}`}>
                    <span>{ok ? '✓' : owned ? '↑' : '○'}</span>
                    <span>{label}</span>
                    <span className="muted">
                      Lv {r.required_level}
                      {your != null ? ` · toi: ${your}` : owned ? ' · niveau ?' : ' · non possédé'}
                    </span>
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
