import { useMemo, useState } from 'react'
import { setAnimalNameFr, setBiomeLabel, setVariantCoatFr } from '../lib/catalog'
import { norm } from '../lib/format'
import type { AnimalEntry, BiomeLabels } from '../lib/types'

// Admin editor for FR labels: biomes (global) and per-variant coat names.
export function TranslationsPanel({
  entries,
  biomeLabels,
  onEditAnimal,
}: {
  entries: AnimalEntry[]
  biomeLabels: BiomeLabels
  onEditAnimal: (id: number) => void
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

  // Filter on the original DB value, not the live draft — otherwise a row would
  // vanish mid-typing as soon as its draft becomes non-empty.
  const q = norm(search.trim())
  const shownAnimals = animals.filter((a) => {
    if (onlyMissing && (a.name_fr ?? '').trim()) return false
    return !q || norm(a.name_en).includes(q)
  })
  const shownVariants = variants.filter((v) => {
    if (onlyMissing && (v.coat_name_fr ?? '').trim()) return false
    return !q || norm(`${v.animal} ${v.coat_name}`).includes(q)
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
            <span className="label-row">
              {a.name_en}
              {a.biome && <span className="muted"> · {biomeLabels.get(a.biome) ?? a.biome}</span>}
              <button
                type="button"
                className="link edit-jump"
                title="Ouvrir dans l'onglet Animaux"
                onClick={() => onEditAnimal(a.id)}
              >
                ✎
              </button>
            </span>
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
