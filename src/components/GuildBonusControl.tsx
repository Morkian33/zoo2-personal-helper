import { useState } from 'react'
import { GUILD_BONUS_LEVELS, type EventConfig, type GuildBonusPct } from '../lib/events'

// Guild breeding bonus toggle: checkbox + level (2 / 4 / 6 %). Shared by the
// Événements tab and the head of the Élevage section (same global state).
export function GuildBonusControl({
  events,
  setEvents,
}: {
  events: EventConfig
  setEvents: (e: EventConfig) => void
}) {
  // Level to restore when the box is re-checked (defaults to the max).
  const [lastLevel, setLastLevel] = useState<GuildBonusPct>(
    events.guildBonus > 0 ? events.guildBonus : 6,
  )
  const on = events.guildBonus > 0
  return (
    <>
      <label className="admin-check">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => setEvents({ ...events, guildBonus: e.target.checked ? lastLevel : 0 })}
        />
        Bonus d'élevage de guilde
      </label>
      <select
        value={on ? events.guildBonus : lastLevel}
        disabled={!on}
        onChange={(e) => {
          const level = Number(e.target.value) as GuildBonusPct
          setLastLevel(level)
          if (on) setEvents({ ...events, guildBonus: level })
        }}
      >
        {GUILD_BONUS_LEVELS.map((l) => (
          <option key={l} value={l}>
            +{l} %
          </option>
        ))}
      </select>
    </>
  )
}
