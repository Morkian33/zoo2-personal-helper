import type { AnimalEntry } from './types'

// Import of the player's zoo from the game's own data: the JSON response of the
// game RPC `park.getAllParksOfUser` (copied from the browser DevTools, Network tab).
// It lists every park (main zoo, secondary zoos, terrarium, aquarium…) with every
// individual animal: species id, coat id, level. Read-only: nothing is sent to the game.

interface GameAnimal {
  animal_id: string
  variant_id?: string
  level?: number
  is_rehab?: boolean
  is_healed?: boolean
}

interface GamePark {
  template_id?: string
  animals?: GameAnimal[]
}

// Per in-game id: number of individuals and highest level.
export interface GameTally {
  count: number
  maxLevel: number
}

export interface ParsedGame {
  animals: Map<string, GameTally> // species id (all coats) -> tally
  variants: Map<string, GameTally> // coat id -> tally
  parks: number
  individuals: number
  skippedRehab: number // animals still being treated in the rehab station (not owned yet)
}

// Accepts the raw RPC response ({"result":{"parks":[...]}}), its `result`, or the parks array.
export function parseGameJson(text: string): ParsedGame {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error("Ce n'est pas du JSON valide (copie bien toute la réponse).")
  }
  const parks = extractParks(data)
  if (!parks) throw new Error('Aucun « parks » trouvé : est-ce bien la réponse de getAllParksOfUser ?')

  const animals = new Map<string, GameTally>()
  const variants = new Map<string, GameTally>()
  let individuals = 0
  let skippedRehab = 0
  for (const park of parks) {
    for (const a of park.animals ?? []) {
      if (!a?.animal_id) continue
      if (a.is_rehab && !a.is_healed) {
        skippedRehab++
        continue
      }
      individuals++
      const level = typeof a.level === 'number' ? a.level : 1
      bump(animals, a.animal_id, level)
      if (a.variant_id) bump(variants, a.variant_id, level)
    }
  }
  return { animals, variants, parks: parks.length, individuals, skippedRehab }
}

function extractParks(data: unknown): GamePark[] | null {
  if (Array.isArray(data)) return data as GamePark[]
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    if (Array.isArray(o.parks)) return o.parks as GamePark[]
    if (o.result) return extractParks(o.result)
  }
  return null
}

function bump(map: Map<string, GameTally>, id: string, level: number) {
  const t = map.get(id)
  if (t) {
    t.count++
    t.maxLevel = Math.max(t.maxLevel, level)
  } else {
    map.set(id, { count: 1, maxLevel: level })
  }
}

// ---------- Matching game ids to the catalog ----------

// Game spellings that differ from the wiki names.
const SYNONYMS: Record<string, string> = {
  afrikan: 'african',
  enchidna: 'echidna',
  ozelot: 'ocelot',
  racoon: 'raccoon',
  peccarie: 'peccary',
  armadilo: 'armadillo',
  sengis: 'sengi',
  grey: 'gray',
  drapple: 'dapple',
}

