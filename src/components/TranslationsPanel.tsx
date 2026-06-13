import { useMemo, useState } from 'react'
import { setAnimalNameFr, setBiomeLabel, setVariantCoatFr } from '../lib/catalog'
import type { AnimalEntry, BiomeLabels } from '../lib/types'

// Admin editor for FR labels: biomes (global) and per-variant coat names.
export function TranslationsPanel({
  entries,
  biomeLabels,
}: {
  entries: AnimalEntry[]
  biomeLabels: BiomeLabels
}) {
  const biomes = useMemo(
    () => [...new Set(entries.map((e) => e.biome).filter(Boolean))].sort() as string[],
    [entries],
  )
  const animals = useMemo(
    () => [...entries].sort((a, b) => a.name_en.localeCompare(b.name_en, 'fr')),
    [entries],
  )
  const variants = useMemo(
    () =>
      entries
        .flatMap((e) => e.variants.map((v) => ({ ...v, animal: e.name_fr ?? e.name_en })))
        .sort((a, b) => a.animal.localeCompare(b.animal, 'fr')),
    [entries],
  )

  const [biomeDraft, setBiomeDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(biomes.map((b) => [b, biomeLabels.get(b) ?? ''])),
  )
  const [animalDraft, setAnimalDraft] = useState<Record<number, string>>(() =>
    Object.fromEntries(animals.map((a) => [a.id, a.name_fr ?? ''])),
  )
  const [variantDraft, setVariantDraft] = useState<Record<number, string>>(() =>
    Object.fromEntries(variants.map((v) => [v.id, v.coat_name_fr ?? ''])),
  )
  const [onlyMissing, setOnlyMissing] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  function flash(msg: string) {
    setStatus(msg)
  }

  const q = search.trim().toLowerCase()
  const shownAnimals = animals.filter((a) => {
    if (onlyMissing && (animalDraft[a.id] ?? '').trim()) return false
    return !q || a.name_en.toLowerCase().includes(q)
  })
  const shownVariants = variants.filter((v) => {
    if (onlyMissing && (variantDraft[v.id] ?? '').trim()) return false
    return !q || `${v.animal} ${v.coat_name}`.toLowerCase().includes(q)
  })

  return (
    <div className="admin">
      <h2>Libellés FR</h2>
      {status && <p className="status">{status}</p>}

      <h3>Biomes</h3>
      <div className="admin-form">
        {biomes.map((b) => (
          <label key={b}>
            {b}
            <input
              value={biomeDraft[b] ?? ''}
              onChange={(e) => setBiomeDraft((d) => ({ ...d, [b]: e.target.value }))}
              onBlur={() =>
                setBiomeLabel(b, biomeDraft[b])
                  .then(() => flash(`Biome « ${b} » enregistré`))
                  .catch((e) => flash('Erreur : ' + (e instanceof Error ? e.message : '')))
              }
            />
          </label>
        ))}
      </div>

      <div className="filters">
        <input
          type="search"
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="admin-check">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          Sans FR seulement
        </label>
      </div>

      <h3>
        Noms d'animaux <span className="count">{shownAnimals.length}</span>
      </h3>
      <div className="admin-form">
        {shownAnimals.map((a) => (
          <label key={a.id}>
            {a.name_en}
            <input
              value={animalDraft[a.id] ?? ''}
              onChange={(e) => setAnimalDraft((d) => ({ ...d, [a.id]: e.target.value }))}
              onBlur={() =>
                setAnimalNameFr(a.id, animalDraft[a.id])
                  .then(() => flash(`Animal « ${a.name_en} » enregistré`))
                  .catch((e) => flash('Erreur : ' + (e instanceof Error ? e.message : '')))
              }
            />
          </label>
        ))}
      </div>

      <h3>
        Coats de variants <span className="count">{shownVariants.length}</span>
      </h3>
      <div className="admin-form">
        {shownVariants.map((v) => (
          <label key={v.id}>
            {v.animal} — {v.coat_name}
            <input
              value={variantDraft[v.id] ?? ''}
              onChange={(e) => setVariantDraft((d) => ({ ...d, [v.id]: e.target.value }))}
              onBlur={() =>
                setVariantCoatFr(v.id, variantDraft[v.id])
                  .then(() => flash(`Coat « ${v.coat_name} » enregistré`))
                  .catch((e) => flash('Erreur : ' + (e instanceof Error ? e.message : '')))
              }
            />
          </label>
        ))}
      </div>
      <p className="muted">Les libellés mis à jour s'appliquent partout après un rechargement de l'app.</p>
    </div>
  )
}
