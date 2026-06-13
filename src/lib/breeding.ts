// Average number of breeding attempts for a given base success probability.
//
// Game model: on each failure the success probability increases by an increment equal
// to the base probability, but that increment is *capped at 10 percentage points*.
//   increment = min(base, 0.10)
//   p_k = min(base + increment * (k - 1), 1)
// Expected number of attempts = sum_{k>=0} S_k, where S_k = product_{i<=k} (1 - p_i)
// (probability of failing k times in a row). S_0 = 1.
//
// Verified identical to the 14 tiers of the source Google Sheet (full precision).
export function averageBreedingAttempts(baseProba: number): number {
  const incr = Math.min(baseProba, 0.1)
  let survival = 1
  let expected = 1 // S_0 term
  let k = 1
  while (true) {
    const p = Math.min(baseProba + incr * (k - 1), 1)
    survival *= 1 - p
    expected += survival
    if (p >= 1) break
    k++
  }
  return expected
}
