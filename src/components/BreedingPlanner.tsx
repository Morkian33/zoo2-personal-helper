import { useMemo, useState } from 'react'
import { parseHours } from '../lib/duration'
import { evaluatePolicies, parkBonus, type BreedParams, type FodderPolicy } from '../lib/breedingPlan'
import { int } from '../lib/format'
import type { AnimalEntry } from '../lib/types'

// Biomes that have a dedicated breeding park granting the +50% proba/XP bonus.
const BONUS_BIOMES = new Set(['Forest', 'Ice', 'Plains', 'Savanna', 'Jungle', 'Water'])

const COOLDOWN_HOURS = 8 // a pair must wait 8h after a breeding before breeding again

function fmtHours(h: number): string {
  if (h < 24) return `${h.toFixed(0)}h`
  const d = Math.floor(h / 24)
  const r = Math.round(h - d * 24)
  return r ? `${d}j ${r}h` : `${d}j`
}

const POLICIES: { label: string; policy: FodderPolicy }[] = [
  { label: 'Sans fourrage', policy: { coinUntil: 0, adUntil: 0 } },
  { label: 'Pièce 1ʳᵉ', policy: { coinUntil: 1, adUntil: 0 } },
  { label: 'Pièce 1-2', policy: { coinUntil: 2, adUntil: 0 } },
  { label: 'Pièce 1-3', policy: { coinUntil: 3, adUntil: 0 } },
  { label: 'Pièce toutes', policy: { coinUntil: 999, adUntil: 0 } },
  { label: 'Double 1ʳᵉ', policy: { coinUntil: 1, adUntil: 1 } },
  { label: 'Double 1-2', policy: { coinUntil: 2, adUntil: 2 } },
  { label: 'Double toutes', policy: { coinUntil: 999, adUntil: 999 } },
]

export function BreedingPlanner({ entries }: { entries: AnimalEntry[] }) {
  const breedable = useMemo(
    () =>
      entries
        .filter((e) => e.breed_proba != null && e.breed_proba > 0 && e.breed_cost != null)
        .sort((a, b) => (a.name_fr ?? a.name_en).localeCompare(b.name_fr ?? b.name_en, 'fr')),
    [entries],
  )

  const [search, setSearch] = useState('')
  const [id, setId] = useState<number | null>(null)
  const [park, setPark] = useState(false)
  const [wtp, setWtp] = useState(0) // coins willing to pay to save one breeding cycle

  const filtered = breedable.filter((e) =>
    `${e.name_fr ?? ''} ${e.name_en}`.toLowerCase().includes(search.trim().toLowerCase()),
  )
  const animal = breedable.find((e) => e.id === id) ?? null

  // When the selected animal changes, default the park toggle from its biome.
  function select(e: AnimalEntry) {
    setId(e.id)
    setPark(e.biome != null && BONUS_BIOMES.has(e.biome))
    setSearch('')
  }

  const params: BreedParams | null = animal
    ? {
        base: animal.breed_proba!,
        cost: animal.breed_cost!,
        cycleHours: (parseHours(animal.breed_duration) ?? 0) + COOLDOWN_HOURS,
        park,
      }
    : null

  const rows = params ? evaluatePolicies(params, wtp, POLICIES) : []
  const bestNet = rows.length ? Math.max(...rows.map((r) => r.net)) : 0

  return (
    <div className="planner">
      <div className="filters">
        <input
          type="search"
          placeholder="Choisir un animal à élever…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search.trim() && (
          <ul className="admin-matches">
            {filtered.slice(0, 12).map((e) => (
              <li key={e.id}>
                <button className="link" onClick={() => select(e)}>
                  {e.name_fr ?? e.name_en}{' '}
                  <span className="muted">
                    ({e.name_en}) · {(e.breed_proba! * 100).toFixed(0)}%
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!animal && <p className="muted">Sélectionne un animal pour simuler l'élevage.</p>}

      {animal && params && (
        <>
          <div className="planner-head">
            <h2>{animal.name_fr ?? animal.name_en}</h2>
            <span className="muted">
              base {(params.base * 100).toFixed(0)}% · incrément pitié +
              {(Math.min(params.base, 0.1) * 100).toFixed(0)}/échec · lancement {int(params.cost)} pièces ·
              cycle {fmtHours(params.cycleHours)} (élevage + 8h)
            </span>
            <label className="admin-check">
              <input type="checkbox" checked={park} onChange={(e) => setPark(e.target.checked)} />
              Parc à bonus (+{(parkBonus(params.base) * 100).toFixed(0)}% par tentative)
            </label>
            <label className="wtp">
              Valeur d'un cycle d'élevage économisé (pièces)
              <input
                type="number"
                min={0}
                step={50}
                value={wtp}
                onChange={(e) => setWtp(Number(e.target.value) || 0)}
              />
            </label>
            <span className="muted">
              Règle le curseur sur ce que « gagner ~{fmtHours(params.cycleHours)} » vaut pour toi en pièces.
              La valeur nette devient positive quand le fourrage vaut le coup.
            </span>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Stratégie</th>
                  <th className="num">E[tentatives]</th>
                  <th className="num">Temps moyen</th>
                  <th className="num">Pièces moy.</th>
                  <th className="num">Pubs</th>
                  <th className="num">Valeur nette</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className={r.net === bestNet && r.net > 0 ? 'owned' : ''}>
                    <td>{r.label}</td>
                    <td className="num">{r.result.attempts.toFixed(2)}</td>
                    <td className="num">{fmtHours(r.result.hours)}</td>
                    <td className="num">{int(r.result.coins)}</td>
                    <td className="num">{r.result.ads ? r.result.ads.toFixed(2) : '—'}</td>
                    <td className="num">{r.label === 'Sans fourrage' ? '—' : int(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            « Valeur nette » = (tentatives économisées × valeur d'un cycle) − surcoût en pièces. Les pubs ne
            sont pas chiffrées : à toi de juger si la ligne « double » vaut l'effort vs la ligne « pièce ».
          </p>
        </>
      )}
    </div>
  )
}
