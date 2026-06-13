import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadCatalog, setUserAnimal, setUserShelter, setUserVariant } from '../lib/catalog'
import { shelterBiome } from '../lib/biome'
import type { AnimalEntry, ShelterLevels, VariantEntry, BiomeLabels } from '../lib/types'
import { SheltersPanel } from './SheltersPanel'
import { AnalysisTable } from './AnalysisTable'
import { InventoryTable } from './InventoryTable'
import { AdminPanel } from './AdminPanel'

type Tab = 'analysis' | 'zoo' | 'admin'

// Container: owns catalog data + personal state, and switches between the
// "Analyse" (decision table), "Mon zoo" (data entry) and "Admin" (catalog editing) tabs.
export function CatalogView({ userId }: { userId: string | null }) {
  const [entries, setEntries] = useState<AnimalEntry[]>([])
  const [shelters, setShelters] = useState<ShelterLevels>(new Map())
  const [biomeLabels, setBiomeLabels] = useState<BiomeLabels>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [tab, setTab] = useState<Tab>('analysis')

  const reload = useCallback(async () => {
    const { entries, shelters, biomeLabels } = await loadCatalog()
    setEntries(entries)
    setShelters(shelters)
    setBiomeLabels(biomeLabels)
  }, [])

  useEffect(() => {
    reload()
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur de chargement'))
      .finally(() => setLoading(false))
  }, [reload])

  useEffect(() => {
    if (!userId) {
      setIsAdmin(false)
      return
    }
    supabase.rpc('is_admin').then(
      ({ data }) => setIsAdmin(Boolean(data)),
      () => setIsAdmin(false),
    )
  }, [userId])

  const biomes = useMemo(
    () => [...new Set(entries.map((e) => e.biome).filter(Boolean))].sort() as string[],
    [entries],
  )
  const shelterBiomes = useMemo(
    () =>
      [...new Set(entries.map((e) => shelterBiome(e.biome)).filter(Boolean))].sort() as string[],
    [entries],
  )

  function patchEntry(id: number, patch: Partial<AnimalEntry>) {
    setEntries((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  }

  function persistAnimal(e: AnimalEntry, patch: { owned_count?: number; max_level?: number | null }) {
    if (!userId) return
    setUserAnimal(userId, e.id, patch, { owned_count: e.owned_count, max_level: e.max_level }).catch(
      (err) => console.error('Failed to save animal state', err),
    )
  }

  function patchVariant(v: VariantEntry, patch: Partial<VariantEntry>) {
    setEntries((list) =>
      list.map((a) =>
        a.id === v.animal_id
          ? { ...a, variants: a.variants.map((x) => (x.id === v.id ? { ...x, ...patch } : x)) }
          : a,
      ),
    )
  }

  function persistVariant(v: VariantEntry, patch: { owned?: boolean; max_level?: number | null }) {
    if (!userId) return
    setUserVariant(userId, v.id, patch, { owned: v.owned, max_level: v.max_level }).catch((err) =>
      console.error('Failed to save variant state', err),
    )
  }

  function setShelter(b: string, level: number | null) {
    setShelters((prev) => {
      const next = new Map(prev)
      if (level == null) next.delete(b)
      else next.set(b, level)
      return next
    })
    if (userId) {
      setUserShelter(userId, b, level).catch((err) => console.error('Failed to save shelter', err))
    }
  }

  if (loading) return <p className="muted">Chargement du catalogue…</p>
  if (error) return <p className="status error">Erreur : {error}</p>

  return (
    <>
      <nav className="tabs">
        <button className={`tab ${tab === 'analysis' ? 'active' : ''}`} onClick={() => setTab('analysis')}>
          Analyse
        </button>
        <button className={`tab ${tab === 'zoo' ? 'active' : ''}`} onClick={() => setTab('zoo')}>
          Mon zoo
        </button>
        {isAdmin && (
          <button className={`tab ${tab === 'admin' ? 'active' : ''}`} onClick={() => setTab('admin')}>
            Admin
          </button>
        )}
      </nav>

      {tab === 'analysis' && (
        <AnalysisTable entries={entries} shelters={shelters} biomes={biomes} biomeLabels={biomeLabels} />
      )}

      {tab === 'zoo' && (
        <div className="myzoo">
          <SheltersPanel
            biomes={shelterBiomes}
            shelters={shelters}
            biomeLabels={biomeLabels}
            disabled={!userId}
            onSet={setShelter}
          />
          <InventoryTable
            entries={entries}
            shelters={shelters}
            biomes={biomes}
            biomeLabels={biomeLabels}
            disabled={!userId}
            onSetOwned={(e, count) => {
              persistAnimal(e, { owned_count: count })
              patchEntry(e.id, { owned_count: count })
            }}
            onSetMaxLevel={(e, value) => patchEntry(e.id, { max_level: value })}
            onCommitMaxLevel={(e) => persistAnimal(e, { max_level: e.max_level })}
            onSetVariantOwned={(v, owned) => {
              persistVariant(v, { owned })
              patchVariant(v, { owned })
            }}
            onSetVariantLevel={(v, value) => patchVariant(v, { max_level: value })}
            onCommitVariantLevel={(v) => persistVariant(v, { max_level: v.max_level })}
          />
        </div>
      )}

      {tab === 'admin' && isAdmin && (
        <AdminPanel entries={entries} onSaved={() => void reload()} />
      )}
    </>
  )
}
