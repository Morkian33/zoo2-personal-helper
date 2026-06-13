import { useEffect, useMemo, useState } from 'react'
import { loadCatalog, setUserAnimal } from '../lib/catalog'
import type { AnimalEntry } from '../lib/types'

type SortDir = 'asc' | 'desc'

interface Column {
  key: string
  label: string
  type: 'text' | 'num'
  get: (e: AnimalEntry) => number | string | null
  format?: (v: number) => string
}

const int = (v: number) => Math.round(v).toLocaleString('fr-FR')
const dec2 = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const signed = (v: number) => (v > 0 ? '+' : '') + Math.round(v).toLocaleString('fr-FR')

const COLUMNS: Column[] = [
  { key: 'name', label: 'Animal', type: 'text', get: (e) => e.name_fr ?? e.name_en },
  { key: 'biome', label: 'Biome', type: 'text', get: (e) => e.biome },
  { key: 'size', label: 'Taille', type: 'num', get: (e) => e.size, format: int },
  { key: 'pop', label: 'Popularité', type: 'num', get: (e) => e.popularity, format: int },
  { key: 'xpday', label: 'XP/jour', type: 'num', get: (e) => e.metrics.sumXpPerDay, format: int },
  {
    key: 'xphsa',
    label: 'XP/h /taille aj.',
    type: 'num',
    get: (e) => e.metrics.sumXpPerHourPerSizeAdjusted,
    format: dec2,
  },
  {
    key: 'popsa',
    label: 'Pop /taille aj.',
    type: 'num',
    get: (e) => e.metrics.popularityPerSizeAdjusted,
    format: dec2,
  },
  {
    key: 'attempts',
    label: 'Tentatives moy.',
    type: 'num',
    get: (e) => e.metrics.averageAttempts,
    format: dec2,
  },
  { key: 'newborn', label: 'Coût nouveau-né', type: 'num', get: (e) => e.metrics.newbornCost, format: int },
  { key: 'bdelta', label: 'Δ élevage', type: 'num', get: (e) => e.metrics.breedingDelta, format: signed },
  {
    key: 'sell20',
    label: 'Δ revente lvl20',
    type: 'num',
    get: (e) => e.metrics.sellDeltaLvl20,
    format: signed,
  },
]

export function CatalogTable({ userId }: { userId: string | null }) {
  const [entries, setEntries] = useState<AnimalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [biome, setBiome] = useState('')
  const [ownedFilter, setOwnedFilter] = useState<'all' | 'owned' | 'not'>('all')
  const [sortKey, setSortKey] = useState('xphsa')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    loadCatalog()
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur de chargement'))
      .finally(() => setLoading(false))
  }, [])

  const biomes = useMemo(
    () => [...new Set(entries.map((e) => e.biome).filter(Boolean))].sort() as string[],
    [entries],
  )

  const rows = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sortKey)!
    const q = search.trim().toLowerCase()
    const filtered = entries.filter((e) => {
      if (biome && e.biome !== biome) return false
      if (ownedFilter === 'owned' && !e.owned) return false
      if (ownedFilter === 'not' && e.owned) return false
      if (q && !`${e.name_fr ?? ''} ${e.name_en}`.toLowerCase().includes(q)) return false
      return true
    })
    const dir = sortDir === 'asc' ? 1 : -1
    return filtered.sort((a, b) => {
      const va = col.get(a)
      const vb = col.get(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1 // nulls always last
      if (vb == null) return -1
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va).localeCompare(String(vb), 'fr') * dir
      }
      return (va - vb) * dir
    })
  }, [entries, search, biome, ownedFilter, sortKey, sortDir])

  function toggleSort(key: string) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(COLUMNS.find((c) => c.key === key)?.type === 'text' ? 'asc' : 'desc')
    }
  }

  async function toggleFlag(e: AnimalEntry, field: 'owned' | 'breeding_unlocked') {
    if (!userId) return
    const prev = { owned: e.owned, breeding_unlocked: e.breeding_unlocked }
    const nextVal = !e[field]
    // optimistic update
    setEntries((list) => list.map((x) => (x.id === e.id ? { ...x, [field]: nextVal } : x)))
    try {
      await setUserAnimal(userId, e.id, { [field]: nextVal }, prev)
    } catch {
      // rollback
      setEntries((list) => list.map((x) => (x.id === e.id ? { ...x, [field]: prev[field] } : x)))
    }
  }

  if (loading) return <p className="muted">Chargement du catalogue…</p>
  if (error) return <p className="status error">Erreur : {error}</p>

  return (
    <div className="catalog">
      <div className="filters">
        <input
          type="search"
          placeholder="Rechercher un animal…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={biome} onChange={(e) => setBiome(e.target.value)}>
          <option value="">Tous les biomes</option>
          {biomes.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select value={ownedFilter} onChange={(e) => setOwnedFilter(e.target.value as typeof ownedFilter)}>
          <option value="all">Tous</option>
          <option value="owned">Possédés</option>
          <option value="not">Non possédés</option>
        </select>
        <span className="count">{rows.length} / {entries.length}</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Poss.</th>
              <th>Élev.</th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={`sortable ${c.type === 'num' ? 'num' : ''} ${sortKey === c.key ? 'active' : ''}`}
                  onClick={() => toggleSort(c.key)}
                >
                  {c.label}
                  {sortKey === c.key && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                </th>
              ))}
              <th>Wiki</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className={e.owned ? 'owned' : ''}>
                <td className="center">
                  <input
                    type="checkbox"
                    checked={e.owned}
                    disabled={!userId}
                    onChange={() => toggleFlag(e, 'owned')}
                  />
                </td>
                <td className="center">
                  <input
                    type="checkbox"
                    checked={e.breeding_unlocked}
                    disabled={!userId}
                    onChange={() => toggleFlag(e, 'breeding_unlocked')}
                  />
                </td>
                {COLUMNS.map((c) => {
                  const v = c.get(e)
                  const text =
                    v == null ? '—' : typeof v === 'number' ? (c.format ?? int)(v) : v
                  return (
                    <td key={c.key} className={c.type === 'num' ? 'num' : ''}>
                      {c.key === 'name' && e.variant ? `${text} ⃰` : text}
                    </td>
                  )
                })}
                <td className="center">
                  {e.url ? (
                    <a href={e.url} target="_blank" rel="noreferrer">
                      ↗
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
