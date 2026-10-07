import { useState } from 'react'
import { applyGameImport } from '../lib/catalog'
import { parseGameJson, planImport, type ImportPlan, type ParsedGame } from '../lib/gameImport'
import type { AnimalEntry } from '../lib/types'

type Phase = 'closed' | 'input' | 'review' | 'applying' | 'done'

const label = (e: AnimalEntry) => e.name_fr ?? e.name_en
const lvl = (v: number | null) => (v == null ? '∅' : String(v))
const count = (n: number) => (n >= 2 ? '2+' : String(n))

// "Mon zoo": syncs owned counts / max levels / coats from the game's own data
// (response of park.getAllParksOfUser, pasted or loaded as a file). Shows the
// diff before writing anything.
export function GameImportPanel({
  userId,
  entries,
  onApplied,
}: {
  userId: string | null
  entries: AnimalEntry[]
  onApplied: () => Promise<void>
}) {
  const [phase, setPhase] = useState<Phase>('closed')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedGame | null>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [doneMsg, setDoneMsg] = useState('')

  function analyze(raw: string) {
    setError(null)
    try {
      const p = parseGameJson(raw)
      setParsed(p)
      setPlan(planImport(p, entries))
      setPhase('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lecture impossible')
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    const raw = await file.text()
    setText('')
    analyze(raw)
  }

  async function apply() {
    if (!userId || !plan) return
    setPhase('applying')
    try {
      await applyGameImport(
        userId,
        plan.animals.map((c) => ({
          animal_id: c.entry.id,
          owned_count: c.owned_count,
          max_level: c.max_level,
          favorite: c.entry.favorite,
        })),
        plan.variants.map((c) => ({ variant_id: c.variantId, owned: c.owned, max_level: c.max_level })),
      )
      await onApplied()
      setDoneMsg(`Import appliqué : ${plan.animals.length} animal(aux), ${plan.variants.length} pelage(s) mis à jour.`)
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'écriture")
      setPhase('review')
    }
  }

  function reset() {
    setPhase('closed')
    setText('')
    setParsed(null)
    setPlan(null)
    setError(null)
  }

  if (phase === 'closed') {
    return (
      <div className="sync game-import">
        <button className="small" disabled={!userId} onClick={() => setPhase('input')}>
          Importer depuis le jeu
        </button>
        {!userId && <span className="muted"> (connecte-toi pour importer)</span>}
      </div>
    )
  }

  const gained = plan?.animals.filter((c) => c.owned_count > c.entry.owned_count) ?? []
  const lost = plan?.animals.filter((c) => c.owned_count < c.entry.owned_count) ?? []
  const levelOnly = plan?.animals.filter((c) => c.owned_count === c.entry.owned_count) ?? []
  const guessed = plan?.animals.filter((c) => c.guessed) ?? []

  return (
    <div className="sync game-import">
      <h2>Importer depuis le jeu</h2>

      {phase === 'input' && (
        <>
          <p className="muted">
            Dans le jeu (navigateur) : F12 → onglet Network (Réseau) → filtre <code>jsonrpc</code> → recharge la
            page → requête dont le Payload contient <code>getAllParksOfUser</code> → onglet Response → clic droit
            « Copy response ». Colle-la ici ou charge-la en fichier. Rien n'est écrit avant validation.
          </p>
          <textarea
            className="game-import-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='{"result":{"parks":[…]}}'
            spellCheck={false}
          />
          <div className="game-import-actions">
            <button className="small" disabled={!text.trim()} onClick={() => analyze(text)}>
              Analyser
            </button>
            <label className="small-file">
              ou fichier <input type="file" accept=".json,.txt,application/json" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <button className="small link" onClick={reset}>
              Annuler
            </button>
          </div>
        </>
      )}

      {error && <p className="status error">{error}</p>}

      {plan && parsed && phase !== 'input' && (
        <>
          <p>
            {parsed.parks} parcs · <strong>{parsed.individuals}</strong> animaux · {plan.matchedSpecies} espèces
            reconnues
            {parsed.skippedRehab > 0 && <> · {parsed.skippedRehab} en soins (ignorés)</>}
          </p>
          <p>
            <strong>{plan.animals.length}</strong> animal(aux) et <strong>{plan.variants.length}</strong> pelage(s) à
            mettre à jour · <strong>{plan.unknown.length}</strong> identifiant(s) non reconnu(s)
          </p>

          {gained.length > 0 && (
            <details open>
              <summary>Acquis / passés à 2+ ({gained.length})</summary>
              <div className="sync-list">
                {gained.map((c) => (
                  <div key={c.entry.id} className="sync-upd">
                    <strong>{label(c.entry)}</strong>
                    <span className="diff">
                      possédés {count(c.entry.owned_count)} → {count(c.owned_count)}
                    </span>
                    <span className="diff">
                      niv. {lvl(c.entry.max_level)} → {lvl(c.max_level)}
                    </span>
                    {c.guessed && <span className="muted">(deviné)</span>}
                  </div>
                ))}
              </div>
            </details>
          )}

          {lost.length > 0 && (
            <details open>
              <summary>Plus (autant) possédés dans le jeu ({lost.length})</summary>
              <div className="sync-list">
                {lost.map((c) => (
                  <div key={c.entry.id} className="sync-upd">
                    <strong>{label(c.entry)}</strong>
                    <span className="diff">
                      possédés {count(c.entry.owned_count)} → {count(c.owned_count)}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {levelOnly.length > 0 && (
            <details>
              <summary>Niveau max seulement ({levelOnly.length})</summary>
              <div className="sync-list">
                {levelOnly.map((c) => (
                  <div key={c.entry.id} className="sync-upd">
                    <strong>{label(c.entry)}</strong>
                    <span className="diff">
                      niv. {lvl(c.entry.max_level)} → {lvl(c.max_level)}
                    </span>
                    {c.guessed && <span className="muted">(deviné)</span>}
                  </div>
                ))}
              </div>
            </details>
          )}

          {plan.variants.length > 0 && (
            <details>
              <summary>Pelages ({plan.variants.length})</summary>
              <div className="sync-list">
                {plan.variants.map((c) => (
                  <div key={c.variantId} className="sync-upd">
                    <strong>
                      {label(c.animal)} — {c.coat}
                    </strong>
                    <span className="diff">{c.owned ? 'possédé' : 'plus possédé'}</span>
                    <span className="diff">niv. → {lvl(c.max_level)}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {plan.unknown.length > 0 && (
            <details open>
              <summary>Non reconnus — ignorés ({plan.unknown.length})</summary>
              <p className="muted">
                Identifiants du jeu absents du catalogue (renseigner leur game_id côté admin pour les inclure).
              </p>
              <div className="sync-list">
                {plan.unknown.map((u) => (
                  <div key={u.gameId} className="muted">
                    <code>{u.gameId}</code> ({u.kind === 'coat' ? 'pelage' : 'espèce'}, ×{u.count})
                  </div>
                ))}
              </div>
            </details>
          )}

          {guessed.length > 0 && phase === 'review' && (
            <p className="status warning">
              {guessed.length} espèce(s) reconnue(s) par leur nom (« deviné ») : vérifie-les avant d'appliquer.
            </p>
          )}

          <div className="game-import-actions">
            {phase === 'review' && (
              <button disabled={!plan.animals.length && !plan.variants.length} onClick={apply}>
                Appliquer
              </button>
            )}
            {phase === 'applying' && <span className="muted">Écriture en cours…</span>}
            {phase === 'done' && <span className="status">{doneMsg}</span>}
            {phase !== 'applying' && (
              <button className="small link" onClick={reset}>
                {phase === 'done' ? 'Fermer' : 'Annuler'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
