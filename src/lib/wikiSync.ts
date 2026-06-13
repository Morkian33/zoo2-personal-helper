import { fetchWikiAnimal, wikiTitleFromUrl, parseWikitext } from './wiki'
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
  title: string
  result?: WikiResult
  error?: string
}

const BATCH_SIZE = 50
const BATCH_DELAY_MS = 300

// Fetches the wikitext of many pages in batches of 50 (one request each) and parses
// them. Far fewer requests than one-per-page. `onProgress(done)` reports pages handled.
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
      for (const pg of d.query?.pages ?? []) {
        const title = pg.title as string
        if (pg.missing) {
          out.push({ title, error: 'page manquante' })
          continue
        }
        const wt: string | undefined = pg.revisions?.[0]?.slots?.main?.content
        if (!wt) {
          out.push({ title, error: 'pas de contenu' })
          continue
        }
        try {
          out.push({ title, result: parseWikitext(wt, knownBiomes) })
        } catch (e) {
          out.push({ title, error: e instanceof Error ? e.message : 'parse' })
        }
      }
    } catch (e) {
      for (const t of chunk) out.push({ title: t, error: e instanceof Error ? e.message : 'erreur' })
    }
    done += chunk.length
    onProgress?.(done)
    if (i + BATCH_SIZE < titles.length) await sleep(BATCH_DELAY_MS)
  }
  return out
}

export { fetchWikiAnimal, wikiTitleFromUrl }
