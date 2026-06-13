// Some biomes share a single shelter. Animals in "Water Oceanside Zoo" live in a
// dedicated aquatic park (they can only be placed there), but the shelter is the same
// as "Water". So shelter ownership/level is keyed by the canonical shelter biome.
const SHELTER_ALIASES: Record<string, string> = {
  'Water Oceanside Zoo': 'Water',
}

export function shelterBiome(biome: string | null): string | null {
  if (biome == null) return null
  return SHELTER_ALIASES[biome] ?? biome
}
