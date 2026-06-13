import type { AnimalRow } from './types'

// Pulls catalog fields from the English Fandom wiki via the MediaWiki action API.
// CORS works with origin=*, so this runs client-side.
const API = 'https://zoo2animalpark.fandom.com/api.php'

export type WikiAnimal = Partial<AnimalRow>

export interface WikiVariant {
  coat_name: string
  obtained_from: string | null
  release_date: string | null
}

export interface WikiResult {
  animal: WikiAnimal
  variants: WikiVariant[]
}

// Strips [[wiki links]] (keeping display text) and collapses whitespace.
function cleanLinks(s: string): string {
  return s
    .replace(/\[\[([^\]]*)\]\]/g, (_m, inner: string) =>
      inner.includes('|') ? inner.split('|').pop() ?? '' : inner,
    )
    .replace(/\s+/g, ' ')
    .trim()
}

export function wikiTitleFromUrl(url: string): string | null {
  try {
    const u = new URL(url.trim())
    const m = u.pathname.match(/\/wiki\/(.+)$/)
    if (!m) return null
    return decodeURIComponent(m[1]).replace(/_/g, ' ')
  } catch {
    return null
  }
}

// Splits a template body into key=value params, handling | nested inside [[ ]] / {{ }}.
function parseParams(body: string): Record<string, string> {
  const parts: string[] = []
  let cur = ''
  let depth = 0
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2)
    if (two === '[[' || two === '{{') {
      depth++
      cur += two
      i++
      continue
    }
    if (two === ']]' || two === '}}') {
      depth--
      cur += two
      i++
      continue
    }
    const c = body[i]
    if (c === '|' && depth === 0) {
      parts.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  parts.push(cur)

  const out: Record<string, string> = {}
  for (const p of parts) {
    const eq = p.indexOf('=')
    if (eq < 0) continue
    out[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim()
  }
  return out
}

// Parses the first {{Name|...}} template.
function parseTemplate(wt: string, name: string): Record<string, string> | null {
  const start = wt.indexOf('{{' + name)
  if (start < 0) return null
  const end = wt.indexOf('}}', start)
  if (end < 0) return null
  return parseParams(wt.slice(start + 2 + name.length, end))
}

// Parses every {{Name|...}} template on the page.
function parseAllTemplates(wt: string, name: string): Record<string, string>[] {
  const res: Record<string, string>[] = []
  let idx = 0
  for (;;) {
    const start = wt.indexOf('{{' + name, idx)
    if (start < 0) break
    const end = wt.indexOf('}}', start)
    if (end < 0) break
    res.push(parseParams(wt.slice(start + 2 + name.length, end)))
    idx = end + 2
  }
  return res
}

function num(s: string | undefined | null): number | null {
  if (!s) return null
  const m = s.replace(/\s/g, '').match(/[\d.,]+/)
  if (!m) return null
  // These game fields are integers; the wiki uses BOTH "," and "." as thousands
  // separators (e.g. "1,080" and "4.400"), so strip both.
  const digits = m[0].replace(/[.,]/g, '')
  return digits ? Number(digits) : null
}

// Reformats a duration to a canonical "Xh Ym", tolerating wiki typos ("8h5m", "8h 5").
// Hours are always kept when minutes are present (so "0h 47m" stays "0h 47m").
function normalizeDuration(s: string | undefined): string | null {
  if (!s) return null
  const hm = /(\d+)\s*h/.exec(s)
  const mm = /(\d+)\s*m/.exec(s)
  if (!hm && !mm) return s.trim() || null
  const h = hm ? Number(hm[1]) : 0
  let m = mm ? Number(mm[1]) : 0
  let hasMinutes = mm != null
  if (hm && !mm) {
    const t = /(\d+)/.exec(s.slice(hm.index + hm[0].length))
    if (t) {
      m = Number(t[1])
      hasMinutes = true
    }
  }
  return hasMinutes ? `${h}h ${m}m` : `${h}h`
}

function valueTime(s: string | undefined): { value: number | null; time: string | null } {
  if (!s) return { value: null, time: null }
  const m = s.match(/\s*([\d.,]+)\s*\(([^)]+)\)/)
  if (m) return { value: num(m[1]), time: normalizeDuration(m[2]) }
  return { value: num(s), time: null }
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}
function wikiDate(s: string | undefined): string | null {
  if (!s) return null
  const m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/)
  if (!m) return null
  const mo = MONTHS[m[2].toLowerCase()]
  if (!mo) return null
  return `${m[3]}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }
  return dp[m][n]
}

// Maps a scraped biome to a known one, tolerating wiki typos (e.g. "Savana" -> "Savanna").
function normalizeBiome(raw: string | undefined, known: string[]): string | null {
  if (!raw) return null
  const t = raw.trim()
  const lc = t.toLowerCase()
  const exact = known.find((b) => b.toLowerCase() === lc)
  if (exact) return exact
  let best: string | null = null
  let bd = Infinity
  for (const b of known) {
    const d = levenshtein(lc, b.toLowerCase())
    if (d < bd) {
      bd = d
      best = b
    }
  }
  return best != null && bd <= 2 ? best : t
}

export async function fetchWikiAnimal(url: string, knownBiomes: string[] = []): Promise<WikiResult> {
  const title = wikiTitleFromUrl(url)
  if (!title) throw new Error('URL wiki invalide')

  const params = new URLSearchParams({
    action: 'parse',
    page: title,
    prop: 'wikitext',
    format: 'json',
    formatversion: '2',
    origin: '*',
  })
  const res = await fetch(`${API}?${params.toString()}`)
  if (!res.ok) throw new Error(`Wiki HTTP ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error.info ?? 'Page introuvable')
  return parseWikitext(data.parse.wikitext, knownBiomes)
}

