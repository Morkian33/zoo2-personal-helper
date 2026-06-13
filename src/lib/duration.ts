// Converts a game duration like "14h 20m", "12h", "47m" into decimal hours.
// Tolerant to wiki typos: "8h5m", "8h 5", "8h5" are all read as 8h05.
export function parseHours(s: string | null | undefined): number | null {
  if (!s) return null
  const hm = /(\d+)\s*h/.exec(s)
  const mm = /(\d+)\s*m/.exec(s)
  if (!hm && !mm) return null
  const hours = hm ? Number(hm[1]) : 0
  let mins = mm ? Number(mm[1]) : 0
  if (hm && !mm) {
    // "8h 5" / "8h5": a trailing number after the hours is treated as minutes.
    const t = /(\d+)/.exec(s.slice(hm.index + hm[0].length))
    if (t) mins = Number(t[1])
  }
  return hours + mins / 60
}
