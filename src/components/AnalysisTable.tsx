import { useEffect, useMemo, useState } from 'react'
import { canBreed } from '../lib/catalog'
import { int, dec2, signed, ownedLabel, norm } from '../lib/format'
import { biomeLabel } from '../lib/labels'
import { parseHours } from '../lib/duration'
import { COOLDOWN_HOURS, bestPolicyLabel } from '../lib/breedingPlan'
import type { AnimalEntry, ShelterLevels, BiomeLabels } from '../lib/types'

type SortDir = 'asc' | 'desc'

interface Filters {
  search: string
  biome: string
  ownedFilter: 'all' | 'owned' | 'not'
  breedFilter: 'all' | 'yes'
  favOnly: boolean
  sortKey: string
  sortDir: SortDir
}
const DEFAULT_FILTERS: Filters = {
  search: '',
  biome: '',
  ownedFilter: 'all',
  breedFilter: 'all',
  favOnly: false,
  sortKey: 'xphsa',
  sortDir: 'desc',
}
const FILTERS_KEY = 'zoo2.analysis.filters'
const HIDDEN_COLS_KEY = 'zoo2.analysis.hiddenCols'
// The Animal name column is always shown (anchor for every row).
const ALWAYS_ON = 'name'

function loadHiddenCols(): Set<string> {
  try {
    const s = localStorage.getItem(HIDDEN_COLS_KEY)
    if (s) return new Set((JSON.parse(s) as string[]).filter((k) => k !== ALWAYS_ON))
  } catch {
    // ignore malformed storage
  }
  return new Set()
}

function loadFilters(): Filters {
  try {
    const s = localStorage.getItem(FILTERS_KEY)
    if (s) {
      const f = { ...DEFAULT_FILTERS, ...(JSON.parse(s) as Partial<Filters>) }
      // Guard against a stored sort column that no longer exists.
      if (!COLUMNS.some((c) => c.key === f.sortKey)) f.sortKey = DEFAULT_FILTERS.sortKey
      return f
    }
  } catch {
    // ignore malformed storage
  }
  return DEFAULT_FILTERS
}

interface DisplayRow extends AnimalEntry {
  breedingPossible: boolean
  breedReco: string | null
}

// Recommended fodder strategy for an animal at the player's current valuation.
// Baseline for now: no bonus-park assumption.
function breedRecoFor(e: AnimalEntry, wtp: number, maxAds: number): string | null {
  if (e.breed_proba == null || e.breed_proba <= 0 || e.breed_cost == null) return null
  return bestPolicyLabel(
    {
      base: e.breed_proba,
      cost: e.breed_cost,
      cycleHours: (parseHours(e.breed_duration) ?? 0) + COOLDOWN_HOURS,
      park: false,
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
  { key: 'nbopt', label: 'Nb optimal', type: 'num', get: (e) => e.metrics.nbOptimal, format: int },
  { key: 'tiles', label: 'Taille enclos', type: 'num', get: (e) => e.metrics.optimalTiles, format: int },
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
  disabled,
  onToggleFavorite,
}: {
  entries: AnimalEntry[]
  shelters: ShelterLevels
  biomes: string[]
  biomeLabels: BiomeLabels
  breedWtp: number
  breedMaxAds: number
  disabled: boolean
  onToggleFavorite: (e: AnimalEntry) => void
}) {
  const saved = useMemo(loadFilters, [])
  const [search, setSearch] = useState(saved.search)
  const [biome, setBiome] = useState(saved.biome)
  const [ownedFilter, setOwnedFilter] = useState<'all' | 'owned' | 'not'>(saved.ownedFilter)
  const [breedFilter, setBreedFilter] = useState<'all' | 'yes'>(saved.breedFilter)
  const [favOnly, setFavOnly] = useState(saved.favOnly)
  const [sortKey, setSortKey] = useState(saved.sortKey)
  const [sortDir, setSortDir] = useState<SortDir>(saved.sortDir)
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(loadHiddenCols)
  const [colMenuOpen, setColMenuOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem(HIDDEN_COLS_KEY, JSON.stringify([...hiddenCols]))
  }, [hiddenCols])

  function toggleCol(key: string) {
    setHiddenCols((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const visibleColumns = COLUMNS.filter((c) => c.key === ALWAYS_ON || !hiddenCols.has(c.key))

  // Persist the filter/sort state across sessions.
  useEffect(() => {
    localStorage.setItem(
      FILTERS_KEY,
      JSON.stringify({ search, biome, ownedFilter, breedFilter, favOnly, sortKey, sortDir }),
    )
  }, [search, biome, ownedFilter, breedFilter, favOnly, sortKey, sortDir])

  function resetFilters() {
    setSearch(DEFAULT_FILTERS.search)
    setBiome(DEFAULT_FILTERS.biome)
    setOwnedFilter(DEFAULT_FILTERS.ownedFilter)
    setBreedFilter(DEFAULT_FILTERS.breedFilter)
    setFavOnly(DEFAULT_FILTERS.favOnly)
    setSortKey(DEFAULT_FILTERS.sortKey)
    setSortDir(DEFAULT_FILTERS.sortDir)
  }
  const isFiltered =
    search !== DEFAULT_FILTERS.search ||
    biome !== DEFAULT_FILTERS.biome ||
    ownedFilter !== DEFAULT_FILTERS.ownedFilter ||
    breedFilter !== DEFAULT_FILTERS.breedFilter ||
    favOnly !== DEFAULT_FILTERS.favOnly ||
    sortKey !== DEFAULT_FILTERS.sortKey ||
    sortDir !== DEFAULT_FILTERS.sortDir

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
        if (favOnly && !e.favorite) return false
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
  }, [entries, shelters, search, biome, ownedFilter, breedFilter, favOnly, sortKey, sortDir, breedWtp, breedMaxAds])

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
        <button
          className={`fav-toggle small ${favOnly ? 'active' : ''}`}
          onClick={() => setFavOnly((v) => !v)}
          title="N'afficher que les favoris"
        >
          ★ Favoris
        </button>
        {isFiltered && (
          <button className="small" onClick={resetFilters}>
            Réinitialiser
          </button>
        )}
        <div className="col-picker">
          <button className="small" onClick={() => setColMenuOpen((o) => !o)}>
            Colonnes ▾
          </button>
          {colMenuOpen && (
            <div className="col-menu">
              <div className="col-menu-head">
                <span>Colonnes affichées</span>
                {hiddenCols.size > 0 && (
                  <button className="link" onClick={() => setHiddenCols(new Set())}>
                    Tout afficher
                  </button>
                )}
              </div>
              {COLUMNS.filter((c) => c.key !== ALWAYS_ON).map((c) => (
                <label key={c.key} className="admin-check">
                  <input
                    type="checkbox"
                    checked={!hiddenCols.has(c.key)}
                    onChange={() => toggleCol(c.key)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <span className="count">
          {rows.length} / {entries.length}
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="center" title="Favori">★</th>
              {visibleColumns.map((c) => (
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
                <td className="center">
                  <button
                    className={`star ${e.favorite ? 'on' : ''}`}
                    disabled={disabled}
                    title={e.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                    onClick={() => onToggleFavorite(e)}
                  >
                    {e.favorite ? '★' : '☆'}
                  </button>
                </td>
                {visibleColumns.map((c) => {
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