// Parses a page's wikitext into an animal + its variants (no network).
export function parseWikitext(wt: string, knownBiomes: string[] = []): WikiResult {
  // The wiki uses two infobox templates with identical fields: {{Animal}} and {{Example}}.
  // Pick whichever actually carries the infobox params (title1).
  const candidates = [parseTemplate(wt, 'Animal'), parseTemplate(wt, 'Example')].filter(
    (c): c is Record<string, string> => c != null,
  )
  const ib = candidates.find((c) => 'title1' in c) ?? candidates[0]
  if (!ib) throw new Error('Infobox introuvable sur la page')

  const priceRaw = ib.price ?? ''
  const price_unit = /C\.png|coin/i.test(priceRaw)
    ? 'Coins'
    : /D\.png|diamond/i.test(priceRaw)
      ? 'Diamonds'
      : null
  const feeding = valueTime(ib.feeding)
  const playing = valueTime(ib.playing)
  const cleaning = valueTime(ib.cleaning)
  const prob = num(ib.probability)

  // Body fields (outside the infobox).
  const encMatch = wt.match(/up to\s+(\d+)\b[^\n]*enclosure/i)
  let popularity: number | null = null
  let base_selling_price: number | null = null
  const popIdx = wt.search(/==\s*Popularity/i)
  if (popIdx >= 0) {
    const sec = wt.slice(popIdx)
    const rm = sec.match(/\|-\s*\n\|\s*1\s*\n\|\s*([\d.,]+)\s*\n\|\s*([\d.,]+)/)
    if (rm) {
      popularity = Number(rm[1].replace(/[.,]/g, ''))
      base_selling_price = Number(rm[2].replace(/[.,]/g, ''))
    }
  }

  const out: WikiAnimal = {}
  const set = (k: keyof AnimalRow, v: unknown) => {
    if (v !== null && v !== undefined && v !== '') (out as Record<string, unknown>)[k] = v
  }
  set('name_en', ib.title1)
  set('biome', normalizeBiome(ib.biome ? cleanLinks(ib.biome) : undefined, knownBiomes))
  set('shelter_lvl', num(ib.shelter_level))
  set('breed_proba', prob != null ? prob / 100 : null)
  set('breed_cost', num(ib.cost))
  set('breed_duration', normalizeDuration(ib.duration))
  set('price_value', num(ib.price))
  set('price_unit', price_unit)
  set('size', num(ib.size))
  set('xp_feeding_value', feeding.value)
  set('xp_feeding_time', feeding.time)
  set('xp_playing_value', playing.value)
  set('xp_playing_time', playing.time)
  set('xp_cleaning_value', cleaning.value)
  set('xp_cleaning_time', cleaning.time)
  set('max_animal_per_enclosure', encMatch ? Number(encMatch[1]) : null)
  set('popularity', popularity)
  set('base_selling_price', base_selling_price)
  set('feed_x2_cost', num(ib.x2_xp_feed))
  set('release_date', wikiDate(ib.release_date))

  // Variants are {{Coat_Box}} entries on the same page.
  const variants: WikiVariant[] = parseAllTemplates(wt, 'Coat_Box')
    .map((cb) => ({
      coat_name: (cb.row1 ?? '').trim(),
      obtained_from: cb.obtained_from ? cleanLinks(cb.obtained_from) || null : null,
      release_date: wikiDate(cb.release_date),
    }))
    .filter((v) => v.coat_name)

  return { animal: out, variants }
}
