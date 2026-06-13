import { fetchWikiAnimal, wikiTitleFromUrl, parseWikitext } from './wiki'
import { shelterBiome } from './biome'
import type { WikiResult } from './wiki'
import type { AnimalEntry, AnimalRow } from './types'

const API = 'https://zoo2animalpark.fandom.com/api.php'
const WIKI = 'https://zoo2animalpark.fandom.com/wiki/'

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// Wiki-sourced fields (name_fr / coat_name_fr are NOT on the wiki, so never touched).
export const SYNC_NUM: (keyof AnimalRow)[] = [
  'shelter_lvl', 'breed_proba', 'breed_cost', 'price_value', 'size',
  'xp_feeding_value', 'xp_playing_value', 'xp_cleaning_value',
  'max_animal_per_enclosure', 'popularity', 'base_selling_price', 'feed_x2_cost',
]
export const SYNC_STR: (keyof AnimalRow)[] = [
  'biome', 'breed_duration', 'price_unit',
  'xp_feeding_time', 'xp_playing_time', 'xp_cleaning_time', 'release_date',
]

export type FieldDiff = Record<string, { from: unknown; to: unknown }>

// Diff a wiki result against the current row; only fields the wiki actually provided.
export function diffAnimal(cur: Partial<AnimalRow>, w: Partial<AnimalRow>): FieldDiff {
  const diff: FieldDiff = {}
  for (const f of SYNC_NUM) {
    const wv = w[f]
    if (wv == null) continue
    const c = cur[f]
    if (c == null || Math.abs(Number(c) - Number(wv)) > 1e-6) diff[f] = { from: c ?? null, to: wv }
  }
  for (const f of SYNC_STR) {
    const wv = w[f]
    if (wv == null) continue
    // Biomes sharing a shelter (e.g. "Water Oceanside Zoo" vs wiki "Water") are not a
    // change — keep the manual Oceanside refinement instead of reverting to "Water".
    if (f === 'biome' && shelterBiome(String(cur.biome ?? '')) === shelterBiome(String(wv))) continue
    if (String(cur[f] ?? '') !== String(wv)) diff[f] = { from: cur[f] ?? null, to: wv }
  }
  return diff
}

export function urlForEntry(e: AnimalEntry): string {
  return e.url ?? WIKI + encodeURIComponent((e.wiki_title ?? e.name_en).replace(/ /g, '_'))
}

export function urlForTitle(title: string): string {
  return WIKI + encodeURIComponent(title.replace(/ /g, '_'))
}

// Lists every animal page title from the wiki's "Category:Animal" (paginated).
export async function listAnimalPages(): Promise<string[]> {
  const titles: string[] = []
  let cont: string | undefined
  for (let i = 0; i < 30; i++) {
    const p = new URLSearchParams({
      action: 'query', list: 'categorymembers', cmtitle: 'Category:Animal',
      cmlimit: '500', cmnamespace: '0', format: 'json', formatversion: '2', origin: '*',
    })
    if (cont) p.set('cmcontinue', cont)
    const res = await fetch(`${API}?${p.toString()}`)
    if (!res.ok) throw new Error(`Wiki HTTP ${res.status}`)
    const d = await res.json()
    for (const m of d.query?.categorymembers ?? []) titles.push(m.title as string)
    cont = d.continue?.cmcontinue
    if (!cont) break
  }
  return titles
}

export interface BatchItem {
  requested: string // the title we asked for (maps back to our catalog row)
  result?: WikiResult
  error?: string
}

const BATCH_SIZE = 50
const BATCH_DELAY_MS = 300

// Fetches the wikitext of many pages in batches of 50 (one request each) and parses
// them. Each item keeps the REQUESTED title (resolving normalization + redirects), so a
// page whose infobox title1 differs from its page name still maps back to our row.
export async function fetchWikiBatch(
  titles: string[],
  knownBiomes: string[],
  onProgress?: (done: number) => void,
): Promise<BatchItem[]> {
  const out: BatchItem[] = []
  let done = 0
  for (let i = 0; i < titles.length; i += BATCH_SIZE) {
    const chunk = titles.slice(i, i + BATCH_SIZE)
    const p = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2',
      prop: 'revisions', rvprop: 'content', rvslots: 'main',
      titles: chunk.join('|'), redirects: '1', origin: '*',
    })
    try {
      const res = await fetch(`${API}?${p.toString()}`)
      if (!res.ok) throw new Error(`Wiki HTTP ${res.status}`)
      const d = await res.json()
      const norm = new Map<string, string>((d.query?.normalized ?? []).map((r: { from: string; to: string }) => [r.from, r.to]))
      const redir = new Map<string, string>((d.query?.redirects ?? []).map((r: { from: string; to: string }) => [r.from, r.to]))
      const pages = new Map<string, { missing?: boolean; revisions?: { slots?: { main?: { content?: string } } }[] }>(
        (d.query?.pages ?? []).map((pg: { title: string }) => [pg.title, pg]),
      )
      const resolve = (t: string) => {
        let c = norm.get(t) ?? t
        c = redir.get(c) ?? c
        return c
      }
      for (const t of chunk) {
        const pg = pages.get(resolve(t))
        if (!pg || pg.missing) {
          out.push({ requested: t, error: 'page manquante' })
          continue
        }
        const wt = pg.revisions?.[0]?.slots?.main?.content
        if (!wt) {
          out.push({ requested: t, error: 'pas de contenu' })
          continue
        }
        try {
          out.push({ requested: t, result: parseWikitext(wt, knownBiomes) })
        } catch (e) {
          out.push({ requested: t, error: e instanceof Error ? e.message : 'parse' })
        }
      }
    } catch (e) {
      for (const t of chunk) out.push({ requested: t, error: e instanceof Error ? e.message : 'erreur' })
    }
    done += chunk.length
    onProgress?.(done)
    if (i + BATCH_SIZE < titles.length) await sleep(BATCH_DELAY_MS)
  }
  return out
}

export { fetchWikiAnimal, wikiTitleFromUrl }
