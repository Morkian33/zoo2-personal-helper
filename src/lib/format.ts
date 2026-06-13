// Shared number formatters (French locale).
export const int = (v: number) => Math.round(v).toLocaleString('fr-FR')
export const dec2 = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
export const signed = (v: number) => (v > 0 ? '+' : '') + Math.round(v).toLocaleString('fr-FR')

// "owned_count" (0/1/2) as a short label.
export const ownedLabel = (n: number) => (n === 0 ? '—' : n === 1 ? '1' : '2+')
