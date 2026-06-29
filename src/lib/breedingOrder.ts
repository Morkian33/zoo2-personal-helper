// Offspring level from two parents (see GAME_MECHANICS.md for the full formula).
// Level 40 = shiny; always produces level-20 offspring regardless of the other parent.
export function offspringLevel(levelA: number, levelB: number): number {
  return Math.min(Math.floor((Math.min(levelA, 40) + Math.min(levelB, 40)) / 2) + 1, 20)
}

// Probability threshold above which you should validate higher-level pairs first.
// Only exact for 2 pairs; use computeGroupValues for the general case.
export function breedingOrderCrossover(pBase: number): number {
  const inc = Math.min(pBase, 0.1)
  const b = pBase - inc
  return (b + Math.sqrt(b * b + 4 * inc)) / 2
}

// Park bonus: flat additive to success probability for same-biome pairs.
// Matches parkBonus() in breedingPlan.ts.
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

// Serialisable subset saved in configs (no transient id).
export type PairGroupDef = Omit<PairGroup, 'id'>

export interface BreedingConfig {
  id: string
  name: string
  animalId: number
  groups: PairGroupDef[]
}

// Expected total offspring level for the whole session if each group is validated first,
// computed via exact DP (optimal play for all subsequent choices).
//
// The pity counter is global per-species: success resets to pBase, fail increments by inc.
// Each group may have a park bonus (additive to the pity probability for that attempt only).
export function computeGroupValues(
  groups: PairGroup[],
  currentP: number,
  pBase: number,
): number[] {
  if (groups.length === 0) return []
  const inc = Math.min(pBase, 0.1)
  const bonus = pairParkBonus(pBase)
  const levels = groups.map((g) => offspringLevel(g.levelA, g.levelB))
  const bonuses = groups.map((g) => (g.parkBonus ? bonus : 0))

  const memo = new Map<string, number>()

  // p = current pity probability (global, shared)
  function dp(counts: number[], p: number): number {
    const key = counts.join(',') + '|' + p.toFixed(6)
    if (memo.has(key)) return memo.get(key)!

    let best = 0
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] === 0) continue
      const ep = Math.min(1, p + bonuses[i]) // effective prob for this pair
      const next = counts.slice()
      next[i]--
      // success: offspring gained, pity resets to pBase
      // fail: no offspring, pity increments (bonus does NOT affect the pity increment)
      const val = ep * (levels[i] + dp(next, pBase)) + (1 - ep) * dp(next, Math.min(p + inc, 1))
      if (val > best) best = val
    }

    memo.set(key, best)
    return best
  }

  const baseCounts = groups.map((g) => g.count)
  return groups.map((g, i) => {
    if (g.count === 0) return -Infinity
    const ep = Math.min(1, currentP + bonuses[i])
    const next = baseCounts.slice()
    next[i]--
    return ep * (levels[i] + dp(next, pBase)) + (1 - ep) * dp(next, Math.min(currentP + inc, 1))
  })
}
