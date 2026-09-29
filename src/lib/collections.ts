import type { AnimalEntry } from './types'

// ---- Catalog types ----
export interface CollectionRow {
  id: number
  name: string
  sector: string | null
  star: number | null
  sort: number | null
}
export interface CollectionRequirementRow {
  collection_id: number
  animal_id: number
  variant_id: number | null
  required_level: number
}

// ---- Parsing the wiki "Collections" page ----
export interface ParsedRequirement {
  level: number
  target: string // wiki page / animal name
  coat: string | null
}
export interface ParsedCollection {
  name: string
  sector: string
  star: number | null
  sort: number
  requirements: ParsedRequirement[]
}

const API = 'https://zoo2animalpark.fandom.com/api.php'

export async function fetchCollectionsWikitext(): Promise<string> {
  const p = new URLSearchParams({
    action: 'parse', page: 'Collections', prop: 'wikitext', format: 'json', formatversion: '2', origin: '*',
  })
  const res = await fetch(`${API}?${p.toString()}`)
  if (!res.ok) throw new Error(`Wiki HTTP ${res.status}`)
  const d = await res.json()
  if (d.error) throw new Error(d.error.info ?? 'Page Collections introuvable')
  return d.parse.wikitext as string
}

function cleanHeading(s: string): string {
  return s
    .replace(/=/g, '')
    .replace(/\[\[([^\]]*)\]\]/g, (_m, inner: string) => (inner.includes('|') ? (inner.split('|').pop() ?? '') : inner))
    .trim()
}

export function parseCollections(wt: string): ParsedCollection[] {
  const out: ParsedCollection[] = []
  let sector = ''
  let star: number | null = null
  let cur: ParsedCollection | null = null

  for (const line of wt.split('\n')) {
    if (line.startsWith('===')) {
      const m = line.match(/(\d+)\s*star/i)
      if (m) star = Number(m[1])
      continue
    }
    if (line.startsWith('==')) {
      sector = cleanHeading(line)
      continue
    }
    if (line.startsWith('!') && !line.startsWith('![[')) {
      const name = line.replace(/^!+/, '').trim()
      if (name && !['Collection', 'Image', 'Set to complete'].includes(name)) {
        cur = { name, sector, star, sort: out.length, requirements: [] }
        out.push(cur)
      }
      continue
    }
    const rm = line.match(/^\*\s*Level\s*(\d+)\s*\[\[([^\]]+)\]\]\s*(?:\(([^)]+)\))?/)
    if (rm && cur) {
      const inner = rm[2]
      const target = inner.split('|')[0].trim()
      const display = inner.includes('|') ? (inner.split('|').pop() ?? '').trim() : null
      let coat: string | null = rm[3] ?? null
      if (!coat && display) {
        const mm = display.match(/\(([^)]+)\)/)
        if (mm) coat = mm[1]
      }
      if (!coat && display) coat = coatFromDisplay(target, display)
      cur.requirements.push({ level: Number(rm[1]), target, coat })
    }
  }
  return out
}

// ---- Resolving requirements against our catalog ----
function norm(c: string): string {
  return c.toLowerCase().replace(/-/g, ' ').replace(/&/g, 'and').replace(/\s+/g, ' ').trim()
}

// Some links carry the coat in the display text only, as a prefix or suffix of
// the species name: `[[Domestic Goat|Domestic Goat White]]`,
// `[[Peafowl|Piebald Peafowl]]`. Spelling variants of the species itself
// (`[[Komodo dragon|Komodo Dragon]]`, `[[Red Ruffed Lemur|Red-Ruffed Lemur]]`)
// normalise to the same string and yield no coat.
function coatFromDisplay(target: string, display: string): string | null {
  const t = norm(target)
  const d = norm(display)
  if (d === t) return null
  if (d.startsWith(t + ' ')) return display.trim().slice(target.trim().length).trim()
  if (d.endsWith(' ' + t)) return display.trim().slice(0, display.trim().length - target.trim().length).trim()
  return null
}

// Collections-page coat names that differ from our Coat_Box coat names.
const COAT_ALIASES: Record<string, string> = {
  'domestic pig|brown and white': 'brown',
  'red fox|silver': 'silver fox',
  'moose|white': 'white moose',
  'red-bellied piranha|orange blue': 'blue orange',
}

export interface ResolvedRequirement {
  animal_id: number
  variant_id: number | null
  required_level: number
}
export interface ResolvedCollection {
  name: string
  sector: string
  star: number | null
  sort: number
  requirements: ResolvedRequirement[]
}
export interface Unresolved {
  collection: string
  target: string
  coat: string | null
}

export function resolveCollections(
  parsed: ParsedCollection[],
  entries: AnimalEntry[],
): { collections: ResolvedCollection[]; unresolved: Unresolved[] } {
  const byName = new Map<string, number>()
  for (const e of entries) {
    byName.set(e.name_en.toLowerCase(), e.id)
    if (e.name_fr) byName.set(e.name_fr.toLowerCase(), e.id)
  }
  const vById = new Map<string, number>()
  for (const e of entries) for (const v of e.variants) vById.set(`${e.id}|${norm(v.coat_name)}`, v.id)

  const collections: ResolvedCollection[] = []
  const unresolved: Unresolved[] = []

  for (const pc of parsed) {
    const reqs: ResolvedRequirement[] = []
    for (const r of pc.requirements) {
      const animalId = byName.get(r.target.toLowerCase())
      if (animalId == null) {
        unresolved.push({ collection: pc.name, target: r.target, coat: r.coat })
        continue
      }
      if (r.coat == null) {
        reqs.push({ animal_id: animalId, variant_id: null, required_level: r.level })
        continue
      }
      const nc = norm(r.coat)
      const aliased = COAT_ALIASES[`${r.target.toLowerCase()}|${nc}`] ?? nc
      const vid = vById.get(`${animalId}|${aliased}`) ?? vById.get(`${animalId}|${nc}`)
      if (vid == null) {
        unresolved.push({ collection: pc.name, target: r.target, coat: r.coat })
        continue
      }
      reqs.push({ animal_id: animalId, variant_id: vid, required_level: r.level })
    }
    collections.push({ name: pc.name, sector: pc.sector, star: pc.star, sort: pc.sort, requirements: reqs })
  }
  return { collections, unresolved }
}
