import type { BiomeLabels } from './types'

// FR biome label, falling back to the English name.
export function biomeLabel(labels: BiomeLabels, biome: string | null): string {
  if (biome == null) return '—'
  return labels.get(biome) ?? biome
}
