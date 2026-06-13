// Raw catalog row (table public.animals), as returned by Supabase.
export interface AnimalRow {
  id: number
  name_en: string
  name_fr: string | null
  biome: string | null
  shelter_lvl: number | null
  price_value: number | null
  price_unit: string | null
  size: number | null
  breed_proba: number | null
  breed_cost: number | null
  breed_duration: string | null
  xp_feeding_value: number | null
  xp_feeding_time: string | null
  xp_playing_value: number | null
  xp_playing_time: string | null
  xp_cleaning_value: number | null
  xp_cleaning_time: string | null
  max_animal_per_enclosure: number | null
  popularity: number | null
  base_selling_price: number | null
  release_date: string | null
  feed_x2_cost: number | null
  wiki_title: string | null
  url: string | null
}

// Derived metrics (recomputed in-app from the raw row + game models).
export interface AnimalMetrics {
  sizeAdjusted: number | null
  nbOptimal: number | null
  optimalTiles: number | null
  xpFeedingPerHour: number | null
  xpPlayingPerHour: number | null
  xpCleaningPerHour: number | null
  sumXpPerHour: number | null
  sumXpPerHourPerSize: number | null
  sumXpPerHourPerSizeAdjusted: number | null
  sumXpPerDay: number | null
  popularityPerSize: number | null
  popularityPerSizeAdjusted: number | null
  averageAttempts: number | null
  newbornCost: number | null
  breedingDelta: number | null
  sellDeltaLvl1: number | null
  sellDeltaLvl20: number | null
}

// Per-user state for an animal (table public.user_animals).
// owned_count: 0 = none, 1 = exactly one, 2 = two or more ("2+", can breed).
export interface UserAnimalState {
  owned_count: number
  max_level: number | null
}

// Per-user shelter level for each biome (table public.user_shelters).
// Map keyed by biome; an absent key means the shelter is not owned. When present,
// the value is the shelter level (0-3); level 0 is owned-but-base, distinct from absent.
export type ShelterLevels = Map<string, number>

// Variant coat (table public.animal_variants); stats inherited from the base animal.
export interface VariantRow {
  id: number
  animal_id: number
  coat_name: string
  coat_name_fr: string | null
  obtained_from: string | null
  release_date: string | null
}

// Global biome label lookup (name_en -> name_fr).
export type BiomeLabels = Map<string, string>

// Per-user variant ownership (table public.user_variants).
export interface UserVariantState {
  owned: boolean
  max_level: number | null
}

export interface VariantEntry extends VariantRow {
  owned: boolean
  max_level: number | null
}

// Merged view consumed by the table.
export interface AnimalEntry extends AnimalRow {
  metrics: AnimalMetrics
  owned_count: number
  max_level: number | null
  variants: VariantEntry[]
}
