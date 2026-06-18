import { eventsActive, type EventConfig } from '../lib/events'

// Global toggles for the in-game limited-time events that change the economics
// shown in Analyse and Élevage. Shown above the tabs; highlighted when active.
export function EventsBar({
  events,
  setEvents,
}: {
  events: EventConfig
  setEvents: (e: EventConfig) => void
}) {
  const active = eventsActive(events)
  return (
    <div className={`events-bar ${active ? 'active' : ''}`}>
      <span className="events-title">Événements{active ? ' ⚡' : ''}</span>
      <label className="admin-check">
        <input
          type="checkbox"
          checked={events.fodder10}
          onChange={(e) => setEvents({ ...events, fodder10: e.target.checked })}
        />
        Fourrage à 10 %
      </label>
      <label className="admin-check">
        Naissances
        <select
          value={events.births}
          onChange={(e) => setEvents({ ...events, births: Number(e.target.value) as 1 | 2 | 3 })}
        >
          <option value={1}>normales</option>
          <option value={2}>jumeaux (×2)</option>
          <option value={3}>triplés (×3)</option>
        </select>
      </label>
      <label className="admin-check">
        <input
          type="checkbox"
          checked={events.xp2}
          onChange={(e) => setEvents({ ...events, xp2: e.target.checked })}
        />
        XP ×2
      </label>
      {active && (
        <button className="link" onClick={() => setEvents({ fodder10: false, births: 1, xp2: false })}>
          Réinitialiser
        </button>
      )}
    </div>
  )
}
