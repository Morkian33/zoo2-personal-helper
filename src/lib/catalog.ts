import { supabase } from './supabase'
import { computeMetrics } from './metrics'
import { shelterBiome } from './biome'
import type { AnimalRow, AnimalEntry, UserAnimalState, ShelterLevels } from './types'

export interface CatalogData {
  entries: AnimalEntry[]
  shelters: ShelterLevels
}

// Loads the catalog + the current user's personal state (animals & shelters).
export async function loadCatalog(): Promise<CatalogData> {
  const [animalsRes, userRes, shelterRes] = await Promise.all([
    supabase.from('animals').select('*').order('name_en', { ascending: true }),
    supabase.from('user_animals').select('animal_id, owned_count, max_level'),
    supabase.from('user_shelters').select('biome, level'),
  ])

  if (animalsRes.error) throw animalsRes.error

  const states = new Map<number, UserAnimalState>()
  for (const row of userRes.data ?? []) {
    states.set(row.animal_id as number, {
      owned_count: (row.owned_count as number) ?? 0,
      max_level: (row.max_level as number | null) ?? null,
    })
  }

  const shelters: ShelterLevels = new Map()
  for (const row of shelterRes.data ?? []) {
    shelters.set(row.biome as string, (row.level as number) ?? 0)
  }

  const entries = (animalsRes.data as AnimalRow[]).map((a) => {
    const st = states.get(a.id)
    return {
      ...a,
      metrics: computeMetrics(a),
      owned_count: st?.owned_count ?? 0,
      max_level: st?.max_level ?? null,
    }
  })

  return { entries, shelters }
}

// True when the animal can be bred: at least 2 owned AND an owned biome shelter whose
// level is >= the animal's required shelter level.
export function canBreed(entry: AnimalEntry, shelters: ShelterLevels): boolean {
  if (entry.owned_count < 2) return false
  if (entry.shelter_lvl == null || entry.biome == null) return false
  const sb = shelterBiome(entry.biome)
  if (sb == null) return false
  const level = shelters.get(sb)
  if (level == null) return false // shelter not owned
  return level >= entry.shelter_lvl
}

// Upserts the current user's personal state for an animal.
export async function setUserAnimal(
  userId: string,
  animalId: number,
  patch: Partial<UserAnimalState>,
  current: UserAnimalState,
): Promise<void> {
  const next = { ...current, ...patch }
  const { error } = await supabase.from('user_animals').upsert(
    {
      user_id: userId,
      animal_id: animalId,
      owned_count: next.owned_count,
      max_level: next.max_level,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,animal_id' },
  )
  if (error) throw error
}

// Sets the current user's shelter for a biome. A null level means "not owned" and
// removes the row; otherwise the level (0-3) is upserted.
export async function setUserShelter(
  userId: string,
  biome: string,
  level: number | null,
): Promise<void> {
  if (level == null) {
    const { error } = await supabase
      .from('user_shelters')
      .delete()
      .eq('user_id', userId)
      .eq('biome', biome)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('user_shelters').upsert(
    {
      user_id: userId,
      biome,
      level,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,biome' },
  )
  if (error) throw error
}
