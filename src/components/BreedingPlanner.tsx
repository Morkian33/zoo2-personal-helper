import { useEffect, useMemo, useState } from 'react'
import { parseHours } from '../lib/duration'
import {
  evaluatePolicies,
  optimalThresholds,
  parkBonus,
  type BreedParams,
  type FodderPolicy,
} from '../lib/breedingPlan'
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

interface PolicyDef {
  label: string
  policy: FodderPolicy
  usesAds: boolean
}
const POLICIES: PolicyDef[] = [
  { label: 'Sans fourrage', policy: { coinUntil: 0, adUntil: 0 }, usesAds: false },
  { label: 'Pièce 1ʳᵉ', policy: { coinUntil: 1, adUntil: 0 }, usesAds: false },
  { label: 'Pièce 1-2', policy: { coinUntil: 2, adUntil: 0 }, usesAds: false },
  { label: 'Pièce 1-3', policy: { coinUntil: 3, adUntil: 0 }, usesAds: false },
  { label: 'Pièce toutes', policy: { coinUntil: 999, adUntil: 0 }, usesAds: false },
  { label: 'Double 1ʳᵉ', policy: { coinUntil: 1, adUntil: 1 }, usesAds: true },
  { label: 'Double 1-2', policy: { coinUntil: 2, adUntil: 2 }, usesAds: true },
  { label: 'Double toutes', policy: { coinUntil: 999, adUntil: 999 }, usesAds: true },
]

// Personal preferences persisted across sessions (not account-specific).
function loadNum(key: string, def: number): number {
  const v = Number(localStorage.getItem(key))
  return Number.isFinite(v) && v > 0 ? v : def
}

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
  const [wtp, setWtp] = useState(() => loadNum('zoo2.breeding.wtp', 0))
  const [allowAds, setAllowAds] = useState(() => localStorage.getItem('zoo2.breeding.ads') === '1')

  useEffect(() => localStorage.setItem('zoo2.breeding.wtp', String(wtp)), [wtp])
  useEffect(() => localStorage.setItem('zoo2.breeding.ads', allowAds ? '1' : '0'), [allowAds])

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

  const activePolicies = POLICIES.filter((p) => allowAds || !p.usesAds)
  const rows = params ? evaluatePolicies(params, wtp, activePolicies) : []
  const { segments, maxThreshold } = useMemo(
    () => (rows.length ? optimalThresholds(rows) : { segments: [], maxThreshold: 0 }),
    [rows],
  )
  // Strategy that is optimal at the current wtp (last segment whose threshold <= wtp).
  const applicable = segments.filter((s) => s.from <= wtp)
  const optimalLabel = applicable.length ? applicable[applicable.length - 1].label : 'Sans fourrage'
  const sliderMax = Math.max(Math.ceil((maxThreshold * 1.25) / 50) * 50, 100)

  return (
    <div className="planner">
      <div className="admin-search">
        <input
          type="search"
          placeholder="Choisir un animal à élever…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search.trim() && filtered.length > 0 && (
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
            <div className="planner-opts">
              <label className="admin-check">
                <input type="checkbox" checked={park} onChange={(e) => setPark(e.target.checked)} />
                Parc à bonus (+{(parkBonus(params.base) * 100).toFixed(0)}% par tentative)
              </label>
              <label className="admin-check">
                <input
                  type="checkbox"
                  checked={allowAds}
                  onChange={(e) => setAllowAds(e.target.checked)}
                />
                J'accepte de regarder des pubs (fourrage double)
              </label>
            </div>

            <label className="wtp">
              Combien je suis prêt à payer pour éviter 1 cycle d'élevage (~{fmtHours(params.cycleHours)}) :{' '}
              <b>{int(wtp)} pièces</b>
            </label>
            <div className="wtp-slider">
              <input
                type="range"
                min={0}
                max={sliderMax}
                step={Math.max(1, Math.round(sliderMax / 200))}
                value={Math.min(wtp, sliderMax)}
                onChange={(e) => setWtp(Number(e.target.value))}
              />
              <div className="ticks">
                {segments
                  .filter((s) => s.from > 0 && s.from <= sliderMax)
                  .map((s) => (
                    <div
                      key={s.label}
                      className="tick"
                      style={{ left: `${(s.from / sliderMax) * 100}%` }}
                      title={`${s.label} dès ${int(s.from)} pièces`}
                    >
                      <span className="tick-mark" />
                      <span className="tick-label">
                        {int(s.from)}
                        <br />
                        {s.label}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
            <p className="muted">
              Optimal à {int(wtp)} pièces/cycle : <b>{optimalLabel}</b>. Les repères sur la réglette
              indiquent à partir de quelle valorisation chaque stratégie devient la meilleure.
            </p>
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
                  <tr key={r.label} className={r.label === optimalLabel ? 'owned' : ''}>
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
