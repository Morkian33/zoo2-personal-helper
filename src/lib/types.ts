// Raw catalog row (table public.animals), as returned by Supabase.
export interface AnimalRow {
  id: number
  name_en: string
  name_fr: string | null
  biome: string | null
  shelter_lvl: number | null
  variant: boolean
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
export interface UserAnimalState {
  owned: boolean
  breeding_unlocked: boolean
}

// Merged view consumed by the table.
export interface AnimalEntry extends AnimalRow {
  metrics: AnimalMetrics
  owned: boolean
  breeding_unlocked: boolean
}
