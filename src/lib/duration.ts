// Converts a game duration like "14h 20m", "12h", "47m" into decimal hours.
export function parseHours(s: string | null | undefined): number | null {
  if (!s) return null
  const h = /(\d+)\s*h/.exec(s)
  const m = /(\d+)\s*m/.exec(s)
  if (!h && !m) return null
  return (h ? Number(h[1]) : 0) + (m ? Number(m[1]) : 0) / 60
}
