import type { ShelterLevels } from '../lib/types'

const LEVELS = [0, 1, 2, 3]

// Editable per-biome shelter levels. "Non possédé" (null) is distinct from level 0.
export function SheltersPanel({
  biomes,
  shelters,
  disabled,
  onSet,
}: {
  biomes: string[]
  shelters: ShelterLevels
  disabled: boolean
  onSet: (biome: string, level: number | null) => void
}) {
  return (
    <div className="shelters">
      <h2>Mes abris</h2>
      <p className="muted">Niveau de ton abri par biome.</p>
      <div className="shelter-grid">
        {biomes.map((b) => {
          const level = shelters.get(b)
          return (
            <label key={b} className="shelter-row">
              <span>{b}</span>
              <select
                value={level == null ? '' : String(level)}
                disabled={disabled}
                onChange={(e) => onSet(b, e.target.value === '' ? null : Number(e.target.value))}
              >
                <option value="">Non possédé</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    Niveau {l}
                  </option>
                ))}
              </select>
            </label>
          )
        })}
      </div>
    </div>
  )
}
