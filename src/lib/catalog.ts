import { supabase } from './supabase'
import { computeMetrics } from './metrics'
import { shelterBiome } from './biome'
import type {
  AnimalRow,
  AnimalEntry,
  UserAnimalState,
  ShelterLevels,
  VariantRow,
  VariantEntry,
  UserVariantState,
  BiomeLabels,
} from './types'
import type { CollectionRow, CollectionRequirementRow } from './collections'

export interface CatalogData {
  entries: AnimalEntry[]
  shelters: ShelterLevels
  biomeLabels: BiomeLabels
  collections: CollectionRow[]
  requirements: CollectionRequirementRow[]
}

// Loads the catalog (animals + variants) and the current user's personal state, merged.
export async function loadCatalog(): Promise<CatalogData> {
  const [animalsRes, userRes, shelterRes, variantsRes, userVarRes, biomeRes, colRes, colReqRes] =
    await Promise.all([
      supabase.from('animals').select('*').order('name_en', { ascending: true }),
      supabase.from('user_animals').select('animal_id, owned_count, max_level'),
      supabase.from('user_shelters').select('biome, level'),
      supabase.from('animal_variants').select('*').order('coat_name', { ascending: true }),
      supabase.from('user_variants').select('variant_id, owned, max_level'),
      supabase.from('biome_labels').select('name_en, name_fr'),
      supabase.from('collections').select('*').order('sort', { ascending: true }),
      supabase.from('collection_requirements').select('collection_id, animal_id, variant_id, required_level'),
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

  const varStates = new Map<number, UserVariantState>()
  for (const row of userVarRes.data ?? []) {
    varStates.set(row.variant_id as number, {
      owned: Boolean(row.owned),
      max_level: (row.max_level as number | null) ?? null,
    })
  }

  const variantsByAnimal = new Map<number, VariantEntry[]>()
  for (const v of (variantsRes.data as VariantRow[] | null) ?? []) {
    const st = varStates.get(v.id)
    const entry: VariantEntry = { ...v, owned: st?.owned ?? false, max_level: st?.max_level ?? null }
    const list = variantsByAnimal.get(v.animal_id) ?? []
    list.push(entry)
    variantsByAnimal.set(v.animal_id, list)
  }

  const biomeLabels: BiomeLabels = new Map()
  for (const row of biomeRes.data ?? []) {
    if (row.name_fr) biomeLabels.set(row.name_en as string, row.name_fr as string)
  }

  const entries = (animalsRes.data as AnimalRow[]).map((a) => {
    const st = states.get(a.id)
    return {
      ...a,
      metrics: computeMetrics(a),
      owned_count: st?.owned_count ?? 0,
      max_level: st?.max_level ?? null,
      variants: variantsByAnimal.get(a.id) ?? [],
    }
  })

  return {
    entries,
    shelters,
    biomeLabels,
    collections: (colRes.data as CollectionRow[] | null) ?? [],
    requirements: (colReqRes.data as CollectionRequirementRow[] | null) ?? [],
  }
}

// True when the animal can be bred: at least 2 owned (any coats of the species) AND an
// owned biome shelter whose level is >= the animal's required shelter level.
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

// Upserts the current user's ownership state for a variant.
export async function setUserVariant(
  userId: string,
  variantId: number,
  patch: Partial<UserVariantState>,
  current: UserVariantState,
): Promise<void> {
  const next = { ...current, ...patch }
  const { error } = await supabase.from('user_variants').upsert(
    {
      user_id: userId,
      variant_id: variantId,
      owned: next.owned,
      max_level: next.max_level,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,variant_id' },
  )
  if (error) throw error
}

// Sets the current user's shelter for a biome (null level = not owned, removes the row).
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
    { user_id: userId, biome, level, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,biome' },
  )
  if (error) throw error
}

// Admin: set the FR label of a biome (global lookup).
export async function setBiomeLabel(nameEn: string, nameFr: string | null): Promise<void> {
  const { error } = await supabase
    .from('biome_labels')
    .upsert({ name_en: nameEn, name_fr: nameFr || null }, { onConflict: 'name_en' })
  if (error) throw error
}

// Admin: set the FR coat name of a variant.
export async function setVariantCoatFr(variantId: number, fr: string | null): Promise<void> {
  const { error } = await supabase
    .from('animal_variants')
    .update({ coat_name_fr: fr || null })
    .eq('id', variantId)
  if (error) throw error
}

// Admin: upsert the variant coats of an animal (used after a wiki pre-fill).
export async function upsertVariants(
  animalId: number,
  variants: { coat_name: string; obtained_from: string | null; release_date: string | null }[],
): Promise<void> {
  if (variants.length === 0) return
  const rows = variants.map((v) => ({ animal_id: animalId, ...v }))
  const { error } = await supabase
    .from('animal_variants')
    .upsert(rows, { onConflict: 'animal_id,coat_name' })
  if (error) throw error
}
