// Server-side persistence for the "Ordre d'élevage" tab (per-user, RLS).
import { supabase } from './supabase'
import type { BreedingConfig, PairGroup, PairGroupDef } from './breedingOrder'

export interface BreedingSession {
  animalId: number | null
  currentPPct: number
  groups: PairGroup[]
  configId: string | null   // config the session was loaded from, if any
}

export const EMPTY_SESSION: BreedingSession = {
  animalId: null,
  currentPPct: 4,
  groups: [],
  configId: null,
}

// Older stored groups predate the boost flags.
type StoredGroup = Omit<PairGroupDef, 'coinBoost' | 'adBoost' | 'used'> & {
  id?: string
  coinBoost?: boolean
  adBoost?: boolean
  used?: number
}

export function hydrateGroup(g: StoredGroup): PairGroup {
  return {
    ...g,
    id: g.id ?? crypto.randomUUID(),
    coinBoost: g.coinBoost ?? false,
    adBoost: g.adBoost ?? false,
    used: Math.max(0, Math.min(g.count, g.used ?? 0)),
  }
}

function hydrateDef(g: StoredGroup): PairGroupDef {
  const { id: _id, ...def } = hydrateGroup(g)
  return def
}

interface ConfigRow {
  id: string
  name: string
  animal_id: number
  p_pct: number | string | null
  groups: StoredGroup[]
}

function rowToConfig(r: ConfigRow): BreedingConfig {
  return {
    id: r.id,
    name: r.name,
    animalId: r.animal_id,
    pPct: r.p_pct == null ? null : Number(r.p_pct),
    groups: (r.groups ?? []).map(hydrateDef),
  }
}

export async function loadBreedingState(): Promise<{
  session: BreedingSession | null
  configs: BreedingConfig[]
}> {
  const [s, c] = await Promise.all([
    supabase
      .from('user_breeding_session')
      .select('animal_id, p_pct, groups, config_id')
      .maybeSingle(),
    supabase
      .from('user_breeding_configs')
      .select('id, name, animal_id, p_pct, groups')
      .order('created_at'),
  ])
  if (s.error) throw s.error
  if (c.error) throw c.error
  const session: BreedingSession | null = s.data
    ? {
        animalId: s.data.animal_id,
        currentPPct: Number(s.data.p_pct),
        groups: ((s.data.groups as StoredGroup[]) ?? []).map(hydrateGroup),
        configId: s.data.config_id,
      }
    : null
  return { session, configs: (c.data as ConfigRow[]).map(rowToConfig) }
}

export async function saveBreedingSession(userId: string, s: BreedingSession): Promise<void> {
  const { error } = await supabase.from('user_breeding_session').upsert(
    {
      user_id: userId,
      animal_id: s.animalId,
      p_pct: s.currentPPct,
      groups: s.groups,
      config_id: s.configId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  if (error) throw error
}

export async function upsertBreedingConfig(userId: string, cfg: BreedingConfig): Promise<void> {
  const { error } = await supabase.from('user_breeding_configs').upsert(
    {
      id: cfg.id,
      user_id: userId,
      name: cfg.name,
      animal_id: cfg.animalId,
      p_pct: cfg.pPct,
      groups: cfg.groups,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )
  if (error) throw error
}

export async function deleteBreedingConfig(id: string): Promise<void> {
  const { error } = await supabase.from('user_breeding_configs').delete().eq('id', id)
  if (error) throw error
}

// ── One-shot migration of the previous localStorage storage ──────────────────

const LEGACY_SESSION_KEY = 'zoo2.breeding.order'
const LEGACY_CONFIGS_KEY = 'zoo2.breeding.configs'

export function readLegacyLocalState(): {
  session: BreedingSession | null
  configs: BreedingConfig[]
} {
  let session: BreedingSession | null = null
  let configs: BreedingConfig[] = []
  try {
    const s = localStorage.getItem(LEGACY_SESSION_KEY)
    if (s) {
      const raw = JSON.parse(s) as { animalId: number | null; currentPPct: number; groups: StoredGroup[] }
      session = {
        animalId: raw.animalId ?? null,
        currentPPct: raw.currentPPct ?? 4,
        groups: (raw.groups ?? []).map(hydrateGroup),
        configId: null,
      }
    }
    const c = localStorage.getItem(LEGACY_CONFIGS_KEY)
    if (c) {
      const raw = JSON.parse(c) as { id: string; name: string; animalId: number; groups: StoredGroup[] }[]
      configs = raw.map((r) => ({
        // Legacy ids were uuids already, but be safe: the server column is uuid.
        id: /^[0-9a-f-]{36}$/i.test(r.id) ? r.id : crypto.randomUUID(),
        name: r.name,
        animalId: r.animalId,
        pPct: null,
        groups: (r.groups ?? []).map(hydrateDef),
      }))
    }
  } catch {
    /* ignore */
  }
  return { session, configs }
}

export function clearLegacyLocalState(): void {
  try {
    localStorage.removeItem(LEGACY_SESSION_KEY)
    localStorage.removeItem(LEGACY_CONFIGS_KEY)
  } catch {
    /* ignore */
  }
}
