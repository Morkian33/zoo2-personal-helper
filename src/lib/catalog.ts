import { supabase } from './supabase'
import { computeMetrics } from './metrics'
import type { AnimalRow, AnimalEntry, UserAnimalState } from './types'

// Loads the catalog + the current user's personal state, and merges them.
export async function loadCatalog(): Promise<AnimalEntry[]> {
  const [animalsRes, userRes] = await Promise.all([
    supabase.from('animals').select('*').order('name_en', { ascending: true }),
    supabase.from('user_animals').select('animal_id, owned, breeding_unlocked'),
  ])

  if (animalsRes.error) throw animalsRes.error
  // user_animals may be empty (no session yet); tolerate it.
  const states = new Map<number, UserAnimalState>()
  for (const row of userRes.data ?? []) {
    states.set(row.animal_id as number, {
      owned: row.owned as boolean,
      breeding_unlocked: row.breeding_unlocked as boolean,
    })
  }

  return (animalsRes.data as AnimalRow[]).map((a) => {
    const st = states.get(a.id)
    return {
      ...a,
      metrics: computeMetrics(a),
      owned: st?.owned ?? false,
      breeding_unlocked: st?.breeding_unlocked ?? false,
    }
  })
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
      owned: next.owned,
      breeding_unlocked: next.breeding_unlocked,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,animal_id' },
  )
  if (error) throw error
}
