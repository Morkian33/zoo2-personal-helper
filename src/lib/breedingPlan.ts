// Breeding-campaign model: expected attempts / coins / ads to reach one success,
// under a fodder policy, accounting for the per-failure pity increment and an
// optional permanent breeding-park bonus.
//
// Per attempt n (1-indexed), the success probability is:
//   natural_n = min(1, base + (n-1) * incr)         with incr = min(base, 0.10)   (pity ladder)
//   q_n       = min(1, natural_n + parkBonus + fodder_n * base)
// where parkBonus = trunc(base/2) (a flat additive bonus on every attempt that does
// NOT change the base, so the pity increment stays based on the raw base), and
// fodder_n is the number of fodders (coin and/or ad) applied on attempt n, each +base.

export interface BreedParams {
  base: number // base success probability, fraction (e.g. 0.04)
  cost: number // coins per launch (= coins per coin-fodder, same price)
  cycleHours: number // breeding duration + 8h cooldown, hours per attempt
  park: boolean // bred in its bonus park (+trunc(base/2))
}

export interface FodderPolicy {
  coinUntil: number // apply 1 coin fodder on attempts 1..coinUntil
  adUntil: number // apply 1 ad fodder on attempts 1..adUntil
}

export interface CampaignResult {
  attempts: number
  coins: number // expected coins spent (launches + coin fodder)
  ads: number // expected ads watched
  hours: number // expected wall-clock (attempts * cycleHours)
}

// Park bonus in probability points, truncated (no half-percent): 4% -> +2%, 3% -> +1%.
export function parkBonus(base: number): number {
  return Math.floor(Math.round(base * 100) / 2) / 100
}

export function simulate(p: BreedParams, policy: FodderPolicy): CampaignResult {
  const incr = Math.min(p.base, 0.1)
  const bonus = p.park ? parkBonus(p.base) : 0
  let surv = 1
  let attempts = 0
  let coinUnits = 0 // in units of `cost` (launch = 1, +1 per coin fodder)
  let ads = 0
  let n = 0
  while (surv > 1e-12 && n < 500) {
    n++
    const natural = Math.min(1, p.base + (n - 1) * incr)
    const coin = n <= policy.coinUntil ? 1 : 0
    const ad = n <= policy.adUntil ? 1 : 0
    const q = Math.min(1, natural + bonus + (coin + ad) * p.base)
    attempts += surv
    coinUnits += surv * (1 + coin)
    ads += surv * ad
    surv *= 1 - q
  }
  return { attempts, coins: coinUnits * p.cost, ads, hours: attempts * p.cycleHours }
}

export interface PolicyRow {
  label: string
  policy: FodderPolicy
  result: CampaignResult
  // vs the no-fodder baseline:
  attemptsSaved: number
  extraCoins: number
  // net value = attemptsSaved * coinsPerCycleSaved - extraCoins (coins only; ads reported apart)
  net: number
}

export interface EnvelopeSegment {
  from: number // optimal from this wtp (coins-per-cycle-saved) upward
  label: string
}

// Each policy's net value is linear in wtp: net_i(w) = attemptsSaved_i * w - extraCoins_i.
// The optimal policy as wtp grows is the upper envelope of these lines. Returns the
// switch points (which policy becomes best from which wtp) and the last threshold.
export function optimalThresholds(rows: PolicyRow[]): {
  segments: EnvelopeSegment[]
  maxThreshold: number
} {
  const lines = rows.map((r) => ({ a: r.attemptsSaved, b: -r.extraCoins, label: r.label }))
  const breaks: number[] = []
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if (Math.abs(lines[i].a - lines[j].a) > 1e-12) {
        const w = (lines[j].b - lines[i].b) / (lines[i].a - lines[j].a)
        if (w > 1e-9) breaks.push(w)
      }
    }
  }
  breaks.sort((a, b) => a - b)
  // Probe just past the largest pairwise crossing to capture the final segment.
  const maxBreak = breaks.length ? breaks[breaks.length - 1] : 0
  const sentinel = maxBreak + Math.max(1, maxBreak * 0.25)
  const lo = [0, ...breaks]
  const argmaxAt = (w: number) => {
    let best = lines[0]
    let bv = -Infinity
    for (const l of lines) {
      const v = l.a * w + l.b
      if (v > bv + 1e-9 || (Math.abs(v - bv) < 1e-9 && l.a > best.a)) {
        bv = v
        best = l
      }
    }
    return best.label
  }
  const segments: EnvelopeSegment[] = []
  for (let k = 0; k < lo.length; k++) {
    const hi = lo[k + 1] ?? sentinel
    const label = argmaxAt((lo[k] + hi) / 2)
    if (!segments.length || segments[segments.length - 1].label !== label) {
      segments.push({ from: lo[k], label })
    }
  }
  // Real last threshold = last actual envelope switch, not the largest (possibly
  // spurious) crossing between near-parallel lines.
  const maxThreshold = segments.length > 1 ? segments[segments.length - 1].from : 0
  return { segments, maxThreshold }
}

// Evaluates a set of fodder policies and ranks them by net value, given how many
// coins the player is willing to pay to save one breeding cycle.
export function evaluatePolicies(
  p: BreedParams,
  coinsPerCycleSaved: number,
  policies: { label: string; policy: FodderPolicy }[],
): PolicyRow[] {
  const baseline = simulate(p, { coinUntil: 0, adUntil: 0 })
  return policies.map(({ label, policy }) => {
    const result = simulate(p, policy)
    const attemptsSaved = baseline.attempts - result.attempts
    const extraCoins = result.coins - baseline.coins
    return {
      label,
      policy,
      result,
      attemptsSaved,
      extraCoins,
      net: attemptsSaved * coinsPerCycleSaved - extraCoins,
    }
  })
}
