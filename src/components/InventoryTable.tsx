import { Fragment, useMemo, useState } from 'react'
import { canBreed } from '../lib/catalog'
import { biomeLabel } from '../lib/labels'
import type { AnimalEntry, ShelterLevels, VariantEntry, BiomeLabels } from '../lib/types'

// Data-entry table: set owned count + max level per animal, and ownership of variant coats.
export function InventoryTable({
  entries,
  shelters,
  biomes,
  biomeLabels,
  disabled,
  onToggleFavorite,
  onSetOwned,
  onSetMaxLevel,
  onCommitMaxLevel,
  onSetVariantOwned,
  onSetVariantLevel,
  onCommitVariantLevel,
}: {
  entries: AnimalEntry[]
  shelters: ShelterLevels
  biomes: string[]
  biomeLabels: BiomeLabels
  disabled: boolean
  onToggleFavorite: (e: AnimalEntry) => void
  onSetOwned: (e: AnimalEntry, count: number) => void
  onSetMaxLevel: (e: AnimalEntry, value: number | null) => void
  onCommitMaxLevel: (e: AnimalEntry) => void
  onSetVariantOwned: (v: VariantEntry, owned: boolean) => void
  onSetVariantLevel: (v: VariantEntry, value: number | null) => void
  onCommitVariantLevel: (v: VariantEntry) => void
}) {
  const [search, setSearch] = useState('')
  const [biome, setBiome] = useState('')
  const [ownedFilter, setOwnedFilter] = useState<'all' | 'owned' | 'not'>('all')
  const [favOnly, setFavOnly] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entries
      .filter((e) => {
        if (favOnly && !e.favorite) return false
        if (biome && e.biome !== biome) return false
        if (ownedFilter === 'owned' && e.owned_count === 0) return false
        if (ownedFilter === 'not' && e.owned_count > 0) return false
        if (q && !`${e.name_fr ?? ''} ${e.name_en}`.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => (a.name_fr ?? a.name_en).localeCompare(b.name_fr ?? b.name_en, 'fr'))
  }, [entries, search, biome, ownedFilter, favOnly])

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
              {biomeLabel(biomeLabels, b)}
            </option>
          ))}
        </select>
        <select value={ownedFilter} onChange={(e) => setOwnedFilter(e.target.value as typeof ownedFilter)}>
          <option value="all">Tous</option>
          <option value="owned">Possédés</option>
          <option value="not">Non possédés</option>
        </select>
        <button
          className={`fav-toggle small ${favOnly ? 'active' : ''}`}
          onClick={() => setFavOnly((v) => !v)}
          title="N'afficher que les favoris"
        >
          ★ Favoris
        </button>
        <span className="count">{rows.length}</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="center" title="Favori">★</th>
              <th>Animal</th>
              <th>Biome / source</th>
              <th>Abri requis</th>
              <th>Possédé</th>
              <th>Niv. max</th>
              <th>Élevable</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const isOpen = expanded.has(e.id)
              return (
                <Fragment key={e.id}>
                  <tr className={e.owned_count > 0 ? 'owned' : ''}>
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
                    <td>
                      {e.variants.length > 0 ? (
                        <button className="link expand" onClick={() => toggle(e.id)}>
                          {isOpen ? '▾' : '▸'} {e.name_fr ?? e.name_en}{' '}
                          <span className="muted">({e.variants.length})</span>
                        </button>
                      ) : (
                        (e.name_fr ?? e.name_en)
                      )}
                    </td>
                    <td>{biomeLabel(biomeLabels, e.biome)}</td>
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

                  {isOpen &&
                    e.variants.map((v) => (
                      <tr key={`v${v.id}`} className="variant-row">
                        <td />
                        <td className="variant-name">↳ {v.coat_name_fr ?? v.coat_name}</td>
                        <td className="muted">
                          {v.obtained_from ?? '—'}
                          {v.release_date ? ` · ${v.release_date}` : ''}
                        </td>
                        <td />
                        <td className="center">
                          <input
                            type="checkbox"
                            checked={v.owned}
                            disabled={disabled}
                            onChange={(ev) => onSetVariantOwned(v, ev.target.checked)}
                          />
                        </td>
                        <td className="center">
                          <input
                            className="lvl"
                            type="number"
                            min={0}
                            value={v.max_level ?? ''}
                            disabled={disabled}
                            onChange={(ev) =>
                              onSetVariantLevel(v, ev.target.value === '' ? null : Number(ev.target.value))
                            }
                            onBlur={() => onCommitVariantLevel(v)}
                          />
                        </td>
                        <td />
                      </tr>
                    ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
