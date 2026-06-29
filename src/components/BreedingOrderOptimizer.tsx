import { useMemo, useState } from 'react'
import type { AnimalEntry } from '../lib/types'
import {
  offspringLevel,
  breedingOrderCrossover,
  nextProbability,
  computeGroupValues,
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

function loadSession(): SessionState {
  try {
    const s = localStorage.getItem(SESSION_KEY)
    if (s) return JSON.parse(s) as SessionState
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

export function BreedingOrderOptimizer({ entries }: { entries: AnimalEntry[] }) {
  const [session, setSessionRaw] = useState<SessionState>(loadSession)
  const [configs, setConfigsRaw] = useState<BreedingConfig[]>(loadConfigs)
  const [search, setSearch] = useState('')
  const [saveName, setSaveName] = useState('')
  const [showSaveForm, setShowSaveForm] = useState(false)

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

  const dpValues = useMemo(
    () =>
      pBase != null && session.groups.length > 0
        ? computeGroupValues(session.groups, currentP, pBase)
        : [],
    [session.groups, currentP, pBase],
  )

  const ranked = useMemo(() => {
    if (dpValues.length === 0) return session.groups.map((g, i) => ({ g, i, v: -Infinity }))
    return session.groups
      .map((g, i) => ({ g, i, v: dpValues[i] }))
      .sort((a, b) => b.v - a.v)
  }, [session.groups, dpValues])

  const recommended = ranked[0]?.g ?? null
  const bestValue = ranked[0]?.v ?? 0
  const totalPairs = session.groups.reduce((s, g) => s + g.count, 0)

  // ── Pair mutations ────────────────────────────────────────────────────────

  function addGroup() {
    const id = crypto.randomUUID()
    setSession((s) => ({
      ...s,
      groups: [...s.groups, { id, levelA: 5, levelB: 5, count: 1, parkBonus: false }],
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
    setSession((s) => {
      let groups = s.groups
      if (success) {
        groups = groups
          .map((g) => (g.id === recommended.id ? { ...g, count: g.count - 1 } : g))
          .filter((g) => g.count > 0)
      }
      return { ...s, currentPPct: Math.round(newP * 1000) / 10, groups }
    })
  }

  // ── Configs ───────────────────────────────────────────────────────────────

  function loadConfig(cfg: BreedingConfig) {
    const groups: PairGroup[] = cfg.groups.map((def) => ({
      ...def,
      id: crypto.randomUUID(),
    }))
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

  function deleteConfig(id: string) {
    setConfigs(configs.filter((c) => c.id !== id))
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
                <button className="small" onClick={() => loadConfig(cfg)} title={
                  a ? `${a.name_fr ?? a.name_en} · ${cfg.groups.map(g => `${g.count}×Niv.${g.levelA}+${g.levelB}`).join(', ')}` : cfg.name
                }>
                  {cfg.name}
                </button>
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
                onKeyDown={(e) => { if (e.key === 'Enter') saveConfig(); if (e.key === 'Escape') setShowSaveForm(false) }}
                autoFocus
              />
              <button className="small" onClick={saveConfig} disabled={!saveName.trim()}>
                OK
              </button>
              <button className="small link" onClick={() => setShowSaveForm(false)}>Annuler</button>
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

          {/* ── Recommendation (main action zone) ─────────────────────────── */}
          {totalPairs > 0 && recommended ? (
            <div className="breed-order-reco">
              <div className="breed-order-reco-label">Valide maintenant :</div>
              <div className="breed-order-reco-pair">
                paire niv.&nbsp;{recommended.levelA}+{recommended.levelB}
                {recommended.parkBonus && <span className="breed-order-park-badge">parc</span>}
                {' '}→ offspring niv.&nbsp;
                <strong>{offspringLevel(recommended.levelA, recommended.levelB)}</strong>
                <span className="muted" style={{ fontSize: '0.8rem' }}>
                  {' '}(espérance session {bestValue.toFixed(2)})
                </span>
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

            {ranked.map(({ g: group, v }, rank) => {
              const offspring = offspringLevel(group.levelA, group.levelB)
              const isFirst = rank === 0
              const delta = v - bestValue
              const effectivePPct =
                Math.min(1, currentP + (group.parkBonus ? parkBonusVal! : 0)) * 100
              return (
                <div key={group.id} className={`breed-order-pair${isFirst ? ' first' : ''}`}>
                  <span className="breed-order-rank">{isFirst ? '→' : `${rank + 1}.`}</span>
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
                    {group.parkBonus && (
                      <span className="muted" style={{ fontSize: '0.75rem' }}>
                        ({effectivePPct.toFixed(0)}%)
                      </span>
                    )}
                  </label>
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
                  {dpValues.length > 0 && (
                    <span className="muted breed-order-val">
                      {isFirst ? v.toFixed(2) : `${v.toFixed(2)} (${delta.toFixed(2)})`}
                    </span>
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
