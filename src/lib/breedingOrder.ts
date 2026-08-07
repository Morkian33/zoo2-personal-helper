// Offspring level from two parents (see GAME_MECHANICS.md for the full formula).
// Level 40 = shiny; always produces level-20 offspring regardless of the other parent.
export function offspringLevel(levelA: number, levelB: number): number {
  return Math.min(Math.floor((Math.min(levelA, 40) + Math.min(levelB, 40)) / 2) + 1, 20)
}

// Probability threshold above which you should validate higher-level pairs first.
// Only exact for 2 pairs; use analyseGroups for the general case.
export function breedingOrderCrossover(pBase: number): number {
  const inc = Math.min(pBase, 0.1)
  const b = pBase - inc
  return (b + Math.sqrt(b * b + 4 * inc)) / 2
}

// Park bonus: flat additive to success probability for same-biome pairs.
export function pairParkBonus(pBase: number): number {
  return Math.floor(Math.round(pBase * 100) / 2) / 100
}

// Update the shared pity counter after one validation attempt.
export function nextProbability(currentP: number, pBase: number, success: boolean): number {
  if (success) return pBase
  return Math.min(currentP + Math.min(pBase, 0.1), 1)
}

export interface PairGroup {
  id: string
  levelA: number
  levelB: number
  count: number
  parkBonus: boolean
  coinBoost: boolean  // fodder coin: pay breed_cost extra → +pBase to attempt prob
  adBoost: boolean    // fodder ad: watch an ad → +pBase to attempt prob (stackable)
}

export type PairGroupDef = Omit<PairGroup, 'id'>

export interface BreedingConfig {
  id: string
  name: string
  animalId: number
  groups: PairGroupDef[]
}

// ── DP-based ordering ──────────────────────────────────────────────────────────
//
// For each group i, returns the expected total offspring level for the whole
// session if group i is validated FIRST.  Per-group boosts (coinBoost, adBoost)
// are factored into each group's effective probability for the entire DP.
//
// To find the optimal first pick: take argmax of the returned array.

export interface ExpectedOutcomes {
  births: number        // expected number of successful breedings
  maxLevelBirths: number // expected number of offspring at maxLevel
  maxLevel: number      // best offspring level reachable with the current pairs
}

// Expected outcomes of playing the whole session under the policy induced by
// `scoreOf` (i.e. always validating the group the DP ranks first at the current
// pity level).  Same recursion as analyseGroups, but each state also carries the
// two counters we want to report.
export function expectedOutcomes(
  groups: PairGroup[],
  currentP: number,
  pBase: number,
  scoreOf: (level: number) => number = (l) => l,
): ExpectedOutcomes {
  if (groups.length === 0) return { births: 0, maxLevelBirths: 0, maxLevel: 0 }

  const inc = Math.min(pBase, 0.1)
  const parkBonus = pairParkBonus(pBase)
  const levels = groups.map((g) => offspringLevel(g.levelA, g.levelB))
  const maxLevel = Math.max(...levels)

  const extraBoosts = groups.map(
    (g) => (g.parkBonus ? parkBonus : 0) + (g.coinBoost ? pBase : 0) + (g.adBoost ? pBase : 0),
  )

  // [score, expected births, expected maxLevel births]
  type State = [number, number, number]
  const memo = new Map<string, State>()

  function dp(counts: number[], p: number): State {
    const key = counts.join(',') + '|' + p.toFixed(6)
    const cached = memo.get(key)
    if (cached !== undefined) return cached

    let best: State | null = null
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] === 0) continue
      const ep = Math.min(1, p + extraBoosts[i])
      const next = counts.slice()
      next[i]--
      const onSuccess = dp(next, pBase)
      const onFail = dp(next, Math.min(p + inc, 1))
      const isMax = levels[i] === maxLevel ? 1 : 0
      const cand: State = [
        ep * (scoreOf(levels[i]) + onSuccess[0]) + (1 - ep) * onFail[0],
        ep * (1 + onSuccess[1]) + (1 - ep) * onFail[1],
        ep * (isMax + onSuccess[2]) + (1 - ep) * onFail[2],
      ]
      if (best === null || cand[0] > best[0]) best = cand
    }

    const result: State = best ?? [0, 0, 0]
    memo.set(key, result)
    return result
  }

  const [, births, maxLevelBirths] = dp(groups.map((g) => g.count), currentP)
  return { births, maxLevelBirths, maxLevel }
}

export function analyseGroups(
  groups: PairGroup[],
  currentP: number,
  pBase: number,
  scoreOf: (level: number) => number = (l) => l,
): number[] {
  if (groups.length === 0) return []

  const inc = Math.min(pBase, 0.1)
  const parkBonus = pairParkBonus(pBase)
  const levels = groups.map((g) => offspringLevel(g.levelA, g.levelB))

  // Effective probability for group i at pity level p (park + configured fodder boosts).
  const extraBoosts = groups.map(
    (g) => (g.parkBonus ? parkBonus : 0) + (g.coinBoost ? pBase : 0) + (g.adBoost ? pBase : 0),
  )

  const memo = new Map<string, number>()

  function dp(counts: number[], p: number): number {
    const key = counts.join(',') + '|' + p.toFixed(6)
    const cached = memo.get(key)
    if (cached !== undefined) return cached

    let best = 0
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] === 0) continue
      const ep = Math.min(1, p + extraBoosts[i])
      const next = counts.slice()
      next[i]--
      const val =
        ep * (scoreOf(levels[i]) + dp(next, pBase)) + (1 - ep) * dp(next, Math.min(p + inc, 1))
      if (val > best) best = val
    }

    memo.set(key, best)
    return best
  }

  const baseCounts = groups.map((g) => g.count)
  return groups.map((_, i) => {
    if (baseCounts[i] === 0) return -Infinity
    const ep = Math.min(1, currentP + extraBoosts[i])
    const next = baseCounts.slice()
    next[i]--
    return ep * (scoreOf(levels[i]) + dp(next, pBase)) + (1 - ep) * dp(next, Math.min(currentP + inc, 1))
  })
}
