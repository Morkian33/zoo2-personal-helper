import { useMemo, useState } from 'react'
import type { AnimalEntry } from '../lib/types'
import {
  offspringLevel,
  breedingOrderCrossover,
  nextProbability,
  analyseGroups,
  expectedOutcomes,
  pairParkBonus,
  type PairGroup,
  type BreedingConfig,
} from '../lib/breedingOrder'
import { norm } from '../lib/format'

// ── Storage ──────────────────────────────────────────────────────────────────

interface SessionState {
  animalId: number | null
  currentPPct: number
  groups: PairGroup[]
}

const SESSION_KEY = 'zoo2.breeding.order'
const CONFIGS_KEY = 'zoo2.breeding.configs'

type StoredGroup = Omit<PairGroup, 'coinBoost' | 'adBoost'> & {
  coinBoost?: boolean
  adBoost?: boolean
}

function hydrateGroup(g: StoredGroup): PairGroup {
  return { ...g, coinBoost: g.coinBoost ?? false, adBoost: g.adBoost ?? false }
}

function loadSession(): SessionState {
  try {
    const s = localStorage.getItem(SESSION_KEY)
    if (s) {
      const raw = JSON.parse(s) as Omit<SessionState, 'groups'> & { groups: StoredGroup[] }
      return { ...raw, groups: raw.groups.map(hydrateGroup) }
    }
  } catch { /* ignore */ }
  return { animalId: null, currentPPct: 4, groups: [] }
}

function loadConfigs(): BreedingConfig[] {
  try {
    const s = localStorage.getItem(CONFIGS_KEY)
    if (s) return JSON.parse(s) as BreedingConfig[]
  } catch { /* ignore */ }
  return []
}

function saveConfigs(configs: BreedingConfig[]): void {
  localStorage.setItem(CONFIGS_KEY, JSON.stringify(configs))
}

// ── Component ─────────────────────────────────────────────────────────────────

// ── Helpers ───────────────────────────────────────────────────────────────────

function GroupId({ g }: { g: PairGroup }) {
  return (
    <>
      paire niv.&nbsp;{g.levelA}+{g.levelB}
      {g.parkBonus && <span className="breed-order-park-badge">parc</span>}
      {g.coinBoost && <span className="breed-order-boost-badge">Pièce</span>}
      {g.adBoost && <span className="breed-order-boost-badge">Pub</span>}
    </>
  )
}

// Signed, 2-decimal delta on one of the reported expectations.
function DeltaValue({ v, unit }: { v: number; unit: string }) {
  const cls = v > 0.005 ? ' pos' : v < -0.005 ? ' neg' : ''
  return (
    <span className={`breed-order-boost-delta${cls}`}>
      {v >= 0 ? '+' : '−'}
      {Math.abs(v).toFixed(2)} {unit}
    </span>
  )
}

