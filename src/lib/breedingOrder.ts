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
}

export type PairGroupDef = Omit<PairGroup, 'id'>

export interface BreedingConfig {
  id: string
  name: string
  animalId: number
  groups: PairGroupDef[]
}

// ── Full session analysis ──────────────────────────────────────────────────────
//
// Returns, for each group, the expected total offspring level for the whole session
// if that group is validated FIRST under three scenarios:
//   base   — no fodder boost
//   boost1 — one fodder applied to that first attempt (+pBase to its effective prob)
//   boost2 — two fodders stacked on that first attempt (+2·pBase)
//
// All three scenarios share the same inner DP (no boost remaining), so the
// memoisation is built once and reused across all three computations.
//
// Boost semantics: "if you can apply one boost (coin OR ad), which pair benefits most
// from having it applied when you validate it next?"  The computation assumes the boost
// goes on whichever pair's first step we're evaluating and the rest of the session runs
// without boosts. Saving a boost for a later step would require boost-count as a DP
// state dimension; in practice the difference is negligible.

export interface GroupAnalysis {
  base: number[]
  boost1: number[]
  boost2: number[]
}

export function analyseGroups(
  groups: PairGroup[],
  currentP: number,
  pBase: number,
): GroupAnalysis {
  if (groups.length === 0) return { base: [], boost1: [], boost2: [] }

  const inc = Math.min(pBase, 0.1)
  const parkBonus = pairParkBonus(pBase)
  const levels = groups.map((g) => offspringLevel(g.levelA, g.levelB))
  const bonuses = groups.map((g) => (g.parkBonus ? parkBonus : 0))
  const memo = new Map<string, number>()

  // Inner DP: expected value for the remaining session assuming no boosts.
  // Uses a copy-based approach (counts.slice()) for correctness with memoisation.
  function dp(counts: number[], p: number): number {
    const key = counts.join(',') + '|' + p.toFixed(6)
    const cached = memo.get(key)
    if (cached !== undefined) return cached

    let best = 0
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] === 0) continue
      const ep = Math.min(1, p + bonuses[i])
      const next = counts.slice()
      next[i]--
      const val =
        ep * (levels[i] + dp(next, pBase)) + (1 - ep) * dp(next, Math.min(p + inc, 1))
      if (val > best) best = val
    }

    memo.set(key, best)
    return best
  }

  // Compute the session value when group i is validated FIRST with `extraBoost`
  // added to its effective probability.  All subsequent steps follow the inner DP.
  function firstStepValues(extraBoost: number): number[] {
    const baseCounts = groups.map((g) => g.count)
    return groups.map((_, i) => {
      if (baseCounts[i] === 0) return -Infinity
      const ep = Math.min(1, currentP + bonuses[i] + extraBoost)
      const next = baseCounts.slice()
      next[i]--
      return (
        ep * (levels[i] + dp(next, pBase)) +
        (1 - ep) * dp(next, Math.min(currentP + inc, 1))
      )
    })
  }

  return {
    base: firstStepValues(0),
    boost1: firstStepValues(pBase),
    boost2: firstStepValues(2 * pBase),
  }
}
