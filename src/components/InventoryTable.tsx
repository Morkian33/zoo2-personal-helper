import { useMemo, useState } from 'react'
import { canBreed } from '../lib/catalog'
import type { AnimalEntry, ShelterLevels } from '../lib/types'

// Data-entry table: set owned count + max level per animal.
export function InventoryTable({
  entries,
  shelters,
  biomes,
  disabled,
  onSetOwned,
  onSetMaxLevel,
  onCommitMaxLevel,
}: {
  entries: AnimalEntry[]
  shelters: ShelterLevels
  biomes: string[]
  disabled: boolean
  onSetOwned: (e: AnimalEntry, count: number) => void
  onSetMaxLevel: (e: AnimalEntry, value: number | null) => void
  onCommitMaxLevel: (e: AnimalEntry) => void
}) {
  const [search, setSearch] = useState('')
  const [biome, setBiome] = useState('')
  const [ownedFilter, setOwnedFilter] = useState<'all' | 'owned' | 'not'>('all')

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entries
      .filter((e) => {
        if (biome && e.biome !== biome) return false
        if (ownedFilter === 'owned' && e.owned_count === 0) return false
        if (ownedFilter === 'not' && e.owned_count > 0) return false
        if (q && !`${e.name_fr ?? ''} ${e.name_en}`.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => (a.name_fr ?? a.name_en).localeCompare(b.name_fr ?? b.name_en, 'fr'))
  }, [entries, search, biome, ownedFilter])

  return (
    <div className="catalog">
      <h2>Mes animaux</h2>
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
        <span className="count">{rows.length}</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Animal</th>
              <th>Biome</th>
              <th>Abri requis</th>
              <th>Possédé</th>
              <th>Niv. max</th>
              <th>Élevable</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className={e.owned_count > 0 ? 'owned' : ''}>
                <td>{e.name_fr ?? e.name_en}</td>
                <td>{e.biome ?? '—'}</td>
                <td className="num">{e.shelter_lvl ?? '—'}</td>
                <td className="center">
                  <select
                    value={e.owned_count}
                    disabled={disabled}
                    onChange={(ev) => onSetOwned(e, Number(ev.target.value))}
                  >
                    <option value={0}>Aucun</option>
                    <option value={1}>1</option>
                    <option value={2}>2+</option>
                  </select>
                </td>
                <td className="center">
                  <input
                    className="lvl"
                    type="number"
                    min={0}
                    value={e.max_level ?? ''}
                    disabled={disabled}
                    onChange={(ev) =>
                      onSetMaxLevel(e, ev.target.value === '' ? null : Number(ev.target.value))
                    }
                    onBlur={() => onCommitMaxLevel(e)}
                  />
                </td>
                <td className="center">{canBreed(e, shelters) ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
