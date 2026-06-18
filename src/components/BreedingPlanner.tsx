import { useMemo, useState } from 'react'
import { parseHours } from '../lib/duration'
import {
  ALL,
  AD_BUDGETS,
  BONUS_BIOMES,
  COOLDOWN_HOURS,
  buildPolicies,
  evaluatePolicies,
  optimalThresholds,
  parkBonus,
  type BreedParams,
} from '../lib/breedingPlan'
import { int, norm } from '../lib/format'
import { fodderCostFactor, type EventConfig } from '../lib/events'
import type { AnimalEntry } from '../lib/types'

function fmtHours(h: number): string {
  if (h < 24) return `${h.toFixed(0)}h`
  const d = Math.floor(h / 24)
  const r = Math.round(h - d * 24)
  return r ? `${d}j ${r}h` : `${d}j`
}

const POLICIES = buildPolicies()

export function BreedingPlanner({
  entries,
  events,
  wtp,
  setWtp,
  maxAds,
  setMaxAds,
}: {
  entries: AnimalEntry[]
  events: EventConfig
  wtp: number
  setWtp: (n: number) => void
  maxAds: number
  setMaxAds: (n: number) => void
}) {
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

  const filtered = breedable.filter((e) =>
    norm(`${e.name_fr ?? ''} ${e.name_en}`).includes(norm(search.trim())),
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
        fodderCost: animal.breed_cost! * fodderCostFactor(events),
        cycleHours: (parseHours(animal.breed_duration) ?? 0) + COOLDOWN_HOURS,
        park,
      }
    : null

  // The table shows every strategy, but the optimal highlight and the slider
  // thresholds only consider strategies within the player's per-breeding ad budget
  // (otherwise heavy-ad strategies would always be pushed forward).
  const rows = params ? evaluatePolicies(params, wtp, POLICIES) : []
  const envelopeRows = rows.filter((r) => r.policy.adUntil <= maxAds)
  const { segments, maxThreshold } = useMemo(
    () => (envelopeRows.length ? optimalThresholds(envelopeRows) : { segments: [], maxThreshold: 0 }),
    [envelopeRows],
  )
  // Strategy that is optimal at the current wtp (last segment whose threshold <= wtp).
  const applicable = segments.filter((s) => s.from <= wtp)
  const optimalLabel = applicable.length ? applicable[applicable.length - 1].label : 'Sans fourrage'
  const sliderMax = Math.max(Math.ceil((maxThreshold * 1.25) / 50) * 50, 100)

  return (
    <div className="planner">
      <div className="planner-global">
        <label className="wtp">
          Combien je paie pour éviter 1 cycle d'élevage :{' '}
          <input
            type="number"
            min={0}
            step={50}
            value={wtp}
            onChange={(e) => setWtp(Math.max(0, Number(e.target.value) || 0))}
          />
          pièces
        </label>
        <label className="admin-check">
          Pubs max / élevage
          <select
            value={AD_BUDGETS.includes(maxAds) ? maxAds : ALL}
            onChange={(e) => setMaxAds(Number(e.target.value))}
          >
            <option value={0}>aucune</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={ALL}>illimité</option>
          </select>
        </label>
        <span className="muted">Réglage global, appliqué aussi à la colonne « Élevage reco » de l'Analyse.</span>
      </div>

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
              fourrage {int(params.fodderCost ?? params.cost)} pièces
              {events.fodder10 ? ' (event −90%)' : ''} · cycle {fmtHours(params.cycleHours)} (élevage + 8h)
            </span>
            <label className="admin-check">
              <input type="checkbox" checked={park} onChange={(e) => setPark(e.target.checked)} />
              Parc à bonus (+{(parkBonus(params.base) * 100).toFixed(0)}% par tentative)
            </label>
            <div className="wtp-track">
              <div
                className="wtp-cursor"
                style={{ left: `${Math.min(100, (wtp / sliderMax) * 100)}%` }}
                title={`Ta valeur : ${int(wtp)} pièces`}
              />
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
            <p className="muted">
              Optimal à {int(wtp)} pièces/cycle : <b>{optimalLabel}</b>. Les repères indiquent à partir de
              quelle valorisation chaque stratégie devient la meilleure (dans la limite de pubs choisie).
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
