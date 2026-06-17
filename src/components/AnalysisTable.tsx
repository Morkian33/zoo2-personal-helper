import { useMemo, useState } from 'react'
import { canBreed } from '../lib/catalog'
import { int, dec2, signed, ownedLabel, norm } from '../lib/format'
import { biomeLabel } from '../lib/labels'
import { parseHours } from '../lib/duration'
import { BONUS_BIOMES, COOLDOWN_HOURS, bestPolicyLabel } from '../lib/breedingPlan'
import type { AnimalEntry, ShelterLevels, BiomeLabels } from '../lib/types'

type SortDir = 'asc' | 'desc'

interface DisplayRow extends AnimalEntry {
  breedingPossible: boolean
  breedReco: string | null
}

// Recommended fodder strategy for an animal at the player's current valuation,
// assuming it's bred in its bonus park when one exists.
function breedRecoFor(e: AnimalEntry, wtp: number, maxAds: number): string | null {
  if (e.breed_proba == null || e.breed_proba <= 0 || e.breed_cost == null) return null
  return bestPolicyLabel(
    {
      base: e.breed_proba,
      cost: e.breed_cost,
      cycleHours: (parseHours(e.breed_duration) ?? 0) + COOLDOWN_HOURS,
      park: e.biome != null && BONUS_BIOMES.has(e.biome),
    },
    wtp,
    maxAds,
  )
}

interface Column {
  key: string
  label: string
  type: 'text' | 'num'
  get: (e: DisplayRow) => number | string | null
  format?: (v: number) => string
}

const COLUMNS: Column[] = [
  { key: 'name', label: 'Animal', type: 'text', get: (e) => e.name_fr ?? e.name_en },
  { key: 'biome', label: 'Biome', type: 'text', get: (e) => e.biome },
  { key: 'owned', label: 'Possédé', type: 'num', get: (e) => e.owned_count, format: ownedLabel },
  { key: 'breeding', label: 'Élevable', type: 'num', get: (e) => (e.breedingPossible ? 1 : 0), format: (v) => (v ? '✓' : '—') },
  { key: 'size', label: 'Taille', type: 'num', get: (e) => e.size, format: int },
  { key: 'pop', label: 'Popularité', type: 'num', get: (e) => e.popularity, format: int },
  { key: 'xpday', label: 'XP/jour', type: 'num', get: (e) => e.metrics.sumXpPerDay, format: int },
  { key: 'xphsa', label: 'XP/h /taille aj.', type: 'num', get: (e) => e.metrics.sumXpPerHourPerSizeAdjusted, format: dec2 },
  { key: 'popsa', label: 'Pop /taille aj.', type: 'num', get: (e) => e.metrics.popularityPerSizeAdjusted, format: dec2 },
  { key: 'feedx2', label: 'Feed×2 XP/pièce', type: 'num', get: (e) => e.metrics.feedX2XpPerCoin, format: dec2 },
  { key: 'attempts', label: 'Tentatives moy.', type: 'num', get: (e) => e.metrics.averageAttempts, format: dec2 },
  { key: 'newborn', label: 'Coût nouveau-né', type: 'num', get: (e) => e.metrics.newbornCost, format: int },
  { key: 'bdelta', label: 'Δ élevage', type: 'num', get: (e) => e.metrics.breedingDelta, format: signed },
  { key: 'sell20', label: 'Δ revente lvl20', type: 'num', get: (e) => e.metrics.sellDeltaLvl20, format: signed },
  { key: 'breedReco', label: 'Élevage reco', type: 'text', get: (e) => e.breedReco },
]

export function AnalysisTable({
  entries,
  shelters,
  biomes,
  biomeLabels,
  breedWtp,
  breedMaxAds,
}: {
  entries: AnimalEntry[]
  shelters: ShelterLevels
  biomes: string[]
  biomeLabels: BiomeLabels
  breedWtp: number
  breedMaxAds: number
}) {
  const [search, setSearch] = useState('')
  const [biome, setBiome] = useState('')
  const [ownedFilter, setOwnedFilter] = useState<'all' | 'owned' | 'not'>('all')
  const [breedFilter, setBreedFilter] = useState<'all' | 'yes'>('all')
  const [sortKey, setSortKey] = useState('xphsa')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const rows = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sortKey)!
    const q = norm(search.trim())
    const display: DisplayRow[] = entries
      .map((e) => ({
        ...e,
        breedingPossible: canBreed(e, shelters),
        breedReco: breedRecoFor(e, breedWtp, breedMaxAds),
      }))
      .filter((e) => {
        if (biome && e.biome !== biome) return false
        if (ownedFilter === 'owned' && e.owned_count === 0) return false
        if (ownedFilter === 'not' && e.owned_count > 0) return false
        if (breedFilter === 'yes' && !e.breedingPossible) return false
        if (q && !norm(`${e.name_fr ?? ''} ${e.name_en}`).includes(q)) return false
        return true
      })
    const dir = sortDir === 'asc' ? 1 : -1
    return display.sort((a, b) => {
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
  }, [entries, shelters, search, biome, ownedFilter, breedFilter, sortKey, sortDir, breedWtp, breedMaxAds])

  function toggleSort(key: string) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(COLUMNS.find((c) => c.key === key)?.type === 'text' ? 'asc' : 'desc')
    }
  }

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
              {biomeLabel(biomeLabels, b)}
            </option>
          ))}
        </select>
        <select value={ownedFilter} onChange={(e) => setOwnedFilter(e.target.value as typeof ownedFilter)}>
          <option value="all">Tous</option>
          <option value="owned">Possédés</option>
          <option value="not">Non possédés</option>
        </select>
        <select value={breedFilter} onChange={(e) => setBreedFilter(e.target.value as typeof breedFilter)}>
          <option value="all">Élevage : tous</option>
          <option value="yes">Élevables</option>
        </select>
        <span className="count">
          {rows.length} / {entries.length}
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
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
              <tr key={e.id} className={e.owned_count > 0 ? 'owned' : ''}>
                {COLUMNS.map((c) => {
                  const v = c.get(e)
                  const text =
                    v == null
                      ? '—'
                      : c.key === 'biome'
                        ? biomeLabel(biomeLabels, v as string)
                        : typeof v === 'number'
                          ? (c.format ?? int)(v)
                          : v
                  return (
                    <td key={c.key} className={c.type === 'num' ? 'num' : ''}>
                      {text}
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
