// In-game limited-time events that change breeding/XP economics. Global and
// temporary, so persisted locally (not per-account). Used to re-compute the
// Analyse metrics and the breeding recommendations while an event is running.
export interface EventConfig {
  fodder10: boolean // fodder costs only 10% of the breeding cost
  births: 1 | 2 | 3 // guaranteed births per success (twins / triplets events)
  xp2: boolean // global XP ×2 event
}

export const NO_EVENT: EventConfig = { fodder10: false, births: 1, xp2: false }

export function xpMultiplier(e: EventConfig): number {
  return e.xp2 ? 2 : 1
}

// Fraction of the breeding cost that one fodder costs (1 = full price).
export function fodderCostFactor(e: EventConfig): number {
  return e.fodder10 ? 0.1 : 1
}

export function eventsActive(e: EventConfig): boolean {
  return e.fodder10 || e.births > 1 || e.xp2
}

const KEY = 'zoo2.events'

export function loadEvents(): EventConfig {
  try {
    const s = localStorage.getItem(KEY)
    if (s) return { ...NO_EVENT, ...(JSON.parse(s) as Partial<EventConfig>) }
  } catch {
    // ignore malformed storage
  }
  return NO_EVENT
}

export function saveEvents(e: EventConfig): void {
  localStorage.setItem(KEY, JSON.stringify(e))
}
