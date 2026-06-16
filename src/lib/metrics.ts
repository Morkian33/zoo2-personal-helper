import { optimalEnclosure } from './enclosure'
import { averageBreedingAttempts } from './breeding'
import { parseHours } from './duration'
import type { AnimalRow, AnimalMetrics } from './types'

// Global multipliers (XP events, etc.). Constant for v1, made configurable later.
const XP_MULTIPLIER = 1
const COST_MULTIPLIER = 1
// Resale value of a level-20 animal (factor applied to the base selling price).
const SELL_LVL20_FACTOR = 1.95

function xpPerHour(value: number | null, time: string | null): number | null {
  const hours = parseHours(time)
  if (value == null || hours == null || hours === 0) return null
  return (value / hours) * XP_MULTIPLIER
}

export function computeMetrics(a: AnimalRow): AnimalMetrics {
  const sizing = optimalEnclosure(a.size, a.max_animal_per_enclosure)

  const sizeAdjusted = sizing?.sizeEffective ?? a.size ?? null

  const xpFeedingPerHour = xpPerHour(a.xp_feeding_value, a.xp_feeding_time)
  const xpPlayingPerHour = xpPerHour(a.xp_playing_value, a.xp_playing_time)
  const xpCleaningPerHour = xpPerHour(a.xp_cleaning_value, a.xp_cleaning_time)

  const sumXpPerHour =
    xpFeedingPerHour != null && xpPlayingPerHour != null && xpCleaningPerHour != null
      ? xpFeedingPerHour + xpPlayingPerHour + xpCleaningPerHour
      : null

  const div = (n: number | null, d: number | null | undefined) =>
    n != null && d != null && d !== 0 ? n / d : null

  // "Feed x2" doubles the XP of one feeding, so the extra XP gained by paying is
  // xp_feeding_value, for a cost of feed_x2_cost. Higher = more XP per coin spent.
  const feedX2XpPerCoin = div(a.xp_feeding_value, a.feed_x2_cost)

  const averageAttempts =
    a.breed_proba != null && a.breed_proba > 0 ? averageBreedingAttempts(a.breed_proba) : null

  const newbornCost =
    averageAttempts != null && a.breed_cost != null ? averageAttempts * a.breed_cost : null

  const breedingDelta =
    a.price_unit === 'Coins' && a.price_value != null && newbornCost != null
      ? a.price_value * COST_MULTIPLIER - newbornCost
      : null

  const sellDeltaLvl1 =
    a.base_selling_price != null && newbornCost != null ? a.base_selling_price - newbornCost : null

  const sellDeltaLvl20 =
    a.base_selling_price != null && newbornCost != null
      ? a.base_selling_price * SELL_LVL20_FACTOR - newbornCost
      : null

  return {
    sizeAdjusted,
    nbOptimal: sizing?.nbOptimal ?? null,
    optimalTiles: sizing?.optimalTiles ?? null,
    xpFeedingPerHour,
    xpPlayingPerHour,
    xpCleaningPerHour,
    sumXpPerHour,
    sumXpPerHourPerSize: div(sumXpPerHour, a.size),
    sumXpPerHourPerSizeAdjusted: div(sumXpPerHour, sizeAdjusted),
    sumXpPerDay: sumXpPerHour != null ? sumXpPerHour * 24 : null,
    popularityPerSize: div(a.popularity, a.size),
    popularityPerSizeAdjusted: div(a.popularity, sizeAdjusted),
    feedX2XpPerCoin,
    averageAttempts,
    newbornCost,
    breedingDelta,
    sellDeltaLvl1,
    sellDeltaLvl20,
  }
}