function BoostLine({
  label,
  item,
  maxLevel,
  onApply,
}: {
  label: string
  item: { group: PairGroup; dBirths: number; dMaxLevel: number }
  maxLevel: number
  onApply: () => void
}) {
  return (
    <div className="breed-order-boost-item">
      <span className="muted">{label}</span>
      {' → '}
      <span><GroupId g={item.group} /></span>
      <DeltaValue v={item.dBirths} unit="naiss." />
      <DeltaValue v={item.dMaxLevel} unit={`niv. ${maxLevel}`} />
      <button className="small" onClick={onApply}>OK</button>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

type Strategy = 'births' | 'balance' | 'niveau'

const STRATEGIES: Strategy[] = ['births', 'balance', 'niveau']

const STRATEGY_LABEL: Record<Strategy, string> = {
  births: 'Naissances',
  balance: 'Équilibre',
  niveau: 'Niveau',
}

// Per-strategy scoring of one offspring. The small `0.001 * l` terms are
// tie-breakers, not objectives: they only order plays that are equivalent for
// the primary criterion.
function makeScoreOf(strategy: Strategy, groups: PairGroup[]): (l: number) => number {
  if (strategy === 'balance') return (l) => l
  if (strategy === 'births') return (l) => 1 + 0.001 * l
  const maxLevel =
    groups.length > 0 ? Math.max(...groups.map((g) => offspringLevel(g.levelA, g.levelB))) : 20
  return (l) => (l === maxLevel ? 1 : 0) + 0.001 * l
}

export function BreedingOrderOptimizer({ entries }: { entries: AnimalEntry[] }) {
  const [session, setSessionRaw] = useState<SessionState>(loadSession)
  const [configs, setConfigsRaw] = useState<BreedingConfig[]>(loadConfigs)
  const [search, setSearch] = useState('')
  const [saveName, setSaveName] = useState('')
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [strategy, setStrategy] = useState<Strategy>('balance')

  function setSession(fn: (s: SessionState) => SessionState) {
    setSessionRaw((prev) => {
      const next = fn(prev)
      localStorage.setItem(SESSION_KEY, JSON.stringify(next))
      return next
    })
  }

  function setConfigs(next: BreedingConfig[]) {
    setConfigsRaw(next)
    saveConfigs(next)
  }

  // ── Derived ──────────────────────────────────────────────────────────────

  const breedable = useMemo(
    () =>
      entries
        .filter((e) => e.breed_proba != null && e.breed_proba > 0)
        .sort((a, b) => (a.name_fr ?? a.name_en).localeCompare(b.name_fr ?? b.name_en, 'fr')),
    [entries],
  )

  const animal = breedable.find((e) => e.id === session.animalId) ?? null
  const pBase = animal?.breed_proba ?? null
  const inc = pBase != null ? Math.min(pBase, 0.1) : null
  const crossover = pBase != null ? breedingOrderCrossover(pBase) : null
  const parkBonusVal = pBase != null ? pairParkBonus(pBase) : null
  const currentP = session.currentPPct / 100

  const scoreOf = useMemo(
    () => makeScoreOf(strategy, session.groups),
    [strategy, session.groups],
  )

  // DP ordering values (accounts for per-group configured boosts)
  const dpValues = useMemo(
    () =>
      pBase != null && session.groups.length > 0
        ? analyseGroups(session.groups, currentP, pBase, scoreOf)
        : [],
    [session.groups, currentP, pBase, scoreOf],
  )

  // Expected session outcome under each strategy's own optimal ordering, so the
  // trade-off between total births and max-level births is visible at a glance.
  const outcomesByStrategy = useMemo(() => {
    if (pBase == null || session.groups.length === 0) return null
    return STRATEGIES.map((s) => ({
      strategy: s,
      ...expectedOutcomes(session.groups, currentP, pBase, makeScoreOf(s, session.groups)),
    }))
  }, [session.groups, currentP, pBase])

  const outcomes = outcomesByStrategy?.find((o) => o.strategy === strategy) ?? null

  const ranked = useMemo(() => {
    if (dpValues.length === 0) return session.groups.map((g, i) => ({ g, i, v: -Infinity }))
    return session.groups
      .map((g, i) => ({ g, i, v: dpValues[i] }))
      .sort((a, b) => b.v - a.v)
  }, [session.groups, dpValues])

  // Lookup: groupId → {rank, v} — used to annotate the stable insertion-order list.
  const rankMap = useMemo(
    () => new Map(ranked.map(({ g, v }, rank) => [g.id, { rank, v }])),
    [ranked],
  )

  const recommended = ranked[0]?.g ?? null
  const bestValue = ranked[0]?.v ?? 0

  // Boost recommendation: full DP recalculation — for each candidate group,
  // simulate applying the boost (splitting one pair if count > 1) and rerun the
  // DP.  The pick is ranked on the score delta (which captures pity-order
  // effects the simple `pBase × offspring` formula misses), but what we show is
  // the impact on the two reported expectations.
  const boostReco = useMemo(() => {
    if (!pBase || session.groups.length === 0 || !outcomes) return null

    const getBoostedOutcomes = (groupId: string, boostKey: 'coinBoost' | 'adBoost') => {
      const target = session.groups.find((g) => g.id === groupId)
      if (!target) return null
      const boostedCoin = boostKey === 'coinBoost' ? true : target.coinBoost
      const boostedAd = boostKey === 'adBoost' ? true : target.adBoost
      let boostedGroups: PairGroup[]
      if (target.count === 1) {
        boostedGroups = session.groups.map((g) =>
          g.id === groupId ? { ...g, coinBoost: boostedCoin, adBoost: boostedAd } : g,
        )
      } else {
        boostedGroups = [
          ...session.groups.map((g) => (g.id === groupId ? { ...g, count: g.count - 1 } : g)),
          { id: 'tmp', levelA: target.levelA, levelB: target.levelB,
            parkBonus: target.parkBonus, coinBoost: boostedCoin, adBoost: boostedAd, count: 1 },
        ]
      }
      // Boosts never change offspring levels, so the boosted run is directly
      // comparable to `outcomes` (same scoreOf, same maxLevel).
      return expectedOutcomes(boostedGroups, currentP, pBase, scoreOf)
    }

    type Candidate = { group: PairGroup; delta: number; dBirths: number; dMaxLevel: number }
    const MIN_GAIN = 0.005  // min score gain to bother showing
    let coin: Candidate | null = null
    let ad: Candidate | null = null

    const consider = (g: PairGroup, boostKey: 'coinBoost' | 'adBoost', current: Candidate | null) => {
      const bo = getBoostedOutcomes(g.id, boostKey)
      if (!bo) return current
      const delta = bo.score - outcomes.score
      if (delta < MIN_GAIN || (current && delta <= current.delta + 1e-9)) return current
      return {
        group: g,
        delta,
        dBirths: bo.births - outcomes.births,
        dMaxLevel: bo.maxLevelBirths - outcomes.maxLevelBirths,
      }
    }

    for (const g of session.groups) {
      if (!g.coinBoost) coin = consider(g, 'coinBoost', coin)
      if (!g.adBoost) ad = consider(g, 'adBoost', ad)
    }

    if (!coin && !ad) return null
    return { coin, ad }
  }, [session.groups, currentP, pBase, outcomes, scoreOf])

  const totalPairs = session.groups.reduce((s, g) => s + g.count, 0)

  // ── Pair mutations ────────────────────────────────────────────────────────

  function addGroup() {
    const id = crypto.randomUUID()
    setSession((s) => ({
      ...s,
      groups: [
        ...s.groups,
        { id, levelA: 5, levelB: 5, count: 1, parkBonus: false, coinBoost: false, adBoost: false },
      ],
    }))
  }

  function removeGroup(id: string) {
    setSession((s) => ({ ...s, groups: s.groups.filter((g) => g.id !== id) }))
  }

  function updateGroup(id: string, key: keyof PairGroup, value: number | boolean) {
    setSession((s) => ({
      ...s,
      groups: s.groups.map((g) => (g.id === id ? { ...g, [key]: value } : g)),
    }))
  }

  function onValidate(success: boolean) {
    if (pBase == null || recommended == null) return
    const newP = nextProbability(currentP, pBase, success)
    const id = recommended.id
    setSession((s) => ({
      ...s,
      currentPPct: Math.round(newP * 1000) / 10,
      groups: s.groups
        .map((g) => (g.id === id ? { ...g, count: g.count - 1 } : g))
        .filter((g) => g.count > 0),
    }))
  }

  // ── Configs ───────────────────────────────────────────────────────────────

  function loadConfig(cfg: BreedingConfig) {
    const groups: PairGroup[] = cfg.groups.map((def) =>
      hydrateGroup({ ...def, id: crypto.randomUUID() }),
    )
    const a = breedable.find((e) => e.id === cfg.animalId)
    const pct = a ? Math.round(a.breed_proba! * 1000) / 10 : 4
    setSession((s) => ({ ...s, animalId: cfg.animalId, groups, currentPPct: pct }))
  }

  function saveConfig() {
    if (!session.animalId || !saveName.trim()) return
    const cfg: BreedingConfig = {
      id: crypto.randomUUID(),
      name: saveName.trim(),
      animalId: session.animalId,
      groups: session.groups.map(({ id: _id, ...def }) => def),
    }
    setConfigs([...configs, cfg])
    setSaveName('')
    setShowSaveForm(false)
  }

  // Apply a boost recommendation to a single pair.
  // - count=1: apply directly on the group.
  // - count>1: extract one pair into an existing compatible group (same levels +
  //   boosts + park, with the new boost already set) or a fresh group of count=1.
  function applyBoostToGroup(groupId: string, boostKey: 'coinBoost' | 'adBoost') {
    setSession((s) => {
      const target = s.groups.find((g) => g.id === groupId)
      if (!target) return s

      const boostedCoin = boostKey === 'coinBoost' ? true : target.coinBoost
      const boostedAd = boostKey === 'adBoost' ? true : target.adBoost

      // Try to merge with an existing group that already has this exact config.
      const match = s.groups.find(
        (g) =>
          g.id !== groupId &&
          g.levelA === target.levelA &&
          g.levelB === target.levelB &&
          g.parkBonus === target.parkBonus &&
          g.coinBoost === boostedCoin &&
          g.adBoost === boostedAd,
      )

      if (target.count === 1) {
        if (match) {
          // Last individual: move into the matching group and remove this one.
          return {
            ...s,
            groups: s.groups
              .filter((g) => g.id !== groupId)
              .map((g) => (g.id === match.id ? { ...g, count: g.count + 1 } : g)),
          }
        }
        return {
          ...s,
          groups: s.groups.map((g) =>
            g.id === groupId ? { ...g, coinBoost: boostedCoin, adBoost: boostedAd } : g,
          ),
        }
      }

      // count > 1: decrement source, then merge or create boosted group.
      let groups = s.groups.map((g) =>
        g.id === groupId ? { ...g, count: g.count - 1 } : g,
      )

      if (match) {
        groups = groups.map((g) => (g.id === match.id ? { ...g, count: g.count + 1 } : g))
      } else {
        groups = [
          ...groups,
          {
            id: crypto.randomUUID(),
            levelA: target.levelA,
            levelB: target.levelB,
            parkBonus: target.parkBonus,
            coinBoost: boostedCoin,
            adBoost: boostedAd,
            count: 1,
          },
        ]
      }

      return { ...s, groups }
    })
  }

  function deleteConfig(id: string) {
    setConfigs(configs.filter((c) => c.id !== id))
  }

  function overwriteConfig(id: string) {
    if (!session.animalId) return
    setConfigs(
      configs.map((c) =>
        c.id === id
          ? {
              ...c,
              animalId: session.animalId!,
              groups: session.groups.map(({ id: _id, ...def }) => def),
            }
          : c,
      ),
    )
  }

  // ── Species search ────────────────────────────────────────────────────────

  const filtered = breedable.filter((e) =>
    norm(`${e.name_fr ?? ''} ${e.name_en}`).includes(norm(search.trim())),
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="breed-order">
      {/* Species picker */}
      {!animal ? (
        <div className="admin-search">
          <input
            type="search"
            placeholder="Choisir l'espèce à élever…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search.trim() && filtered.length > 0 && (
            <ul className="admin-matches">
              {filtered.slice(0, 12).map((e) => (
                <li key={e.id}>
                  <button
                    className="link"
                    onClick={() => {
                      setSession((s) => ({
                        ...s,
                        animalId: e.id,
                        currentPPct: Math.round(e.breed_proba! * 1000) / 10,
                      }))
                      setSearch('')
                    }}
                  >
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
      ) : (
        <div className="breed-order-head">
          <strong>{animal.name_fr ?? animal.name_en}</strong>
          <span className="muted">
            base {(pBase! * 100).toFixed(0)}% · incrément +{(inc! * 100).toFixed(0)}%/échec ·
            bonus parc +{(parkBonusVal! * 100).toFixed(0)}% · seuil 2 paires{' '}
            {(crossover! * 100).toFixed(0)}%
          </span>
          <button className="small" onClick={() => setSession((s) => ({ ...s, animalId: null }))}>
            Changer
          </button>
        </div>
      )}

      {/* Saved configs */}
      {configs.length > 0 || session.animalId != null ? (
        <div className="breed-order-configs">
          <span className="muted" style={{ fontSize: '0.85rem' }}>Configs :</span>
          {configs.map((cfg) => {
            const a = breedable.find((e) => e.id === cfg.animalId)
            return (
              <div key={cfg.id} className="breed-order-config-chip">
                <button
                  className="small"
                  onClick={() => loadConfig(cfg)}
                  title={
                    a
                      ? `${a.name_fr ?? a.name_en} · ${cfg.groups.map((g) => `${g.count}×Niv.${g.levelA}+${g.levelB}`).join(', ')}`
                      : cfg.name
                  }
                >
                  {cfg.name}
                </button>
                {session.animalId != null && (
                  <button
                    className="small link"
                    onClick={() => overwriteConfig(cfg.id)}
                    title="Écraser avec la session actuelle"
                  >
                    ↑
                  </button>
                )}
                <button
                  className="small link"
                  onClick={() => deleteConfig(cfg.id)}
                  title="Supprimer cette config"
                >
                  ×
                </button>
              </div>
            )
          })}
          {session.animalId != null && !showSaveForm && (
            <button className="small" onClick={() => { setShowSaveForm(true); setSaveName('') }}>
              + Sauvegarder
            </button>
          )}
          {showSaveForm && (
            <div className="breed-order-save-form">
              <input
                type="text"
                placeholder="Nom de la config…"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveConfig()
                  if (e.key === 'Escape') setShowSaveForm(false)
                }}
                autoFocus
              />
              <button className="small" onClick={saveConfig} disabled={!saveName.trim()}>
                OK
              </button>
              <button className="small link" onClick={() => setShowSaveForm(false)}>
                Annuler
              </button>
            </div>
          )}
        </div>
      ) : null}

      {animal && pBase != null && crossover != null && (
        <>
          {/* Probability bar */}
          <div className="breed-order-proba">
            <div className="breed-order-proba-row">
              <label className="wtp">
                Probabilité actuelle :
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={session.currentPPct}
                  onChange={(e) =>
                    setSession((s) => ({
                      ...s,
                      currentPPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                    }))
                  }
                />
                %
              </label>
              <button
                className="small"
                title="Réinitialiser à la proba de base (après un succès)"
                onClick={() =>
                  setSession((s) => ({ ...s, currentPPct: Math.round(pBase * 1000) / 10 }))
                }
              >
                Reset
              </button>
            </div>
            <div className="breed-order-bar">
              <div
                className="breed-order-fill"
                style={{ width: `${Math.min(100, session.currentPPct)}%` }}
              />
              <div
                className="breed-order-threshold"
                style={{ left: `${Math.min(100, crossover * 100)}%` }}
                title={`Seuil 2 paires : ${(crossover * 100).toFixed(0)}%`}
              />
            </div>
          </div>

          {/* Strategy selector + expected outcome of the whole session under
              each strategy, so the births / max-level trade-off is visible
              without switching tabs. */}
          {outcomesByStrategy ? (
            <table className="breed-order-expect">
              <thead>
                <tr>
                  <th>Stratégie</th>
                  <th>Naissances</th>
                  <th>dont niv.&nbsp;{outcomesByStrategy[0].maxLevel}</th>
                </tr>
              </thead>
              <tbody>
                {outcomesByStrategy.map((o) => (
                  <tr
                    key={o.strategy}
                    className={o.strategy === strategy ? 'active' : undefined}
                    onClick={() => setStrategy(o.strategy)}
                  >
                    <td>
                      <label className="breed-order-expect-name">
                        <input
                          type="radio"
                          name="breed-strategy"
                          value={o.strategy}
                          checked={o.strategy === strategy}
                          onChange={() => setStrategy(o.strategy)}
                        />
                        {STRATEGY_LABEL[o.strategy]}
                      </label>
                    </td>
                    <td className="breed-order-expect-val">{o.births.toFixed(2)}</td>
                    <td className="breed-order-expect-val">{o.maxLevelBirths.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="breed-order-strategy">
              {STRATEGIES.map((s) => (
                <label
                  key={s}
                  className={`breed-order-strategy-btn${strategy === s ? ' active' : ''}`}
                >
                  <input
                    type="radio"
                    name="breed-strategy"
                    value={s}
                    checked={strategy === s}
                    onChange={() => setStrategy(s)}
                  />
                  {STRATEGY_LABEL[s]}
                </label>
              ))}
            </div>
          )}

          {/* ── Recommendation (main action zone) ─────────────────────────── */}
          {totalPairs > 0 && recommended ? (
            <div className="breed-order-reco">
              <div className="breed-order-reco-label">Valide maintenant :</div>
              <div className="breed-order-reco-pair">
                paire niv.&nbsp;{recommended.levelA}+{recommended.levelB}
                {recommended.parkBonus && <span className="breed-order-park-badge">parc</span>}
                {recommended.coinBoost && <span className="breed-order-boost-badge">Pièce</span>}
                {recommended.adBoost && <span className="breed-order-boost-badge">Pub</span>}
                {' '}→ offspring niv.&nbsp;
                <strong>{offspringLevel(recommended.levelA, recommended.levelB)}</strong>
              </div>
              <div className="breed-order-actions">
                <button className="breed-order-btn-success" onClick={() => onValidate(true)}>
                  ✓ Succès
                  <span className="breed-order-btn-sub">
                    → {(nextProbability(currentP, pBase, true) * 100).toFixed(0)}%
                  </span>
                </button>
                <button className="breed-order-btn-fail" onClick={() => onValidate(false)}>
                  ✗ Échec
                  <span className="breed-order-btn-sub">
                    → {(nextProbability(currentP, pBase, false) * 100).toFixed(0)}%
                  </span>
                </button>
              </div>
              {boostReco && (
                <div className="breed-order-boost">
                  <span className="breed-order-boost-label">Boosts non configurés :</span>
                  {boostReco.coin && (
                    <BoostLine
                      label="pièce"
                      item={boostReco.coin}
                      maxLevel={outcomes!.maxLevel}
                      onApply={() => applyBoostToGroup(boostReco.coin!.group.id, 'coinBoost')}
                    />
                  )}
                  {boostReco.ad && (
                    <BoostLine
                      label="pub"
                      item={boostReco.ad}
                      maxLevel={outcomes!.maxLevel}
                      onApply={() => applyBoostToGroup(boostReco.ad!.group.id, 'adBoost')}
                    />
                  )}
                </div>
              )}
            </div>
          ) : totalPairs === 0 && session.groups.length > 0 ? (
            <p className="muted">Toutes les paires ont réussi — session terminée.</p>
          ) : null}

          {/* Pairs list */}
          <div className="breed-order-pairs">
            <div className="breed-order-pairs-head">
              <span>
                {totalPairs} paire{totalPairs !== 1 ? 's' : ''} · {session.groups.length}{' '}
                groupe{session.groups.length !== 1 ? 's' : ''}
              </span>
              <button className="small" onClick={addGroup}>
                + Groupe
              </button>
            </div>

            {session.groups.length === 0 && (
              <p className="muted">Ajoute tes paires ou charge une configuration sauvegardée.</p>
            )}

            {/* Rendered in insertion order (stable) so editing doesn't move rows.
                Rank numbers and deltas update in-place via rankMap. */}
            {session.groups.map((group) => {
              const { rank = -1, v = -Infinity } = rankMap.get(group.id) ?? {}
              const offspring = offspringLevel(group.levelA, group.levelB)
              const isFirst = rank === 0
              const delta = v - bestValue
              const configuredExtra =
                (group.coinBoost ? pBase : 0) + (group.adBoost ? pBase : 0)
              const effectivePPct =
                Math.min(1, currentP + (group.parkBonus ? parkBonusVal! : 0) + configuredExtra) *
                100
              return (
                <div key={group.id} className={`breed-order-pair${isFirst ? ' first' : ''}`}>
                  <span className="breed-order-rank">{isFirst ? '→' : rank >= 0 ? `${rank + 1}.` : '–'}</span>
                  <label>
                    A
                    <input
                      type="number"
                      min={1}
                      max={40}
                      value={group.levelA}
                      onChange={(e) =>
                        updateGroup(
                          group.id,
                          'levelA',
                          Math.max(1, Math.min(40, Number(e.target.value) || 1)),
                        )
                      }
                    />
                  </label>
                  <label>
                    B
                    <input
                      type="number"
                      min={1}
                      max={40}
                      value={group.levelB}
                      onChange={(e) =>
                        updateGroup(
                          group.id,
                          'levelB',
                          Math.max(1, Math.min(40, Number(e.target.value) || 1)),
                        )
                      }
                    />
                  </label>
                  <span className="breed-order-offspring">→ niv.&nbsp;{offspring}</span>
                  <label className="breed-order-park-label admin-check">
                    <input
                      type="checkbox"
                      checked={group.parkBonus}
                      onChange={(e) => updateGroup(group.id, 'parkBonus', e.target.checked)}
                    />
                    Parc
                  </label>
                  <label className="breed-order-boost-check admin-check">
                    <input
                      type="checkbox"
                      checked={group.coinBoost}
                      onChange={(e) => updateGroup(group.id, 'coinBoost', e.target.checked)}
                    />
                    Pièce
                  </label>
                  <label className="breed-order-boost-check admin-check">
                    <input
                      type="checkbox"
                      checked={group.adBoost}
                      onChange={(e) => updateGroup(group.id, 'adBoost', e.target.checked)}
                    />
                    Pub
                  </label>
                  {(group.parkBonus || group.coinBoost || group.adBoost) && (
                    <span className="muted" style={{ fontSize: '0.75rem' }}>
                      ({effectivePPct.toFixed(0)}%)
                    </span>
                  )}
                  <label className="breed-order-count-label">
                    <div className="breed-order-count">
                      <button
                        className="small"
                        onClick={() => updateGroup(group.id, 'count', Math.max(1, group.count - 1))}
                      >
                        −
                      </button>
                      <span>{group.count}</span>
                      <button
                        className="small"
                        onClick={() => updateGroup(group.id, 'count', group.count + 1)}
                      >
                        +
                      </button>
                    </div>
                  </label>
                  {dpValues.length > 0 && rank >= 0 && (
                    isFirst
                      ? <span className="breed-order-val muted">ε&nbsp;{bestValue.toFixed(2)}</span>
                      : (() => {
                          const pct = bestValue !== 0 ? (delta / bestValue * 100) : 0
                          return (
                            <span className={`breed-order-val ${pct < -1 ? 'breed-order-val-loss' : 'muted'}`}>
                              {pct.toFixed(1)}%
                            </span>
                          )
                        })()
                  )}
                  <button className="small link" onClick={() => removeGroup(group.id)}>
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