function words(s: string): string[] {
  return (s.toLowerCase().replace(/'s\b/g, '').match(/[a-z]+/g) ?? []).map((w) => SYNONYMS[w] ?? w)
}
const wordKey = (ws: string[]) => [...new Set(ws)].sort().join(' ')
const flat = (s: string) => words(s).join('')

// Resolves in-game ids to catalog entries: explicit game_id first, then a strict
// fallback (same set of words, in any order: animal_fox_red <-> "Red Fox"). A fallback
// key shared by several animals is ambiguous and left unresolved.
export function buildMatcher(entries: AnimalEntry[]) {
  const byGameId = new Map<string, AnimalEntry>()
  const byWords = new Map<string, AnimalEntry | null>()
  const variantByGameId = new Map<string, { animal: AnimalEntry; variantId: number }>()
  for (const e of entries) {
    if (e.game_id) byGameId.set(e.game_id, e)
    const k = wordKey(words(e.name_en))
    byWords.set(k, byWords.has(k) ? null : e)
    for (const v of e.variants) if (v.game_id) variantByGameId.set(v.game_id, { animal: e, variantId: v.id })
  }

  function animal(gameId: string): { entry: AnimalEntry; guessed: boolean } | null {
    const explicit = byGameId.get(gameId)
    if (explicit) return { entry: explicit, guessed: false }
    const guess = byWords.get(wordKey(words(gameId.replace(/^animal_/, ''))))
    return guess ? { entry: guess, guessed: true } : null
  }

  // Coat id = "<species game id>_<coat>"; the species part is matched first (longest
  // matching prefix, game ids being "_"-separated), then the coat name.
  function variant(gameId: string, speciesIds: Iterable<string>): { animal: AnimalEntry; variantId: number } | null {
    const explicit = variantByGameId.get(gameId)
    if (explicit) return explicit
    let base: string | null = null
    for (const s of speciesIds) if (gameId.startsWith(s + '_') && (!base || s.length > base.length)) base = s
    if (!base) return null
    const species = animal(base)
    if (!species) return null
    const coat = flat(gameId.slice(base.length + 1))
    const v = species.entry.variants.find((x) => flat(x.coat_name) === coat)
    return v ? { animal: species.entry, variantId: v.id } : null
  }

  return { animal, variant }
}

// ---------- Diff against the current personal state ----------

export interface AnimalChange {
  entry: AnimalEntry
  owned_count: number
  max_level: number | null
  guessed: boolean // resolved by word match, not by an explicit game_id
}
export interface VariantChange {
  animal: AnimalEntry
  variantId: number
  coat: string
  owned: boolean
  max_level: number | null
}
export interface ImportPlan {
  animals: AnimalChange[] // only rows that differ from the current state
  variants: VariantChange[]
  unknown: { gameId: string; count: number; kind: 'animal' | 'coat' }[]
  matchedSpecies: number
}

// The game is the source of truth for ownership. owned_count is capped at 2 ("2+").
// The max level is set to the in-game max for owned animals; for animals no longer
// owned it is left untouched (keeps what was reached, e.g. for collections history).
export function planImport(parsed: ParsedGame, entries: AnimalEntry[]): ImportPlan {
  const match = buildMatcher(entries)
  const unknown: ImportPlan['unknown'] = []

  const target = new Map<number, { count: number; maxLevel: number; guessed: boolean }>()
  for (const [gameId, t] of parsed.animals) {
    const m = match.animal(gameId)
    if (!m) {
      unknown.push({ gameId, count: t.count, kind: 'animal' })
      continue
    }
    const prev = target.get(m.entry.id)
    target.set(m.entry.id, {
      count: (prev?.count ?? 0) + t.count,
      maxLevel: Math.max(prev?.maxLevel ?? 0, t.maxLevel),
      guessed: (prev?.guessed ?? false) || m.guessed,
    })
  }

  const targetVar = new Map<number, GameTally>()
  for (const [gameId, t] of parsed.variants) {
    const m = match.variant(gameId, parsed.animals.keys())
    if (!m) {
      unknown.push({ gameId, count: t.count, kind: 'coat' })
      continue
    }
    targetVar.set(m.variantId, t)
  }

  const animals: AnimalChange[] = []
  const variants: VariantChange[] = []
  for (const e of entries) {
    const t = target.get(e.id)
    const owned_count = t ? Math.min(t.count, 2) : 0
    const max_level = t ? t.maxLevel : e.max_level
    if (owned_count !== e.owned_count || max_level !== e.max_level) {
      animals.push({ entry: e, owned_count, max_level, guessed: t?.guessed ?? false })
    }
    for (const v of e.variants) {
      const tv = targetVar.get(v.id)
      const owned = Boolean(tv)
      const vLevel = tv ? tv.maxLevel : v.max_level
      if (owned !== v.owned || vLevel !== v.max_level) {
        variants.push({ animal: e, variantId: v.id, coat: v.coat_name, owned, max_level: vLevel })
      }
    }
  }
  unknown.sort((a, b) => b.count - a.count)
  return { animals, variants, unknown, matchedSpecies: target.size }
}

// getAllParksOfUser only lists animals placed in a park: animals waiting in the
// inventory / transport are missing from it. So by default the import only adds or
// raises (owned count, level, coats) and never removes; removals are opt-in.
export function additiveOnly(plan: ImportPlan): ImportPlan {
  const animals = plan.animals
    .map((c) => ({
      ...c,
      owned_count: Math.max(c.owned_count, c.entry.owned_count),
      max_level: maxOrNull(c.max_level, c.entry.max_level),
    }))
    .filter((c) => c.owned_count !== c.entry.owned_count || c.max_level !== c.entry.max_level)
  const variants = plan.variants
    .map((c) => {
      const cur = c.animal.variants.find((v) => v.id === c.variantId)
      return { ...c, owned: c.owned || Boolean(cur?.owned), max_level: maxOrNull(c.max_level, cur?.max_level ?? null) }
    })
    .filter((c) => {
      const cur = c.animal.variants.find((v) => v.id === c.variantId)
      return c.owned !== Boolean(cur?.owned) || c.max_level !== (cur?.max_level ?? null)
    })
  return { ...plan, animals, variants }
}

function maxOrNull(a: number | null, b: number | null): number | null {
  if (a == null) return b
  if (b == null) return a
  return Math.max(a, b)
}
