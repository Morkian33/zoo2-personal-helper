// Enclosure optimization (Zoo 2: Animal Park).
//
// Game mechanic:
//  - 1 tile = a 4x4 square = 16 size units.
//  - An enclosure is at least 9 tiles, expandable one tile at a time.
//  - For N animals of a given `size`, you need T = max(9, ceil(N*size/16)) tiles.
//  - "size effective" = real space occupied per animal (waste included) = T*16/N.
//
// We pick the number of animals N (<= max per enclosure) that MINIMIZES the size
// effective (i.e. the waste). Efficiency = size / sizeEffective; equals 1 when size is
// a multiple of 16. On ties, prefer fewer tiles.
//
// Verified identical to the 106 combinations of the Google Sheet ("Taille effective").

const TILE = 16
const MIN_TILES = 9

export interface EnclosureOptimum {
  nbOptimal: number
  sizeEffective: number
  optimalTiles: number
}

export function optimalEnclosure(
  size: number | null,
  maxPerEnclosure: number | null,
): EnclosureOptimum | null {
  if (size == null || size <= 0 || maxPerEnclosure == null || maxPerEnclosure < 1) return null

  let best: EnclosureOptimum | null = null
  for (let n = 1; n <= maxPerEnclosure; n++) {
    const tiles = Math.max(MIN_TILES, Math.ceil((n * size) / TILE))
    const sizeEffective = (tiles * TILE) / n
    if (
      best == null ||
      sizeEffective < best.sizeEffective - 1e-9 ||
      (Math.abs(sizeEffective - best.sizeEffective) < 1e-9 && tiles < best.optimalTiles)
    ) {
      best = { nbOptimal: n, sizeEffective, optimalTiles: tiles }
    }
  }
  return best
}
